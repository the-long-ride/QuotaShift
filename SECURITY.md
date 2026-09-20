# Security Policy

## Reporting a vulnerability

Please report security vulnerabilities privately rather than through a public issue.

Use GitHub's private vulnerability reporting / Security Advisory flow for this repository when available. Include the affected version, reproduction steps, impact, and any suggested mitigation. Do not include credentials, tokens, private account data, or other secrets in public issues or discussions.

## Supported version

Security fixes are applied to the current maintained release line. At the time of this policy, that is the 1.1.x line.

## Temporary glib advisory exception

QuotaShift's Linux desktop dependency graph currently inherits **GHSA-wrw7-89jp-8q8g / RUSTSEC-2024-0429** through GTK3 / `glib` 0.18.x.

The runtime mitigation is not the version-based audit or Dependabot ignore. `src-tauri/Cargo.toml` pins the reviewed source-compatible backport at immutable revision:

`9e2bb20e2daba5b4dc5e2c9f4dee0797a1503b9f`

Repository:

`https://github.com/andrew-wommack-ministries/glib-rustsec-2024-0429-backport`

This exception is intentionally narrow. Remove it when a stable Tauri dependency graph used by QuotaShift accepts **glib >=0.20.0** without breaking the supported Linux desktop stack.

Any different `glib` advisory, a change to the pinned revision, or a change to the affected dependency range must be triaged independently rather than being covered by this exception.
