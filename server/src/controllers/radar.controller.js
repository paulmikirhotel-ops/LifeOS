import * as svc from '../services/radar.service.js';

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

export const feed = async (req, res) => ok(res, await svc.feed(req.user, req.query));
export const sources = async (req, res) => ok(res, await svc.listSources(req.user));
export const addSource = async (req, res) => ok(res, await svc.addSource(req.user, req.body), 201);
export const updateSource = async (req, res) => ok(res, await svc.updateSource(req.user, req.params.id, req.body));
export const removeSource = async (req, res) => ok(res, await svc.removeSource(req.user, req.params.id));
export const refresh = async (req, res) => ok(res, await svc.refresh(req.user, { sourceId: req.body?.sourceId, force: !!req.body?.force }));
export const getProfile = async (req, res) => ok(res, await svc.getProfile(req.user));
export const saveProfile = async (req, res) => ok(res, await svc.saveProfile(req.user, req.body.keywords));
export const setState = async (req, res) => ok(res, await svc.setState(req.user, req.params.id, req.body.state));
export const addTask = async (req, res) => ok(res, await svc.addDeadlineTask(req.user, req.params.id));
export const explain = async (req, res) => ok(res, await svc.explain(req.user, req.params.id));
