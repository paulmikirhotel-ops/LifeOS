import React, { useCallback, useEffect, useMemo } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import RoomView from '../../components/meetings/room/RoomView.jsx';
import { meetInviteApi, passStore } from '../../api/meetInvite.js';

/**
 * Video room for people who joined through the invitation link (guests, or LifeOS users from other workspaces).
 * Access is the meeting pass the invitation page stored in this tab — never the URL. No pass → back to the
 * invitation page, where they enter the password / name first.
 */
export default function GuestRoomPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const pass = passStore.get(token);

  const getJoin = useCallback(async () => {
    try {
      return (await meetInviteApi.roomJoin(token, passStore.get(token))).data;
    } catch (err) {
      // An expired / revoked pass can't be fixed here: go back so they can enter the password again.
      if (['PASS_INVALID', 'PASS_REQUIRED', 'LOGIN_REQUIRED'].includes(err?.code)) {
        passStore.clear(token);
        navigate(`/meet/${token}`, { replace: true });
      }
      throw err;
    }
  }, [token, navigate]);
  const ping = useCallback(() => meetInviteApi.roomPing(token, passStore.get(token)), [token]);
  const leave = useCallback(() => meetInviteApi.roomLeave(token, passStore.get(token)), [token]);

  // Link joiners can record too (when the organizer allows it). Same rules, saved on the organizer's meeting.
  const recorder = useMemo(() => ({
    storeKey: `invite-${token.slice(0, 16)}`,
    claim: () => meetInviteApi.recClaim(token, passStore.get(token)),
    release: () => meetInviteApi.recRelease(token, passStore.get(token)),
    beat: (body) => meetInviteApi.recBeat(token, passStore.get(token), body),
    putChunk: (index, blob, mime) => meetInviteApi.recChunk(token, passStore.get(token), index, blob, mime),
  }), [token]);

  useEffect(() => { document.title = 'Meeting · LifeOS'; }, []);

  if (!pass) return <Navigate to={`/meet/${token}`} replace />;

  const chat = useMemo(() => ({ list: (after) => meetInviteApi.chatList(token, passStore.get(token), after), send: (text) => meetInviteApi.chatSend(token, passStore.get(token), text) }), [token]);
  return <RoomView title="Your meeting" subtitle="You joined with an invitation link." getJoin={getJoin} ping={ping} leave={leave} recorder={recorder} chat={chat} exitTo={`/meet/${token}`} exitLabel="Back to the invitation" />;
}
