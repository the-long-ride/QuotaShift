use super::launcher::slot_env_keys;

#[test]
fn slot_env_keys_match_claude_code_docs() {
    assert_eq!(slot_env_keys("sonnet"), ["ANTHROPIC_DEFAULT_SONNET_MODEL"]);
    assert_eq!(slot_env_keys("Opus"), ["ANTHROPIC_DEFAULT_OPUS_MODEL"]);
    assert_eq!(slot_env_keys("haiku"), ["ANTHROPIC_DEFAULT_HAIKU_MODEL"]);
    assert_eq!(slot_env_keys("fable"), ["ANTHROPIC_DEFAULT_FABLE_MODEL"]);
    assert_eq!(
        slot_env_keys("default"),
        ["ANTHROPIC_MODEL", "ANTHROPIC_DEFAULT_MODEL"]
    );
    assert!(slot_env_keys("custom").is_empty());
}
