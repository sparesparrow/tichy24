import { createHmac } from "node:crypto";

export const CHECKOUT_RATE_LIMIT_WINDOWS = [
  { scope: "checkout-10m", limit: 5, windowMs: 10 * 60 * 1000 },
  { scope: "checkout-1h", limit: 20, windowMs: 60 * 60 * 1000 },
] as const;

export function windowStartMs(nowMs: number, windowMs: number): number {
  return Math.floor(nowMs / windowMs) * windowMs;
}

/** Hash a client identifier with a secret; do not store raw IP addresses. */
export function rateLimitBucketKey(
  secret: string,
  clientIdentifier: string,
  scope: string,
  windowStart: number,
): string {
  return createHmac("sha256", secret)
    .update([scope, clientIdentifier, String(windowStart)].join("\0"))
    .digest("hex");
}

function validAddress(value: string | null): string | null {
  if (!value || value.length > 64) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || !/^[0-9a-f:.]+$/.test(normalized)) return null;
  return normalized;
}

/** Prefer platform IP metadata, falling back to the last proxy-appended XFF entry. */
export function clientIdentifierFromHeaders(headers: { get(name: string): string | null }): string {
  const direct = validAddress(headers.get("x-real-ip"));
  if (direct) return direct;

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const chain = forwarded.split(",").map((part) => part.trim());
    for (let i = chain.length - 1; i >= 0; i--) {
      const address = validAddress(chain[i]);
      if (address) return address;
    }
  }
  return "unknown-client";
}
