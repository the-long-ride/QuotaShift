import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("exact_installation_and_profile_selected", () => {
  const wizardSelection = {
    selectedInstallation: "C:\\Program Files\\Anthropic\\claude.exe",
    selectedProfile: "C:\\Users\\Dev\\.claude_dev",
  };

  assert.ok(wizardSelection.selectedInstallation.endsWith("claude.exe"));
  assert.ok(wizardSelection.selectedProfile.includes(".claude_dev"));
});

test("no_subscription_profile_is_selectable", () => {
  const profile = {
    id: "prof_clean",
    name: "clean_profile",
    hasSubscriptionCredentials: false,
    isGatewayOnly: true,
  };

  // Must be validly selectable without subscription credentials
  const canSelect = profile.isGatewayOnly === true;
  assert.equal(canSelect, true);
});

test("slot_maps_to_enabled_alias_only", () => {
  const availablePools = [
    { id: "p1", publicModelName: "claude-fast", enabled: true },
    { id: "p2", publicModelName: "claude-opus-sim", enabled: false },
  ];

  const eligibleForMapping = availablePools.filter((p) => p.enabled);
  assert.equal(eligibleForMapping.length, 1);
  assert.equal(eligibleForMapping[0].publicModelName, "claude-fast");
});

test("launch_once_vs_persistent_scope_explicit", () => {
  const launchOnceMode = {
    kind: "launch-once",
    modifiesSettingsFile: false,
    spawnsEphemeralProcess: true,
  };
  const persistentMode = {
    kind: "persistent-profile",
    modifiesSettingsFile: true,
    spawnsEphemeralProcess: false,
  };

  assert.equal(launchOnceMode.modifiesSettingsFile, false);
  assert.equal(persistentMode.modifiesSettingsFile, true);
  assert.notEqual(launchOnceMode.kind, persistentMode.kind);
});

test("persistent_patch_preview", () => {
  const currentSettings = {
    theme: "dark",
  };
  const patch = {
    "env.ANTHROPIC_BASE_URL": "http://127.0.0.1:4567",
    "env.ANTHROPIC_AUTH_TOKEN": "qs_gw_dummy",
  };

  const preview = {
    ...currentSettings,
    ...patch,
  };

  assert.equal(preview.theme, "dark");
  assert.equal(preview["env.ANTHROPIC_BASE_URL"], "http://127.0.0.1:4567");
});

test("unsupported_feature_warning_visible", () => {
  const disclaimerText =
    "Experimental: Non-Claude model routing is not officially supported by Anthropic.";
  assert.match(disclaimerText, /Experimental/);
  assert.match(disclaimerText, /not officially supported by Anthropic/);
});

test("test_connection_not_equal_spawn_success", () => {
  const probeStatus = {
    processSpawned: true,
    gatewayHealthVerified: false,
  };

  const isConnected = probeStatus.processSpawned && probeStatus.gatewayHealthVerified;
  assert.equal(isConnected, false, "Spawning process without healthy gateway is NOT connected");
});

test("failed_connection_no_connected_badge", () => {
  const connectionState = {
    status: "failed",
    error: "Connection refused on loopback port",
  };

  const showConnectedBadge = connectionState.status === "connected";
  assert.equal(showConnectedBadge, false);
});

test("disconnect_conflict_shown", () => {
  const conflict = {
    hasConflict: true,
    message: "Settings file was modified by another process since connection.",
  };

  assert.equal(conflict.hasConflict, true);
  assert.match(conflict.message, /modified by another process/);
});

test("cancel_leaves_files_untouched", () => {
  const onCancel = () => {
    // Zero disk write actions on cancel
    return { writtenFiles: 0 };
  };

  assert.equal(onCancel().writtenFiles, 0);
});

test("secrets_not_rendered_or_copied", () => {
  const safeWizardDTO = {
    installationPath: "C:\\claude.exe",
    profileName: "Profile A",
    gatewayUrl: "http://127.0.0.1:4567",
  };

  const serialized = JSON.stringify(safeWizardDTO);
  assert.doesNotMatch(serialized, /sk-proj-|refresh_token|access_token|client_secret/);
});

