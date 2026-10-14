import { describe, expect, it } from "vitest";
import {
  CHECKOUT_RATE_LIMIT_WINDOWS,
  clientIdentifierFromHeaders,
  rateLimitBucketKey,
  windowStartMs,
} from "./rate-limit-policy";

describe("checkout rate-limit policy", () => {
  it("aligns requests to fixed time windows", () => {
    expect(windowStartMs(599_999, 600_000)).toBe(0);
    expect(windowStartMs(600_000, 600_000)).toBe(600_000);
    expect(CHECKOUT_RATE_LIMIT_WINDOWS.map((x) => x.limit)).toEqual([5, 20]);
  });

  it("hashes IP identifiers and scopes keys by window", () => {
    const key = rateLimitBucketKey("secret", "203.0.113.5", "checkout-10m", 0);
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(key).not.toContain("203.0.113.5");
    expect(rateLimitBucketKey("secret", "203.0.113.5", "checkout-10m", 0)).toBe(key);
    expect(rateLimitBucketKey("secret", "203.0.113.5", "checkout-1h", 0)).not.toBe(key);
    expect(rateLimitBucketKey("secret", "203.0.113.5", "checkout-10m", 600_000)).not.toBe(key);
    expect(rateLimitBucketKey("different", "203.0.113.5", "checkout-10m", 0)).not.toBe(key);
  });

  it("prefers the platform-provided real IP", () => {
    const values = new Map([
      ["x-real-ip", "203.0.113.7"],
      ["x-forwarded-for", "198.51.100.1, 203.0.113.8"],
    ]);
    expect(clientIdentifierFromHeaders({ get: (key) => values.get(key) ?? null })).toBe("203.0.113.7");
  });

  it("uses the last proxy-appended address from X-Forwarded-For when needed", () => {
    const values = new Map([["x-forwarded-for", "198.51.100.1, 203.0.113.8"]]);
    expect(clientIdentifierFromHeaders({ get: (key) => values.get(key) ?? null })).toBe("203.0.113.8");
  });

  it("fails closed when proxy metadata is missing or malformed", () => {
    expect(clientIdentifierFromHeaders({ get: () => null })).toBe("unknown-client");
    const values = new Map([["x-real-ip", "not-an-ip"]]);
    expect(clientIdentifierFromHeaders({ get: (key) => values.get(key) ?? null })).toBe("unknown-client");
  });
});
