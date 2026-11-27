const { parseReceiptText } = require('../utils/receiptParser');

/**
 * POST /api/ocr/parse
 * Mengurai teks mentah hasil OCR struk belanja menjadi data transaksi terstruktur.
 * Menggunakan parser lokal deterministik (tidak bergantung pada layanan pihak ketiga yang bisa mati).
 */
async function parseReceipt(req, res) {
  try {
    const { rawText } = req.body;

    if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Field "rawText" wajib diisi dengan teks hasil scan OCR struk',
      });
    }

    let parsed = parseReceiptText(rawText);

    // Jika total belum ditemukan oleh parser lokal dan GEMINI_API_KEY tersedia, coba bantu parse dengan Gemini API
    const apiKey = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim();
    if (parsed.total === 0 && apiKey) {
      for (const model of ['gemini-3.5-flash', 'gemini-flash-lite-latest']) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);
          const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: controller.signal,
              body: JSON.stringify({
                contents: [
                  {
                    parts: [
                      {
                        text: `Ekstrak data struk berikut ke JSON valid tanpa markdown backticks: {"toko":"nama_toko","total":angka_bulat,"items":"item1, item2"}.\n\n${rawText}`,
                      },
                    ],
                  },
                ],
              }),
            }
          );
          clearTimeout(timeoutId);

          if (resp.ok) {
            const json = await resp.json();
            const txt = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const match = txt.match(/\{[\s\S]*\}/);
            if (match) {
              const aiParsed = JSON.parse(match[0]);
              const aiTotal = Math.round(Number(aiParsed.total) || 0);
              if (aiTotal > 0) {
                parsed = {
                  ...parsed,
                  toko: aiParsed.toko || parsed.toko,
                  total: aiTotal,
                  items: aiParsed.items || parsed.items,
                  parserSource: 'gemini-fallback',
                };
                break;
              }
            }
          }
        } catch (err) {
          console.warn(`[OCR Parser] Gemini (${model}) fallback gagal, pakai hasil lokal:`, err.message);
        }
      }
    }

    return res.status(200).json({
      success: true,
      message:
        parsed.total > 0
          ? 'Struk berhasil dianalisis'
          : 'Teks struk dibaca, namun nominal total belum terdeteksi otomatis',
      data: parsed,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat menganalisis teks struk',
      error: error.message,
    });
  }
}

module.exports = {
  parseReceipt,
};

