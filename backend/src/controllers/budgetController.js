const BudgetSetting = require('../models/BudgetSetting');
const Transaction = require('../models/Transaction');
const SavingGoal = require('../models/SavingGoal');
const { getTodayIso, getYesterdayIso, normalizeDateToIso } = require('../utils/dateHelper');

async function getOrCreateBudget() {
  let budget = await BudgetSetting.findOne({ key: 'default' });
  if (!budget) {
    budget = await BudgetSetting.create({ key: 'default' });
  }
  return budget;
}

/**
 * GET /api/budget
 */
async function getBudget(_req, res) {
  try {
    const budget = await getOrCreateBudget();
    return res.status(200).json({
      success: true,
      message: 'Pengaturan budget berhasil diambil',
      data: budget,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengambil pengaturan budget',
      error: error.message,
    });
  }
}

/**
 * PUT /api/budget
 */
async function updateBudget(req, res) {
  try {
    const { mode, limitValue, autoSaveRemainingLimit, tabunganBalance, dateLimits } = req.body;
    const budget = await getOrCreateBudget();

    if (mode !== undefined) {
      if (!['harian', 'mingguan', 'bulanan', null].includes(mode)) {
        return res.status(400).json({
          success: false,
          message: 'Mode budget harus harian, mingguan, atau bulanan',
        });
      }
      if (mode !== null && !budget.setupAt) {
        budget.setupAt = getTodayIso();
      }
      budget.mode = mode;
    }

    if (limitValue !== undefined) {
      const numLimit = Number(limitValue);
      if (!Number.isFinite(numLimit) || numLimit < 0) {
        return res.status(400).json({
          success: false,
          message: 'Nominal limit tidak boleh negatif',
        });
      }
      budget.limitValue = numLimit;
    }

    if (autoSaveRemainingLimit !== undefined) {
      budget.autoSaveRemainingLimit = Boolean(autoSaveRemainingLimit);
    }

    if (tabunganBalance !== undefined) {
      const numTab = Number(tabunganBalance);
      if (!Number.isFinite(numTab) || numTab < 0) {
        return res.status(400).json({
          success: false,
          message: 'Saldo tabungan tidak boleh negatif',
        });
      }
      budget.tabunganBalance = numTab;
    }

    if (dateLimits && typeof dateLimits === 'object') {
      const normalizedMap = new Map();
      for (const [rawDate, val] of Object.entries(dateLimits)) {
        const iso = normalizeDateToIso(rawDate);
        const numVal = Number(val);
        if (iso && Number.isFinite(numVal) && numVal >= 0) {
          normalizedMap.set(iso, numVal);
        }
      }
      budget.dateLimits = normalizedMap;
    }

    await budget.save();

    return res.status(200).json({
      success: true,
      message: 'Pengaturan budget berhasil disimpan',
      data: budget,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat menyimpan pengaturan budget',
      error: error.message,
    });
  }
}

/**
 * PATCH /api/budget/daily-limit/:date
 */
async function setDailyLimit(req, res) {
  try {
    const isoDate = normalizeDateToIso(req.params.date);
    if (!isoDate) {
      return res.status(400).json({
        success: false,
        message: 'Parameter tanggal tidak valid. Gunakan format YYYY-MM-DD',
      });
    }

    const limitNum = Number(req.body.limitValue);
    if (!Number.isFinite(limitNum) || limitNum <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Nominal limit harian harus lebih dari 0',
      });
    }

    const budget = await getOrCreateBudget();
    budget.dateLimits.set(isoDate, limitNum);
    await budget.save();

    return res.status(200).json({
      success: true,
      message: `Limit harian untuk tanggal ${isoDate} berhasil diatur`,
      data: budget,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengatur limit harian',
      error: error.message,
    });
  }
}

/**
 * DELETE /api/budget/daily-limit/:date
 * Menghapus limit khusus pada tanggal tertentu sehingga kembali mengikuti limit default.
 */
async function deleteDailyLimit(req, res) {
  try {
    const isoDate = normalizeDateToIso(req.params.date);
    if (!isoDate) {
      return res.status(400).json({
        success: false,
        message: 'Parameter tanggal tidak valid. Gunakan format YYYY-MM-DD',
      });
    }

    const budget = await getOrCreateBudget();
    budget.dateLimits.delete(isoDate);
    await budget.save();

    return res.status(200).json({
      success: true,
      message: `Limit khusus untuk tanggal ${isoDate} berhasil dikembalikan ke default`,
      data: budget,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mereset limit harian',
      error: error.message,
    });
  }
}

/**
 * DELETE /api/budget/reset
 */
