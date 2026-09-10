import { encrypt, decrypt, EncryptedBundle } from "../auth/crypto";
import { AntigravityAccount, CodexAccount } from "./types";
import { loadCodexPools } from "./app-storage";

export const buildBackupData = (
  antigravityAccounts: AntigravityAccount[],
  codexAccounts: CodexAccount[],
  theme: string,
) => {
  return {
    version: 2,
    createdAt: new Date().toISOString(),
    theme,
    antigravity: {
      accounts: antigravityAccounts,
    },
    codex: {
      accounts: codexAccounts,
      pools: loadCodexPools(),
    },
  };
};

export const encryptBackup = async (data: any, passphrase: string): Promise<string> => {
  const json = JSON.stringify(data);
  const bundle = await encrypt(json, passphrase);
  return JSON.stringify(bundle);
};

export const decryptBackup = async (content: string, passphrase: string): Promise<any> => {
  const bundle: EncryptedBundle = JSON.parse(content);
  const decrypted = await decrypt(bundle, passphrase);
  return JSON.parse(decrypted);
};
