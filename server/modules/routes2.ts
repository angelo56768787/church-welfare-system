import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole, validate, wrap } from '../middleware/index.js';
import { AssistanceRecord, Beneficiary, Church, FinancialTransaction, Installment, Loan, Repayment } from '../models/index.js';
import { audit } from '../lib/audit.js';
import { badRequest, notFound } from '../lib/errors.js';
import { dateIn, escapeRe, minorAmt, oid, pageMeta, pageQuery, period } from '../lib/http.js';
import { currentPeriod } from '../lib/period.js';
import { createLoan, createCashRepayment, loanDetail } from './loanService.js';
import { loanInstallments, paidByInstallment, installmentStatus } from './loanCore.js';
import { computeDeduction, createAssistance, deletePending, generateMonth, markPaid, applicableInstallment } from './assistanceService.js';

const skip = (page: number, size: number) => (page - 1) * size;

// ---------------- Loans ----------------
export const loans = Router();
loans.use(requireAuth);
loans.get('/', validate(z.object({ ...pageQuery, q: z.string().optional(), church: oid.optional(), beneficiary: oid.optional(), status: z.enum(['active', 'completed', 'cancelled']).optional(), from: dateIn.optional(), to: dateIn.optional() }), 'query'), wrap(async (req, res) => {
  const q = (req as any).validQuery;
  const f: any = {};
  for (const k of ['church', 'beneficiary', 'status']) if (q[k]) f[k] = q[k];
  if (q.from || q.to) f.loanDate = { ...(q.from && { $gte: q.from }), ...(q.to && { $lte: q.to }) };
  if (q.q) {
    const re = new RegExp(escapeRe(q.q), 'i');
    const bens = await Beneficiary.find({ $or: [{ fullName: re }, { code: re }] }).select('_id').limit(200).lean();
    f.$or = [{ reference: re }, { beneficiary: { $in: bens.map((b: any) => b._id) } }];
  }
  const [items, total] = await Promise.all([
    Loan.find(f).populate('beneficiary', 'fullName code').populate('church', 'name').sort({ loanDate: -1, createdAt: -1 }).skip(skip(q.page, q.pageSize)).limit(q.pageSize).lean(),
    Loan.countDocuments(f),
  ]);
  const ids = (items as any[]).map((l) => l._id);
  const repaid = await Repayment.aggregate([{ $match: { loan: { $in: ids } } }, { $group: { _id: '$loan', t: { $sum: '$amount' } } }]);
  const rm = new Map(repaid.map((r: any) => [String(r._id), r.t as number]));
  const agg = await Loan.aggregate([{ $match: f }, { $group: { _id: null, amount: { $sum: '$amount' } } }]);
  res.json({
    items: (items as any[]).map((l) => ({ ...l, totalRepaid: rm.get(String(l._id)) ?? 0, remainingBalance: l.amount - (rm.get(String(l._id)) ?? 0) })),
    filteredAmount: agg[0]?.amount ?? 0, ...pageMeta(q.page, q.pageSize, total),
  });
}));
loans.get('/summary', wrap(async (_req, res) => {
  const [l, r] = await Promise.all([
    Loan.aggregate([{ $match: { status: { $ne: 'cancelled' } } }, { $group: { _id: '$status', n: { $sum: 1 }, amount: { $sum: '$amount' } } }]),
    Repayment.aggregate([{ $group: { _id: null, t: { $sum: '$amount' } } }]),
  ]);
  const active = l.find((x: any) => x._id === 'active'); const all = l.reduce((s: number, x: any) => s + x.amount, 0);
  const repaid = r[0]?.t ?? 0;
  const now = new Date();
  const insts: any[] = await Installment.find({ loan: { $in: (await Loan.find({ status: 'active' }).select('_id').lean()).map((x: any) => x._id) } }).lean();
  const paid = await paidByInstallment();
  const outstanding = insts.filter((i) => installmentStatus(i.amount, paid.get(String(i._id)) ?? 0, i.dueDate, now) !== 'paid');
  const overdue = outstanding.filter((i) => installmentStatus(i.amount, paid.get(String(i._id)) ?? 0, i.dueDate, now) === 'overdue');
  res.json({
    totalLoanAmount: all, activeLoans: active?.n ?? 0, activeLoanAmount: active?.amount ?? 0, collected: repaid, outstandingBalance: all - repaid,
    outstandingInstallments: outstanding.length, overdueInstallments: overdue.length,
    outstandingInstallmentsAmount: outstanding.reduce((s, i) => s + i.amount - (paid.get(String(i._id)) ?? 0), 0),
  });
}));
loans.get('/:id', wrap(async (req, res) => res.json(await loanDetail(String(req.params.id)))));
loans.post('/', validate(z.object({
  beneficiary: oid, amount: minorAmt, loanDate: dateIn, installmentAmount: minorAmt, installmentsCount: z.number().int().min(1).max(240), notes: z.string().optional(),
})), wrap(async (req, res) => { const l: any = await createLoan(req.body, req.user!); res.status(201).json(await loanDetail(String(l._id))); }));
loans.patch('/:id', validate(z.object({ notes: z.string().optional(), status: z.literal('cancelled').optional() })), wrap(async (req, res) => {
  const l: any = await Loan.findById(String(req.params.id));
  if (!l) throw notFound('القرض');
  if (req.body.status === 'cancelled') {
    if (await Repayment.exists({ loan: l._id })) throw badRequest('لا يمكن إلغاء قرض عليه سداد مسجل');
    l.status = 'cancelled';
  }
  if (req.body.notes !== undefined) l.notes = req.body.notes;
  await l.save();
  await audit(req.user, 'update', 'Loan', l._id, `تعديل قرض ${l.reference}`, req.body);
  res.json({ ok: true });
}));

