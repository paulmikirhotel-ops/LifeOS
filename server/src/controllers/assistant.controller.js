import * as svc from '../services/assistant.service.js';

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

export const status = async (req, res) => ok(res, await svc.status(req.user));
export const listChats = async (req, res) => ok(res, await svc.listChats(req.user));
export const getChat = async (req, res) => ok(res, await svc.getChat(req.user, req.params.id));
export const deleteChat = async (req, res) => ok(res, await svc.deleteChat(req.user, req.params.id));
export const send = async (req, res) => ok(res, await svc.sendMessage(req.user, req.body));
export const confirm = async (req, res) => ok(res, await svc.confirmProposal(req.user, req.params.id));
export const cancel = async (req, res) => ok(res, await svc.cancelProposal(req.user, req.params.id));
export const undo = async (req, res) => ok(res, await svc.undoProposal(req.user, req.params.id));
