/** Copyable PowerShell commands: prompt for the key rather than interpolating it into shell history. */
export const agentApiPowerShellSetup = (url: string, persistent: boolean): string => {
  const target = persistent ? "User" : "Process";
  const quotedUrl = "'" + url.replace(/'/g, "''") + "'";
  return [
    "$secureKey = Read-Host 'Enter your QuotaShift Agent API key' -AsSecureString",
    "$secretPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)",
    "try {",
    "  $apiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPtr)",
    "  if ([string]::IsNullOrWhiteSpace($apiKey)) { throw 'API key cannot be empty' }",
    `  [Environment]::SetEnvironmentVariable('QUOTASHIFT_AGENT_API_URL', ${quotedUrl}, '${target}')`,
    `  [Environment]::SetEnvironmentVariable('QUOTASHIFT_AGENT_API_KEY', $apiKey, '${target}')`,
    `  $env:QUOTASHIFT_AGENT_API_URL = ${quotedUrl}`,
    "  $env:QUOTASHIFT_AGENT_API_KEY = $apiKey",
    "  Write-Host 'QuotaShift Agent API environment configured.'",
    "} finally {",
    "  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPtr)",
    "  Remove-Variable apiKey, secureKey -ErrorAction SilentlyContinue",
    "}",
  ].join("\n");
};
