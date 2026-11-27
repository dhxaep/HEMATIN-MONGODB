<p align="center">
  <img src="frontend/public/favicon.png" alt="Hematin Logo" width="120" height="120" />
</p>

<h1 align="center">Hematin REST API - Personal Finance Manager</h1>

<p align="center">
  <strong>Final Project Study Club Backend Basic - Kabinet Genesis KSM Veterantech UPNVJ 2026</strong>
</p>

**Hematin** adalah aplikasi manajemen keuangan pribadi yang dimigrasikan dari arsitektur *LocalStorage* menjadi aplikasi **Backend Web Development berbasis REST API** menggunakan **Node.js, ExpressJS, dan MongoDB**, dilengkapi antarmuka **Next.js** *(bonus fullstack)*, pemindai struk belanja **OCR (Tesseract.js + Deterministic Receipt Parser)**, serta **Financial Advisor Engine**.

---

## 🎯 Deskripsi Singkat Aplikasi

Aplikasi ini dirancang untuk membantu pengguna (khususnya mahasiswa/anak kos) mencatat pemasukan dan pengeluaran harian, memantau batas anggaran (*budget limit* harian/mingguan/bulanan), melacak target tabungan (*saving goals*), serta mencatat hutang-piutang secara persisten di database **MongoDB**.

Seluruh logika backend dibangun secara **modular** dengan pemisahan tanggung jawab yang jelas antara konfigurasi database, model Mongoose, controller, routes, middleware error handling, serta utilitas parser.

---

## 🛠️ Teknologi & Dependencies

### Backend (Core Tugas)
| Teknologi / Package | Versi | Kegunaan |
|---|---|---|
| **Node.js** | v18+ / v25 | Runtime environment JavaScript sisi server |
| **ExpressJS** (`express`) | `^4.21.2` | Framework pembuatan REST API dan routing |
| **MongoDB & Mongoose** (`mongoose`) | `^8.9.5` | Database NoSQL dan ODM schema validation |
| **CORS** (`cors`) | `^2.8.5` | Mengizinkan komunikasi client-server lintas origin |
| **Dotenv** (`dotenv`) | `^16.4.7` | Mengelola environment variables dari file `.env` |
| **Morgan** (`morgan`) | `^1.10.0` | HTTP request logger di terminal |
| **Nodemon** (`nodemon`) *(dev)* | `^3.1.9` | Auto-restart server saat pengembangan |
| **MongoDB Memory Server** *(dev)* | `^10.1.4` | Menjalankan automated test suite terisolasi |

### Frontend (Bonus Fullstack UI)
- **Next.js 16 + React 19 + TypeScript + Tailwind CSS v4**
- **Chart.js** untuk visualisasi grafik harian/bulanan/tahunan dan diagram donat pengeluaran
- **Tesseract.js** + Canvas preprocessing untuk ekstraksi teks foto struk belanja
- **Lucide React** & **Marked**

---

## 📂 Struktur Kode Modular

```text
HEMATIN-MONGODB/
├── backend/                          # Server REST API ExpressJS + MongoDB
│   ├── src/
│   │   ├── config/
│   │   │   └── db.js                 # Modul koneksi MongoDB (Mongoose)
│   │   ├── models/
│   │   │   ├── Transaction.js        # Schema transaksi (CRUD utama)
│   │   │   ├── BudgetSetting.js      # Schema pengaturan budget & limit harian
│   │   │   ├── SavingGoal.js         # Schema target tabungan
│   │   │   └── Debt.js               # Schema catatan hutang-piutang
│   │   ├── controllers/
│   │   │   ├── transactionController.js  # Handler CRUD + Query/Path Params + Summary
│   │   │   ├── budgetController.js       # Handler budget, daily limit & auto-save
│   │   │   ├── goalController.js         # Handler target tabungan & deposit
│   │   │   ├── debtController.js         # Handler hutang-piutang
│   │   │   ├── ocrController.js          # Handler parser teks struk belanja
│   │   │   ├── aiController.js           # Handler financial advisor
│   │   │   └── dataController.js         # Handler export, import & clear database
│   │   ├── routes/
│   │   │   ├── index.js              # Agregasi seluruh route di prefix /api
│   │   │   ├── transactionRoutes.js
│   │   │   ├── budgetRoutes.js
│   │   │   ├── goalRoutes.js
│   │   │   ├── debtRoutes.js
│   │   │   ├── ocrRoutes.js
│   │   │   ├── aiRoutes.js
│   │   │   └── dataRoutes.js
│   │   ├── middlewares/
│   │   │   └── errorHandler.js       # Penanganan 404, Bad JSON (400), & Error 500
│   │   ├── utils/
│   │   │   ├── dateHelper.js         # Normalisasi tanggal lokal YYYY-MM-DD
│   │   │   ├── receiptParser.js      # Parser struk Indonesia deterministik
│   │   │   └── financialAdvisor.js   # Mesin evaluasi keputusan finansial
│   │   └── app.js                    # Konfigurasi middleware & mounting Express
│   ├── tests/
│   │   └── api.test.js               # Automated integration tests
│   ├── .env.example
│   ├── package.json
│   └── server.js                     # Entry point utama server
├── frontend/                         # Bonus: Antarmuka Next.js terhubung ke API
├── postman/
│   └── Hematin-API.postman_collection.json
├── package.json
└── README.md
```

