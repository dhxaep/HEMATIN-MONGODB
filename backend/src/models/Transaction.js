const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: [true, 'Tipe transaksi (pemasukan/pengeluaran) wajib diisi'],
      enum: {
        values: ['pemasukan', 'pengeluaran'],
        message: 'Tipe transaksi harus pemasukan atau pengeluaran',
      },
    },
    category: {
      type: String,
      required: [true, 'Kategori transaksi wajib diisi'],
      trim: true,
      default: 'Lainnya',
    },
    amount: {
      type: Number,
      required: [true, 'Nominal transaksi wajib diisi'],
      min: [1, 'Nominal transaksi harus lebih dari 0'],
    },
    note: {
      type: String,
      required: [true, 'Keterangan atau catatan transaksi wajib diisi'],
      trim: true,
      maxlength: [300, 'Catatan maksimal 300 karakter'],
    },
    date: {
      type: String,
      required: [true, 'Tanggal transaksi wajib diisi'],
      match: [/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD'],
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        delete ret.__v;
        return ret;
      },
    },
  }
);

transactionSchema.index({ deletedAt: 1, date: -1, createdAt: -1 });
transactionSchema.index({ deletedAt: 1, type: 1, date: -1 });
transactionSchema.index({ category: 1 });
// MongoDB TTL Index: transaksi yang di-soft-delete otomatis dibersihkan permanen setelah 30 hari
transactionSchema.index({ deletedAt: 1 }, { expireAfterSeconds: 2592000 });

module.exports = mongoose.model('Transaction', transactionSchema);

