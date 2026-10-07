import { useState, useRef, useEffect } from "react";
import {
  TRACKED_IDS_CHANGED_EVENT,
  loadTrackedList,
  type TrackedProvider,
} from "../../utils/common/tracked-accounts";
import { clearMonitoredOverlayState } from "./overlayTrackedExtras";
import {
  OVERLAY_TRACKED_ACCOUNT_ID_KEY,
  OVERLAY_TRACKED_PROVIDER_KEY,
} from "../../utils/common/app-constants";

export function useTrackedIdentitySync(
  ensureTracked: (provider: TrackedProvider, accountId: string) => void,
) {
  const [trackedProvider, setTrackedProvider] = useState<"antigravity" | "codex" | "claude" | null>(
    () => (localStorage.getItem(OVERLAY_TRACKED_PROVIDER_KEY) as any) || null,
  );

  const [trackedAccountId, setTrackedAccountId] = useState<string | null>(() =>
    localStorage.getItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY),
  );

  const trackedProviderRef = useRef(trackedProvider);
  trackedProviderRef.current = trackedProvider;

  const trackedAccountIdRef = useRef(trackedAccountId);
  trackedAccountIdRef.current = trackedAccountId;

  const persistedTrackedProviderRef = useRef<string | null>(
    localStorage.getItem(OVERLAY_TRACKED_PROVIDER_KEY),
  );

  const syncTrackedIdentityState = (
    provider: "antigravity" | "codex" | "claude",
    accountId: string | null,
  ) => {
    persistedTrackedProviderRef.current = accountId ? provider : null;
    if (accountId) ensureTracked(provider, accountId);
    if (trackedProviderRef.current !== (accountId ? provider : null)) {
      trackedProviderRef.current = accountId ? provider : (null as any);
      setTrackedProvider(accountId ? provider : (null as any));
    }
    if (trackedAccountIdRef.current !== accountId) {
      trackedAccountIdRef.current = accountId;
      setTrackedAccountId(accountId);
    }
  };

  useEffect(() => {
    const handleTrackedChanged = () => {
      const list = loadTrackedList();
      if (!list.length) {
        persistedTrackedProviderRef.current = null;
        trackedAccountIdRef.current = null;
        setTrackedProvider(null as any);
        setTrackedAccountId(null);
        clearMonitoredOverlayState();
      } else {
        persistedTrackedProviderRef.current = list[0].provider;
        trackedAccountIdRef.current = list[0].id;
        setTrackedProvider(list[0].provider);
        setTrackedAccountId(list[0].id);
      }
    };
    window.addEventListener(TRACKED_IDS_CHANGED_EVENT, handleTrackedChanged);
    return () => window.removeEventListener(TRACKED_IDS_CHANGED_EVENT, handleTrackedChanged);
  }, []);

  return {
    trackedProvider,
    setTrackedProvider,
    trackedAccountId,
    setTrackedAccountId,
    trackedProviderRef,
    trackedAccountIdRef,
    persistedTrackedProviderRef,
    syncTrackedIdentityState,
  };
}
