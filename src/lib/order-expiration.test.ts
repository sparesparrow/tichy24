import { describe, expect, it } from "vitest";
import {
  PREPAYMENT_EXPIRATION_DAYS,
  isExpiredUnpaidPrepaymentOrder,
  prepaymentCutoff,
} from "./order-expiration";

const now = new Date("2026-10-14T12:00:00.000Z");

describe("prepayment expiration", () => {
  it("expires a NEW prepayment order exactly at the 10-day deadline", () => {
    const createdAt = prepaymentCutoff(now);
    expect(isExpiredUnpaidPrepaymentOrder({
      status: "NEW",
      paymentMethod: "PREPAYMENT",
      createdAt,
    }, now)).toBe(true);
    expect(PREPAYMENT_EXPIRATION_DAYS).toBe(10);
  });

  it("does not expire an order one millisecond before the deadline", () => {
    const createdAt = new Date(prepaymentCutoff(now).getTime() + 1);
    expect(isExpiredUnpaidPrepaymentOrder({
      status: "NEW",
      paymentMethod: "PREPAYMENT",
      createdAt,
    }, now)).toBe(false);
  });

  it.each(["PAID", "FULFILLED", "CANCELLED"])("does not expire an order in %s status", (status) => {
    expect(isExpiredUnpaidPrepaymentOrder({
      status,
      paymentMethod: "PREPAYMENT",
      createdAt: new Date("2020-01-01T00:00:00.000Z"),
    }, now)).toBe(false);
  });

  it("does not expire a cash-on-pickup order", () => {
    expect(isExpiredUnpaidPrepaymentOrder({
      status: "NEW",
      paymentMethod: "CASH_ON_PICKUP",
      createdAt: new Date("2020-01-01T00:00:00.000Z"),
    }, now)).toBe(false);
  });
});
