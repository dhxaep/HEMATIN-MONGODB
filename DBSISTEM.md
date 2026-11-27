# Dokumentasi Database & Sistem Backend — Hematin (MongoDB + ExpressJS)

Dokumen ini merupakan panduan lengkap struktur database, collection, schema, endpoint REST API, HTTP Method, serta skenario demo presentasi menggunakan **MongoDB Compass** untuk Final Project **Hematin**.

---

## 1. Informasi Koneksi Database (MongoDB Lokal)

| Parameter | Nilai |
| --- | --- |
| **Database Engine** | MongoDB Community Server (Lokal) |
| **Windows Service** | `MongoDB` (Port `27017`) |
| **Connection URI** | `mongodb://127.0.0.1:27017/hematin` |
| **Nama Database** | `hematin` |
| **ODM (Driver)** | `mongoose` |
| **Base URL REST API** | `http://localhost:5000/api` |
| **Konfigurasi Koneksi** | `backend/src/config/db.js` & `backend/.env` |

### Cara Menghubungkan MongoDB Compass
1. Pastikan service MongoDB lokal berjalan (cek di PowerShell: `Get-Service MongoDB`).
2. Buka **MongoDB Compass** -> klik **Add new connection**.
3. Masukkan URI: `mongodb://127.0.0.1:27017/hematin` -> klik **Connect**.
4. Di panel kiri akan muncul database **`hematin`** berisi 5 collection:
   - `transactions` (mendukung Soft Delete + TTL Index 30 hari)
   - `budgetsettings`
   - `savinggoals`
   - `debts`
   - `idempotencykeys` (TTL Index 24 jam untuk anti-double submit)

---

## 2. Alur Komunikasi Client-Server, Middleware & Database

```text
[Frontend Next.js / Swagger UI / Postman]
        |  HTTP Request (GET / POST / PUT / PATCH / DELETE + X-Request-Id + Idempotency-Key)
        v
[Security & Observability Layer]
   ├── Helmet Security Headers
   ├── Request-ID & Structured JSON Logger (durasi ms)
   ├── NoSQL Injection Sanitizer (hapus key '$' dan '.')
   └── Rate Limiter (300 req/15m global, 25 req/15m khusus AI & OCR)
        |
        v
[ExpressJS Router & Boundary Validation] -> backend/src/routes/*.js
   ├── Idempotency-Key Middleware (cek cache MongoDB)
   └── Zod Schema Validator (error 400 terstruktur per field)
        |
        v
[Controller / Aggregation Pipeline]      -> backend/src/controllers/*.js
        |
        v
[Mongoose Model & Schema + TTL Indexes]  -> backend/src/models/*.js
        |
        v
[MongoDB Lokal: hematin]                 -> 127.0.0.1:27017 (live di MongoDB Compass)
```

---

## 3. Daftar Collection & Struktur Schema di MongoDB Compass

### A. Collection: `transactions`
- **Nama Model Mongoose:** `Transaction` (`backend/src/models/Transaction.js`)
- **Fungsi:** Menyimpan seluruh catatan pemasukan dan pengeluaran pengguna.
- **Indexes:**
  - `{ deletedAt: 1, date: -1, createdAt: -1 }` (compound index untuk riwayat aktif per hari)
  - `{ deletedAt: 1, type: 1, date: -1 }` (compound index untuk filter tipe & Aggregation Pipeline)
  - `{ category: 1 }` (mempercepat filter berdasarkan kategori)
  - `{ deletedAt: 1 }` dengan **`expireAfterSeconds: 2592000`** (**MongoDB TTL Index**: dokumen soft-delete otomatis dihapus permanen setelah 30 hari)

