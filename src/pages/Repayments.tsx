import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, Plus } from 'lucide-react';
import { get } from '../lib/api';
import { dateAr, fromMinor } from '../lib/format';
import { exportXlsx, fetchAll } from '../lib/export';
import { Card, Column, DataTable, Empty, ErrorBox, FilterBar, LoadingBlock, Money, PageHeader, Pagination, StatusBadge } from '../components/ui';
import { BeneficiaryPicker, ChurchSelect } from '../components/Pickers';
import RepaymentDialog from '../components/RepaymentDialog';

export default function Repayments() {
  const [sp] = useSearchParams();
  const [dlg, setDlg] = useState(sp.get('new') === '1');
  const [church, setChurch] = useState(''); const [ben, setBen] = useState<any>(null); const [source, setSource] = useState('');
  const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [church, ben, source, from, to]);
  const query = { church, beneficiary: ben?._id, source, from, to };
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['repayments', query, page], queryFn: () => get('/repayments', { ...query, page, pageSize: 15 }), placeholderData: (p) => p });
  const cols: Column<any>[] = [
    { key: 'd', header: 'التاريخ', render: (r) => dateAr(r.date) }, { key: 'r', header: 'المرجع', render: (r) => <span className="num">{r.reference}</span> },
    { key: 'b', header: 'المستفيد', render: (r) => r.beneficiary?.fullName }, { key: 'l', header: 'القرض', render: (r) => <span className="num">{r.loan?.reference}</span> },
    { key: 's', header: 'المصدر', render: (r) => <StatusBadge value={r.source} /> }, { key: 'a', header: 'المبلغ', render: (r) => <Money v={r.amount} strong /> },
  ];
  const exp = async () => exportXlsx('عمليات السداد', [{ header: 'التاريخ', value: (r) => dateAr(r.date) }, { header: 'المرجع', value: (r) => r.reference }, { header: 'المستفيد', value: (r) => r.beneficiary?.fullName }, { header: 'القرض', value: (r) => r.loan?.reference }, { header: 'المصدر', value: (r) => (r.source === 'cash' ? 'نقدي' : 'خصم من المساعدة') }, { header: 'المبلغ (ج.م)', value: (r) => fromMinor(r.amount) }], await fetchAll('/repayments', query));
  return (
    <>
      <PageHeader title="عمليات السداد" subtitle="كل عملية سداد مسجلة وقابلة للتتبع" actions={<><button className="btn-ghost" onClick={exp}><Download size={16} />تصدير Excel</button><button className="btn-primary" onClick={() => setDlg(true)}><Plus size={16} />تسجيل سداد</button></>} />
      <Card>
        <FilterBar>
          <BeneficiaryPicker value={ben} onChange={setBen} placeholder="فلتر بالمستفيد..." />
          <ChurchSelect value={church} onChange={setChurch} />
          <select className="input" value={source} onChange={(e) => setSource(e.target.value)} aria-label="المصدر"><option value="">كل المصادر</option><option value="cash">سداد نقدي</option><option value="assistance_deduction">خصم من المساعدة</option></select>
          <div className="grid grid-cols-2 gap-2"><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="من" /><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} aria-label="إلى" /></div>
        </FilterBar>
        {isLoading ? <LoadingBlock /> : isError ? <ErrorBox error={error} retry={refetch} /> : data.items.length === 0 ? <Empty text="لا توجد عمليات سداد" /> : (
          <><p className="mb-3 text-sm text-muted">إجمالي المطابق للفلتر: <Money v={data.totalAmount} strong /></p><DataTable columns={cols} rows={data.items} rowKey={(r) => r._id} /><Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} /></>
        )}
      </Card>
      <RepaymentDialog open={dlg} onClose={() => setDlg(false)} />
    </>
  );
}
