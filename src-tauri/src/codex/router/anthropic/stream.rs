//! Re-encodes an OpenAI Responses SSE stream as Anthropic Messages SSE events.
//! Only `message_stop` after `response.completed` (or max_output_tokens incomplete).
use std::collections::{BTreeMap, HashSet};

use serde_json::Value;

pub use super::aggregate::aggregate_message;
use super::events::AnthropicSseEvent;
use crate::codex::router::siwc_stream::find_boundary;

const MAX_PARTIAL_EVENT: usize = 512 * 1024;

pub struct MessagesStreamTranslator {
    message_id: String,
    model: String,
    pending: Vec<u8>,
    started: bool,
    next_block: usize,
    /// Open blocks: upstream output_index -> Anthropic block index.
    open: BTreeMap<u64, usize>,
    args_sent: HashSet<u64>,
    saw_tool: bool,
    saw_content: bool,
    terminal: bool,
}

pub(crate) fn parse_frame(raw: &str) -> Option<(String, Value)> {
    let mut name = None;
    let mut data = String::new();
    for line in raw.lines() {
        if let Some(v) = line.strip_prefix("event:") {
            name = Some(v.trim().to_string());
        } else if let Some(v) = line.strip_prefix("data:") {
            if !data.is_empty() {
                data.push('\n');
            }
            data.push_str(v.strip_prefix(' ').unwrap_or(v));
        }
    }
    if data.trim().is_empty() || data.trim() == "[DONE]" {
        return None;
    }
    let value: Value = serde_json::from_str(&data).ok()?;
    let ty = value
        .get("type")
        .and_then(Value::as_str)
        .map(str::to_string)
        .or(name)?;
    Some((ty, value))
}

fn error_message(v: &Value) -> String {
    [
        v.pointer("/response/error/message"),
        v.pointer("/error/message"),
        v.get("message"),
    ]
    .into_iter()
    .flatten()
    .find_map(Value::as_str)
    .unwrap_or("Upstream response failed")
    .to_string()
}

impl MessagesStreamTranslator {
    pub fn new(message_id: String, model_alias: String) -> Self {
        Self {
            message_id,
            model: model_alias,
            pending: Vec::new(),
            started: false,
            next_block: 0,
            open: BTreeMap::new(),
            args_sent: HashSet::new(),
            saw_tool: false,
            saw_content: false,
            terminal: false,
        }
    }

    /// True once the model produced text, a tool call, or tool arguments.
    /// A bare `message` output item does not count.
    pub fn saw_content(&self) -> bool {
        self.saw_content
    }

    pub fn push(&mut self, upstream_chunk: &[u8]) -> Vec<AnthropicSseEvent> {
        let mut out = Vec::new();
        if self.terminal {
            return out;
        }
        self.pending.extend_from_slice(upstream_chunk);
        while let Some((boundary, delimiter)) = find_boundary(&self.pending) {
            let raw = String::from_utf8_lossy(&self.pending[..boundary]).to_string();
            self.pending.drain(..boundary + delimiter);
            if let Some((ty, value)) = parse_frame(&raw) {
                self.handle(&ty, &value, &mut out);
            }
            if self.terminal {
                self.pending.clear();
                return out;
            }
        }
        if self.pending.len() > MAX_PARTIAL_EVENT {
            self.pending.clear();
            self.terminal = true;
            out.push(AnthropicSseEvent::Error {
                message: "Upstream event exceeded size limit".into(),
            });
        }
        out
    }

    pub fn finish(&mut self) -> Vec<AnthropicSseEvent> {
        if self.terminal {
            return Vec::new();
        }
        self.terminal = true;
        vec![AnthropicSseEvent::Error {
            message: "Upstream stream ended before a terminal event".into(),
        }]
    }

