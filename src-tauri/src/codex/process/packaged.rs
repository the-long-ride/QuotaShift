//! Reopening the ChatGPT/Codex desktop app. Microsoft Store builds live under `WindowsApps` and
//! cannot be started by spawning their executable, so they are activated through their
//! AppUserModelID (`<PackageFamilyName>!<ApplicationId>`) instead.
#![cfg_attr(not(target_os = "windows"), allow(dead_code))]

fn path_parts(path: &str) -> Vec<&str> {
    path.split(['\\', '/']).filter(|s| !s.is_empty()).collect()
}

fn attribute<'a>(tag: &'a str, name: &str) -> Option<&'a str> {
    let needle = format!(" {name}=\"");
    let start = tag.find(&needle)? + needle.len();
    let len = tag[start..].find('"')?;
    Some(&tag[start..start + len])
}

/// Application id in `AppxManifest.xml` whose executable is `relative_exe` (falls back to `App`).
fn manifest_application_id(manifest: &str, relative_exe: &str) -> String {
    let wanted = relative_exe.replace('\\', "/").to_ascii_lowercase();
    manifest
        .split("<Application ")
        .skip(1)
        .filter_map(|chunk| {
            let tag = format!(" {}", chunk.split('>').next()?);
            let exe = attribute(&tag, "Executable")?.replace('\\', "/");
            (exe.to_ascii_lowercase() == wanted)
                .then(|| attribute(&tag, "Id").map(str::to_string))
                .flatten()
        })
        .next()
        .unwrap_or_else(|| "App".to_string())
}

/// AppUserModelID for an executable inside `...\WindowsApps\<Name>_<ver>_<arch>__<publisher>\...`.
/// `read_manifest` receives the package root and returns its manifest text when readable.
pub fn packaged_app_user_model_id(
    exe: &str,
    read_manifest: impl Fn(&str) -> Option<String>,
) -> Option<String> {
    let parts = path_parts(exe);
    let index = parts
        .iter()
        .position(|p| p.eq_ignore_ascii_case("WindowsApps"))?;
    let package = *parts.get(index + 1)?;
    let fields: Vec<&str> = package.split('_').collect();
    if fields.len() < 5 || fields[0].is_empty() || fields[fields.len() - 1].is_empty() {
        return None;
    }
    let family = format!("{}_{}", fields[0], fields[fields.len() - 1]);
    let root = parts[..=index + 1].join("\\");
    let relative = parts[index + 2..].join("/");
    let app_id = read_manifest(&root)
        .map(|manifest| manifest_application_id(&manifest, &relative))
        .unwrap_or_else(|| "App".to_string());
    Some(format!("{family}!{app_id}"))
}

/// Starts a packaged app by its AppUserModelID. Returns false when it could not be started.
#[cfg(target_os = "windows")]
pub fn activate(app_user_model_id: &str) -> Result<bool, String> {
    crate::run_cmd(std::process::Command::new("explorer.exe"))
        .arg(format!("shell:AppsFolder\\{app_user_model_id}"))
        .spawn()
        .map_err(|e| format!("Failed to reopen the desktop app: {e}"))?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    const EXE: &str = "C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.930.4958.0_x64__2p2nqsd0c76g0\\app\\ChatGPT.exe";
    const MANIFEST: &str = "<Package><Applications>\
<Application Id=\"App\" Executable=\"app/ChatGPT.exe\" EntryPoint=\"Windows.FullTrustApplication\">\
</Application>\
<Application Id=\"Runner\" Executable=\"app/resources/codex-command-runner.exe\" EntryPoint=\"Windows.FullTrustApplication\">\
</Application></Applications></Package>";

    #[test]
    fn store_install_resolves_family_and_application_id() {
        let id = packaged_app_user_model_id(EXE, |_| Some(MANIFEST.to_string()));
        assert_eq!(id.as_deref(), Some("OpenAI.Codex_2p2nqsd0c76g0!App"));
    }

    #[test]
    fn manifest_picks_the_application_for_the_executable() {
        let runner = "C:\\Program Files\\WindowsApps\\OpenAI.Codex_1.0.0.0_x64__pub\\app\\resources\\codex-command-runner.exe";
        let id = packaged_app_user_model_id(runner, |_| Some(MANIFEST.to_string()));
        assert_eq!(id.as_deref(), Some("OpenAI.Codex_pub!Runner"));
    }

    #[test]
    fn unreadable_manifest_falls_back_to_app() {
        let id = packaged_app_user_model_id(EXE, |_| None);
        assert_eq!(id.as_deref(), Some("OpenAI.Codex_2p2nqsd0c76g0!App"));
    }

    #[test]
    fn regular_installs_are_not_packaged() {
        assert_eq!(
            packaged_app_user_model_id("C:\\Apps\\ChatGPT\\ChatGPT.exe", |_| None),
            None
        );
        assert_eq!(
            packaged_app_user_model_id("C:\\Program Files\\WindowsApps\\odd\\a.exe", |_| None),
            None
        );
        assert_eq!(
            packaged_app_user_model_id("C:\\Program Files\\WindowsApps", |_| None),
            None
        );
    }
}
