import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Loader2, Plus, Trash2, Wallet } from 'lucide-react';
import { del, get, post } from '../lib/api';
import { ASSIST_STATUS, dateAr, fromMinor, isoDate, monthLabel, thisMonth, toMinor } from '../lib/format';
import { exportXlsx, fetchAll } from '../lib/export';
import { Badge, Breakdown, Card, Column, ConfirmDialog, DataTable, Empty, ErrorBox, Field, FilterBar, LoadingBlock, Modal, Money, PageHeader, Pagination, useDebounced } from '../components/ui';
import { BeneficiaryPicker, ChurchSelect } from '../components/Pickers';
import { useToast } from '../components/Toast';

export function useAssistanceActions() {
  const qc = useQueryClient(); const toast = useToast();
  const done = (m: string) => () => { qc.invalidateQueries(); toast.ok(m); };
  const fail = (e: any) => toast.err(e.message);
  return {
    pay: useMutation({ mutationFn: (v: { id: string; date: string }) => post(`/assistance/${v.id}/pay`, { paymentDate: v.date }), onSuccess: done('تم صرف المساعدة وتسجيل الخصم'), onError: fail }),
    remove: useMutation({ mutationFn: (id: string) => del(`/assistance/${id}`), onSuccess: done('تم حذف السجل'), onError: fail }),
    generate: useMutation({ mutationFn: (v: { period: string; church?: string }) => post('/assistance/generate', v), onSuccess: (r: any) => { qc.invalidateQueries(); toast.ok(`تم إنشاء ${r.created} سجل (تخطي ${r.skipped} موجود مسبقًا)`); }, onError: fail }),
  };
}

export function PayDialog({ rec, onClose }: { rec: any | null; onClose: () => void }) {
  const a = useAssistanceActions();
  const [date, setDate] = useState(isoDate());
  useEffect(() => setDate(isoDate()), [rec]);
  return (
    <Modal open={!!rec} onClose={onClose} title="تأكيد صرف المساعدة">
      {rec && <div className="space-y-4 text-sm">
        <p><b>{rec.beneficiary?.fullName ?? rec.beneficiary}</b> · {monthLabel(rec.period)}</p>
        <Breakdown original={rec.originalAmount ?? rec.original} deduction={rec.deductionAmount ?? rec.deduction} net={rec.netAmount ?? rec.net} />
        <p className="text-xs text-muted">سيُسجَّل خصم القسط (إن وجد) كعملية سداد على القرض، وستُقفل هذه المساعدة ولا يمكن تعديلها.</p>
        <Field label="تاريخ الصرف"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={onClose}>إلغاء</button>
          <button className="btn-primary" disabled={a.pay.isPending} onClick={() => a.pay.mutate({ id: rec.recordId ?? rec._id, date }, { onSuccess: onClose })}>{a.pay.isPending && <Loader2 size={16} className="animate-spin" />}تأكيد الصرف</button></div>
      </div>}
    </Modal>
  );
}

