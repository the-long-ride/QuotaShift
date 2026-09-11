use super::*;

#[test]
fn test_is_codex_cli_process() {
    assert!(is_codex_cli_process("codex.exe", "codex.exe run"));
    assert!(is_codex_cli_process("codex", "/usr/local/bin/codex resume"));
    assert!(is_codex_cli_process("node.exe", "node C:\\npm\\node_modules\\@openai\\codex\\bin\\codex.js"));
    assert!(is_codex_cli_process("cmd.exe", "\"C:\\Program Files\\Codex\\codex.exe\" --help"));
    assert!(!is_codex_cli_process("decodex.exe", "decodex.exe"));
    assert!(!is_codex_cli_process("chrome.exe", "chrome.exe https://codex.com"));
}

#[test]
fn test_is_chatgpt_desktop_process() {
    assert!(is_chatgpt_desktop_process("ChatGPT.exe", "C:\\Program Files\\ChatGPT\\ChatGPT.exe"));
    assert!(is_chatgpt_desktop_process("chatgpt.exe", "chatgpt.exe"));
    assert!(is_chatgpt_desktop_process("ChatGPT", "/Applications/ChatGPT.app/Contents/MacOS/ChatGPT"));
    assert!(!is_chatgpt_desktop_process("chrome.exe", "chrome.exe https://chatgpt.com"));
    assert!(!is_chatgpt_desktop_process("quotashift.exe", "quotashift.exe"));
}

#[test]
fn test_is_codex_ide_extension_process() {
    assert!(is_codex_ide_extension_process("codex-language-server.exe", "codex-language-server.exe --stdio"));
    assert!(is_codex_ide_extension_process("codex-agent", "/path/to/codex-agent"));
    assert!(is_codex_ide_extension_process("codex-ls.exe", "codex-ls.exe"));
    assert!(is_codex_ide_extension_process("chatgpt-codex.exe", "chatgpt-codex.exe"));
    assert!(is_codex_ide_extension_process("node.exe", "node C:\\Users\\user\\.vscode\\extensions\\openai.chatgpt-0.1.0\\dist\\server.js"));
    assert!(is_codex_ide_extension_process("node", "/home/user/.vscode/extensions/codex-team.codex/out/extension.js"));
    assert!(!is_codex_ide_extension_process("code.exe", "code.exe C:\\my-project"));
    assert!(!is_codex_ide_extension_process("language_server.exe", "language_server.exe"));
}

#[test]
fn test_is_target_codex_process_safeguards() {
    let current_pid = 12345;
    assert!(!is_target_codex_process(12345, current_pid, "codex.exe", "codex.exe"));
    assert!(!is_target_codex_process(0, current_pid, "codex.exe", "codex.exe"));
    assert!(!is_target_codex_process(9999, current_pid, "quotashift.exe", "quotashift.exe"));
    assert!(!is_target_codex_process(9999, current_pid, "QuotaShift", "QuotaShift --tray"));
    assert!(!is_target_codex_process(9999, current_pid, "node.exe", "node quotashift-service"));

    assert!(is_target_codex_process(2222, current_pid, "codex.exe", "codex.exe"));
    assert!(is_target_codex_process(3333, current_pid, "ChatGPT.exe", "ChatGPT.exe"));
    assert!(is_target_codex_process(4444, current_pid, "codex-language-server.exe", "codex-language-server.exe"));
}
