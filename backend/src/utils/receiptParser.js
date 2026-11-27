const { normalizeDateToIso } = require('./dateHelper');

const KNOWN_MERCHANTS = [
  { pattern: /alfamart/i, name: 'Alfamart' },
  { pattern: /alfamidi/i, name: 'Alfamidi' },
  { pattern: /indomaret/i, name: 'Indomaret' },
  { pattern: /super\s*indo/i, name: 'Superindo' },
  { pattern: /lawson/i, name: 'Lawson' },
  { pattern: /family\s*mart/i, name: 'FamilyMart' },
  { pattern: /circle\s*k/i, name: 'Circle K' },
  { pattern: /kopi\s*kenangan/i, name: 'Kopi Kenangan' },
  { pattern: /fore\s*coffee/i, name: 'Fore Coffee' },
  { pattern: /janji\s*jiwa/i, name: 'Janji Jiwa' },
  { pattern: /tomoro/i, name: 'Tomoro Coffee' },
  { pattern: /starbucks/i, name: 'Starbucks' },
  { pattern: /mixue/i, name: 'Mixue' },
  { pattern: /mie\s*gacoan/i, name: 'Mie Gacoan' },
  { pattern: /hokben|hoka\s*hoka\s*bento/i, name: 'HokBen' },
  { pattern: /mcdonald|mc\s*d/i, name: "McDonald's" },
  { pattern: /\bkfc\b/i, name: 'KFC' },
  { pattern: /burger\s*king/i, name: 'Burger King' },
  { pattern: /solaria/i, name: 'Solaria' },
  { pattern: /warteg/i, name: 'Warteg' },
  { pattern: /padang|sederhana/i, name: 'RM Padang' },
  { pattern: /gramedia/i, name: 'Gramedia' },
  { pattern: /pertamina|spbu/i, name: 'SPBU Pertamina' },
  { pattern: /\bshell\b/i, name: 'SPBU Shell' },
  { pattern: /kimia\s*farma/i, name: 'Kimia Farma' },
  { pattern: /apotek\s*k[\-\s]?24/i, name: 'Apotek K-24' },
  { pattern: /guardian/i, name: 'Guardian' },
  { pattern: /watsons/i, name: 'Watsons' },
  { pattern: /mr\.?\s*diy/i, name: 'MR.DIY' },
  { pattern: /uniqlo/i, name: 'Uniqlo' },
  { pattern: /shopee\s*food/i, name: 'ShopeeFood' },
  { pattern: /gofood|gojek/i, name: 'GoFood' },
  { pattern: /grabfood|grab/i, name: 'GrabFood' },
  { pattern: /tokopedia/i, name: 'Tokopedia' },
];

const MONTH_MAP = {
  jan: 1, januari: 1, january: 1,
  feb: 2, februari: 2, february: 2,
  mar: 3, maret: 3, march: 3,
  apr: 4, april: 4,
  mei: 5, may: 5,
  jun: 6, juni: 6, june: 6,
  jul: 7, juli: 7, july: 7,
  agu: 8, ags: 8, agustus: 8, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oktober: 10, oct: 10, october: 10,
  nov: 11, november: 11,
  des: 12, desember: 12, dec: 12, december: 12,
};

/**
 * Membersihkan typo OCR umum di sekitar angka (mis. 'O' -> '0', 'I'/'l' -> '1')
 * hanya ketika diapit angka atau pemisah ribuan.
 */
function fixOcrNumericTypos(str) {
  let out = str;
  for (let i = 0; i < 3; i += 1) {
    out = out
      .replace(/(\d[\.,\s]?)[OoQ](?=[\.,\s]?\d)/g, '$10')
      .replace(/([\.,])[OoQ]{2,3}\b/g, '$1000')
      .replace(/(\d[\.,])[Il|]/g, '$11')
      .replace(/[Il|]([\.,]\d{3})/g, '1$1');
  }
  return out;
}

/**
 * Mengurai token harga Rupiah menjadi angka bulat.
 */
function parseIndonesianAmountToken(token) {
  let clean = token.trim().replace(/^rp\.?\s*/i, '').replace(/^idr\s*/i, '');
  clean = clean.replace(/,-$/g, '').replace(/\s+/g, '');

  // Hapus desimal ",00" atau ".00" di akhir token
  clean = clean.replace(/([.,]\d{2})$/, (match, _g, offset, full) => {
    const before = full.slice(0, offset);
    // Hanya anggap desimal jika sebelum pemisah adalah format ribuan atau >= 3 digit
    if (/[.,]\d{3}$/.test(before) || /^\d{2,}$/.test(before)) {
      return '';
    }
    return match;
  });

  // Hapus semua pemisah ribuan (. atau ,)
  const digits = clean.replace(/[.,]/g, '');
  if (!/^\d+$/.test(digits)) return null;

  const val = parseInt(digits, 10);
  if (!Number.isFinite(val) || val < 100 || val > 500000000) return null;
  return val;
}

