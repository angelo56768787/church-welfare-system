import type { ClientSession } from 'mongoose';
import { AssistanceRecord, Beneficiary, FinancialTransaction, Installment, Loan } from '../models/index.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { nextCode } from '../lib/codes.js';
import { withTx } from '../lib/tx.js';
import { audit, Actor } from '../lib/audit.js';
import { paidByInstallment } from './loanCore.js';
import { recordRepayment } from './loanService.js';

/**
 * Find the loan installment (if any) due in `period` for this beneficiary on an ACTIVE loan
 * that still has an unpaid remainder. Only the installment due in that period is deducted.
 */
export async function applicableInstallment(beneficiaryId: unknown, period: string, session?: ClientSession) {
  const activeLoans = await Loan.find({ beneficiary: beneficiaryId, status: 'active' }).select('_id').session(session ?? null).lean();
  if (!activeLoans.length) return null;
  const insts: any[] = await Installment.find({ beneficiary: beneficiaryId, period, loan: { $in: activeLoans.map((l: any) => l._id) } })
    .sort({ dueDate: 1 }).session(session ?? null).lean();
  if (!insts.length) return null;
  const paid = await paidByInstallment({ loan: { $in: activeLoans.map((l: any) => l._id) } }, session);
  for (const i of insts) {
    const remaining = i.amount - (paid.get(String(i._id)) ?? 0);
    if (remaining > 0) return { installment: i, remaining };
  }
  return null;
}

/** Deduction is capped at the original assistance so net is never negative (rule documented in README). */
export function computeDeduction(original: number, remaining: number | undefined) {
  return remaining && remaining > 0 ? Math.min(original, remaining) : 0;
}

export async function createAssistance(input: { beneficiary: string; period: string; originalAmount?: number; notes?: string }, actor: Actor, bulkSession?: ClientSession) {
  const run = async (session: ClientSession) => {
    const ben: any = await Beneficiary.findById(input.beneficiary).session(session);
    if (!ben) throw notFound('المستفيد');
    if (ben.status !== 'active') throw badRequest('المستفيد غير نشط');
    const original = input.originalAmount ?? ben.monthlyAssistance;
    if (!original || original <= 0) throw badRequest('لا توجد مساعدة شهرية محددة لهذا المستفيد');
    const exists = await AssistanceRecord.exists({ beneficiary: ben._id, period: input.period }).session(session);
    if (exists) throw conflict('توجد مساعدة مسجلة لهذا المستفيد في هذه الفترة');
    const app = await applicableInstallment(ben._id, input.period, session);
    const deduction = computeDeduction(original, app?.remaining);
    const [rec]: any[] = await AssistanceRecord.create([{
      beneficiary: ben._id, church: ben.church, period: input.period, originalAmount: original,
      deductionAmount: deduction, installment: deduction > 0 ? app!.installment._id : undefined, notes: input.notes ?? '',
    }], { session });
    await audit(actor, 'create', 'AssistanceRecord', rec._id, `إنشاء مساعدة ${input.period} للمستفيد ${ben.fullName}`, { original, deduction }, session);
    return rec;
  };
  return bulkSession ? run(bulkSession) : withTx(run);
}

/** Generate monthly records for every active beneficiary with recurring assistance who has none for the period. */
export async function generateMonth(period: string, actor: Actor, churchId?: string) {
  const filter: any = { status: 'active', monthlyAssistance: { $gt: 0 } };
  if (churchId) filter.church = churchId;
  const bens: any[] = await Beneficiary.find(filter).select('_id').lean();
  let created = 0, skipped = 0;
  for (const b of bens) {
    try {
      await createAssistance({ beneficiary: String(b._id), period }, actor);
      created++;
    } catch (e: any) {
      if (e?.status === 409) skipped++; else throw e;
    }
  }
  return { created, skipped, total: bens.length };
}

/** Mark paid: re-checks the installment balance, records the deduction as a repayment, locks the record. */
export async function markPaid(id: string, paymentDate: Date, actor: Actor) {
  return withTx(async (session) => {
    const rec: any = await AssistanceRecord.findById(id).session(session);
    if (!rec) throw notFound('سجل المساعدة');
    if (rec.paymentStatus === 'paid') throw conflict('تم صرف هذه المساعدة من قبل');
    let deduction = 0;
    let repaymentId: unknown;
    if (rec.installment) {
      const inst: any = await Installment.findById(rec.installment).session(session).lean();
      const paid = (await paidByInstallment({ loan: inst.loan }, session)).get(String(inst._id)) ?? 0;
      const loan: any = await Loan.findById(inst.loan).session(session).lean();
      const remaining = loan.status === 'active' ? inst.amount - paid : 0;
      deduction = computeDeduction(rec.originalAmount, remaining);
      if (deduction > 0) {
        const r = await recordRepayment({ loan: String(inst.loan), amount: deduction, date: paymentDate, source: 'assistance_deduction', assistanceRecord: rec._id, notes: `خصم قسط من مساعدة ${rec.period}` }, actor, session);
        repaymentId = r.repayment._id;
      }
    }
    const changed = deduction !== rec.deductionAmount;
    rec.deductionAmount = deduction;
    if (deduction === 0) rec.installment = undefined;
    rec.paymentStatus = 'paid';
    rec.paymentDate = paymentDate;
    await rec.save({ session });
    const net = rec.originalAmount - deduction;
    if (net > 0) {
      await FinancialTransaction.create([{
        reference: await nextCode('TX', 'tx', 6, session), type: 'assistance_payment', direction: 'out', amount: net, date: paymentDate,
        beneficiary: rec.beneficiary, church: rec.church, assistanceRecord: rec._id, recordedBy: actor.id,
      }], { session });
    }
    await audit(actor, 'pay', 'AssistanceRecord', rec._id, `صرف مساعدة ${rec.period} (صافي ${net / 100} ج.م)`, { original: rec.originalAmount, deduction, net, deductionAdjusted: changed, repaymentId }, session);
    return rec;
  });
}

export async function deletePending(id: string, actor: Actor) {
  const rec: any = await AssistanceRecord.findById(id);
  if (!rec) throw notFound('سجل المساعدة');
  if (rec.paymentStatus === 'paid') throw badRequest('لا يمكن حذف مساعدة تم صرفها');
  await rec.deleteOne();
  await audit(actor, 'delete', 'AssistanceRecord', id, `حذف سجل مساعدة غير مصروف ${rec.period}`, { original: rec.originalAmount });
}
