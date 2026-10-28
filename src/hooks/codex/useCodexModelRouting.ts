import { useEffect, useState } from "react";
import {
  loadCodexModelRoutingPreference,
  saveCodexModelRoutingPreference,
  CODEX_MODEL_ROUTING_CHANGED_EVENT,
} from "../../utils/common/settings/codex-model-routing";

export function useCodexModelRouting() {
  const [codexModelRoutingEnabled, setCodexModelRoutingEnabled] = useState(() =>
    loadCodexModelRoutingPreference(),
  );

  useEffect(() => {
    const sync = () => setCodexModelRoutingEnabled(loadCodexModelRoutingPreference());
    window.addEventListener(CODEX_MODEL_ROUTING_CHANGED_EVENT, sync);
    return () => window.removeEventListener(CODEX_MODEL_ROUTING_CHANGED_EVENT, sync);
  }, []);

  const handleToggleCodexModelRouting = () => {
    const next = !codexModelRoutingEnabled;
    setCodexModelRoutingEnabled(next);
    saveCodexModelRoutingPreference(next);
  };

  return {
    codexModelRoutingEnabled,
    handleToggleCodexModelRouting,
  };
}