---

## ⚙️ Langkah Instalasi & Menjalankan Server

### 1. Clone Repository
```bash
git clone https://github.com/dhxaep/HEMATIN-MONGODB.git
cd HEMATIN-MONGODB
```

### 2. Pastikan MongoDB Lokal Aktif & Konfigurasi `.env`
Pastikan **MongoDB Community Server** sudah terinstall dan berjalan secara lokal di port `27017`.

Salin file `backend/.env.example` menjadi `backend/.env`:
```bash
cp backend/.env.example backend/.env
```
Konfigurasi `backend/.env` menggunakan MongoDB lokal dan Gemini API Key (untuk AI Advisor):
```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/hematin
CORS_ORIGIN=http://localhost:3000
GEMINI_API_KEY=<isi_gemini_api_key_kamu>
GEMINI_MODEL=gemini-3.5-flash
```

### 3. Install Dependencies
```bash
npm run install:all
```
*(Atau khusus backend saja: `cd backend && npm install`)*

### 4. Jalankan Server Backend
```bash
npm run dev:backend
```
Server akan berjalan pada `http://localhost:5000`.  
Cek status server & database melalui browser atau Postman di:
`GET http://localhost:5000/api/health`

### 5. (Opsional) Jalankan Automated Test Suite
```bash
npm run test:backend
```

### 6. (Opsional) Jalankan Frontend Next.js (Bonus Fullstack)
```bash
cp frontend/.env.example frontend/.env.local
npm run dev:frontend
```
Akses aplikasi web di `http://localhost:3000`.

---

## 📡 Daftar Endpoint REST API

Base URL: `http://localhost:5000/api`

### A. Health Check
| Method | Endpoint | Fungsi | Status Code |
|---|---|---|---|
| `GET` | `/api/health` | Mengecek status server Express dan koneksi MongoDB | `200` |

### B. Transactions - Core CRUD, Path Parameter & Query Parameter
| Method | Endpoint | Fungsi | Parameter | Status Code |
|---|---|---|---|---|
| `POST` | `/api/transactions` | **CREATE:** Menambahkan data transaksi baru | Body JSON (`type`, `category`, `amount`, `note`, `date`) | `201`, `400`, `500` |
| `GET` | `/api/transactions` | **READ ALL:** Menampilkan daftar transaksi dengan filter & urut | **Query Param:** `?type=`, `?category=`, `?search=`, `?date=`, `?startDate=`, `?endDate=`, `?sortBy=`, `?order=` | `200`, `400`, `500` |
| `GET` | `/api/transactions/summary` | Mengambil ringkasan total pemasukan, pengeluaran, saldo, & breakdown kategori | - | `200`, `500` |
| `GET` | `/api/transactions/:id` | **READ ONE:** Mengambil detail 1 transaksi spesifik | **Path Param:** `:id` (MongoDB ObjectId) | `200`, `400`, `404`, `500` |
| `PUT` | `/api/transactions/:id` | **UPDATE:** Memperbarui seluruh/sebagian data transaksi | **Path Param:** `:id` + Body JSON | `200`, `400`, `404`, `500` |
| `PATCH` | `/api/transactions/:id` | **UPDATE:** Memperbarui sebagian field transaksi | **Path Param:** `:id` + Body JSON | `200`, `400`, `404`, `500` |
| `DELETE` | `/api/transactions/:id` | **DELETE:** Menghapus 1 transaksi berdasarkan ID | **Path Param:** `:id` | `200`, `400`, `404`, `500` |
| `DELETE` | `/api/transactions` | Menghapus transaksi massal sesuai filter atau `?all=true` | **Query Param:** filter atau `?all=true` | `200`, `400`, `500` |

