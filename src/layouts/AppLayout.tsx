import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Banknote, Building2, ClipboardList, Cross, FileBarChart, HandCoins, Home, LogOut, Menu, Receipt, Search, Settings, Users, Wallet, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useSettings } from '../hooks/useData';

const NAV = [
  { to: '/', label: 'الرئيسية', icon: Home, end: true },
  { to: '/beneficiaries', label: 'المستفيدين', icon: Users },
  { to: '/churches', label: 'الكنائس والقطاعات', icon: Building2 },
  { to: '/assistance', label: 'المساعدات المالية', icon: HandCoins },
  { to: '/loans', label: 'القروض', icon: Banknote },
  { to: '/repayments', label: 'عمليات السداد', icon: Receipt },
  { to: '/entitlements', label: 'الاستحقاقات المالية', icon: Wallet },
  { to: '/reports', label: 'التقارير والتحليلات', icon: FileBarChart },
  { to: '/audit', label: 'سجل العمليات', icon: ClipboardList },
  { to: '/settings', label: 'إعدادات النظام', icon: Settings },
];

function SideContent({ onNavigate }: { onNavigate?: () => void }) {
  const { data: settings } = useSettings();
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col items-center gap-2 px-4 pb-5 pt-6 text-center text-white">
        <Cross size={34} className="text-gold" strokeWidth={1.6} />
        <p className="text-sm font-semibold leading-snug">نظام إدارة المستفيدين<br />والدعم المالي</p>
        <p className="text-xs font-medium text-gold">{settings?.orgName}</p>
        <p className="text-[11px] italic text-white/50">Church Welfare System</p>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} onClick={onNavigate}
            className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition ${isActive ? 'bg-brand text-white shadow' : 'text-white/75 hover:bg-white/10 hover:text-white'}`}>
            <Icon size={18} /><span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="px-4 pb-4 text-center"><span className="rounded-lg bg-white/10 px-3 py-1 text-xs text-white/60">v1.0.0</span></div>
    </div>
  );
}

export default function AppLayout() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const nav = useNavigate();
  const { user, logout } = useAuth();
  const { data: settings } = useSettings();
  return (
    <div className="min-h-screen lg:flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 bg-navy lg:block"><SideContent /></aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-navy/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 right-0 w-72 max-w-[85vw] bg-navy shadow-2xl">
            <button aria-label="إغلاق القائمة" className="absolute left-3 top-3 rounded-lg p-1.5 text-white/70 hover:bg-white/10" onClick={() => setOpen(false)}><X size={20} /></button>
            <SideContent onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200/70 bg-white/90 px-3 py-3 backdrop-blur sm:px-6">
          <button aria-label="فتح القائمة" className="rounded-lg p-2 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)}><Menu size={22} /></button>
          <form className="relative min-w-0 flex-1 sm:max-w-md" onSubmit={(e) => { e.preventDefault(); if (q.trim()) nav(`/beneficiaries?q=${encodeURIComponent(q.trim())}`); }}>
            <Search size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="input !rounded-full !bg-bg !py-2 !pr-9" placeholder="ابحث باسم مستفيد أو رقم قومي..." value={q} onChange={(e) => setQ(e.target.value)} aria-label="بحث" />
          </form>
          <div className="hidden min-w-0 text-left leading-tight sm:block ms-auto">
            <p className="truncate text-sm font-semibold text-navy">{settings?.orgName}</p>
            <p className="truncate text-xs text-muted">{settings?.officeName}</p>
          </div>
          <div className="flex items-center gap-2 border-s border-slate-200 ps-3">
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-sm font-medium">{user?.name}</p>
              <p className="text-xs text-muted">{user?.role === 'admin' ? 'مدير النظام' : 'موظف'}</p>
            </div>
            <button onClick={logout} className="rounded-xl p-2 text-muted hover:bg-slate-100 hover:text-red-600" aria-label="تسجيل الخروج" title="تسجيل الخروج"><LogOut size={20} /></button>
          </div>
        </header>
        <main className="mx-auto max-w-[1500px] p-3 sm:p-6"><Outlet /></main>
      </div>
    </div>
  );
}
