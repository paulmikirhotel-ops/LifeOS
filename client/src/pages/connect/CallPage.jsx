import React, { useCallback, useEffect } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import CallScreen from '../../components/connect/call/CallScreen.jsx';
import { connectApi } from '../../api/connect.js';

/**
 * A personal Connect call (voice or video). It uses its own WhatsApp-style call screen and the Connect call API only;
 * the meeting room, meeting API and meeting notifications are never involved. The server decides who may enter.
 */
export default function CallPage() {
  const { id } = useParams();
  const { state } = useLocation();
  const getJoin = useCallback(async () => (await connectApi.joinCall(id)).data, [id]);
  const ping = useCallback(() => connectApi.pingCall(id), [id]);
  const leave = useCallback(() => connectApi.leaveCall(id), [id]);
  useEffect(() => { document.title = 'Call · LifeOS'; }, []);
  return <CallScreen key={id} title={state?.title} mode={state?.mode === 'video' ? 'video' : 'voice'} getJoin={getJoin} ping={ping} leave={leave} exitTo="/connect/chats" />;
}