// ---------------- Repayments ----------------
export const repayments = Router();
repayments.use(requireAuth);
repayments.get('/', validate(z.object({ ...pageQuery, church: oid.optional(), beneficiary: oid.optional(), loan: oid.optional(), source: z.enum(['cash', 'assistance_deduction']).optional(), from: dateIn.optional(), to: dateIn.optional() }), 'query'), wrap(async (req, res) => {
  const q = (req as any).validQuery;
  const f: any = {};
  for (const k of ['church', 'beneficiary', 'loan', 'source']) if (q[k]) f[k] = q[k];
  if (q.from || q.to) f.date = { ...(q.from && { $gte: q.from }), ...(q.to && { $lte: q.to }) };
  const [items, total, sum] = await Promise.all([
    Repayment.find(f).populate('beneficiary', 'fullName code').populate('loan', 'reference').sort({ date: -1, createdAt: -1 }).skip(skip(q.page, q.pageSize)).limit(q.pageSize).lean(),
    Repayment.countDocuments(f), Repayment.aggregate([{ $match: f }, { $group: { _id: null, t: { $sum: '$amount' } } }]),
  ]);
  res.json({ items, totalAmount: sum[0]?.t ?? 0, ...pageMeta(q.page, q.pageSize, total) });
}));
repayments.post('/', validate(z.object({
  loan: oid, amount: minorAmt, date: dateIn, reference: z.string().max(60).optional(), notes: z.string().optional(), idempotencyKey: z.string().min(8).max(80),
})), wrap(async (req, res) => {
  const r = await createCashRepayment(req.body, req.user!);
  res.status(r.duplicate ? 200 : 201).json({ ...r, remaining: (r as any).remaining });
}));

