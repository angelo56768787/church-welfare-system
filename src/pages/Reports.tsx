import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, Printer } from 'lucide-react';
import { get } from '../lib/api';
import { dateAr, fromMinor, moneyPlain } from '../lib/format';
import { exportXlsx } from '../lib/export';
import { Card, Empty, ErrorBox, Field, LoadingBlock, PageHeader } from '../components/ui';
import { BeneficiaryPicker, ChurchSelect } from '../components/Pickers';

const VALUE_LABELS: Record<string, string> = { active: 'نشط', completed: 'مكتمل', cancelled: 'ملغي', paid: 'مسدد', pending: 'قيد الانتظار', partial: 'مسدد جزئيًا', overdue: 'متأخر', cash: 'نقدي', assistance_deduction: 'خصم من المساعدة', suspended: 'معلّق', inactive: 'غير نشط' };
const STATUS_OPTIONS: Record<string, [string, string][]> = {
  'beneficiaries-by-church': [['active', 'نشط'], ['suspended', 'معلّق'], ['inactive', 'غير نشط']],
  'monthly-assistance': [['pending', 'لم يُصرف'], ['paid', 'تم الصرف']],
  loans: [['active', 'نشط'], ['completed', 'مكتمل'], ['cancelled', 'ملغي']],
  installments: [['paid', 'مسدد'], ['pending', 'قيد الانتظار'], ['partial', 'مسدد جزئيًا'], ['overdue', 'متأخر']],
  repayments: [['cash', 'نقدي'], ['assistance_deduction', 'خصم من المساعدة']],
};

export default function Reports() {
  const [sp] = useSearchParams();
  const list = useQuery({ queryKey: ['report-list'], queryFn: () => get('/reports').then((r) => r.items as { id: string; title: string }[]) });
  const [type, setType] = useState(sp.get('type') ?? 'consolidated');
  const [church, setChurch] = useState(sp.get('church') ?? ''); const [ben, setBen] = useState<any>(null); const [status, setStatus] = useState('');
  const [month, setMonth] = useState(''); const [year, setYear] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const query = { church, beneficiary: ben?._id, status, month, year, from, to };
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['report', type, query], queryFn: () => get(`/reports/${type}`, query) });
  const fmt = (c: any, v: any) => (c.type === 'money' ? `${moneyPlain(v)}` : c.type === 'date' ? dateAr(v) : c.type === 'number' ? v : VALUE_LABELS[v] ?? v ?? '—');
  const doExport = () => data && exportXlsx(data.title, data.columns.map((c: any) => ({ header: c.label, value: (r: any) => (c.type === 'money' ? fromMinor(r[c.key] ?? 0) : c.type === 'date' ? dateAr(r[c.key]) : VALUE_LABELS[r[c.key]] ?? r[c.key]) })), data.rows, data.totals ? ['الإجمالي', ...data.columns.slice(1).map((c: any) => (data.totals[c.key] !== undefined ? (c.type === 'money' ? fromMinor(data.totals[c.key]) : data.totals[c.key]) : ''))] : undefined);
  const st = STATUS_OPTIONS[type];
  return (
    <>
      <PageHeader title="التقارير والتحليلات" subtitle="بيانات حقيقية من قاعدة البيانات، والإجماليات تطابق المعاملات" actions={<><button className="btn-ghost" onClick={doExport} disabled={!data}><Download size={16} />Excel</button><button className="btn-ghost" onClick={() => window.print()} disabled={!data}><Printer size={16} />PDF / طباعة</button></>} />
      <Card className="no-print mb-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="نوع التقرير"><select className="input" value={type} onChange={(e) => { setType(e.target.value); setStatus(''); }}>{(list.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}</select></Field>
          <Field label="الكنيسة"><ChurchSelect value={church} onChange={setChurch} /></Field>
          <Field label="المستفيد"><BeneficiaryPicker value={ben} onChange={setBen} placeholder="كل المستفيدين" /></Field>
          <Field label="الحالة"><select className="input" value={status} onChange={(e) => setStatus(e.target.value)} disabled={!st}><option value="">الكل</option>{(st ?? []).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="الشهر"><input type="month" className="input" value={month} onChange={(e) => { setMonth(e.target.value); setYear(''); }} /></Field>
          <Field label="السنة"><input className="input num" dir="ltr" inputMode="numeric" placeholder="2026" value={year} onChange={(e) => { setYear(e.target.value.replace(/\D/g, '').slice(0, 4)); setMonth(''); }} /></Field>
          <Field label="من تاريخ"><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} disabled={!!month || !!year} /></Field>
          <Field label="إلى تاريخ"><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} disabled={!!month || !!year} /></Field>
        </div>
      </Card>
      <Card title={data?.title}>
        {isLoading ? <LoadingBlock /> : isError ? <ErrorBox error={error} retry={refetch} /> : data.rows.length === 0 ? <Empty text="لا توجد بيانات لهذه الفلاتر" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-slate-50 text-xs text-muted">{data.columns.map((c: any) => <th key={c.key} className="whitespace-nowrap px-3 py-2.5 text-right font-medium">{c.label}</th>)}</tr></thead>
              <tbody>{data.rows.map((r: any, i: number) => <tr key={i} className="border-b border-slate-100">{data.columns.map((c: any) => <td key={c.key} className="whitespace-nowrap px-3 py-2.5">{c.type === 'money' || c.type === 'number' ? <span className="num">{fmt(c, r[c.key])}</span> : fmt(c, r[c.key])}</td>)}</tr>)}</tbody>
              {data.totals && <tfoot><tr className="bg-brand-50 font-semibold text-navy">{data.columns.map((c: any, i: number) => <td key={c.key} className="whitespace-nowrap px-3 py-2.5">{i === 0 ? `الإجمالي (${data.rows.length})` : data.totals[c.key] !== undefined ? <span className="num">{fmt(c, data.totals[c.key])}</span> : ''}</td>)}</tr></tfoot>}
            </table>
            <p className="mt-3 text-xs text-muted">المبالغ بالجنيه المصري. تاريخ الإنشاء: {dateAr(data.generatedAt)}</p>
          </div>
        )}
      </Card>
    </>
  );
}
