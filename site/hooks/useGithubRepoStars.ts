import { useEffect, useState } from "react";

const REPO_API = "https://api.github.com/repos/the-long-ride/QuotaShift";
const SHIELDS_STARS_URL = "https://img.shields.io/github/stars/the-long-ride/QuotaShift.json";
const CACHE_KEY = "quotashift_gh_stars_v1";
const CACHE_TTL_MS = 10 * 60 * 1000;

export interface GithubRepoStarsState {
  formattedCount: string | null;
  rawCount: number | null;
  loading: boolean;
}

type CachedStars = Omit<GithubRepoStarsState, "loading"> & { fetchedAt: number };

const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n);

const toState = (c: CachedStars): GithubRepoStarsState => ({
  formattedCount: c.formattedCount,
  rawCount: c.rawCount,
  loading: false,
});

export function parseRepoStargazersCount(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const count = (payload as { stargazers_count?: unknown }).stargazers_count;
  return typeof count === "number" && Number.isFinite(count) && count >= 0 ? count : null;
}

function readCache(): CachedStars | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    const p = raw ? (JSON.parse(raw) as Partial<CachedStars>) : null;
    if (!p || typeof p.fetchedAt !== "number" || Date.now() - p.fetchedAt > CACHE_TTL_MS) {
      return null;
    }
    if (typeof p.formattedCount !== "string" || p.formattedCount.length === 0) return null;
    return {
      formattedCount: p.formattedCount,
      rawCount: typeof p.rawCount === "number" ? p.rawCount : null,
      fetchedAt: p.fetchedAt,
    };
  } catch {
    return null;
  }
}

async function fetchRepoStars(signal: AbortSignal): Promise<CachedStars | null> {
  const res = await fetch(REPO_API, {
    headers: { Accept: "application/vnd.github+json" },
    signal,
  });
  if (!res.ok) return null;
  const payload: unknown = await res.json();
  const count = parseRepoStargazersCount(payload);
  if (count === null) return null;
  return {
    formattedCount: fmt(count),
    rawCount: count,
    fetchedAt: Date.now(),
  };
}

async function fetchShieldsFallback(signal: AbortSignal): Promise<CachedStars | null> {
  const res = await fetch(SHIELDS_STARS_URL, { signal });
  if (!res.ok) return null;
  const data = (await res.json()) as { value?: unknown; message?: unknown };
  const label = String(data.value ?? data.message ?? "").trim();
  if (!/^\d[\d,.]*[kKmM]?$/.test(label)) return null;
  const digits = label.replace(/,/g, "");
  const rawCount = /^\d+$/.test(digits) ? Number.parseInt(digits, 10) : null;
  return {
    formattedCount: rawCount !== null ? fmt(rawCount) : label,
    rawCount,
    fetchedAt: Date.now(),
  };
}

export function useGithubRepoStars(): GithubRepoStarsState {
  const [state, setState] = useState<GithubRepoStarsState>(() => {
    const cached = readCache();
    return cached ? toState(cached) : { formattedCount: null, rawCount: null, loading: true };
  });

  useEffect(() => {
    if (!state.loading) return;
    const controller = new AbortController();
    let active = true;

    (async () => {
      let res = await fetchRepoStars(controller.signal).catch(() => null);
      if (!res && !controller.signal.aborted) {
        res = await fetchShieldsFallback(controller.signal).catch(() => null);
      }
      if (!active || controller.signal.aborted) return;
      if (!res) {
        setState({ formattedCount: null, rawCount: null, loading: false });
        return;
      }
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(res));
      } catch {
        // Ignore storage errors.
      }
      setState(toState(res));
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [state.loading]);

  return state;
}
