import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { requireAuth, validate, wrap } from '../middleware/index.js';
import { AssistanceRecord, AuditLog, Beneficiary, Church, FinancialTransaction, Installment, Loan, Repayment } from '../models/index.js';
import { dateIn, oid, period } from '../lib/http.js';
import { currentPeriod, periodOf } from '../lib/period.js';
import { installmentStatus, paidByInstallment } from './loanCore.js';

const O = (id?: string) => (id ? new mongoose.Types.ObjectId(id) : undefined);
const lastPeriods = (n: number) => {
  const out: string[] = []; const d = new Date();
  for (let i = n - 1; i >= 0; i--) out.push(periodOf(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1))));
  return out;
};
const monthStart = (p: string) => new Date(`${p}-01T00:00:00.000Z`);
const nextMonthStart = (p: string) => { const d = monthStart(p); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)); };

// ---------------- Dashboard ----------------
export const dashboard = Router();
dashboard.use(requireAuth);
dashboard.get('/', validate(z.object({ church: oid.optional(), from: dateIn.optional(), to: dateIn.optional() }), 'query'), wrap(async (req, res) => {
  const q = (req as any).validQuery;
  const church = O(q.church);
  const cf: any = church ? { church } : {};
  const dateRange = (field: string) => (q.from || q.to ? { [field]: { ...(q.from && { $gte: q.from }), ...(q.to && { $lte: q.to }) } } : {});
  const periods = lastPeriods(6);
  const now = new Date();

  const [churchCount, benCount, byChurch, assistTrend, assistTotals, loanAgg, repAgg, loanMonthly, repMonthly, recent, latestBens, latestTx, activeLoanIds] = await Promise.all([
    church ? 1 : Church.countDocuments({ active: true }),
    Beneficiary.countDocuments({ ...cf, status: 'active' }),
    Beneficiary.aggregate([{ $match: { ...cf, status: 'active' } }, { $group: { _id: '$church', n: { $sum: 1 } } }, { $lookup: { from: 'churches', localField: '_id', foreignField: '_id', as: 'c' } }, { $project: { name: { $arrayElemAt: ['$c.name', 0] }, n: 1 } }, { $sort: { n: -1 } }]),
    AssistanceRecord.aggregate([{ $match: { ...cf, period: { $in: periods } } }, { $group: { _id: '$period', original: { $sum: '$originalAmount' }, deduction: { $sum: '$deductionAmount' } } }]),
    AssistanceRecord.aggregate([{ $match: { ...cf, period: currentPeriod() } }, { $group: { _id: null, original: { $sum: '$originalAmount' }, deduction: { $sum: '$deductionAmount' }, pending: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'pending'] }, 1, 0] } }, n: { $sum: 1 } } }]),
    Loan.aggregate([{ $match: { ...cf, status: { $ne: 'cancelled' }, ...dateRange('loanDate') } }, { $group: { _id: '$status', n: { $sum: 1 }, amount: { $sum: '$amount' } } }]),
    Repayment.aggregate([{ $match: { ...cf, ...dateRange('date') } }, { $group: { _id: '$source', t: { $sum: '$amount' }, n: { $sum: 1 } } }]),
    Loan.aggregate([{ $match: { ...cf, status: { $ne: 'cancelled' }, loanDate: { $gte: monthStart(periods[0]) } } }, { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$loanDate' } }, amount: { $sum: '$amount' }, n: { $sum: 1 } } }]),
    Repayment.aggregate([{ $match: { ...cf, date: { $gte: monthStart(periods[0]) } } }, { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$date' } }, amount: { $sum: '$amount' } } }]),
    AuditLog.find().sort({ createdAt: -1 }).limit(8).lean(),
    Beneficiary.find(cf).populate('church', 'name').sort({ createdAt: -1 }).limit(6).select('code fullName status church registrationDate').lean(),
    FinancialTransaction.find(cf).populate('beneficiary', 'fullName').sort({ date: -1, createdAt: -1 }).limit(6).lean(),
    Loan.find({ ...cf, status: 'active' }).select('_id').lean(),
  ]);

  const ids = (activeLoanIds as any[]).map((l) => l._id);
  const insts: any[] = await Installment.find({ loan: { $in: ids } }).populate('beneficiary', 'fullName code').sort({ dueDate: 1 }).lean();
  const paid = await paidByInstallment({ loan: { $in: ids } });
  const open = insts.map((i) => ({ ...i, paid: paid.get(String(i._id)) ?? 0 })).map((i) => ({ ...i, remaining: i.amount - i.paid, status: installmentStatus(i.amount, i.paid, i.dueDate, now) })).filter((i) => i.status !== 'paid');
  const overdue = open.filter((i) => i.status === 'overdue');
  const in30 = new Date(now.getTime() + 30 * 86400_000);
  const upcoming = open.filter((i) => i.status !== 'overdue' && i.dueDate <= in30).slice(0, 6);

  const loansAll = loanAgg.reduce((s: number, x: any) => s + x.amount, 0);
  const repaidAll = repAgg.reduce((s: number, x: any) => s + x.t, 0);
  const act = loanAgg.find((x: any) => x._id === 'active');
  const cur = assistTotals[0] ?? { original: 0, deduction: 0, pending: 0, n: 0 };
  const m = (arr: any[], id: string, k: string) => arr.find((x) => x._id === id)?.[k] ?? 0;

  const alerts: { level: 'red' | 'orange' | 'blue'; text: string }[] = [];
  if (overdue.length) alerts.push({ level: 'red', text: `${overdue.length} قسط متأخر بإجمالي متبقٍ` , });
  if (cur.pending) alerts.push({ level: 'orange', text: `${cur.pending} سجل مساعدة لشهر ${currentPeriod()} لم يُصرف بعد` });
  const unGen = await Beneficiary.countDocuments({ ...cf, status: 'active', monthlyAssistance: { $gt: 0 } }) - cur.n;
  if (unGen > 0) alerts.push({ level: 'blue', text: `${unGen} مستفيد لم تُنشأ له مساعدة شهر ${currentPeriod()}` });

  res.json({
    cards: {
      churches: churchCount, beneficiaries: benCount,
      monthlyAssistanceOriginal: cur.original, monthlyAssistanceDeduction: cur.deduction, monthlyAssistanceNet: cur.original - cur.deduction,
      activeLoans: act?.n ?? 0, activeLoansAmount: act?.amount ?? 0,
      outstandingInstallments: open.length, outstandingInstallmentsAmount: open.reduce((s, i) => s + i.remaining, 0),
      overdueInstallments: overdue.length, overdueAmount: overdue.reduce((s, i) => s + i.remaining, 0),
      collectedRepayments: repaidAll, totalLoans: loansAll, currentPeriod: currentPeriod(),
    },
    charts: {
      byChurch: byChurch.map((x: any) => ({ name: x.name ?? '—', value: x.n })),
      assistanceTrend: periods.map((p) => ({ period: p, original: m(assistTrend, p, 'original'), deduction: m(assistTrend, p, 'deduction'), net: m(assistTrend, p, 'original') - m(assistTrend, p, 'deduction') })),
      loanActivity: periods.map((p) => ({ period: p, disbursed: m(loanMonthly, p, 'amount'), repaid: m(repMonthly, p, 'amount') })),
      repaymentStats: [{ name: 'سداد نقدي', value: repAgg.find((x: any) => x._id === 'cash')?.t ?? 0 }, { name: 'خصم من المساعدة', value: repAgg.find((x: any) => x._id === 'assistance_deduction')?.t ?? 0 }],
      financialComparison: periods.map((p) => ({ period: p, assistanceNet: m(assistTrend, p, 'original') - m(assistTrend, p, 'deduction'), disbursed: m(loanMonthly, p, 'amount'), repaid: m(repMonthly, p, 'amount') })),
    },
    recentActivities: recent, latestBeneficiaries: latestBens, latestTransactions: latestTx,
    upcomingInstallments: upcoming.map((i) => ({ _id: i._id, beneficiary: i.beneficiary, number: i.number, dueDate: i.dueDate, remaining: i.remaining, status: i.status })),
    overdueList: overdue.slice(0, 5).map((i) => ({ _id: i._id, beneficiary: i.beneficiary, number: i.number, dueDate: i.dueDate, remaining: i.remaining })),
    alerts,
  });
}));

// ---------------- Reports ----------------
export const reports = Router();
reports.use(requireAuth);
type Col = { key: string; label: string; type?: 'money' | 'date' | 'number' | 'text' };
const filterQ = z.object({
  from: dateIn.optional(), to: dateIn.optional(), month: period.optional(), year: z.coerce.number().int().min(2000).max(2100).optional(),
  church: oid.optional(), beneficiary: oid.optional(), status: z.string().optional(),
});
type F = z.infer<typeof filterQ>;

function range(f: F): { from?: Date; to?: Date } {
  if (f.month) return { from: monthStart(f.month), to: new Date(nextMonthStart(f.month).getTime() - 1) };
  if (f.year) return { from: new Date(Date.UTC(f.year, 0, 1)), to: new Date(Date.UTC(f.year, 11, 31, 23, 59, 59, 999)) };
  return { from: f.from, to: f.to };
}
const dr = (field: string, f: F) => { const r = range(f); return r.from || r.to ? { [field]: { ...(r.from && { $gte: r.from }), ...(r.to && { $lte: r.to }) } } : {}; };
const base = (f: F) => ({ ...(f.church && { church: O(f.church) }), ...(f.beneficiary && { beneficiary: O(f.beneficiary) }) });
const sumRow = (rows: any[], keys: string[]) => Object.fromEntries(keys.map((k) => [k, rows.reduce((s, r) => s + (r[k] ?? 0), 0)]));

const builders: Record<string, { title: string; run: (f: F) => Promise<{ columns: Col[]; rows: any[]; totalKeys?: string[] }> }> = {
  'beneficiaries-by-church': {
    title: 'توزيع المستفيدين حسب الكنيسة',
    run: async (f) => {
      const rows = await Beneficiary.aggregate([{ $match: { ...(f.church && { church: O(f.church) }), ...(f.status && { status: f.status }) } }, { $group: { _id: '$church', total: { $sum: 1 }, active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } }, monthly: { $sum: '$monthlyAssistance' } } }, { $lookup: { from: 'churches', localField: '_id', foreignField: '_id', as: 'c' } }, { $project: { church: { $arrayElemAt: ['$c.name', 0] }, total: 1, active: 1, monthly: 1 } }, { $sort: { total: -1 } }]);
      return { columns: [{ key: 'church', label: 'الكنيسة' }, { key: 'total', label: 'إجمالي المستفيدين', type: 'number' }, { key: 'active', label: 'النشطون', type: 'number' }, { key: 'monthly', label: 'المساعدة الشهرية المقررة', type: 'money' }], rows, totalKeys: ['total', 'active', 'monthly'] };
    },
  },
  'monthly-assistance': {
    title: 'المساعدات الشهرية',
    run: async (f) => {
      const match: any = { ...base(f), ...(f.status && { paymentStatus: f.status }) };
      const r = range(f); if (r.from || r.to) match.period = { ...(r.from && { $gte: periodOf(r.from) }), ...(r.to && { $lte: periodOf(r.to) }) };
      const rows = await AssistanceRecord.aggregate([{ $match: match }, { $lookup: { from: 'beneficiaries', localField: 'beneficiary', foreignField: '_id', as: 'b' } }, { $lookup: { from: 'churches', localField: 'church', foreignField: '_id', as: 'c' } }, { $project: { period: 1, beneficiary: { $arrayElemAt: ['$b.fullName', 0] }, code: { $arrayElemAt: ['$b.code', 0] }, church: { $arrayElemAt: ['$c.name', 0] }, original: '$originalAmount', deduction: '$deductionAmount', net: { $subtract: ['$originalAmount', '$deductionAmount'] }, status: '$paymentStatus' } }, { $sort: { period: -1, beneficiary: 1 } }]);
      return { columns: [{ key: 'period', label: 'الشهر' }, { key: 'code', label: 'الكود' }, { key: 'beneficiary', label: 'المستفيد' }, { key: 'church', label: 'الكنيسة' }, { key: 'original', label: 'المساعدة الأصلية', type: 'money' }, { key: 'deduction', label: 'خصم القسط', type: 'money' }, { key: 'net', label: 'الصافي', type: 'money' }, { key: 'status', label: 'الحالة' }], rows, totalKeys: ['original', 'deduction', 'net'] };
    },
  },
  loans: {
    title: 'القروض والأرصدة المتبقية',
    run: async (f) => {
      const rows: any[] = await Loan.aggregate([{ $match: { ...base(f), ...(f.status && { status: f.status }), ...dr('loanDate', f) } }, { $lookup: { from: 'repayments', localField: '_id', foreignField: 'loan', as: 'r' } }, { $lookup: { from: 'beneficiaries', localField: 'beneficiary', foreignField: '_id', as: 'b' } }, { $lookup: { from: 'churches', localField: 'church', foreignField: '_id', as: 'c' } }, { $project: { reference: 1, beneficiary: { $arrayElemAt: ['$b.fullName', 0] }, church: { $arrayElemAt: ['$c.name', 0] }, loanDate: 1, status: 1, amount: 1, repaid: { $sum: '$r.amount' }, remaining: { $subtract: ['$amount', { $sum: '$r.amount' }] }, installmentAmount: 1, installmentsCount: 1 } }, { $sort: { loanDate: -1 } }]);
      return { columns: [{ key: 'reference', label: 'رقم القرض' }, { key: 'beneficiary', label: 'المستفيد' }, { key: 'church', label: 'الكنيسة' }, { key: 'loanDate', label: 'التاريخ', type: 'date' }, { key: 'status', label: 'الحالة' }, { key: 'amount', label: 'المبلغ', type: 'money' }, { key: 'repaid', label: 'المسدد', type: 'money' }, { key: 'remaining', label: 'المتبقي', type: 'money' }], rows, totalKeys: ['amount', 'repaid', 'remaining'] };
    },
  },
  installments: {
    title: 'حالة الأقساط',
    run: async (f) => {
      const insts: any[] = await Installment.find({ ...(f.beneficiary && { beneficiary: O(f.beneficiary) }), ...dr('dueDate', f) }).populate('loan', 'reference church status').populate('beneficiary', 'fullName').sort({ dueDate: 1 }).limit(5000).lean();
      const paid = await paidByInstallment();
      let rows = insts.filter((i) => i.loan && i.loan.status !== 'cancelled' && (!f.church || String(i.loan.church) === f.church)).map((i) => {
        const p = paid.get(String(i._id)) ?? 0;
        return { loan: i.loan.reference, beneficiary: i.beneficiary?.fullName, number: i.number, dueDate: i.dueDate, amount: i.amount, paid: p, remaining: i.amount - p, status: installmentStatus(i.amount, p, i.dueDate) };
      });
      if (f.status) rows = rows.filter((r) => r.status === f.status);
      return { columns: [{ key: 'loan', label: 'القرض' }, { key: 'beneficiary', label: 'المستفيد' }, { key: 'number', label: 'رقم القسط', type: 'number' }, { key: 'dueDate', label: 'الاستحقاق', type: 'date' }, { key: 'amount', label: 'القيمة', type: 'money' }, { key: 'paid', label: 'المسدد', type: 'money' }, { key: 'remaining', label: 'المتبقي', type: 'money' }, { key: 'status', label: 'الحالة' }], rows, totalKeys: ['amount', 'paid', 'remaining'] };
    },
  },
  repayments: {
    title: 'عمليات السداد',
    run: async (f) => {
      const rows = await Repayment.aggregate([{ $match: { ...base(f), ...(f.status && { source: f.status }), ...dr('date', f) } }, { $lookup: { from: 'beneficiaries', localField: 'beneficiary', foreignField: '_id', as: 'b' } }, { $lookup: { from: 'loans', localField: 'loan', foreignField: '_id', as: 'l' } }, { $project: { date: 1, reference: 1, beneficiary: { $arrayElemAt: ['$b.fullName', 0] }, loan: { $arrayElemAt: ['$l.reference', 0] }, source: 1, amount: 1 } }, { $sort: { date: -1 } }]);
      return { columns: [{ key: 'date', label: 'التاريخ', type: 'date' }, { key: 'reference', label: 'المرجع' }, { key: 'beneficiary', label: 'المستفيد' }, { key: 'loan', label: 'القرض' }, { key: 'source', label: 'المصدر' }, { key: 'amount', label: 'المبلغ', type: 'money' }], rows, totalKeys: ['amount'] };
    },
  },
  'monthly-summary': {
    title: 'الملخص المالي الشهري',
    run: async (f) => {
      const b = base(f);
      const [a, l, r] = await Promise.all([
        AssistanceRecord.aggregate([{ $match: { ...b, paymentStatus: 'paid', ...dr('paymentDate', f) } }, { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$paymentDate' } }, original: { $sum: '$originalAmount' }, deduction: { $sum: '$deductionAmount' } } }]),
        Loan.aggregate([{ $match: { ...b, status: { $ne: 'cancelled' }, ...dr('loanDate', f) } }, { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$loanDate' } }, disbursed: { $sum: '$amount' } } }]),
        Repayment.aggregate([{ $match: { ...b, source: 'cash', ...dr('date', f) } }, { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$date' } }, cash: { $sum: '$amount' } } }]),
      ]);
      const keys = [...new Set([...a, ...l, ...r].map((x: any) => x._id))].sort().reverse();
      const g = (arr: any[], k: string, key: string) => arr.find((x) => x._id === k)?.[key] ?? 0;
      const rows = keys.map((k) => ({ month: k, original: g(a, k, 'original'), deduction: g(a, k, 'deduction'), net: g(a, k, 'original') - g(a, k, 'deduction'), disbursed: g(l, k, 'disbursed'), cash: g(r, k, 'cash'), cashOut: g(a, k, 'original') - g(a, k, 'deduction') + g(l, k, 'disbursed'), cashNet: g(r, k, 'cash') - (g(a, k, 'original') - g(a, k, 'deduction')) - g(l, k, 'disbursed') }));
      return { columns: [{ key: 'month', label: 'الشهر' }, { key: 'original', label: 'المساعدات الأصلية', type: 'money' }, { key: 'deduction', label: 'خصم الأقساط', type: 'money' }, { key: 'net', label: 'صافي المساعدات المصروفة', type: 'money' }, { key: 'disbursed', label: 'قروض مصروفة', type: 'money' }, { key: 'cash', label: 'سداد نقدي محصل', type: 'money' }, { key: 'cashOut', label: 'إجمالي المنصرف', type: 'money' }, { key: 'cashNet', label: 'صافي حركة النقدية', type: 'money' }], rows, totalKeys: ['original', 'deduction', 'net', 'disbursed', 'cash', 'cashOut', 'cashNet'] };
    },
  },
  'church-financial': {
    title: 'التقرير المالي حسب الكنيسة',
    run: async (f) => {
      const churches: any[] = await Church.find(f.church ? { _id: f.church } : {}).sort({ name: 1 }).lean();
      const [a, l, r] = await Promise.all([
        AssistanceRecord.aggregate([{ $match: { paymentStatus: 'paid', ...dr('paymentDate', f) } }, { $group: { _id: '$church', original: { $sum: '$originalAmount' }, deduction: { $sum: '$deductionAmount' } } }]),
        Loan.aggregate([{ $match: { status: { $ne: 'cancelled' }, ...dr('loanDate', f) } }, { $group: { _id: '$church', disbursed: { $sum: '$amount' } } }]),
        Repayment.aggregate([{ $match: dr('date', f) }, { $group: { _id: '$church', repaid: { $sum: '$amount' } } }]),
      ]);
      const g = (arr: any[], id: unknown, k: string) => arr.find((x) => String(x._id) === String(id))?.[k] ?? 0;
      const rows = churches.map((c) => ({ church: c.name, original: g(a, c._id, 'original'), deduction: g(a, c._id, 'deduction'), net: g(a, c._id, 'original') - g(a, c._id, 'deduction'), disbursed: g(l, c._id, 'disbursed'), repaid: g(r, c._id, 'repaid') }));
      return { columns: [{ key: 'church', label: 'الكنيسة' }, { key: 'original', label: 'المساعدات الأصلية', type: 'money' }, { key: 'deduction', label: 'خصم الأقساط', type: 'money' }, { key: 'net', label: 'صافي المساعدات', type: 'money' }, { key: 'disbursed', label: 'قروض مصروفة', type: 'money' }, { key: 'repaid', label: 'إجمالي المسدد', type: 'money' }], rows, totalKeys: ['original', 'deduction', 'net', 'disbursed', 'repaid'] };
    },
  },
};
builders['consolidated'] = { title: 'التقرير المالي الموحد', run: async (f) => ({ ...(await builders['church-financial'].run({ ...f, church: undefined })) }) };

reports.get('/', (_req, res) => res.json({ items: Object.entries(builders).map(([id, b]) => ({ id, title: b.title })) }));
reports.get('/:type', validate(filterQ, 'query'), wrap(async (req, res) => {
  const b = builders[String(req.params.type)];
  if (!b) return res.status(404).json({ error: 'تقرير غير موجود' });
  const f = (req as any).validQuery as F;
  const out = await b.run(f);
  const totals = out.totalKeys ? sumRow(out.rows, out.totalKeys) : undefined;
  res.json({ id: String(req.params.type), title: b.title, columns: out.columns, rows: out.rows, totals, generatedAt: new Date() });
}));
