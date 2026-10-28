import * as digestService from '../services/digest.service.js';
import * as briefingService from '../services/briefing.service.js';

export async function morning(req, res) {
  res.json({ success: true, data: await briefingService.getMorning(req.user, req.tenant) });
}

export async function evening(req, res) {
  res.json({ success: true, data: await briefingService.getEvening(req.user, req.tenant) });
}

export async function saveReview(req, res) {
  res.json({ success: true, data: await briefingService.saveReview(req.user, req.body) });
}

export async function weekly(req, res) {
  res.json({ success: true, data: await briefingService.getWeekly(req.user, req.query.week) });
}

export async function weeklyHistory(req, res) {
  res.json({ success: true, data: await briefingService.weeklyHistory(req.user) });
}

export async function getPreferences(req, res) {
  res.json({ success: true, data: await briefingService.getPreferences(req.user) });
}

/** Public (no login): the link inside the weekly email. */
export async function unsubscribe(req, res) {
  const ok = await digestService.unsubscribe(req.query.u, req.query.t);
  res
    .status(ok ? 200 : 400)
    .type('html')
    .send(
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LifeOS</title><body style="font-family:Arial,sans-serif;max-width:420px;margin:15vh auto;padding:0 16px;text-align:center;color:#0f172a"><h1 style="font-size:20px">${
        ok ? 'You are unsubscribed' : 'This link is not valid'
      }</h1><p style="color:#475569">${
        ok ? 'You will no longer get the weekly email. You can turn it back on any time from the Week tab on the Today page.' : 'Open LifeOS and turn the weekly email off from the Week tab on the Today page.'
      }</p></body>`
    );
}

export async function setPreferences(req, res) {
  res.json({ success: true, data: await briefingService.setPreferences(req.user, req.body) });
}
