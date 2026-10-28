import * as svc from '../services/life.service.js';

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

export const balance = async (req, res) => ok(res, await svc.balance(req.user, req.query.week));
export const areas = async (req, res) => ok(res, await svc.listAreas(req.user));
export const addArea = async (req, res) => ok(res, await svc.addArea(req.user, req.body), 201);
export const updateArea = async (req, res) => ok(res, await svc.updateArea(req.user, req.params.id, req.body));
export const removeArea = async (req, res) => ok(res, await svc.removeArea(req.user, req.params.id));
export const addLog = async (req, res) => ok(res, await svc.addLog(req.user, req.body), 201);
export const removeLog = async (req, res) => ok(res, await svc.removeLog(req.user, req.params.id));

export const entries = async (req, res) => ok(res, await svc.listEntries(req.user, req.query));
export const addEntry = async (req, res) => ok(res, await svc.addEntry(req.user, req.body), 201);
export const updateEntry = async (req, res) => ok(res, await svc.updateEntry(req.user, req.params.id, req.body));
export const removeEntry = async (req, res) => ok(res, await svc.removeEntry(req.user, req.params.id));

export const backupInfo = async (req, res) => ok(res, await svc.backupInfo(req.user));
export const backupSettings = async (req, res) => ok(res, await svc.setBackupSettings(req.user, req.body));
export const exportBackup = async (req, res) => {
  const backup = await svc.exportBackup(req.user);
  res.set('Cache-Control', 'no-store');
  ok(res, backup);
};
// The upload is sent as application/octet-stream so it is not cut off by the normal JSON size limit.
export const previewRestore = async (req, res) => ok(res, await svc.previewRestore(req.user, req.body));
export const restore = async (req, res) => ok(res, await svc.restore(req.user, req.body));
