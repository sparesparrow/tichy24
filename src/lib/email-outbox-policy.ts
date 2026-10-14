export const MAX_EMAIL_ATTEMPTS = 8;
export const EMAIL_BATCH_SIZE = 10;
export const EMAIL_LOCK_TIMEOUT_MS = 10 * 60 * 1000;
export const EMAIL_REQUEST_TIMEOUT_MS = 10 * 1000;

export function emailRetryDelayMs(attempts: number): number {
  return Math.min(5 * 60 * 1000 * 2 ** Math.max(0, attempts - 1), 6 * 60 * 60 * 1000);
}

export function isRetryableEmailFailure(status: number, errorName?: string): boolean {
  if (status === 429 || status >= 500) return true;
  return status === 409 && errorName === "concurrent_idempotent_requests";
}
