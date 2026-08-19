#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΜΙΑ ΜΕΤΑΝΑΣΤΕΥΣΗ ΠΟΥ ΔΕΝ ΞΑΝΑΤΡΕΧΕΙ, ΣΤΑΜΑΤΑ ΤΟΝ ΑΓΩΓΟ ΣΤΗ ΜΕΣΗ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΓΕΝΝΗΣΕ ΑΥΤΟΝ ΤΟΝ ΦΥΛΑΚΑ. Στις 19/08/2026 το deploy σταμάτησε
// στη δέκατη από δεκαέξι μεταναστεύσεις:
//
//   ERROR: constraint "accountant_clients_claimed_token_present" for relation
//          "accountant_clients" already exists (SQLSTATE 42710)
//
// Οι έξι επόμενες δεν έτρεξαν ποτέ — ανάμεσά τους η κλειδαριά συνδρομής της
// πύλης λογιστή. Η αιτία ήταν ΜΙΑ γραμμή: ένα `alter table … add constraint`
// χωρίς φύλαξη, ανάμεσα σε δώδεκα άλλα περιορίσματα του repo που ΕΙΧΑΝ τη
// φύλαξη. Δηλαδή το ιδίωμα υπήρχε και ήταν σωστό· απλώς κανείς δεν το
// επέβαλλε, και η εξαίρεση πέρασε σιωπηλά ώς την παραγωγή.
//
// ΓΙΑΤΙ ΔΕΝ ΤΟ ΠΙΑΝΕΙ ΤΙΠΟΤΑ ΑΛΛΟ. Η μετανάστευση εφαρμόζεται σωστά την ΠΡΩΤΗ
// φορά· σκάει μόνο στη ΔΕΥΤΕΡΗ. Και δεύτερη φορά συμβαίνει συνέχεια: το
// `db push --include-all`, ένα staging που ξαναχτίζεται, μια εκτέλεση που
// κόπηκε στη μέση. Καμία δοκιμή δεν τρέχει βάση, οπότε ο μόνος έλεγχος ήταν
// το ίδιο το deploy — δηλαδή η παραγωγή.
//
// ΤΙ ΕΠΙΒΑΛΛΕΙ. Η PostgreSQL ΔΕΝ έχει `add constraint if not exists`. Το
// ιδίωμα του repo είναι η ρητή φύλαξη:
//
//     do $$ begin
//       if not exists (select 1 from pg_constraint where conname = 'όνομα') then
//         alter table … add constraint όνομα …;
//       end if;
//     end $$;
//
// Δεκτό είναι επίσης ένα προηγούμενο `drop constraint if exists <όνομα>`.
//
// ΤΙ ΔΕΝ ΑΦΟΡΑ. Το baseline (χτίζει από το μηδέν, τρέχει μία φορά σε άδεια
// βάση) και όσα ήδη γράφονται με `create or replace` / `if not exists`.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'supabase/migrations'
const BASELINE = /^0{14}_/

const findings = []
for (const file of readdirSync(DIR).filter(f => f.endsWith('.sql')).sort()) {
  if (BASELINE.test(file)) continue
  const sql = readFileSync(join(DIR, file), 'utf8')
  // Σχόλια έξω: το ιδίωμα συχνά περιγράφεται σε σχόλιο δίπλα στον κώδικα.
  const bare = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n')

  for (const m of bare.matchAll(/\badd\s+constraint\s+([a-z_0-9]+)/gi)) {
    const name = m[1]
    const guarded =
      new RegExp(`conname\\s*=\\s*'${name}'`, 'i').test(bare) ||
      new RegExp(`drop\\s+constraint\\s+if\\s+exists\\s+${name}\\b`, 'i').test(bare)
    if (!guarded) {
      const line = bare.slice(0, m.index).split('\n').length
      findings.push(`${DIR}/${file}:~${line}  add constraint ${name}`)
    }
  }
}

if (findings.length) {
  console.error(`✗ ${findings.length} περιορισμοί χωρίς φύλαξη επανεκτέλεσης:\n`)
  for (const x of findings) console.error('  ' + x)
  console.error(`
  Η PostgreSQL δεν δέχεται «add constraint if not exists». Τύλιξέ το:

    do $$ begin
      if not exists (select 1 from pg_constraint where conname = 'ΟΝΟΜΑ') then
        alter table … add constraint ΟΝΟΜΑ …;
      end if;
    end $$;
`)
  process.exit(1)
}
console.log('✓ κάθε περιορισμός μετανάστευσης αντέχει δεύτερη εκτέλεση')