/**
 * Mengekstrak seluruh kandidat nominal uang (Rupiah) pada 1 baris teks struk.
 */
function extractPricesFromLine(rawLine) {
  if (!rawLine) return [];

  // Buang pola tanggal, jam, nomor HP, dan barcode agar tidak salah terbaca sebagai harga
  let line = rawLine
    .replace(/\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b/g, ' ')
    .replace(/\b\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}\b/g, ' ')
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ')
    .replace(/\b08\d{7,12}\b/g, ' ')
    .replace(/\b\d{9,}\b/g, ' ');

  line = fixOcrNumericTypos(line);

  const matches = [];
  const priceRegex = /(?:rp\.?\s*|idr\s*)?(?:\d{1,3}(?:[.,]\d{3})+|\d{3,7})(?:[.,]\d{2})?(?:,-)?/gi;
  let m;

  while ((m = priceRegex.exec(line)) !== null) {
    const token = m[0];
    const hasCurrencyPrefix = /^(?:rp|idr)/i.test(token);
    const val = parseIndonesianAmountToken(token);
    if (val === null) continue;

    // Hindari angka tahun (2020-2035) kecuali ada prefix Rp/IDR
    if (!hasCurrencyPrefix && val >= 1990 && val <= 2039 && !/[.,]/.test(token)) {
      continue;
    }

    // Hindari angka kuantitas kecil tanpa separator dan tanpa prefix Rp
    if (!hasCurrencyPrefix && !/[.,]/.test(token) && val < 500) {
      continue;
    }

    matches.push(val);
  }

  return matches;
}

function normalizeOcrKeywordLine(line) {
  return line
    .toLowerCase()
    .replace(/t0tal/g, 'total')
    .replace(/tqtal/g, 'total')
    .replace(/t0ta1/g, 'total')
    .replace(/subt0tal/g, 'subtotal')
    .replace(/\s+/g, ' ')
    .trim();
}

function findPriceNearLine(lines, index, maxLookahead = 2) {
  const sameLinePrices = extractPricesFromLine(lines[index]);
  if (sameLinePrices.length > 0) {
    return sameLinePrices[sameLinePrices.length - 1];
  }

  for (let offset = 1; offset <= maxLookahead; offset += 1) {
    const nextIdx = index + offset;
    if (nextIdx >= lines.length) break;
    const nextNorm = normalizeOcrKeywordLine(lines[nextIdx]);
    if (/^(tunai|cash|kembali|kembalian|change|bayar|diskon|ppn|tax)\b/.test(nextNorm)) {
      break;
    }
    const nextPrices = extractPricesFromLine(lines[nextIdx]);
    if (nextPrices.length > 0) {
      return nextPrices[nextPrices.length - 1];
    }
  }
  return 0;
}

function detectMerchantName(lines, fullText) {
  for (const store of KNOWN_MERCHANTS) {
    if (store.pattern.test(fullText)) {
      return store.name;
    }
  }

  const ignoreHeaderRegex = /^(pt\.?\s|cv\.?\s|jl\.?\s|jalan\s|telp|tlp|hp|wa|npwp|struk|nota|receipt|kasir|cashier|tgl|tanggal|date|no\.?\s|===|---|\*\*\*)/i;
  for (let i = 0; i < Math.min(lines.length, 7); i += 1) {
    const candidate = lines[i].trim();
    if (candidate.length < 3 || candidate.length > 42) continue;
    if (!/[a-zA-Z]{3,}/.test(candidate)) continue;
    if (ignoreHeaderRegex.test(candidate)) continue;
    if (/^[\d\W]+$/.test(candidate)) continue;
    if (extractPricesFromLine(candidate).length > 0 && candidate.length < 15) continue;
    return candidate.replace(/[=*_\-]{2,}/g, '').trim();
  }

  return 'Struk Belanja';
}

