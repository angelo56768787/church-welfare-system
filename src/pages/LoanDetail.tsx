import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Receipt } from 'lucide-react';
import { get, patch } from '../lib/api';
import { dateAr } from '../lib/format';
import { Card, ConfirmDialog, DataTable, Empty, ErrorBox, LoadingBlock, Money, PageHeader, StatusBadge } from '../components/ui';
import RepaymentDialog from '../components/RepaymentDialog';
import { useToast } from '../components/Toast';

export default function LoanDetail() {
  const { id } = useParams();
  const qc = useQueryClient(); const toast = useToast();
  const [pay, setPay] = useState(false); const [cancel, setCancel] = useState(false);
  const { data: l, isLoading, isError, error, refetch } = useQuery({ queryKey: ['loan', id], queryFn: () => get(`/loans/${id}`) });
  const cancelM = useMutation({ mutationFn: () => patch(`/loans/${id}`, { status: 'cancelled' }), onSuccess: () => { qc.invalidateQueries(); toast.ok('تم إلغاء القرض'); setCancel(false); }, onError: (e: any) => { toast.err(e.message); setCancel(false); } });
  if (isLoading) return <LoadingBlock rows={8} />;
  if (isError) return <ErrorBox error={error} retry={refetch} />;
  const pct = Math.min(100, Math.round((l.totalRepaid / l.amount) * 100));
  return (
    <div className="space-y-5">
      <Link to="/loans" className="inline-flex items-center gap-1 text-sm text-muted hover:text-brand"><ArrowRight size={16} />كل القروض</Link>
      <PageHeader title={`قرض ${l.reference}`} subtitle={`${l.beneficiary?.fullName} · ${l.church?.name}`} actions={<>
        {l.status === 'active' && <button className="btn-primary" onClick={() => setPay(true)}><Receipt size={16} />تسجيل سداد</button>}
        {l.status === 'active' && l.repayments.length === 0 && <button className="btn-ghost text-red-600" onClick={() => setCancel(true)}>إلغاء القرض</button>}</>} />
      <Card>
        <div className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-5">
          <div><p className="text-xs text-muted">الحالة</p><StatusBadge value={l.status} /></div>
          <div><p className="text-xs text-muted">تاريخ القرض</p><p className="font-medium">{dateAr(l.loanDate)}</p></div>
          <div><p className="text-xs text-muted">قيمة القرض</p><Money v={l.amount} strong /></div>
          <div><p className="text-xs text-muted">المسدد</p><Money v={l.totalRepaid} strong tone="green" /></div>
          <div><p className="text-xs text-muted">المتبقي</p><Money v={l.remainingBalance} strong tone="red" /></div>
        </div>
        <div className="mt-4"><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal" style={{ width: `${pct}%` }} /></div><p className="mt-1 text-xs text-muted"><span className="num">{pct}%</span> مسدد · قسط <Money v={l.installmentAmount} /> × <span className="num">{l.installmentsCount}</span></p></div>
        {l.notes && <p className="mt-3 text-sm text-muted">{l.notes}</p>}
      </Card>
      <Card title="جدول الأقساط">
        <DataTable rows={l.installments} rowKey={(r: any) => r._id} columns={[
          { key: 'n', header: 'القسط', render: (r: any) => <span className="num font-medium">{r.number}</span> }, { key: 'd', header: 'الاستحقاق', render: (r: any) => dateAr(r.dueDate) },
          { key: 'a', header: 'القيمة', render: (r: any) => <Money v={r.amount} /> }, { key: 'p', header: 'المسدد', render: (r: any) => <Money v={r.paid} tone="green" /> }, { key: 'm', header: 'المتبقي', render: (r: any) => <Money v={r.remaining} strong /> }, { key: 's', header: 'الحالة', render: (r: any) => <StatusBadge value={r.status} /> },
        ]} />
      </Card>
      <Card title="سجل السداد">
        {l.repayments.length === 0 ? <Empty text="لا توجد عمليات سداد بعد" /> : <DataTable rows={l.repayments} rowKey={(r: any) => r._id} columns={[
          { key: 'd', header: 'التاريخ', render: (r: any) => dateAr(r.date) }, { key: 'r', header: 'المرجع', render: (r: any) => <span className="num">{r.reference}</span> }, { key: 's', header: 'المصدر', render: (r: any) => <StatusBadge value={r.source} /> }, { key: 'a', header: 'المبلغ', render: (r: any) => <Money v={r.amount} strong /> }, { key: 'n', header: 'ملاحظات', render: (r: any) => r.notes || '—' },
        ]} />}
      </Card>
      <RepaymentDialog open={pay} onClose={() => setPay(false)} presetLoan={l} />
      <ConfirmDialog open={cancel} danger title="إلغاء القرض" confirmText="إلغاء القرض" busy={cancelM.isPending} onClose={() => setCancel(false)} onConfirm={() => cancelM.mutate()}>سيتم إلغاء القرض {l.reference}. لا يمكن التراجع عن ذلك.</ConfirmDialog>
    </div>
  );
}
