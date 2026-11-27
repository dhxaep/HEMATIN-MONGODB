/**
 * Hematin REST API — Zero-Dependency HTTP Load Generator
 * Mengukur throughput (req/sec), latensi p50/p95/p99, status code, dan rate-limiter.
 *
 * Cara pakai:
 *   node scripts/loadTest.js
 *   CONCURRENCY=20 REQUESTS=200 node scripts/loadTest.js
 */

const BASE_URL = process.env.LOADTEST_URL || 'http://127.0.0.1:5000/api';
const CONCURRENCY = Number(process.env.CONCURRENCY) || 15;
const REQUESTS_PER_TARGET = Number(process.env.REQUESTS) || 90;

const TARGETS = [
  { name: 'GET /api/health', path: '/health' },
  { name: 'GET /api/transactions', path: '/transactions' },
  { name: 'GET /api/analytics/summary ($facet)', path: '/analytics/summary' },
];

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

async function runTarget(target) {
  const latencies = [];
  const statusCounts = {};
  let errors = 0;
  let completed = 0;
  const startAll = process.hrtime.bigint();

  async function worker() {
    while (true) {
      const i = completed++;
      if (i >= REQUESTS_PER_TARGET) break;

      const t0 = process.hrtime.bigint();
      try {
        const res = await fetch(`${BASE_URL}${target.path}`);
        await res.arrayBuffer();
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        latencies.push(ms);
        statusCounts[res.status] = (statusCounts[res.status] || 0) + 1;
      } catch {
        errors += 1;
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  const totalSec = Number(process.hrtime.bigint() - startAll) / 1e9;
  latencies.sort((a, b) => a - b);

  const avgMs = latencies.length
    ? latencies.reduce((a, b) => a + b, 0) / latencies.length
    : 0;

  return {
    endpoint: target.name,
    requests: REQUESTS_PER_TARGET,
    concurrency: CONCURRENCY,
    rps: Number((REQUESTS_PER_TARGET / Math.max(0.001, totalSec)).toFixed(1)),
    avgMs: Number(avgMs.toFixed(2)),
    p50Ms: Number(percentile(latencies, 50).toFixed(2)),
    p95Ms: Number(percentile(latencies, 95).toFixed(2)),
    p99Ms: Number(percentile(latencies, 99).toFixed(2)),
    statusCounts,
    errors,
  };
}

async function main() {
  console.log(`\n[LoadTest] Target: ${BASE_URL} | Concurrency: ${CONCURRENCY} | Requests/endpoint: ${REQUESTS_PER_TARGET}\n`);
  const results = [];
  for (const t of TARGETS) {
    const r = await runTarget(t);
    results.push(r);
    console.log(
      `${r.endpoint.padEnd(36)} | ${String(r.rps).padStart(7)} req/s | p50: ${String(r.p50Ms).padStart(6)}ms | p95: ${String(r.p95Ms).padStart(6)}ms | p99: ${String(r.p99Ms).padStart(6)}ms | status: ${JSON.stringify(r.statusCounts)} | err: ${r.errors}`
    );
  }
  console.log('\n[LoadTest] Selesai.\n');
}

main().catch((err) => {
  console.error('[LoadTest] Gagal:', err.message);
  process.exit(1);
});
