const IST = "Asia/Kolkata";

/** Calendar date `yyyy-MM-dd` in a time zone (default India). */
export function ymdInTimeZone(date: Date, timeZone = IST): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function todayYmdIst(): string {
  return ymdInTimeZone(new Date());
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function parseDueYmd(dueDate?: string): string | null {
  if (!dueDate) return null;
  const iso = dueDate.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return null;
  return ymdInTimeZone(d);
}

export function daysBetweenYmd(fromYmd: string, toYmd: string): number {
  const a = Date.parse(`${fromYmd}T00:00:00Z`);
  const b = Date.parse(`${toYmd}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function isQuietActionStatus(status?: string): boolean {
  const s = (status || "").trim().toLowerCase();
  return s === "completed" || s === "on-hold" || s === "observation";
}
