// ─────────────────────────────────────────────────────────────────────────────
// Επίσημες αργίες Ελλάδας — καθαρός υπολογισμός, χωρίς εξωτερικά δεδομένα.
// Οι κινητές εορτές υπολογίζονται από το Ορθόδοξο Πάσχα (αλγόριθμος Computus,
// ιουλιανό → γρηγοριανό με +13 ημέρες, ισχύει 1900–2099).
// ─────────────────────────────────────────────────────────────────────────────

import { orthodoxEaster as coreOrthodoxEaster } from '../core/greek'

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

/**
 * Ορθόδοξο Πάσχα (γρηγοριανή ημερομηνία) για το έτος, ως Date.
 *
 * Ο ΥΠΟΛΟΓΙΣΜΟΣ δεν γίνεται εδώ: γίνεται ΜΙΑ φορά, στο lib/core/greek.ts. Εδώ
 * μένει μόνο η μετατροπή σε Date, γιατί οι κινητές εορτές μετριούνται με
 * `addDays` πάνω σε Date.
 */
export function orthodoxEaster(year: number): Date {
  return new Date(`${coreOrthodoxEaster(year)}T00:00:00Z`)
}

function addDays(base: Date, days: number): string {
  const dt = new Date(base.getTime()); dt.setUTCDate(dt.getUTCDate() + days)
  return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
}

// Χάρτης «YYYY-MM-DD» → όνομα αργίας για ένα έτος.
export function greekHolidays(year: number): Record<string, string> {
  const easter = orthodoxEaster(year)
  const map: Record<string, string> = {
    [iso(year, 1, 1)]:  'Πρωτοχρονιά',
    [iso(year, 1, 6)]:  'Θεοφάνεια',
    [iso(year, 3, 25)]: 'Εθνική εορτή 25ης Μαρτίου',
    [iso(year, 5, 1)]:  'Εργατική Πρωτομαγιά',
    [iso(year, 8, 15)]: 'Κοίμηση της Θεοτόκου',
    [iso(year, 10, 28)]:'Επέτειος του «Όχι»',
    [iso(year, 12, 25)]:'Χριστούγεννα',
    [iso(year, 12, 26)]:'Σύναξη της Θεοτόκου',
    // Κινητές εορτές
    [addDays(easter, -48)]: 'Καθαρά Δευτέρα',
    [addDays(easter, -2)]:  'Μεγάλη Παρασκευή',
    [addDays(easter, 0)]:   'Κυριακή του Πάσχα',
    [addDays(easter, 1)]:   'Δευτέρα του Πάσχα',
    [addDays(easter, 50)]:  'Αγίου Πνεύματος',
  }
  return map
}

// Cache ανά έτος (καθαρός υπολογισμός, ασφαλές να απομνημονευθεί).
const _cache: Record<number, Record<string, string>> = {}
function forYear(year: number) { return _cache[year] || (_cache[year] = greekHolidays(year)) }

// Όνομα αργίας για «YYYY-MM-DD», ή null.
export function holidayName(dateStr: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null
  const y = Number(dateStr.slice(0, 4))
  return forYear(y)[dateStr] || null
}
export function isHoliday(dateStr: string): boolean { return holidayName(dateStr) !== null }

// Σαββατοκύριακο για «YYYY-MM-DD» (τοπική ημέρα, χωρίς ζώνη ώρας).
export function isWeekend(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number)
  const wd = new Date(y, m - 1, d).getDay()
  return wd === 0 || wd === 6
}

// Μη εργάσιμη = αργία ή Σαββατοκύριακο.
export function isNonWorkingDay(dateStr: string): boolean { return isWeekend(dateStr) || isHoliday(dateStr) }

// Οι επόμενες αργίες από μια ημερομηνία (για ενημέρωση/συμφραζόμενα).
export function upcomingHolidays(fromDateStr: string, count = 5): { date: string; name: string }[] {
  const y0 = Number(fromDateStr.slice(0, 4))
  const out: { date: string; name: string }[] = []
  for (let y = y0; y <= y0 + 1 && out.length < count + 12; y++) {
    for (const [date, name] of Object.entries(forYear(y))) {
      if (date >= fromDateStr) out.push({ date, name })
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, count)
}
