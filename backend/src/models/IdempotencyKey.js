const mongoose = require('mongoose');

const idempotencyKeySchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 128,
  },
  method: {
    type: String,
    required: true,
  },
  path: {
    type: String,
    required: true,
  },
  statusCode: {
    type: Number,
    required: true,
  },
  responseBody: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 86400, // MongoDB TTL Index: otomatis hapus setelah 24 jam
  },
});

module.exports = mongoose.model('IdempotencyKey', idempotencyKeySchema);
