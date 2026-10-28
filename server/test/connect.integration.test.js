/**
 * Connect end-to-end checks against a REAL MongoDB (friends, chat, calls, blocking, reports).
 *
 * It is skipped unless you point it at a throw-away database:
 *   CONNECT_TEST_MONGO_URI="mongodb://127.0.0.1:27017/lifeos_connect_test" npm test
 * The test creates its own users and deletes everything it made at the end. NEVER point it at your live database.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const URI = process.env.CONNECT_TEST_MONGO_URI;
const skip = URI ? false : 'set CONNECT_TEST_MONGO_URI to a throw-away MongoDB to run this';

test('Connect: friends, chat, calls, blocking, reports', { skip }, async () => {
  process.env.LIVEKIT_URL = 'wss://example.livekit.cloud';
  process.env.LIVEKIT_API_KEY = 'testkey';
  process.env.LIVEKIT_API_SECRET = 'testsecret-testsecret-testsecret-123456';
  const mongoose = (await import('mongoose')).default;
  await mongoose.connect(URI);
  const M = await import('../src/models/index.js');
  const connect = await import('../src/services/connect.service.js');
  const calls = await import('../src/services/connectCall.service.js');
  const safety = await import('../src/services/connectSafety.service.js');
  const notes = await import('../src/services/connectNotify.service.js');

  const tag = `t${Date.now()}`;
  const mk = (n) => M.User.create({ name: `Test ${n}`, email: `${tag}-${n}@example.test`, passwordHash: 'x' });
  const [a, b, c] = await Promise.all([mk('a'), mk('b'), mk('c')]);
  const [A, B, C] = [String(a._id), String(b._id), String(c._id)];
  try {
    // friends
    const req = await connect.sendRequest(A, B);
    assert.equal(req.status, 'pending');
    await connect.acceptRequest(B, req.requestId);
    assert.equal((await notes.listNotifications(A)).items.some((n) => n.type === 'friend_accepted'), true);
    await assert.rejects(connect.openConversation(A, C), 'cannot open a chat with a non-friend');

    // chat
    const conv = await connect.openConversation(A, B);
    const sent = await connect.sendMessage(A, conv.id, { text: 'hello' });
    assert.equal(sent.text, 'hello');
    assert.equal((await connect.listMessages(B, conv.id)).items.length, 1);
    await assert.rejects(connect.listMessages(C, conv.id), 'a stranger cannot read the chat');

    // calls
    const started = await calls.startCall(A, conv.id, 'voice');
    assert.equal(started.call.status, 'ringing');
    assert.equal((await calls.activeCalls(B)).incoming?.id, started.call.id, 'B sees it ringing');
    await assert.rejects(calls.joinCall(C, started.call.id), 'a stranger cannot join');
    const joined = await calls.joinCall(B, started.call.id);
    assert.ok(joined.token && joined.url, 'B gets a room token');
    assert.equal((await calls.pingCall(A, started.call.id)).status, 'live');
    await calls.leaveCall(B, started.call.id);
    assert.equal((await calls.pingCall(A, started.call.id)).status, 'ended', 'direct call ends when the other person leaves');
    const hist = await calls.callHistory(A);
    assert.equal(hist.items[0].outcome, 'completed');
    assert.ok((await connect.listMessages(A, conv.id)).items.some((m) => /^Voice call · /.test(m.text)), 'a call line is in the chat');

    // declined and missed calls
    const s2 = await calls.startCall(A, conv.id, 'video');
    await calls.declineCall(B, s2.call.id);
    assert.equal((await calls.pingCall(A, s2.call.id)).status, 'ended');
    const s3 = await calls.startCall(A, conv.id, 'voice');
    await calls.leaveCall(A, s3.call.id); // caller hangs up while ringing
    assert.equal((await notes.listNotifications(B)).items.some((n) => n.type === 'missed_call'), true);

    // reports
    const msg = (await connect.listMessages(B, conv.id)).items.find((m) => m.text === 'hello');
    await safety.reportUser(B, { userId: A, messageId: msg.id, reason: 'spam' });
    assert.equal(await M.ConnectReport.countDocuments({ reporterId: b._id }), 1);
    await assert.rejects(safety.reportUser(C, { userId: A, messageId: msg.id, reason: 'spam' }), 'cannot report a message you cannot see');

    // blocking
    await safety.blockUser(B, A);
    await assert.rejects(connect.sendMessage(A, conv.id, { text: 'again' }), 'blocked: cannot write');
    await assert.rejects(calls.startCall(A, conv.id, 'voice'), 'blocked: cannot call');
    await assert.rejects(connect.sendRequest(A, B), 'blocked: cannot send a request');
    assert.equal((await connect.searchUsers(A, `${tag}-b@example.test`)).items.length, 0, 'blocked people are hidden from search');
    await safety.unblockUser(B, A);
    assert.equal((await safety.listBlocked(B)).items.length, 0);
  } finally {
    const ids = [a._id, b._id, c._id];
    await Promise.all([
      M.ConnectMessage.deleteMany({}).where('senderId').in(ids), M.ConnectConversation.deleteMany({ members: { $in: ids } }), M.Friendship.deleteMany({ $or: [{ requesterId: { $in: ids } }, { addresseeId: { $in: ids } }] }),
      M.ConnectCall.deleteMany({ callerId: { $in: ids } }), M.ConnectNotification.deleteMany({ userId: { $in: ids } }), M.ConnectBlock.deleteMany({ $or: [{ blockerId: { $in: ids } }, { blockedId: { $in: ids } }] }),
      M.ConnectReport.deleteMany({ reporterId: { $in: ids } }), M.User.deleteMany({ _id: { $in: ids } }),
    ]);
    calls.stopCallSweeper();
    await mongoose.disconnect();
  }
});