function extractReceiptDate(rawText) {
  // 1. DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmy4 = rawText.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](20\d{2})\b/);
  if (dmy4) {
    const iso = normalizeDateToIso(`${dmy4[1]}/${dmy4[2]}/${dmy4[3]}`);
    if (iso) return iso;
  }

  // 2. YYYY-MM-DD
  const ymd = rawText.match(/\b(20\d{2})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/);
  if (ymd) {
    const iso = normalizeDateToIso(`${ymd[1]}-${ymd[2]}-${ymd[3]}`);
    if (iso) return iso;
  }

  // 3. DD/MM/YY or DD-MM-YY or DD.MM.YY
  const dmy2 = rawText.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})\b/);
  if (dmy2) {
    const day = parseInt(dmy2[1], 10);
    const month = parseInt(dmy2[2], 10);
    const year = 2000 + parseInt(dmy2[3], 10);
    const iso = normalizeDateToIso(`${day}/${month}/${year}`);
    if (iso) return iso;
  }

  // 4. DD Mon YYYY (misal: 15 Nov 2026)
  const monRegex = new RegExp(`\\b(\\d{1,2})\\s+(${Object.keys(MONTH_MAP).join('|')})\\s+(20\\d{2})\\b`, 'i');
  const monMatch = rawText.match(monRegex);
  if (monMatch) {
    const day = parseInt(monMatch[1], 10);
    const month = MONTH_MAP[monMatch[2].toLowerCase()];
    const year = parseInt(monMatch[3], 10);
    if (month) {
      const iso = normalizeDateToIso(`${day}/${month}/${year}`);
      if (iso) return iso;
    }
  }

  return null;
}

function detectReceiptCategory(combinedText) {
  const txt = combinedText.toLowerCase();
  if (/(pertamina|spbu|shell|bensin|pertalite|pertamax|solar|parkir|tol|gojek|grab|maxim|transjakarta|kai|kereta)/.test(txt)) {
    return 'Transport';
  }
  if (/(listrik|pln|pdam|wifi|indihome|biznet|pulsa|paket data|telkomsel|indosat|xl|kos|sewa)/.test(txt)) {
    return 'Tagihan';
  }
  if (/(bioskop|cinema|xxi|cgv|karaoke|game|steam|netflix|spotify|nonton|tiket)/.test(txt)) {
    return 'Hiburan';
  }
  if (/(kopi|coffee|teh|makan|nasi|ayam|mie|bakso|roti|bakery|snack|minuman|resto|warung|warteg|cafe|kfc|mcd|hokben|mixue|gacoan|aqua|indomie|susu)/.test(txt)) {
    return 'Makanan';
  }
  if (/(alfamart|indomaret|alfamidi|superindo|sabun|shampoo|deterjen|pasta gigi|tisu|apotek|obat|kimia farma|guardian|watsons|mr\.?diy|uniqlo)/.test(txt)) {
    return 'Kebutuhan';
  }
  return 'Lainnya';
}