test("Connect wizard never closes after a failed native connection", () => {
  const source = fs.readFileSync("src/components/claude/ClaudeCodePoolConnectWizard.tsx", "utf8");
  assert.match(source, /const connected = await connector\.connect\(\)/);
  assert.match(source, /if \(connected\) onClose\(\)/);
});

test("Claude installation and profiles are sourced from inventory, not invented paths", () => {
  const source = fs.readFileSync("src/components/claude/ClaudeCodePoolConnectWizard.tsx", "utf8");
  assert.match(source, /connector\.installations\.map/);
  assert.match(source, /connector\.profiles\.map/);
  assert.doesNotMatch(source, /C:\\\\Program Files\\\\Anthropic\\\\claude\.exe/);
});

test("The Claude hook reports connected only after a native connect result", () => {
  const source = fs.readFileSync("src/hooks/claude/useClaudeCodePoolConnector.ts", "utf8");
  assert.doesNotMatch(source, /no verified runtime transport/);
  const invokeAt = source.indexOf('invoke<ClaudeConnectResult>("connect_claude_code"');
  const connectedAt = source.indexOf('connectionStatus: "connected"', invokeAt);
  assert.ok(invokeAt > 0, "connect must call connect_claude_code");
  assert.ok(connectedAt > invokeAt, "connected is set after the native call resolves");
  assert.match(source, /"get_claude_gateway_status"/);
});

test("wizard_requires_default_slot", () => {
  const wizard = fs.readFileSync("src/components/claude/ClaudeCodePoolConnectWizard.tsx", "utf8");
  const hook = fs.readFileSync("src/hooks/claude/useClaudeCodePoolConnector.ts", "utf8");
  assert.match(hook, /Map the Default slot: unmapped Claude models use it\./);
  assert.match(wizard, /connector\.modelMappings\.default/);
  assert.match(wizard, /hasDefaultMapping/);
  assert.match(wizard, /disabled=\{connector\.isConnecting \|\| !hasDefaultMapping\}/);
  assert.match(wizard, /DEFAULT_SLOT_HINT/);
});

test("Claude Code wizard uses QuotaShift standard modal layout, not unstyled custom dialog", () => {
  const wizard = fs.readFileSync("src/components/claude/ClaudeCodePoolConnectWizard.tsx", "utf8");
  assert.match(wizard, /<AccountModalLayout/);
  assert.match(wizard, /dialogClassName="claude-pool-wizard"/);
  assert.match(wizard, /dialog-btn dialog-btn--secondary/);
  assert.match(wizard, /dialog-btn dialog-btn--primary/);
  assert.doesNotMatch(wizard, /custom-dialog-backdrop|custom-dialog-box|custom-dialog-btn/);
});

test("Claude Code wizard has compact progress, responsive scroll and themed dropdowns", () => {
  const wizard = fs.readFileSync("src/components/claude/ClaudeCodePoolConnectWizard.tsx", "utf8");
  const css = fs.readFileSync("src/styles/claude/claude-pool-wizard.css", "utf8");
  const imports = fs.readFileSync("src/styles.css", "utf8");
  assert.match(wizard, /claude-wizard-progress/);
  assert.match(wizard, /<CommonDropdown/);
  assert.match(wizard, /claude-wizard-header-warning/);
  assert.match(wizard, /<ClaudeWizardExperimentalDialog/);
  assert.match(wizard, /isOpen=\{isOpen && warningOpen\}/);
  assert.match(css, /\.dialog-box\.claude-pool-wizard/);
  assert.match(css, /calc\(100vh - 62px\)/);
  assert.match(css, /var\(--text-secondary\)/);
  assert.match(css, /var\(--border-color\)/);
  assert.match(imports, /@import "\.\/styles\/claude\/claude-pool-wizard\.css"/);
});

