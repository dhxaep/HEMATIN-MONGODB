const mongoose = require('mongoose');
const Debt = require('../models/Debt');
const { getTodayIso, normalizeDateToIso } = require('../utils/dateHelper');

/**
 * GET /api/debts
 */
async function getDebts(req, res) {
  try {
    const filter = {};

    if (req.query.type) {
      if (!['hutang', 'piutang'].includes(req.query.type)) {
        return res.status(400).json({
          success: false,
          message: 'Query parameter type harus hutang atau piutang',
        });
      }
      filter.type = req.query.type;
    }

    if (req.query.isPaid !== undefined && req.query.isPaid !== '') {
      if (!['true', 'false'].includes(String(req.query.isPaid))) {
        return res.status(400).json({
          success: false,
          message: 'Query parameter isPaid harus true atau false',
        });
      }
      filter.isPaid = String(req.query.isPaid) === 'true';
    }

    if (req.query.search) {
      const escaped = String(req.query.search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      filter.$or = [{ person: regex }, { note: regex }];
    }

    const debts = await Debt.find(filter).sort({ isPaid: 1, createdAt: -1 });
    return res.status(200).json({
      success: true,
      message: 'Daftar hutang-piutang berhasil diambil',
      data: debts,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengambil data hutang-piutang',
      error: error.message,
    });
  }
}

/**
 * POST /api/debts
 */
async function createDebt(req, res) {
  try {
    const { person, amount, type, note, dueDate } = req.body;

    if (!person || !String(person).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Nama orang wajib diisi',
      });
    }

    if (!type || !['hutang', 'piutang'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Jenis harus bernilai "hutang" atau "piutang"',
      });
    }

    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Nominal harus lebih dari 0',
      });
    }

    let isoDueDate = getTodayIso();
    if (dueDate !== undefined && dueDate !== null && dueDate !== '') {
      isoDueDate = normalizeDateToIso(dueDate);
      if (!isoDueDate) {
        return res.status(400).json({
          success: false,
          message: 'Format dueDate tidak valid',
        });
      }
    }

    const debt = await Debt.create({
      person: String(person).trim(),
      amount: amountNum,
      type,
      note: note ? String(note).trim() : '',
      dueDate: isoDueDate,
      isPaid: false,
    });

    return res.status(201).json({
      success: true,
      message: 'Catatan hutang/piutang berhasil ditambahkan',
      data: debt,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat membuat catatan hutang/piutang',
      error: error.message,
    });
  }
}

/**
 * GET /api/debts/:id
 */
async function getDebtById(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Format ID hutang/piutang tidak valid',
      });
    }

    const debt = await Debt.findById(id);
    if (!debt) {
      return res.status(404).json({
        success: false,
        message: 'Catatan hutang/piutang tidak ditemukan',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Detail catatan hutang/piutang berhasil diambil',
      data: debt,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengambil detail hutang/piutang',
      error: error.message,
    });
  }
}

/**
 * PUT /api/debts/:id
 */
async function updateDebt(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Format ID hutang/piutang tidak valid',
      });
    }

    const updates = {};
    if (req.body.person !== undefined) {
      const p = String(req.body.person).trim();
      if (!p) return res.status(400).json({ success: false, message: 'Nama orang tidak boleh kosong' });
      updates.person = p;
    }
    if (req.body.amount !== undefined) {
      const amt = Number(req.body.amount);
      if (!Number.isFinite(amt) || amt <= 0) {
        return res.status(400).json({ success: false, message: 'Nominal harus lebih dari 0' });
      }
      updates.amount = amt;
    }
    if (req.body.type !== undefined) {
      if (!['hutang', 'piutang'].includes(req.body.type)) {
        return res.status(400).json({ success: false, message: 'Jenis harus hutang atau piutang' });
      }
      updates.type = req.body.type;
    }
    if (req.body.note !== undefined) {
      updates.note = String(req.body.note).trim();
    }
    if (req.body.dueDate !== undefined) {
      const iso = normalizeDateToIso(req.body.dueDate);
      if (!iso) return res.status(400).json({ success: false, message: 'Format dueDate tidak valid' });
      updates.dueDate = iso;
    }
    if (req.body.isPaid !== undefined) {
      updates.isPaid = Boolean(req.body.isPaid);
    }

    const updated = await Debt.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });
    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Catatan hutang/piutang tidak ditemukan',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Catatan hutang/piutang berhasil diperbarui',
      data: updated,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat memperbarui catatan hutang/piutang',
      error: error.message,
    });
  }
}

/**
 * PATCH /api/debts/:id/toggle-paid
 */
async function toggleDebtPaid(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Format ID hutang/piutang tidak valid',
      });
    }

    const debt = await Debt.findById(id);
    if (!debt) {
      return res.status(404).json({
        success: false,
        message: 'Catatan hutang/piutang tidak ditemukan',
      });
    }

    debt.isPaid = !debt.isPaid;
    await debt.save();

    return res.status(200).json({
      success: true,
      message: `Status diperbarui menjadi ${debt.isPaid ? 'LUNAS' : 'BELUM LUNAS'}`,
      data: debt,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengubah status hutang/piutang',
      error: error.message,
    });
  }
}

/**
 * DELETE /api/debts/:id
 */
async function deleteDebt(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Format ID hutang/piutang tidak valid',
      });
    }

    const deleted = await Debt.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Catatan hutang/piutang tidak ditemukan',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Catatan hutang/piutang berhasil dihapus',
      data: deleted,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat menghapus catatan hutang/piutang',
      error: error.message,
    });
  }
}

module.exports = {
  getDebts,
  createDebt,
  getDebtById,
  updateDebt,
  toggleDebtPaid,
  deleteDebt,
};

