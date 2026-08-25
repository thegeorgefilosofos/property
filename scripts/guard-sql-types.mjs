#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΣΩΜΑ ΜΙΑΣ PLPGSQL ΣΥΝΑΡΤΗΣΗΣ ΔΕΝ ΕΛΕΓΧΕΤΑΙ ΠΟΤΕ ΠΡΙΝ ΤΡΕΞΕΙ.
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΓΕΝΝΗΣΕ ΑΥΤΟΝ ΤΟΝ ΦΥΛΑΚΑ
//
// Το `tenants.property_id` είναι uuid. Το `portal_links.property_id` είναι
// text. Δεν υπάρχει τελεστής `uuid = text` στην Postgres. Η γραμμή
//
//     from tenants where property_id = v_link.property_id
//
// υπήρχε αυτούσια σε τρία migrations, από το baseline και μετά και πετούσε
// 42883 σε ΚΑΘΕ κλήση. Δηλαδή η Πύλη Ενοικιαστή δεν άνοιγε ποτέ και καμία
// φόρμα βλάβης δεν καταχωρήθηκε ποτέ — ενώ κάθε deploy ήταν πράσινο.
//
// Πράσινο γιατί η Postgres ΔΕΝ επαληθεύει το σώμα μιας plpgsql συνάρτησης στο
// `create or replace`: το αποθηκεύει ως κείμενο και το ελέγχει μόνο όταν
// εκτελεστεί. Ένα `create function` με ανύπαρκτο πίνακα, λάθος στήλη ή
// ασύμβατους τύπους περνά καθαρό. Το λάθος βγήκε στην επιφάνεια μόνο όταν ένα
// migration έκανε την ίδια σύγκριση σε ΣΚΕΤΗ SQL, που ελέγχεται αμέσως.
//
// ΤΙ ΕΠΙΒΑΛΛΕΙ
//
// Ο κώδικας των συνδέσμων (portal_links, checkin_links) κρατά `property_id` ως
// text, ενώ οι πίνακες του τομέα το κρατούν ως uuid. Η σύμβαση που ήδη
// ακολουθούν οι σωστές γραμμές είναι ρητό `::text` στη σύγκριση:
//
//     where id::text = v_link.property_id::text          ← user_properties
//     where property_id::text = v_link.property_id::text ← rent_payments
//
// Ο φύλακας απαιτεί ότι κάθε ΣΥΓΚΡΙΣΗ με `<μεταβλητή>.property_id` έχει cast.
// Τα INSERT (`values (v_link.property_id, …)`) δεν είναι συγκρίσεις και δεν
// αγγίζονται: εκεί text μπαίνει σε text.
//
// ΔΕΥΤΕΡΗ ΑΠΟΔΕΚΤΗ ΓΡΑΦΗ, ΚΑΙ ΓΙΑΤΙ ΕΙΝΑΙ Η ΚΑΛΥΤΕΡΗ:
//
//     where id = v_link.property_id::uuid                 ← user_properties
//
// Το `::text` και στις δύο πλευρές λύνει τον τύπο αλλά μετατρέπει τη ΣΤΗΛΗ,
// οπότε το ευρετήριό της μένει αχρησιμοποίητο. Το `::uuid` μετατρέπει τη
// ΜΕΤΑΒΛΗΤΗ, δηλαδή τη μία τιμή και το πρωτεύον κλειδί δουλεύει κανονικά.
// Δεκτό μόνο όταν η άλλη πλευρά είναι σκέτη — δηλαδή είναι όντως uuid.
//
// Δεν είναι πλήρης τυπικός έλεγχος SQL — είναι το ΣΥΓΚΕΚΡΙΜΕΝΟ λάθος που μας
// στοίχισε δύο λειτουργίες, κλειδωμένο ώστε να μην ξαναγραφτεί.
// ═══════════════════════════════════════════════════════════════════════════
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'supabase/migrations'
const findings = []

// Σύγκριση: `… = v_x.property_id` ή `v_x.property_id = …`, με `=`, `<>` ή `!=`.
// Το `values (…)` και το `insert` δεν ταιριάζουν γιατί δεν έχουν τελεστή.
const CMP = /([\w.]+(?:::(?:text|uuid))?)\s*(=|<>|!=)\s*(v_\w+\.property_id(?:::(?:text|uuid))?)|(v_\w+\.property_id(?:::(?:text|uuid))?)\s*(=|<>|!=)\s*([\w.]+(?:::(?:text|uuid))?)/g

