/**
 * IPv4 / IPv6 CIDR matching for office / staff queue bypass.
 */

const MAX_ENTRIES = 64;

export type IpVersion = 4 | 6;

export interface ParsedCidr {
  version: IpVersion;
  /** Network address as big-endian bytes. */
  network: Uint8Array;
  prefixLength: number;
  /** Original trimmed entry (for display / round-trip). */
  raw: string;
}

export function parseAllowlistText(text: string): { entries: string[]; errors: string[] } {
  const entries: string[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const line of text.split(/[\n,]+/)) {
    const raw = line.trim();
    if (!raw || raw.startsWith("#")) {
      continue;
    }
    const parsed = parseCidr(raw);
    if (!parsed) {
      errors.push(`Invalid IP or CIDR: ${raw}`);
      continue;
    }
    const key = parsed.raw.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    entries.push(parsed.raw);
    if (entries.length > MAX_ENTRIES) {
      errors.push(`At most ${MAX_ENTRIES} entries allowed`);
      break;
    }
  }

  return { entries, errors };
}

export function parseCidr(input: string): ParsedCidr | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const slash = trimmed.indexOf("/");
  const addrPart = slash === -1 ? trimmed : trimmed.slice(0, slash);
  const prefixPart = slash === -1 ? null : trimmed.slice(slash + 1);

  const ip = parseIp(addrPart);
  if (!ip) {
    return null;
  }

  const maxPrefix = ip.version === 4 ? 32 : 128;
  let prefixLength = maxPrefix;
  if (prefixPart !== null) {
    if (!/^\d+$/.test(prefixPart)) {
      return null;
    }
    prefixLength = Number(prefixPart);
    if (!Number.isInteger(prefixLength) || prefixLength < 0 || prefixLength > maxPrefix) {
      return null;
    }
  }

  const network = maskAddress(ip.bytes, prefixLength);
  const raw =
    prefixPart === null
      ? formatIp(ip.version, ip.bytes)
      : `${formatIp(ip.version, network)}/${prefixLength}`;

  return { version: ip.version, network, prefixLength, raw };
}

export function ipMatchesAllowlist(ip: string, entries: string[]): boolean {
  const client = parseIp(ip);
  if (!client) {
    return false;
  }

  for (const entry of entries) {
    const cidr = parseCidr(entry);
    if (!cidr || cidr.version !== client.version) {
      continue;
    }
    if (addressInNetwork(client.bytes, cidr.network, cidr.prefixLength)) {
      return true;
    }
  }
  return false;
}

function parseIp(value: string): { version: IpVersion; bytes: Uint8Array } | null {
  if (value.includes(":")) {
    const bytes = parseIpv6(value);
    return bytes ? { version: 6, bytes } : null;
  }
  const bytes = parseIpv4(value);
  return bytes ? { version: 4, bytes } : null;
}

function parseIpv4(value: string): Uint8Array | null {
  const parts = value.split(".");
  if (parts.length !== 4) {
    return null;
  }
  const bytes = new Uint8Array(4);
  for (let i = 0; i < 4; i += 1) {
    const part = parts[i]!;
    if (!/^\d+$/.test(part)) {
      return null;
    }
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) {
      return null;
    }
    // Reject octal-looking forms like 08 by requiring canonical decimal.
    if (String(n) !== part) {
      return null;
    }
    bytes[i] = n;
  }
  return bytes;
}

function parseIpv6(value: string): Uint8Array | null {
  // Handle IPv4-mapped tails (e.g. ::ffff:203.0.113.1).
  let input = value;
  const lastColon = input.lastIndexOf(":");
  if (lastColon >= 0 && input.includes(".")) {
    const v4 = parseIpv4(input.slice(lastColon + 1));
    if (!v4) {
      return null;
    }
    const hex = [...v4].map((b) => b.toString(16).padStart(2, "0"));
    input = `${input.slice(0, lastColon + 1)}${hex[0]}${hex[1]}:${hex[2]}${hex[3]}`;
  }

  if ((input.match(/::/g) ?? []).length > 1) {
    return null;
  }

  let head: string[];
  let tail: string[];
  if (input.includes("::")) {
    const halves = input.split("::");
    const h = halves[0] ?? "";
    const t = halves[1] ?? "";
    head = h === "" ? [] : h.split(":");
    tail = t === "" ? [] : t.split(":");
  } else {
    head = input.split(":");
    tail = [];
  }

  const parts = [...head, ...tail];
  if (parts.some((p) => p === "" || !/^[0-9a-fA-F]{1,4}$/.test(p))) {
    return null;
  }
  if (input.includes("::")) {
    if (head.length + tail.length > 8) {
      return null;
    }
  } else if (parts.length !== 8) {
    return null;
  }

  const words: number[] = [];
  for (const p of head) {
    words.push(parseInt(p, 16));
  }
  const missing = 8 - head.length - tail.length;
  for (let i = 0; i < missing; i += 1) {
    words.push(0);
  }
  for (const p of tail) {
    words.push(parseInt(p, 16));
  }
  if (words.length !== 8) {
    return null;
  }

  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i += 1) {
    bytes[i * 2] = (words[i]! >> 8) & 0xff;
    bytes[i * 2 + 1] = words[i]! & 0xff;
  }
  return bytes;
}

function maskAddress(bytes: Uint8Array, prefixLength: number): Uint8Array {
  const out = new Uint8Array(bytes.length);
  let remaining = prefixLength;
  for (let i = 0; i < bytes.length; i += 1) {
    if (remaining >= 8) {
      out[i] = bytes[i]!;
      remaining -= 8;
    } else if (remaining > 0) {
      const mask = 0xff << (8 - remaining);
      out[i] = bytes[i]! & mask;
      remaining = 0;
    } else {
      out[i] = 0;
    }
  }
  return out;
}

function addressInNetwork(address: Uint8Array, network: Uint8Array, prefixLength: number): boolean {
  if (address.length !== network.length) {
    return false;
  }
  const masked = maskAddress(address, prefixLength);
  for (let i = 0; i < masked.length; i += 1) {
    if (masked[i] !== network[i]) {
      return false;
    }
  }
  return true;
}

function formatIp(version: IpVersion, bytes: Uint8Array): string {
  if (version === 4) {
    return `${bytes[0]}.${bytes[1]}.${bytes[2]}.${bytes[3]}`;
  }
  const words: string[] = [];
  for (let i = 0; i < 8; i += 1) {
    words.push(((bytes[i * 2]! << 8) | bytes[i * 2 + 1]!).toString(16));
  }
  return words.join(":");
}
