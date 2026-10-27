use serde_json::json;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AnthropicSseEvent {
    MessageStart {
        message_id: String,
        model: String,
        input_tokens: u64,
    },
    ContentBlockStart {
        index: usize,
        block_type: String,
        id: Option<String>,
        name: Option<String>,
    },
    ContentBlockDeltaText {
        index: usize,
        text: String,
    },
    ContentBlockDeltaJson {
        index: usize,
        partial_json: String,
    },
    ContentBlockStop {
        index: usize,
    },
    MessageDelta {
        stop_reason: String,
        output_tokens: Option<u64>,
        input_tokens: Option<u64>,
        cache_read_input_tokens: Option<u64>,
    },
    MessageStop,
    Error {
        message: String,
    },
}

impl AnthropicSseEvent {
    pub fn to_sse_wire(&self) -> String {
        match self {
            Self::MessageStart {
                message_id,
                model,
                input_tokens,
            } => {
                let data = json!({
                    "type": "message_start",
                    "message": {
                        "id": message_id,
                        "type": "message",
                        "role": "assistant",
                        "model": model,
                        "content": [],
                        "stop_reason": null,
                        "stop_sequence": null,
                        "usage": { "input_tokens": input_tokens, "output_tokens": 0 }
                    }
                });
                format!("event: message_start\ndata: {}\n\n", data)
            }
            Self::ContentBlockStart {
                index,
                block_type,
                id,
                name,
            } => {
                let content_block = if block_type == "tool_use" {
                    json!({
                        "type": "tool_use",
                        "id": id.as_deref().unwrap_or(""),
                        "name": name.as_deref().unwrap_or(""),
                        "input": {}
                    })
                } else {
                    json!({
                        "type": "text",
                        "text": ""
                    })
                };
                let data = json!({
                    "type": "content_block_start",
                    "index": index,
                    "content_block": content_block
                });
                format!("event: content_block_start\ndata: {}\n\n", data)
            }
            Self::ContentBlockDeltaText { index, text } => {
                let data = json!({
                    "type": "content_block_delta",
                    "index": index,
                    "delta": {
                        "type": "text_delta",
                        "text": text
                    }
                });
                format!("event: content_block_delta\ndata: {}\n\n", data)
            }
            Self::ContentBlockDeltaJson {
                index,
                partial_json,
            } => {
                let data = json!({
                    "type": "content_block_delta",
                    "index": index,
                    "delta": {
                        "type": "input_json_delta",
                        "partial_json": partial_json
                    }
                });
                format!("event: content_block_delta\ndata: {}\n\n", data)
            }
            Self::ContentBlockStop { index } => {
                let data = json!({
                    "type": "content_block_stop",
                    "index": index
                });
                format!("event: content_block_stop\ndata: {}\n\n", data)
            }
            Self::MessageDelta {
                stop_reason,
                output_tokens,
                input_tokens,
                cache_read_input_tokens,
            } => {
                let mut usage = json!({});
                if let Some(tokens) = output_tokens {
                    usage["output_tokens"] = json!(tokens);
                }
                if let Some(tokens) = input_tokens {
                    usage["input_tokens"] = json!(tokens);
                }
                if let Some(tokens) = cache_read_input_tokens {
                    usage["cache_read_input_tokens"] = json!(tokens);
                }
                let data = json!({
                    "type": "message_delta",
                    "delta": {
                        "stop_reason": stop_reason,
                        "stop_sequence": null
                    },
                    "usage": usage
                });
                format!("event: message_delta\ndata: {}\n\n", data)
            }
            Self::MessageStop => {
                "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n".to_string()
            }
            Self::Error { message } => {
                let data = json!({
                    "type": "error",
                    "error": {
                        "type": "api_error",
                        "message": message
                    }
                });
                format!("event: error\ndata: {}\n\n", data)
            }
        }
    }
}

pub struct SseTranslatorState {
    pub message_id: String,
    pub model: String,
    pub next_block_index: usize,
    pub current_block_index: Option<usize>,
    pub message_started: bool,
    pub completed: bool,
    pub failed: bool,
}

impl SseTranslatorState {
    pub fn new(message_id: &str, model: &str) -> Self {
        Self {
            message_id: message_id.to_string(),
            model: model.to_string(),
            next_block_index: 0,
            current_block_index: None,
            message_started: false,
            completed: false,
            failed: false,
        }
    }

    pub fn start_message(&mut self) -> Option<AnthropicSseEvent> {
        if !self.message_started {
            self.message_started = true;
            Some(AnthropicSseEvent::MessageStart {
                message_id: self.message_id.clone(),
                model: self.model.clone(),
                input_tokens: 0,
            })
        } else {
            None
        }
    }

    pub fn start_content_block(
        &mut self,
        block_type: &str,
        id: Option<&str>,
        name: Option<&str>,
    ) -> AnthropicSseEvent {
        let index = self.next_block_index;
        self.next_block_index += 1;
        self.current_block_index = Some(index);
        AnthropicSseEvent::ContentBlockStart {
            index,
            block_type: block_type.to_string(),
            id: id.map(str::to_string),
            name: name.map(str::to_string),
        }
    }

    pub fn finish_content_block(&mut self) -> Option<AnthropicSseEvent> {
        if let Some(index) = self.current_block_index.take() {
            Some(AnthropicSseEvent::ContentBlockStop { index })
        } else {
            None
        }
    }

    pub fn handle_terminal_completed(
        &mut self,
        stop_reason: &str,
        output_tokens: Option<u64>,
    ) -> Vec<AnthropicSseEvent> {
        self.completed = true;
        let mut events = Vec::new();
        if let Some(stop) = self.finish_content_block() {
            events.push(stop);
        }
        events.push(AnthropicSseEvent::MessageDelta {
            stop_reason: stop_reason.to_string(),
            output_tokens,
            input_tokens: None,
            cache_read_input_tokens: None,
        });
        events.push(AnthropicSseEvent::MessageStop);
        events
    }

    pub fn handle_terminal_failed(&mut self, error_msg: &str) -> Vec<AnthropicSseEvent> {
        self.failed = true;
        vec![AnthropicSseEvent::Error {
            message: error_msg.to_string(),
        }]
    }
}
