const mongoose = require('mongoose');

const savingGoalSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Judul target tabungan wajib diisi'],
      trim: true,
      maxlength: [120, 'Judul target maksimal 120 karakter'],
    },
    targetAmount: {
      type: Number,
      required: [true, 'Target nominal wajib diisi'],
      min: [1, 'Target nominal harus lebih dari 0'],
    },
    currentAmount: {
      type: Number,
      default: 0,
      min: [0, 'Saldo tabungan tidak boleh negatif'],
    },
    icon: {
      type: String,
      default: 'target',
      trim: true,
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

module.exports = mongoose.model('SavingGoal', savingGoalSchema);

