/**
 * All money is stored and computed as INTEGER piasters (1 EGP = 100).
 * This avoids floating point errors. The UI converts at the edge only.
 */
export const toMinor = (egp: number) => Math.round(egp * 100);
export const toEgp = (minor: number) => minor / 100;

export function isMinor(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n);
}

/** Split a loan into a schedule of installments. The last installment absorbs the remainder. */
export function buildSchedule(total: number, installment: number, count: number): number[] {
  if (![total, installment, count].every(Number.isInteger) || total <= 0 || installment <= 0 || count <= 0) {
    throw new Error('invalid schedule input');
  }
  if (installment * count < total) throw new Error('installment * count is less than the loan amount');
  if (installment * (count - 1) >= total) throw new Error('too many installments for the loan amount');
  const out = Array<number>(count - 1).fill(installment);
  out.push(total - installment * (count - 1));
  return out;
}
