// Ora locală a României (Europe/Bucharest), cu schimbarea orei de vară/iarnă tratată corect.
// Modelul scrie date locale ("2026-10-16T10:00"), iar aici le transformăm în momentul real (UTC).

const TZ = "Europe/Bucharest";

function decalajMinute(utcMs: number): number {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = Object.fromEntries(f.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  const caUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((caUtc - utcMs) / 60000);
}

/** "2026-10-16T10:00" (ora României) -> momentul real. null dacă formatul nu e valid. */
export function localLaUtc(local: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return null;
  const ghicit = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  // Două treceri: a doua corectează cazul în care decalajul diferă la momentul real.
  let utc = ghicit - decalajMinute(ghicit) * 60000;
  utc = ghicit - decalajMinute(utc) * 60000;
  const data = new Date(utc);
  return Number.isNaN(data.getTime()) ? null : data;
}

/** Momentul real -> text citibil, ora României, ex. "joi, 16 oct., 10:00". */
export function formateazaLocal(data: Date | string): string {
  return new Date(data).toLocaleString("ro-RO", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Acum, pentru promptul modelului: "joi, 15 octombrie 2026, 19:32 (ora României)". */
export function acumLocal(): string {
  return (
    new Date().toLocaleString("ro-RO", {
      timeZone: TZ,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }) + " (ora României)"
  );
}
