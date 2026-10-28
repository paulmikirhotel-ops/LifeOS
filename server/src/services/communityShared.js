import mongoose from 'mongoose';
import { User, Friendship } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { pairKey } from '../utils/connectLogic.js';
import * as realtime from './realtime.js';
import { assertNoContact } from '../utils/community.logic.js';

/** Small helpers shared by the Community services (Skill Exchange and Impact Network). */
export const oid = (v) => new mongoose.Types.ObjectId(String(v));
export const DAY = 86400000;
const ID_RE = /^[0-9a-fA-F]{24}$/;
export const needId = (v, what) => {
  if (!ID_RE.test(String(v))) throw ApiError.notFound(`${what} not found.`);
  return String(v);
};
export const guardContact = (fields) => {
  try {
    assertNoContact(fields);
  } catch (e) {
    throw ApiError.badRequest(e.message);
  }
};
export const nameOf = (p) => (p?.enabled && p.displayName ? p.displayName : 'Community member');
export const push = (id, payload) => realtime.emitToUser(id, 'connect', payload);

export async function friendSet(me) {
  const rows = await Friendship.find({ status: 'accepted', $or: [{ requesterId: oid(me) }, { addresseeId: oid(me) }] }).select('requesterId addresseeId').lean();
  return new Set(rows.map((r) => (String(r.requesterId) === String(me) ? String(r.addresseeId) : String(r.requesterId))));
}
export const activeUsers = async (ids) => new Set((await User.find({ _id: { $in: ids }, status: 'active' }).select('_id').lean()).map((u) => String(u._id)));

export async function ensureFriends(a, b) {
  await Friendship.updateOne(
    { pairKey: pairKey(a, b) },
    { $set: { status: 'accepted' }, $setOnInsert: { requesterId: oid(a), addresseeId: oid(b), pairKey: pairKey(a, b) } },
    { upsert: true }
  );
  [a, b].forEach((u) => push(u, { kind: 'friends-changed' }));
}
