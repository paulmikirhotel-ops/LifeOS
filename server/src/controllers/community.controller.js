import * as svc from '../services/community.service.js';
import * as safety from '../services/connectSafety.service.js';
import * as impact from '../services/impact.service.js';

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });
const me = (req) => req.user.id;

export const getMine = async (req, res) => ok(res, await svc.getMine(me(req)));
export const saveProfile = async (req, res) => ok(res, await svc.saveProfile(me(req), req.body));
export const listMentors = async (req, res) => ok(res, await svc.listMentors(me(req), { q: req.query.q }));
export const requestSession = async (req, res) => ok(res, await svc.requestSession(me(req), req.body.userId, req.body.message), 201);
export const listGroups = async (req, res) => ok(res, await svc.listGroups(me(req), { q: req.query.q, mine: req.query.mine === '1' }));
export const createGroup = async (req, res) => ok(res, await svc.createGroup(me(req), req.body), 201);
export const updateGroup = async (req, res) => ok(res, await svc.updateGroup(me(req), req.params.id, req.body));
export const requestJoin = async (req, res) => ok(res, await svc.requestJoin(me(req), req.params.id, req.body?.message), 201);
export const leaveGroup = async (req, res) => ok(res, await svc.leaveGroup(me(req), req.params.id));
export const removeMember = async (req, res) => ok(res, await svc.removeMember(me(req), req.params.id, req.params.userId));
export const listRequests = async (req, res) => ok(res, await svc.listRequests(me(req)));
export const cancelRequest = async (req, res) => ok(res, await svc.cancelRequest(me(req), req.params.id));
export const respond = async (req, res) => ok(res, await svc.respondRequest(me(req), req.params.id, req.body.action));
export const report = async (req, res) => ok(res, await svc.report(me(req), req.body), 201);
export const block = async (req, res) => ok(res, await safety.blockUser(me(req), req.params.userId));
export const adminReports = async (req, res) => ok(res, await svc.adminListReports({ status: req.query.status }));
export const adminSetReport = async (req, res) => ok(res, await svc.adminSetReportStatus(req.params.id, req.body.status));

// Impact Network
export const listListings = async (req, res) => ok(res, await impact.listListings(me(req), { q: req.query.q, category: req.query.category, mine: req.query.mine === '1' }));
export const createListing = async (req, res) => ok(res, await impact.createListing(me(req), req.body), 201);
export const updateListing = async (req, res) => ok(res, await impact.updateListing(me(req), req.params.id, req.body));
export const interest = async (req, res) => ok(res, await impact.expressInterest(me(req), req.params.id, req.body?.message), 201);
export const listLog = async (req, res) => ok(res, await impact.listLog(me(req)));
export const addLog = async (req, res) => ok(res, await impact.addLog(me(req), req.body), 201);
export const updateLog = async (req, res) => ok(res, await impact.updateLog(me(req), req.params.id, req.body));
export const removeLog = async (req, res) => ok(res, await impact.removeLog(me(req), req.params.id));
export const adminListings = async (req, res) => ok(res, await impact.adminListListings());
export const adminVerify = async (req, res) => ok(res, await impact.adminSetVerified(req.params.id, req.body.verified));
