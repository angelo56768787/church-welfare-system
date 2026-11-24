import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { Building2, Eye, Loader2, Pencil, Plus, Power } from 'lucide-react';
import { get, patch, post } from '../lib/api';
import { Badge, Card, Empty, ErrorBox, Field, LoadingBlock, Modal, Money, PageHeader, StatusBadge } from '../components/ui';
import { useToast } from '../components/Toast';

const schema = z.object({ name: z.string().min(2, 'اسم الكنيسة مطلوب'), sector: z.string().optional(), notes: z.string().optional() });
type F = z.infer<typeof schema>;

function ChurchForm({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: any }) {
  const qc = useQueryClient(); const toast = useToast();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<F>({ resolver: zodResolver(schema) });
  useEffect(() => { if (open) reset(initial ? { name: initial.name, sector: initial.sector, notes: initial.notes } : { name: '', sector: '', notes: '' }); }, [open, initial, reset]);
  const m = useMutation({ mutationFn: (v: F) => (initial ? patch(`/churches/${initial._id}`, v) : post('/churches', v)), onSuccess: () => { qc.invalidateQueries(); toast.ok('تم الحفظ'); onClose(); }, onError: (e: any) => toast.err(e.message) });
  return (
    <Modal open={open} onClose={onClose} title={initial ? 'تعديل كنيسة' : 'إضافة كنيسة'}>
      <form onSubmit={handleSubmit((v) => m.mutate(v))} className="space-y-4">
        <Field label="اسم الكنيسة *" error={errors.name?.message}><input className="input" {...register('name')} /></Field>
        <Field label="القطاع / التصنيف"><input className="input" {...register('sector')} /></Field>
        <Field label="ملاحظات"><textarea className="input" {...register('notes')} /></Field>
        <p className="text-xs text-muted">الكنيسة تصنيف تنظيمي فقط؛ جميع العمليات المالية تُدار مركزيًا.</p>
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>إلغاء</button><button className="btn-primary" disabled={m.isPending}>{m.isPending && <Loader2 size={16} className="animate-spin" />}حفظ</button></div>
      </form>
    </Modal>
  );
}

function ChurchDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({ queryKey: ['church', id], queryFn: () => get(`/churches/${id}`), enabled: !!id });
  const s = data?.stats;
  return (
    <Modal open={!!id} onClose={onClose} title={data?.name ?? 'الكنيسة'} wide>
      {isLoading || !s ? <LoadingBlock rows={5} /> : (
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[['المستفيدون النشطون', <span className="num font-bold">{s.beneficiaries}</span>], ['القروض النشطة', <span className="num font-bold">{s.activeLoans}</span>], ['إجمالي القروض', <Money v={s.loansAmount} strong />], ['المساعدات المصروفة (صافي)', <Money v={s.assistanceNet} strong />], ['المسدد', <Money v={s.repaid} strong tone="green" />], ['المتبقي على القروض', <Money v={s.outstanding} strong tone="red" />]].map(([l, v], i) => <div key={i} className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-muted">{l as string}</p>{v as any}</div>)}
          </div>
          <div className="flex justify-end"><Link className="btn-ghost" to={`/reports?type=church-financial&church=${id}`}>تقرير الكنيسة</Link></div>
          <h4 className="font-semibold text-navy">المستفيدون</h4>
          {data.beneficiaries.length === 0 ? <Empty text="لا يوجد مستفيدون" /> : <ul className="divide-y divide-slate-100">{data.beneficiaries.map((b: any) => <li key={b._id} className="flex items-center justify-between py-2"><Link to={`/beneficiaries/${b._id}`} className="hover:text-brand">{b.fullName}</Link><StatusBadge value={b.status} /></li>)}</ul>}
        </div>
      )}
    </Modal>
  );
}

export default function Churches() {
  const qc = useQueryClient(); const toast = useToast();
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['churches'], queryFn: () => get('/churches').then((r) => r.items) });
  const [form, setForm] = useState<{ open: boolean; row?: any }>({ open: false });
  const [view, setView] = useState<string | null>(null);
  const toggle = useMutation({ mutationFn: (c: any) => patch(`/churches/${c._id}`, { active: !c.active }), onSuccess: () => { qc.invalidateQueries(); toast.ok('تم تحديث الحالة'); }, onError: (e: any) => toast.err(e.message) });
  return (
    <>
      <PageHeader title="الكنائس والقطاعات" subtitle="تصنيفات تنظيمية للمستفيدين تحت إدارة مركزية واحدة" actions={<button className="btn-primary" onClick={() => setForm({ open: true })}><Plus size={16} />إضافة كنيسة</button>} />
      {isLoading ? <LoadingBlock /> : isError ? <ErrorBox error={error} retry={refetch} /> : data.length === 0 ? <Card><Empty text="لا توجد كنائس بعد" hint="أضف أول كنيسة لبدء تسجيل المستفيدين" /></Card> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((c: any) => (
            <Card key={c._id}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3"><div className="rounded-xl bg-brand-50 p-2.5 text-brand"><Building2 size={20} /></div><div><h3 className="font-semibold text-navy">{c.name}</h3><p className="text-xs text-muted">{c.sector || 'بدون قطاع'}</p></div></div>
                <Badge tone={c.active ? 'green' : 'gray'}>{c.active ? 'نشطة' : 'غير نشطة'}</Badge>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-xs text-muted">المستفيدون</dt><dd className="num font-semibold">{c.stats.beneficiaries}</dd></div>
                <div><dt className="text-xs text-muted">القروض النشطة</dt><dd className="num font-semibold">{c.stats.activeLoans}</dd></div>
                <div><dt className="text-xs text-muted">المساعدات (صافي)</dt><dd><Money v={c.stats.assistanceNet} strong /></dd></div>
                <div><dt className="text-xs text-muted">المتبقي على القروض</dt><dd><Money v={c.stats.outstanding} strong tone="red" /></dd></div>
              </dl>
              <div className="mt-4 flex gap-2">
                <button className="btn-ghost flex-1" onClick={() => setView(c._id)}><Eye size={16} />عرض</button>
                <button className="btn-ghost" aria-label="تعديل" onClick={() => setForm({ open: true, row: c })}><Pencil size={16} /></button>
                <button className="btn-ghost" aria-label={c.active ? 'تعطيل' : 'تفعيل'} title={c.active ? 'تعطيل' : 'تفعيل'} onClick={() => toggle.mutate(c)}><Power size={16} /></button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <ChurchForm open={form.open} initial={form.row} onClose={() => setForm({ open: false })} />
      <ChurchDetail id={view} onClose={() => setView(null)} />
    </>
  );
}