| Field | Tipe Data | Wajib | Default / Validasi | Keterangan |
| --- | --- | --- | --- | --- |
| `_id` | `ObjectId` | Auto | Dibuat otomatis MongoDB | Primary key unik transaksi |
| `type` | `String` | Ya | Enum: `pemasukan`, `pengeluaran` | Jenis arus kas |
| `category` | `String` | Ya | Default: `'Lainnya'`, `trim` | Kategori (Makanan, Transport, Gaji, dll.) |
| `amount` | `Number` | Ya | Minimal `1` (`> 0`) | Nominal transaksi dalam Rupiah |
| `note` | `String` | Ya | Maksimal `300` karakter, `trim` | Catatan / deskripsi transaksi |
| `date` | `String` | Ya | Regex `YYYY-MM-DD` | Tanggal transaksi (ISO lokal) |
| `deletedAt` | `Date / null` | Auto | Default `null` | Penanda Soft Delete; jika terisi, otomatis terhapus setelah 30 hari |
| `createdAt` | `Date` | Auto | `timestamps: true` | Waktu dokumen dibuat |
| `updatedAt` | `Date` | Auto | `timestamps: true` | Waktu terakhir dokumen diubah |

**Contoh Dokumen di MongoDB Compass (`transactions`):**
```json
{
  "_id": { "$oid": "673f1a2b9c8d4e5f6a7b8c9d" },
  "type": "pengeluaran",
  "category": "Makanan",
  "amount": 25000,
  "note": "Nasi Padang Komplit",
  "date": "2026-11-20",
  "createdAt": "2026-11-20T05:12:00.000Z",
  "updatedAt": "2026-11-20T05:12:00.000Z"
}
```

---

### B. Collection: `budgetsettings`
- **Nama Model Mongoose:** `BudgetSetting` (`backend/src/models/BudgetSetting.js`)
- **Fungsi:** Menyimpan pengaturan anggaran global (**Limit Global**), mode anggaran, pengaturan auto-save, dan **limit khusus per tanggal** dari Kalender.
- **Catatan Penting untuk Presentasi:**
  - Collection ini menggunakan pola *singleton document* dengan `key: "default"`.
  - **`limitValue`** adalah **Limit Global** (diatur dari menu Pengaturan / Setup Anggaran).
  - **`dateLimits`** adalah tipe **`Map<String, Number>`** yang menyimpan **Limit Khusus per tanggal** (`"YYYY-MM-DD": nominal`). Saat user mengubah limit di Kalender, hanya `dateLimits[tanggal]` yang berubah — `limitValue` global **tidak ikut berubah**. Jika user klik **Reset** di Kalender, key tanggal tersebut dihapus dari `dateLimits` sehingga kembali mengikuti `limitValue`.

| Field | Tipe Data | Wajib | Default / Validasi | Keterangan |
| --- | --- | --- | --- | --- |
| `_id` | `ObjectId` | Auto | Dibuat otomatis MongoDB | Primary key dokumen |
| `key` | `String` | Auto | `unique`, default `'default'` | Penanda dokumen konfigurasi utama |
| `mode` | `String / null` | Tidak | Enum: `harian`, `mingguan`, `bulanan`, `null` | Mode anggaran aktif |
| `limitValue` | `Number` | Tidak | Minimal `0`, default `0` | Nominal **Limit Global** |
| `dateLimits` | `Map / Object` | Tidak | Default `{}` | Override limit khusus per tanggal (`"YYYY-MM-DD": Number`) |
| `tabunganBalance` | `Number` | Tidak | Minimal `0`, default `0` | Saldo cadangan tabungan |
| `autoSaveRemainingLimit` | `Boolean` | Tidak | Default `true` | Aktifkan pindah sisa limit harian ke tabungan |
| `lastAutoSaveDate` | `String / null` | Tidak | Default `null` | Tanggal terakhir auto-save dijalankan (idempotency guard) |
| `setupAt` | `String / null` | Tidak | Default `null` | Tanggal pertama kali budget di-setup |
| `createdAt` | `Date` | Auto | `timestamps: true` | Waktu dokumen dibuat |
| `updatedAt` | `Date` | Auto | `timestamps: true` | Waktu terakhir dokumen diubah |

**Contoh Dokumen di MongoDB Compass (`budgetsettings`):**
```json
{
  "_id": { "$oid": "6b0058743b30478fdecb4758" },
  "key": "default",
  "mode": "bulanan",
  "limitValue": 1000000,
  "dateLimits": {
    "2026-11-20": 75000
  },
  "tabunganBalance": 0,
  "autoSaveRemainingLimit": true,
  "lastAutoSaveDate": null,
  "setupAt": "2026-11-20",
  "createdAt": "2026-11-20T14:25:56.150Z",
  "updatedAt": "2026-11-20T15:57:22.934Z"
}
```

---

