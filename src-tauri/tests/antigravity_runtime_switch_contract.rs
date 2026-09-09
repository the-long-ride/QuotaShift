use std::path::PathBuf;

fn repo_file(path: &str) -> String {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let full_path = manifest.join(path);
    std::fs::read_to_string(&full_path)
        .unwrap_or_else(|error| panic!("failed to read {}: {}", full_path.display(), error))
        .replace("\r\n", "\n")
}

fn source_slice<'a>(source: &'a str, start: &str, end: &str) -> &'a str {
    let start_index = source
        .find(start)
        .unwrap_or_else(|| panic!("missing source marker: {start}"));
    let tail = &source[start_index..];
    let end_index = tail
        .find(end)
        .unwrap_or_else(|| panic!("missing source marker: {end}"));
    &tail[..end_index]
}

#[test]
fn backend_detects_ide_and_cli_before_switching_antigravity_credentials() {
    let session = repo_file("src/session.rs");
    let lib = repo_file("src/lib.rs");

    assert!(
        session.contains("AntigravityRuntimeState"),
        "session backend must expose structured IDE/CLI runtime detection"
    );
    assert!(
        session.contains("AntigravitySwitchResult"),
        "session backend must return structured account-switch results"
    );
    assert!(
        session.contains("detect_antigravity_runtime"),
        "Apply must detect the current Antigravity runtime before replacing credentials"
    );
    assert!(
        session.contains("switch_antigravity_account"),
        "session backend must own the environment-aware switch operation"
    );
    assert!(
        session.contains("agy") && session.contains("antigravity-cli"),
        "runtime detection must recognize Antigravity CLI invocations as well as the IDE"
    );
    assert!(
        lib.contains("switch_antigravity_account"),
        "Tauri must expose the environment-aware Antigravity switch command"
    );
}

#[test]
fn switch_preserves_the_running_ide_executable_and_stops_a_running_cli() {
    let session = repo_file("src/session.rs");
    let switch = source_slice(
        &session,
        "pub async fn switch_antigravity_account",
        "pub async fn read_codex_auth",
    );

    assert!(
        switch.contains("runtime.ide_executable"),
        "switching must reuse the exact executable path captured from the running IDE"
    );
    assert!(
        switch.contains("stop_antigravity_cli"),
        "a running CLI must be terminated so it cannot retain stale credentials"
    );
    assert!(
        switch.contains("write_antigravity_session"),
        "target credentials must be written by the switch operation"
    );
    assert!(
        switch.contains("open_antigravity_ide_at"),
        "a previously running IDE must be reopened from its captured executable path"
    );
    assert!(
        switch.contains("CLI switched") && switch.contains("run agy again"),
        "the result must tell the user that a stopped CLI needs to be started again"
    );
}

#[test]
fn frontend_apply_delegates_runtime_switching_to_the_backend() {
    let app = repo_file("../src/App.tsx");
    let apply = source_slice(
        &app,
        "const handleApplyAntigravityAccount = async",
        "const handleDeleteAntigravityAccount = async",
    );

    assert!(
        apply.contains("switch_antigravity_account"),
        "Apply must use the runtime-aware backend command"
    );
    assert!(
        !apply.contains("quit_antigravity_ide"),
        "frontend must no longer blindly quit the IDE"
    );
    assert!(
        !apply.contains("open_antigravity_ide"),
        "frontend must no longer blindly reopen a generic IDE installation"
    );
    assert!(
        !apply.contains("write_antigravity_session"),
        "credential replacement must happen atomically inside the backend switch"
    );
}

#[test]
fn windows_cli_detection_and_stop_never_match_the_powershell_running_the_probe() {
    let session = repo_file("src/session.rs");
    let detection = source_slice(
        &session,
        "pub fn detect_antigravity_runtime",
        "#[cfg(target_os = \"windows\")]\nasync fn stop_antigravity_cli",
    );
    let stop = source_slice(
        &session,
        "#[cfg(target_os = \"windows\")]\nasync fn stop_antigravity_cli",
        "#[cfg(any(target_os = \"macos\", target_os = \"linux\"))]\nasync fn stop_antigravity_cli",
    );

    assert!(
        detection.contains("$_.ProcessId -ne $PID"),
        "Windows runtime detection must exclude the PowerShell process executing the probe, whose own command line contains the CLI match terms"
    );
    assert!(
        stop.contains("$_.ProcessId -ne $PID"),
        "Windows CLI termination must exclude the PowerShell process executing the stop command so it cannot kill itself"
    );
}
