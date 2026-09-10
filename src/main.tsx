import { StrictMode, useState, useCallback } from "react";
import { createRoot, Root } from "react-dom/client";
import { App } from "./App";
import { load, Store } from "@tauri-apps/plugin-store";
import { PassphraseModal } from "./components/common/PassphraseModal";
import { decryptValue, hashPassphrase } from "./utils/auth/crypto";
import {
  initializeAntigravityKeepAliveBridge,
  notifyAntigravityKeepAliveStorageChange,
} from "./utils/antigravity/antigravity-keep-alive";
import {
  createTauriSecureStorageBackend,
  installSecureStorageFacade,
  isSensitiveStorageKey,
  SecureStorageAdapter,
} from "./utils/auth/secure-storage";
import { initFrontendLogging, logFrontend, ErrorBoundary } from "./utils/common/logger";

import { OverlayApp } from "./components/overlay/OverlayApp";

// Initialize frontend logger immediately
initFrontendLogging();

// Prevent native webview context menu across all windows in production build
if (!import.meta.env.DEV) {
  window.addEventListener(
    "contextmenu",
    (e) => {
      e.preventDefault();
    },
    { capture: true },
  );
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
  onMigrated: (passphrase: string) => Promise<void>;
}) {
  const [error, setError] = useState("");

  const handleSubmit = useCallback(
    async (passphrase: string) => {
      try {
        const hash = await hashPassphrase(passphrase);
        if (hash === existingHash) {
          await onMigrated(passphrase);
        } else {
          setError("Wrong passphrase. Please try again.");
        }
      } catch (err) {
        console.error("Migration error:", err instanceof Error ? err.message : "unknown error");
        setError("An error occurred during migration.");
      }
    },
    [store, existingHash, onMigrated],
  );

  return <PassphraseModal mode="migrate" onSubmit={handleSubmit} error={error} />;
}

// ── Bootstrap ────────────────────────────────────────────────────────
async function decryptLegacyStoreValues(
  store: Store,
  passphrase: string,
): Promise<Record<string, string>> {
  const decryptedSensitiveValues: Record<string, string> = {};
  const keys = await store.keys();
  const dataKeys = keys.filter(
    (key) => key !== PASSPHRASE_HASH_KEY && key !== ENCRYPTED_MARKER_KEY,
  );

  for (const key of dataKeys) {
    const encrypted = await store.get<unknown>(key);
    if (encrypted === null || encrypted === undefined) continue;
    let decrypted = typeof encrypted === "string" ? encrypted : JSON.stringify(encrypted);
    if (typeof encrypted === "string" && encrypted.split(":").length === 3) {
      try {
        decrypted = await decryptValue(encrypted, passphrase);
      } catch {
        throw new Error(`Unable to decrypt legacy storage value for ${key}`);
      }
    }

    if (isSensitiveStorageKey(key)) {
      decryptedSensitiveValues[key] = decrypted;
    } else {
      await store.set(key, decrypted);
    }
  }
  return decryptedSensitiveValues;
}

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
      </StrictMode>,
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
    throw new Error("Unable to load local storage safely");
  }

  let existingHash: string | null = null;
  try {
    existingHash = (await store.get<string>(PASSPHRASE_HASH_KEY)) ?? null;
    logFrontend(
      "INFO",
      "main:bootstrap",
      `Legacy passphrase hash check: ${existingHash ? "FOUND" : "NONE"}`,
    );
  } catch (err) {
    logFrontend("ERROR", "main:bootstrap", "Failed to read passphrase hash from store", err);
    throw new Error("Unable to inspect legacy storage safely");
  }

  const bootApp = async (passphrase?: string) => {
    logFrontend("INFO", "main:bootstrap", "bootApp() starting");
    const nativeStorage = window.localStorage;
    const decryptedSensitiveValues = passphrase
      ? await decryptLegacyStoreValues(store, passphrase)
      : {};
    const adapter = new SecureStorageAdapter({
      nativeStorage,
      store,
      backend: createTauriSecureStorageBackend(),
      onMutation: notifyAntigravityKeepAliveStorageChange,
      onError: (error) =>
        logFrontend("ERROR", "main:storage", "Secure storage write failed", error),
    });
    await adapter.hydrate(decryptedSensitiveValues);

    // Non-sensitive preferences continue to use the native storage facade.
    const keys = await store.keys();
    logFrontend("INFO", "main:bootstrap", `Read ${keys.length} keys from store`);
    const dataKeys = keys.filter(
      (key) => key !== PASSPHRASE_HASH_KEY && key !== ENCRYPTED_MARKER_KEY,
    );
    for (const key of dataKeys) {
      if (isSensitiveStorageKey(key)) continue;
      const value = await store.get<string>(key);
      if (value !== null && value !== undefined) nativeStorage.setItem(key, value);
    }

    if (passphrase) {
      await store.delete(PASSPHRASE_HASH_KEY);
      await store.delete(ENCRYPTED_MARKER_KEY);
      await store.save();
    }

    installSecureStorageFacade(adapter, window);

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
      </StrictMode>,
    );
    logFrontend("INFO", "main:bootstrap", "React root.render() executed");
  };

  if (existingHash) {
    // Show migration gate, then boot
    logFrontend("INFO", "main:bootstrap", "Displaying MigrationGate for legacy passphrase");
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <MigrationGate store={store} existingHash={existingHash} onMigrated={bootApp} />
        </ErrorBoundary>
      </StrictMode>,
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
    appRoot.textContent = `Fatal Startup Error\n\n${String(err)}`;
  }
});
