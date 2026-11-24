import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '../lib/api';
import { useChurches } from '../hooks/useData';
import { useDebounced } from './ui';

export function ChurchSelect({ value, onChange, all = true, activeOnly, className = '', ...rest }: { value: string; onChange: (v: string) => void; all?: boolean; activeOnly?: boolean; className?: string } & Record<string, any>) {
  const { data } = useChurches();
  return (
    <select className={`input ${className}`} value={value} onChange={(e) => onChange(e.target.value)} aria-label="الكنيسة" {...rest}>
      {all && <option value="">كل الكنائس</option>}
      {!all && <option value="">اختر الكنيسة</option>}
      {(data ?? []).filter((c) => !activeOnly || c.active).map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
    </select>
  );
}

export function BeneficiaryPicker({ value, onChange, placeholder = 'ابحث بالاسم أو الكود...' }: { value: any | null; onChange: (b: any | null) => void; placeholder?: string }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 250);
  const { data } = useQuery({ queryKey: ['ben-options', dq], queryFn: () => get<{ items: any[] }>('/beneficiaries/options', { q: dq }).then((r) => r.items), enabled: !value });
  if (value) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-brand/40 bg-brand-50 px-3 py-2.5 text-sm">
        <span><b>{value.fullName}</b> <span className="num text-muted">{value.code}</span></span>
        <button type="button" className="text-xs text-brand underline" onClick={() => onChange(null)}>تغيير</button>
      </div>
    );
  }
  return (
    <div className="relative">
      <input className="input" placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} aria-label="المستفيد" />
      {(data?.length ?? 0) > 0 && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {data!.map((b) => (
            <li key={b._id}><button type="button" className="flex w-full items-center justify-between px-3 py-2 text-right text-sm hover:bg-brand-50" onClick={() => onChange(b)}>
              <span>{b.fullName}</span><span className="num text-xs text-muted">{b.code}</span>
            </button></li>
          ))}
        </ul>
      )}
    </div>
  );
}
