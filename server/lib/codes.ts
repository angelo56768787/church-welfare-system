import mongoose from 'mongoose';
import type { ClientSession } from 'mongoose';

const Counter = mongoose.models.Counter ?? mongoose.model('Counter', new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } }));

export async function nextSeq(key: string, session?: ClientSession): Promise<number> {
  const doc: any = await Counter.findByIdAndUpdate(key, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after", session });
  return doc.seq;
}
export async function nextCode(prefix: string, key: string, width = 5, session?: ClientSession) {
  return `${prefix}-${String(await nextSeq(key, session)).padStart(width, '0')}`;
}
