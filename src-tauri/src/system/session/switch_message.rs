//! User-facing message for an Antigravity account switch.

pub struct SwitchOutcome<'a> {
    pub restart: bool,
    pub ide_detected: bool,
    pub cli_detected: bool,
    pub ide_restarted: bool,
    pub cli_stopped: bool,
    pub cli_stop_error: Option<&'a str>,
    pub ide_restart_error: Option<&'a str>,
}

pub fn compose_switch_message(o: &SwitchOutcome) -> String {
    if !o.restart {
        return if o.ide_detected || o.cli_detected {
            "Credentials switched. Restart Antigravity IDE / agy to use this account.".to_string()
        } else {
            "Credentials switched. The next Antigravity IDE or agy session will use this account."
                .to_string()
        };
    }

    let mut message = match (
        o.ide_detected,
        o.cli_detected,
        o.ide_restarted,
        o.cli_stopped,
    ) {
        (true, true, true, true) => {
            "IDE switched and restarted. CLI switched — run agy again.".to_string()
        }
        (false, true, _, true) => "CLI switched — run agy again.".to_string(),
        (true, false, true, _) => "IDE switched and restarted.".to_string(),
        (false, false, _, _) => {
            "Credentials switched. The next Antigravity IDE or agy session will use this account."
                .to_string()
        }
        _ => "Antigravity credentials switched.".to_string(),
    };
    if let Some(error) = o.cli_stop_error {
        message.push_str(&format!(
            " The running CLI could not be stopped: {error}. Restart agy manually."
        ));
    } else if o.cli_detected && !o.cli_stopped {
        message.push_str(" The CLI was detected but had already exited; run agy again to use the switched account.");
    }
    if let Some(error) = o.ide_restart_error {
        message.push_str(&format!(
            " IDE credentials were switched, but restart failed: {error}"
        ));
    }
    message
}

#[cfg(test)]
mod tests {
    use super::*;

    fn outcome(restart: bool, ide: bool, cli: bool) -> SwitchOutcome<'static> {
        SwitchOutcome {
            restart,
            ide_detected: ide,
            cli_detected: cli,
            ide_restarted: restart && ide,
            cli_stopped: restart && cli,
            cli_stop_error: None,
            ide_restart_error: None,
        }
    }

    #[test]
    fn no_restart_with_running_apps_asks_user_to_restart() {
        let msg = compose_switch_message(&outcome(false, true, true));
        assert!(msg.contains("Restart Antigravity IDE / agy"));
    }

    #[test]
    fn no_restart_without_running_apps_mentions_next_session() {
        let msg = compose_switch_message(&outcome(false, false, false));
        assert!(msg.contains("next Antigravity IDE"));
    }

    #[test]
    fn restart_ide_and_cli() {
        let msg = compose_switch_message(&outcome(true, true, true));
        assert_eq!(
            msg,
            "IDE switched and restarted. CLI switched — run agy again."
        );
    }

    #[test]
    fn restart_cli_only() {
        assert_eq!(
            compose_switch_message(&outcome(true, false, true)),
            "CLI switched — run agy again."
        );
    }

    #[test]
    fn restart_ide_only() {
        assert_eq!(
            compose_switch_message(&outcome(true, true, false)),
            "IDE switched and restarted."
        );
    }

    #[test]
    fn restart_errors_are_appended() {
        let o = SwitchOutcome {
            restart: true,
            ide_detected: true,
            cli_detected: true,
            ide_restarted: false,
            cli_stopped: false,
            cli_stop_error: Some("denied"),
            ide_restart_error: Some("missing"),
        };
        let msg = compose_switch_message(&o);
        assert!(msg.starts_with("Antigravity credentials switched."));
        assert!(msg.contains("could not be stopped: denied"));
        assert!(msg.contains("restart failed: missing"));
    }

    #[test]
    fn restart_cli_already_exited() {
        let o = SwitchOutcome {
            cli_stopped: false,
            ..outcome(true, false, true)
        };
        assert!(compose_switch_message(&o).contains("had already exited"));
    }
}
