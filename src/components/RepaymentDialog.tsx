import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { get, post } from '../lib/api';
import { dateAr, isoDate, money, newKey, toMinor } from '../lib/format';
import { Field, Modal, Money } from './ui';
import { BeneficiaryPicker } from './Pickers';
import { useToast } from './Toast';

/** Workflow: beneficiary -> loan -> balance -> amount -> validate -> confirm -> record. */
export default function RepaymentDialog({ open, onClose, presetLoan }: { open: boolean; onClose: () => void; presetLoan?: any }) {
  const qc = useQueryClient(); const toast = useToast();
  const [ben, setBen] = useState<any>(null);
  const [loanId, setLoanId] = useState('');
  const [amount, setAmount] = useState(''); const [date, setDate] = useState(isoDate());
  const [reference, setReference] = useState(''); const [notes, setNotes] = useState('');
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [err, setErr] = useState('');
  const [key, setKey] = useState(newKey());
  useEffect(() => {
    if (!open) return;
    setKey(newKey()); setStep('form'); setErr(''); setAmount(''); setReference(''); setNotes(''); setDate(isoDate());
    if (presetLoan) { setBen(presetLoan.beneficiary); setLoanId(presetLoan._id); } else { setBen(null); setLoanId(''); }
  }, [open, presetLoan]);
  const loans = useQuery({ queryKey: ['active-loans', ben?._id], enabled: !!ben, queryFn: () => get('/loans', { beneficiary: ben._id, status: 'active', pageSize: 50 }).then((r) => r.items) });
  const loan = (loans.data ?? []).find((l: any) => l._id === loanId);
  useEffect(() => { if (loans.data?.length === 1 && !loanId) setLoanId(loans.data[0]._id); }, [loans.data, loanId]);
  const m = useMutation({
    mutationFn: () => post('/repayments', { loan: loanId, amount: toMinor(amount), date, reference: reference || undefined, notes: notes || undefined, idempotencyKey: key }),
    onSuccess: (r: any) => { qc.invalidateQueries(); toast.ok(r.duplicate ? 'هذه العملية سُجلت من قبل (لم تُكرر)' : 'تم تسجيل السداد'); onClose(); },
    onError: (e: any) => { setStep('form'); setErr(e.message); },
  });
  const validate = () => {
    const a = toMinor(amount);
    if (!ben) return 'اختر المستفيد';
    if (!loan) return 'اختر القرض';
    if (!amount || isNaN(Number(amount)) || a <= 0) return 'أدخل مبلغًا صحيحًا أكبر من صفر';
    if (a > loan.remainingBalance) return `المبلغ أكبر من الرصيد المتبقي (${money(loan.remainingBalance)})`;
    if (!date) return 'التاريخ مطلوب';
    return '';
  };
  return (
    <Modal open={open} onClose={m.isPending ? () => {} : onClose} title="تسجيل عملية سداد" wide>
      {step === 'form' ? (
        <div className="space-y-4">
          <Field label="المستفيد *">{presetLoan ? <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm font-medium">{presetLoan.beneficiary.fullName}</div> : <BeneficiaryPicker value={ben} onChange={(b) => { setBen(b); setLoanId(''); }} />}</Field>
          {ben && (
            <Field label="القرض *">
              {loans.isLoading ? <div className="skeleton h-10" /> : (loans.data ?? []).length === 0 ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">لا توجد قروض نشطة لهذا المستفيد.</p> : (
                <select className="input" value={loanId} onChange={(e) => setLoanId(e.target.value)} disabled={!!presetLoan}>
                  <option value="">اختر القرض</option>
                  {loans.data.map((l: any) => <option key={l._id} value={l._id}>{l.reference} · متبقي {money(l.remainingBalance)}</option>)}
                </select>)}
            </Field>
          )}
          {loan && (
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-xl bg-slate-50 p-2.5"><p className="text-[11px] text-muted">قيمة القرض</p><Money v={loan.amount} strong /></div>
              <div className="rounded-xl bg-teal-50 p-2.5"><p className="text-[11px] text-muted">المسدد</p><Money v={loan.totalRepaid} strong tone="green" /></div>
              <div className="rounded-xl bg-red-50 p-2.5"><p className="text-[11px] text-muted">الرصيد المتبقي</p><Money v={loan.remainingBalance} strong tone="red" /></div>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="مبلغ السداد (ج.م) *"><input className="input num" dir="ltr" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
            <Field label="تاريخ السداد *"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="رقم المعاملة / المرجع" hint="يُولَّد تلقائيًا إن تُرك فارغًا"><input className="input" dir="ltr" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
            <Field label="ملاحظات"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          </div>
          {err && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
          <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={onClose}>إلغاء</button><button className="btn-primary" onClick={() => { const e = validate(); setErr(e); if (!e) setStep('confirm'); }}>متابعة</button></div>
        </div>
      ) : (
        <div className="space-y-4 text-sm">
          <p className="font-medium text-navy">راجع بيانات السداد قبل التأكيد</p>
          <dl className="space-y-2 rounded-xl bg-slate-50 p-4">
            <div className="flex justify-between"><dt className="text-muted">المستفيد</dt><dd className="font-medium">{ben.fullName}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">القرض</dt><dd className="num">{loan.reference}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">المبلغ</dt><dd><Money v={toMinor(amount)} strong /></dd></div>
            <div className="flex justify-between"><dt className="text-muted">التاريخ</dt><dd>{dateAr(date)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">الرصيد بعد السداد</dt><dd><Money v={loan.remainingBalance - toMinor(amount)} strong /></dd></div>
          </dl>
          <p className="text-xs text-muted">لا يمكن تعديل العملية بعد تسجيلها.</p>
          <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setStep('form')} disabled={m.isPending}>رجوع</button><button className="btn-primary" onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending && <Loader2 size={16} className="animate-spin" />}تأكيد وتسجيل</button></div>
        </div>
      )}
    </Modal>
  );
}
