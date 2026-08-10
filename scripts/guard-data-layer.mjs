#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΟΠΟΙΟΣ ΠΙΝΑΚΑΣ ΑΠΟΚΤΑ ΣΠΙΤΙ, ΔΕΝ ΞΑΝΑΒΓΑΙΝΕΙ ΣΤΟΝ ΔΡΟΜΟ
// ─────────────────────────────────────────────────────────────────────────
// Πενήντα εννέα αρχεία οθόνης μιλούσαν κατευθείαν στη βάση, με πεντακόσιες δέκα
// κλήσεις. Δεν είναι θέμα τάξης: το ΙΔΙΟ συγχρονιστικό μοτίβο ήταν γραμμένο δέκα
// φορές, και οι δέκα διαφορετικά — άλλες με παρτίδες, άλλες χωρίς, άλλες με
// έλεγχο αποτελέσματος, άλλες με κανέναν. Ό,τι διορθωνόταν στη μία διαδρομή
// έμενε λάθος στις άλλες εννέα.
//
// Ο πίνακας `calendar_events` έχει πλέον σπίτι: `lib/data/calendar.ts`. Ο
// φύλακας κρατά την πόρτα κλειστή — μια νέα οθόνη που θα έγραφε
// `supabase.from('calendar_events')` θα ξανάφτιαχνε ακριβώς το πρόβλημα που
// μόλις λύθηκε, και θα το έκανε χωρίς να το καταλάβει κανείς.
//
// ΔΕΝ ΕΙΝΑΙ ΚΑΣΤΑΝΙΑ. Οι κλήσεις είναι ΜΗΔΕΝ, και μηδέν μένουν. Καστάνια θέλει
// ό,τι έχει ουρά· εδώ η μετακόμιση ολοκληρώθηκε.
//
// ΟΙ ΕΠΟΜΕΝΟΙ ΠΙΝΑΚΕΣ. Ο κατάλογος μεγαλώνει με έναν πίνακα τη φορά, όταν το
// στρώμα του γραφτεί ολόκληρο. Μισή μετακόμιση είναι χειρότερη από καμία: δύο
// δρόμοι για το ίδιο πράγμα, και κανείς δεν ξέρει ποιος είναι ο σωστός.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs'
import { findSources } from './lib/find-tests.mjs'

/** Πίνακες που έχουν στρώμα, και το αρχείο που τους ανήκει. */
const OWNED = {
  calendar_events: 'lib/data/calendar.ts',
  expenses: 'lib/data/expenses.ts',
  user_properties: 'lib/data/properties.ts',
  tenants: 'lib/data/tenants.ts',
  checklist_items: 'lib/data/checklist.ts',
  rent_payments: 'lib/data/rent.ts',
  bills: 'lib/data/bills.ts',
  client_stays: 'lib/data/stays.ts',
}

const findings = []
for (const f of findSources()) {
  if (f.includes('.test.')) continue
  // ΟΙ ΣΥΝΑΡΤΗΣΕΙΣ ΑΚΡΟΥ ΔΕΝ ΕΙΝΑΙ ΟΘΟΝΕΣ. Τρέχουν σε Deno, με τον πελάτη
  // υπηρεσίας και χωρίς τα μονοπάτια του Next: δεν μπορούν να εισαγάγουν το
  // στρώμα ούτε αν το θέλαμε. Και δεν έχουν και τον λόγο — καμία τους δεν κάνει
  // τον συγχρονισμό που το στρώμα ήρθε να ενοποιήσει· διαβάζουν και στέλνουν.
  if (f.startsWith('supabase/functions/')) continue
  // Το σχόλιο που ΔΕΙΧΝΕΙ πώς γραφόταν κάτι δεν είναι κλήση: η `must` εξηγεί
  // τον εαυτό της με παράδειγμα σε `expenses`, και δεν το πληρώνει.
  const src = readFileSync(f, 'utf8').split('\n')
    .map(l => (l.trim().startsWith('//') || l.trim().startsWith('*')) ? '' : l).join('\n')
  for (const [table, home] of Object.entries(OWNED)) {
    if (f.endsWith(home)) continue
    const re = new RegExp(`\\.from\\(\\s*['"\`]${table}['"\`]`, 'g')
    let m
    while ((m = re.exec(src)) !== null) {
      const line = src.slice(0, m.index).split('\n').length
      findings.push({ file: f, line, table, home })
    }
  }
}

if (findings.length) {
  console.error(`✗ ${findings.length} κλήσεις σε πίνακα που έχει στρώμα δεδομένων:\n`)
  for (const x of findings) console.error(`  ${x.file}:${x.line}  «${x.table}» ανήκει στο ${x.home}`)
  console.error('\n  Το στρώμα ξέρει τη σειρά των βημάτων, τις παρτίδες και την εμβέλεια.')
  console.error('  Αν λείπει η πράξη που χρειάζεσαι, πρόσθεσέ την ΕΚΕΙ — μία φορά, για όλους.')
  process.exit(1)
}
const n = Object.keys(OWNED).length
console.log(n === 1
  ? '✓ ο πίνακας με στρώμα δεδομένων δεν προσπελαύνεται απευθείας'
  : `✓ οι ${n} πίνακες με στρώμα δεδομένων δεν προσπελαύνονται απευθείας`)
