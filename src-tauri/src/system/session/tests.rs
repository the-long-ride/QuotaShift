use super::run_python_json_command;
use serde_json::json;
use std::process::Command;

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
    let output = run_python_json_command(Command::new("python"), script, &payload)
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
