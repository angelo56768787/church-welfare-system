import type { ClientSession } from 'mongoose';
import { Installment, Repayment } from '../models/index.js';

export type InstallmentStatus = 'paid' | 'pending' | 'partial' | 'overdue';

/** Paid amount per installment, derived from repayment allocations (single source of truth). */
export async function paidByInstallment(match: Record<string, unknown> = {}, session?: ClientSession) {
  const rows = await Repayment.aggregate([
    { $match: match },
    { $unwind: '$allocations' },
    { $group: { _id: '$allocations.installment', paid: { $sum: '$allocations.amount' } } },
  ]).session(session ?? null);
  return new Map<string, number>(rows.map((r: any) => [String(r._id), r.paid as number]));
}

export function installmentStatus(amount: number, paid: number, dueDate: Date, now = new Date()): InstallmentStatus {
  if (paid >= amount) return 'paid';
  if (dueDate.getTime() < startOfDay(now).getTime()) return 'overdue';
  return paid > 0 ? 'partial' : 'pending';
}
export const startOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export async function loanInstallments(loanId: unknown, session?: ClientSession) {
  const list: any[] = await Installment.find({ loan: loanId }).sort({ number: 1 }).session(session ?? null).lean();
  const paidMap = await paidByInstallment({ loan: list[0]?.loan ?? loanId }, session);
  return list.map((i) => {
    const paid = paidMap.get(String(i._id)) ?? 0;
    return { ...i, paid, remaining: i.amount - paid, status: installmentStatus(i.amount, paid, i.dueDate) };
  });
}

export async function loanRepaidTotal(loanId: unknown, session?: ClientSession) {
  const r = await Repayment.aggregate([{ $match: { loan: loanId } }, { $group: { _id: null, t: { $sum: '$amount' } } }]).session(session ?? null);
  return (r[0]?.t as number) ?? 0;
}

/** Allocate an amount to the oldest unpaid installments first. */
export function allocate(installments: { _id: unknown; remaining: number }[], amount: number) {
  let left = amount;
  const out: { installment: unknown; amount: number }[] = [];
  for (const i of installments) {
    if (left <= 0) break;
    if (i.remaining <= 0) continue;
    const take = Math.min(i.remaining, left);
    out.push({ installment: i._id, amount: take });
    left -= take;
  }
  if (left !== 0) throw new Error('allocation exceeds outstanding balance');
  return out;
}
