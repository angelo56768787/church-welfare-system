import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { ZodError, ZodTypeAny } from 'zod';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { User } from '../models/index.js';

export interface AuthedRequest extends Request { user?: { id: string; name: string; role: 'admin' | 'staff' } }

export const COOKIE = 'cws_token';

export async function requireAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[COOKIE];
    if (!token) throw new AppError(401, 'يجب تسجيل الدخول', 'unauthenticated');
    const p = jwt.verify(token, env.jwtSecret) as { sub: string };
    const u: any = await User.findById(p.sub).lean();
    if (!u || !u.active) throw new AppError(401, 'الحساب غير نشط', 'unauthenticated');
    req.user = { id: String(u._id), name: u.name, role: u.role };
    next();
  } catch (e) {
    next(e instanceof AppError ? e : new AppError(401, 'جلسة غير صالحة', 'unauthenticated'));
  }
}

export const requireRole = (role: 'admin') => (req: AuthedRequest, _res: Response, next: NextFunction) =>
  req.user?.role === role ? next() : next(new AppError(403, 'ليست لديك صلاحية لهذه العملية', 'forbidden'));

export const validate = (schema: ZodTypeAny, where: 'body' | 'query' = 'body') => (req: Request, _res: Response, next: NextFunction) => {
  const r = schema.safeParse(req[where]);
  if (!r.success) return next(r.error);
  if (where === 'body') req.body = r.data; else (req as any).validQuery = r.data;
  next();
};

export const wrap = (fn: (req: AuthedRequest, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
  fn(req as AuthedRequest, res).catch(next);

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'بيانات غير صالحة', code: 'validation', details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
  }
  if (err instanceof AppError) return res.status(err.status).json({ error: err.message, code: err.code });
  if (err?.code === 11000) return res.status(409).json({ error: 'قيمة مكررة: السجل موجود من قبل', code: 'duplicate', fields: Object.keys(err.keyPattern ?? {}) });
  if (err?.name === 'CastError') return res.status(400).json({ error: 'معرّف غير صالح', code: 'bad_id' });
  console.error('[error]', err);
  res.status(500).json({ error: 'حدث خطأ غير متوقع', code: 'internal' });
}
