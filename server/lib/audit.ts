import type { ClientSession } from 'mongoose';
import { AuditLog } from '../models/index.js';

export interface Actor { id: string; name: string }

export async function audit(
  actor: Actor | undefined,
  action: string,
  entity: string,
  entityId: unknown,
  summary: string,
  changes?: unknown,
  session?: ClientSession,
) {
  await AuditLog.create([{ user: actor?.id, userName: actor?.name ?? 'system', action, entity, entityId: String(entityId ?? ''), summary, changes }], { session });
}

/** Shallow diff of plain values for audit trails. */
export function diff(before: Record<string, any>, after: Record<string, any>) {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of Object.keys(after)) {
    const a = before[k] instanceof Date ? before[k].toISOString() : String(before[k] ?? '');
    const b = after[k] instanceof Date ? after[k].toISOString() : String(after[k] ?? '');
    if (a !== b) out[k] = { from: before[k] ?? null, to: after[k] ?? null };
  }
  return out;
}
