const egp = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
/** API money is integer piasters. */
export const money = (minor?: number | null) => `${egp.format((minor ?? 0) / 100)} ج.م`;
export const moneyPlain = (minor?: number | null) => egp.format((minor ?? 0) / 100);
export const toMinor = (egpValue: number | string) => Math.round(Number(egpValue) * 100);
export const fromMinor = (m: number) => m / 100;
export const num = (n?: number | null) => new Intl.NumberFormat('en-US').format(n ?? 0);
export const dateAr = (d?: string | Date | null) => (d ? new Intl.DateTimeFormat('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(d)) : '—');
export const dateTimeAr = (d?: string | Date | null) => (d ? new Intl.DateTimeFormat('ar-EG-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d)) : '—');
export const isoDate = (d: Date = new Date()) => d.toISOString().slice(0, 10);
export const monthLabel = (p: string) => new Intl.DateTimeFormat('ar-EG-u-nu-latn', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${p}-01T00:00:00Z`));
export const thisMonth = () => new Date().toISOString().slice(0, 7);

export const STATUS: Record<string, { label: string; tone: 'green' | 'orange' | 'red' | 'blue' | 'gray' }> = {
  active: { label: 'نشط', tone: 'green' }, suspended: { label: 'معلّق', tone: 'orange' }, inactive: { label: 'غير نشط', tone: 'gray' },
  paid: { label: 'مسدد', tone: 'green' }, pending: { label: 'قيد الانتظار', tone: 'orange' }, partial: { label: 'مسدد جزئيًا', tone: 'blue' }, overdue: { label: 'متأخر', tone: 'red' },
  completed: { label: 'مكتمل', tone: 'green' }, cancelled: { label: 'ملغي', tone: 'gray' }, not_generated: { label: 'لم يُنشأ', tone: 'gray' },
  cash: { label: 'سداد نقدي', tone: 'blue' }, assistance_deduction: { label: 'خصم من المساعدة', tone: 'orange' },
};
export const ASSIST_STATUS: Record<string, string> = { paid: 'تم الصرف', pending: 'لم يُصرف', not_generated: 'لم يُنشأ' };
export const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
