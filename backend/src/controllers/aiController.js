const Transaction = require('../models/Transaction');
const BudgetSetting = require('../models/BudgetSetting');
const SavingGoal = require('../models/SavingGoal');
const Debt = require('../models/Debt');
const { getTodayIso } = require('../utils/dateHelper');
const { generateFinancialAdvice } = require('../utils/financialAdvisor');

/**
 * POST /api/ai/advisor
 * Mengirim kondisi keuangan live dari MongoDB ke Google Gemini API untuk saran AI Advisor.
 */
async function askAdvisor(req, res) {
  try {
    const { prompt = '' } = req.body || {};

    const [transactions, budgetDoc, goals, debts] = await Promise.all([
      Transaction.find({}).lean(),
      BudgetSetting.findOne({ key: 'default' }).lean(),
      SavingGoal.find({}).lean(),
      Debt.find({}).lean(),
    ]);

    const todayIso = getTodayIso();
    let totalIncome = 0;
    let totalExpense = 0;
    let todaySpent = 0;
    const catMap = {};

    for (const tx of transactions) {
      if (tx.type === 'pemasukan') {
        totalIncome += tx.amount;
      } else {
        totalExpense += tx.amount;
        if (tx.date === todayIso) todaySpent += tx.amount;
        if (!catMap[tx.category]) catMap[tx.category] = { category: tx.category, total: 0, count: 0 };
        catMap[tx.category].total += tx.amount;
        catMap[tx.category].count += 1;
      }
    }

    const balance = totalIncome - totalExpense;
    const expenseRatio = totalIncome > 0 ? (totalExpense / totalIncome) * 100 : 0;
    const categoryBreakdown = Object.values(catMap).sort((a, b) => b.total - a.total);

    const summary = {
      totalIncome,
      totalExpense,
      balance,
      expenseRatio,
      todaySpent,
      categoryBreakdown,
    };

    const budget = budgetDoc || { mode: null, limitValue: 0 };
    const result = await generateFinancialAdvice({
      prompt: String(prompt || ''),
      summary,
      budget,
      goals,
      debts,
    });

    return res.status(200).json({
      success: true,
      message: 'Analisis AI Advisor berhasil dibuat',
      data: {
        reply: result.reply,
        source: result.source,
        model: result.model,
        snapshot: {
          balance,
          totalIncome,
          totalExpense,
          expenseRatio: Number(expenseRatio.toFixed(2)),
        },
      },
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Terjadi kesalahan saat memproses AI Advisor Gemini',
    });
  }
}

module.exports = {
  askAdvisor,
};
