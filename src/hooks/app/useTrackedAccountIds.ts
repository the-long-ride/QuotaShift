import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  TRACKED_IDS_CHANGED_EVENT,
  ensurePrimaryEntry,
  loadMultiTrackEnabled,
  loadTrackedList,
  saveTrackedList,
  trackedIdsByProvider,
  type TrackedEntry,
  type TrackedProvider,
} from "../../utils/common/tracked-accounts";

/** Persisted list of overlay-tracked accounts across providers (1–3 when multi-track is on). */
export function useTrackedAccountIds(onTrackStarted?: () => void) {
  const [trackedList, setTrackedListState] = useState<TrackedEntry[]>(() => loadTrackedList());
  const trackedListRef = useRef(trackedList);
  trackedListRef.current = trackedList;
  const onTrackStartedRef = useRef(onTrackStarted);
  onTrackStartedRef.current = onTrackStarted;
  const trackedIds = useMemo(() => trackedIdsByProvider(trackedList), [trackedList]);

  const commitTrackedList = useCallback((next: TrackedEntry[]) => {
    if (next === trackedListRef.current) return;
    const wasEmpty = trackedListRef.current.length === 0;
    trackedListRef.current = next;
    setTrackedListState(next);
    saveTrackedList(next);
    window.dispatchEvent(new CustomEvent(TRACKED_IDS_CHANGED_EVENT));
    if (wasEmpty && next.length > 0) {
      onTrackStartedRef.current?.();
    }
  }, []);

  useEffect(() => {
    const sync = () => {
      const next = loadTrackedList();
      trackedListRef.current = next;
      setTrackedListState(next);
    };
    window.addEventListener(TRACKED_IDS_CHANGED_EVENT, sync);
    return () => window.removeEventListener(TRACKED_IDS_CHANGED_EVENT, sync);
  }, []);

  /** Keeps the list consistent when another flow picks the primary tracked account. */
  const ensureTracked = useCallback(
    (provider: TrackedProvider, accountId: string | null) => {
      if (!accountId) return;
      const entry = { provider, id: accountId };
      commitTrackedList(ensurePrimaryEntry(trackedListRef.current, entry, loadMultiTrackEnabled()));
    },
    [commitTrackedList],
  );

  return { trackedList, trackedListRef, trackedIds, commitTrackedList, ensureTracked };
}
