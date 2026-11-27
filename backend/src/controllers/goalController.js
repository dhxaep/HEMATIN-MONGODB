const mongoose = require('mongoose');
const SavingGoal = require('../models/SavingGoal');

/**
 * GET /api/goals
 */
async function getGoals(req, res) {
  try {
    const filter = {};
    if (req.query.search) {
      const escaped = String(req.query.search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.title = new RegExp(escaped, 'i');
    }

    const goals = await SavingGoal.find(filter).sort({ createdAt: 1 });
    return res.status(200).json({
      success: true,
      message: 'Daftar target tabungan berhasil diambil',
      data: goals,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengambil target tabungan',
      error: error.message,
    });
  }
}

/**
 * POST /api/goals
 */
async function createGoal(req, res) {
  try {
    const { title, targetAmount, currentAmount, icon } = req.body;
    if (!title || !String(title).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Judul target tabungan wajib diisi',
      });
    }

    const targetNum = Number(targetAmount);
    if (!Number.isFinite(targetNum) || targetNum <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Target nominal harus lebih dari 0',
      });
    }

    const initialAmount = currentAmount !== undefined ? Number(currentAmount) : 0;
    if (!Number.isFinite(initialAmount) || initialAmount < 0) {
      return res.status(400).json({
        success: false,
        message: 'Nominal tabungan awal tidak boleh negatif',
      });
    }

    const goal = await SavingGoal.create({
      title: String(title).trim(),
      targetAmount: targetNum,
      currentAmount: initialAmount,
      icon: icon ? String(icon).trim() : 'target',
    });

    return res.status(201).json({
      success: true,
      message: 'Target tabungan berhasil ditambahkan',
      data: goal,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat membuat target tabungan',
      error: error.message,
    });
  }
}

/**
 * GET /api/goals/:id
 */
async function getGoalById(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Format ID target tabungan tidak valid',
      });
    }

    const goal = await SavingGoal.findById(id);
    if (!goal) {
      return res.status(404).json({
        success: false,
        message: 'Target tabungan tidak ditemukan',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Detail target tabungan berhasil diambil',
      data: goal,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengambil detail target tabungan',
      error: error.message,
    });
  }
}

/**
 * PUT /api/goals/:id
 */
async function updateGoal(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Format ID target tabungan tidak valid',
      });
    }

    const updates = {};
    if (req.body.title !== undefined) {
      const t = String(req.body.title).trim();
      if (!t) return res.status(400).json({ success: false, message: 'Judul tidak boleh kosong' });
      updates.title = t;
    }
    if (req.body.targetAmount !== undefined) {
      const targetNum = Number(req.body.targetAmount);
      if (!Number.isFinite(targetNum) || targetNum <= 0) {
        return res.status(400).json({ success: false, message: 'Target nominal harus lebih dari 0' });
      }
      updates.targetAmount = targetNum;
    }
    if (req.body.currentAmount !== undefined) {
      const curNum = Number(req.body.currentAmount);
      if (!Number.isFinite(curNum) || curNum < 0) {
        return res.status(400).json({ success: false, message: 'Saldo tabungan tidak boleh negatif' });
      }
      updates.currentAmount = curNum;
    }
    if (req.body.icon !== undefined) {
      updates.icon = String(req.body.icon).trim() || 'target';
    }

    const updated = await SavingGoal.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });
    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Target tabungan tidak ditemukan',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Target tabungan berhasil diperbarui',
      data: updated,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat memperbarui target tabungan',
      error: error.message,
    });
  }
}

/**
 * PATCH /api/goals/:id/deposit
 */
async function depositGoal(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Format ID target tabungan tidak valid',
      });
    }

    const amountNum = Number(req.body.amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Nominal setoran harus lebih dari 0',
      });
    }

    const updated = await SavingGoal.findByIdAndUpdate(
      id,
      { $inc: { currentAmount: amountNum } },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Target tabungan tidak ditemukan',
      });
    }

    return res.status(200).json({
      success: true,
      message: `Berhasil menambah setoran Rp ${amountNum.toLocaleString('id-ID')}`,
      data: updated,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat menambah setoran tabungan',
      error: error.message,
    });
  }
}

/**
 * DELETE /api/goals/:id
 */
async function deleteGoal(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Format ID target tabungan tidak valid',
      });
    }

    const deleted = await SavingGoal.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Target tabungan tidak ditemukan',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Target tabungan berhasil dihapus',
      data: deleted,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat menghapus target tabungan',
      error: error.message,
    });
  }
}

module.exports = {
  getGoals,
  createGoal,
  getGoalById,
  updateGoal,
  depositGoal,
  deleteGoal,
};