### C. Collection: `savinggoals`
- **Nama Model Mongoose:** `SavingGoal` (`backend/src/models/SavingGoal.js`)
- **Fungsi:** Menyimpan target tabungan (misal: Dana Darurat, Beli Laptop) beserta progres saldo terkumpul.

| Field | Tipe Data | Wajib | Default / Validasi | Keterangan |
| --- | --- | --- | --- | --- |
| `_id` | `ObjectId` | Auto | Dibuat otomatis MongoDB | Primary key target tabungan |
| `title` | `String` | Ya | Maksimal `120` karakter, `trim` | Nama target tabungan |
| `targetAmount` | `Number` | Ya | Minimal `1` | Nominal target yang ingin dicapai |
| `currentAmount` | `Number` | Tidak | Minimal `0`, default `0` | Nominal yang sudah terkumpul |
| `icon` | `String` | Tidak | Default `'target'`, `trim` | Key ikon SVG (`target`, `phone`, `shield`, `pig`, dll.) |
| `createdAt` | `Date` | Auto | `timestamps: true` | Waktu dibuat |
| `updatedAt` | `Date` | Auto | `timestamps: true` | Waktu terakhir diubah |

**Contoh Dokumen di MongoDB Compass (`savinggoals`):**
```json
{
  "_id": { "$oid": "673f1b109c8d4e5f6a7b8c11" },
  "title": "Dana Darurat",
  "targetAmount": 1000000,
  "currentAmount": 250000,
  "icon": "shield",
  "createdAt": "2026-11-20T06:00:00.000Z",
  "updatedAt": "2026-11-20T06:15:00.000Z"
}
```

---

### D. Collection: `debts`
- **Nama Model Mongoose:** `Debt` (`backend/src/models/Debt.js`)
- **Fungsi:** Menyimpan catatan hutang (kewajiban bayar) dan piutang (tagihan ke orang lain) beserta status lunas.
- **Indexes:**
  - `{ type: 1, isPaid: 1 }` (mempercepat filter hutang/piutang yang belum lunas)

| Field | Tipe Data | Wajib | Default / Validasi | Keterangan |
| --- | --- | --- | --- | --- |
| `_id` | `ObjectId` | Auto | Dibuat otomatis MongoDB | Primary key catatan hutang/piutang |
| `person` | `String` | Ya | Maksimal `120` karakter, `trim` | Nama pihak terkait |
| `amount` | `Number` | Ya | Minimal `1` | Nominal hutang/piutang |
| `type` | `String` | Ya | Enum: `hutang`, `piutang` | Jenis catatan |
| `note` | `String` | Tidak | Default `''`, maksimal `300` karakter | Keterangan tambahan |
| `dueDate` | `String` | Ya | Regex `YYYY-MM-DD` | Tanggal jatuh tempo / pencatatan |
| `isPaid` | `Boolean` | Tidak | Default `false` | Status pelunasan (`true` = lunas) |
| `createdAt` | `Date` | Auto | `timestamps: true` | Waktu dibuat |
| `updatedAt` | `Date` | Auto | `timestamps: true` | Waktu terakhir diubah |

**Contoh Dokumen di MongoDB Compass (`debts`):**
```json
{
  "_id": { "$oid": "673f1c209c8d4e5f6a7b8c22" },
  "person": "Budi",
  "amount": 50000,
  "type": "piutang",
  "note": "Talangan makan siang",
  "dueDate": "2026-11-25",
  "isPaid": false,
  "createdAt": "2026-11-20T06:30:00.000Z",
  "updatedAt": "2026-11-20T06:30:00.000Z"
}
```

---

### E. Collection: `idempotencykeys`
- **Nama Model Mongoose:** `IdempotencyKey` (`backend/src/models/IdempotencyKey.js`)
- **Fungsi:** Mencegah transaksi ganda (*double submit*) ketika client mengirim header `Idempotency-Key` pada `POST /api/transactions` (pola standar Stripe/Midtrans).
- **Indexes:**
  - `{ key: 1 }` (`unique: true`)
  - `{ createdAt: 1 }` dengan **`expires: 86400`** (**MongoDB TTL Index**: cache key otomatis dihapus setelah 24 jam)

