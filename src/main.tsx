import { StrictMode, useState, useCallback } from "react";
import { createRoot, Root } from "react-dom/client";
import { App } from "./App";
import { load, Store } from "@tauri-apps/plugin-store";
import { PassphraseModal } from "./components/PassphraseModal";
import { decryptValue, hashPassphrase } from "./utils/crypto";
import {
  initializeAntigravityKeepAliveBridge,
  notifyAntigravityKeepAliveStorageChange,
} from "./utils/antigravity-keep-alive";
import { initFrontendLogging, logFrontend, ErrorBoundary } from "./utils/logger";

import { OverlayApp } from "./components/OverlayApp";

// Initialize frontend logger immediately
initFrontendLogging();

// Prevent native webview context menu across all windows in production build
if (!import.meta.env.DEV) {
  window.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  }, { capture: true });
}

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
  logFrontend("INFO", "main:bootstrap", "initStorageAndRender() starting");

  const appRoot = document.getElementById("app-root");
  if (!appRoot) {
    const msg = "CRITICAL: #app-root DOM element not found!";
    logFrontend("ERROR", "main:bootstrap", msg);
    console.error(msg);
    return;
  }

  const root: Root = createRoot(appRoot);

  const isOverlay = window.location.search.includes("window=overlay");
  if (isOverlay) {
    logFrontend("INFO", "main:bootstrap", "Rendering OverlayApp");
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <OverlayApp />
        </ErrorBoundary>
      </StrictMode>
    );
    return;
  }

  let store: Store;
  try {
    logFrontend("INFO", "main:bootstrap", "Loading store.json via @tauri-apps/plugin-store...");
    store = await load("store.json", { autoSave: false, defaults: {} });
    logFrontend("INFO", "main:bootstrap", "store.json loaded successfully");
  } catch (err) {
    logFrontend("ERROR", "main:bootstrap", "Failed to load store.json", err);
    await initializeAntigravityKeepAliveBridge().catch((error) => {
      console.warn("Failed to initialize Antigravity keep-alive", error);
    });
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>
    );
    return;
  }

  let existingHash: string | null = null;
  try {
    existingHash = (await store.get<string>(PASSPHRASE_HASH_KEY)) ?? null;
    logFrontend("INFO", "main:bootstrap", `Legacy passphrase hash check: ${existingHash ? "FOUND" : "NONE"}`);
  } catch (err) {
    logFrontend("WARN", "main:bootstrap", "Failed to read passphrase hash from store", err);
  }

  const bootApp = async () => {
    logFrontend("INFO", "main:bootstrap", "bootApp() starting");
    const originalSetItem = localStorage.setItem.bind(localStorage);
    const originalRemoveItem = localStorage.removeItem.bind(localStorage);

    // Intercept localStorage.setItem → persist to store in plaintext
    localStorage.setItem = (key: string, value: string) => {
      originalSetItem(key, value);
      notifyAntigravityKeepAliveStorageChange(key);
      if (key.startsWith("antigravity-")) {
        store.set(key, value)
          .then(() => store.save())
          .catch((err) => logFrontend("ERROR", "main:storage", `Failed to persist key '${key}'`, err));
      }
    };

    // Intercept localStorage.removeItem → remove from store
    localStorage.removeItem = (key: string) => {
      originalRemoveItem(key);
      notifyAntigravityKeepAliveStorageChange(key);
      if (key.startsWith("antigravity-")) {
        store.delete(key)
          .then(() => store.save())
          .catch((err) => logFrontend("ERROR", "main:storage", `Failed to delete key '${key}'`, err));
      }
    };

    try {
      // Existing plain store — inject into localStorage
      const keys = await store.keys();
      logFrontend("INFO", "main:bootstrap", `Read ${keys.length} keys from store`);
      const dataKeys = keys.filter((k) => k !== PASSPHRASE_HASH_KEY && k !== ENCRYPTED_MARKER_KEY);
      for (const key of dataKeys) {
        const val = await store.get<string>(key);
        if (val !== null && val !== undefined) {
          originalSetItem(key, val);
        }
      }
    } catch (err) {
      logFrontend("ERROR", "main:bootstrap", "Error syncing store keys to localStorage", err);
    }

    await initializeAntigravityKeepAliveBridge().catch((error) => {
      console.warn("Failed to initialize Antigravity keep-alive", error);
    });

    // Render the main app
    logFrontend("INFO", "main:bootstrap", "Rendering React application with ErrorBoundary...");
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>
    );
    logFrontend("INFO", "main:bootstrap", "React root.render() executed");
  };

  if (existingHash) {
    // Show migration gate, then boot
    logFrontend("INFO", "main:bootstrap", "Displaying MigrationGate for legacy passphrase");
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <MigrationGate
            store={store}
            existingHash={existingHash}
            onMigrated={bootApp}
          />
        </ErrorBoundary>
      </StrictMode>
    );
  } else {
    // No legacy passphrase, boot immediately
    await bootApp();
  }
}

initStorageAndRender().catch((err) => {
  logFrontend("ERROR", "main:fatal", "Fatal error in initStorageAndRender()", err);
  const appRoot = document.getElementById("app-root");
  if (appRoot) {
    appRoot.innerHTML = `
      <div style="padding: 20px; color: #ef4444; background: #000000; font-family: sans-serif;">
        <h3>Fatal Startup Error</h3>
        <pre style="white-space: pre-wrap; font-size: 12px;">${String(err)}</pre>
      </div>
    `;
  }
});
