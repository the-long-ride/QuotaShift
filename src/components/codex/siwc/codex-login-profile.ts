import { invoke } from "@tauri-apps/api/core";
import { decodeJwtProfile } from "../../../utils/auth/auth";
import { extractCodexProfilePicture } from "../../../utils/codex/account/codex-profile";

export async function resolveCodexLoginPicture(
  accessToken: string,
  idToken: string | null | undefined,
  accountsResponse: unknown,
): Promise<string | null> {
  const tokenPicture = decodeJwtProfile(idToken)?.picture;
  if (tokenPicture) return tokenPicture;

  const accountPicture = extractCodexProfilePicture(accountsResponse);
  if (accountPicture) return accountPicture;

  try {
    const remoteProfile = await invoke<unknown>("fetch_chatgpt_profile", { accessToken });
    return extractCodexProfilePicture(remoteProfile);
  } catch {
    return null;
  }
}
