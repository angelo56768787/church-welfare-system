import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '../lib/api';
import { dateTimeAr } from '../lib/format';
import { Badge, Card, Column, DataTable, Empty, ErrorBox, FilterBar, LoadingBlock, PageHeader, Pagination, useDebounced } from '../components/ui';

const ENT: Record<string, string> = { Beneficiary: 'مستفيد', Church: 'كنيسة', AssistanceRecord: 'مساعدة', Loan: 'قرض', Repayment: 'سداد', SystemSetting: 'إعدادات', User: 'مستخدم' };
const ACT: Record<string, string> = { create: 'إنشاء', update: 'تعديل', delete: 'حذف', pay: 'صرف', generate: 'إنشاء جماعي', login: 'دخول' };

export default function Audit() {
  const [entity, setEntity] = useState(''); const [action, setAction] = useState(''); const [q, setQ] = useState(''); const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const dq = useDebounced(q);
  useEffect(() => setPage(1), [entity, action, dq]);
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['audit', entity, action, dq, page], queryFn: () => get('/audit', { entity, action, q: dq, page, pageSize: 20 }), placeholderData: (p) => p });
  const cols: Column<any>[] = [
    { key: 't', header: 'الوقت', render: (r) => <span className="text-xs">{dateTimeAr(r.createdAt)}</span> }, { key: 'u', header: 'المستخدم', render: (r) => r.userName },
    { key: 'a', header: 'العملية', render: (r) => <Badge tone={r.action === 'delete' ? 'red' : r.action === 'pay' ? 'green' : 'blue'}>{ACT[r.action] ?? r.action}</Badge> }, { key: 'e', header: 'السجل', render: (r) => ENT[r.entity] ?? r.entity },
    { key: 's', header: 'التفاصيل', render: (r) => (
      <div><p>{r.summary}</p>{r.changes && Object.keys(r.changes).length > 0 && <button className="mt-1 text-xs text-brand" onClick={() => setOpen(open === r._id ? null : r._id)}>{open === r._id ? 'إخفاء التغييرات' : 'عرض التغييرات'}</button>}
        {open === r._id && <pre dir="ltr" className="mt-2 max-w-full overflow-x-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-left text-[11px]">{JSON.stringify(r.changes, null, 2)}</pre>}</div>) },
  ];
  return (
    <>
      <PageHeader title="سجل العمليات" subtitle="سجل دائم لا يمكن تعديله لكل العمليات المهمة" />
      <Card>
        <FilterBar>
          <input className="input" placeholder="بحث في التفاصيل أو المستخدم" value={q} onChange={(e) => setQ(e.target.value)} aria-label="بحث" />
          <select className="input" value={entity} onChange={(e) => setEntity(e.target.value)} aria-label="السجل"><option value="">كل السجلات</option>{Object.entries(ENT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select className="input" value={action} onChange={(e) => setAction(e.target.value)} aria-label="العملية"><option value="">كل العمليات</option>{Object.entries(ACT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </FilterBar>
        {isLoading ? <LoadingBlock /> : isError ? <ErrorBox error={error} retry={refetch} /> : data.items.length === 0 ? <Empty text="لا توجد عمليات مسجلة" /> : (<><DataTable columns={cols} rows={data.items} rowKey={(r) => r._id} /><Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} /></>)}
      </Card>
    </>
  );
}