async function resetBudget(_req, res) {
  try {
    const budget = await getOrCreateBudget();
    budget.mode = null;
    budget.limitValue = 0;
    budget.dateLimits = new Map();
    budget.tabunganBalance = 0;
    budget.setupAt = null;
    budget.lastAutoSaveDate = null;
    await budget.save();

    return res.status(200).json({
      success: true,
      message: 'Pengaturan budget berhasil di-reset',
      data: budget,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mereset pengaturan budget',
      error: error.message,
    });
  }
}

/**
 * POST /api/budget/auto-save
 * Memindahkan sisa limit harian kemarin ke Target Tabungan secara idempoten tanpa membuat saldo minus.
 */
async function runAutoSave(req, res) {
  try {
    const budget = await getOrCreateBudget();
    const todayIso = req.body?.todayIso ? normalizeDateToIso(req.body.todayIso) : getTodayIso();
    const yesterdayIso = req.body?.yesterdayIso ? normalizeDateToIso(req.body.yesterdayIso) : getYesterdayIso();

    if (!todayIso || !yesterdayIso) {
      return res.status(400).json({
        success: false,
        message: 'Parameter tanggal auto-save tidak valid',
      });
    }

    if (!budget.autoSaveRemainingLimit || budget.mode !== 'harian' || budget.limitValue <= 0) {
      return res.status(200).json({
        success: true,
        message: 'Auto-save tidak aktif atau mode bukan harian',
        data: { executed: false, reason: 'inactive_or_not_daily' },
      });
    }

    if (!budget.setupAt || budget.setupAt >= todayIso) {
      return res.status(200).json({
        success: true,
        message: 'Auto-save hanya berjalan setelah hari pertama setup budget',
        data: { executed: false, reason: 'first_day_guard' },
      });
    }

    if (budget.lastAutoSaveDate === yesterdayIso) {
      return res.status(200).json({
        success: true,
        message: `Auto-save untuk tanggal ${yesterdayIso} sudah diproses sebelumnya`,
        data: { executed: false, reason: 'already_processed' },
      });
    }

    const firstGoal = await SavingGoal.findOne().sort({ createdAt: 1 });
    if (!firstGoal) {
      return res.status(200).json({
        success: true,
        message: 'Belum ada target tabungan untuk menerima alokasi otomatis',
        data: { executed: false, reason: 'no_goal' },
      });
    }

    const allTx = await Transaction.find({}).lean();
    if (allTx.length === 0) {
      budget.lastAutoSaveDate = yesterdayIso;
      await budget.save();
      return res.status(200).json({
        success: true,
        message: 'Belum ada riwayat transaksi untuk auto-save',
        data: { executed: false, reason: 'no_transactions' },
      });
    }

    let totalIncome = 0;
    let totalExpense = 0;
    let spentYesterday = 0;

    for (const tx of allTx) {
      if (tx.type === 'pemasukan') {
        totalIncome += tx.amount;
      } else {
        totalExpense += tx.amount;
        if (tx.date === yesterdayIso) {
          spentYesterday += tx.amount;
        }
      }
    }

    const currentBalance = totalIncome - totalExpense;
    const limitYesterday = budget.dateLimits.get(yesterdayIso) || budget.limitValue;
    const unusedLimit = limitYesterday - spentYesterday;

    if (unusedLimit <= 0 || currentBalance < unusedLimit) {
      budget.lastAutoSaveDate = yesterdayIso;
      await budget.save();
      return res.status(200).json({
        success: true,
        message: 'Tidak ada sisa limit yang aman untuk dipindahkan ke tabungan',
        data: { executed: false, reason: unusedLimit <= 0 ? 'limit_used_up' : 'insufficient_balance' },
      });
    }

    const autoTx = await Transaction.create({
      type: 'pengeluaran',
      category: 'Tabungan',
      amount: unusedLimit,
      note: `Otomatis Masuk Tabungan (${firstGoal.title})`,
      date: todayIso,
    });

    firstGoal.currentAmount += unusedLimit;
    await firstGoal.save();

    budget.lastAutoSaveDate = yesterdayIso;
    await budget.save();

    return res.status(200).json({
      success: true,
      message: `Sisa limit kemarin Rp ${unusedLimit.toLocaleString('id-ID')} otomatis dipindahkan ke tabungan`,
      data: {
        executed: true,
        amount: unusedLimit,
        transaction: autoTx,
        goal: firstGoal,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat memproses auto-save sisa limit',
      error: error.message,
    });
  }
}

module.exports = {
  getBudget,
  updateBudget,
  setDailyLimit,
  deleteDailyLimit,
  resetBudget,
  runAutoSave,
};

