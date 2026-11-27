const Transaction = require('../models/Transaction');
const { getTodayIso } = require('../utils/dateHelper');

function getIsoDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function computeHealthScore({ totalIncome, totalExpense, balance }) {
  if (totalIncome === 0 && totalExpense === 0) {
    return { score: 100, grade: 'A', status: 'Belum Ada Pengeluaran' };
  }
  const expenseRatio = totalIncome > 0 ? totalExpense / totalIncome : 1.5;
  let score = 100;
  if (balance < 0) {
    score = Math.max(10, 40 - Math.min(30, Math.round((Math.abs(balance) / Math.max(1, totalExpense)) * 30)));
  } else if (expenseRatio > 0.9) {
    score = 45;
  } else if (expenseRatio > 0.75) {
    score = 65;
  } else if (expenseRatio > 0.5) {
    score = 82;
  } else {
    score = Math.min(100, Math.round(90 + (0.5 - expenseRatio) * 20));
  }

  const grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'D';
  const status =
    score >= 85 ? 'Sangat Sehat' : score >= 70 ? 'Sehat' : score >= 50 ? 'Waspada' : 'Kritis';
  return { score, grade, status };
}

/**
 * GET /api/analytics/summary
 * Single round-trip MongoDB Aggregation Pipeline ($facet + $group + $sort)
 */
async function getAnalyticsSummary(req, res) {
  try {
    const todayIso = getTodayIso();
    const thirtyDaysAgoIso = getIsoDaysAgo(30);

    const [result] = await Transaction.aggregate([
      { $match: { deletedAt: null } },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: '$type',
                total: { $sum: '$amount' },
                count: { $sum: 1 },
              },
            },
          ],
          last30DaysExpense: [
            {
              $match: {
                type: 'pengeluaran',
                date: { $gte: thirtyDaysAgoIso, $lte: todayIso },
              },
            },
            {
              $group: {
                _id: null,
                total: { $sum: '$amount' },
                activeDays: { $addToSet: '$date' },
              },
            },
          ],
          topCategories: [
            { $match: { type: 'pengeluaran' } },
            {
              $group: {
                _id: '$category',
                total: { $sum: '$amount' },
                count: { $sum: 1 },
              },
            },
            { $sort: { total: -1 } },
            { $limit: 5 },
          ],
          monthlyTrend: [
            {
              $group: {
                _id: {
                  month: { $substrCP: ['$date', 0, 7] },
                  type: '$type',
                },
                total: { $sum: '$amount' },
              },
            },
            { $sort: { '_id.month': -1 } },
          ],
        },
      },
    ]);

    let totalIncome = 0;
    let totalExpense = 0;
    let transactionCount = 0;

    for (const row of result?.totals || []) {
      transactionCount += row.count;
      if (row._id === 'pemasukan') totalIncome = row.total;
      if (row._id === 'pengeluaran') totalExpense = row.total;
    }

    const balance = totalIncome - totalExpense;
    const savingRatePct =
      totalIncome > 0 ? Number((((totalIncome - totalExpense) / totalIncome) * 100).toFixed(2)) : 0;

    const burnRow = result?.last30DaysExpense?.[0];
    const last30DaysExpense = burnRow?.total || 0;
    const activeSpendDays = burnRow?.activeDays?.length || 0;
    const dailyBurnRate = activeSpendDays > 0 ? Math.round(last30DaysExpense / Math.max(1, activeSpendDays)) : 0;
    const estimatedRunwayDays =
      dailyBurnRate > 0 && balance > 0 ? Math.floor(balance / dailyBurnRate) : balance <= 0 ? 0 : null;

    const topCategories = (result?.topCategories || []).map((c) => ({
      category: c._id,
      total: c.total,
      count: c.count,
      sharePct: totalExpense > 0 ? Number(((c.total / totalExpense) * 100).toFixed(1)) : 0,
    }));

    const monthMap = {};
    for (const row of result?.monthlyTrend || []) {
      const m = row._id.month;
      if (!monthMap[m]) monthMap[m] = { month: m, income: 0, expense: 0 };
      if (row._id.type === 'pemasukan') monthMap[m].income = row.total;
      else monthMap[m].expense = row.total;
    }
    const monthlyTrend = Object.values(monthMap)
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-6);

    const financialHealth = computeHealthScore({ totalIncome, totalExpense, balance });

    return res.status(200).json({
      success: true,
      message: 'Analitik keuangan berhasil dihitung melalui MongoDB Aggregation Pipeline',
      data: {
        totals: {
          totalIncome,
          totalExpense,
          balance,
          savingRatePct,
          transactionCount,
        },
        burnRate: {
          windowDays: 30,
          last30DaysExpense,
          activeSpendDays,
          dailyBurnRate,
          estimatedRunwayDays,
        },
        financialHealth,
        topCategories,
        monthlyTrend,
      },
      requestId: req.requestId,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Gagal menghitung analitik keuangan',
      error: error.message,
      requestId: req.requestId,
    });
  }
}

module.exports = { getAnalyticsSummary };
