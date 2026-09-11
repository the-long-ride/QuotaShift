import { deobfuscate, obfuscate } from "../auth/auth.js";

export function isNewerAvatarUrl(
  currentObfuscatedUrl: string | null | undefined,
  remoteUrl: string | null | undefined,
  deobfuscateFn: (val: string) => string = deobfuscate,
): boolean {
  if (!remoteUrl || typeof remoteUrl !== "string") {
    return false;
  }
  const cleanRemote = remoteUrl.trim();
  if (!cleanRemote.startsWith("http://") && !cleanRemote.startsWith("https://")) {
    return false;
  }
  if (!currentObfuscatedUrl) {
    return true;
  }
  try {
    const currentLocal = deobfuscateFn(currentObfuscatedUrl).trim();
    return currentLocal !== cleanRemote;
  } catch {
    return true;
  }
}

export function resolveRefreshedAvatarUrl(
  currentObfuscatedUrl: string | null | undefined,
  remoteUrl: string | null | undefined,
  deobfuscateFn: (val: string) => string = deobfuscate,
  obfuscateFn: (val: string) => string = obfuscate,
): string | undefined {
  if (isNewerAvatarUrl(currentObfuscatedUrl, remoteUrl, deobfuscateFn)) {
    return obfuscateFn(remoteUrl!.trim());
  }
  return currentObfuscatedUrl || undefined;
}
