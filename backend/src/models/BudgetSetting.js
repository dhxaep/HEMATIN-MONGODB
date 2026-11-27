const mongoose = require('mongoose');

const budgetSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      unique: true,
      default: 'default',
    },
    mode: {
      type: String,
      enum: {
        values: ['harian', 'mingguan', 'bulanan', null],
        message: 'Mode budget harus harian, mingguan, bulanan, atau null',
      },
      default: null,
    },
    limitValue: {
      type: Number,
      min: [0, 'Limit tidak boleh bernilai negatif'],
      default: 0,
    },
    dateLimits: {
      type: Map,
      of: Number,
      default: {},
    },
    tabunganBalance: {
      type: Number,
      min: 0,
      default: 0,
    },
    autoSaveRemainingLimit: {
      type: Boolean,
      default: true,
    },
    lastAutoSaveDate: {
      type: String,
      default: null,
    },
    setupAt: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        ret.dateLimits =
          ret.dateLimits instanceof Map
            ? Object.fromEntries(ret.dateLimits)
            : ret.dateLimits || {};
        delete ret.__v;
        return ret;
      },
    },
  }
);

module.exports = mongoose.model('BudgetSetting', budgetSettingSchema);

