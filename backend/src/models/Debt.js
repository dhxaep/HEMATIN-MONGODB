const mongoose = require('mongoose');

const debtSchema = new mongoose.Schema(
  {
    person: {
      type: String,
      required: [true, 'Nama orang wajib diisi'],
      trim: true,
      maxlength: [120, 'Nama orang maksimal 120 karakter'],
    },
    amount: {
      type: Number,
      required: [true, 'Nominal hutang/piutang wajib diisi'],
      min: [1, 'Nominal harus lebih dari 0'],
    },
    type: {
      type: String,
      required: [true, 'Jenis (hutang/piutang) wajib diisi'],
      enum: {
        values: ['hutang', 'piutang'],
        message: 'Jenis harus hutang atau piutang',
      },
    },
    note: {
      type: String,
      default: '',
      trim: true,
      maxlength: [300, 'Catatan maksimal 300 karakter'],
    },
    dueDate: {
      type: String,
      required: [true, 'Tanggal catatan wajib diisi'],
      match: [/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD'],
    },
    isPaid: {
      type: Boolean,
      default: false,
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

debtSchema.index({ type: 1, isPaid: 1 });

module.exports = mongoose.model('Debt', debtSchema);