function extractLineItems(lines) {
  const skipLineRegex = /\b(grand\s*total|total|subtotal|sub\s*total|tunai|cash|kembali|kembalian|change|bayar|debit|kredit|qris|gopay|ovo|dana|shopeepay|ppn|tax|pajak|pb1|diskon|discount|hemat|potongan|voucher|poin|point|kasir|cashier|npwp|telp|tlp|jl\.?|jalan|terima\s*kasih|thank\s*you|harga\s*jual|dpp|non\s*tunai|layanan|service)\b/i;
  const items = [];
  let itemsSum = 0;

  for (const rawLine of lines) {
    const cleanLine = rawLine.trim();
    if (!cleanLine || skipLineRegex.test(cleanLine)) continue;

    const prices = extractPricesFromLine(cleanLine);
    if (prices.length === 0) continue;

    // Bersihkan nama item dari angka harga, kode SKU awal, dan qty trailing
    let itemName = cleanLine
      .replace(/^\d{4,}\s+/, '')
      .replace(/(?:rp\.?\s*|idr\s*)?(?:\d{1,3}(?:[.,]\d{3})+|\d{3,7})(?:[.,]\d{2})?(?:,-)?/gi, ' ')
      .replace(/\b\d+\s*[xX*]\s*$/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (itemName.length >= 2 && /[a-zA-Z]{2,}/.test(itemName)) {
      items.push(itemName);
      itemsSum += prices[prices.length - 1];
    }
  }

  return {
    itemsList: items.slice(0, 8),
    itemsSum,
  };
}

/**
 * Mengurai teks mentah hasil OCR struk belanja Indonesia secara deterministik.
 * Dirancang agar tetap bekerja handal tanpa bergantung pada AI eksternal.
 */
function parseReceiptText(rawText) {
  const text = String(rawText || '').replace(/\r\n/g, '\n');
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const toko = detectMerchantName(lines, text);
  const date = extractReceiptDate(text);
  const { itemsList, itemsSum } = extractLineItems(lines);

  let total = 0;
  let totalMethod = 'none';

  // Tier 1: Grand Total / Total Bayar / Total Belanja (scan dari bawah ke atas)
  const tier1Regex = /\b(grand\s*total|total\s*bayar|total\s*belanja|total\s*harga|total\s*tagihan|total\s*pembayaran|net\s*total|total\s*net|amount\s*due|jumlah\s*bayar|harga\s*jual|total\s*akhir)\b/i;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const norm = normalizeOcrKeywordLine(lines[i]);
    if (tier1Regex.test(norm)) {
      const found = findPriceNearLine(lines, i, 2);
      if (found > 0) {
        total = found;
        totalMethod = 'tier1-grand-total';
        break;
      }
    }
  }

  // Tier 2: Kata "TOTAL" atau "JUMLAH" murni (mengabaikan subtotal/qty/diskon/kembali)
  if (total === 0) {
    const tier2Exclude = /\b(sub\s*total|subtotal|item|qty|pcs|diskon|discount|hemat|potongan|ppn|tax|pajak|pb1|poin|point|kembali|kembalian|change|tunai|cash|voucher|saving)\b/i;
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const norm = normalizeOcrKeywordLine(lines[i]);
      if (/\b(total|jumlah)\b/i.test(norm) && !tier2Exclude.test(norm)) {
        const found = findPriceNearLine(lines, i, 2);
        if (found > 0) {
          total = found;
          totalMethod = 'tier2-total';
          break;
        }
      }
    }
  }

  // Tier 3: Kalkulasi Pembayaran (TUNAI/BAYAR - KEMBALI)
  let tunai = 0;
  let kembali = 0;
  let hasKembali = false;
  let subtotal = 0;
  let tax = 0;
  let discount = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const norm = normalizeOcrKeywordLine(lines[i]);
    const val = findPriceNearLine(lines, i, 1);
    if (val <= 0) continue;

    if (/\b(tunai|cash|dibayar|bayar)\b/i.test(norm) && !/\btotal\b/i.test(norm) && !/\bnon\s*tunai\b/i.test(norm)) {
      tunai = Math.max(tunai, val);
    }
    if (/\b(kembali|kembalian|change)\b/i.test(norm)) {
      kembali = val;
      hasKembali = true;
    }
    if (/\b(sub\s*total|subtotal)\b/i.test(norm)) {
      subtotal = val;
    }
    if (/\b(ppn|tax|pajak|pb1)\b/i.test(norm) && !/\b(total|npwp)\b/i.test(norm)) {
      tax = val;
    }
    if (/\b(diskon|discount|potongan|hemat)\b/i.test(norm)) {
      discount = val;
    }
  }

  if (total === 0 && tunai > 0 && hasKembali && tunai > kembali) {
    total = tunai - kembali;
    totalMethod = 'tier3-tunai-minus-kembali';
  }

  // Tier 4: Subtotal (+ pajak - diskon) atau penjumlahan item
  if (total === 0 && subtotal > 0) {
    total = Math.max(0, subtotal + tax - discount);
    totalMethod = 'tier4-subtotal';
  }

  if (total === 0 && itemsSum > 0) {
    total = itemsSum;
    totalMethod = 'tier5-items-sum';
  }

  // Tier 6: Nominal Rupiah terbesar yang masuk akal (mengecualikan baris Tunai/Kembali)
  if (total === 0) {
    const candidatePrices = [];
    for (const line of lines) {
      const norm = normalizeOcrKeywordLine(line);
      if (/\b(tunai|cash|kembali|kembalian|change|poin|point|npwp)\b/i.test(norm)) continue;
      candidatePrices.push(...extractPricesFromLine(line));
    }
    if (candidatePrices.length > 0) {
      total = Math.max(...candidatePrices);
      totalMethod = 'tier6-max-price';
    }
  }

  const itemsText = itemsList.length > 0 ? itemsList.slice(0, 5).join(', ') : 'Belanjaan';
  const category = detectReceiptCategory(`${toko} ${itemsText} ${text}`);

  return {
    toko,
    total,
    items: itemsText,
    itemsList,
    date,
    category,
    totalMethod,
    parserSource: 'local-deterministic',
  };
}

module.exports = {
  parseReceiptText,
  extractPricesFromLine,
};

