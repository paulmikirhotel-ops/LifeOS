import * as res from '../services/resources.service.js';
import * as ses from '../services/sessions.service.js';

const ok = (r, data, status = 200) => r.status(status).json({ success: true, data });
const me = (req) => req.user.id;

export const listResources = async (req, r) => ok(r, await res.listResources(me(req), { q: req.query.q, skill: req.query.skill, mine: req.query.mine === '1' }));
export const shareResource = async (req, r) => ok(r, await res.shareResource(me(req), req.body), 201);
export const removeResource = async (req, r) => ok(r, await res.removeResource(me(req), req.params.id));
export const reportResource = async (req, r) => ok(r, await res.reportResource(me(req), req.params.id, req.body), 201);
export const adminResourceReports = async (req, r) => ok(r, await res.adminListResourceReports({ status: req.query.status }));
export const adminSetResourceReport = async (req, r) => ok(r, await res.adminSetResourceReportStatus(req.params.id, req.body.status));
export const adminRemoveResource = async (req, r) => ok(r, await res.adminRemoveResource(req.params.id));

export const partners = async (req, r) => ok(r, await ses.partners(me(req)));
export const listSessions = async (req, r) => ok(r, await ses.listSessions(me(req)));
export const propose = async (req, r) => ok(r, await ses.propose(me(req), req.body), 201);
export const respond = async (req, r) => ok(r, await ses.respond(me(req), req.params.id, req.body.action));
export const counter = async (req, r) => ok(r, await ses.counter(me(req), req.params.id, req.body), 201);
export const cancel = async (req, r) => ok(r, await ses.cancel(me(req), req.params.id));
export const addToCalendar = async (req, r) => ok(r, await ses.addToCalendar(req.user, req.params.id));