| Field | Tipe Data | Wajib | Default / Validasi | Keterangan |
| --- | --- | --- | --- | --- |
| `_id` | `ObjectId` | Auto | Dibuat otomatis MongoDB | Primary key |
| `key` | `String` | Ya | `unique`, max `128` karakter | Nilai header `Idempotency-Key` dari client |
| `method` | `String` | Ya | Contoh: `'POST'` | HTTP Method |
| `path` | `String` | Ya | Contoh: `'/api/transactions'` | Endpoint request |
| `statusCode` | `Number` | Ya | Contoh: `201` | HTTP Status yang di-cache |
| `responseBody` | `Mixed` | Ya | JSON response | Payload response yang dikembalikan ulang saat replay |
| `createdAt` | `Date` | Auto | TTL `86400` detik (24 jam) | Waktu pembuatan cache |

---

## 4. Daftar Lengkap REST API, HTTP Method & Operasi Database

### 4.1 System, Observability & Interactive Docs
| Method | Endpoint | Operasi DB / Layanan | Status Code | Fungsi |
| --- | --- | --- | --- | --- |
| `GET` | `/api/health` | `admin().ping()` + `process.uptime()` + `memoryUsage()` | `200` | Cek koneksi MongoDB, ping latency (`dbLatencyMs`), uptime, memori, & `X-Request-Id` |
| `GET` | `/api/docs` | `swagger-ui-express` | `200` | Dokumentasi interaktif OpenAPI 3.0 (bisa langsung Try It Out di browser) |
| `GET` | `/api/docs.json` | OpenAPI 3.0 JSON spec | `200` | Spesifikasi mentah OpenAPI untuk import ke Postman/Insomnia |

### 4.2 Analytics (`MongoDB Aggregation Pipeline`)
| Method | Endpoint | Operasi Mongoose | Status Code | Fungsi |
| --- | --- | --- | --- | --- |
| `GET` | `/api/analytics/summary` | `Transaction.aggregate([{ $match }, { $facet }])` | `200`, `500` | Hitung total cashflow, saving rate, daily burn-rate 30 hari, estimasi runway saldo, top 5 kategori, tren 6 bulan, & Financial Health Score (0–100) dalam 1 query |

### 4.3 Transactions (`collection: transactions`)
| Method | Endpoint | Path / Query / Header | Operasi Mongoose | Status Code | Fungsi |
| --- | --- | --- | --- | --- | --- |
| `POST` | `/api/transactions` | Body JSON (Zod) + opsional Header `Idempotency-Key` | `Transaction.create()` + `IdempotencyKey` | `201`, `400`, `500` | Tambah transaksi baru (CREATE, anti double-submit) |
| `GET` | `/api/transactions` | Query: `?type=`, `?category=`, `?search=`, `?date=`, `?sortBy=`, `?order=` | `Transaction.find({ deletedAt: null }).sort()` | `200`, `500` | Ambil daftar transaksi aktif + filter & sort (READ) |
| `GET` | `/api/transactions/summary` | - | `Transaction.find({ deletedAt: null })` | `200`, `500` | Hitung ringkasan saldo, total pemasukan, pengeluaran, & per kategori |
| `GET` | `/api/transactions/trash` | - | `Transaction.find({ deletedAt: { $ne: null } })` | `200`, `500` | Lihat daftar transaksi yang di-soft-delete (masih bisa dipulihkan 30 hari) |
| `POST` | `/api/transactions/:id/restore` | Path: `:id` | `Transaction.findOneAndUpdate({ deletedAt: null })` | `200`, `400`, `404`, `500` | Undo / pulihkan transaksi dari tempat sampah |
| `GET` | `/api/transactions/:id` | Path: `:id` | `Transaction.findOne({ _id, deletedAt: null })` | `200`, `400`, `404`, `500` | Ambil detail 1 transaksi aktif berdasarkan ID |
| `PUT` | `/api/transactions/:id` | Path: `:id`, Body JSON (Zod) | `Transaction.findOneAndUpdate()` | `200`, `400`, `404`, `500` | Perbarui transaksi (UPDATE) |
| `PATCH` | `/api/transactions/:id` | Path: `:id`, Body JSON (Zod) | `Transaction.findOneAndUpdate()` | `200`, `400`, `404`, `500` | Perbarui sebagian field transaksi (UPDATE) |
| `DELETE` | `/api/transactions/:id` | Path: `:id`, opsional `?hard=true` | Soft Delete (`deletedAt = now`) atau `findByIdAndDelete` | `200`, `400`, `404`, `500` | Hapus 1 transaksi (default Soft Delete, `?hard=true` untuk permanen) |
| `DELETE` | `/api/transactions` | Query: `?type=`, `?category=`, `?search=`, `?date=`, `?all=true` | `Transaction.deleteMany()` | `200`, `400`, `500` | Hapus massal transaksi terfilter atau semua |