function NewAssistance({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient(); const toast = useToast();
  const [ben, setBen] = useState<any>(null); const [period, setPeriod] = useState(thisMonth()); const [amount, setAmount] = useState(''); const [err, setErr] = useState('');
  useEffect(() => { if (open) { setBen(null); setAmount(''); setErr(''); setPeriod(thisMonth()); } }, [open]);
  const m = useMutation({ mutationFn: () => post('/assistance', { beneficiary: ben._id, period, ...(amount ? { originalAmount: toMinor(amount) } : {}) }), onSuccess: () => { qc.invalidateQueries(); toast.ok('تم إنشاء سجل المساعدة'); onClose(); }, onError: (e: any) => setErr(e.message) });
  return (
    <Modal open={open} onClose={onClose} title="إضافة سجل مساعدة">
      <div className="space-y-4">
        <Field label="المستفيد *"><BeneficiaryPicker value={ben} onChange={setBen} /></Field>
        <Field label="الشهر *"><input type="month" className="input" value={period} onChange={(e) => setPeriod(e.target.value)} /></Field>
        <Field label="المبلغ (ج.م)" hint={ben?.monthlyAssistance ? `الافتراضي: المساعدة الشهرية المقررة ${fromMinor(ben.monthlyAssistance)} ج.م` : 'اتركه فارغًا لاستخدام المساعدة الشهرية المقررة'}><input className="input num" dir="ltr" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        {err && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
        <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={onClose}>إلغاء</button><button className="btn-primary" disabled={!ben || m.isPending} onClick={() => m.mutate()}>{m.isPending && <Loader2 size={16} className="animate-spin" />}إنشاء</button></div>
      </div>
    </Modal>
  );
}

export default function Assistance() {
  const a = useAssistanceActions();
  const [period, setPeriod] = useState(''); const [church, setChurch] = useState(''); const [status, setStatus] = useState(''); const [q, setQ] = useState(''); const [page, setPage] = useState(1);
  const [payRec, setPayRec] = useState<any>(null); const [delRec, setDelRec] = useState<any>(null); const [add, setAdd] = useState(false);
  const dq = useDebounced(q);
  useEffect(() => setPage(1), [period, church, status, dq]);
  const query = { period, church, status, q: dq };
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['assistance', query, page], queryFn: () => get('/assistance', { ...query, page, pageSize: 15 }), placeholderData: (p) => p });
  const cols: Column<any>[] = [
    { key: 'b', header: 'المستفيد', render: (r) => <span className="font-medium">{r.beneficiary?.fullName}</span> }, { key: 'c', header: 'الكنيسة', render: (r) => r.church?.name }, { key: 'p', header: 'الشهر', render: (r) => <span className="num">{r.period}</span> },
    { key: 'o', header: 'الأصلية', render: (r) => <Money v={r.originalAmount} /> }, { key: 'd', header: 'خصم القسط', render: (r) => <Money v={r.deductionAmount} tone={r.deductionAmount ? 'red' : undefined} /> }, { key: 'n', header: 'الصافي', render: (r) => <Money v={r.netAmount} strong tone="green" /> },
    { key: 's', header: 'الحالة', render: (r) => <Badge tone={r.paymentStatus === 'paid' ? 'green' : 'orange'}>{ASSIST_STATUS[r.paymentStatus]}</Badge> }, { key: 'pd', header: 'تاريخ الصرف', render: (r) => dateAr(r.paymentDate) },
    { key: 'act', header: 'إجراء', render: (r) => r.paymentStatus === 'pending' ? (
      <div className="flex items-center gap-1"><button className="btn-primary !px-3 !py-1.5 text-xs" onClick={() => setPayRec(r)}><Wallet size={14} />صرف</button>
        <button className="rounded-lg p-2 text-muted hover:bg-red-50 hover:text-red-600" aria-label="حذف" onClick={() => setDelRec(r)}><Trash2 size={16} /></button></div>) : <span className="text-xs text-muted">مقفل</span> },
  ];
  const exp = async () => exportXlsx('المساعدات المالية', [{ header: 'المستفيد', value: (r) => r.beneficiary?.fullName }, { header: 'الكنيسة', value: (r) => r.church?.name }, { header: 'الشهر', value: (r) => r.period }, { header: 'المساعدة الأصلية', value: (r) => fromMinor(r.originalAmount) }, { header: 'خصم القسط', value: (r) => fromMinor(r.deductionAmount) }, { header: 'الصافي', value: (r) => fromMinor(r.netAmount) }, { header: 'الحالة', value: (r) => ASSIST_STATUS[r.paymentStatus] }], await fetchAll('/assistance', query));
  return (
    <>
      <PageHeader title="المساعدات المالية" subtitle="الصافي = المساعدة الأصلية - قسط القرض" actions={<><button className="btn-ghost" onClick={exp}><Download size={16} />تصدير Excel</button><button className="btn-primary" onClick={() => setAdd(true)}><Plus size={16} />سجل مساعدة</button></>} />
      <Card>
        <FilterBar>
          <input className="input" placeholder="بحث بالمستفيد" value={q} onChange={(e) => setQ(e.target.value)} aria-label="بحث" />
          <input type="month" className="input" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="الشهر" />
          <ChurchSelect value={church} onChange={setChurch} />
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="الحالة"><option value="">كل الحالات</option><option value="pending">لم يُصرف</option><option value="paid">تم الصرف</option></select>
        </FilterBar>
        {isLoading ? <LoadingBlock /> : isError ? <ErrorBox error={error} retry={refetch} /> : data.items.length === 0 ? <Empty text="لا توجد سجلات مساعدة" hint="أنشئ سجلات الشهر من صفحة الاستحقاقات المالية" /> : (<>
          <div className="mb-4"><Breakdown original={data.totals.original} deduction={data.totals.deduction} net={data.totals.net} /></div>
          <DataTable columns={cols} rows={data.items} rowKey={(r) => r._id} /><Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} /></>)}
      </Card>
      <PayDialog rec={payRec} onClose={() => setPayRec(null)} />
      <NewAssistance open={add} onClose={() => setAdd(false)} />
      <ConfirmDialog open={!!delRec} danger title="حذف سجل مساعدة" confirmText="حذف" busy={a.remove.isPending} onClose={() => setDelRec(null)} onConfirm={() => a.remove.mutate(delRec._id, { onSuccess: () => setDelRec(null) })}>حذف سجل مساعدة {delRec?.beneficiary?.fullName} لشهر {delRec?.period} (غير مصروف).</ConfirmDialog>
    </>
  );
}
