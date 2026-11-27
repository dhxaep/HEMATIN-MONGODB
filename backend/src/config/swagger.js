const swaggerDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Hematin REST API (Senior Production Edition)',
    version: '2.1.0',
    description:
      'REST API Manajemen Keuangan Pribadi berbasis Node.js, ExpressJS, dan MongoDB. Dilengkapi MongoDB Aggregation Pipeline, Zod Schema Validation, Idempotency-Key (TTL), Soft Delete + Undo Restore (TTL 30 hari), Helmet Security Headers, Rate Limiting, dan Request-ID Observability.',
  },
  servers: [
    {
      url: 'http://localhost:5000/api',
      description: 'Local Development Server',
    },
  ],
  tags: [
    { name: 'System', description: 'Health check, DB latency, & observability' },
    { name: 'Analytics', description: 'MongoDB Aggregation Pipeline ($facet, burn-rate, health score)' },
    { name: 'Transactions', description: 'CRUD Transaksi, Idempotency-Key, Soft Delete & Undo Restore' },
    { name: 'Budget', description: 'Pengaturan limit global, limit kalender harian, & auto-save' },
    { name: 'Goals', description: 'Target tabungan & setor saldo' },
    { name: 'Debts', description: 'Catatan hutang & piutang' },
    { name: 'Smart', description: 'OCR Parser Struk & Google Gemini AI Advisor' },
    { name: 'Data', description: 'Backup Export / Import JSON & Clear Data' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Cek kesehatan server, ping latency MongoDB (ms), uptime, & memory',
        responses: {
          200: { description: 'Server & database terhubung' },
        },
      },
    },
    '/analytics/summary': {
      get: {
        tags: ['Analytics'],
        summary: 'Analitik keuangan via MongoDB Aggregation Pipeline ($facet)',
        description:
          'Menghitung total cashflow, saving rate, daily burn-rate, estimasi runway saldo, top 5 kategori terboros, tren 6 bulan, dan Financial Health Score (0-100) dalam satu round-trip MongoDB.',
        responses: {
          200: { description: 'Ringkasan analitik berhasil dihitung' },
        },
      },
    },
    '/transactions': {
      get: {
        tags: ['Transactions'],
        summary: 'Ambil daftar transaksi aktif dengan filter, search, sort, & pagination',
        parameters: [
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['pemasukan', 'pengeluaran'] } },
          { name: 'category', in: 'query', schema: { type: 'string' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'date', in: 'query', schema: { type: 'string', example: '2026-11-25' } },
          { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['date', 'amount', 'createdAt'] } },
          { name: 'order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
        ],
        responses: { 200: { description: 'Daftar transaksi berhasil diambil' } },
      },
      post: {
        tags: ['Transactions'],
        summary: 'Buat transaksi baru (mendukung Idempotency-Key anti double-submit)',
        parameters: [
          {
            name: 'Idempotency-Key',
            in: 'header',
            required: false,
            description: 'UUID unik untuk mencegah transaksi ganda jika request dikirim ulang dalam 24 jam',
            schema: { type: 'string', example: 'tx-20261125-001' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['type', 'amount'],
                properties: {
                  type: { type: 'string', enum: ['pemasukan', 'pengeluaran'] },
                  category: { type: 'string', example: 'Makanan' },
                  amount: { type: 'number', example: 25000 },
                  note: { type: 'string', example: 'Nasi Padang Komplit' },
                  date: { type: 'string', example: '2026-11-25' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Transaksi berhasil dibuat' },
          400: { description: 'Validasi Zod gagal' },
        },
      },
    },
    '/transactions/trash': {
      get: {
        tags: ['Transactions'],
        summary: 'Daftar transaksi yang di-soft-delete (bisa di-restore dalam 30 hari)',
        responses: { 200: { description: 'Daftar tempat sampah transaksi' } },
      },
    },
    '/transactions/{id}/restore': {
      post: {
        tags: ['Transactions'],
        summary: 'Undo / pulihkan transaksi yang baru dihapus (Soft Delete Restore)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Transaksi berhasil dipulihkan' },
          404: { description: 'Transaksi tidak ditemukan di tempat sampah' },
        },
      },
    },
    '/transactions/{id}': {
      get: {
        tags: ['Transactions'],
        summary: 'Detail 1 transaksi aktif berdasarkan ObjectId',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Detail transaksi' }, 404: { description: 'Tidak ditemukan' } },
      },
      put: {
        tags: ['Transactions'],
        summary: 'Perbarui transaksi berdasarkan ObjectId',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Transaksi diperbarui' }, 400: { description: 'Validasi gagal' } },
      },
      delete: {
        tags: ['Transactions'],
        summary: 'Soft delete transaksi (gunakan ?hard=true untuk hapus permanen)',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'hard', in: 'query', schema: { type: 'boolean' } },
        ],
        responses: { 200: { description: 'Transaksi dihapus (soft delete default)' } },
      },
    },
    '/budget': {
      get: { tags: ['Budget'], summary: 'Ambil pengaturan budget & dateLimits', responses: { 200: { description: 'OK' } } },
      put: { tags: ['Budget'], summary: 'Update mode, limitValue global, & autoSave', responses: { 200: { description: 'OK' } } },
    },
    '/goals': {
      get: { tags: ['Goals'], summary: 'Ambil semua target tabungan', responses: { 200: { description: 'OK' } } },
      post: { tags: ['Goals'], summary: 'Buat target tabungan baru', responses: { 201: { description: 'Created' } } },
    },
    '/debts': {
      get: { tags: ['Debts'], summary: 'Ambil daftar hutang/piutang', responses: { 200: { description: 'OK' } } },
      post: { tags: ['Debts'], summary: 'Catat hutang/piutang baru', responses: { 201: { description: 'Created' } } },
    },
    '/ocr/parse': {
      post: { tags: ['Smart'], summary: 'Parse teks OCR struk belanja Indonesia (rate-limited)', responses: { 200: { description: 'OK' } } },
    },
    '/ai/advisor': {
      post: { tags: ['Smart'], summary: 'Konsultasi keuangan via Google Gemini AI (rate-limited)', responses: { 200: { description: 'OK' } } },
    },
    '/data/export': {
      get: { tags: ['Data'], summary: 'Export seluruh data MongoDB ke JSON', responses: { 200: { description: 'OK' } } },
    },
  },
};

module.exports = { swaggerDocument };