// ΕΛΕΓΧΕΤΑΙ Η ΖΩΝΤΑΝΗ ΕΚΔΟΣΗ, ΟΧΙ Η ΙΣΤΟΡΙΑ.
//
// Ένα εφαρμοσμένο migration ΔΕΝ επιτρέπεται να πειραχτεί: το άθροισμα ελέγχου
// του είναι καταγεγραμμένο στη βάση. Οι παλιές, σπασμένες εκδόσεις της
// get_portal_data μένουν λοιπόν στα αρχεία τους για πάντα — αλλά έχουν ήδη
// αντικατασταθεί από `create or replace` σε νεότερο migration, οπότε δεν
// τρέχουν πουθενά.
//
// Ένας φύλακας που τις κατήγγειλε θα ήταν μόνιμα κόκκινος για κώδικα που δεν
// υπάρχει — και ο μόνος τρόπος να ησυχάσει θα ήταν να τον αγνοήσει κανείς.
// Άρα: για κάθε όνομα συνάρτησης κρατιέται ΜΟΝΟ ο τελευταίος ορισμός, με τη
// σειρά που τα εφαρμόζει η Supabase (αλφαβητικά = χρονολογικά, από το
// timestamp στο όνομα του αρχείου). Νέος σπασμένος ορισμός χτυπά αμέσως.
const DEF = /create\s+or\s+replace\s+function\s+(?:public\.)?(\w+)\s*\(/i
const live = new Map()   // όνομα → { file, start, end }

for (const file of readdirSync(DIR).filter(f => f.endsWith('.sql')).sort()) {
  const lines = readFileSync(join(DIR, file), 'utf8').split('\n')
  let cur = null
  lines.forEach((raw, i) => {
    const d = DEF.exec(raw)
    if (d) { cur = { name: d[1], file, start: i, end: lines.length, lines }; live.set(d[1], cur); return }
    // Το `end; $$;` (ή σκέτο `$$;`) κλείνει το σώμα.
    if (cur && /\$\$\s*;/.test(raw)) { cur.end = i; cur = null }
  })
}

for (const def of live.values()) {
  for (let i = def.start; i <= Math.min(def.end, def.lines.length - 1); i++) {
    const raw = def.lines[i]
    const line = raw.replace(/--.*$/, '')          // τα σχόλια δεν είναι κώδικας
    if (!line.includes('.property_id')) continue
    for (const m of line.matchAll(CMP)) {
      const left = m[1] ?? m[4]
      const right = m[3] ?? m[6]
      // Και οι δύο πλευρές ρητά text: η παλιά, ασφαλής γραφή.
      if (left.endsWith('::text') && right.endsWith('::text')) continue
      // Ή η μεταβλητή γίνεται uuid και η στήλη μένει άθικτη: ίδια ασφάλεια,
      // με το ευρετήριο στη θέση του.
      const varSide = (m[3] ?? m[4]) === right ? right : left
      const colSide = varSide === right ? left : right
      if (varSide.endsWith('::uuid') && !colSide.includes('::')) continue
      findings.push({ file: def.file, line: i + 1, fn: def.name, text: raw.trim() })
    }
  }
}

if (findings.length) {
  console.error('✗ Σύγκριση property_id χωρίς ρητό ::text και στις δύο πλευρές.')
  console.error('  Οι στήλες των συνδέσμων είναι text, των πινάκων uuid: χωρίς cast')
  console.error('  η Postgres πετά 42883 ΣΤΗΝ ΕΚΤΕΛΕΣΗ, με το deploy πράσινο.\n')
  for (const f of findings) console.error(`  ${f.file}:${f.line}  (${f.fn})\n     ${f.text.slice(0, 120)}`)
  console.error('\n  Γράψε: where property_id::text = v_link.property_id::text')
  console.error('  ή, όταν η στήλη είναι uuid: where id = v_link.property_id::uuid')
  process.exit(1)
}

console.log('✅ Τύποι SQL: κάθε σύγκριση property_id με σύνδεσμο έχει ρητό cast.')
