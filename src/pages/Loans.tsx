import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, Download, Loader2, Plus } from 'lucide-react';
import { get, post } from '../lib/api';
import { dateAr, isoDate, money, toMinor } from '../lib/format';
import { exportXlsx, fetchAll } from '../lib/export';
import { Card, Column, DataTable, DemoBadge, Empty, ErrorBox, Field, FilterBar, LoadingBlock, Modal, Money, PageHeader, Pagination, StatusBadge, useDebounced } from '../components/ui';
import { BeneficiaryPicker, ChurchSelect } from '../components/Pickers';
import { useToast } from '../components/Toast';
import { fromMinor } from '../lib/format';

function LoanForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient(); const toast = useToast(); const nav = useNavigate();
  const [ben, setBen] = useState<any>(null);
  const [f, setF] = useState({ amount: '', loanDate: isoDate(), installmentAmount: '', installmentsCount: '', notes: '' });
  const [err, setErr] = useState('');
  useEffect(() => { if (open) { setBen(null); setErr(''); setF({ amount: '', loanDate: isoDate(), installmentAmount: '', installmentsCount: '', notes: '' }); } }, [open]);
  const amt = toMinor(f.amount || 0), inst = toMinor(f.installmentAmount || 0), n = Number(f.installmentsCount || 0);
  const preview = useMemo(() => {
    if (!amt || !inst || !n || !Number.isInteger(n) || n < 1) return null;
    if (inst * n < amt) return { error: 'قيمة القسط × عدد الأقساط أقل من مبلغ القرض' };
    if (inst * (n - 1) >= amt) return { error: 'عدد الأقساط أكبر من اللازم لهذا المبلغ' };
    return { last: amt - inst * (n - 1), n };
  }, [amt, inst, n]);
  const m = useMutation({
    mutationFn: () => post('/loans', { beneficiary: ben._id, amount: amt, loanDate: f.loanDate, installmentAmount: inst, installmentsCount: n, notes: f.notes || undefined }),
    onSuccess: (l: any) => { qc.invalidateQueries(); toast.ok('تم إنشاء القرض وجدول الأقساط'); onClose(); nav(`/loans/${l._id}`); },
    onError: (e: any) => setErr(e.message),
  });
  const submit = () => {
    if (!ben) return setErr('اختر المستفيد');
    if (!amt || !inst || !n) return setErr('أكمل بيانات القرض');
    if (preview && 'error' in preview) return setErr(preview.error!);
    setErr(''); m.mutate();
  };
  return (
    <Modal open={open} onClose={onClose} title="قرض جديد" wide>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Field label="المستفيد *"><BeneficiaryPicker value={ben} onChange={setBen} /></Field></div>
        <Field label="مبلغ القرض (ج.م) *"><input className="input num" dir="ltr" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="تاريخ القرض *"><input type="date" className="input" value={f.loanDate} onChange={(e) => setF({ ...f, loanDate: e.target.value })} /></Field>
        <Field label="قيمة القسط (ج.م) *"><input className="input num" dir="ltr" inputMode="decimal" value={f.installmentAmount} onChange={(e) => setF({ ...f, installmentAmount: e.target.value })} /></Field>
        <Field label="عدد الأقساط *"><input className="input num" dir="ltr" inputMode="numeric" value={f.installmentsCount} onChange={(e) => setF({ ...f, installmentsCount: e.target.value })} /></Field>
        <div className="sm:col-span-2"><Field label="ملاحظات"><input className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field></div>
        {preview && (
          <p className={`sm:col-span-2 rounded-xl p-3 text-sm ${'error' in preview ? 'bg-red-50 text-red-700' : 'bg-brand-50 text-navy'}`}>
            {'error' in preview ? preview.error : <>الجدول: {preview.n - 1} قسط × {money(inst)} + قسط أخير <b>{money(preview.last)}</b>. أول قسط يستحق بعد شهر من تاريخ القرض.</>}
          </p>
        )}
        {err && <p role="alert" className="sm:col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2"><button className="btn-ghost" onClick={onClose}>إلغاء</button><button className="btn-primary" onClick={submit} disabled={m.isPending}>{m.isPending && <Loader2 size={16} className="animate-spin" />}إنشاء القرض</button></div>
      </div>
    </Modal>
  );
}

