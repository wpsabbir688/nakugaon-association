import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  seq: { type: Number, default: 0 },
});
export const Counter = mongoose.model('Counter', counterSchema);

// Atomically reserve the next sequence value for a key (safe under concurrency).
export async function nextSeq(key, session = null) {
  const doc = await Counter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, session }
  );
  return doc.seq;
}
