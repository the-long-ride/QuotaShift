import { useEffect, useState } from "react";
import {
  TRACKED_IDS_CHANGED_EVENT,
  trackedClaudeAccountIds,
} from "../../utils/common/tracked-accounts";

/** Claude account ids on the tracked list, kept in step with tracking changes in any window. */
export function useTrackedClaudeAccountIds(): string[] {
  const [ids, setIds] = useState<string[]>(() => trackedClaudeAccountIds());

  useEffect(() => {
    const sync = () => {
      const next = trackedClaudeAccountIds();
      setIds((current) => (current.join("\n") === next.join("\n") ? current : next));
    };
    window.addEventListener(TRACKED_IDS_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(TRACKED_IDS_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return ids;
}
