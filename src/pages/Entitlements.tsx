import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, Loader2, Sparkles, Wallet } from 'lucide-react';
import { get } from '../lib/api';
import { ASSIST_STATUS, dateAr, fromMinor, monthLabel, thisMonth } from '../lib/format';
import { exportXlsx } from '../lib/export';
import { Badge, Breakdown, Card, Column, DataTable, Empty, ErrorBox, FilterBar, LoadingBlock, Money, PageHeader, useDebounced } from '../components/ui';
import { ChurchSelect } from '../components/Pickers';
import { PayDialog, useAssistanceActions } from './Assistance';

export default function Entitlements() {
  const a = useAssistanceActions();
  const [period, setPeriod] = useState(thisMonth()); const [church, setChurch] = useState(''); const [q, setQ] = useState('');
  const [pay, setPay] = useState<any>(null);
  const dq = useDebounced(q);
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['entitlements', period, church, dq], queryFn: () => get('/assistance/entitlements', { period, church, q: dq }), enabled: !!period });
  const cols: Column<any>[] = [
    { key: 'b', header: 'المستفيد', render: (r) => <Link className="font-medium hover:text-brand" to={`/beneficiaries/${r.beneficiary._id}`}>{r.beneficiary.fullName}</Link> },
    { key: 'c', header: 'الكنيسة', render: (r) => r.church?.name }, { key: 'o', header: 'المساعدة الشهرية', render: (r) => <Money v={r.original} /> },
    { key: 'd', header: 'خصم القسط', render: (r) => <Money v={r.deduction} tone={r.deduction ? 'red' : undefined} /> }, { key: 'n', header: 'الصافي المستحق', render: (r) => <Money v={r.net} strong tone="green" /> },
    { key: 's', header: 'الحالة', render: (r) => <Badge tone={r.status === 'paid' ? 'green' : r.status === 'pending' ? 'orange' : 'gray'}>{ASSIST_STATUS[r.status]}</Badge> },
    { key: 'act', header: 'إجراء', render: (r) => r.status === 'pending' ? <button className="btn-primary !px-3 !py-1.5 text-xs" onClick={() => setPay({ ...r, beneficiary: r.beneficiary, period })}><Wallet size={14} />صرف</button> : r.status === 'paid' ? <span className="text-xs text-muted">{dateAr(r.paymentDate)}</span> : <span className="text-xs text-muted">—</span> },
  ];
  const t = data?.totals;
  return (
    <>
      <PageHeader title="الاستحقاقات المالية" subtitle={`استحقاقات ${monthLabel(period)}: المساعدة - القسط = الصافي`} actions={<>
        <button className="btn-ghost" disabled={!data} onClick={() => exportXlsx(`الاستحقاقات ${period}`, [{ header: 'المستفيد', value: (r) => r.beneficiary.fullName }, { header: 'الكنيسة', value: (r) => r.church?.name }, { header: 'المساعدة الشهرية', value: (r) => fromMinor(r.original) }, { header: 'خصم القسط', value: (r) => fromMinor(r.deduction) }, { header: 'الصافي المستحق', value: (r) => fromMinor(r.net) }, { header: 'الحالة', value: (r) => ASSIST_STATUS[r.status] }], data.items)}><Download size={16} />تصدير Excel</button>
        <button className="btn-primary" disabled={a.generate.isPending || !t?.notGenerated} onClick={() => a.generate.mutate({ period, church: church || undefined })}>{a.generate.isPending ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}إنشاء استحقاقات الشهر{t?.notGenerated ? ` (${t.notGenerated})` : ''}</button></>} />
      <Card>
        <FilterBar>
          <input type="month" className="input" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="الشهر" />
          <ChurchSelect value={church} onChange={setChurch} />
          <input className="input" placeholder="بحث بالمستفيد" value={q} onChange={(e) => setQ(e.target.value)} aria-label="بحث" />
        </FilterBar>
        {isLoading ? <LoadingBlock /> : isError ? <ErrorBox error={error} retry={refetch} /> : data.items.length === 0 ? <Empty text="لا يوجد مستفيدون لهم مساعدة شهرية" hint="حدّد المساعدة الشهرية في ملف المستفيد" /> : (<>
          <div className="mb-4 space-y-3"><Breakdown original={t.original} deduction={t.deduction} net={t.net} />
            <div className="grid grid-cols-2 gap-2 text-center text-sm"><div className="rounded-xl bg-emerald-50 p-2.5"><p className="text-[11px] text-muted">مصروف (صافي)</p><Money v={t.paidNet} strong tone="green" /></div><div className="rounded-xl bg-amber-50 p-2.5"><p className="text-[11px] text-muted">مستحق لم يُصرف</p><Money v={t.pendingNet} strong tone="gold" /></div></div></div>
          <DataTable columns={cols} rows={data.items} rowKey={(r) => r.beneficiary._id} />
          <p className="mt-3 text-xs text-muted">الصفوف "لم يُنشأ" تعرض توقعًا للخصم؛ يُثبَّت الخصم عند إنشاء السجل ويُعاد التحقق منه لحظة الصرف.</p></>)}
      </Card>
      <PayDialog rec={pay} onClose={() => setPay(null)} />
    </>
  );
}
