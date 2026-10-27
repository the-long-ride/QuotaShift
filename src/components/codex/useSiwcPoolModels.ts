import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SiwcAccountView, SiwcModelView } from "../../utils/codex/siwc-types";

/** Native per-account catalog intersection; never mix with Codex CLI scan cache. */
export function useSiwcPoolModels(
  memberIds: string[],
  enabled: boolean,
  registrations: SiwcAccountView[],
) {
  const [byAccount, setByAccount] = useState<Record<string, SiwcModelView[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const registrationIds = registrations.filter((item) => item.isRoutable).map((item) => item.id);
  const selected = memberIds.filter((id) => registrationIds.includes(id));
  const pending = selected.filter((id) => !byAccount[id] && !errors[id]);
  const pendingKey = pending.join(",");

  useEffect(() => {
    if (!enabled || !pendingKey) return;
    let cancelled = false;
    for (const id of pendingKey.split(",")) {
      void invoke<SiwcModelView[]>("get_siwc_models", { registrationId: id })
        .then((catalog) => {
          if (!cancelled) setByAccount((previous) => ({ ...previous, [id]: catalog }));
        })
        .catch(() => {
          if (!cancelled)
            setErrors((previous) => ({ ...previous, [id]: "Model discovery failed" }));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [enabled, pendingKey]);

  const models = useMemo(() => {
    if (!enabled || !selected.length || selected.some((id) => !byAccount[id])) return [];
    return byAccount[selected[0]].filter((model) =>
      selected.every((id) => byAccount[id].some((entry) => entry.slug === model.slug)),
    );
  }, [enabled, selected.join(","), byAccount]);

  return {
    models,
    loading: enabled && pending.length > 0,
    hasError: selected.some((id) => Boolean(errors[id])),
  };
}
