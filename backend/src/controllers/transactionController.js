const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const {
  getTodayIso,
  normalizeDateToIso,
  getCurrentWeekRangeIso,
  getCurrentMonthRangeIso,
} = require('../utils/dateHelper');

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildTransactionFilter(query) {
  const filter = { deletedAt: null };

  if (query.type) {
    if (!['pemasukan', 'pengeluaran'].includes(query.type)) {
      return { error: 'Query parameter type harus pemasukan atau pengeluaran' };
    }
    filter.type = query.type;
  }

  if (query.category) {
    filter.category = new RegExp(`^${escapeRegex(String(query.category).trim())}$`, 'i');
  }

  if (query.search) {
    const trimmed = String(query.search).trim();
    if (trimmed) {
      const regex = new RegExp(escapeRegex(trimmed), 'i');
      const orClauses = [{ note: regex }, { category: regex }];
      if (/^\d+$/.test(trimmed)) {
        orClauses.push({ amount: Number(trimmed) });
      }
      filter.$or = orClauses;
    }
  }

  if (query.date) {
    const isoDate = normalizeDateToIso(query.date);
    if (!isoDate) {
      return { error: 'Format query parameter date tidak valid' };
    }
    filter.date = isoDate;
  } else if (query.startDate || query.endDate) {
    const dateRange = {};
    if (query.startDate) {
      const isoStart = normalizeDateToIso(query.startDate);
      if (!isoStart) return { error: 'Format query parameter startDate tidak valid' };
      dateRange.$gte = isoStart;
    }
    if (query.endDate) {
      const isoEnd = normalizeDateToIso(query.endDate);
      if (!isoEnd) return { error: 'Format query parameter endDate tidak valid' };
      dateRange.$lte = isoEnd;
    }
    filter.date = dateRange;
  }

  if (query.minAmount !== undefined || query.maxAmount !== undefined) {
    const amountRange = {};
    if (query.minAmount !== undefined && query.minAmount !== '') {
      const min = Number(query.minAmount);
      if (!Number.isFinite(min)) return { error: 'minAmount harus berupa angka' };
      amountRange.$gte = min;
    }
    if (query.maxAmount !== undefined && query.maxAmount !== '') {
      const max = Number(query.maxAmount);
      if (!Number.isFinite(max)) return { error: 'maxAmount harus berupa angka' };
      amountRange.$lte = max;
    }
    if (Object.keys(amountRange).length > 0) {
      filter.amount = amountRange;
    }
  }

  return { filter };
}

/**
 * CREATE: POST /api/transactions
 */
async function createTransaction(req, res) {
  try {
    const { type, category, amount, note, date } = req.body;

    if (!type || !['pemasukan', 'pengeluaran'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Field "type" wajib diisi dengan nilai "pemasukan" atau "pengeluaran"',
      });
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Field "amount" wajib berupa angka lebih dari 0',
      });
    }

    let isoDate = getTodayIso();
    if (date !== undefined && date !== null && date !== '') {
      isoDate = normalizeDateToIso(date);
      if (!isoDate) {
        return res.status(400).json({
          success: false,
          message: 'Format tanggal tidak valid. Gunakan format YYYY-MM-DD atau DD/MM/YYYY',
        });
      }
    }

    const cleanCategory = category && String(category).trim() ? String(category).trim() : 'Lainnya';
    const cleanNote =
      note && String(note).trim()
        ? String(note).trim()
        : type === 'pemasukan'
          ? 'Pemasukan'
          : 'Pengeluaran';

    const created = await Transaction.create({
      type,
      category: cleanCategory,
      amount: numericAmount,
      note: cleanNote,
      date: isoDate,
    });

    return res.status(201).json({
      success: true,
      message: 'Transaksi berhasil ditambahkan',
      data: created,
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan pada server saat membuat transaksi',
      error: error.message,
    });
  }
}

/**
 * READ ALL + QUERY PARAMS: GET /api/transactions
 */
