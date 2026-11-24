import { ReactNode, useEffect, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, Loader2, X } from 'lucide-react';
import { STATUS } from '../lib/format';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-xl font-bold text-navy sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 no-print">{actions}</div>}
    </div>
  );
}

const TONES = { green: 'bg-emerald-50 text-emerald-700 ring-emerald-200', orange: 'bg-amber-50 text-amber-700 ring-amber-200', red: 'bg-red-50 text-red-700 ring-red-200', blue: 'bg-blue-50 text-blue-700 ring-blue-200', gray: 'bg-slate-100 text-slate-600 ring-slate-200' };
export function Badge({ tone = 'gray', children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>{children}</span>;
}
export function StatusBadge({ value }: { value: string }) {
  const s = STATUS[value];
  return <Badge tone={s?.tone ?? 'gray'}>{s?.label ?? value}</Badge>;
}
export const DemoBadge = () => <Badge tone="orange">تجريبي</Badge>;

export function Card({ title, icon, action, children, className = '' }: { title?: string; icon?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-4 sm:p-5 ${className}`}>
      {title && (
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-semibold text-navy">{icon}{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Skeleton({ className = 'h-6 w-full' }: { className?: string }) { return <div className={`skeleton ${className}`} />; }
export function LoadingBlock({ rows = 5 }: { rows?: number }) {
  return <div className="space-y-3 p-2">{Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
}
export function Empty({ text = 'لا توجد بيانات لعرضها', hint }: { text?: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted">
      <Inbox size={36} className="text-slate-300" /><p className="font-medium">{text}</p>{hint && <p className="text-xs">{hint}</p>}
    </div>
  );
}
export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl bg-red-50 p-6 text-center text-red-700">
      <AlertTriangle /><p className="text-sm">{(error as Error)?.message ?? 'تعذر تحميل البيانات'}</p>
      {retry && <button className="btn-ghost" onClick={retry}>إعادة المحاولة</button>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/50 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'}`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="font-semibold text-navy">{title}</h3>
          <button aria-label="إغلاق" onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-slate-100"><X size={20} /></button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, children, confirmText = 'تأكيد', danger, busy, onConfirm, onClose }: { open: boolean; title: string; children: ReactNode; confirmText?: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title={title}>
      <div className="space-y-4 text-sm">
        <div>{children}</div>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose} disabled={busy}>إلغاء</button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm} disabled={busy}>{busy && <Loader2 size={16} className="animate-spin" />}{confirmText}</button>
        </div>
      </div>
    </Modal>
  );
}

export function Field({ label, error, children, hint }: { label: string; error?: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

export function Pagination({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  if (total === 0) return null;
  return (
    <div className="no-print mt-4 flex items-center justify-between text-sm text-muted">
      <span>الإجمالي: <span className="num">{total}</span></span>
      <div className="flex items-center gap-2">
        <button className="btn-ghost !px-2.5 !py-1.5" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="السابق"><ChevronRight size={16} /></button>
        <span className="num">{page} / {pages}</span>
        <button className="btn-ghost !px-2.5 !py-1.5" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="التالي"><ChevronLeft size={16} /></button>
      </div>
    </div>
  );
}

export interface Column<T> { key: string; header: string; render: (row: T) => ReactNode; className?: string; sortKey?: string; hideOnCard?: boolean }

/** Table on desktop, labeled cards on phones (no horizontal overflow). */
export function DataTable<T>({ columns, rows, rowKey, onRowClick, footer }: { columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string; onRowClick?: (r: T) => void; footer?: ReactNode }) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/70 text-xs text-muted">
              {columns.map((c) => <th key={c.key} className={`px-3 py-3 text-right font-medium ${c.className ?? ''}`}>{c.header}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={`border-b border-slate-100 last:border-0 ${onRowClick ? 'cursor-pointer hover:bg-brand-50/50' : ''}`}>
                {columns.map((c) => <td key={c.key} className={`px-3 py-3 ${c.className ?? ''}`}>{c.render(r)}</td>)}
              </tr>
            ))}
          </tbody>
          {footer}
        </table>
      </div>
      <div className="space-y-3 md:hidden">
        {rows.map((r) => (
          <div key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined} className="rounded-xl border border-slate-200 bg-white p-3.5">
            <dl className="space-y-2">
              {columns.filter((c) => !c.hideOnCard).map((c, i) => (
                <div key={c.key} className={`flex items-start justify-between gap-3 text-sm ${i === 0 ? 'font-semibold text-navy' : ''}`}>
                  <dt className="shrink-0 text-xs text-muted">{c.header}</dt>
                  <dd className="min-w-0 text-left">{c.render(r)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </>
  );
}

export function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export function Money({ v, strong, tone }: { v: number; strong?: boolean; tone?: 'red' | 'green' | 'navy' | 'gold' }) {
  const c = tone === 'red' ? 'text-red-600' : tone === 'green' ? 'text-emerald-700' : tone === 'gold' ? 'text-amber-600' : '';
  return <span className={`num whitespace-nowrap ${strong ? 'font-semibold' : ''} ${c}`}>{(v / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })} <span className="font-sans text-[0.8em] opacity-80">ج.م</span></span>;
}

/** Three-value breakdown required by the spec: original / deduction / net. */
export function Breakdown({ original, deduction, net }: { original: number; deduction: number; net: number }) {
  return (
    <div className="grid grid-cols-3 gap-2 text-center">
      <div className="rounded-xl bg-brand-50 p-2.5"><p className="text-[11px] text-muted">المساعدة الأصلية</p><Money v={original} strong /></div>
      <div className="rounded-xl bg-amber-50 p-2.5"><p className="text-[11px] text-muted">خصم القسط</p><Money v={deduction} strong tone="red" /></div>
      <div className="rounded-xl bg-teal-50 p-2.5"><p className="text-[11px] text-muted">الصافي</p><Money v={net} strong tone="green" /></div>
    </div>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="no-print mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}
