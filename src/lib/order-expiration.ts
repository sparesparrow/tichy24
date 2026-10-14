/** Domena expirace objednavek Vorkasse bez zavislosti na databazi. */

export const PREPAYMENT_EXPIRATION_DAYS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Okamzik, pred kterym uz uplynula lhuta pro platbu predem. */
export function prepaymentCutoff(now: Date): Date {
  return new Date(now.getTime() - PREPAYMENT_EXPIRATION_DAYS * DAY_MS);
}

export interface ExpirablePrepaymentOrder {
  status: string;
  paymentMethod: string;
  createdAt: Date;
}

/**
 * Lhuta konci presne po 10 dnech od vytvoreni. Stav a metoda se kontroluji
 * i pri filtrovani kandidatu; pred samotnym stornem se podminky overi znovu v DB.
 */
export function isExpiredUnpaidPrepaymentOrder(
  order: ExpirablePrepaymentOrder,
  now: Date,
): boolean {
  return (
    order.status === "NEW" &&
    order.paymentMethod === "PREPAYMENT" &&
    order.createdAt.getTime() <= prepaymentCutoff(now).getTime()
  );
}
