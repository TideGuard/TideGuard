/**
 * Visitor country from Cloudflare IP Geolocation (CF-IPCountry).
 * Requires the zone setting ip_geolocation = on.
 */

/** ISO 3166-1 alpha-2 plus Cloudflare unknowns. */
const CODE_RE = /^[A-Z]{2}$/;

export function clientCountryCode(request: Request): string | null {
  const raw = request.headers.get("cf-ipcountry")?.trim().toUpperCase();
  if (!raw || !CODE_RE.test(raw)) {
    return null;
  }
  return raw;
}

export function parseCountryCodes(text: string): { countries: string[]; errors: string[] } {
  const countries: string[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const part of text.split(/[\s,;]+/)) {
    const raw = part.trim().toUpperCase();
    if (!raw || raw.startsWith("#")) {
      continue;
    }
    if (!CODE_RE.test(raw)) {
      errors.push(`Invalid country code: ${part.trim()}`);
      continue;
    }
    if (seen.has(raw)) {
      continue;
    }
    seen.add(raw);
    countries.push(raw);
    if (countries.length > 100) {
      errors.push("At most 100 country codes allowed");
      break;
    }
  }

  return { countries, errors };
}

export function isCountryBlocked(
  country: string | null,
  blocked: string[],
): boolean {
  if (!country || blocked.length === 0) {
    return false;
  }
  return blocked.includes(country);
}
