import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus } from 'lucide-react';
import { get, patch, post, put } from '../lib/api';
import { Badge, Card, Field, LoadingBlock, Modal, PageHeader } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useSettings } from '../hooks/useData';
import { useToast } from '../components/Toast';

function GeneralSettings() {
  const { data } = useSettings(); const qc = useQueryClient(); const toast = useToast(); const { user } = useAuth();
  const [f, setF] = useState({ orgName: '', officeName: '', firstInstallmentOffsetMonths: 1 });
  useEffect(() => { if (data) setF({ orgName: data.orgName, officeName: data.officeName, firstInstallmentOffsetMonths: data.firstInstallmentOffsetMonths }); }, [data]);
  const m = useMutation({ mutationFn: () => put('/settings', f), onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); toast.ok('تم حفظ الإعدادات'); }, onError: (e: any) => toast.err(e.message) });
  if (!data) return <LoadingBlock rows={3} />;
  const admin = user?.role === 'admin';
  return (
    <Card title="الإعدادات العامة">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="اسم الجهة"><input className="input" value={f.orgName} onChange={(e) => setF({ ...f, orgName: e.target.value })} disabled={!admin} /></Field>
        <Field label="اسم المكتب"><input className="input" value={f.officeName} onChange={(e) => setF({ ...f, officeName: e.target.value })} disabled={!admin} /></Field>
        <Field label="أول قسط يستحق بعد (أشهر من تاريخ القرض)" hint="يُطبق على القروض الجديدة فقط"><select className="input" value={f.firstInstallmentOffsetMonths} onChange={(e) => setF({ ...f, firstInstallmentOffsetMonths: Number(e.target.value) })} disabled={!admin}>{[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n === 0 ? 'في نفس شهر القرض' : `${n} شهر`}</option>)}</select></Field>
      </div>
      {admin ? <div className="mt-4 flex justify-end"><button className="btn-primary" onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending && <Loader2 size={16} className="animate-spin" />}حفظ</button></div> : <p className="mt-3 text-xs text-muted">التعديل متاح لمدير النظام فقط.</p>}
      {data.demoDataPresent && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">توجد بيانات تجريبية في النظام (موسومة بشارة "تجريبي"). أُنشئت بأمر seed:demo.</p>}
    </Card>
  );
}

function UserForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient(); const toast = useToast();
  const [f, setF] = useState({ name: '', username: '', password: '', role: 'staff' }); const [err, setErr] = useState('');
  useEffect(() => { if (open) { setF({ name: '', username: '', password: '', role: 'staff' }); setErr(''); } }, [open]);
  const m = useMutation({ mutationFn: () => post('/users', f), onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.ok('تم إنشاء المستخدم'); onClose(); }, onError: (e: any) => setErr(e.message) });
  return (
    <Modal open={open} onClose={onClose} title="مستخدم جديد">
      <div className="space-y-4">
        <Field label="الاسم"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="اسم المستخدم"><input className="input" dir="ltr" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></Field>
        <Field label="كلمة المرور (8 أحرف على الأقل)"><input className="input" dir="ltr" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        <Field label="الصلاحية"><select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="staff">موظف</option><option value="admin">مدير</option></select></Field>
        {err && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
        <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={onClose}>إلغاء</button><button className="btn-primary" onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending && <Loader2 size={16} className="animate-spin" />}إنشاء</button></div>
      </div>
    </Modal>
  );
}

function Users() {
  const qc = useQueryClient(); const toast = useToast(); const { user } = useAuth();
  const [add, setAdd] = useState(false);
  const { data } = useQuery({ queryKey: ['users'], queryFn: () => get('/users').then((r) => r.items) });
  const tog = useMutation({ mutationFn: (u: any) => patch(`/users/${u._id}`, { active: !u.active }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.ok('تم التحديث'); }, onError: (e: any) => toast.err(e.message) });
  return (
    <Card title="المستخدمون والصلاحيات" action={<button className="btn-primary !py-1.5" onClick={() => setAdd(true)}><Plus size={16} />مستخدم</button>}>
      {!data ? <LoadingBlock rows={3} /> : <ul className="divide-y divide-slate-100 text-sm">{data.map((u: any) => (
        <li key={u._id} className="flex items-center justify-between gap-3 py-3"><div><p className="font-medium">{u.name}</p><p className="num text-xs text-muted">{u.username}</p></div>
          <div className="flex items-center gap-2"><Badge tone={u.role === 'admin' ? 'blue' : 'gray'}>{u.role === 'admin' ? 'مدير' : 'موظف'}</Badge><Badge tone={u.active ? 'green' : 'red'}>{u.active ? 'نشط' : 'معطل'}</Badge>
            {u._id !== user?.id && <button className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => tog.mutate(u)}>{u.active ? 'تعطيل' : 'تفعيل'}</button>}</div></li>))}</ul>}
      <p className="mt-3 text-xs text-muted">المدير: كل الصلاحيات بما فيها المستخدمون والإعدادات. الموظف: العمليات اليومية فقط.</p>
      <UserForm open={add} onClose={() => setAdd(false)} />
    </Card>
  );
}

function Password() {
  const toast = useToast(); const [f, setF] = useState({ current: '', next: '' });
  const m = useMutation({ mutationFn: () => post('/auth/change-password', f), onSuccess: () => { toast.ok('تم تغيير كلمة المرور'); setF({ current: '', next: '' }); }, onError: (e: any) => toast.err(e.message) });
  return (
    <Card title="تغيير كلمة المرور">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="الحالية"><input className="input" dir="ltr" type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} /></Field>
        <Field label="الجديدة (8 أحرف على الأقل)"><input className="input" dir="ltr" type="password" autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} /></Field>
      </div>
      <div className="mt-4 flex justify-end"><button className="btn-primary" disabled={m.isPending || !f.current || f.next.length < 8} onClick={() => m.mutate()}>تغيير</button></div>
    </Card>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  return (<><PageHeader title="إعدادات النظام" /><div className="space-y-5"><GeneralSettings />{user?.role === 'admin' && <Users />}<Password /></div></>);
}
