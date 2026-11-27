function formatRp(num) {
  return Number(num || 0).toLocaleString('id-ID');
}

function stripEmojis(text) {
  return String(text || '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\uFE0F]/gu, '')
    .replace(/ {2,}/g, ' ')
    .trim();
}

function buildFinancialContextText({ prompt, summary, budget, goals, debts }) {
  const {
    totalIncome = 0,
    totalExpense = 0,
    balance = 0,
    expenseRatio = 0,
    todaySpent = 0,
    categoryBreakdown = [],
  } = summary;

  const topCategories =
    categoryBreakdown.length > 0
      ? categoryBreakdown
          .slice(0, 3)
          .map((c) => `${c.category}: Rp ${formatRp(c.total)} (${c.count}x)`)
          .join(', ')
      : 'Belum ada pengeluaran';

  const goalsInfo =
    goals.length > 0
      ? goals
          .map(
            (g) =>
              `${g.title} (terkumpul Rp ${formatRp(g.currentAmount)} / target Rp ${formatRp(g.targetAmount)})`
          )
          .join('; ')
      : 'Belum ada target tabungan';

  const unpaidHutang = debts
    .filter((d) => d.type === 'hutang' && !d.isPaid)
    .reduce((acc, d) => acc + d.amount, 0);
  const unpaidPiutang = debts
    .filter((d) => d.type === 'piutang' && !d.isPaid)
    .reduce((acc, d) => acc + d.amount, 0);

  return [
    '[DATA KEUANGAN PENGGUNA SAAT INI (LIVE MONGODB)]',
    `- Saldo Saat Ini: Rp ${formatRp(balance)}`,
    `- Total Pemasukan: Rp ${formatRp(totalIncome)}`,
    `- Total Pengeluaran: Rp ${formatRp(totalExpense)} (Rasio pengeluaran: ${expenseRatio.toFixed(1)}%)`,
    `- Pengeluaran Hari Ini: Rp ${formatRp(todaySpent)}`,
    `- Budget Limit: Mode ${budget.mode || 'Belum diatur'}, Nominal Rp ${formatRp(budget.limitValue || 0)}`,
    `- Top 3 Kategori Pengeluaran: ${topCategories}`,
    `- Target Tabungan: ${goalsInfo}`,
    `- Hutang Belum Lunas: Rp ${formatRp(unpaidHutang)} | Piutang Belum Tertagih: Rp ${formatRp(unpaidPiutang)}`,
    '',
    '[PERTANYAAN PENGGUNA]',
    prompt && String(prompt).trim()
      ? String(prompt).trim()
      : 'Berikan analisis singkat kondisi keuangan saya dan saran praktis cara berhemat berdasarkan data di atas.',
  ].join('\n');
}

const DEFAULT_UNLIAI_URL = 'https://api.ikyyxd.my.id/ai/unliai';

async function callUnliAi(sysPrompt, userPrompt) {
  const baseUrl = (process.env.UNLIAI_API_URL || DEFAULT_UNLIAI_URL).trim();
  const fullText = `${sysPrompt}\n\n${userPrompt}`;
  const url = `${baseUrl}?teks=${encodeURIComponent(fullText)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const json = await response.json().catch(() => ({}));
    const rawText = json?.result?.response;
    if (response.ok && json?.status && typeof rawText === 'string' && rawText.trim()) {
      return {
        reply: stripEmojis(rawText),
        source: 'unliai-api',
        model: 'unliai',
      };
    }

    throw new Error(json?.message || `HTTP ${response.status} / respon kosong dari UnliAI`);
  } catch (err) {
    clearTimeout(timeoutId);
    throw new Error(err.name === 'AbortError' ? 'UnliAI timeout' : err.message);
  }
}

/**
 * Primary: UnliAI (GET https://api.ikyyxd.my.id/ai/unliai?teks=...)
 * Fallback: Google Gemini API (hanya dipanggil jika UnliAI gagal).
 */
async function generateFinancialAdvice(context) {
  const sysPrompt = [
    'Kamu adalah AI Financial Advisor pribadi untuk aplikasi keuangan Hematin.',
    'Jawab menggunakan bahasa Indonesia yang ramah, jelas, terstruktur dengan Markdown (heading ringkas dan bullet points), dan konkret berdasarkan angka data keuangan pengguna.',
    'DILARANG KERAS menggunakan emoticon, emoji Unicode (seperti senyum, api, uang, centang, roket), atau format matematika LaTeX.',
  ].join(' ');

  const userPrompt = buildFinancialContextText(context);

  let unliAiError = null;
  try {
    return await callUnliAi(sysPrompt, userPrompt);
  } catch (err) {
    unliAiError = err.message;
  }

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    const err = new Error(
      `UnliAI gagal (${unliAiError}) dan fallback GEMINI_API_KEY belum dikonfigurasi.`
    );
    err.statusCode = 503;
    throw err;
  }

  const candidateModels = Array.from(
    new Set(
      [
        process.env.GEMINI_MODEL && process.env.GEMINI_MODEL.trim(),
        'gemini-3.5-flash',
        'gemini-flash-lite-latest',
        'gemini-3.1-flash-lite-preview',
        'gemini-3.8-flash',
        'gemini-flash-latest',
      ].filter(Boolean)
    )
  );

  const errors = [`unliai: ${unliAiError}`];

  for (const model of candidateModels) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          model
        )}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: sysPrompt }] },
            contents: [{ parts: [{ text: userPrompt }] }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 900,
            },
          }),
        }
      );

      clearTimeout(timeoutId);

      const json = await response.json().catch(() => ({}));
      if (response.ok) {
        const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText && rawText.trim()) {
          return {
            reply: stripEmojis(rawText),
            source: 'gemini-api',
            model,
          };
        }
        errors.push(`${model}: respon kosong dari Gemini API`);
      } else {
        const errMsg = json?.error?.message || `HTTP ${response.status}`;
        errors.push(`${model}: ${errMsg}`);
        // Jika key tidak valid (400/401/403), hentikan loop segera
        if ([400, 401, 403].includes(response.status)) {
          const authErr = new Error(`Gemini API menolak permintaan (${response.status}): ${errMsg}`);
          authErr.statusCode = response.status === 400 ? 400 : 502;
          throw authErr;
        }
      }
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.statusCode && err.statusCode < 500) {
        throw err;
      }
      errors.push(`${model}: ${err.name === 'AbortError' ? 'Timeout' : err.message}`);
    }
  }

  const finalErr = new Error(
    `Gagal memperoleh respon dari Gemini AI (${errors.join(' | ')})`
  );
  finalErr.statusCode = 502;
  throw finalErr;
}

module.exports = {
  generateFinancialAdvice,
};
