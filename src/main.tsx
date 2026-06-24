import { StrictMode, useState, useCallback } from "react";
import { createRoot, Root } from "react-dom/client";
import { App } from "./App";
import { load, Store } from "@tauri-apps/plugin-store";
import { PassphraseModal } from "./components/PassphraseModal";
import { encryptValue, decryptValue, hashPassphrase } from "./utils/crypto";

// ── Module-level state (accessible by App.tsx via getPassphrase) ─────
let _passphrase: string | null = (typeof window !== "undefined" && (window as any).__quotaShiftPassphrase) || null;

function setInMemoryPassphrase(pass: string | null) {
  _passphrase = pass;
  if (typeof window !== "undefined") {
    (window as any).__quotaShiftPassphrase = pass;
  }
}

/** Get the current passphrase (held in memory only). */
export function getPassphrase(): string {
  const pass = (typeof window !== "undefined" && (window as any).__quotaShiftPassphrase) || _passphrase;
  if (pass === null) throw new Error("Passphrase not set");
  return pass;
}

/** Check if the user currently has a passphrase configured. */
export function hasPassphrase(): boolean {
  const pass = (typeof window !== "undefined" && (window as any).__quotaShiftPassphrase) || _passphrase;
  return pass !== null && pass !== "";
}

// ── Constants ────────────────────────────────────────────────────────
const PASSPHRASE_HASH_KEY = "_passphraseHash";
const ENCRYPTED_MARKER_KEY = "_encrypted";

/** Change the passphrase and re-encrypt all stored keys. */
export async function changePassphrase(currentPass: string, newPass: string): Promise<void> {
  const currentPassphraseInMemory = (typeof window !== "undefined" && (window as any).__quotaShiftPassphrase) || _passphrase;
  const oldPass = currentPassphraseInMemory || "";

  if (currentPassphraseInMemory !== null && currentPassphraseInMemory !== "" && currentPassphraseInMemory !== currentPass) {
    throw new Error("Incorrect current passphrase.");
  }

  // Load the store
  const store = await load("store.json", { autoSave: false, defaults: {} });
  const keys = await store.keys();
  const dataKeys = keys.filter(
    (k) => k !== PASSPHRASE_HASH_KEY && k !== ENCRYPTED_MARKER_KEY
  );

  // 1. Decrypt and re-encrypt all data
  const reEncryptedData: Record<string, string> = {};
  for (const key of dataKeys) {
    const encrypted = await store.get<any>(key);
    if (encrypted !== null && encrypted !== undefined) {
      let decrypted = typeof encrypted === "string" ? encrypted : JSON.stringify(encrypted);
      if (typeof encrypted === "string" && encrypted.split(":").length === 3) {
        try {
          decrypted = await decryptValue(encrypted, oldPass);
        } catch (e) {
          console.warn(`Failed to decrypt key "${key}", treating as plaintext:`, e);
        }
      }
      const reEncrypted = await encryptValue(decrypted, newPass);
      reEncryptedData[key] = reEncrypted;
    }
  }

  // 2. Compute new hash
  const newHash = await hashPassphrase(newPass);

  // 3. Write to store and save
  for (const key of dataKeys) {
    if (reEncryptedData[key] !== undefined) {
      await store.set(key, reEncryptedData[key]);
    }
  }
  await store.set(PASSPHRASE_HASH_KEY, newHash);
  await store.save();

  // 4. Update in-memory passphrase
  setInMemoryPassphrase(newPass);
}

// ── Passphrase Gate Component ────────────────────────────────────────
function PassphraseGate({
  store,
  isNewSetup,
  existingHash,
  onUnlocked,
}: {
  store: Store;
  isNewSetup: boolean;
  existingHash: string | null;
  onUnlocked: (passphrase: string) => void;
}) {
  const [error, setError] = useState("");

  const handleSubmit = useCallback(
    async (passphrase: string) => {
      try {
        if (isNewSetup) {
          // First time — store the hash and mark as encrypted
          const hash = await hashPassphrase(passphrase);
          await store.set(PASSPHRASE_HASH_KEY, hash);
          await store.set(ENCRYPTED_MARKER_KEY, true);
          await store.save();
          onUnlocked(passphrase);
        } else {
          // Verify against stored hash
          const hash = await hashPassphrase(passphrase);
          if (hash === existingHash) {
            onUnlocked(passphrase);
          } else {
            setError("Wrong passphrase. Please try again.");
          }
        }
      } catch (err) {
        console.error("Passphrase verification error:", err);
        setError("An error occurred. Please try again.");
      }
    },
    [store, isNewSetup, existingHash, onUnlocked]
  );

  return (
    <PassphraseModal
      mode={isNewSetup ? "create" : "unlock"}
      onSubmit={handleSubmit}
      error={error}
    />
  );
}