### 4.3 Budget & Kalender Limit Harian (`collection: budgetsettings`)
| Method | Endpoint | Path / Query Params | Operasi Mongoose | Status Code | Fungsi |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/api/budget` | - | `BudgetSetting.findOne()` / `create()` | `200`, `500` | Ambil pengaturan budget & map `dateLimits` |
| `PUT` | `/api/budget` | Body JSON | `budget.save()` | `200`, `400`, `500` | Ubah mode, **Limit Global (`limitValue`)**, atau `autoSaveRemainingLimit` |
| `PATCH` | `/api/budget/daily-limit/:date` | Path: `:date` (`YYYY-MM-DD`), Body `{ limitValue }` | `budget.dateLimits.set()` + `save()` | `200`, `400`, `500` | Set **Limit Khusus** untuk 1 tanggal di Kalender (tanpa ubah Limit Global) |
| `DELETE` | `/api/budget/daily-limit/:date` | Path: `:date` (`YYYY-MM-DD`) | `budget.dateLimits.delete()` + `save()` | `200`, `400`, `500` | Reset limit khusus 1 tanggal agar kembali ke Limit Global |
| `POST` | `/api/budget/auto-save` | Body opsional `{ todayIso, yesterdayIso }` | Baca `BudgetSetting`, `Transaction`, `SavingGoal` + `Transaction.create()` | `200`, `400`, `500` | Pindahkan sisa limit kemarin ke target tabungan secara aman & idempoten |
| `DELETE` | `/api/budget/reset` | - | Reset field ke default + `save()` | `200`, `500` | Reset seluruh pengaturan budget |

### 4.4 Saving Goals (`collection: savinggoals`)
| Method | Endpoint | Path / Query Params | Operasi Mongoose | Status Code | Fungsi |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/api/goals` | - | `SavingGoal.find().sort()` | `200`, `500` | Ambil seluruh target tabungan |
| `POST` | `/api/goals` | Body JSON | `SavingGoal.create()` | `201`, `400`, `500` | Tambah target tabungan baru |
| `GET` | `/api/goals/:id` | Path: `:id` | `SavingGoal.findById()` | `200`, `400`, `404`, `500` | Ambil 1 target tabungan |
| `PUT` | `/api/goals/:id` | Path: `:id`, Body JSON | `SavingGoal.findByIdAndUpdate()` | `200`, `400`, `404`, `500` | Edit target tabungan |
| `PATCH` | `/api/goals/:id/deposit` | Path: `:id`, Body `{ amount }` | `goal.currentAmount += amount` + `save()` | `200`, `400`, `404`, `500` | Tambah setor saldo ke target tabungan |
| `DELETE` | `/api/goals/:id` | Path: `:id` | `SavingGoal.findByIdAndDelete()` | `200`, `400`, `404`, `500` | Hapus target tabungan |