### C. Fitur Bonus (Budget, Saving Goals, Debts, OCR, AI, Backup)
| Method | Endpoint | Fungsi | Status Code |
|---|---|---|---|
| `GET` | `/api/budget` | Mengambil pengaturan budget & limit harian | `200`, `500` |
| `PUT` | `/api/budget` | Mengatur mode budget (`harian`/`mingguan`/`bulanan`) dan limit | `200`, `400`, `500` |
| `PATCH` | `/api/budget/daily-limit/:date` | Mengubah limit untuk tanggal tertentu (**Path Param** `:date`) | `200`, `400`, `500` |
| `POST` | `/api/budget/auto-save` | Menjalankan alokasi otomatis sisa limit kemarin ke tabungan | `200`, `500` |
| `DELETE` | `/api/budget/reset` | Mereset pengaturan budget | `200`, `500` |
| `GET` | `/api/goals` | Mengambil daftar target tabungan (mendukung `?search=`) | `200`, `500` |
| `POST` | `/api/goals` | Menambahkan target tabungan baru | `201`, `400`, `500` |
| `GET` | `/api/goals/:id` | Detail 1 target tabungan | `200`, `400`, `404` |
| `PUT` | `/api/goals/:id` | Mengubah target tabungan | `200`, `400`, `404` |
| `PATCH` | `/api/goals/:id/deposit` | Menambah setoran tabungan ke target | `200`, `400`, `404` |
| `DELETE` | `/api/goals/:id` | Menghapus target tabungan | `200`, `400`, `404` |
| `GET` | `/api/debts` | Daftar hutang-piutang (`?type=`, `?isPaid=`, `?search=`) | `200`, `400`, `500` |
| `POST` | `/api/debts` | Mencatat hutang atau piutang baru | `201`, `400`, `500` |
| `PATCH` | `/api/debts/:id/toggle-paid` | Mengubah status lunas/belum lunas | `200`, `400`, `404` |
| `DELETE` | `/api/debts/:id` | Menghapus catatan hutang/piutang | `200`, `400`, `404` |
| `POST` | `/api/ocr/parse` | Mengekstrak toko, kategori, tanggal, dan total nominal dari teks struk OCR | `200`, `400`, `500` |
| `POST` | `/api/ai/advisor` | Konsultasi keuangan menggunakan Google Gemini AI dari data live MongoDB | `200`, `502`, `503` |
| `GET` | `/api/data/export` | Ekspor seluruh data koleksi MongoDB ke format JSON | `200`, `500` |
| `POST` | `/api/data/import` | Impor ulang file backup JSON (mendukung format lama v1 & v2) | `200`, `400`, `500` |
| `DELETE` | `/api/data/clear` | Menghapus seluruh data database | `200`, `500` |

---

## 🧪 Contoh Request & Response JSON

### `POST /api/transactions`
**Request Body:**
```json
{
  "type": "pengeluaran",
  "category": "Makanan",
  "amount": 25000,
  "note": "Nasi Padang Kantin UPNVJ",
  "date": "2026-11-20"
}
```

**Response (`201 Created`):**
```json
{
  "success": true,
  "message": "Transaksi berhasil ditambahkan",
  "data": {
    "_id": "673d9f1a4b2c8e1234567890",
    "id": "673d9f1a4b2c8e1234567890",
    "type": "pengeluaran",
    "category": "Makanan",
    "amount": 25000,
    "note": "Nasi Padang Kantin UPNVJ",
    "date": "2026-11-20",
    "createdAt": "2026-11-20T12:00:00.000Z",
    "updatedAt": "2026-11-20T12:00:00.000Z"
  }
}
```

---

**Dibuat oleh:** Dhafa Achmad Ghifari - KSM Veterantech UPNVJ 2026

