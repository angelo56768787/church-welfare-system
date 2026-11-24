import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Banknote, Building2, CalendarClock, CheckCircle2, ClipboardList, Gift, HandCoins, Plus, Receipt, Users, Wallet } from 'lucide-react';
import { get } from '../lib/api';
import { dateAr, dateTimeAr, moneyPlain, monthLabel, num } from '../lib/format';
import { Card, Empty, ErrorBox, LoadingBlock, Money, Skeleton, StatusBadge } from '../components/ui';
import { ChurchSelect } from '../components/Pickers';

const PALETTE = ['#315BBD', '#7C5CE0', '#2E8C7B', '#D5AE6B', '#E07A5F', '#5BA4CF', '#9AA5B8', '#A3C14A'];
const compact = (v: number) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v / 100);
const tip = (v: any) => `${moneyPlain(Number(v))} ج.م`;

function Stat({ label, value, sub, icon, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon: React.ReactNode; tone: string }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-card ${tone}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><p className="text-sm text-muted">{label}</p><p className="mt-2 text-2xl font-bold text-navy">{value}</p>{sub && <p className="mt-1 text-xs text-muted">{sub}</p>}</div>
        <div className="rounded-xl bg-white/80 p-2.5 text-brand">{icon}</div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [church, setChurch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const q = useQuery({ queryKey: ['dashboard', church, from, to], queryFn: () => get('/dashboard', { church, from, to }) });
  const d = q.data; const c = d?.cards;
  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-navy via-[#1f3d78] to-brand p-6 text-white shadow-card sm:p-8">
        <p className="text-xs text-white/70">{new Intl.DateTimeFormat('ar-EG-u-nu-latn', { dateStyle: 'full' }).format(new Date())}</p>
        <h1 className="mt-2 text-xl font-bold sm:text-2xl">مرحبًا بك في نظام إدارة المستفيدين والدعم المالي</h1>
        <p className="mt-1 text-sm text-white/75">معًا .. لدعم مجتمعنا بروح المحبة والعطاء</p>
      </div>

      <div className="no-print grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ChurchSelect value={church} onChange={setChurch} />
        <label className="flex items-center gap-2 text-sm text-muted">من <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="من تاريخ" /></label>
        <label className="flex items-center gap-2 text-sm text-muted">إلى <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} aria-label="إلى تاريخ" /></label>
      </div>

      {q.isError && <ErrorBox error={q.error} retry={() => q.refetch()} />}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {q.isLoading ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28" />) : c && (<>
          <Stat label="عدد الكنائس" value={<span className="num">{num(c.churches)}</span>} icon={<Building2 />} tone="bg-blue-50/70 border-blue-100" />
          <Stat label="عدد المستفيدين" value={<span className="num">{num(c.beneficiaries)}</span>} icon={<Users />} tone="bg-orange-50/70 border-orange-100" />
          <Stat label={`المساعدات الشهرية (${monthLabel(c.currentPeriod)})`} value={<Money v={c.monthlyAssistanceOriginal} />} sub={<>الصافي بعد الخصم: <Money v={c.monthlyAssistanceNet} /></>} icon={<Gift />} tone="bg-emerald-50/70 border-emerald-100" />
          <Stat label="القروض النشطة" value={<span className="num">{num(c.activeLoans)}</span>} sub={<Money v={c.activeLoansAmount} />} icon={<Banknote />} tone="bg-violet-50/70 border-violet-100" />
          <Stat label="الأقساط المستحقة" value={<span className="num">{num(c.outstandingInstallments)}</span>} sub={<><Money v={c.outstandingInstallmentsAmount} /> {c.overdueInstallments > 0 && <span className="text-red-600">({c.overdueInstallments} متأخر)</span>}</>} icon={<CalendarClock />} tone="bg-amber-50/70 border-amber-100" />
          <Stat label="إجمالي السداد المحصل" value={<Money v={c.collectedRepayments} />} icon={<Receipt />} tone="bg-teal-50/70 border-teal-100" />
        </>)}
      </div>

      {d && d.alerts.length > 0 && (
        <Card title="تنبيهات مالية مهمة" icon={<AlertTriangle size={18} className="text-amber-500" />}>
          <ul className="space-y-2 text-sm">
            {d.alerts.map((a: any, i: number) => (
              <li key={i} className={`flex items-center gap-2 rounded-lg px-3 py-2 ${a.level === 'red' ? 'bg-red-50 text-red-700' : a.level === 'orange' ? 'bg-amber-50 text-amber-800' : 'bg-blue-50 text-blue-700'}`}>
                <span>{a.text}{a.level === 'red' && <> (<Money v={c.overdueAmount} />)</>}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="no-print grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[{ to: '/beneficiaries?new=1', label: 'إضافة مستفيد', icon: Plus }, { to: '/loans?new=1', label: 'قرض جديد', icon: Banknote }, { to: '/repayments?new=1', label: 'تسجيل سداد', icon: Receipt }, { to: '/entitlements', label: 'استحقاقات الشهر', icon: Wallet }].map(({ to, label, icon: I }) => (
          <Link key={to} to={to} className="card flex items-center gap-3 p-3.5 text-sm font-medium text-navy transition hover:border-brand hover:shadow-md"><I size={18} className="text-brand" />{label}</Link>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="توزيع المستفيدين حسب الكنيسة" icon={<Building2 size={18} className="text-brand" />}>
          {q.isLoading ? <LoadingBlock rows={4} /> : d.charts.byChurch.length === 0 ? <Empty text="لا يوجد مستفيدون بعد" /> : (
            <div dir="ltr" className="flex flex-col items-center gap-3">
              <div className="relative h-52 w-full">
                <ResponsiveContainer><PieChart><Pie data={d.charts.byChurch} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="90%" paddingAngle={2}>{d.charts.byChurch.map((_: any, i: number) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="num text-2xl font-bold text-navy">{num(c.beneficiaries)}</span><span className="text-xs text-muted">مستفيد</span></div>
              </div>
              <ul dir="rtl" className="w-full space-y-1.5 text-sm">
                {d.charts.byChurch.map((x: any, i: number) => <li key={x.name} className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />{x.name}</span><span className="num text-muted">{x.value} ({Math.round((x.value / c.beneficiaries) * 100)}%)</span></li>)}
              </ul>
            </div>
          )}
        </Card>

        <Card title="الاستحقاقات الشهرية" icon={<HandCoins size={18} className="text-brand" />} className="lg:col-span-1">
          {q.isLoading ? <LoadingBlock rows={4} /> : (
            <div dir="ltr" className="h-64"><ResponsiveContainer><BarChart data={d.charts.assistanceTrend}>
              <CartesianGrid vertical={false} stroke="#eef1f6" /><XAxis dataKey="period" tick={{ fontSize: 11 }} /><YAxis tickFormatter={compact} tick={{ fontSize: 11 }} width={44} />
              <Tooltip formatter={tip} /><Legend formatter={(v) => ({ original: 'المساعدة الأصلية', deduction: 'خصم الأقساط', net: 'الصافي' } as any)[v]} />
              <Bar dataKey="original" fill="#7C5CE0" radius={[4, 4, 0, 0]} /><Bar dataKey="deduction" fill="#E07A5F" radius={[4, 4, 0, 0]} /><Bar dataKey="net" fill="#2E8C7B" radius={[4, 4, 0, 0]} />
            </BarChart></ResponsiveContainer></div>
          )}
        </Card>

        <Card title="نشاط القروض الشهري" icon={<Banknote size={18} className="text-brand" />}>
          {q.isLoading ? <LoadingBlock rows={4} /> : (
            <div dir="ltr" className="h-64"><ResponsiveContainer><BarChart data={d.charts.loanActivity}>
              <CartesianGrid vertical={false} stroke="#eef1f6" /><XAxis dataKey="period" tick={{ fontSize: 11 }} /><YAxis tickFormatter={compact} tick={{ fontSize: 11 }} width={44} />
              <Tooltip formatter={tip} /><Legend formatter={(v) => (v === 'disbursed' ? 'قروض مصروفة' : 'سداد')} />
              <Bar dataKey="disbursed" fill="#315BBD" radius={[4, 4, 0, 0]} /><Bar dataKey="repaid" fill="#D5AE6B" radius={[4, 4, 0, 0]} />
            </BarChart></ResponsiveContainer></div>
          )}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="مقارنات مالية" className="lg:col-span-2">
          {q.isLoading ? <LoadingBlock rows={3} /> : (
            <div dir="ltr" className="h-60"><ResponsiveContainer><LineChart data={d.charts.financialComparison}>
              <CartesianGrid vertical={false} stroke="#eef1f6" /><XAxis dataKey="period" tick={{ fontSize: 11 }} /><YAxis tickFormatter={compact} tick={{ fontSize: 11 }} width={44} /><Tooltip formatter={tip} />
              <Legend formatter={(v) => ({ assistanceNet: 'صافي المساعدات', disbursed: 'قروض مصروفة', repaid: 'سداد' } as any)[v]} />
              <Line dataKey="assistanceNet" stroke="#2E8C7B" strokeWidth={2.5} dot={false} /><Line dataKey="disbursed" stroke="#315BBD" strokeWidth={2.5} dot={false} /><Line dataKey="repaid" stroke="#D5AE6B" strokeWidth={2.5} dot={false} />
            </LineChart></ResponsiveContainer></div>
          )}
        </Card>
        <Card title="إحصاءات السداد">
          {q.isLoading ? <LoadingBlock rows={3} /> : (
            <div className="space-y-3 text-sm">
              {d.charts.repaymentStats.map((r: any, i: number) => (
                <div key={r.name} className="flex items-center justify-between rounded-xl bg-slate-50 p-3"><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full" style={{ background: PALETTE[i * 2] }} />{r.name}</span><Money v={r.value} strong /></div>
              ))}
              <div className="flex items-center justify-between rounded-xl bg-teal-50 p-3 font-semibold text-navy"><span className="flex items-center gap-2"><CheckCircle2 size={16} className="text-teal" />الإجمالي</span><Money v={c.collectedRepayments} strong /></div>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="الأقساط القادمة والمتأخرة" icon={<CalendarClock size={18} className="text-brand" />}>
          {q.isLoading ? <LoadingBlock rows={3} /> : [...d.overdueList.map((x: any) => ({ ...x, status: 'overdue' })), ...d.upcomingInstallments].length === 0 ? <Empty text="لا توجد أقساط قريبة الاستحقاق" /> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {[...d.overdueList.map((x: any) => ({ ...x, status: 'overdue' })), ...d.upcomingInstallments].map((i: any) => (
                <li key={i._id} className="flex items-center justify-between gap-3 py-2.5"><div className="min-w-0"><p className="truncate font-medium">{i.beneficiary?.fullName}</p><p className="text-xs text-muted">قسط <span className="num">{i.number}</span> · {dateAr(i.dueDate)}</p></div><div className="text-left"><Money v={i.remaining} strong /><div><StatusBadge value={i.status} /></div></div></li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="آخر المعاملات المالية" icon={<Receipt size={18} className="text-brand" />}>
          {q.isLoading ? <LoadingBlock rows={3} /> : d.latestTransactions.length === 0 ? <Empty text="لا توجد معاملات بعد" /> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {d.latestTransactions.map((t: any) => (
                <li key={t._id} className="flex items-center justify-between gap-3 py-2.5"><div className="min-w-0"><p className="truncate font-medium">{t.beneficiary?.fullName}</p><p className="text-xs text-muted">{({ assistance_payment: 'صرف مساعدة', loan_disbursement: 'صرف قرض', repayment: 'سداد قسط', assistance_deduction: 'خصم من المساعدة' } as any)[t.type]} · {dateAr(t.date)}</p></div><Money v={t.amount} strong tone={t.direction === 'in' ? 'green' : undefined} /></li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="آخر المستفيدين" icon={<Users size={18} className="text-brand" />} action={<Link className="text-xs text-brand" to="/beneficiaries">عرض الكل</Link>}>
          {q.isLoading ? <LoadingBlock rows={3} /> : d.latestBeneficiaries.length === 0 ? <Empty text="لم يُضف مستفيدون بعد" /> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {d.latestBeneficiaries.map((b: any) => <li key={b._id} className="flex items-center justify-between py-2.5"><Link to={`/beneficiaries/${b._id}`} className="min-w-0"><p className="truncate font-medium hover:text-brand">{b.fullName}</p><p className="text-xs text-muted">{b.church?.name}</p></Link><StatusBadge value={b.status} /></li>)}
            </ul>
          )}
        </Card>
        <Card title="الأنشطة الأخيرة" icon={<ClipboardList size={18} className="text-brand" />} action={<Link className="text-xs text-brand" to="/audit">عرض الكل</Link>}>
          {q.isLoading ? <LoadingBlock rows={3} /> : d.recentActivities.length === 0 ? <Empty text="لا توجد أنشطة" /> : (
            <ul className="space-y-3 text-sm">
              {d.recentActivities.map((a: any) => <li key={a._id} className="flex items-start justify-between gap-3"><span className="min-w-0">{a.summary}</span><span className="shrink-0 text-xs text-muted">{dateTimeAr(a.createdAt)}</span></li>)}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