### 4.5 Debts / Hutang & Piutang (`collection: debts`)
| Method | Endpoint | Path / Query Params | Operasi Mongoose | Status Code | Fungsi |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/api/debts` | Query: `?type=`, `?isPaid=` | `Debt.find().sort()` | `200`, `500` | Ambil daftar hutang/piutang |
| `POST` | `/api/debts` | Body JSON | `Debt.create()` | `201`, `400`, `500` | Catat hutang/piutang baru |
| `GET` | `/api/debts/:id` | Path: `:id` | `Debt.findById()` | `200`, `400`, `404`, `500` | Detail 1 catatan hutang/piutang |
| `PUT` | `/api/debts/:id` | Path: `:id`, Body JSON | `Debt.findByIdAndUpdate()` | `200`, `400`, `404`, `500` | Edit catatan hutang/piutang |
| `PATCH` | `/api/debts/:id/toggle-paid` | Path: `:id` | Toggle `debt.isPaid` + `save()` | `200`, `400`, `404`, `500` | Tandai lunas / belum lunas |
| `DELETE` | `/api/debts/:id` | Path: `:id` | `Debt.findByIdAndDelete()` | `200`, `400`, `404`, `500` | Hapus catatan hutang/piutang |

### 4.6 Fitur Tambahan (OCR, AI Advisor Gemini, & Backup Data)
| Method | Endpoint | Operasi DB / Layanan | Status Code | Fungsi |
| --- | --- | --- | --- | --- |
| `POST` | `/api/ocr/parse` | Parser struk deterministik lokal | `200`, `400`, `500` | Ekstrak nama toko, nominal total, tanggal, & kategori dari teks OCR struk |
| `POST` | `/api/ai/advisor` | Baca ringkasan dari `transactions`, `budgetsettings`, `savinggoals`, `debts` -> Google Gemini API | `200`, `400`, `502`, `503` | Analisis & saran keuangan real-time berbasis data MongoDB menggunakan Gemini |
| `GET` | `/api/data/export` | Baca semua 4 collection | `200`, `500` | Export seluruh isi database ke file JSON backup |
| `POST` | `/api/data/import` | Insert/replace ke 4 collection | `200`, `400`, `500` | Import / restore data backup JSON ke MongoDB |
| `DELETE` | `/api/data/clear` | `deleteMany({})` + reset `budgetsettings` | `200`, `500` | Kosongkan seluruh data aplikasi di MongoDB |

---

## 5. Contoh Filter Query Siap Pakai di MongoDB Compass

Saat demo di tab **Documents** pada MongoDB Compass, kamu bisa mengetik filter ini di kolom **Filter**:

- **Collection `transactions` — hanya pengeluaran:**
  ```json
  { "type": "pengeluaran" }
  ```
- **Collection `transactions` — pengeluaran kategori Makanan di atas Rp 20.000:**
  ```json
  { "type": "pengeluaran", "category": "Makanan", "amount": { "$gte": 20000 } }
  ```
- **Collection `transactions` — transaksi pada tanggal tertentu:**
  ```json
  { "date": "2026-11-20" }
  ```
- **Collection `budgetsettings` — dokumen konfigurasi utama:**
  ```json
  { "key": "default" }
  ```
- **Collection `debts` — hutang yang belum lunas:**
  ```json
  { "type": "hutang", "isPaid": false }
  ```

---

## 6. Skenario Urutan Demo Presentasi di MongoDB Compass

Urutan ini efektif untuk presentasi 3–5 menit agar juri/mentor langsung melihat integrasi penuh **ExpressJS + MongoDB**:

1. **Tunjukkan Koneksi & Struktur DB:**
   - Buka **MongoDB Compass** -> arahkan ke database `hematin`.
   - Jelaskan bahwa ada 4 collection: `transactions`, `budgetsettings`, `savinggoals`, dan `debts`.
2. **Demo CREATE (`POST /api/transactions`):**
   - Tambah 1 transaksi dari aplikasi web (atau Postman).
   - Klik **Refresh** di collection `transactions` pada MongoDB Compass -> tunjukkan dokumen baru langsung tersimpan lengkap dengan `_id`, `createdAt`, `updatedAt`.
3. **Demo READ + Query Parameter (`GET /api/transactions?type=pengeluaran&category=Makanan`):**
   - Tunjukkan filter di tab Riwayat (atau Postman) dan bandingkan dengan Filter di MongoDB Compass.
4. **Demo UPDATE Limit Khusus Kalender (`PATCH /api/budget/daily-limit/:date`):**
   - Ubah limit 1 tanggal di Kalender pada aplikasi web.
   - Buka collection `budgetsettings` di Compass -> klik **Refresh** -> tunjukkan `limitValue` (Limit Global) tetap utuh, sementara `dateLimits` bertambah key tanggal tersebut.
   - Klik **Reset** di Kalender -> Refresh Compass -> key tanggal tersebut hilang dari `dateLimits`.
5. **Demo DELETE (`DELETE /api/transactions/:id`):**
   - Hapus transaksi uji coba -> klik **Refresh** di Compass -> dokumen langsung terhapus dari database.