async function getTransactions(req, res) {
  try {
    const { filter, error } = buildTransactionFilter(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error,
      });
    }

    const allowedSortFields = ['date', 'amount', 'createdAt'];
    const sortBy = allowedSortFields.includes(req.query.sortBy) ? req.query.sortBy : 'date';
    const order = req.query.order === 'asc' ? 1 : -1;
    const sortObj = sortBy === 'createdAt' ? { createdAt: order } : { [sortBy]: order, createdAt: -1 };

    let mongooseQuery = Transaction.find(filter).sort(sortObj);

    const limitNum = Number(req.query.limit);
    const pageNum = Math.max(1, Number(req.query.page) || 1);
    if (Number.isFinite(limitNum) && limitNum > 0) {
      mongooseQuery = mongooseQuery.skip((pageNum - 1) * limitNum).limit(limitNum);
    }

    const [transactions, total] = await Promise.all([
      mongooseQuery,
      Transaction.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      message: 'Daftar transaksi berhasil diambil',
      data: transactions,
      meta: {
        total,
        count: transactions.length,
        sortBy,
        order: order === 1 ? 'asc' : 'desc',
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan pada server saat mengambil data transaksi',
      error: error.message,
    });
  }
}

/**
 * SUMMARY: GET /api/transactions/summary
 */
async function getTransactionSummary(_req, res) {
  try {
    const transactions = await Transaction.find({ deletedAt: null }).lean();
    const todayIso = getTodayIso();
    const { startIso: weekStart, endIso: weekEnd } = getCurrentWeekRangeIso();
    const { startIso: monthStart, endIso: monthEnd } = getCurrentMonthRangeIso();

    let totalIncome = 0;
    let totalExpense = 0;
    let todaySpent = 0;
    let weekSpent = 0;
    let monthSpent = 0;
    const catMap = {};
    const todayCatMap = {};

    for (const tx of transactions) {
      if (tx.type === 'pemasukan') {
        totalIncome += tx.amount;
      } else {
        totalExpense += tx.amount;
        if (!catMap[tx.category]) {
          catMap[tx.category] = { category: tx.category, total: 0, count: 0 };
        }
        catMap[tx.category].total += tx.amount;
        catMap[tx.category].count += 1;

        if (tx.date === todayIso) {
          todaySpent += tx.amount;
          todayCatMap[tx.category] = (todayCatMap[tx.category] || 0) + tx.amount;
        }
        if (tx.date >= weekStart && tx.date <= weekEnd) {
          weekSpent += tx.amount;
        }
        if (tx.date >= monthStart && tx.date <= monthEnd) {
          monthSpent += tx.amount;
        }
      }
    }

    const balance = totalIncome - totalExpense;
    const expenseRatio = totalIncome > 0 ? Number(((totalExpense / totalIncome) * 100).toFixed(2)) : 0;
    const categoryBreakdown = Object.values(catMap).sort((a, b) => b.total - a.total);
    const todayCategoryBreakdown = Object.entries(todayCatMap)
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);

    return res.status(200).json({
      success: true,
      message: 'Ringkasan keuangan berhasil dihitung',
      data: {
        totalIncome,
        totalExpense,
        balance,
        expenseRatio,
        transactionCount: transactions.length,
        todaySpent,
        weekSpent,
        monthSpent,
        categoryBreakdown,
        todayCategoryBreakdown,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat menghitung ringkasan keuangan',
      error: error.message,
    });
  }
}

/**
 * READ BY ID (Path Parameter): GET /api/transactions/:id
 */
async function getTransactionById(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Format ID transaksi tidak valid',
      });
    }

    const transaction = await Transaction.findOne({ _id: id, deletedAt: null });
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaksi tidak ditemukan',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Detail transaksi berhasil ditemukan',
      data: transaction,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan pada server saat mengambil detail transaksi',
      error: error.message,
    });
  }
}

/**
 * UPDATE (Path Parameter): PUT / PATCH /api/transactions/:id
 */
