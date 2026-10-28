# Model Routing Prompt Cache & Sticky Affinity Audit — 2026-10-28

**Workspace:** QuotaShift  
**Status:** Primary-source research complete; router session-affinity & concurrency-failover fixes implemented and verified with TDD.

---

## 1. Executive Summary

Yes — **QuotaShift Model Routing achieves the same server-side OpenAI KV prefix cache hits as native Codex CLI (`codex-rs`) using a ChatGPT subscription**, provided all turns of a conversation stay routed to the **same upstream ChatGPT account** and preserve an append-only prefix.

However, during this audit against OpenAI's official documentation and the live `openai/codex` (`codex-rs`) Rust codebase, we uncovered and fixed **two concrete routing bugs** in QuotaShift that previously degraded cache hit rates in multi-account pools:

1. **Modern Codex CLI & SDK Session-Header Mismatch (Fixed in `affinity.rs` + `forward.rs` + `messages_entry.rs`):**
   - Upstream `openai/codex` removed the legacy `conversation_id` HTTP header in commit `5dfa780f` (PR #9107) and dropped underscored `session_id` / `thread_id` headers in commit `7c7b4861` (PR #22193), standardizing on hyphenated **`session-id`** and **`thread-id`** HTTP headers plus top-level **`prompt_cache_key`** in the JSON body.
   - QuotaShift's `extract_request_session` previously inspected only `x-claude-code-session-id`, `conversation_id`, and `x-session-id`. Consequently, `session_key` evaluated to `None` on **100% of modern Codex CLI and OpenAI SDK requests**, bypassing the 15-minute `AffinityRegistry` pin and causing **`Balanced` pools with 2+ accounts to round-robin across different ChatGPT accounts on every turn** (destroying KV cache reuse because OpenAI caches are isolated per account/organization).
   - **Fix:** `extract_request_session_with_body` now extracts session affinity in priority order: `x-claude-code-session-id` → `session-id` → `session_id` → `thread-id` → `thread_id` → `conversation_id` → `x-session-id` → top-level JSON `"prompt_cache_key"`. Preferring `session-id` over `thread-id` also keeps Codex subagents pinned to the same ChatGPT account as their parent thread so subagent forks (`prompt_cache_key = "{source}:{parent_thread_id}"`) can reuse the parent's KV cache.
2. **Concurrency-Saturated Account Failover Loop (Fixed in `selection.rs` + `affinity.rs`):**
   - When an account hit its local `AccountBudgetRegistry` concurrency limit (`try_reserve` returning `Err`), `forward_request` recorded the account in `attempted` without marking a 60-second failure backoff, then called `select_account_for_route` — which ignored `attempted`, re-selected the same saturated account, and aborted the loop early instead of overflowing to the next healthy pool member.
   - **Fix:** `select_account_for_route_excluding` now filters out `attempted` accounts during per-request failover.

---

## 2. Primary-Source Mechanics: How OpenAI & `codex-rs` Cache Prompts

### 2.1 OpenAI Responses API Prompt Caching Rules

Per OpenAI's official [Prompt Caching Guide](https://developers.openai.com/api/docs/guides/prompt-caching) and [Sign in with ChatGPT (SIWC) Preview Limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations):

- **KV Prefix Matching:** OpenAI caches intermediate GPU key-value (KV) tensors for unchanged prefixes across OpenAI hidden system instructions, `tools`, `instructions` / `developer` messages, and `input` conversation history (text, images, files, tool calls, and tool outputs).
- **Minimum Cacheable Length & Lookup Boundaries:**
  - **GPT-5.6 and later:** 1,024 visible input tokens minimum; implicit mode places cache breakpoints at the end of eligible messages (`user` messages, last consecutive `function_call_output`, and last initial `developer` message) and checks up to 20 earlier eligible message endings on lookup. Default cache lifetime is **30 minutes** (refreshed on read).
  - **Earlier GPT-5 / Codex models (`gpt-5.4`, `gpt-5.2`, `gpt-5.1-codex*`, `gpt-5-codex`):** Implicit caching at 128-token / model-specific intervals; `prompt_cache_key` shards requests onto the same machine (~15 req/min per key before overflow routing).
- **Strict Account / Org Isolation:** Prompt caches are **never** shared across OpenAI organizations, ChatGPT accounts, or regional residency boundaries. Switching accounts mid-conversation always incurs one cold-cache prefill on the new account.
- **Stateless `store: false` Compatibility:** Prompt caching stores encrypted KV tensors in ephemeral GPU-local state, **not** stored response objects. Setting `"store": false` and `"stream": true` (mandatory for SIWC `POST https://api.openai.com/v1/responses`) **fully supports server-side KV prompt caching** when the client sends the append-only `input` array each turn.
- **Settings That Invalidate Prefix Reuse:** Mutating `model`, `tools` definitions/order, `parallel_tool_calls`, `text.format`, `text.verbosity`, top-level `reasoning.effort`, or rewriting earlier `input` items invalidates cached tokens after the first changed token.
- **SIWC Parameter Policy:** SIWC (`https://api.openai.com/v1/responses` with `chatgpt.tokens.use.direct`) **supports `prompt_cache_key`**, requires `store: false`, `stream: true`, and array `input` (using `instructions` or `developer` role rather than `system`), and rejects `previous_response_id` over HTTP and `prompt_cache_retention`.

### 2.2 How Official `openai/codex` CLI (`codex-rs`) Implements Caching

Verified directly from `openai/codex` (`main`):

- **Request Payload (`codex-rs/core/src/client.rs`, `codex-rs/codex-api/src/common.rs`):**
  - Always sets `store: false` and `stream: true` on `ResponsesApiRequest`.
  - Places `base_instructions` into a deterministic `developer` message at index `0` of `input` and serializes `tools` via `ResponsesApiTools(Arc<RawValue>)` so tool ordering never drifts across turns.
  - Populates `prompt_cache_key` (`PromptCacheKey::SessionDerived` by default) to `metadata.session_id` for root sessions, or `"{source}:{parent_thread_id}"` for internal subagents.
- **Session & Sticky-Routing Headers (`codex-rs/codex-api/src/requests/headers.rs`, `codex-rs/codex-api/src/endpoint/responses.rs`):**
  - `build_session_headers` attaches `session-id` and `thread-id` HTTP headers on every request (`conversation_id` was removed in `5dfa780f`; underscored `session_id`/`thread_id` were removed in `7c7b4861`).
- **Custom Provider Transport (`codex-rs/model-provider-info/src/lib.rs`, [SIWC Codex App-Server Guide](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server)):**
  - Custom `[model_providers.*]` entries default to `supports_websockets = false`, which is the exact transport mode OpenAI documents for SIWC (`codex app-server ... supports_websockets=false`). Codex CLI goes straight to HTTP SSE `POST /responses` without wasting a failed WebSocket upgrade attempt.

---

## 3. Side-by-Side Architecture Comparison

| Capability                     | Native Codex CLI (Direct ChatGPT Login)                                 | QuotaShift Model Routing + Codex CLI (SIWC Pool)                                                                                                             | QuotaShift Model Routing + Claude Code (`/v1/messages`)                                                                             |
| ------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Upstream Endpoint**          | `https://chatgpt.com/backend-api/codex/responses`                       | `https://api.openai.com/v1/responses` (official OpenAI SIWC endpoint)                                                                                        | `https://api.openai.com/v1/responses` (SIWC or API Key)                                                                             |
| **Wire Transport**             | Responses WebSocket (delta `previous_response_id`) or HTTP SSE fallback | HTTP SSE (`store: false`, `stream: true`, full append-only `input`)                                                                                          | Anthropic HTTP/SSE → translated to OpenAI Responses SSE                                                                             |
| **GPU KV Prefix Cache Hit?**   | **Yes**                                                                 | **Yes — 100% active** (OpenAI matches KV prefix on `tools` + `developer` + `input` + `prompt_cache_key`)                                                     | **Yes — 100% active** (`anthropic/request.rs` emits deterministic `instructions`, `tools`, `input`, and SHA-256 `prompt_cache_key`) |
| **Network Upload Overhead**    | Lower on WebSocket (sends only turn delta over open socket)             | Resends JSON conversation history over HTTPS per turn (prefill compute & quota still hit KV cache)                                                           | Resends JSON conversation history over HTTP/HTTPS per turn                                                                          |
| **Sticky Account Pinning**     | Single signed-in ChatGPT account                                        | **15-min sliding `AffinityRegistry` pin** (`session-id` / `thread-id` / `prompt_cache_key`) across all pool policies (`Cache-aware`, `Balanced`, `Priority`) | **15-min sliding `AffinityRegistry` pin** (`x-claude-code-session-id` / `metadata.user_id`)                                         |
| **Multi-Account 429 Failover** | None (halts on rate limit)                                              | Pre-commit failover switches to next healthy account; **1 cold-cache turn** on new account, then re-pins to new account for 15 min                           | Same pre-commit failover + re-pinning                                                                                               |
| **Cached Token Telemetry**     | CLI token counter (`cached_tokens`)                                     | Reads `usage.input_tokens_details.cached_tokens` from `response.completed`; records `total_cached_tokens` & `cache_hit_requests`                             | Maps `cached_tokens` → `cache_read_input_tokens` and subtracts from uncached `input_tokens`                                         |

---

## 4. Subtle Tradeoffs & Operational Guidance

1. **WebSocket Delta vs HTTP SSE (`store: false`):**
   - Native first-party ChatGPT login on `chatgpt.com/backend-api/codex` can keep a stateful WebSocket open so the client only uploads incremental items within that socket lifetime.
   - OpenAI's official third-party SIWC specification (`https://api.openai.com/v1/responses`) mandates stateless HTTP SSE (`store: false`, `stream: true`, `supports_websockets = false`). While full JSON `input` is uploaded over HTTPS on each turn, **server-side GPU KV prefix caching and cached-token discounts/accounting still apply identically**.
2. **Multi-Account Failover vs Cache Warmth:**
   - Because OpenAI isolates KV caches per ChatGPT account, **any failover from Account A to Account B necessarily starts cold on Account B for one turn**, after which Account B warms its own KV cache and QuotaShift pins subsequent turns of that session to Account B.
   - **Recommended Policy:**
     - Use **`Cache-aware`** (or **`Priority`**) when you want maximum cross-session prefix sharing on one primary account until its quota runs low.
     - Use **`Balanced`** when running parallel agent sessions across multiple ChatGPT accounts: new sessions distribute to the account with the healthiest remaining quota, while **in-progress sessions stay pinned to their assigned account** so every follow-up turn hits cache.
3. **`prompt_cache_retention` vs SIWC Policy:**
   - Per OpenAI's SIWC Preview Limitations, `prompt_cache_retention` is rejected on SIWC requests (`siwc_request.rs` enforces this contract). Default OpenAI server-side cache retention applies automatically without needing `prompt_cache_retention`.

---

## 5. References (Primary Sources)

1. OpenAI API Docs — _Prompt Caching_: <https://developers.openai.com/api/docs/guides/prompt-caching>
2. OpenAI SIWC Docs — _Models and Inference_: <https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference>
3. OpenAI SIWC Docs — _Codex App-Server_: <https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server>
4. OpenAI SIWC Docs — _Preview Limitations_: <https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations>
5. OpenAI Engineering — _Unrolling the Codex Agent Loop_: <https://openai.com/index/unrolling-the-codex-agent-loop/>
6. `openai/codex` (`codex-rs`) source & commits:
   - `codex-rs/core/src/client.rs` (`build_responses_request`, `prompt_cache_key`, `responses_session_id`)
   - `codex-rs/codex-api/src/common.rs` (`ResponsesApiRequest`)
   - `codex-rs/codex-api/src/endpoint/responses.rs` (`stream_request`, `build_session_headers`)
   - `codex-rs/codex-api/src/requests/headers.rs` (commits `5dfa780f` PR #9107 removing `conversation_id`, and `7c7b4861` PR #22193 standardizing on `session-id` / `thread-id`)

---

## 6. Verification Evidence

| Check | Result |
| --- | --- |
| `pnpm run format:check` | Passed (Prettier + `cargo fmt`) |
| `pnpm run lint:loc` | 662/662 files within LOC limits |
| `pnpm test` | 1,158 passed, 7 TODO, 0 failed (1,165 total) |
| `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/test-rust-windows.ps1` | 587 passed, 1 ignored, 0 failed, 0 warnings |
