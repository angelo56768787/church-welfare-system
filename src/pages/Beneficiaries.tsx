import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Download, Eye, Loader2, Pencil, Plus } from 'lucide-react';
import { get, patch, post } from '../lib/api';
import { dateAr, fromMinor, isoDate, money, toMinor } from '../lib/format';
import { exportXlsx, fetchAll } from '../lib/export';
import { Card, Column, DataTable, DemoBadge, Empty, ErrorBox, Field, FilterBar, LoadingBlock, Modal, PageHeader, Pagination, StatusBadge, useDebounced } from '../components/ui';
import { ChurchSelect } from '../components/Pickers';
import { useToast } from '../components/Toast';

const schema = z.object({
  fullName: z.string().min(3, 'الاسم الكامل مطلوب (3 أحرف على الأقل)'),
  nationalId: z.string().regex(/^(\d{14})?$/, 'الرقم القومي يجب أن يكون 14 رقمًا').optional(),
  phone: z.string().optional(), address: z.string().optional(),
  church: z.string().min(1, 'اختر الكنيسة'), sector: z.string().optional(),
  registrationDate: z.string().optional(),
  status: z.enum(['active', 'suspended', 'inactive']),
  monthlyAssistance: z.string().refine((v) => v === '' || (!isNaN(Number(v)) && Number(v) >= 0), 'مبلغ غير صالح').optional(),
  notes: z.string().optional(),
});
type FormT = z.infer<typeof schema>;

export function BeneficiaryForm({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: any }) {
  const qc = useQueryClient(); const toast = useToast();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormT>({ resolver: zodResolver(schema) });
  useEffect(() => {
    if (!open) return;
    reset(initial ? {
      fullName: initial.fullName, nationalId: initial.nationalId ?? '', phone: initial.phone ?? '', address: initial.address ?? '', church: initial.church?._id ?? initial.church ?? '',
      sector: initial.sector ?? '', registrationDate: isoDate(new Date(initial.registrationDate)), status: initial.status, monthlyAssistance: String(fromMinor(initial.monthlyAssistance ?? 0)), notes: initial.notes ?? '',
    } : { fullName: '', nationalId: '', phone: '', address: '', church: '', sector: '', registrationDate: isoDate(), status: 'active', monthlyAssistance: '', notes: '' });
  }, [open, initial, reset]);
  const m = useMutation({
    mutationFn: (v: FormT) => {
      const body = { ...v, monthlyAssistance: toMinor(v.monthlyAssistance || 0), nationalId: v.nationalId || '' };
      return initial ? patch(`/beneficiaries/${initial._id}`, body) : post('/beneficiaries', body);
    },
    onSuccess: () => { qc.invalidateQueries(); toast.ok(initial ? 'تم حفظ التعديلات' : 'تمت إضافة المستفيد'); onClose(); },
    onError: (e: any) => toast.err(e.message),
  });
  return (
    <Modal open={open} onClose={onClose} title={initial ? 'تعديل بيانات مستفيد' : 'إضافة مستفيد'} wide>
      <form onSubmit={handleSubmit((v) => m.mutate(v))} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Field label="الاسم الكامل *" error={errors.fullName?.message}><input className="input" {...register('fullName')} /></Field></div>
        <Field label="الكنيسة *" error={errors.church?.message}><select className="input" {...register('church')}><ChurchOptions /></select></Field>
        <Field label="القطاع / التصنيف"><input className="input" {...register('sector')} /></Field>
        <Field label="الرقم القومي (اختياري)" error={errors.nationalId?.message}><input className="input num" dir="ltr" inputMode="numeric" {...register('nationalId')} /></Field>
        <Field label="رقم الهاتف"><input className="input" dir="ltr" inputMode="tel" {...register('phone')} /></Field>
        <div className="sm:col-span-2"><Field label="العنوان"><input className="input" {...register('address')} /></Field></div>
        <Field label="تاريخ التسجيل"><input type="date" className="input" {...register('registrationDate')} /></Field>
        <Field label="الحالة"><select className="input" {...register('status')}><option value="active">نشط</option><option value="suspended">معلّق</option><option value="inactive">غير نشط</option></select></Field>
        <div className="sm:col-span-2"><Field label="المساعدة الشهرية المقررة (ج.م) - اتركه فارغًا إن لم يكن له مساعدة شهرية" error={errors.monthlyAssistance?.message}><input className="input num" dir="ltr" inputMode="decimal" {...register('monthlyAssistance')} /></Field></div>
        <div className="sm:col-span-2"><Field label="ملاحظات"><textarea className="input min-h-20" {...register('notes')} /></Field></div>
        <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className="btn-ghost" onClick={onClose}>إلغاء</button><button className="btn-primary" disabled={m.isPending}>{m.isPending && <Loader2 size={16} className="animate-spin" />}حفظ</button></div>
      </form>
    </Modal>
  );
}
function ChurchOptions() {
  const { data } = useQuery({ queryKey: ['churches'], queryFn: () => get('/churches').then((r) => r.items) });
  return <><option value="">اختر الكنيسة</option>{(data ?? []).filter((c: any) => c.active).map((c: any) => <option key={c._id} value={c._id}>{c.name}</option>)}</>;
}

