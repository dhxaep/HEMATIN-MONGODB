function pad2(num) {
  return String(num).padStart(2, '0');
}

function isValidCalendarDate(year, month1Based, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month1Based) || !Number.isInteger(day)) {
    return false;
  }
  if (year < 1970 || year > 2100 || month1Based < 1 || month1Based > 12 || day < 1 || day > 31) {
    return false;
  }
  const dt = new Date(year, month1Based - 1, day);
  return (
    dt.getFullYear() === year &&
    dt.getMonth() === month1Based - 1 &&
    dt.getDate() === day
  );
}

/**
 * Mengubah objek Date menjadi string YYYY-MM-DD sesuai zona waktu lokal.
 */
function formatLocalIso(dateObj) {
  return `${dateObj.getFullYear()}-${pad2(dateObj.getMonth() + 1)}-${pad2(dateObj.getDate())}`;
}

/**
 * Mengembalikan tanggal hari ini dalam format YYYY-MM-DD (zona waktu lokal).
 */
function getTodayIso() {
  return formatLocalIso(new Date());
}

/**
 * Mengembalikan tanggal kemarin dalam format YYYY-MM-DD (zona waktu lokal).
 */
function getYesterdayIso() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return formatLocalIso(d);
}

/**
 * Menormalisasi berbagai format tanggal (YYYY-MM-DD, DD/MM/YYYY, D/M/YYYY, DD-MM-YYYY, ISO string)
 * menjadi YYYY-MM-DD. Mengembalikan null jika tidak valid.
 */
function normalizeDateToIso(input) {
  if (input === undefined || input === null || input === '') return null;

  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return null;
    return formatLocalIso(input);
  }

  const raw = String(input).trim();
  if (!raw) return null;

  // Format YYYY-MM-DD atau ISO datetime YYYY-MM-DDTHH:mm:ss
  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|T|\s)/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    const d = parseInt(isoMatch[3], 10);
    return isValidCalendarDate(y, m, d) ? `${y}-${pad2(m)}-${pad2(d)}` : null;
  }

  // Format YYYY/MM/DD
  const ymdSlash = raw.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (ymdSlash) {
    const y = parseInt(ymdSlash[1], 10);
    const m = parseInt(ymdSlash[2], 10);
    const d = parseInt(ymdSlash[3], 10);
    return isValidCalendarDate(y, m, d) ? `${y}-${pad2(m)}-${pad2(d)}` : null;
  }

  // Format DD/MM/YYYY atau D/M/YYYY (format lama Hematin)
  const dmySlash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmySlash) {
    const d = parseInt(dmySlash[1], 10);
    const m = parseInt(dmySlash[2], 10);
    const y = parseInt(dmySlash[3], 10);
    return isValidCalendarDate(y, m, d) ? `${y}-${pad2(m)}-${pad2(d)}` : null;
  }

  // Format DD-MM-YYYY atau D-M-YYYY
  const dmyDash = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmyDash) {
    const d = parseInt(dmyDash[1], 10);
    const m = parseInt(dmyDash[2], 10);
    const y = parseInt(dmyDash[3], 10);
    return isValidCalendarDate(y, m, d) ? `${y}-${pad2(m)}-${pad2(d)}` : null;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return formatLocalIso(parsed);
  }

  return null;
}

/**
 * Mengembalikan rentang Senin s.d. Minggu pada minggu berjalan (YYYY-MM-DD).
 */
function getCurrentWeekRangeIso() {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  return {
    startIso: formatLocalIso(monday),
    endIso: formatLocalIso(sunday),
  };
}

/**
 * Mengembalikan rentang tanggal 1 s.d. akhir bulan berjalan (YYYY-MM-DD).
 */
function getCurrentMonthRangeIso() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    startIso: formatLocalIso(start),
    endIso: formatLocalIso(end),
  };
}

module.exports = {
  formatLocalIso,
  getTodayIso,
  getYesterdayIso,
  normalizeDateToIso,
  getCurrentWeekRangeIso,
  getCurrentMonthRangeIso,
};

