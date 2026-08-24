// ═══════════════════════════════════════════════════════════════════════════
// Ο ΜΗΝΙΑΙΟΣ ΔΕΙΚΤΗΣ, ΧΩΡΙΣ ΝΑ ΤΟΝ ΨΑΞΕΙ ΚΑΝΕΙΣ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΛΥΝΕΙ. Η αναπροσαρμογή μισθώματος στηρίζεται στην απλή δωδεκάμηνη μεταβολή
// του ΔΤΚ, που η ΕΛΣΤΑΤ ανακοινώνει μία φορά τον μήνα σε ένα PDF μιας σελίδας.
// Ώσπου να μπει η νέα γραμμή στον πίνακα, η εφαρμογή εφαρμόζει τον περασμένο
// μήνα — σωστά, αλλά όχι φρέσκα. Ο έλεγχος τρέχει μόνος του και τη φέρνει.
//
// Η ΑΛΥΣΙΔΑ, ΤΕΣΣΕΡΑ ΒΗΜΑΤΑ:
//   1. Η σελίδα του μήνα φτιάχνεται από τον μήνα           (elstatCatalog)
//   2. Ο σύνδεσμος του δελτίου βρίσκεται από τον τίτλο του (elstatCatalog)
//   3. Το κείμενο βγαίνει από το PDF                       (pdfText)
//   4. Τα δύο ποσοστά διαβάζονται και επαληθεύονται        (elstatAnnouncement)
//
// ── ΓΙΑΤΙ ΔΕΝ ΓΡΑΦΕΙ ΜΟΝΟΣ ΤΟΥ ΣΤΗΝ ΠΑΡΑΓΩΓΗ ─────────────────────────────
// Με `--write` αλλάζει το αρχείο και σταματά εκεί. Τη μεταβολή τη δημοσιεύει
// pull request, δηλαδή ένα πάτημα από άνθρωπο. Το ποσοστό αυτό καταλήγει σε
// υπογεγραμμένη ειδοποίηση προς μισθωτή· η διαφορά ανάμεσα σε «το είδε κάποιος»
// και «το έγραψε ένα script τη νύχτα» είναι ολόκληρη.
//
// ── ΤΙ ΚΑΝΕΙ ΟΤΑΝ ΔΕΝ ΕΙΝΑΙ ΣΙΓΟΥΡΟ ───────────────────────────────────────
// Σταματά και το λέει. Κάθε βήμα μπορεί να αρνηθεί, και καμία άρνηση δεν
// συμπληρώνεται με εικασία: χωρίς τα δύο ποσοστά που δένονται με το 75%, δεν
// υπάρχει γραμμή να γραφτεί.
//
// ΧΡΗΣΗ:  npx tsx scripts/check-elstat-cpi.ts [--write]
// ΕΞΟΔΟΣ: 0 όταν δεν υπάρχει τίποτα νέο, 1 όταν υπάρχει ή όταν κάτι χάλασε.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from 'node:fs';
import { RENT_INDEX, RENT_INDEX_LATEST } from '../lib/market/cpi';
import { withIndexRow } from '../lib/market/cpiTable';
import { announcementLink, publicationUrl } from '../lib/market/elstatCatalog';
import { parseAnnouncement } from '../lib/market/elstatAnnouncement';
import { pdfText } from '../lib/market/pdfText';

const WRITE = process.argv.includes('--write');
const CPI_FILE = new URL('../lib/market/cpi.ts', import.meta.url);

const pad = (n: number) => String(n).padStart(2, '0');
const nextMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
};

/** Ο τρέχων μήνας, σε ώρα Ελλάδας — εκεί δημοσιεύεται το δελτίο. */
function currentMonth(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit',
  }).format(new Date());
  return parts.slice(0, 7);
}

async function get(url: string): Promise<Response> {
  const res = await fetch(url, { headers: { 'user-agent': 'PROPERWISE/1.0 (+https://properwise.gr)' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} στο ${url}`);
  return res;
}

/** Η ανάγνωση ενός μήνα, από τη σελίδα ως τα δύο ποσοστά. */
async function readMonth(ym: string) {
  const page = publicationUrl(ym);
  if (!page) throw new Error(`άκυρος μήνας: ${ym}`);

  const html = await (await get(page)).text();
  const link = announcementLink(html);
  if (!link.ok) throw new Error(`${page}: ${link.reason}`);

  const pdf = new Uint8Array(await (await get(link.href)).arrayBuffer());
  const reading = parseAnnouncement(pdfText(pdf), ym);
  if (!reading.ok) throw new Error(`${link.href}: ${reading.reason}`);
  return reading.reading;
}

/** Η νέα γραμμή στο αρχείο. Η ίδια η επεξεργασία ζει στο `cpiTable`, με τεστ. */
function patchCpiFile(ym: string, pct: number, today: string): void {
  const r = withIndexRow(readFileSync(CPI_FILE, 'utf8'), ym, pct, today);
  if (!r.ok) throw new Error(r.reason);
  writeFileSync(CPI_FILE, r.source);
}

// ── Η ΕΚΤΕΛΕΣΗ ────────────────────────────────────────────────────────────
// Ελέγχονται όλοι οι μήνες από τον επόμενο του τελευταίου γνωστού ως τον
// τρέχοντα: αν ο έλεγχος έμεινε πίσω δύο μήνες, τους φέρνει και τους δύο.
async function main(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const wanted: string[] = [];
  for (let ym = nextMonth(RENT_INDEX_LATEST); ym <= currentMonth(); ym = nextMonth(ym)) wanted.push(ym);

  if (wanted.length === 0) {
    console.log(`Ο πίνακας φτάνει ως τον ${RENT_INDEX_LATEST}. Δεν υπάρχει νεότερος μήνας να ζητηθεί.`);
    return 0;
  }

  let added = 0;
  let broke = false;
  for (const ym of wanted) {
    try {
      const r = await readMonth(ym);
      console.log(`${ym}: απλή δωδεκάμηνη μεταβολή ${r.indexPct}%, αναπροσαρμογή ${r.adjustmentPct}% (το δελτίο τα επιβεβαιώνει μεταξύ τους)`);
      if (RENT_INDEX[ym] === r.indexPct) continue;
      if (WRITE) { patchCpiFile(ym, r.indexPct, today); added++; }
      else console.log('  → λείπει από τον πίνακα. Με --write θα γραφόταν.');
    } catch (e) {
      // Ο μήνας μπορεί απλώς να μην έχει δημοσιευτεί ακόμη. Δεν είναι βλάβη,
      // είναι το φυσιολογικό για τις πρώτες μέρες του μήνα.
      console.log(`${ym}: δεν διαβάστηκε — ${e instanceof Error ? e.message : String(e)}`);
      broke = true;
    }
  }

  if (added) console.log(`\nΓράφτηκαν ${added} νέες γραμμές στο lib/market/cpi.ts.`);
  // Η ΕΞΟΔΟΣ ΣΗΜΑΙΝΕΙ «ΚΑΤΙ ΧΑΛΑΣΕ», ΟΧΙ «ΚΑΤΙ ΒΡΕΘΗΚΕ». Ό,τι βρέθηκε φαίνεται
  // στη διαφορά του αρχείου. Ένας μήνας που δεν διαβάστηκε είναι αναμενόμενος
  // πριν τη δημοσίευση· δύο σημαίνει ότι κάτι έσπασε, και τότε αξίζει ειδοποίηση.
  return broke && wanted.length > 1 ? 1 : 0;
}

main().then(code => process.exit(code), e => { console.error(e); process.exit(1); });
