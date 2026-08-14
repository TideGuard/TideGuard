export const ROOM_RULES_KEY = "admin:room-rules";

export interface RoomRules {
  seoCrawlerBypass: boolean;
  cookieBypassName: string;
  headerBypassName: string;
  headerBypassValue: string;
  jsonMode: boolean;
  rejectWhenFull: boolean;
}

export const DEFAULT_ROOM_RULES: RoomRules = {
  seoCrawlerBypass: false,
  cookieBypassName: "",
  headerBypassName: "",
  headerBypassValue: "",
  jsonMode: false,
  rejectWhenFull: false,
};

function safeName(value: unknown): string {
  if (typeof value !== "string") return "";
  const name = value.trim().slice(0, 128);
  return /^[A-Za-z0-9_-]*$/.test(name) ? name : "";
}

export function parseRoomRules(raw: unknown): RoomRules {
  const input =
    raw && typeof raw === "object" ? (raw as Partial<Record<keyof RoomRules, unknown>>) : {};
  return {
    seoCrawlerBypass: input.seoCrawlerBypass === true,
    cookieBypassName: safeName(input.cookieBypassName),
    headerBypassName: safeName(input.headerBypassName),
    headerBypassValue:
      typeof input.headerBypassValue === "string" ? input.headerBypassValue.slice(0, 512) : "",
    jsonMode: input.jsonMode === true,
    rejectWhenFull: input.rejectWhenFull === true,
  };
}

export async function readRoomRules(env: Env): Promise<RoomRules> {
  try {
    return parseRoomRules(await env.CONFIG_KV.get(ROOM_RULES_KEY, "json"));
  } catch {
    return { ...DEFAULT_ROOM_RULES };
  }
}

export async function writeRoomRules(env: Env, raw: unknown): Promise<RoomRules> {
  const rules = parseRoomRules(raw);
  await env.CONFIG_KV.put(ROOM_RULES_KEY, JSON.stringify(rules));
  return rules;
}

export async function clearRoomRules(env: Env): Promise<void> {
  await env.CONFIG_KV.delete(ROOM_RULES_KEY);
}

const CRAWLER_UA = /\b(googlebot|bingbot|duckduckbot|baiduspider|yandexbot|slurp)\b/i;

export function evaluateRoomRuleBypass(
  request: Request,
  rules: RoomRules,
): "seo_crawler" | "cookie" | "header" | null {
  if (rules.seoCrawlerBypass && CRAWLER_UA.test(request.headers.get("user-agent") ?? "")) {
    return "seo_crawler";
  }
  if (rules.cookieBypassName) {
    const cookies = request.headers.get("cookie") ?? "";
    const found = cookies
      .split(";")
      .some((part) => part.trim().split("=", 1)[0] === rules.cookieBypassName);
    if (found) return "cookie";
  }
  if (
    rules.headerBypassName &&
    request.headers.get(rules.headerBypassName) === rules.headerBypassValue
  ) {
    return "header";
  }
  return null;
}
