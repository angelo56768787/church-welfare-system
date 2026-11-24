import mongoose from 'mongoose';
import { z } from 'zod';

export const oid = z.string().refine((v) => mongoose.isValidObjectId(v), 'معرّف غير صالح');
export const minorAmt = z.number({ error: 'المبلغ مطلوب' }).int('المبلغ غير صالح').positive('المبلغ يجب أن يكون أكبر من صفر').max(1_000_000_000_00);
export const dateIn = z.coerce.date({ error: 'تاريخ غير صالح' });
export const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'الفترة يجب أن تكون بصيغة YYYY-MM');
export const pageQuery = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  sort: z.string().regex(/^-?[a-zA-Z.]+$/).optional(),
};
export const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function pageMeta(page: number, pageSize: number, total: number) {
  return { page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) };
}
