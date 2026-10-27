<#
.SYNOPSIS
  Run QuotaShift Rust library tests on Windows with Common Controls v6.
.DESCRIPTION
  The Tauri-linked test executable imports TaskDialogIndirect from comctl32.dll.
  Cargo's libtest runner has no application manifest, so the Windows loader
  otherwise exits with STATUS_ENTRYPOINT_NOT_FOUND before any test executes.
  A sidecar manifest is written only to ignored target/debug/deps binaries.
  No source code, system settings, or application executable is modified.
#>
param([string]$Filter = "")
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$manifest = Join-Path $root "src-tauri/Cargo.toml"
Push-Location $root
try {
  & cargo test --manifest-path $manifest --lib --no-run
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  $targetDeps = if ($env:CARGO_TARGET_DIR) {
    Join-Path $env:CARGO_TARGET_DIR "debug/deps"
  } else {
    Join-Path $root "src-tauri/target/debug/deps"
  }
  $bins = Get-ChildItem $targetDeps -Filter "tauri_app_lib-*.exe"
  if (-not $bins) { throw "Rust test executable was not produced." }
  $xml = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <dependency>
    <dependentAssembly>
      <assemblyIdentity type="win32" name="Microsoft.Windows.Common-Controls"
        version="6.0.0.0" processorArchitecture="*"
        publicKeyToken="6595b64144ccf1df" language="*"/>
    </dependentAssembly>
  </dependency>
</assembly>
'@
  foreach ($bin in $bins) {
    [System.IO.File]::WriteAllText(
      $bin.FullName + ".manifest", $xml, [System.Text.UTF8Encoding]::new($false)
    )
  }

  if ($Filter) {
    & cargo test --manifest-path $manifest --lib $Filter -- --test-threads=1
  } else {
    & cargo test --manifest-path $manifest --lib -- --test-threads=1
  }
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
