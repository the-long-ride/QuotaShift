import { useMemo } from "react";
import type { CodexTierModelGroup } from "../../../utils/codex/codex-models";

export function useCodexPoolModelFilter(tierGroups: CodexTierModelGroup[], modelQuery: string) {
  const filteredTierGroups = useMemo(() => {
    const query = modelQuery.trim().toLowerCase();
    return tierGroups
      .map((g) => ({
        ...g,
        models: g.models.filter(
          ({ model: o }: { model: any }) =>
            !query ||
            o.id.toLowerCase().includes(query) ||
            o.displayName.toLowerCase().includes(query),
        ),
      }))
      .filter((g) => g.models.length > 0);
  }, [tierGroups, modelQuery]);

  const flatOptions = useMemo(
    () =>
      filteredTierGroups.flatMap((g) =>
        g.models.map((e: any) => ({ tier: g.tier, accountCount: g.accountCount, ...e })),
      ),
    [filteredTierGroups],
  );

  return { filteredTierGroups, flatOptions };
}
