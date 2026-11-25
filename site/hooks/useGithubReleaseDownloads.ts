import { useEffect, useState } from "react";

const RELEASES_API = "https://api.github.com/repos/the-long-ride/QuotaShift/releases";
const SHIELDS_URL = "https://img.shields.io/github/downloads/the-long-ride/QuotaShift/total.json";
const CACHE_KEY = "quotashift_gh_downloads_v1";
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_PAGES = 5;
const PER_PAGE = 100;

type ReleaseLike = {
  draft?: unknown;
  tag_name?: unknown;
  assets?: Array<{ download_count?: unknown }>;
};

export interface GithubReleaseDownloadsState {
  formattedCount: string | null;
  rawCount: number | null;
  latestTag: string | null;
  loading: boolean;
}

type CachedDownloads = Omit<GithubReleaseDownloadsState, "loading"> & { fetchedAt: number };

const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n);
const toState = (c: CachedDownloads): GithubReleaseDownloadsState => ({
  formattedCount: c.formattedCount,
  rawCount: c.rawCount,
  latestTag: c.latestTag,
  loading: false,
});

export function sumReleaseAssetDownloads(releases: unknown): number | null {
  if (!Array.isArray(releases)) return null;
  let total = 0;
  for (const item of releases) {
    const rel = item as ReleaseLike | null;
    if (!rel || typeof rel !== "object" || rel.draft === true || !Array.isArray(rel.assets))
      continue;
    for (const asset of rel.assets) {
      const n = asset?.download_count;
      if (typeof n === "number" && Number.isFinite(n) && n >= 0) total += n;
    }
  }
  return total;
}

function readCache(): CachedDownloads | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    const p = raw ? (JSON.parse(raw) as Partial<CachedDownloads>) : null;
    if (!p || typeof p.fetchedAt !== "number" || Date.now() - p.fetchedAt > CACHE_TTL_MS)
      return null;
    if (typeof p.formattedCount !== "string" || !p.formattedCount) return null;
    return {
      formattedCount: p.formattedCount,
      rawCount: typeof p.rawCount === "number" ? p.rawCount : null,
      latestTag: typeof p.latestTag === "string" ? p.latestTag : null,
      fetchedAt: p.fetchedAt,
    };
  } catch {
    return null;
  }
}

async function fetchReleasesTotal(signal: AbortSignal): Promise<CachedDownloads | null> {
  const all: ReleaseLike[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const res = await fetch(`${RELEASES_API}?per_page=${PER_PAGE}&page=${page}`, {
      headers: { Accept: "application/vnd.github+json" },
      signal,
    });
    if (!res.ok) return null;
    const items: unknown = await res.json();
    if (!Array.isArray(items)) return null;
    all.push(...(items as ReleaseLike[]));
    if (items.length < PER_PAGE) break;
  }
  const total = sumReleaseAssetDownloads(all);
  if (total === null) return null;
  const latest = all.find((r) => r?.draft !== true && typeof r?.tag_name === "string");
  return {
    formattedCount: fmt(total),
    rawCount: total,
    latestTag: typeof latest?.tag_name === "string" ? latest.tag_name : null,
    fetchedAt: Date.now(),
  };
}

async function fetchShieldsFallback(signal: AbortSignal): Promise<CachedDownloads | null> {
  const res = await fetch(SHIELDS_URL, { signal });
  if (!res.ok) return null;
  const data = (await res.json()) as { value?: unknown; message?: unknown };
  const label = String(data.value || data.message || "").trim();
  if (!label) return null;
  const digits = label.replace(/,/g, "");
  const rawCount = /^\d+$/.test(digits) ? Number.parseInt(digits, 10) : null;
  return {
    formattedCount: rawCount !== null ? fmt(rawCount) : label,
    rawCount,
    latestTag: null,
    fetchedAt: Date.now(),
  };
}

export function useGithubReleaseDownloads(): GithubReleaseDownloadsState {
  const [state, setState] = useState<GithubReleaseDownloadsState>(() => {
    const cached = readCache();
    return cached
      ? toState(cached)
      : { formattedCount: null, rawCount: null, latestTag: null, loading: true };
  });

  useEffect(() => {
    if (!state.loading) return;
    const controller = new AbortController();
    let active = true;
    (async () => {
      let res = await fetchReleasesTotal(controller.signal).catch(() => null);
      if (!res && !controller.signal.aborted) {
        res = await fetchShieldsFallback(controller.signal).catch(() => null);
      }
      if (!active || controller.signal.aborted) return;
      if (!res) return setState((prev) => ({ ...prev, loading: false }));
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
