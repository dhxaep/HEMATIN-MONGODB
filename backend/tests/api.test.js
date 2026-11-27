process.env.NODE_ENV = 'test';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { MongoMemoryServer } = require('mongodb-memory-server');

const app = require('../src/app');
const { connectDB, disconnectDB } = require('../src/config/db');
const Transaction = require('../src/models/Transaction');
const BudgetSetting = require('../src/models/BudgetSetting');
const SavingGoal = require('../src/models/SavingGoal');
const Debt = require('../src/models/Debt');
const IdempotencyKey = require('../src/models/IdempotencyKey');
const { getTodayIso, getYesterdayIso } = require('../src/utils/dateHelper');

let mongod;
let server;
let baseUrl;

async function req(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const body = await response.json();
  return { status: response.status, body };
}

describe('Hematin REST API (ExpressJS + MongoDB) Integration Tests', () => {
  before(async () => {
    mongod = await MongoMemoryServer.create();
    await connectDB(mongod.getUri());
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}/api`;
        resolve();
      });
    });
  });

  beforeEach(async () => {
    await Promise.all([
      Transaction.deleteMany({}),
      BudgetSetting.deleteMany({}),
      SavingGoal.deleteMany({}),
      Debt.deleteMany({}),
      IdempotencyKey.deleteMany({}),
    ]);
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await disconnectDB();
    if (mongod) {
      await mongod.stop();
    }
  });

  it('GET /api/health returns 200 and connected database status', async () => {
    const { status, body } = await req('/health');
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.database, 'connected');
  });

  it('handles 404 unknown routes and 400 malformed JSON cleanly', async () => {
    const notFound = await req('/endpoint-tidak-ada');
    assert.equal(notFound.status, 404);
    assert.equal(notFound.body.success, false);

    const malformedRes = await fetch(`${baseUrl}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ invalid json',
    });
    assert.equal(malformedRes.status, 400);
    const malformedBody = await malformedRes.json();
    assert.equal(malformedBody.success, false);
  });

  it('CRUD Transactions: POST (201), GET all + Query Params (200), GET /:id (200), PUT /:id (200), DELETE /:id (200)', async () => {
    const today = getTodayIso();

    // 1. Validation 400 checks
    const badCreate = await req('/transactions', {
      method: 'POST',
      body: JSON.stringify({ type: 'invalid', amount: -100 }),
    });
    assert.equal(badCreate.status, 400);
    assert.equal(badCreate.body.success, false);

    // 2. CREATE (201)
    const tx1 = await req('/transactions', {
      method: 'POST',
      body: JSON.stringify({
        type: 'pemasukan',
        category: 'Gaji',
        amount: 1500000,
        note: 'Uang Saku Bulanan',
        date: today,
      }),
    });
    assert.equal(tx1.status, 201);
    assert.equal(tx1.body.success, true);
    assert.ok(tx1.body.data._id);

    const tx2 = await req('/transactions', {
      method: 'POST',
      body: JSON.stringify({
        type: 'pengeluaran',
        category: 'Makanan',
        amount: 25000,
        note: 'Nasi Padang Komplit',
        date: '15/11/2026', // juga uji normalisasi DD/MM/YYYY -> YYYY-MM-DD
      }),
    });
    assert.equal(tx2.status, 201);
    assert.equal(tx2.body.data.date, '2026-11-15');

    const tx3 = await req('/transactions', {
      method: 'POST',
      body: JSON.stringify({
        type: 'pengeluaran',
        category: 'Transport',
        amount: 15000,
        note: 'Ojek ke Kampus UPNVJ',
        date: today,
      }),
    });
    assert.equal(tx3.status, 201);

    // 3. READ ALL + Query Params (200)
    const allRes = await req('/transactions');
    assert.equal(allRes.status, 200);
    assert.equal(allRes.body.data.length, 3);

    const filterTypeCat = await req('/transactions?type=pengeluaran&category=makanan');
    assert.equal(filterTypeCat.status, 200);
    assert.equal(filterTypeCat.body.data.length, 1);
    assert.equal(filterTypeCat.body.data[0].note, 'Nasi Padang Komplit');

    const searchRes = await req('/transactions?search=upnvj');
    assert.equal(searchRes.status, 200);
    assert.equal(searchRes.body.data.length, 1);

    const numericSearchRes = await req('/transactions?search=25000');
    assert.equal(numericSearchRes.status, 200);
    assert.equal(numericSearchRes.body.data.length, 1);
    assert.equal(numericSearchRes.body.data[0].note, 'Nasi Padang Komplit');

    const sortRes = await req('/transactions?type=pengeluaran&sortBy=amount&order=asc');
    assert.equal(sortRes.status, 200);
    assert.equal(sortRes.body.data[0].amount, 15000);
    assert.equal(sortRes.body.data[1].amount, 25000);

    // 4. SUMMARY (200)
    const summaryRes = await req('/transactions/summary');
    assert.equal(summaryRes.status, 200);
    assert.equal(summaryRes.body.data.totalIncome, 1500000);
    assert.equal(summaryRes.body.data.totalExpense, 40000);
    assert.equal(summaryRes.body.data.balance, 1460000);

    // 5. READ BY PATH PARAM /:id (200, 400, 404)
    const invalidIdRes = await req('/transactions/bukan-object-id');
    assert.equal(invalidIdRes.status, 400);

    const missingIdRes = await req('/transactions/507f1f77bcf86cd799439011');
    assert.equal(missingIdRes.status, 404);

    const tx2Id = tx2.body.data._id;
    const byIdRes = await req(`/transactions/${tx2Id}`);
    assert.equal(byIdRes.status, 200);
    assert.equal(byIdRes.body.data.amount, 25000);

    // 6. UPDATE PUT /:id (200)
    const updateRes = await req(`/transactions/${tx2Id}`, {
      method: 'PUT',
      body: JSON.stringify({ amount: 30000, note: 'Nasi Padang + Es Teh' }),
    });
    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.data.amount, 30000);
    assert.equal(updateRes.body.data.note, 'Nasi Padang + Es Teh');

    // 7. DELETE /:id (200) & verify 404 after delete
    const deleteRes = await req(`/transactions/${tx2Id}`, { method: 'DELETE' });
    assert.equal(deleteRes.status, 200);

    const afterDeleteRes = await req(`/transactions/${tx2Id}`);
    assert.equal(afterDeleteRes.status, 404);
  });

  it('Budget, Daily Limit, Auto-Save safety & idempotency', async () => {
    const today = getTodayIso();
    const yesterday = getYesterdayIso();

    // Create goal & income so balance is sufficient
    await req('/goals', {
      method: 'POST',
      body: JSON.stringify({ title: 'Dana Darurat', targetAmount: 1000000, icon: 'shield' }),
    });
    await req('/transactions', {
      method: 'POST',
      body: JSON.stringify({ type: 'pemasukan', category: 'Gaji', amount: 500000, note: 'Uang Saku', date: yesterday }),
    });
    await req('/transactions', {
      method: 'POST',
      body: JSON.stringify({ type: 'pengeluaran', category: 'Makanan', amount: 20000, note: 'Makan Kemarin', date: yesterday }),
    });

    // Setup budget with setupAt before today (simulate established budget)
    await BudgetSetting.create({
      key: 'default',
      mode: 'harian',
      limitValue: 50000,
      autoSaveRemainingLimit: true,
      setupAt: yesterday,
    });

    // Set specific daily limit via Path Param (must not change global limitValue)
    const dailyRes = await req(`/budget/daily-limit/${today}`, {
      method: 'PATCH',
      body: JSON.stringify({ limitValue: 75000 }),
    });
    assert.equal(dailyRes.status, 200);
    assert.equal(dailyRes.body.data.dateLimits[today], 75000);
    assert.equal(dailyRes.body.data.limitValue, 50000);

    // Delete specific daily limit via Path Param (reverts to default without changing global limitValue)
    const delDailyRes = await req(`/budget/daily-limit/${today}`, {
      method: 'DELETE',
    });
    assert.equal(delDailyRes.status, 200);
    assert.equal(delDailyRes.body.data.dateLimits[today], undefined);
    assert.equal(delDailyRes.body.data.limitValue, 50000);

    // Run auto-save (50.000 limit - 20.000 spent = 30.000 unused)
    const auto1 = await req('/budget/auto-save', {
      method: 'POST',
      body: JSON.stringify({ todayIso: today, yesterdayIso: yesterday }),
    });
    assert.equal(auto1.status, 200);
    assert.equal(auto1.body.data.executed, true);
    assert.equal(auto1.body.data.amount, 30000);

    // Run again on same day -> must be idempotent (executed: false)
    const auto2 = await req('/budget/auto-save', {
      method: 'POST',
      body: JSON.stringify({ todayIso: today, yesterdayIso: yesterday }),
    });
    assert.equal(auto2.status, 200);
    assert.equal(auto2.body.data.executed, false);
  });

  it('Saving Goals & Debts CRUD and action endpoints', async () => {
    const goalRes = await req('/goals', {
      method: 'POST',
      body: JSON.stringify({ title: 'Beli Laptop', targetAmount: 5000000, icon: 'target' }),
    });
    assert.equal(goalRes.status, 201);
    const goalId = goalRes.body.data._id;

    const depRes = await req(`/goals/${goalId}/deposit`, {
      method: 'PATCH',
      body: JSON.stringify({ amount: 250000 }),
    });
    assert.equal(depRes.status, 200);
    assert.equal(depRes.body.data.currentAmount, 250000);

    const debtRes = await req('/debts', {
      method: 'POST',
      body: JSON.stringify({ person: 'Budi', amount: 50000, type: 'piutang', note: 'Patungan makan' }),
    });
    assert.equal(debtRes.status, 201);
    const debtId = debtRes.body.data._id;

    const toggleRes = await req(`/debts/${debtId}/toggle-paid`, { method: 'PATCH' });
    assert.equal(toggleRes.status, 200);
    assert.equal(toggleRes.body.data.isPaid, true);
  });

  it('OCR Receipt Parser fixes Indomaret, Alfamart, Cafe OCR typos, and Tunai-Kembali fallback', async () => {
    // Empty text -> 400
    const badOcr = await req('/ocr/parse', {
      method: 'POST',
      body: JSON.stringify({ rawText: '' }),
    });
    assert.equal(badOcr.status, 400);

    // Case 1: Indomaret
    const indomaret = await req('/ocr/parse', {
      method: 'POST',
      body: JSON.stringify({
        rawText: `INDOMARET VETERAN JKT\n15/11/2026 14:20\nAQUA 600ML 4.000\nROTI SARI ROTI 12.500\nSUBTOTAL : 16.500\nTOTAL : 16.500\nTUNAI : 20.000\nKEMBALI : 3.500`,
      }),
    });
    assert.equal(indomaret.status, 200);
    assert.equal(indomaret.body.data.toko, 'Indomaret');
    assert.equal(indomaret.body.data.total, 16500);
    assert.equal(indomaret.body.data.date, '2026-11-15');

    // Case 2: OCR Typo ('O' instead of '0', comma format, multi-line total)
    const cafeTypo = await req('/ocr/parse', {
      method: 'POST',
      body: JSON.stringify({
        rawText: `KOPI KENANGAN\nEs Kopi Susu Mantan  24,000\nRoti Bakar Coklat    18,000\nGRAND TOTAL\nRp 42.O00`,
      }),
    });
    assert.equal(cafeTypo.status, 200);
    assert.equal(cafeTypo.body.data.toko, 'Kopi Kenangan');
    assert.equal(cafeTypo.body.data.total, 42000);
    assert.equal(cafeTypo.body.data.category, 'Makanan');

    // Case 3: Missing TOTAL keyword -> Tunai - Kembali fallback
    const fallbackMath = await req('/ocr/parse', {
      method: 'POST',
      body: JSON.stringify({
        rawText: `ALFAMART\nMinyak Goreng 36.000\nIndomie 3 pcs 10.500\nTUNAI 100.000\nKEMBALIAN 53.500`,
      }),
    });
    assert.equal(fallbackMath.status, 200);
    assert.equal(fallbackMath.body.data.toko, 'Alfamart');
    assert.equal(fallbackMath.body.data.total, 46500);
  });

  it('AI Advisor (Gemini) & Legacy Backup Import/Export work end-to-end', async () => {
    await req('/transactions', {
      method: 'POST',
      body: JSON.stringify({ type: 'pemasukan', category: 'Gaji', amount: 1000000, note: 'Gaji' }),
    });
    await req('/transactions', {
      method: 'POST',
      body: JSON.stringify({ type: 'pengeluaran', category: 'Makanan', amount: 45000, note: 'Makan siang' }),
    });

    // Uji guard ketika UnliAI gagal DAN GEMINI_API_KEY kosong -> wajib mengembalikan 503
    const originalKey = process.env.GEMINI_API_KEY;
    const originalUnliUrl = process.env.UNLIAI_API_URL;
    try {
      process.env.UNLIAI_API_URL = 'http://127.0.0.1:1/unreachable';
      process.env.GEMINI_API_KEY = '';
      const missingKeyRes = await req('/ai/advisor', {
        method: 'POST',
        body: JSON.stringify({ prompt: 'Beri saran hemat' }),
      });
      assert.equal(missingKeyRes.status, 503);
      assert.equal(missingKeyRes.body.success, false);
    } finally {
      process.env.GEMINI_API_KEY = originalKey;
      if (originalUnliUrl === undefined) {
        delete process.env.UNLIAI_API_URL;
      } else {
        process.env.UNLIAI_API_URL = originalUnliUrl;
      }
    }

    // Uji panggilan nyata ke UnliAI (primary) dengan fallback Gemini
    const advisorRes = await req('/ai/advisor', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'Berikan 2 tips hemat singkat dalam bahasa Indonesia.' }),
    });
    assert.equal(advisorRes.status, 200);
    assert.ok(['unliai-api', 'gemini-api'].includes(advisorRes.body.data.source));
    assert.ok(advisorRes.body.data.reply.length > 10);
    assert.equal(
      /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}]/gu.test(advisorRes.body.data.reply),
      false
    );

    const importRes = await req('/data/import', {
      method: 'POST',
      body: JSON.stringify({
        transactions: [
          { type: 'pengeluaran', category: 'Makanan', amount: 12000, note: 'Bakso', date: '5/11/2026' },
        ],
        budgetSetup: { mode: 'harian', limitValue: 40000, dateLimits: { '5/11/2026': 50000 } },
        savingGoals: [{ title: 'HP Baru', targetAmount: 2000000, currentAmount: 100000, icon: 'phone' }],
        debts: [{ person: 'Andi', amount: 25000, type: 'hutang', note: 'Parkir', dueDate: '5/11/2026', isPaid: false }],
      }),
    });
    assert.equal(importRes.status, 200);
    assert.equal(importRes.body.data.transactions, 1);

    const exportRes = await req('/data/export');
    assert.equal(exportRes.status, 200);
    assert.equal(exportRes.body.data.transactions[0].date, '2026-11-05');
    assert.equal(exportRes.body.data.budgetSetup.dateLimits['2026-11-05'], 50000);
  });

  it('Senior Production Features: Analytics ($facet), Soft Delete + Undo Restore, Idempotency-Key, Zod, & Swagger Docs', async () => {
    const today = getTodayIso();

    // 1. Upgraded Health Check + X-Request-Id + OpenAPI Spec
    const healthRaw = await fetch(`${baseUrl}/health`);
    assert.equal(healthRaw.status, 200);
    assert.ok(healthRaw.headers.get('x-request-id'));
    const healthJson = await healthRaw.json();
    assert.equal(typeof healthJson.data.dbLatencyMs, 'number');
    assert.equal(typeof healthJson.data.uptimeSeconds, 'number');

    const docsRes = await req('/docs.json');
    assert.equal(docsRes.status, 200);
    assert.equal(docsRes.body.openapi, '3.0.3');

    // 2. Zod Validation returns structured errors[]
    const badRes = await req('/transactions', {
      method: 'POST',
      body: JSON.stringify({ type: 'invalid', amount: -500 }),
    });
    assert.equal(badRes.status, 400);
    assert.ok(Array.isArray(badRes.body.errors));
    assert.ok(badRes.body.errors.length >= 1);

    // 3. Idempotency-Key prevents duplicate POST transactions
    const idemKey = 'test-idem-key-001';
    const firstPost = await fetch(`${baseUrl}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idemKey },
      body: JSON.stringify({
        type: 'pemasukan',
        category: 'Gaji',
        amount: 2000000,
        note: 'Gaji Bulanan',
        date: today,
      }),
    });
    assert.equal(firstPost.status, 201);
    const firstBody = await firstPost.json();

    const replayPost = await fetch(`${baseUrl}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idemKey },
      body: JSON.stringify({
        type: 'pemasukan',
        category: 'Gaji',
        amount: 2000000,
        note: 'Gaji Bulanan',
        date: today,
      }),
    });
    assert.equal(replayPost.status, 201);
    assert.equal(replayPost.headers.get('x-idempotent-replayed'), 'true');
    const replayBody = await replayPost.json();
    assert.equal(replayBody.data.id, firstBody.data.id);

    // Add 1 expense to test Analytics & Soft Delete
    const expRes = await req('/transactions', {
      method: 'POST',
      body: JSON.stringify({
        type: 'pengeluaran',
        category: 'Makanan',
        amount: 200000,
        note: 'Makan Mingguan',
        date: today,
      }),
    });
    assert.equal(expRes.status, 201);
    const expId = expRes.body.data._id;

    // 4. MongoDB Aggregation Pipeline Analytics ($facet)
    const analyticsRes = await req('/analytics/summary');
    assert.equal(analyticsRes.status, 200);
    assert.equal(analyticsRes.body.data.totals.totalIncome, 2000000);
    assert.equal(analyticsRes.body.data.totals.totalExpense, 200000);
    assert.equal(analyticsRes.body.data.totals.balance, 1800000);
    assert.equal(analyticsRes.body.data.topCategories[0].category, 'Makanan');
    assert.ok(analyticsRes.body.data.financialHealth.score >= 85);
    assert.equal(analyticsRes.body.data.burnRate.dailyBurnRate, 200000);

    // 5. Soft Delete -> appears in /trash -> Undo /restore -> active again!
    const softDel = await req(`/transactions/${expId}`, { method: 'DELETE' });
    assert.equal(softDel.status, 200);
    assert.ok(softDel.body.data.deletedAt);

    const trashRes = await req('/transactions/trash');
    assert.equal(trashRes.status, 200);
    assert.equal(trashRes.body.data.length, 1);
    assert.equal(trashRes.body.data[0].id, expId);

    const restoreRes = await req(`/transactions/${expId}/restore`, { method: 'POST' });
    assert.equal(restoreRes.status, 200);
    assert.equal(restoreRes.body.data.deletedAt, null);

    const activeAgain = await req(`/transactions/${expId}`);
    assert.equal(activeAgain.status, 200);
  });
});

