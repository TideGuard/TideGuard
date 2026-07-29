import {
  GITHUB_RELEASES_LATEST_API,
  GITHUB_RELEASES_URL,
  VERSION,
  compareSemVer,
  normalizeVersion,
} from "../version";

export const UPDATE_CHECK_CACHE_KEY = "admin:update-check";

/** How long a successful GitHub lookup is reused (rate-limit friendly). */
export const UPDATE_CHECK_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export type UpdateCheckSource = "cache" | "github" | "unavailable";

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string | null;
  latestTag: string | null;
  releaseUrl: string | null;
  releaseName: string | null;
  updateAvailable: boolean;
  checkedAt: number;
  cached: boolean;
  source: UpdateCheckSource;
  message: string;
  releasesUrl: string;
}

interface CachedRelease {
  checkedAt: number;
  latestTag: string | null;
  latestVersion: string | null;
  releaseUrl: string | null;
  releaseName: string | null;
  /** True when GitHub returned 404 (no releases published yet). */
  noReleases: boolean;
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function checkForUpdates(
  env: Env,
  options: { force?: boolean; fetch?: FetchLike; now?: number } = {},
): Promise<UpdateCheckResult> {
  const now = options.now ?? Date.now();
  const fetchImpl = options.fetch ?? fetch;
  const cached = await readCache(env);

  if (!options.force && cached && now - cached.checkedAt < UPDATE_CHECK_CACHE_TTL_MS) {
    return toResult(cached, { source: "cache", cached: true });
  }

  try {
    const fresh = await fetchLatestRelease(fetchImpl, now);
    await writeCache(env, fresh);
    return toResult(fresh, { source: "github", cached: false });
  } catch (error) {
    if (cached) {
      const reason = error instanceof Error ? error.message : "GitHub unreachable";
      const base = toResult(cached, { source: "cache", cached: true });
      return {
        ...base,
        message: `${base.message} (using cached check — ${reason})`,
      };
    }
    return {
      currentVersion: VERSION,
      latestVersion: null,
      latestTag: null,
      releaseUrl: null,
      releaseName: null,
      updateAvailable: false,
      checkedAt: now,
      cached: false,
      source: "unavailable",
      message:
        error instanceof Error
          ? `Could not reach GitHub: ${error.message}`
          : "Could not reach GitHub for update check",
      releasesUrl: GITHUB_RELEASES_URL,
    };
  }
}

async function fetchLatestRelease(fetchImpl: FetchLike, now: number): Promise<CachedRelease> {
  const response = await fetchImpl(GITHUB_RELEASES_LATEST_API, {
    method: "GET",
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "TideGuard-Worker",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (response.status === 404) {
    return {
      checkedAt: now,
      latestTag: null,
      latestVersion: null,
      releaseUrl: null,
      releaseName: null,
      noReleases: true,
    };
  }

  if (!response.ok) {
    throw new Error(`GitHub API HTTP ${response.status}`);
  }

  const body = (await response.json()) as {
    tag_name?: unknown;
    html_url?: unknown;
    name?: unknown;
    draft?: unknown;
  };

  const tag =
    typeof body.tag_name === "string" && body.tag_name.trim().length > 0
      ? body.tag_name.trim()
      : null;
  if (!tag || body.draft === true) {
    return {
      checkedAt: now,
      latestTag: null,
      latestVersion: null,
      releaseUrl: null,
      releaseName: null,
      noReleases: true,
    };
  }

  return {
    checkedAt: now,
    latestTag: tag,
    latestVersion: normalizeVersion(tag),
    releaseUrl: typeof body.html_url === "string" ? body.html_url : GITHUB_RELEASES_URL,
    releaseName: typeof body.name === "string" ? body.name : null,
    noReleases: false,
  };
}

function toResult(
  cached: CachedRelease,
  meta: { source: UpdateCheckSource; cached: boolean },
): UpdateCheckResult {
  if (cached.noReleases || !cached.latestVersion) {
    return {
      currentVersion: VERSION,
      latestVersion: null,
      latestTag: null,
      releaseUrl: null,
      releaseName: null,
      updateAvailable: false,
      checkedAt: cached.checkedAt,
      cached: meta.cached,
      source: meta.source,
      message: "No GitHub releases published yet — you are on the current package version.",
      releasesUrl: GITHUB_RELEASES_URL,
    };
  }

  const cmp = compareSemVer(VERSION, cached.latestVersion);
  let message: string;
  let updateAvailable = false;
  if (cmp < 0) {
    updateAvailable = true;
    message = `Update available: ${cached.latestTag ?? cached.latestVersion} (running ${VERSION}).`;
  } else if (cmp > 0) {
    message = `Running ${VERSION}, newer than latest release ${cached.latestTag ?? cached.latestVersion}.`;
  } else {
    message = `Up to date (v${VERSION}).`;
  }

  return {
    currentVersion: VERSION,
    latestVersion: cached.latestVersion,
    latestTag: cached.latestTag,
    releaseUrl: cached.releaseUrl,
    releaseName: cached.releaseName,
    updateAvailable,
    checkedAt: cached.checkedAt,
    cached: meta.cached,
    source: meta.source,
    message,
    releasesUrl: GITHUB_RELEASES_URL,
  };
}

async function readCache(env: Env): Promise<CachedRelease | null> {
  try {
    const raw = await env.CONFIG_KV.get(UPDATE_CHECK_CACHE_KEY, "json");
    if (!raw || typeof raw !== "object") return null;
    const obj = raw as Partial<CachedRelease>;
    if (typeof obj.checkedAt !== "number") return null;
    return {
      checkedAt: obj.checkedAt,
      latestTag: typeof obj.latestTag === "string" ? obj.latestTag : null,
      latestVersion: typeof obj.latestVersion === "string" ? obj.latestVersion : null,
      releaseUrl: typeof obj.releaseUrl === "string" ? obj.releaseUrl : null,
      releaseName: typeof obj.releaseName === "string" ? obj.releaseName : null,
      noReleases: obj.noReleases === true,
    };
  } catch {
    return null;
  }
}

async function writeCache(env: Env, value: CachedRelease): Promise<void> {
  await env.CONFIG_KV.put(UPDATE_CHECK_CACHE_KEY, JSON.stringify(value), {
    expirationTtl: Math.ceil(UPDATE_CHECK_CACHE_TTL_MS / 1000) * 2,
  });
}