    fn handle(&mut self, ty: &str, v: &Value, out: &mut Vec<AnthropicSseEvent>) {
        if !self.started {
            self.started = true;
            out.push(AnthropicSseEvent::MessageStart {
                message_id: self.message_id.clone(),
                model: self.model.clone(),
                input_tokens: 0,
            });
        }
        let idx = v.get("output_index").and_then(Value::as_u64).unwrap_or(0);
        match ty {
            "response.output_item.added" => {
                let item = &v["item"];
                if item["type"] == "function_call" {
                    let id = item["call_id"].as_str().or(item["id"].as_str());
                    self.saw_tool = true;
                    self.saw_content = true;
                    self.open_block(idx, "tool_use", id, item["name"].as_str(), out);
                }
            }
            // A refusal is the model's answer: show it as text instead of an empty message.
            "response.output_text.delta" | "response.refusal.delta" => {
                self.text_delta(idx, v["delta"].as_str().unwrap_or_default(), out);
            }
            "response.refusal.done" => {
                // Deltas already opened the block; only a refusal sent whole needs emitting.
                if !self.open.contains_key(&idx) {
                    self.text_delta(idx, v["refusal"].as_str().unwrap_or_default(), out);
                }
            }
            "response.function_call_arguments.delta" => {
                self.saw_content = true;
                self.args_delta(idx, v["delta"].as_str().unwrap_or_default(), out);
            }
            "response.output_item.done" => {
                let item = &v["item"];
                if item["type"] == "function_call" && !self.args_sent.contains(&idx) {
                    self.args_delta(idx, item["arguments"].as_str().unwrap_or_default(), out);
                }
                if let Some(index) = self.open.remove(&idx) {
                    out.push(AnthropicSseEvent::ContentBlockStop { index });
                }
            }
            "response.completed" => {
                let reason = if self.saw_tool {
                    "tool_use"
                } else {
                    "end_turn"
                };
                self.finish_ok(reason, v, out);
            }
            "response.incomplete" => {
                let reason = v
                    .pointer("/response/incomplete_details/reason")
                    .and_then(Value::as_str)
                    .unwrap_or("unknown");
                if reason == "max_output_tokens" {
                    self.finish_ok("max_tokens", v, out);
                } else {
                    self.terminal = true;
                    out.push(AnthropicSseEvent::Error {
                        message: format!("Upstream response incomplete: {reason}"),
                    });
                }
            }
            "response.failed" | "error" => {
                self.terminal = true;
                out.push(AnthropicSseEvent::Error {
                    message: error_message(v),
                });
            }
            _ => {}
        }
    }

    fn text_delta(&mut self, idx: u64, text: &str, out: &mut Vec<AnthropicSseEvent>) {
        if text.is_empty() {
            return;
        }
        self.saw_content = true;
        if !self.open.contains_key(&idx) {
            self.open_block(idx, "text", None, None, out);
        }
        out.push(AnthropicSseEvent::ContentBlockDeltaText {
            index: self.open[&idx],
            text: text.to_string(),
        });
    }

    fn open_block(
        &mut self,
        idx: u64,
        kind: &str,
        id: Option<&str>,
        name: Option<&str>,
        out: &mut Vec<AnthropicSseEvent>,
    ) {
        let index = self.next_block;
        self.next_block += 1;
        self.open.insert(idx, index);
        out.push(AnthropicSseEvent::ContentBlockStart {
            index,
            block_type: kind.to_string(),
            id: id.map(str::to_string),
            name: name.map(str::to_string),
        });
    }

    fn args_delta(&mut self, idx: u64, delta: &str, out: &mut Vec<AnthropicSseEvent>) {
        if delta.is_empty() {
            return;
        }
        if let Some(&index) = self.open.get(&idx) {
            self.args_sent.insert(idx);
            out.push(AnthropicSseEvent::ContentBlockDeltaJson {
                index,
                partial_json: delta.to_string(),
            });
        }
    }

    fn finish_ok(&mut self, stop_reason: &str, v: &Value, out: &mut Vec<AnthropicSseEvent>) {
        self.terminal = true;
        let mut leftover: Vec<usize> = std::mem::take(&mut self.open).into_values().collect();
        leftover.sort_unstable();
        out.extend(
            leftover
                .into_iter()
                .map(|index| AnthropicSseEvent::ContentBlockStop { index }),
        );
        let usage = crate::codex::router::usage_metrics::normalize_usage_event(v);
        let cache_read = usage.cached_tokens.filter(|&c| c > 0);
        let input_tokens = usage
            .input_tokens
            .map(|total| total.saturating_sub(cache_read.unwrap_or(0)));
        out.push(AnthropicSseEvent::MessageDelta {
            stop_reason: stop_reason.to_string(),
            output_tokens: usage.output_tokens,
            input_tokens,
            cache_read_input_tokens: cache_read,
        });
        out.push(AnthropicSseEvent::MessageStop);
    }
}