export default function Beneficiaries() {
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [church, setChurch] = useState(''); const [status, setStatus] = useState('');
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [sort, setSort] = useState('-createdAt'); const [page, setPage] = useState(1);
  const [form, setForm] = useState<{ open: boolean; row?: any }>({ open: sp.get('new') === '1' });
  const dq = useDebounced(q);
  useEffect(() => setPage(1), [dq, church, status, from, to, sort]);
  useEffect(() => { if (sp.get('q') !== null && sp.get('q') !== q) setQ(sp.get('q') ?? ''); }, [sp]); // header search
  const query = { q: dq, church, status, from, to, sort };
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['beneficiaries', query, page], queryFn: () => get('/beneficiaries', { ...query, page, pageSize: 15 }), placeholderData: (p) => p });
  const [exporting, setExporting] = useState(false);
  const cols: Column<any>[] = [
    { key: 'name', header: 'الاسم', render: (r) => <span className="font-medium">{r.fullName} {r.isDemo && <DemoBadge />}</span> },
    { key: 'code', header: 'الكود', render: (r) => <span className="num text-muted">{r.code}</span> },
    { key: 'church', header: 'الكنيسة', render: (r) => r.church?.name },
    { key: 'sector', header: 'القطاع', render: (r) => r.sector || '—' },
    { key: 'phone', header: 'الهاتف', render: (r) => <span className="num">{r.phone || '—'}</span> },
    { key: 'ma', header: 'المساعدة الشهرية', render: (r) => (r.monthlyAssistance ? money(r.monthlyAssistance) : '—') },
    { key: 'status', header: 'الحالة', render: (r) => <StatusBadge value={r.status} /> },
    { key: 'act', header: 'الإجراءات', hideOnCard: false, render: (r) => (
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <Link to={`/beneficiaries/${r._id}`} className="rounded-lg p-2 text-muted hover:bg-slate-100 hover:text-brand" aria-label="عرض"><Eye size={17} /></Link>
        <button className="rounded-lg p-2 text-muted hover:bg-slate-100 hover:text-brand" aria-label="تعديل" onClick={() => setForm({ open: true, row: r })}><Pencil size={17} /></button>
      </div>) },
  ];
  const doExport = async () => {
    setExporting(true);
    try {
      const rows = await fetchAll('/beneficiaries', query);
      exportXlsx('المستفيدين', [
        { header: 'الكود', value: (r) => r.code }, { header: 'الاسم', value: (r) => r.fullName }, { header: 'الكنيسة', value: (r) => r.church?.name }, { header: 'القطاع', value: (r) => r.sector },
        { header: 'الهاتف', value: (r) => r.phone }, { header: 'الرقم القومي', value: (r) => r.nationalId }, { header: 'العنوان', value: (r) => r.address }, { header: 'المساعدة الشهرية (ج.م)', value: (r) => fromMinor(r.monthlyAssistance) },
        { header: 'الحالة', value: (r) => ({ active: 'نشط', suspended: 'معلّق', inactive: 'غير نشط' } as any)[r.status] }, { header: 'تاريخ التسجيل', value: (r) => dateAr(r.registrationDate) },
      ], rows);
    } finally { setExporting(false); }
  };
  return (
    <>
      <PageHeader title="المستفيدين" subtitle="قائمة المستفيدين المسجلين في الإدارة المركزية" actions={<>
        <button className="btn-ghost" onClick={doExport} disabled={exporting}>{exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}تصدير Excel</button>
        <button className="btn-primary" onClick={() => setForm({ open: true })}><Plus size={16} />إضافة مستفيد</button></>} />
      <Card>
        <FilterBar>
          <input className="input" placeholder="بحث بالاسم / الكود / الهاتف" value={q} onChange={(e) => { setQ(e.target.value); if (sp.get('q')) setSp({}); }} aria-label="بحث" />
          <ChurchSelect value={church} onChange={setChurch} />
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="الحالة"><option value="">كل الحالات</option><option value="active">نشط</option><option value="suspended">معلّق</option><option value="inactive">غير نشط</option></select>
          <select className="input" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="الترتيب"><option value="-createdAt">الأحدث</option><option value="fullName">الاسم (أ-ي)</option><option value="-monthlyAssistance">أعلى مساعدة</option><option value="registrationDate">تاريخ التسجيل</option></select>
          <label className="flex items-center gap-2 text-xs text-muted">من <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="flex items-center gap-2 text-xs text-muted">إلى <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </FilterBar>
        {isLoading ? <LoadingBlock /> : isError ? <ErrorBox error={error} retry={refetch} /> : data.items.length === 0 ? <Empty text="لا يوجد مستفيدون مطابقون" hint="جرّب تغيير الفلاتر أو أضف مستفيدًا جديدًا" /> : (
          <><DataTable columns={cols} rows={data.items} rowKey={(r) => r._id} onRowClick={(r) => nav(`/beneficiaries/${r._id}`)} /><Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} /></>
        )}
      </Card>
      <BeneficiaryForm open={form.open} initial={form.row} onClose={() => setForm({ open: false })} />
    </>
  );
}
