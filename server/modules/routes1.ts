import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { COOKIE, requireAuth, requireRole, validate, wrap } from '../middleware/index.js';
import { AuditLog, Beneficiary, Church, FinancialTransaction, Installment, Loan, Repayment, AssistanceRecord, SystemSetting, User } from '../models/index.js';
import { AppError, badRequest, notFound } from '../lib/errors.js';
import { audit, diff } from '../lib/audit.js';
import { escapeRe, oid, pageMeta, pageQuery, dateIn } from '../lib/http.js';
import { nextCode } from '../lib/codes.js';
import { loanInstallments, paidByInstallment } from './loanCore.js';

// ---------------- Auth ----------------
export const auth = Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'محاولات كثيرة، حاول لاحقًا' } });
const cookieOpts = { httpOnly: true, sameSite: 'lax' as const, secure: env.nodeEnv === 'production', maxAge: 12 * 3600_000, path: '/' };

auth.post('/login', loginLimiter, validate(z.object({ username: z.string().min(1), password: z.string().min(1) })), wrap(async (req, res) => {
  const u: any = await User.findOne({ username: req.body.username.toLowerCase().trim() });
  const ok = u && u.active && (await bcrypt.compare(req.body.password, u.passwordHash));
  if (!ok) throw new AppError(401, 'اسم المستخدم أو كلمة المرور غير صحيحة', 'bad_credentials');
  const token = jwt.sign({ sub: String(u._id) }, env.jwtSecret, { expiresIn: '12h' });
  res.cookie(COOKIE, token, cookieOpts);
  await audit({ id: String(u._id), name: u.name }, 'login', 'User', u._id, `تسجيل دخول ${u.name}`);
  res.json({ user: { id: u._id, name: u.name, username: u.username, role: u.role } });
}));
auth.post('/logout', (_req, res) => { res.clearCookie(COOKIE, { ...cookieOpts, maxAge: undefined }); res.json({ ok: true }); });
auth.get('/me', requireAuth, wrap(async (req, res) => {
  const u: any = await User.findById(req.user!.id).select('name username role').lean();
  res.json({ user: u });
}));
auth.post('/change-password', requireAuth, validate(z.object({ current: z.string(), next: z.string().min(8, 'كلمة المرور 8 أحرف على الأقل') })), wrap(async (req, res) => {
  const u: any = await User.findById(req.user!.id);
  if (!(await bcrypt.compare(req.body.current, u.passwordHash))) throw badRequest('كلمة المرور الحالية غير صحيحة');
  u.passwordHash = await bcrypt.hash(req.body.next, 12);
  await u.save();
  await audit(req.user, 'update', 'User', u._id, 'تغيير كلمة المرور');
  res.json({ ok: true });
}));

// ---------------- Users (admin) ----------------
export const users = Router();
users.use(requireAuth, requireRole('admin'));
users.get('/', wrap(async (_req, res) => res.json({ items: await User.find().select('-passwordHash').sort({ createdAt: 1 }).lean() })));
users.post('/', validate(z.object({
  name: z.string().min(2), username: z.string().min(3).regex(/^[a-zA-Z0-9_.-]+$/, 'اسم المستخدم حروف إنجليزية وأرقام فقط'),
  password: z.string().min(8, 'كلمة المرور 8 أحرف على الأقل'), role: z.enum(['admin', 'staff']),
})), wrap(async (req, res) => {
  const { password, ...rest } = req.body;
  const u: any = await User.create({ ...rest, passwordHash: await bcrypt.hash(password, 12) });
  await audit(req.user, 'create', 'User', u._id, `إنشاء مستخدم ${u.username}`, { role: u.role });
  res.status(201).json({ id: u._id });
}));
users.patch('/:id', validate(z.object({ name: z.string().min(2).optional(), role: z.enum(['admin', 'staff']).optional(), active: z.boolean().optional(), password: z.string().min(8).optional() })), wrap(async (req, res) => {
  const u: any = await User.findById(req.params.id);
  if (!u) throw notFound('المستخدم');
  if (String(u._id) === req.user!.id && (req.body.active === false || req.body.role === 'staff')) throw badRequest('لا يمكنك تعطيل حسابك أو تخفيض صلاحيتك');
  const { password, ...rest } = req.body;
  Object.assign(u, rest);
  if (password) u.passwordHash = await bcrypt.hash(password, 12);
  await u.save();
  await audit(req.user, 'update', 'User', u._id, `تعديل مستخدم ${u.username}`, { ...rest, passwordChanged: !!password });
  res.json({ ok: true });
}));

// ---------------- Churches ----------------
export const churches = Router();
churches.use(requireAuth);
const churchBody = z.object({ name: z.string().min(2, 'اسم الكنيسة مطلوب'), sector: z.string().optional(), notes: z.string().optional(), active: z.boolean().optional() });

