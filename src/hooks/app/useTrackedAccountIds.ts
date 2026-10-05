import { useCallback, useEffect, useRef, useState } from "react";
import {
  TRACKED_IDS_CHANGED_EVENT,
  loadTrackedIds,
  saveTrackedIds,
  type TrackedIds,
  type TrackedProvider,
} from "../../utils/common/tracked-accounts";

/** Persisted per-provider list of overlay-tracked account ids (1–3 when multi-track is on). */
export function useTrackedAccountIds() {
  const [trackedIds, setTrackedIdsState] = useState<TrackedIds>(() => loadTrackedIds());
  const trackedIdsRef = useRef(trackedIds);
  trackedIdsRef.current = trackedIds;

  const commitTrackedIds = useCallback((next: TrackedIds) => {
    if (next === trackedIdsRef.current) return;
    trackedIdsRef.current = next;
    setTrackedIdsState(next);
    saveTrackedIds(next);
  }, []);

  useEffect(() => {
    const sync = () => {
      const next = loadTrackedIds();
      trackedIdsRef.current = next;
      setTrackedIdsState(next);
    };
    window.addEventListener(TRACKED_IDS_CHANGED_EVENT, sync);
    return () => window.removeEventListener(TRACKED_IDS_CHANGED_EVENT, sync);
  }, []);

  /** Keeps the list consistent when another flow picks the primary tracked account. */
  const ensureTracked = useCallback(
    (provider: TrackedProvider, accountId: string | null) => {
      if (!accountId) return;
      const current = trackedIdsRef.current;
      if (current[provider].includes(accountId)) return;
      commitTrackedIds({ ...current, [provider]: [accountId] });
    },
    [commitTrackedIds],
  );

  return { trackedIds, trackedIdsRef, commitTrackedIds, ensureTracked };
}
