import * as svc from '../services/deviceLink.service.js';
import { listDevices, removeDevice, deviceFrom } from '../services/session.service.js';
import { setAuthCookies, REFRESH_COOKIE } from '../utils/token.js';

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

export async function start(req, res) {
  res.set('Cache-Control', 'no-store');
  ok(res, await svc.start(deviceFrom(req)), 201);
}

/** Public: the computer asks whether the phone said yes. On approval the sign-in cookies are set right here, like a normal login. */
export async function status(req, res) {
  res.set('Cache-Control', 'no-store');
  const r = await svc.status(req.body.code, req.body.secret, deviceFrom(req));
  if (r.session) {
    setAuthCookies(res, r.session.accessToken, r.session.refreshToken);
    return ok(res, { status: 'approved', user: r.session.user, memberships: r.session.memberships });
  }
  return ok(res, r);
}

export const peek = async (req, res) => ok(res, await svc.peek(req.user, req.body.code));
export const lookup = async (req, res) => ok(res, await svc.lookup(req.user, req.body.pair));
export const approve = async (req, res) => ok(res, await svc.approve(req.user, req.body, deviceFrom(req)));
export const deny = async (req, res) => ok(res, await svc.deny(req.user, req.body));
export const devices = async (req, res) => ok(res, await listDevices(req.user.id, req.cookies?.[REFRESH_COOKIE]));
export const removeOne = async (req, res) => ok(res, await removeDevice(req.user.id, req.params.id));