// ── Bootstrap ────────────────────────────────────────────────────────
async function initStorageAndRender() {
  const root: Root = createRoot(document.getElementById("app-root")!);

  let store: Store;
  try {
    store = await load("store.json", { autoSave: false, defaults: {} });
  } catch (err) {
    console.error("Failed to load store", err);
    root.render(
      <StrictMode>
        <App />
      </StrictMode>
    );
    return;
  }

  const existingHash = await store.get<string>(PASSPHRASE_HASH_KEY);
  const isEncrypted = await store.get<boolean>(ENCRYPTED_MARKER_KEY);
  const keys = await store.keys();
  // Data keys are all keys except our internal ones
  const dataKeys = keys.filter((k) => k !== PASSPHRASE_HASH_KEY && k !== ENCRYPTED_MARKER_KEY);
  const isNewSetup = !existingHash;

  // Show passphrase gate, then boot the app
  const bootApp = async (passphrase: string) => {
    setInMemoryPassphrase(passphrase);

    const originalSetItem = localStorage.setItem.bind(localStorage);
    const originalRemoveItem = localStorage.removeItem.bind(localStorage);

    // Intercept localStorage.setItem → encrypt and persist to store
    localStorage.setItem = (key: string, value: string) => {
      originalSetItem(key, value);
      if (key.startsWith("antigravity-")) {
        const currentPass = (typeof window !== "undefined" && (window as any).__quotaShiftPassphrase) || _passphrase;
        if (!currentPass) {
          console.error("Passphrase is not set in memory, cannot encrypt storage update.");
          return;
        }
        encryptValue(value, currentPass)
          .then((encrypted) => store.set(key, encrypted))
          .then(() => store.save())
          .catch(console.error);
      }
    };

    // Intercept localStorage.removeItem → remove from store
    localStorage.removeItem = (key: string) => {
      originalRemoveItem(key);
      if (key.startsWith("antigravity-")) {
        store.delete(key).then(() => store.save()).catch(console.error);
      }
    };

    if (isNewSetup && dataKeys.length === 0) {
      // Fresh install or first encryption setup:
      // Migrate any existing plaintext localStorage data → encrypt into store
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("antigravity-")) {
          const val = localStorage.getItem(key);
          if (val) {
            const encrypted = await encryptValue(val, passphrase);
            await store.set(key, encrypted);
          }
        }
      }
      await store.save();
    } else if (isNewSetup && dataKeys.length > 0 && !isEncrypted) {
      // Store has plaintext data from before encryption was added — migrate
      for (const key of dataKeys) {
        const val = await store.get<string>(key);
        if (val !== null && val !== undefined) {
          // Inject plaintext into localStorage first
          originalSetItem(key, val);
          // Then encrypt it in the store
          const encrypted = await encryptValue(val, passphrase);
          await store.set(key, encrypted);
        }
      }
      await store.save();
    } else {
      // Existing encrypted store — decrypt and inject into localStorage
      for (const key of dataKeys) {
        const encrypted = await store.get<string>(key);
        if (encrypted !== null && encrypted !== undefined) {
          try {
            const decrypted = await decryptValue(encrypted, passphrase);
            originalSetItem(key, decrypted);
          } catch (e) {
            console.warn(`Failed to decrypt key "${key}", skipping:`, e);
          }
        }
      }
    }

    // Render the main app
    root.render(
      <StrictMode>
        <App />
      </StrictMode>
    );
  };

  const hmrPassphrase = typeof window !== "undefined" && (window as any).__quotaShiftPassphrase;
  if (hmrPassphrase !== undefined && hmrPassphrase !== null) {
    // Already unlocked previously, boot immediately (HMR support)
    await bootApp(hmrPassphrase);
    return;
  }

  // Render the passphrase gate
  root.render(
    <StrictMode>
      <PassphraseGate
        store={store}
        isNewSetup={isNewSetup}
        existingHash={existingHash ?? null}
        onUnlocked={bootApp}
      />
    </StrictMode>
  );
}

initStorageAndRender();
