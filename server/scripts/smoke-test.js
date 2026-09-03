/* Phase 2 smoke test: boots a running server's endpoints (run while server is up). */
const BASE = process.env.BASE_URL || 'http://localhost:5000';

async function main() {
  const health = await fetch(`${BASE}/api/health`);
  console.log(`GET /api/health -> ${health.status} ${await health.text()}`);

  const missing = await fetch(`${BASE}/api/nope`);
  console.log(`GET /api/nope   -> ${missing.status} ${await missing.text()}`);
}

main().catch((err) => {
  console.error(`request failed: ${err.message}`);
  process.exit(1);
});
