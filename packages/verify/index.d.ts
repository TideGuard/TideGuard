export interface AccessTokenClaims {
  sub: string;
  queue: string;
  exp: number;
  iat: number;
  epoch?: number;
}

export class TokenError extends Error {
  readonly code: "invalid_token" | "expired_token";
  constructor(code: "invalid_token" | "expired_token", message: string);
}

export function textEncode(value: string): Uint8Array;
export function textDecode(value: Uint8Array): string;
export function bytesToBase64Url(bytes: Uint8Array): string;
export function base64UrlToBytes(value: string): Uint8Array;
export function encodeJson(value: unknown): string;
export function decodeJson<T>(value: string): T;
export function hmacSign(secret: string, payload: string): Promise<string>;
export function timingSafeEqual(a: string, b: string): Promise<boolean>;

export function signAccessToken(claims: AccessTokenClaims, secret: string): Promise<string>;
export function verifyAccessToken(
  token: string,
  secret: string,
  options?: { nowSeconds?: number; expectedQueue?: string; expectedEpoch?: number },
): Promise<AccessTokenClaims>;
export function buildAdmissionClaims(input: {
  visitorId: string;
  queue: string;
  tokenTTLSeconds: number;
  epoch?: number;
  nowMs?: number;
}): AccessTokenClaims;
