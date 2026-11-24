import mongoose, { ClientSession } from 'mongoose';
import { Beneficiary, FinancialTransaction, Installment, Loan, Repayment, SystemSetting } from '../models/index.js';
import { AppError, badRequest, conflict, notFound } from '../lib/errors.js';
import { buildSchedule } from '../lib/money.js';
import { addMonths, periodOf } from '../lib/period.js';
import { nextCode } from '../lib/codes.js';
import { withTx } from '../lib/tx.js';
import { audit, Actor } from '../lib/audit.js';
import { allocate, loanInstallments, loanRepaidTotal } from './loanCore.js';

export async function firstInstallmentOffset(session?: ClientSession) {
  const s: any = await SystemSetting.findById('firstInstallmentOffsetMonths').session(session ?? null).lean();
  return typeof s?.value === 'number' ? s.value : 1;
}

export async function createLoan(
  input: { beneficiary: string; amount: number; loanDate: Date; installmentAmount: number; installmentsCount: number; notes?: string },
  actor: Actor,
) {
  let schedule: number[];
  try {
    schedule = buildSchedule(input.amount, input.installmentAmount, input.installmentsCount);
  } catch (e: any) {
    throw badRequest('جدول الأقساط غير صالح: قيمة القسط × عدد الأقساط يجب أن تغطي مبلغ القرض ولا تتجاوزه بقسط كامل');
  }
  return withTx(async (session) => {
    const ben: any = await Beneficiary.findById(input.beneficiary).session(session);
    if (!ben) throw notFound('المستفيد');
    if (ben.status !== 'active') throw badRequest('لا يمكن إنشاء قرض لمستفيد غير نشط');
    const offset = await firstInstallmentOffset(session);
    const reference = await nextCode('LN', 'loan', 5, session);
    const [loan]: any[] = await Loan.create([{ ...input, reference, church: ben.church }], { session });
    await Installment.create(
      schedule.map((amount, idx) => {
        const dueDate = addMonths(input.loanDate, offset + idx);
        return { loan: loan._id, beneficiary: ben._id, number: idx + 1, dueDate, period: periodOf(dueDate), amount };
      }),
      { session, ordered: true },
    );
    await FinancialTransaction.create([{
      reference: await nextCode('TX', 'tx', 6, session), type: 'loan_disbursement', direction: 'out', amount: input.amount,
      date: input.loanDate, beneficiary: ben._id, church: ben.church, loan: loan._id, recordedBy: actor.id,
    }], { session });
    await audit(actor, 'create', 'Loan', loan._id, `إنشاء قرض ${reference} للمستفيد ${ben.fullName}`, { amount: input.amount, installments: input.installmentsCount }, session);
    return loan;
  });
}

interface RepayInput {
  loan: string; amount: number; date: Date; reference?: string; notes?: string; idempotencyKey?: string;
  source?: 'cash' | 'assistance_deduction'; assistanceRecord?: unknown;
}

/** Records a repayment inside an existing transaction. Used by cash repayments and assistance deductions. */
export async function recordRepayment(input: RepayInput, actor: Actor | undefined, session: ClientSession) {
  const loan: any = await Loan.findById(input.loan).session(session);
  if (!loan) throw notFound('القرض');
  if (loan.status === 'cancelled') throw badRequest('القرض ملغي');
  if (loan.status === 'completed') throw badRequest('القرض مسدد بالكامل');
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw badRequest('مبلغ السداد غير صالح');
  const repaid = await loanRepaidTotal(loan._id, session);
  const outstanding = loan.amount - repaid;
  if (input.amount > outstanding) throw badRequest('مبلغ السداد أكبر من الرصيد المتبقي على القرض');
  const insts = await loanInstallments(loan._id, session);
  const allocations = allocate(insts as any, input.amount);
  const source = input.source ?? 'cash';
  const reference = input.reference?.trim() || (await nextCode('RP', 'repayment', 6, session));
  const [rep]: any[] = await Repayment.create([{
    loan: loan._id, beneficiary: loan.beneficiary, church: loan.church, amount: input.amount, date: input.date, reference, source,
    assistanceRecord: input.assistanceRecord, idempotencyKey: input.idempotencyKey, allocations, notes: input.notes ?? '', recordedBy: actor?.id,
  }], { session });
  await FinancialTransaction.create([{
    reference: await nextCode('TX', 'tx', 6, session), type: source === 'cash' ? 'repayment' : 'assistance_deduction',
    direction: source === 'cash' ? 'in' : 'offset', amount: input.amount, date: input.date, beneficiary: loan.beneficiary,
    church: loan.church, loan: loan._id, repayment: rep._id, assistanceRecord: input.assistanceRecord as any, recordedBy: actor?.id,
  }], { session });
  if (outstanding - input.amount === 0) await Loan.updateOne({ _id: loan._id }, { status: 'completed' }, { session });
  return { repayment: rep, remaining: outstanding - input.amount };
}

export async function createCashRepayment(input: RepayInput, actor: Actor) {
  if (input.idempotencyKey) {
    const dup: any = await Repayment.findOne({ idempotencyKey: input.idempotencyKey }).lean();
    if (dup) return { repayment: dup, duplicate: true };
  }
  try {
    const out = await withTx(async (session) => {
      const r = await recordRepayment({ ...input, source: 'cash' }, actor, session);
      await audit(actor, 'create', 'Repayment', r.repayment._id, `تسجيل سداد ${r.repayment.reference} بقيمة ${input.amount / 100} ج.م`, { loan: input.loan, amount: input.amount }, session);
      return r;
    });
    return { ...out, duplicate: false };
  } catch (e: any) {
    if (e?.code === 11000 || e?.errorResponse?.code === 11000) {
      if (input.idempotencyKey) {
        const dup: any = await Repayment.findOne({ idempotencyKey: input.idempotencyKey }).lean();
        if (dup) return { repayment: dup, duplicate: true };
      }
      throw conflict('رقم المعاملة مستخدم من قبل');
    }
    throw e;
  }
}

export async function loanDetail(id: string) {
  if (!mongoose.isValidObjectId(id)) throw notFound('القرض');
  const loan: any = await Loan.findById(id).populate('beneficiary', 'fullName code').populate('church', 'name').lean();
  if (!loan) throw notFound('القرض');
  const installments = await loanInstallments(loan._id);
  const repaid = installments.reduce((s, i) => s + i.paid, 0);
  const repayments = await Repayment.find({ loan: loan._id }).sort({ date: -1, createdAt: -1 }).lean();
  return {
    ...loan, installments, repayments, totalRepaid: repaid, remainingBalance: loan.amount - repaid,
    outstandingInstallments: installments.filter((i) => i.status === 'overdue' || i.status === 'partial' || i.status === 'pending').length,
  };
}

export { AppError };
