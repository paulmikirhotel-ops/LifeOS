const KEY_RE = /^[A-Za-z0-9_-]{16,80}$/;
const METHODS = new Set(['POST', 'PUT', 'PATCH']);

/**
 * If a write carries an Idempotency-Key header, run it once and replay the stored answer on any retry.
 * No header, a bad key, or a database problem: the request simply goes through as before.
 * The key is a random UUID made on the person's phone, so it also acts as the secret for the replay.
 */
export function createIdempotency(given) {
  let loaded = given || null;
  const getModel = async () => (loaded ||= (await import('../models/idempotency.model.js')).default);
  return async function idempotency(req, res, next) {
    const key = req.get('Idempotency-Key');
    if (!key || !METHODS.has(req.method) || !KEY_RE.test(key)) return next();
    const fingerprint = `${req.method} ${req.originalUrl.split('?')[0]}`;
    let Model;
    try {
      Model = await getModel();
      await Model.create({ key, fingerprint, state: 'pending' });
    } catch (e) {
      if (e && e.code === 11000) {
        let rec = null;
        try { rec = await Model.findOne({ key }).lean(); } catch { /* fall through */ }
        if (!rec) return next();
        if (rec.fingerprint !== fingerprint) {
          return res.status(422).json({ success: false, message: 'This retry key was already used for a different request.' });
        }
        if (rec.state === 'done') {
          res.set('Idempotent-Replay', 'true');
          return res.status(rec.status || 200).json(rec.body);
        }
        res.set('Retry-After', '2');
        return res.status(409).json({ success: false, message: 'The first attempt is still being processed. Try again in a moment.' });
      }
      return next(); // database trouble: do not block the person
    }

    let finished = false;
    const json = res.json.bind(res);
    res.json = (body) => {
      finished = true;
      if (res.statusCode >= 500) Promise.resolve(Model.deleteOne({ key })).catch(() => {});
      else Promise.resolve(Model.updateOne({ key }, { state: 'done', status: res.statusCode, body })).catch(() => {});
      return json(body);
    };
    res.on('close', () => { if (!finished) Promise.resolve(Model.deleteOne({ key, state: 'pending' })).catch(() => {}); });
    return next();
  };
}

export default createIdempotency();
