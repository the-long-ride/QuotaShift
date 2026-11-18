import { useEffect, useState } from "react";
import {
  GITHUB_REPO_API_URL,
  loadCachedStarCount,
  saveCachedStarCount,
} from "../../utils/common/support-prompt";

export function useGithubStarCount(enabled: boolean): number | null {
  const [starCount, setStarCount] = useState<number | null>(() => {
    const cached = loadCachedStarCount();
    return cached ? cached.count : null;
  });

  useEffect(() => {
    if (!enabled) return;
    const cached = loadCachedStarCount();
    if (cached) {
      setStarCount(cached.count);
      if (cached.isFresh) return;
    }

    let cancelled = false;
    void fetch(GITHUB_REPO_API_URL, {
      headers: { Accept: "application/vnd.github+json" },
    })
      .then(async (res) => {
        if (!res.ok) return null;
        const payload = (await res.json()) as { stargazers_count?: unknown };
        return typeof payload.stargazers_count === "number" &&
          Number.isFinite(payload.stargazers_count) &&
          payload.stargazers_count >= 0
          ? Math.floor(payload.stargazers_count)
          : null;
      })
      .then((count) => {
        if (cancelled || count === null) return;
        setStarCount(count);
        saveCachedStarCount(count);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return starCount;
}
