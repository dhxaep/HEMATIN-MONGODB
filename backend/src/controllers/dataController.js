const Transaction = require('../models/Transaction');
const BudgetSetting = require('../models/BudgetSetting');
const SavingGoal = require('../models/SavingGoal');
const Debt = require('../models/Debt');
const { getTodayIso, normalizeDateToIso } = require('../utils/dateHelper');

/**
 * GET /api/data/export
 */
async function exportAllData(_req, res) {
  try {
    const [transactions, budgetDoc, savingGoals, debts] = await Promise.all([
      Transaction.find({}).sort({ date: -1, createdAt: -1 }),
      BudgetSetting.findOne({ key: 'default' }),
      SavingGoal.find({}).sort({ createdAt: 1 }),
      Debt.find({}).sort({ createdAt: -1 }),
    ]);

    return res.status(200).json({
      success: true,
      message: 'Backup data berhasil diekspor',
      data: {
        transactions,
        budgetSetup: budgetDoc || {
          mode: null,
          limitValue: 0,
          dateLimits: {},
          tabunganBalance: 0,
          autoSaveRemainingLimit: true,
        },
        savingGoals,
        debts,
        exportDate: new Date().toISOString(),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengekspor data',
      error: error.message,
    });
  }
}

/**
 * POST /api/data/import
 * Mendukung format JSON backup Hematin v1 (LocalStorage D/M/YYYY) maupun v2 (MongoDB YYYY-MM-DD).
 */
async function importAllData(req, res) {
  try {
    const payload = req.body;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Payload JSON import tidak valid',
      });
    }

    const { transactions, budgetSetup, savingGoals, debts } = payload;
    const importedCounts = { transactions: 0, savingGoals: 0, debts: 0 };

    if (Array.isArray(transactions)) {
      const validTx = transactions
        .filter((t) => t && ['pemasukan', 'pengeluaran'].includes(t.type) && Number(t.amount) > 0)
        .map((t) => ({
          type: t.type,
          category: String(t.category || 'Lainnya').trim(),
          amount: Number(t.amount),
          note: String(t.note || (t.type === 'pemasukan' ? 'Pemasukan' : 'Pengeluaran')).trim(),
          date: normalizeDateToIso(t.date) || getTodayIso(),
        }));

      await Transaction.deleteMany({});
      if (validTx.length > 0) {
        await Transaction.insertMany(validTx);
      }
      importedCounts.transactions = validTx.length;
    }

    if (budgetSetup && typeof budgetSetup === 'object') {
      const normalizedLimits = new Map();
      if (budgetSetup.dateLimits && typeof budgetSetup.dateLimits === 'object') {
        for (const [k, v] of Object.entries(budgetSetup.dateLimits)) {
          const iso = normalizeDateToIso(k);
          const num = Number(v);
          if (iso && Number.isFinite(num) && num >= 0) {
            normalizedLimits.set(iso, num);
          }
        }
      }

      const mode = ['harian', 'mingguan', 'bulanan', null].includes(budgetSetup.mode)
        ? budgetSetup.mode
        : null;

      await BudgetSetting.findOneAndUpdate(
        { key: 'default' },
        {
          $set: {
            mode,
            limitValue: Math.max(0, Number(budgetSetup.limitValue) || 0),
            dateLimits: normalizedLimits,
            tabunganBalance: Math.max(0, Number(budgetSetup.tabunganBalance) || 0),
            autoSaveRemainingLimit:
              budgetSetup.autoSaveRemainingLimit !== undefined
                ? Boolean(budgetSetup.autoSaveRemainingLimit)
                : true,
            setupAt: mode ? getTodayIso() : null,
          },
        },
        { upsert: true, new: true }
      );
    }

    if (Array.isArray(savingGoals)) {
      const validGoals = savingGoals
        .filter((g) => g && g.title && Number(g.targetAmount) > 0)
        .map((g) => ({
          title: String(g.title).trim(),
          targetAmount: Number(g.targetAmount),
          currentAmount: Math.max(0, Number(g.currentAmount) || 0),
          icon: String(g.icon || 'target').trim(),
        }));

      await SavingGoal.deleteMany({});
      if (validGoals.length > 0) {
        await SavingGoal.insertMany(validGoals);
      }
      importedCounts.savingGoals = validGoals.length;
    }

    if (Array.isArray(debts)) {
      const validDebts = debts
        .filter((d) => d && d.person && ['hutang', 'piutang'].includes(d.type) && Number(d.amount) > 0)
        .map((d) => ({
          person: String(d.person).trim(),
          amount: Number(d.amount),
          type: d.type,
          note: String(d.note || '').trim(),
          dueDate: normalizeDateToIso(d.dueDate) || getTodayIso(),
          isPaid: Boolean(d.isPaid),
        }));

      await Debt.deleteMany({});
      if (validDebts.length > 0) {
        await Debt.insertMany(validDebts);
      }
      importedCounts.debts = validDebts.length;
    }

    return res.status(200).json({
      success: true,
      message: 'Data berhasil di-import ke MongoDB',
      data: importedCounts,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengimpor data',
      error: error.message,
    });
  }
}

/**
 * DELETE /api/data/clear
 */
async function clearAllData(_req, res) {
  try {
    await Promise.all([
      Transaction.deleteMany({}),
      SavingGoal.deleteMany({}),
      Debt.deleteMany({}),
      BudgetSetting.findOneAndUpdate(
        { key: 'default' },
        {
          $set: {
            mode: null,
            limitValue: 0,
            dateLimits: {},
            tabunganBalance: 0,
            autoSaveRemainingLimit: true,
            lastAutoSaveDate: null,
            setupAt: null,
          },
        },
        { upsert: true }
      ),
    ]);

    return res.status(200).json({
      success: true,
      message: 'Seluruh data di database berhasil dihapus',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat menghapus seluruh data',
      error: error.message,
    });
  }
}

module.exports = {
  exportAllData,
  importAllData,
  clearAllData,
};