async function churchStats(ids?: unknown[]) {
  const m = ids ? { church: { $in: ids } } : {};
  const [bens, loans, assist, reps] = await Promise.all([
    Beneficiary.aggregate([{ $match: { ...m, status: 'active' } }, { $group: { _id: '$church', n: { $sum: 1 } } }]),
    Loan.aggregate([{ $match: { ...m, status: { $ne: 'cancelled' } } }, { $group: { _id: '$church', n: { $sum: 1 }, amount: { $sum: '$amount' }, active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } } } }]),
    AssistanceRecord.aggregate([{ $match: { ...m, paymentStatus: 'paid' } }, { $group: { _id: '$church', original: { $sum: '$originalAmount' }, deduction: { $sum: '$deductionAmount' } } }]),
    Repayment.aggregate([{ $match: m }, { $group: { _id: '$church', repaid: { $sum: '$amount' } } }]),
  ]);
  const get = (arr: any[], id: unknown) => arr.find((x) => String(x._id) === String(id)) ?? {};
  return (id: unknown) => {
    const l = get(loans, id), a = get(assist, id), r = get(reps, id);
    return {
      beneficiaries: get(bens, id).n ?? 0, loans: l.n ?? 0, activeLoans: l.active ?? 0, loansAmount: l.amount ?? 0,
      assistanceOriginal: a.original ?? 0, assistanceDeduction: a.deduction ?? 0, assistanceNet: (a.original ?? 0) - (a.deduction ?? 0),
      repaid: r.repaid ?? 0, outstanding: (l.amount ?? 0) - (r.repaid ?? 0),
    };
  };
}

churches.get('/', wrap(async (req, res) => {
  const list: any[] = await Church.find().sort({ name: 1 }).lean();
  const st = await churchStats();
  res.json({ items: list.map((c) => ({ ...c, stats: st(c._id) })) });
}));
churches.get('/:id', wrap(async (req, res) => {
  const c: any = await Church.findById(req.params.id).lean();
  if (!c) throw notFound('الكنيسة');
  const st = await churchStats([c._id]);
  const bens = await Beneficiary.find({ church: c._id }).sort({ fullName: 1 }).select('code fullName status phone monthlyAssistance').limit(500).lean();
  res.json({ ...c, stats: st(c._id), beneficiaries: bens });
}));
churches.post('/', validate(churchBody), wrap(async (req, res) => {
  const c: any = await Church.create(req.body);
  await audit(req.user, 'create', 'Church', c._id, `إضافة كنيسة ${c.name}`);
  res.status(201).json(c);
}));
churches.patch('/:id', validate(churchBody.partial()), wrap(async (req, res) => {
  const c: any = await Church.findById(req.params.id);
  if (!c) throw notFound('الكنيسة');
  const before = c.toObject();
  Object.assign(c, req.body);
  await c.save();
  await audit(req.user, 'update', 'Church', c._id, `تعديل كنيسة ${c.name}`, diff(before, req.body));
  res.json(c);
}));

// ---------------- Beneficiaries ----------------
export const beneficiaries = Router();
beneficiaries.use(requireAuth);
const benBody = z.object({
  fullName: z.string().min(3, 'الاسم الكامل مطلوب'), nationalId: z.string().regex(/^\d{14}$/, 'الرقم القومي 14 رقمًا').optional().or(z.literal('')),
  phone: z.string().optional(), address: z.string().optional(), church: oid, sector: z.string().optional(),
  registrationDate: dateIn.optional(), status: z.enum(['active', 'suspended', 'inactive']).optional(),
  monthlyAssistance: z.number().int().min(0).optional(), notes: z.string().optional(),
  attachments: z.array(z.object({ name: z.string().min(1), url: z.string().url('رابط غير صالح') })).optional(),
});
const benQuery = z.object({
  ...pageQuery, q: z.string().optional(), church: oid.optional(), status: z.enum(['active', 'suspended', 'inactive']).optional(),
  from: dateIn.optional(), to: dateIn.optional(),
});
const clean = (b: any) => ({ ...b, nationalId: b.nationalId || undefined });

