// ═══════════════════════════════════════════════════════════════════════════
// Εισαγωγή κίνησης τραπεζικού λογαριασμού (CSV) + αυτόματη αντιστοίχιση σε
// αναμενόμενα ενοίκια και έξοδα. ΚΑΘΑΡΗ λογική (χωρίς I/O/DOM): παίρνει κείμενο
// CSV, βγάζει κινήσεις, και προτείνει αντιστοιχίσεις — ο χρήστης επιβεβαιώνει.
// Υποστηρίζει ελληνικές μορφές (διαχωριστικό , ; ή tab· ποσά 1.234,56).
// ═══════════════════════════════════════════════════════════════════════════

import { parseAmount, parseDate as coreParseDate } from '../core/greek'
import { csvDelimiter, csvSplitLine } from '../core/csv'

export interface BankTxn {
  date: string          // ISO YYYY-MM-DD (κενό αν δεν αναγνωρίστηκε)
  description: string
  amount: number        // θετικό = πίστωση (είσοδος), αρνητικό = χρέωση (έξοδος)
  raw: string
  /** Αποτύπωμα της κίνησης για τη διπλοεγγραφή. Δες `keyOfLine` πιο κάτω. */
  key: string
}

const DATE_KEYS = ['ημερομηνία', 'ημ/νία', 'date', 'ημερ']
const DESC_KEYS = ['περιγραφή', 'αιτιολογία', 'description', 'λεπτομέρειες', 'κίνηση', 'συναλλαγή']
const AMOUNT_KEYS = ['ποσό', 'amount', 'αξία']
const DEBIT_KEYS = ['χρέωση', 'debit', 'χρεωσεις']
const CREDIT_KEYS = ['πίστωση', 'credit', 'πιστωσεις']

// Ο ΑΝΑΛΥΤΗΣ ΕΦΥΓΕ ΣΤΟ lib/core/csv.ts. Ήταν σωστός και ιδιωτικός εδώ, ενώ δύο
// ακόμη οθόνες διάβαζαν CSV με δικό τους, λανθασμένο. Τώρα ένας.
const detectDelimiter = csvDelimiter
const splitCsvLine = csvSplitLine

/**
 * Ποσό κίνησης. Η ανάγνωση γίνεται ΜΙΑ φορά, στο lib/core/greek.ts — εδώ απλώς
 * επανεξάγεται, ώστε το ίδιο αντίγραφο κίνησης να διαβάζεται ίδια από την
 * Τραπεζική Εισαγωγή και από τη Μαζική Καταχώρηση.
 *
 * ΠΡΟΣΟΧΗ: εδώ ΔΕΝ μπαίνει το φίλτρο «κάτω από 0,01 / πάνω από 1.000.000» του
 * lib/billing/parse.ts. Αυτό αφορά το ταίριασμα λογαριασμών· σε τραπεζικό
 * αντίγραφο θα έκοβε σιωπηλά κάθε μεγάλη μεταφορά.
 */
export { parseAmount }

/**
 * Ημερομηνία κίνησης σε ISO, ή '' αν δεν είναι ημερομηνία (οι καλούντες εδώ
 * συγκρίνουν με κενό κείμενο).
 *
 * Κόβει τυχόν ώρα: πολλές τράπεζες δίνουν «2026-03-15 10:42» ή «2026-03-15T10:42»
 * στη στήλη ημερομηνίας.
 */
export function parseDate(s: string): string {
  return coreParseDate(String(s ?? '').trim().split(/[T ]/)[0]) ?? ''
}

function findCol(headers: string[], keys: string[]): number {
  const low = headers.map(h => h.toLowerCase())
  for (let i = 0; i < low.length; i++) if (keys.some(k => low[i].includes(k))) return i
  return -1
}

// ── ΤΟ ΑΠΟΤΥΠΩΜΑ ΤΗΣ ΤΡΑΠΕΖΑΣ ΕΣΒΗΝΕ ΑΛΗΘΙΝΕΣ ΚΙΝΗΣΕΙΣ ─────────────────────
// Το κλειδί ήταν `ημερομηνία|ποσό|περιγραφή`, κομμένο στους 200 χαρακτήρες.
// Δύο αναλήψεις 50,00 από το ίδιο ΑΤΜ την ίδια ημέρα έδιναν ΤΟ ΙΔΙΟ κλειδί,
// και το upsert με ignoreDuplicates κρατούσε μία: η δεύτερη χανόταν σιωπηλά
// και στους δύο πίνακες (expenses, bank_transactions). Στο Ε2 έμπαιναν 50,00
// αντί για 100,00, ενώ το αντίγραφο της τράπεζας δίπλα έδειχνε δύο γραμμές.
//
// Το αρχείο δίνει περισσότερες από τρεις στήλες: υπόλοιπο μετά την κίνηση,
// κωδικό συναλλαγής, αύξοντα αριθμό. Δεν τα διαβάζουμε ονομαστικά, γιατί
// κάθε τράπεζα τα ονομάζει αλλιώς, αλλά είναι ΟΛΑ μέσα στη γραμμή: το κλειδί
// δένεται σε ολόκληρη τη γραμμή. Οταν ακόμη και η γραμμή είναι κατά λέξη
// ίδια, ξεχωρίζει η σειρά εμφάνισης μέσα στο ίδιο αρχείο.
// Κόστος: ένα hash 32 bit ανά γραμμή. Η σειρά μένει σταθερή ανάμεσα σε δύο
// εξαγωγές, γιατί μετριέται μόνο μέσα σε ομάδα πανομοιότυπων γραμμών, που
// έχουν εξ ορισμού την ίδια ημερομηνία και δεν χωρίζονται από ένα διάστημα.

