#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΟΙ ΠΙΝΑΚΕΣ ΠΟΥ ΔΕΝ ΑΓΓΙΖΕΙ ΠΟΤΕ Ο ΠΕΛΑΤΗΣ
// ─────────────────────────────────────────────────────────────────────────
// Οκτώ πίνακες έχουν RLS ενεργό και ΚΑΜΙΑ πολιτική. Δεν είναι παράλειψη: είναι
// η σχεδίαση. Τους γράφει και τους διαβάζει μόνο ο `service_role` (edge
// functions) ή συναρτήσεις SECURITY DEFINER με ιδιοκτήτη `postgres`.
//
// Με τη μετανάστευση `20260808120000_service_only_tables_revoke` οι τέσσερις
// από αυτούς που κρατούσαν ακόμη δικαιώματα για `anon` και `authenticated` τα
// έχασαν, ώστε η άρνηση να μη στηρίζεται σε ΕΝΑ μηχανισμό.
//
// ΤΙ ΠΑΕΙ ΣΤΡΑΒΑ ΧΩΡΙΣ ΑΥΤΟΝ ΤΟΝ ΦΥΛΑΚΑ. Κάποιος γράφει, καλόπιστα,
// `supabase.from('referrals').select(...)` μέσα σε component. Πριν την
// ανάκληση, το ερώτημα γύριζε ΑΘΟΡΥΒΑ μηδέν γραμμές — το RLS αρνιόταν χωρίς
// σφάλμα — και η οθόνη έδειχνε «δεν έχεις προσκλήσεις» σε κάποιον που είχε.
// Μετά την ανάκληση γυρίζει σφάλμα δικαιωμάτων. Και στις δύο περιπτώσεις η
// αιτία είναι ίδια και δυσδιάκριτη από την οθόνη· εδώ πιάνεται στο CI, με
// ονομαστική εξήγηση αντί για μηδενικά αποτελέσματα.
//
// Η ΣΩΣΤΗ ΔΙΑΔΡΟΜΗ: κλήση RPC σε συνάρτηση SECURITY DEFINER που ελέγχει η ίδια
// ποιος ρωτά — έτσι δουλεύουν ήδη οι `get_referral_*` και η `next_invoice_number`.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs'
import { findSources } from './lib/find-tests.mjs'

/**
 * Οι πίνακες μόνο-υπηρεσίας: RLS ενεργό, μηδέν πολιτικές, μηδέν δικαιώματα σε
 * ρόλους πελάτη. Η λίστα καθρεφτίζει τον κατάλογο της παραγωγής.
 */
const SERVICE_ONLY = [
  'ai_budget',
  'ai_usage',
  'cron_secrets',
  'email_outbox',
  'feedback_campaign_winners',
  'invoice_counters',
  'portal_pin_attempts',
  'referrals',
]

/**
 * Πού ΕΠΙΤΡΕΠΕΤΑΙ να εμφανίζονται: edge functions (τρέχουν με SERVICE_KEY),
 * migrations (ορίζουν τους πίνακες), τύποι βάσης (παράγονται αυτόματα) και ο
 * ίδιος ο φύλακας.
 */
const ALLOWED = /^(supabase\/functions|supabase\/migrations|scripts\/|lib\/supabase\/tables\.ts)/

const findings = []
for (const file of findSources()) {
  if (ALLOWED.test(file) || file.includes('.test.')) continue
  const src = readFileSync(file, 'utf8')
  src.split('\n').forEach((line, i) => {
    const t = line.trim()
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return
    for (const table of SERVICE_ONLY) {
      // Μόνο η μορφή πρόσβασης, όχι η λέξη μέσα σε κείμενο: «referrals» σε
      // ελληνική πρόταση δεν είναι ερώτημα.
      if (!new RegExp(`\\.from\\(\\s*['"\`]${table}['"\`]`).test(line)) continue
      findings.push({ file, line: i + 1, table, code: t.slice(0, 100) })
    }
  })
}

if (findings.length) {
  console.error('✗ Πρόσβαση πελάτη σε πίνακα μόνο-υπηρεσίας:\n')
  for (const f of findings) console.error(`  ${f.file}:${f.line}  [${f.table}]\n    ${f.code}`)
  console.error('\n  Αυτοί οι πίνακες έχουν RLS χωρίς πολιτικές και μηδέν δικαιώματα για anon/authenticated.')
  console.error('  Το ερώτημα δεν θα επιστρέψει δεδομένα — θα αποτύχει ή θα γυρίσει άδειο, αθόρυβα.')
  console.error('  Χρησιμοποίησε RPC σε συνάρτηση SECURITY DEFINER, όπως οι get_referral_* .')
  process.exit(1)
}
console.log(`✓ κανένας από τους ${SERVICE_ONLY.length} πίνακες μόνο-υπηρεσίας δεν διαβάζεται από πελάτη`)