beneficiaries.get('/', validate(benQuery, 'query'), wrap(async (req, res) => {
  const q = (req as any).validQuery as z.infer<typeof benQuery>;
  const f: any = {};
  if (q.church) f.church = q.church;
  if (q.status) f.status = q.status;
  if (q.from || q.to) f.registrationDate = { ...(q.from && { $gte: q.from }), ...(q.to && { $lte: q.to }) };
  if (q.q) { const re = new RegExp(escapeRe(q.q.trim()), 'i'); f.$or = [{ fullName: re }, { code: re }, { phone: re }, { nationalId: re }]; }
  const sort: any = q.sort ? { [q.sort.replace('-', '')]: q.sort.startsWith('-') ? -1 : 1 } : { createdAt: -1 };
  const [items, total] = await Promise.all([
    Beneficiary.find(f).populate('church', 'name').sort(sort).skip((q.page - 1) * q.pageSize).limit(q.pageSize).lean(),
    Beneficiary.countDocuments(f),
  ]);
  res.json({ items, ...pageMeta(q.page, q.pageSize, total) });
}));
beneficiaries.get('/options', wrap(async (req, res) => {
  const f: any = { status: 'active' };
  if (req.query.q) f.$or = [{ fullName: new RegExp(escapeRe(String(req.query.q)), 'i') }, { code: new RegExp(escapeRe(String(req.query.q)), 'i') }];
  res.json({ items: await Beneficiary.find(f).select('code fullName monthlyAssistance church').sort({ fullName: 1 }).limit(50).lean() });
}));
beneficiaries.get('/:id', wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw notFound('المستفيد');
  const b: any = await Beneficiary.findById(req.params.id).populate('church', 'name').lean();
  if (!b) throw notFound('المستفيد');
  const [assistance, loans, repayments, txs] = await Promise.all([
    AssistanceRecord.find({ beneficiary: b._id }).sort({ period: -1 }).limit(60).lean({ virtuals: true }),
    Loan.find({ beneficiary: b._id }).sort({ loanDate: -1 }).lean(),
    Repayment.find({ beneficiary: b._id }).sort({ date: -1 }).limit(100).populate('loan', 'reference').lean(),
    FinancialTransaction.find({ beneficiary: b._id }).sort({ date: -1, createdAt: -1 }).limit(100).lean(),
  ]);
  const loanRows = [];
  const schedule: any[] = [];
  for (const l of loans as any[]) {
    const insts = await loanInstallments(l._id);
    const repaid = insts.reduce((s, i) => s + i.paid, 0);
    loanRows.push({ ...l, totalRepaid: repaid, remainingBalance: l.amount - repaid });
    if (l.status === 'active') schedule.push(...insts.map((i) => ({ ...i, loanReference: l.reference })));
  }
  const assistanceOut = (assistance as any[]).map((a) => ({ ...a, netAmount: a.originalAmount - a.deductionAmount }));
  res.json({ ...b, assistance: assistanceOut, loans: loanRows, installments: schedule, repayments, transactions: txs });
}));
beneficiaries.post('/', validate(benBody), wrap(async (req, res) => {
  const ch: any = await Church.findById(req.body.church);
  if (!ch) throw badRequest('الكنيسة غير موجودة');
  const code = await nextCode('BN', 'beneficiary', 5);
  const b: any = await Beneficiary.create({ ...clean(req.body), code });
  await audit(req.user, 'create', 'Beneficiary', b._id, `إضافة مستفيد ${b.fullName} (${code})`);
  res.status(201).json(b);
}));
beneficiaries.patch('/:id', validate(benBody.partial()), wrap(async (req, res) => {
  const b: any = await Beneficiary.findById(req.params.id);
  if (!b) throw notFound('المستفيد');
  const before = b.toObject();
  const body = clean(req.body);
  if (req.body.nationalId === '') b.nationalId = undefined;
  Object.assign(b, body);
  await b.save();
  const { attachments, ...rest } = body;
  await audit(req.user, 'update', 'Beneficiary', b._id, `تعديل مستفيد ${b.fullName}`, diff(before, rest));
  res.json(b);
}));

// ---------------- Audit log ----------------
export const auditRoutes = Router();
auditRoutes.use(requireAuth);
auditRoutes.get('/', validate(z.object({ ...pageQuery, entity: z.string().optional(), action: z.string().optional(), q: z.string().optional(), from: dateIn.optional(), to: dateIn.optional() }), 'query'), wrap(async (req, res) => {
  const q = (req as any).validQuery;
  const f: any = {};
  if (q.entity) f.entity = q.entity;
  if (q.action) f.action = q.action;
  if (q.q) f.$or = [{ summary: new RegExp(escapeRe(q.q), 'i') }, { userName: new RegExp(escapeRe(q.q), 'i') }];
  if (q.from || q.to) f.createdAt = { ...(q.from && { $gte: q.from }), ...(q.to && { $lte: q.to }) };
  const [items, total] = await Promise.all([
    AuditLog.find(f).sort({ createdAt: -1 }).skip((q.page - 1) * q.pageSize).limit(q.pageSize).lean(), AuditLog.countDocuments(f),
  ]);
  res.json({ items, ...pageMeta(q.page, q.pageSize, total) });
}));

// ---------------- Settings ----------------
export const settings = Router();
settings.use(requireAuth);
const DEFAULTS: Record<string, unknown> = { orgName: 'الكنيسة القبطية الأرثوذكسية', officeName: 'مكتب الشؤون الاجتماعية', firstInstallmentOffsetMonths: 1 };
settings.get('/', wrap(async (_req, res) => {
  const rows: any[] = await SystemSetting.find().lean();
  const out: Record<string, unknown> = { ...DEFAULTS };
  rows.forEach((r) => (out[r._id] = r.value));
  res.json({ ...out, demoDataPresent: !!(await Beneficiary.exists({ isDemo: true })) });
}));
settings.put('/', requireRole('admin'), validate(z.object({
  orgName: z.string().min(2).optional(), officeName: z.string().min(2).optional(), firstInstallmentOffsetMonths: z.number().int().min(0).max(3).optional(),
})), wrap(async (req, res) => {
  for (const [k, v] of Object.entries(req.body)) await SystemSetting.updateOne({ _id: k }, { value: v }, { upsert: true });
  await audit(req.user, 'update', 'SystemSetting', 'settings', 'تعديل إعدادات النظام', req.body);
  res.json({ ok: true });
}));