/** Πρόθεμα μορφής: ξεχωρίζει τα νέα αποτυπώματα από τα παλιά της βάσης. */
const KEY_VERSION = 'v2'

/** FNV-1a 32 bit. Σταθερό και μικρό, όχι κρυπτογραφικό: δεν χρειάζεται. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return (h >>> 0).toString(36)
}

/** Το αποτύπωμα μιας γραμμής: ημερομηνία, ποσό, όλη η γραμμή, σειρά. */
function keyOfLine(date: string, amount: number, line: string, nth: number): string {
  return `${KEY_VERSION}|${date}|${amount.toFixed(2)}|${fnv1a(line)}|${nth}`
}

/**
 * ΤΟ ΠΑΛΙΟ ΑΠΟΤΥΠΩΜΑ, ΜΟΝΟ ΓΙΑ ΑΝΑΓΝΩΡΙΣΗ.
 *
 * Ο,τι εισήχθη πριν από αυτή την αλλαγή είναι γραμμένο έτσι στη βάση. Χωρίς
 * τον έλεγχο και με το παλιό κλειδί, η πρώτη εισαγωγή μετά την αναβάθμιση θα
 * ξανάγραφε ΚΑΘΕ παλιά κίνηση ως καινούργια: διπλά έξοδα σε όλο το έτος.
 */
export function legacyKeyOf(t: { date: string; description: string; amount: number }): string {
  return `${t.date}|${t.amount}|${t.description}`.slice(0, 200)
}

// ── ΤΟ ΠΟΣΟ ΠΟΥ ΔΕΝ ΔΙΑΒΑΣΤΗΚΕ ΕΡΙΧΝΕ ΤΗ ΓΡΑΜΜΗ ΣΙΩΠΗΛΑ ────────────────────
// Το `continue` της γραμμής 82 πετούσε κάθε γραμμή χωρίς αναγνωρίσιμο ποσό
// (κενό κελί, «ΥΠΟΛΟΙΠΟ», μορφή που δεν αναγνωρίζεται) χωρίς κανέναν μετρητή,
// και η μόνη ανατροφοδότηση της οθόνης ήταν το μήνυμα που βγαίνει όταν δεν
// διαβάζεται ΚΑΜΙΑ κίνηση. Σε αντίγραφο όπου διαβάστηκαν οι μισές γραμμές, ο
// χρήστης δεν μάθαινε τίποτα για τις άλλες μισές: η εισαγωγή έμοιαζε πλήρης.
// Ο μετρητής επιστρέφεται τώρα μαζί με τις κινήσεις, ώστε η οθόνη να μπορεί
// να πει πόσες γραμμές έμειναν εκτός.
export interface BankCsvRead {
  txns: BankTxn[]
  unreadable: number   // γραμμές δεδομένων που πετάχτηκαν, χωρίς ποσό
}

