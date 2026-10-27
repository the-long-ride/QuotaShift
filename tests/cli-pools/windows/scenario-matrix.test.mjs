import test from "node:test";

// Native acceptance gates from implementplan.md. Pure behavior is covered by Rust
// cli_pools tests; these scenarios require disposable Windows sessions and real CLIs.
for (const scenario of [
  "agy exact conversation and account verified after handoff",
  "agy latest fallback with one eligible instance",
  "multiple CLI instances block handoff without stopping anything",
  "Codex exact conversation and account verified after handoff",
  "Codex latest fallback with one eligible instance",
  "active model router blocks shared-auth handoff",
  "live quota samples trigger one durable handoff with recovery",
]) {
  test.todo(`Windows integration: ${scenario}`);
}
