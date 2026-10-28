import * as svc from '../services/nextstep.service.js';

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

export const list = async (req, res) => ok(res, await svc.listPlans(req.user));
export const next = async (req, res) => ok(res, await svc.nextAction(req.user));
export const get = async (req, res) => ok(res, await svc.getPlan(req.user, req.params.id));
export const create = async (req, res) => ok(res, await svc.createDraft(req.user, req.body), 201);
export const update = async (req, res) => ok(res, await svc.updatePlan(req.user, req.params.id, req.body));
export const archive = async (req, res) => ok(res, await svc.archivePlan(req.user, req.params.id));
export const revise = async (req, res) => ok(res, await svc.revise(req.user, req.params.id, req.body.instruction));
export const approve = async (req, res) => ok(res, await svc.approve(req.user, req.params.id));
export const addItem = async (req, res) => ok(res, await svc.addItem(req.user, req.params.id, req.body), 201);
export const patchItem = async (req, res) => ok(res, await svc.patchItem(req.user, req.params.id, req.params.itemId, req.body));
export const removeItem = async (req, res) => ok(res, await svc.removeItem(req.user, req.params.id, req.params.itemId));
export const markItem = async (req, res) => ok(res, await svc.markItem(req.user, req.params.id, req.params.itemId, req.body.action));
