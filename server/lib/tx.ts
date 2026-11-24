import mongoose, { ClientSession } from 'mongoose';

/** Run work inside a DB transaction (Atlas / replica sets). */
export async function withTx<T>(fn: (s: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
