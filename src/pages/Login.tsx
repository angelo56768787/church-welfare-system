import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Cross, Loader2 } from 'lucide-react';
import { post } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { Field } from '../components/ui';

export default function Login() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (!loading && user) return <Navigate to="/" replace />;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { const r = await post('/auth/login', { username, password }); qc.setQueryData(['me'], r.user); nav('/'); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-navy to-[#1d3a6e] p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-3xl bg-white p-7 shadow-2xl">
        <div className="text-center">
          <Cross className="mx-auto text-gold" size={40} strokeWidth={1.6} />
          <h1 className="mt-3 text-lg font-bold text-navy">نظام إدارة المستفيدين والدعم المالي</h1>
          <p className="mt-1 text-xs text-muted">تسجيل الدخول للإدارة المركزية</p>
        </div>
        <Field label="اسم المستخدم"><input className="input" dir="ltr" autoComplete="username" value={username} onChange={(e) => setU(e.target.value)} required autoFocus /></Field>
        <Field label="كلمة المرور"><input className="input" dir="ltr" type="password" autoComplete="current-password" value={password} onChange={(e) => setP(e.target.value)} required /></Field>
        {err && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy && <Loader2 className="animate-spin" size={16} />}دخول</button>
      </form>
    </div>
  );
}
