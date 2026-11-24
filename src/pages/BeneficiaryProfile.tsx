import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react';
import { get, patch } from '../lib/api';
import { dateAr, monthLabel, ASSIST_STATUS } from '../lib/format';
import { Badge, Breakdown, Card, Column, DataTable, DemoBadge, Empty, ErrorBox, LoadingBlock, Money, PageHeader, StatusBadge } from '../components/ui';
import { BeneficiaryForm } from './Beneficiaries';
import { useToast } from '../components/Toast';

const TABS = [['assistance', 'المساعدات'], ['loans', 'القروض'], ['installments', 'جدول الأقساط'], ['repayments', 'السداد'], ['transactions', 'المعاملات'], ['attachments', 'المرفقات']] as const;
const TX: Record<string, string> = { assistance_payment: 'صرف مساعدة', loan_disbursement: 'صرف قرض', repayment: 'سداد قسط', assistance_deduction: 'خصم من المساعدة' };

function Info({ label, children }: { label: string; children: React.ReactNode }) { return <div><dt className="text-xs text-muted">{label}</dt><dd className="mt-0.5 text-sm font-medium">{children || '—'}</dd></div>; }

export default function BeneficiaryProfile() {
  const { id } = useParams();
  const qc = useQueryClient(); const toast = useToast();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('assistance');
  const [edit, setEdit] = useState(false);
  const [att, setAtt] = useState({ name: '', url: '' });
  const { data: b, isLoading, isError, error, refetch } = useQuery({ queryKey: ['beneficiary', id], queryFn: () => get(`/beneficiaries/${id}`) });
  const saveAtt = useMutation({
    mutationFn: (list: any[]) => patch(`/beneficiaries/${id}`, { attachments: list.map(({ name, url }) => ({ name, url })) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['beneficiary', id] }); setAtt({ name: '', url: '' }); toast.ok('تم تحديث المرفقات'); },
    onError: (e: any) => toast.err(e.message),
  });
  if (isLoading) return <LoadingBlock rows={8} />;
  if (isError) return <ErrorBox error={error} retry={refetch} />;
  const activeLoans = b.loans.filter((l: any) => l.status === 'active');
  const cur = new Date().toISOString().slice(0, 7);
  const curAssist = b.assistance.find((a: any) => a.period === cur);
  const loanCols: Column<any>[] = [
    { key: 'r', header: 'رقم القرض', render: (l) => <Link className="font-medium text-brand" to={`/loans/${l._id}`}>{l.reference}</Link> },
    { key: 'd', header: 'التاريخ', render: (l) => dateAr(l.loanDate) }, { key: 'a', header: 'المبلغ', render: (l) => <Money v={l.amount} /> },
    { key: 'p', header: 'المسدد', render: (l) => <Money v={l.totalRepaid} /> }, { key: 'm', header: 'المتبقي', render: (l) => <Money v={l.remainingBalance} strong tone="red" /> }, { key: 's', header: 'الحالة', render: (l) => <StatusBadge value={l.status} /> },
  ];
  return (
    <div className="space-y-5">
      <Link to="/beneficiaries" className="inline-flex items-center gap-1 text-sm text-muted hover:text-brand"><ArrowRight size={16} />كل المستفيدين</Link>
      <PageHeader title={b.fullName} subtitle={`${b.code} · ${b.church?.name ?? ''}`} actions={<button className="btn-ghost" onClick={() => setEdit(true)}><Pencil size={16} />تعديل</button>} />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="البيانات الشخصية" className="lg:col-span-1">
          <dl className="grid grid-cols-2 gap-4">
            <Info label="الحالة"><StatusBadge value={b.status} /> {b.isDemo && <DemoBadge />}</Info>
            <Info label="الكنيسة">{b.church?.name}</Info>
            <Info label="القطاع">{b.sector}</Info>
            <Info label="تاريخ التسجيل">{dateAr(b.registrationDate)}</Info>
            <Info label="الهاتف"><span className="num">{b.phone}</span></Info>
            <Info label="الرقم القومي"><span className="num">{b.nationalId}</span></Info>
            <div className="col-span-2"><Info label="العنوان">{b.address}</Info></div>
            <div className="col-span-2"><Info label="ملاحظات">{b.notes}</Info></div>
          </dl>
        </Card>
        <Card title="الوضع المالي" className="lg:col-span-2">
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-sm text-muted">المساعدة الشهرية المقررة: {b.monthlyAssistance ? <Money v={b.monthlyAssistance} strong /> : 'لا توجد'}</p>
              {curAssist ? (<><p className="mb-2 text-xs text-muted">شهر {monthLabel(curAssist.period)} · <Badge tone={curAssist.paymentStatus === 'paid' ? 'green' : 'orange'}>{ASSIST_STATUS[curAssist.paymentStatus]}</Badge></p><Breakdown original={curAssist.originalAmount} deduction={curAssist.deductionAmount} net={curAssist.netAmount} /></>) : b.monthlyAssistance > 0 ? <p className="text-xs text-muted">لم تُنشأ مساعدة الشهر الحالي بعد (من صفحة الاستحقاقات).</p> : null}
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-muted">قروض نشطة</p><p className="num text-lg font-bold">{activeLoans.length}</p></div>
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-muted">إجمالي المسدد</p><Money v={b.loans.reduce((s: number, l: any) => s + l.totalRepaid, 0)} strong /></div>
              <div className="rounded-xl bg-red-50 p-3"><p className="text-xs text-muted">المتبقي على القروض</p><Money v={activeLoans.reduce((s: number, l: any) => s + l.remainingBalance, 0)} strong tone="red" /></div>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <div className="-mx-1 mb-4 flex gap-1 overflow-x-auto pb-1" role="tablist">
          {TABS.map(([k, label]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium ${tab === k ? 'bg-brand text-white' : 'text-muted hover:bg-slate-100'}`}>{label}</button>)}
        </div>
        {tab === 'assistance' && (b.assistance.length === 0 ? <Empty text="لا توجد سجلات مساعدة" /> : <DataTable rows={b.assistance} rowKey={(r: any) => r._id} columns={[
          { key: 'p', header: 'الشهر', render: (r: any) => monthLabel(r.period) }, { key: 'o', header: 'المساعدة الأصلية', render: (r: any) => <Money v={r.originalAmount} /> },
          { key: 'd', header: 'خصم القسط', render: (r: any) => <Money v={r.deductionAmount} tone={r.deductionAmount ? 'red' : undefined} /> }, { key: 'n', header: 'الصافي', render: (r: any) => <Money v={r.netAmount} strong tone="green" /> },
          { key: 's', header: 'الحالة', render: (r: any) => <Badge tone={r.paymentStatus === 'paid' ? 'green' : 'orange'}>{ASSIST_STATUS[r.paymentStatus]}</Badge> }, { key: 'pd', header: 'تاريخ الصرف', render: (r: any) => dateAr(r.paymentDate) },
        ]} />)}
        {tab === 'loans' && (b.loans.length === 0 ? <Empty text="لا توجد قروض" /> : <DataTable rows={b.loans} rowKey={(r: any) => r._id} columns={loanCols} />)}
        {tab === 'installments' && (b.installments.length === 0 ? <Empty text="لا توجد أقساط نشطة" /> : <DataTable rows={b.installments} rowKey={(r: any) => r._id} columns={[
          { key: 'l', header: 'القرض', render: (r: any) => r.loanReference }, { key: 'n', header: 'القسط', render: (r: any) => <span className="num">{r.number}</span> }, { key: 'd', header: 'الاستحقاق', render: (r: any) => dateAr(r.dueDate) },
          { key: 'a', header: 'القيمة', render: (r: any) => <Money v={r.amount} /> }, { key: 'p', header: 'المسدد', render: (r: any) => <Money v={r.paid} /> }, { key: 'm', header: 'المتبقي', render: (r: any) => <Money v={r.remaining} strong /> }, { key: 's', header: 'الحالة', render: (r: any) => <StatusBadge value={r.status} /> },
        ]} />)}
        {tab === 'repayments' && (b.repayments.length === 0 ? <Empty text="لا توجد عمليات سداد" /> : <DataTable rows={b.repayments} rowKey={(r: any) => r._id} columns={[
          { key: 'd', header: 'التاريخ', render: (r: any) => dateAr(r.date) }, { key: 'r', header: 'المرجع', render: (r: any) => <span className="num">{r.reference}</span> }, { key: 'l', header: 'القرض', render: (r: any) => r.loan?.reference },
          { key: 's', header: 'المصدر', render: (r: any) => <StatusBadge value={r.source} /> }, { key: 'a', header: 'المبلغ', render: (r: any) => <Money v={r.amount} strong /> },
        ]} />)}
        {tab === 'transactions' && (b.transactions.length === 0 ? <Empty text="لا توجد معاملات" /> : <DataTable rows={b.transactions} rowKey={(r: any) => r._id} columns={[
          { key: 'd', header: 'التاريخ', render: (r: any) => dateAr(r.date) }, { key: 'r', header: 'المرجع', render: (r: any) => <span className="num">{r.reference}</span> }, { key: 't', header: 'النوع', render: (r: any) => TX[r.type] },
          { key: 'a', header: 'المبلغ', render: (r: any) => <Money v={r.amount} strong tone={r.direction === 'in' ? 'green' : undefined} /> },
        ]} />)}
        {tab === 'attachments' && (
          <div className="space-y-4">
            <p className="text-xs text-muted">تُحفظ المرفقات كروابط لمستندات مخزنة خارجيًا (مثل Google Drive).</p>
            {b.attachments?.length ? <ul className="divide-y divide-slate-100 text-sm">{b.attachments.map((a: any, i: number) => (
              <li key={a._id ?? i} className="flex items-center justify-between gap-3 py-2.5"><a href={a.url} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 text-brand"><ExternalLink size={15} /><span className="truncate">{a.name}</span></a>
                <button aria-label="حذف المرفق" className="rounded-lg p-2 text-muted hover:bg-red-50 hover:text-red-600" onClick={() => saveAtt.mutate(b.attachments.filter((_: any, j: number) => j !== i))}><Trash2 size={16} /></button></li>))}</ul> : <Empty text="لا توجد مرفقات" />}
            <form className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]" onSubmit={(e) => { e.preventDefault(); saveAtt.mutate([...(b.attachments ?? []), att]); }}>
              <input className="input" placeholder="اسم المستند" value={att.name} onChange={(e) => setAtt({ ...att, name: e.target.value })} required />
              <input className="input" dir="ltr" type="url" placeholder="https://..." value={att.url} onChange={(e) => setAtt({ ...att, url: e.target.value })} required />
              <button className="btn-primary" disabled={saveAtt.isPending}><Plus size={16} />إضافة</button>
            </form>
          </div>
        )}
      </Card>
      <BeneficiaryForm open={edit} initial={b} onClose={() => setEdit(false)} />
    </div>
  );
}
