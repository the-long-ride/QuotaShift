use super::{python_command, run_python_json_command};
use serde_json::json;

#[test]
fn python_writer_payload_stays_out_of_process_arguments() {
    let secret = "access token 'quoted' \u{1f512}";
    let payload = json!({
        "db_paths": ["C:/synthetic/profile/state.vscdb"],
        "token": secret,
        "refresh_token": "refresh\"quoted",
        "email": "unicode-用户@example.test",
    });
    let script = r#"import json, sys; print(json.dumps({"args": sys.argv[1:], "input": json.loads(sys.stdin.buffer.read().decode('utf-8'))}))"#;
    let output = run_python_json_command(python_command(), script, &payload)
        .expect("python helper should run");
    assert!(output.status.success());
    let captured: serde_json::Value =
        serde_json::from_slice(&output.stdout).expect("fake helper output should be JSON");
    let args = captured["args"]
        .as_array()
        .expect("args should be an array");
    assert!(args.iter().all(|arg| arg
        .as_str()
        .map(|value| !value.contains(secret))
        .unwrap_or(true)));
    assert_eq!(captured["input"]["token"], secret);
    assert_eq!(captured["input"]["refresh_token"], "refresh\"quoted");
}

#[test]
fn python_command_uses_platform_native_entry_point() {
    let command = python_command();
    #[cfg(target_os = "windows")]
    assert_eq!(command.get_program(), "python");
    #[cfg(not(target_os = "windows"))]
    assert_eq!(command.get_program(), "python3");
}