// ---------------- Assistance & entitlements ----------------
export const assistance = Router();
assistance.use(requireAuth);
const asstQuery = z.object({ ...pageQuery, period: period.optional(), church: oid.optional(), beneficiary: oid.optional(), status: z.enum(['pending', 'paid']).optional(), q: z.string().optional() });
assistance.get('/', validate(asstQuery, 'query'), wrap(async (req, res) => {
  const q = (req as any).validQuery;
  const f: any = {};
  for (const k of ['period', 'church', 'beneficiary']) if (q[k]) f[k] = q[k];
  if (q.status) f.paymentStatus = q.status;
  if (q.q) { const re = new RegExp(escapeRe(q.q), 'i'); f.beneficiary = { $in: (await Beneficiary.find({ $or: [{ fullName: re }, { code: re }] }).select('_id').limit(500).lean()).map((b: any) => b._id) }; }
  const [items, total, sums] = await Promise.all([
    AssistanceRecord.find(f).populate('beneficiary', 'fullName code').populate('church', 'name').sort({ period: -1, createdAt: -1 }).skip(skip(q.page, q.pageSize)).limit(q.pageSize).lean(),
    AssistanceRecord.countDocuments(f),
    AssistanceRecord.aggregate([{ $match: f }, { $group: { _id: null, original: { $sum: '$originalAmount' }, deduction: { $sum: '$deductionAmount' } } }]),
  ]);
  const s = sums[0] ?? { original: 0, deduction: 0 };
  res.json({ items: (items as any[]).map((a) => ({ ...a, netAmount: a.originalAmount - a.deductionAmount })), totals: { original: s.original, deduction: s.deduction, net: s.original - s.deduction }, ...pageMeta(q.page, q.pageSize, total) });
}));
assistance.post('/', validate(z.object({ beneficiary: oid, period, originalAmount: minorAmt.optional(), notes: z.string().optional() })), wrap(async (req, res) => {
  res.status(201).json(await createAssistance(req.body, req.user!));
}));
assistance.post('/generate', validate(z.object({ period, church: oid.optional() })), wrap(async (req, res) => {
  const r = await generateMonth(req.body.period, req.user!, req.body.church);
  await audit(req.user, 'generate', 'AssistanceRecord', req.body.period, `إنشاء مساعدات شهر ${req.body.period}`, r);
  res.json(r);
}));
assistance.post('/:id/pay', validate(z.object({ paymentDate: dateIn.optional() })), wrap(async (req, res) => {
  const r: any = await markPaid(String(req.params.id), req.body.paymentDate ?? new Date(), req.user!);
  res.json({ ...r.toJSON(), netAmount: r.originalAmount - r.deductionAmount });
}));
assistance.delete('/:id', wrap(async (req, res) => { await deletePending(String(req.params.id), req.user!); res.json({ ok: true }); }));

assistance.get('/entitlements', validate(z.object({ period: period.default(currentPeriod()), church: oid.optional(), q: z.string().optional() }), 'query'), wrap(async (req, res) => {
  const q = (req as any).validQuery;
  const bf: any = { status: 'active', monthlyAssistance: { $gt: 0 } };
  if (q.church) bf.church = q.church;
  if (q.q) { const re = new RegExp(escapeRe(q.q), 'i'); bf.$or = [{ fullName: re }, { code: re }]; }
  const rf: any = { period: q.period }; if (q.church) rf.church = q.church;
  const [bens, recs]: any[] = await Promise.all([
    Beneficiary.find(bf).populate('church', 'name').sort({ fullName: 1 }).limit(1000).lean(),
    AssistanceRecord.find(rf).lean(),
  ]);
  const byBen = new Map(recs.map((r: any) => [String(r.beneficiary), r]));
  const rows: any[] = [];
  for (const b of bens) {
    const r: any = byBen.get(String(b._id));
    if (r) { rows.push({ beneficiary: { _id: b._id, fullName: b.fullName, code: b.code }, church: b.church, recordId: r._id, original: r.originalAmount, deduction: r.deductionAmount, net: r.originalAmount - r.deductionAmount, status: r.paymentStatus, paymentDate: r.paymentDate }); continue; }
    const app = await applicableInstallment(b._id, q.period);
    const ded = computeDeduction(b.monthlyAssistance, app?.remaining);
    rows.push({ beneficiary: { _id: b._id, fullName: b.fullName, code: b.code }, church: b.church, original: b.monthlyAssistance, deduction: ded, net: b.monthlyAssistance - ded, status: 'not_generated' });
  }
  const sum = (k: string, st?: string) => rows.filter((r) => !st || r.status === st).reduce((s, r) => s + r[k], 0);
  res.json({
    period: q.period, items: rows,
    totals: { original: sum('original'), deduction: sum('deduction'), net: sum('net'), paidNet: sum('net', 'paid'), pendingNet: sum('net') - sum('net', 'paid'), count: rows.length, notGenerated: rows.filter((r) => r.status === 'not_generated').length },
  });
}));
assistance.get('/:id', wrap(async (req, res) => {
  const r: any = await AssistanceRecord.findById(String(req.params.id)).populate('beneficiary', 'fullName code').populate('church', 'name').lean();
  if (!r) throw notFound('سجل المساعدة');
  res.json({ ...r, netAmount: r.originalAmount - r.deductionAmount });
}));

export { Church, FinancialTransaction, loanInstallments, requireRole };
