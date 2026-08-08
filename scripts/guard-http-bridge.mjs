#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΚΑΜΙΑ ΓΕΦΥΡΑ ΑΠΟ ΤΟΝ ΠΕΛΑΤΗ ΠΡΟΣ ΤΟ pg_net
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΤΑΞΙΔΙ, ΓΙΑΤΙ ΤΟ ΣΥΜΠΕΡΑΣΜΑ ΕΙΝΑΙ ΑΝΤΙΘΕΤΟ ΑΠΟ ΤΗΝ ΑΦΟΡΜΗ.
//
// Ο ελεγκτής ασφαλείας της πλατφόρμας ανέφερε: «Extension pg_net is installed
// in the public schema. Move it to another schema.» Ακολούθησε έλεγχος αντί για
// συμμόρφωση, και το εύρημα δεν στέκει όπως διαβάζεται:
//
//   · ΟΛΑ τα αντικείμενα της επέκτασης ζουν στο σχήμα `net`: 12 συναρτήσεις,
//     12 τύποι, 3 πίνακες, και το ίδιο το σχήμα. ΜΗΔΕΝ στο `public`.
//   · Μόνο η εγγραφή `pg_extension.extnamespace` δείχνει στο public — λογιστική
//     τιμή που βάζει η πλατφόρμα, και αυτήν διαβάζει ο ελεγκτής.
//   · Η μετακίνηση είναι ΑΔΥΝΑΤΗ. Δοκιμάστηκε σε συναλλαγή που αναιρέθηκε:
//         ERROR: extension "pg_net" does not support SET SCHEMA
//     Το pg_net δηλώνει σταθερό σχήμα στο control file του.
//
// ΨΑΧΝΟΝΤΑΣ ΤΟ ΨΕΥΤΙΚΟ ΕΥΡΗΜΑ, ΒΡΕΘΗΚΕ ΕΝΑ ΠΡΑΓΜΑΤΙΚΟ: οι συναρτήσεις του
// `net` έχουν ACL `NULL`, δηλαδή την προεπιλογή της Postgres — EXECUTE σε
// PUBLIC. Άρα, στο χαρτί, `anon` και `authenticated` μπορούν να ζητήσουν από τη
// βάση αυθαίρετο αίτημα HTTP. Αυτό είναι SSRF με αποστολέα τον διακομιστή.
//
// ΚΑΙ ΓΙΑΤΙ ΔΕΝ ΥΠΑΡΧΕΙ ΜΕΤΑΝΑΣΤΕΥΣΗ ΠΟΥ ΝΑ ΤΟ ΚΛΕΙΝΕΙ. Δύο λόγοι, μετρημένοι:
//
//   1. ΔΕΝ ΕΙΝΑΙ ΠΡΟΣΒΑΣΙΜΟ. Το PostgREST εκθέτει `public` και `graphql_public`,
//      όχι το `net`. Η μόνη συνάρτηση του `public` που καλεί `net.http_*` είναι
//      η `drain_email_outbox`, και ΔΕΝ είναι εκτελέσιμη ούτε από `anon` ούτε από
//      `authenticated` — την τρέχει το cron ως `postgres`.
//   2. ΔΕΝ ΜΠΟΡΟΥΜΕ ΝΑ ΤΟ ΑΛΛΑΞΟΥΜΕ, ΚΑΙ Η ΑΠΟΠΕΙΡΑ ΕΙΝΑΙ ΕΠΙΚΙΝΔΥΝΗ. Οι
//      συναρτήσεις ανήκουν στον `supabase_admin`· ο `postgres` δεν είναι μέλος
//      του. Ένα `revoke ... from public` περνά ως ΠΡΟΕΙΔΟΠΟΙΗΣΗ, όχι σφάλμα:
//      δεν αλλάζει τίποτα και μοιάζει επιτυχία. Χειρότερα, ο ίδιος ο `postgres`
//      παίρνει το EXECUTE ΜΕΣΩ του PUBLIC — αν η αφαίρεση κάποτε πετύχει χωρίς
//      αντίστοιχη ρητή παραχώρηση, σταματούν ΟΛΑ τα email του κύκλου ζωής.
//
// ΤΙ ΜΕΝΕΙ ΝΑ ΦΥΛΑΧΘΕΙ, ΚΑΙ ΕΙΝΑΙ ΑΥΤΟ ΠΟΥ ΕΛΕΓΧΕΙ Ο ΦΥΛΑΚΑΣ. Η έκθεση σήμερα
// είναι μηδενική επειδή ΔΕΝ ΥΠΑΡΧΕΙ ΓΕΦΥΡΑ. Η ημέρα που κάποιος γράψει στο
// `public` μια συνάρτηση που καλεί `net.http_*` και τη δώσει σε ρόλο πελάτη,
// ολόκληρη η ανάλυση από πάνω καταρρέει με μία γραμμή SQL. Αυτό πιάνεται εδώ.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'supabase/migrations'
const SELF = /pg_net|http_bridge/

