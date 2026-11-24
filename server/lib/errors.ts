export class AppError extends Error {
  constructor(public status: number, message: string, public code = 'error') {
    super(message);
  }
}
export const notFound = (what = 'السجل') => new AppError(404, `${what} غير موجود`, 'not_found');
export const badRequest = (msg: string) => new AppError(400, msg, 'bad_request');
export const conflict = (msg: string) => new AppError(409, msg, 'conflict');