export default function Loans() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const [q, setQ] = useState(''); const [church, setChurch] = useState(''); const [status, setStatus] = useState('');
  const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [page, setPage] = useState(1);
  const [form, setForm] = useState(sp.get('new') === '1');
  const dq = useDebounced(q);
  useEffect(() => setPage(1), [dq, church, status, from, to]);
  const query = { q: dq, church, status, from, to };
  const summary = useQuery({ queryKey: ['loan-summary'], queryFn: () => get('/loans/summary') });
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['loans', query, page], queryFn: () => get('/loans', { ...query, page, pageSize: 15 }), placeholderData: (p) => p });
  const cols: Column<any>[] = [
    { key: 'r', header: 'رقم القرض', render: (l) => <span className="num font-medium text-brand">{l.reference}</span> },
    { key: 'b', header: 'المستفيد', render: (l) => <span>{l.beneficiary?.fullName} {l.isDemo && <DemoBadge />}</span> },
    { key: 'c', header: 'الكنيسة', render: (l) => l.church?.name }, { key: 'd', header: 'التاريخ', render: (l) => dateAr(l.loanDate) },
    { key: 'a', header: 'المبلغ', render: (l) => <Money v={l.amount} /> }, { key: 'i', header: 'القسط', render: (l) => <span><Money v={l.installmentAmount} /> × <span className="num">{l.installmentsCount}</span></span> },
    { key: 'p', header: 'المسدد', render: (l) => <Money v={l.totalRepaid} tone="green" /> }, { key: 'm', header: 'المتبقي', render: (l) => <Money v={l.remainingBalance} strong tone={l.remainingBalance ? 'red' : undefined} /> },
    { key: 's', header: 'الحالة', render: (l) => <StatusBadge value={l.status} /> },
  ];
  const s = summary.data;
  const exp = async () => {
    const rows = await fetchAll('/loans', query);
    exportXlsx('القروض', [{ header: 'رقم القرض', value: (r) => r.reference }, { header: 'المستفيد', value: (r) => r.beneficiary?.fullName }, { header: 'الكنيسة', value: (r) => r.church?.name }, { header: 'التاريخ', value: (r) => dateAr(r.loanDate) }, { header: 'المبلغ', value: (r) => fromMinor(r.amount) }, { header: 'القسط', value: (r) => fromMinor(r.installmentAmount) }, { header: 'عدد الأقساط', value: (r) => r.installmentsCount }, { header: 'المسدد', value: (r) => fromMinor(r.totalRepaid) }, { header: 'المتبقي', value: (r) => fromMinor(r.remainingBalance) }, { header: 'الحالة', value: (r) => r.status }], rows);
  };
  return (
    <>
      <PageHeader title="القروض" subtitle="القروض والأقساط والأرصدة المحسوبة من العمليات المسجلة" actions={<>
        <button className="btn-ghost" onClick={exp}><Download size={16} />تصدير Excel</button>
        <button className="btn-primary" onClick={() => setForm(true)}><Plus size={16} />قرض جديد</button></>} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[['إجمالي القروض', s && <Money v={s.totalLoanAmount} strong />], ['القروض النشطة', s && <span className="num font-bold">{s.activeLoans}</span>], ['الأرصدة المتبقية', s && <Money v={s.outstandingBalance} strong tone="red" />], ['السداد المحصل', s && <Money v={s.collected} strong tone="green" />], ['الأقساط المستحقة', s && <span><span className="num font-bold">{s.outstandingInstallments}</span>{s.overdueInstallments > 0 && <span className="text-xs text-red-600"> ({s.overdueInstallments} متأخر)</span>}</span>]].map(([l, v], i) => (
          <div key={i} className="card p-4"><p className="text-xs text-muted">{l as string}</p><div className="mt-1.5 text-lg">{(v as any) ?? <div className="skeleton h-6 w-24" />}</div></div>
        ))}
      </div>
      <Card>
        <FilterBar>
          <input className="input" placeholder="بحث برقم القرض / اسم المستفيد" value={q} onChange={(e) => setQ(e.target.value)} aria-label="بحث" />
          <ChurchSelect value={church} onChange={setChurch} />
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="الحالة"><option value="">كل الحالات</option><option value="active">نشط</option><option value="completed">مكتمل</option><option value="cancelled">ملغي</option></select>
          <div className="grid grid-cols-2 gap-2"><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="من" /><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} aria-label="إلى" /></div>
        </FilterBar>
        {isLoading ? <LoadingBlock /> : isError ? <ErrorBox error={error} retry={refetch} /> : data.items.length === 0 ? <Empty text="لا توجد قروض" hint="أنشئ قرضًا جديدًا من الزر أعلاه" /> : (
          <><DataTable columns={cols} rows={data.items} rowKey={(r) => r._id} onRowClick={(r) => nav(`/loans/${r._id}`)} /><Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} /></>
        )}
      </Card>
      <LoanForm open={form} onClose={() => setForm(false)} />
    </>
  );
}
