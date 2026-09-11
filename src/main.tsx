import { StrictMode, useState, useCallback } from "react";
import { createRoot, Root } from "react-dom/client";
import { App } from "./App";
import { load, Store } from "@tauri-apps/plugin-store";
import { PassphraseModal } from "./components/PassphraseModal";
import { decryptValue, hashPassphrase } from "./utils/crypto";

// ── Constants ────────────────────────────────────────────────────────
const PASSPHRASE_HASH_KEY = "_passphraseHash";
const ENCRYPTED_MARKER_KEY = "_encrypted";

// ── Migration Gate Component ────────────────────────────────────────
function MigrationGate({
  store,
  existingHash,
  onMigrated,
}: {
  store: Store;
  existingHash: string;
  onMigrated: () => void;
}) {
  const [error, setError] = useState("");

  const handleSubmit = useCallback(
    async (passphrase: string) => {
      try {
        const hash = await hashPassphrase(passphrase);
        if (hash === existingHash) {
          // Decrypt and migrate all keys
          const keys = await store.keys();
          const dataKeys = keys.filter(
            (k) => k !== PASSPHRASE_HASH_KEY && k !== ENCRYPTED_MARKER_KEY
          );

          for (const key of dataKeys) {
            const encrypted = await store.get<any>(key);
            if (encrypted !== null && encrypted !== undefined) {
              let decrypted = typeof encrypted === "string" ? encrypted : JSON.stringify(encrypted);
              if (typeof encrypted === "string" && encrypted.split(":").length === 3) {
                try {
                  decrypted = await decryptValue(encrypted, passphrase);
                } catch (e) {
                  console.warn(`Failed to decrypt key "${key}" during migration:`, e);
                }
              }
              // Set in store as plaintext
              await store.set(key, decrypted);
            }
          }
          // Remove encryption markers/hash
          await store.delete(PASSPHRASE_HASH_KEY);
          await store.delete(ENCRYPTED_MARKER_KEY);
          await store.save();
          onMigrated();
        } else {
          setError("Wrong passphrase. Please try again.");
        }
      } catch (err) {
        console.error("Migration error:", err);
        setError("An error occurred during migration.");
      }
    },
    [store, existingHash, onMigrated]
  );

  return (
    <PassphraseModal
      mode="migrate"
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

  const bootApp = async () => {
    const originalSetItem = localStorage.setItem.bind(localStorage);
    const originalRemoveItem = localStorage.removeItem.bind(localStorage);

    // Intercept localStorage.setItem → persist to store in plaintext
    localStorage.setItem = (key: string, value: string) => {
      originalSetItem(key, value);
      if (key.startsWith("antigravity-")) {
        store.set(key, value)
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

    // Existing plain store — inject into localStorage
    const keys = await store.keys();
    const dataKeys = keys.filter((k) => k !== PASSPHRASE_HASH_KEY && k !== ENCRYPTED_MARKER_KEY);
    for (const key of dataKeys) {
      const val = await store.get<string>(key);
      if (val !== null && val !== undefined) {
        originalSetItem(key, val);
      }
    }

    // Render the main app
    root.render(
      <StrictMode>
        <App />
      </StrictMode>
    );
  };

  if (existingHash) {
    // Show migration gate, then boot
    root.render(
      <StrictMode>
        <MigrationGate
          store={store}
          existingHash={existingHash}
          onMigrated={bootApp}
        />
      </StrictMode>
    );
  } else {
    // No legacy passphrase, boot immediately
    await bootApp();
  }
}

initStorageAndRender();
