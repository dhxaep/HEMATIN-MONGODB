function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function getIsoDate(year: number, month1Based: number, day: number): string {
  return `${year}-${pad2(month1Based)}-${pad2(day)}`;
}

export function formatLocalIso(d: Date): string {
  return getIsoDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export function getTodayIso(): string {
  return formatLocalIso(new Date());
}

export function getYesterdayIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return formatLocalIso(d);
}

/**
 * Mengurai string tanggal (YYYY-MM-DD, DD/MM/YYYY, D/M/YYYY, ISO datetime) menjadi YYYY-MM-DD lokal.
 */
export function parseAnyDateToIso(dateStr?: string | null): string | null {
  if (!dateStr) return null;
  const raw = String(dateStr).trim();
  if (!raw) return null;

  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|T|\s)/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    const d = parseInt(isoMatch[3], 10);
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) {
      return getIsoDate(y, m, d);
    }
    return null;
  }

  const dmySlash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmySlash) {
    const d = parseInt(dmySlash[1], 10);
    const m = parseInt(dmySlash[2], 10);
    const y = parseInt(dmySlash[3], 10);
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) {
      return getIsoDate(y, m, d);
    }
    return null;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return formatLocalIso(parsed);
  }
  return null;
}

/**
 * Menampilkan YYYY-MM-DD ke format Indonesia DD/MM/YYYY yang ramah dibaca user.
 */
export function formatDisplayDate(isoDate?: string | null): string {
  if (!isoDate) return '-';
  const normalized = parseAnyDateToIso(isoDate);
  if (!normalized) return isoDate;
  const [y, m, d] = normalized.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Menghasilkan label pembatas hari untuk riwayat transaksi (mis. "Hari Ini — Jumat, 20 Nov 2026").
 */
export function formatDayDividerLabel(isoDate: string): string {
  const normalized = parseAnyDateToIso(isoDate);
  if (!normalized) return isoDate;

  const [y, m, d] = normalized.split('-').map((n) => parseInt(n, 10));
  const dt = new Date(y, m - 1, d);
  const fullLabel = dt.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  if (normalized === getTodayIso()) return `Hari Ini — ${fullLabel}`;
  if (normalized === getYesterdayIso()) return `Kemarin — ${fullLabel}`;
  return fullLabel;
}

export function shiftIsoDate(isoDate: string, deltaDays: number): string {
  const parts = isoDate.split('-').map((p) => parseInt(p, 10));
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    return getTodayIso();
  }
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  d.setDate(d.getDate() + deltaDays);
  return formatLocalIso(d);
}

export function getCurrentWeekRangeIso(): { startIso: string; endIso: string } {
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

export function getCurrentMonthRangeIso(): { startIso: string; endIso: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    startIso: formatLocalIso(start),
    endIso: formatLocalIso(end),
  };
}