async function updateTransaction(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Format ID transaksi tidak valid',
      });
    }

    const updates = {};
    const { type, category, amount, note, date } = req.body;

    if (type !== undefined) {
      if (!['pemasukan', 'pengeluaran'].includes(type)) {
        return res.status(400).json({
          success: false,
          message: 'Field "type" harus bernilai "pemasukan" atau "pengeluaran"',
        });
      }
      updates.type = type;
    }

    if (category !== undefined) {
      const cleanCat = String(category).trim();
      if (!cleanCat) {
        return res.status(400).json({
          success: false,
          message: 'Field "category" tidak boleh kosong',
        });
      }
      updates.category = cleanCat;
    }

    if (amount !== undefined) {
      const numAmt = Number(amount);
      if (!Number.isFinite(numAmt) || numAmt <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Field "amount" harus berupa angka lebih dari 0',
        });
      }
      updates.amount = numAmt;
    }

    if (note !== undefined) {
      const cleanNote = String(note).trim();
      if (!cleanNote) {
        return res.status(400).json({
          success: false,
          message: 'Field "note" tidak boleh kosong',
        });
      }
      updates.note = cleanNote;
    }

    if (date !== undefined) {
      const isoDate = normalizeDateToIso(date);
      if (!isoDate) {
        return res.status(400).json({
          success: false,
          message: 'Format tanggal tidak valid. Gunakan format YYYY-MM-DD atau DD/MM/YYYY',
        });
      }
      updates.date = isoDate;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Minimal satu field harus dikirim untuk memperbarui transaksi',
      });
    }

    const updated = await Transaction.findOneAndUpdate({ _id: id, deletedAt: null }, updates, {
      new: true,
      runValidators: true,
    });

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Transaksi tidak ditemukan',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Transaksi berhasil diperbarui',
      data: updated,
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan pada server saat memperbarui transaksi',
      error: error.message,
    });
  }
}

/**
 * DELETE (Path Parameter): DELETE /api/transactions/:id
 * Default: Soft Delete (deletedAt = now, TTL 30 hari, bisa di-restore).
 * Gunakan ?hard=true untuk hapus permanen.
 */
async function deleteTransaction(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Format ID transaksi tidak valid',
      });
    }

    const isHardDelete = req.query.hard === 'true';
    const deleted = isHardDelete
      ? await Transaction.findByIdAndDelete(id)
      : await Transaction.findOneAndUpdate(
          { _id: id, deletedAt: null },
          { deletedAt: new Date() },
          { new: true }
        );

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Transaksi tidak ditemukan',
      });
    }

    return res.status(200).json({
      success: true,
      message: isHardDelete
        ? 'Transaksi berhasil dihapus permanen'
        : 'Transaksi dipindahkan ke tempat sampah (dapat dipulihkan dalam 30 hari)',
      data: deleted,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan pada server saat menghapus transaksi',
      error: error.message,
    });
  }
}

/**
 * TRASH LIST: GET /api/transactions/trash
 */
async function getTrashTransactions(_req, res) {
  try {
    const items = await Transaction.find({ deletedAt: { $ne: null } }).sort({ deletedAt: -1 });
    return res.status(200).json({
      success: true,
      message: 'Daftar transaksi di tempat sampah berhasil diambil',
      data: items,
      meta: { count: items.length },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengambil tempat sampah transaksi',
      error: error.message,
    });
  }
}

/**
 * UNDO / RESTORE: POST /api/transactions/:id/restore
 */
async function restoreTransaction(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Format ID transaksi tidak valid',
      });
    }

    const restored = await Transaction.findOneAndUpdate(
      { _id: id, deletedAt: { $ne: null } },
      { deletedAt: null },
      { new: true }
    );

    if (!restored) {
      return res.status(404).json({
        success: false,
        message: 'Transaksi tidak ditemukan di tempat sampah',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Transaksi berhasil dipulihkan',
      data: restored,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat memulihkan transaksi',
      error: error.message,
    });
  }
}

/**
 * BULK DELETE (Filter/All): DELETE /api/transactions
 */
async function bulkDeleteTransactions(req, res) {
  try {
    const hasFilterParam = Boolean(
      req.query.type ||
        req.query.category ||
        req.query.search ||
        req.query.date ||
        req.query.startDate ||
        req.query.endDate
    );

    if (!hasFilterParam && req.query.all !== 'true') {
      return res.status(400).json({
        success: false,
        message: 'Sertakan parameter filter atau ?all=true untuk menghapus transaksi secara massal',
      });
    }

    const { filter, error } = buildTransactionFilter(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error,
      });
    }

    const result = await Transaction.deleteMany(filter);
    return res.status(200).json({
      success: true,
      message: `${result.deletedCount} transaksi berhasil dihapus`,
      data: { deletedCount: result.deletedCount },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat menghapus transaksi massal',
      error: error.message,
    });
  }
}

module.exports = {
  createTransaction,
  getTransactions,
  getTransactionSummary,
  getTransactionById,
  updateTransaction,
  deleteTransaction,
  getTrashTransactions,
  restoreTransaction,
  bulkDeleteTransactions,
};

