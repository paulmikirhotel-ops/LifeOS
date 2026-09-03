import * as dashboardService from '../services/dashboard.service.js';

export async function getDashboard(req, res) {
  const data = await dashboardService.get(req.user, req.tenant);
  res.json({ success: true, data });
}