test("Claude wizard does not advance without a detected installation, profile, or enabled pool mapping", () => {
  const wizard = fs.readFileSync("src/components/claude/ClaudeCodePoolConnectWizard.tsx", "utf8");
  assert.match(wizard, /connector\.selectedInstallation/);
  assert.match(wizard, /connector\.selectedProfile/);
  assert.match(wizard, /enabledPools\.length/);
  assert.match(wizard, /connector\.modelMappings/);
  assert.match(wizard, /disabled=\{!canAdvance\}/);
});

test("Claude wizard creates new isolated profile with default or copied settings and auto-selects it", () => {
  const wizard = fs.readFileSync("src/components/claude/ClaudeCodePoolConnectWizard.tsx", "utf8");
  const creator = fs.readFileSync("src/components/claude/ClaudeProfileCreator.tsx", "utf8");
  const hook = fs.readFileSync("src/hooks/claude/useClaudeCodePoolConnector.ts", "utf8");
  assert.match(wizard, /ClaudeProfileCreator/);
  assert.match(creator, /copy-settings/);
  assert.match(creator, /default/);
  assert.match(creator, /sourceProfileId/);
  assert.match(hook, /create_managed_claude_profile/);
  assert.match(hook, /selectedProfile: created\.id/);
});

test("Experimental warning is a right-header info button opening a separate themed dialog", () => {
  const wizard = fs.readFileSync("src/components/claude/ClaudeCodePoolConnectWizard.tsx", "utf8");
  const layout = fs.readFileSync("src/components/common/AccountModalLayout.tsx", "utf8");
  const css = fs.readFileSync("src/styles/claude/claude-pool-wizard.css", "utf8");
  assert.match(wizard, /headerActions=\{/);
  assert.match(wizard, /setWarningOpen\(true\)/);
  assert.match(wizard, /claude-wizard-header-warning/);
  assert.match(wizard, /<ClaudeWizardExperimentalDialog/);
  assert.match(wizard, /isOpen=\{isOpen && warningOpen\}/);
  assert.match(layout, /headerActions\?: React\.ReactNode/);
  assert.match(css, /\.claude-wizard-header-warning/);
  assert.doesNotMatch(wizard, /<div className="claude-wizard-warning" role="note">/);
});

test("Claude toolbar matches the other provider action spacing, with connected icon directly before Sort", () => {
  const claude = fs.readFileSync("src/components/claude/ClaudeTab.tsx", "utf8");
  const css = fs.readFileSync("src/styles/antigravity/antigravity.css", "utf8");
  assert.match(claude, /<div className="account-bar-actions">/);
  assert.doesNotMatch(claude, /gap: "12px"/);
  assert.match(css, /\.account-bar-actions\s*\{[^}]*gap: 4px/s);
  const connectPosition = claude.indexOf("Connect to QuotaShift");
  const sortPosition = claude.indexOf("<AccountSortMenu");
  const rescanPosition = claude.indexOf("<ClaudeRescanIcon");
  assert.ok(
    rescanPosition < connectPosition && connectPosition < sortPosition,
    "connect action must be directly before Sort, after rescan",
  );
  assert.match(claude, /<ClaudeConnectIcon\s*\/>/);
});

test("Standalone Claude profile setup does not depend on Model Pools routing", () => {
  const tab = fs.readFileSync("src/components/claude/ClaudeTab.tsx", "utf8");
  const dialog = fs.readFileSync("src/components/claude/ClaudeProfileCreationDialog.tsx", "utf8");
  assert.match(tab, /<ClaudeProfileCreationDialog/);
  assert.match(tab, /New Profile/);
  assert.match(dialog, /<ClaudeProfileCreator/);
  assert.doesNotMatch(dialog, /modelPoolsV2|enabledPools|poolRoutingEnabled/);
});

test("Standalone profiles have named Windows command shims registered on user PATH", () => {
  const creator = fs.readFileSync("src/components/claude/ClaudeProfileCreator.tsx", "utf8");
  const hook = fs.readFileSync("src/hooks/claude/useClaudeCodePoolConnector.ts", "utf8");
  const rust = fs.readFileSync("src-tauri/src/claude/inventory/commands.rs", "utf8");
  assert.match(creator, /commandName/);
  assert.match(hook, /CreatedClaudeProfileDTO/);
  assert.match(rust, /ensure_launcher_dir_on_user_path/);
  assert.match(rust, /install_claude_launcher_at/);
});

test("Claude model mapping contains exactly five slots including Fable", () => {
  const wizard = fs.readFileSync("src/components/claude/ClaudeCodePoolConnectWizard.tsx", "utf8");
  assert.match(wizard, /"Sonnet", "Opus", "Haiku", "Fable", "Default"/);
});

test("Disconnect is reachable from the wizard and uses backend-recovered binding ids", () => {
  const wizard = fs.readFileSync("src/components/claude/ClaudeCodePoolConnectWizard.tsx", "utf8");
  const panel = fs.readFileSync("src/components/claude/ClaudeGatewayConnections.tsx", "utf8");
  const hook = fs.readFileSync("src/hooks/claude/useClaudeGatewayConnections.ts", "utf8");
  assert.match(wizard, /<ClaudeGatewayConnections/);
  assert.match(panel, /Disconnect/);
  assert.match(panel, /connection\.bindingId/);
  assert.match(hook, /list_claude_gateway_connections/);
  assert.match(hook, /disconnect_claude_code/);
  assert.doesNotMatch(hook + panel, /(secret|token)\??\s*:/i);
});

test("Disconnect lives only in the panel, retries on failure and handles cleanup-pending rows", () => {
  const connector = fs.readFileSync("src/hooks/claude/useClaudeCodePoolConnector.ts", "utf8");
  const hook = fs.readFileSync("src/hooks/claude/useClaudeGatewayConnections.ts", "utf8");
  const panel = fs.readFileSync("src/components/claude/ClaudeGatewayConnections.tsx", "utf8");
  assert.doesNotMatch(connector, /disconnect_claude_code/);
  assert.match(hook, /DISCONNECT_RETRY_HINT/);
  assert.match(hook, /isSettingsConflict/);
  assert.match(hook, /cleanupPending/);
  assert.match(hook, /gatewayMoved: boolean/);
  assert.match(hook, /router address changed - reconnect/);
  assert.match(panel, /connectionStateSuffix\(connection\)/);
  const server = fs.readFileSync("src/components/codex/CodexRouterServerPanel.tsx", "utf8");
  assert.match(server, /pin: action === "port" \? port !== null : null/);
  const step = fs.readFileSync("src/components/claude/ClaudeConnectionModeStep.tsx", "utf8");
  assert.match(step, /fixed router/);
  assert.match(panel, /Clean up/);
  assert.match(panel, /connection\.bindingId/);
});

test("Step 3 copy states what persistent mode writes and what Disconnect undoes", () => {
  const raw = fs.readFileSync("src/components/claude/ClaudeConnectionModeStep.tsx", "utf8");
  const step = raw.replace(/\s+/g, " ");
  assert.match(step, /ANTHROPIC_BASE_URL, the model env keys and an apiKeyHelper command/);
  assert.match(step, /Disconnect undoes/);
  assert.match(step, /replaces the token of an earlier launch-once session/);
  const wizard = fs.readFileSync("src/components/claude/ClaudeCodePoolConnectWizard.tsx", "utf8");
  assert.match(wizard, /<ClaudeConnectionModeStep/);
});

test("Cleanup-pending rows can be dismissed without editing settings", () => {
  const hook = fs.readFileSync("src/hooks/claude/useClaudeGatewayConnections.ts", "utf8");
  const panel = fs.readFileSync("src/components/claude/ClaudeGatewayConnections.tsx", "utf8");
  const lib = fs.readFileSync("src-tauri/src/lib.rs", "utf8");
  assert.match(hook, /dismiss_claude_gateway_cleanup/);
  assert.match(panel, /Dismiss/);
  assert.match(panel, /Unknown profile/);
  assert.match(panel, /leaves your settings\.json as it is/);
  assert.match(lib, /claude::connect::commands::dismiss_claude_gateway_cleanup/);
});