/** Οι δηλώσεις `create function` ενός αρχείου, με το σώμα τους. */
function functionBodies(src) {
  const out = []
  const re = /create\s+(or\s+replace\s+)?function\s+(?:public\.)?([a-z0-9_]+)/gi
  let m
  while ((m = re.exec(src)) !== null) {
    const start = m.index
    // Το σώμα τελειώνει στο κλείσιμο του dollar-quote, αλλιώς στο επόμενο «;».
    const tagMatch = src.slice(start).match(/\$([a-z_]*)\$/i)
    let end
    if (tagMatch) {
      const tag = tagMatch[0]
      const first = src.indexOf(tag, start)
      const second = src.indexOf(tag, first + tag.length)
      end = second === -1 ? src.length : second + tag.length
    } else {
      end = src.indexOf(';', start)
      if (end === -1) end = src.length
    }
    out.push({ name: m[2], body: src.slice(start, end), line: src.slice(0, start).split('\n').length })
    re.lastIndex = end
  }
  return out
}

const findings = []
for (const file of readdirSync(DIR).filter(f => f.endsWith('.sql')).sort()) {
  if (SELF.test(file)) continue
  const src = readFileSync(join(DIR, file), 'utf8')

  // Ποιες συναρτήσεις αυτού του αρχείου αγγίζουν το pg_net;
  const bridges = functionBodies(src).filter(f => /\bnet\.http_/i.test(f.body))
  if (!bridges.length) continue

  for (const f of bridges) {
    // Δίνεται σε ρόλο πελάτη οπουδήποτε μέσα στο ίδιο migration;
    const grant = new RegExp(
      `grant\\s+execute\\s+on\\s+function\\s+(?:public\\.)?${f.name}\\s*\\([^)]*\\)\\s+to\\s+([^;]+);`, 'i',
    ).exec(src)
    if (!grant) continue
    if (/\b(anon|authenticated|public)\b/i.test(grant[1])) {
      findings.push({
        file: join(DIR, file), line: f.line, name: f.name, to: grant[1].trim().replace(/\s+/g, ' '),
      })
    }
  }
}

if (findings.length) {
  console.error('✗ Γέφυρα από ρόλο πελάτη προς το pg_net:\n')
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}`)
    console.error(`    Η \`${f.name}\` καλεί net.http_* και δίνεται σε: ${f.to}`)
  }
  console.error('\n  Το pg_net κάνει αιτήματα HTTP ΑΠΟ ΤΟΝ ΔΙΑΚΟΜΙΣΤΗ. Συνάρτηση που το καλεί και')
  console.error('  εκτελείται από anon/authenticated μετατρέπει τη βάση σε ανοιχτό proxy (SSRF).')
  console.error('  Οι συναρτήσεις του σχήματος net έχουν EXECUTE σε PUBLIC από την πλατφόρμα και')
  console.error('  ΔΕΝ μπορούμε να το αλλάξουμε: ανήκουν στον supabase_admin. Η μόνη άμυνα είναι')
  console.error('  να μην υπάρχει γέφυρα. Δώσε τη συνάρτηση σε service_role, ή κάλεσέ τη από cron.')
  process.exit(1)
}
console.log('✓ καμία συνάρτηση pg_net δεν είναι προσβάσιμη από ρόλο πελάτη')
