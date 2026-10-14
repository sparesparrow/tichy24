import { describe, expect, it } from "vitest";
import { MAX_EMAIL_ATTEMPTS, emailRetryDelayMs, isRetryableEmailFailure } from "./email-outbox-policy";

describe("email retry policy", () => {
  it("uses exponential backoff capped at six hours", () => {
    expect(emailRetryDelayMs(1)).toBe(300000);
    expect(emailRetryDelayMs(2)).toBe(600000);
    expect(emailRetryDelayMs(4)).toBe(2400000);
    expect(emailRetryDelayMs(8)).toBe(21600000);
    expect(MAX_EMAIL_ATTEMPTS).toBe(8);
  });
  it.each([429, 500, 502, 503])("retries transient HTTP status %i", (status) => {
    expect(isRetryableEmailFailure(status)).toBe(true);
  });
  it("retries concurrent idempotency conflicts but not invalid requests", () => {
    expect(isRetryableEmailFailure(409, "concurrent_idempotent_requests")).toBe(true);
    expect(isRetryableEmailFailure(400, "invalid_idempotency_key")).toBe(false);
    expect(isRetryableEmailFailure(409, "invalid_idempotent_request")).toBe(false);
  });
});
