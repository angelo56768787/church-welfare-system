/**
 * Demo data (clearly flagged isDemo=true, shown with a "تجريبي" badge).
 * All financial records are created through the real services so balances,
 * deductions and audit entries are genuine. Run: npm run seed:demo
 */
import { env } from '../config/env.js';
import { connectDb } from '../config/db.js';
import { seedAdmin } from './seedAdmin.js';
import { Beneficiary, Church, Loan, User } from '../models/index.js';
import { nextCode } from '../lib/codes.js';
import { createLoan, createCashRepayment } from '../modules/loanService.js';
import { createAssistance, markPaid } from '../modules/assistanceService.js';
import { periodOf } from '../lib/period.js';

const CHURCHES = ['كنيسة مارمرقس', 'كنيسة العذراء', 'كنيسة الأنبا أنطونيوس', 'كنيسة القديس بطرس', 'كنيسة مارجرجس', 'كنيسة الملاك ميخائيل', 'كنيسة الأنبا بولا', 'كنيسة مارمينا'];
const FIRST = ['مريم', 'أحمد', 'جورج', 'دينا', 'مينا', 'سارة', 'بيشوي', 'مارتينا', 'كيرلس', 'نادية', 'إسحق', 'هدى', 'رامي', 'سلوى', 'عماد', 'فيفيان', 'مايكل', 'نجلاء', 'ماركو', 'إيمان'];
const LAST = ['فؤاد', 'عبد الله', 'سمير', 'نصحي', 'جرجس', 'يوسف', 'عياد', 'وهبة', 'ميخائيل', 'إبراهيم'];

export async function seedDemo() {
  await connectDb();
  await seedAdmin().catch(() => {});
  if (await Beneficiary.exists({ isDemo: true })) { console.log('[demo] demo data already present, skipping'); return; }
  const admin: any = await User.findOne({ role: 'admin' });
  const actor = { id: String(admin._id), name: admin.name };
  const churches: any[] = [];
  for (const name of CHURCHES) churches.push((await Church.findOne({ name })) ?? (await Church.create({ name, sector: `قطاع ${churches.length % 3 + 1}` })));
  const now = new Date();
  const monthsAgo = (n: number, day = 5) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, day));
  const bens: any[] = [];
  for (let i = 0; i < 40; i++) {
    const c = churches[i % churches.length];
    bens.push(await Beneficiary.create({
      code: await nextCode('BN', 'beneficiary'), fullName: `${FIRST[i % FIRST.length]} ${LAST[(i * 3) % LAST.length]}`, phone: `01${[0, 1, 2, 5][i % 4]}${String(10000000 + i * 137191).slice(0, 8)}`,
      church: c._id, sector: c.sector, registrationDate: monthsAgo(6 - (i % 6)), status: i % 13 === 0 ? 'suspended' : 'active',
      monthlyAssistance: i % 3 === 0 ? 0 : [150000, 200000, 250000, 300000][i % 4], isDemo: true,
    }));
  }
  const active = bens.filter((b) => b.status === 'active');
  // loans: every 3rd active beneficiary, various ages and sizes
  const loans: any[] = [];
  for (let i = 0; i < active.length; i += 3) {
    const b = active[i];
    const age = 1 + (i % 4);
    const amount = [600000, 900000, 1200000, 1500000][i % 4];
    const inst = [100000, 150000, 200000, 250000][i % 4];
    const count = Math.ceil(amount / inst);
    loans.push(await createLoan({ beneficiary: String(b._id), amount, loanDate: monthsAgo(age), installmentAmount: inst, installmentsCount: count }, actor));
  }
  await Loan.updateMany({ _id: { $in: loans.map((l) => l._id) } }, { isDemo: true });
  // some cash repayments (a few beneficiaries pay on time, some pay partially, some are overdue)
  let k = 0;
  for (const l of loans) {
    k++;
    if (k % 4 === 0) continue; // overdue, no payments
    const pay = k % 4 === 1 ? l.installmentAmount : Math.floor(l.installmentAmount / 2);
    await createCashRepayment({ loan: String(l._id), amount: pay, date: monthsAgo(0, 2), idempotencyKey: `demo-${l._id}-1` }, actor);
  }
  // assistance for the last 3 months; older months paid, current month left pending
  for (const b of bens.filter((x) => x.status === 'active' && x.monthlyAssistance > 0)) {
    for (const n of [3, 2, 1, 0]) {
      const period = periodOf(monthsAgo(n, 1));
      try {
        const rec: any = await createAssistance({ beneficiary: String(b._id), period }, actor);
        if (n > 0) await markPaid(String(rec._id), monthsAgo(n, 10), actor);
      } catch (e: any) { console.warn('[demo] skip', b.code, period, e.message); }
    }
  }
  console.log(`[demo] created ${churches.length} churches, ${bens.length} beneficiaries, ${loans.length} loans`);
}

if (process.argv[1]?.endsWith('seedDemo.ts')) {
  seedDemo().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
void env;