/** Διαβάζει CSV κειμένου: τις κινήσεις ΚΑΙ όσες γραμμές δεν διαβάστηκαν. */
export function readBankCsv(text: string): BankCsvRead {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length)
  if (lines.length < 2) return { txns: [], unreadable: 0 }
  const delim = detectDelimiter(lines[0])
  const headers = splitCsvLine(lines[0], delim)
  const di = findCol(headers, DATE_KEYS)
  const desc = findCol(headers, DESC_KEYS)
  const ai = findCol(headers, AMOUNT_KEYS)
  const debit = findCol(headers, DEBIT_KEYS)
  const credit = findCol(headers, CREDIT_KEYS)
  const out: BankTxn[] = []
  let unreadable = 0
  // Πόσες φορές έχει ξαναφανεί η ίδια ακριβώς γραμμή μέσα στο ίδιο αρχείο.
  const seenLine = new Map<string, number>()
  for (let r = 1; r < lines.length; r++) {
    const cells = splitCsvLine(lines[r], delim)
    if (!cells.length) { unreadable++; continue }
    const date = parseDate(di >= 0 ? cells[di] || '' : '')
    const description = desc >= 0 ? (cells[desc] || '') : cells.filter((_, i) => i !== di && i !== ai).join(' ').trim()
    let amount: number | null = null
    if (ai >= 0) amount = parseAmount(cells[ai] || '')
    else if (debit >= 0 || credit >= 0) {
      const d = debit >= 0 ? parseAmount(cells[debit] || '') : null
      const c = credit >= 0 ? parseAmount(cells[credit] || '') : null
      if (c != null && c !== 0) amount = Math.abs(c)
      else if (d != null && d !== 0) amount = -Math.abs(d)
    }
    if (amount == null) { unreadable++; continue }
    // Τα κενά κανονικοποιούνται: ένα κενό παραπάνω δεν κάνει νέα κίνηση.
    const line = lines[r].trim().replace(/\s+/g, ' ')
    const nth = (seenLine.get(line) || 0) + 1
    seenLine.set(line, nth)
    out.push({ date, description, amount, raw: lines[r], key: keyOfLine(date, amount, line, nth) })
  }
  return { txns: out, unreadable }
}

/** Μόνο οι κινήσεις, για όποιον δεν μετρά τις γραμμές που έμειναν εκτός. */
export function parseBankCsv(text: string): BankTxn[] {
  return readBankCsv(text).txns
}

// ── Αντιστοίχιση σε αναμενόμενα ενοίκια & έξοδα ──────────────────────────────
export interface ExpectedRent { id: string; label: string; amount: number; dueDate: string }
export interface RentMatch { rentId: string; txn: BankTxn; confidence: 'high' | 'medium' }
export interface ExpenseSuggestion { txn: BankTxn; description: string; amount: number }
export interface MatchResult {
  rentMatches: RentMatch[]           // πιστώσεις που ταιριάζουν σε αναμενόμενο ενοίκιο
  expenseSuggestions: ExpenseSuggestion[] // χρεώσεις → πιθανά έξοδα προς καταχώρηση
  unmatched: BankTxn[]
}

// ΔΕΝ ΕΙΝΑΙ «ημέρες μεταξύ»: είναι ΑΠΟΣΤΑΣΗ, χωρίς πρόσημο, και γυρίζει
// `Infinity` σε άκυρη ημερομηνία ώστε η αντιστοίχιση να την απορρίψει αντί να
// τη θεωρήσει τέλεια. Με το γενικό όνομα, ο επόμενος θα την καλούσε για
// προθεσμία και θα έπαιρνε θετικό αριθμό για κάτι που έχει ήδη περάσει.
const dayGap = (a: string, b: string) => {
  const t1 = Date.parse(a + 'T00:00:00Z'), t2 = Date.parse(b + 'T00:00:00Z')
  if (isNaN(t1) || isNaN(t2)) return Infinity
  return Math.abs(t1 - t2) / 86400000
}
const money = (a: number, b: number) => Math.abs(a - b) <= 0.5

/**
 * Αντιστοιχίζει κινήσεις: πιστώσεις που ισούνται με αναμενόμενο ενοίκιο (και είναι
 * κοντά χρονικά) → RentMatch· λοιπές χρεώσεις → προτάσεις εξόδων. Κάθε αναμενόμενο
 * και κάθε κίνηση χρησιμοποιούνται το πολύ μία φορά.
 */
export function matchTransactions(txns: BankTxn[], expectedRents: ExpectedRent[], windowDays = 20): MatchResult {
  const usedTxn = new Set<number>()
  const usedRent = new Set<string>()
  const rentMatches: RentMatch[] = []
  // Πρώτα τα ενοίκια (πιστώσεις).
  for (const rent of expectedRents) {
    let best = -1; let bestDays = Infinity
    for (let i = 0; i < txns.length; i++) {
      if (usedTxn.has(i)) continue
      const t = txns[i]
      if (t.amount <= 0 || !money(t.amount, rent.amount)) continue
      const d = t.date ? dayGap(t.date, rent.dueDate) : windowDays
      if (d <= windowDays && d < bestDays) { best = i; bestDays = d }
    }
    if (best >= 0) {
      usedTxn.add(best); usedRent.add(rent.id)
      rentMatches.push({ rentId: rent.id, txn: txns[best], confidence: bestDays <= 5 ? 'high' : 'medium' })
    }
  }
  const expenseSuggestions: ExpenseSuggestion[] = []
  const unmatched: BankTxn[] = []
  for (let i = 0; i < txns.length; i++) {
    if (usedTxn.has(i)) continue
    const t = txns[i]
    if (t.amount < 0) expenseSuggestions.push({ txn: t, description: t.description || 'Τραπεζική χρέωση', amount: Math.abs(t.amount) })
    else unmatched.push(t)
  }
  return { rentMatches, expenseSuggestions, unmatched }
}
