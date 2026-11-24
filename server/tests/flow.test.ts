import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.USE_MEMORY_DB = '1';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';
process.env.ADMIN_PASSWORD = 'Admin#12345';

let base = '';
let server: any;
let cookie = '';

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
  const sc = res.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json: json as any };
}
const ym = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

before(async () => {
  const { createApp } = await import('../app.js');
  const { connectDb } = await import('../config/db.js');
  const { seedAdmin } = await import('../scripts/seedAdmin.js');
  const app = createApp();
  await connectDb();
  await seedAdmin();
  server = app.listen(0);
  base = `http://localhost:${server.address().port}`;
});
after(() => { server?.close(); setTimeout(() => process.exit(0), 100); });

test('auth is enforced and login works', async () => {
  assert.equal((await api('GET', '/api/beneficiaries')).status, 401);
  assert.equal((await api('POST', '/api/auth/login', { username: 'admin', password: 'wrong' })).status, 401);
  assert.equal((await api('POST', '/api/auth/login', { username: 'admin', password: 'Admin#12345' })).status, 200);
  assert.equal((await api('GET', '/api/auth/me')).json.user.username, 'admin');
});

test('full financial flow: loan, deduction, repayment, duplicates, overpay', async () => {
  const ch = (await api('POST', '/api/churches', { name: 'كنيسة اختبار' })).json;
  const ben = (await api('POST', '/api/beneficiaries', { fullName: 'مستفيد اختبار', church: ch._id, monthlyAssistance: 300000 })).json;
  assert.match(ben.code, /^BN-\d{5}$/);

  // loan 4000 EGP, 800 per installment x 5 ; first due next month
  const loanDate = new Date(); loanDate.setUTCDate(1); loanDate.setUTCMonth(loanDate.getUTCMonth() - 1);
  const bad = await api('POST', '/api/loans', { beneficiary: ben._id, amount: 400000, loanDate, installmentAmount: 80000, installmentsCount: 4 });
  assert.equal(bad.status, 400, 'underfunded schedule rejected');
  const loan = (await api('POST', '/api/loans', { beneficiary: ben._id, amount: 400000, loanDate, installmentAmount: 80000, installmentsCount: 5 })).json;
  assert.equal(loan.installments.length, 5);
  assert.equal(loan.remainingBalance, 400000);
  const first = loan.installments[0];
  assert.equal(first.period, ym(new Date()), 'first installment due in the current month');

  // assistance for the current month: 3000 - 800 = 2200
  const period = ym(new Date());
  const gen = (await api('POST', '/api/assistance/generate', { period })).json;
  assert.equal(gen.created, 1);
  assert.equal((await api('POST', '/api/assistance/generate', { period })).json.created, 0, 'no duplicate monthly assistance');
  const list = (await api('GET', `/api/assistance?period=${period}`)).json;
  assert.equal(list.items[0].originalAmount, 300000);
  assert.equal(list.items[0].deductionAmount, 80000);
  assert.equal(list.items[0].netAmount, 220000);

  // pay -> deduction recorded as repayment exactly once
  const rec = list.items[0];
  const paid = await api('POST', `/api/assistance/${rec._id}/pay`, {});
  assert.equal(paid.status, 200);
  assert.equal(paid.json.netAmount, 220000);
  assert.equal((await api('POST', `/api/assistance/${rec._id}/pay`, {})).status, 409, 'cannot pay twice');
  assert.equal((await api('DELETE', `/api/assistance/${rec._id}`)).status, 400, 'paid record is locked');
  let d = (await api('GET', `/api/loans/${loan._id}`)).json;
  assert.equal(d.totalRepaid, 80000);
  assert.equal(d.installments[0].status, 'paid');
  assert.equal(d.remainingBalance, 320000);

  // cash repayment with idempotency
  const body = { loan: loan._id, amount: 120000, date: new Date(), idempotencyKey: 'key-12345678' };
  const r1 = await api('POST', '/api/repayments', body);
  assert.equal(r1.status, 201);
  const r2 = await api('POST', '/api/repayments', body);
  assert.equal(r2.status, 200);
  assert.equal(r2.json.duplicate, true);
  d = (await api('GET', `/api/loans/${loan._id}`)).json;
  assert.equal(d.totalRepaid, 200000, 'duplicate submission did not double count');
  assert.equal(d.installments[1].status, 'paid');
  assert.equal(d.installments[2].status, 'partial');
  assert.equal(d.installments[2].paid, 40000);

  // overpay rejected
  const over = await api('POST', '/api/repayments', { loan: loan._id, amount: 200001, date: new Date(), idempotencyKey: 'key-over-0001' });
  assert.equal(over.status, 400);

  // settle fully -> completed
  const fin = await api('POST', '/api/repayments', { loan: loan._id, amount: 200000, date: new Date(), idempotencyKey: 'key-final-001' });
  assert.equal(fin.status, 201);
  d = (await api('GET', `/api/loans/${loan._id}`)).json;
  assert.equal(d.status, 'completed');
  assert.equal(d.remainingBalance, 0);
  assert.equal((await api('POST', '/api/repayments', { loan: loan._id, amount: 100, date: new Date(), idempotencyKey: 'key-after-001' })).status, 400);

  // reports + dashboard reconcile with transactions
  const rep = (await api('GET', '/api/reports/loans')).json;
  assert.equal(rep.totals.amount, 400000);
  assert.equal(rep.totals.repaid, 400000);
  assert.equal(rep.totals.remaining, 0);
  const sum = (await api('GET', '/api/reports/monthly-summary')).json;
  assert.equal(sum.totals.deduction, 80000);
  assert.equal(sum.totals.net, 220000);
  assert.equal(sum.totals.cash, 320000);
  const dash = (await api('GET', '/api/dashboard')).json;
  assert.equal(dash.cards.collectedRepayments, 400000);
  assert.equal(dash.cards.beneficiaries, 1);

  // audit trail written
  const au = (await api('GET', '/api/audit')).json;
  assert.ok(au.items.some((a: any) => a.entity === 'Repayment'));
  assert.ok(au.items.some((a: any) => a.entity === 'AssistanceRecord' && a.action === 'pay'));
});

test('validation and authorization', async () => {
  assert.equal((await api('POST', '/api/beneficiaries', { fullName: 'x' })).status, 400);
  assert.equal((await api('POST', '/api/users', { name: 'موظف', username: 'staff1', password: 'Staff#12345', role: 'staff' })).status, 201);
  await api('POST', '/api/auth/logout');
  cookie = '';
  await api('POST', '/api/auth/login', { username: 'staff1', password: 'Staff#12345' });
  assert.equal((await api('GET', '/api/users')).status, 403);
  assert.equal((await api('PUT', '/api/settings', { orgName: 'اسم جديد' })).status, 403);
});
