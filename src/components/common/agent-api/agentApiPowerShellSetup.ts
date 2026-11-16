import { currentPlatform } from "../../../utils/common/settings/display-mode";

export type AgentHostOs = "windows" | "macos" | "linux";

export interface AgentEnvSetupDescriptor {
  os: AgentHostOs;
  shellLabel: string;
  copyLabel: string;
  runLabel: string;
  warning: string;
  script: string;
}

export function detectAgentHostOs(platform: string = currentPlatform()): AgentHostOs {
  if (/\b(windows|win32|win64)\b/i.test(platform)) return "windows";
  if (/\b(macintosh|mac os|darwin)\b/i.test(platform)) return "macos";
  return "linux";
}

/** Copyable PowerShell commands: prompt for the key rather than interpolating it into shell history. */
export const agentApiPowerShellSetup = (url: string): string => {
  const quotedUrl = "'" + url.replace(/'/g, "''") + "'";
  return [
    "$secureKey = Read-Host 'Enter your QuotaShift Agent API key' -AsSecureString",
    "$secretPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)",
    "try {",
    "  $apiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPtr)",
    "  if ([string]::IsNullOrWhiteSpace($apiKey)) { throw 'API key cannot be empty' }",
    `  [Environment]::SetEnvironmentVariable('QUOTASHIFT_AGENT_API_URL', ${quotedUrl}, 'User')`,
    "  [Environment]::SetEnvironmentVariable('QUOTASHIFT_AGENT_API_KEY', $apiKey, 'User')",
    `  $env:QUOTASHIFT_AGENT_API_URL = ${quotedUrl}`,
    "  $env:QUOTASHIFT_AGENT_API_KEY = $apiKey",
    "  Write-Host 'QuotaShift Agent API environment configured. You can close this window now.'",
    "} finally {",
    "  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPtr)",
    "  Remove-Variable apiKey, secureKey -ErrorAction SilentlyContinue",
    "}",
  ].join("\n");
};

const posixSingleQuote = (value: string): string => `'${value.replace(/'/g, "'\"'\"'")}'`;

export const agentApiPosixSetup = (url: string, os: "macos" | "linux"): string => {
  const quotedUrl = posixSingleQuote(url);
  const profileTargets =
    os === "macos" ? '"$HOME/.zshrc" "$HOME/.zprofile"' : '"$HOME/.bashrc" "$HOME/.profile"';
  const lines = [
    "printf 'Enter your QuotaShift Agent API key: '",
    "stty -echo; IFS= read -r QS_KEY; stty echo; printf '\\n'",
    '[ -n "$QS_KEY" ] || { echo "API key cannot be empty" >&2; exit 1; }',
    "esc_sq() { printf '%s' \"$1\" | sed \"s/'/'\\\\''/g\"; }",
    "for rc in " + profileTargets + "; do",
    '  grep -v "QUOTASHIFT_AGENT_API_" "$rc" 2>/dev/null > "${rc}.tmp" || true',
    `  printf "export QUOTASHIFT_AGENT_API_URL=%s\\n" ${quotedUrl} >> "\${rc}.tmp"`,
    '  printf "export QUOTASHIFT_AGENT_API_KEY=\'%s\'\\n" "$(esc_sq "$QS_KEY")" >> "${rc}.tmp"',
    '  chmod 600 "${rc}.tmp" && mv "${rc}.tmp" "$rc"',
    "done",
  ];
  if (os === "macos") {
    lines.push(
      `launchctl setenv QUOTASHIFT_AGENT_API_URL ${quotedUrl} >/dev/null 2>&1 || true`,
      'launchctl setenv QUOTASHIFT_AGENT_API_KEY "$QS_KEY" >/dev/null 2>&1 || true',
    );
  }
  lines.push(
    "unset QS_KEY",
    "echo 'QuotaShift Agent API environment configured. You can close this window now.'",
  );
  return lines.join("\n");
};

export function agentApiEnvSetup(
  url: string,
  os: AgentHostOs = detectAgentHostOs(),
): AgentEnvSetupDescriptor {
  if (os === "windows") {
    return {
      os,
      shellLabel: "PowerShell · user variables",
      copyLabel: "Copy PowerShell setup",
      runLabel: "Run in PowerShell",
      warning:
        "User-level environment variables store the key in the Windows user registry as readable text. Only use this on a trusted device. This does not modify PATH.",
      script: agentApiPowerShellSetup(url),
    };
  }
  return {
    os,
    shellLabel: os === "macos" ? "Terminal (zsh) · user profile" : "Terminal (bash) · user profile",
    copyLabel: "Copy Terminal setup",
    runLabel: "Run in Terminal",
    warning:
      os === "macos"
        ? "User-level environment variables store the key in ~/.zshrc and ~/.zprofile as readable text. Only use this on a trusted device. This does not modify PATH."
        : "User-level environment variables store the key in ~/.bashrc and ~/.profile as readable text. Only use this on a trusted device. This does not modify PATH.",
    script: agentApiPosixSetup(url, os),
  };
}
