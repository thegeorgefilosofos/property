#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΚΑΜΙΑ ΒΑΣΗ ΔΕΝ ΜΑΝΤΕΥΕΙ ΤΗ ΔΙΕΥΘΥΝΣΗ ΤΗΣ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΣΥΝΕΒΗ. Εννιά μεταναστεύσεις έγραφαν το ίδιο εφεδρικό όταν έλειπε το
// `functions_base_url` του vault: το ref της ΠΑΡΑΓΩΓΗΣ, καρφωμένο. Το μυστικό
// δεν υπήρχε σε κανένα έργο, οπότε το εφεδρικό ίσχυε παντού — και στο staging
// εννιά εργασίες cron καλούσαν τις συναρτήσεις της παραγωγής. Δεν έγινε ζημιά
// μόνο επειδή το `x-cron-secret` δεν ταίριαζε: 401 κάθε πέντε λεπτά, επί μήνες.
// Ανάμεσά τους το `purge-orphan-files`, που σβήνει αρχεία.
//
// Ο ΚΑΝΟΝΑΣ: η διεύθυνση διαβάζεται από `private.functions_base_url()`. Οταν
// λείπει, η μετανάστευση ΔΕΝ προγραμματίζει τίποτα και το λέει δυνατά. Ενα
// εφεδρικό που δείχνει σε άλλο έργο δεν είναι εφεδρικό, είναι λάθος με
// προεπιλογή.
//
// ΤΑ ΠΑΛΙΑ ΑΡΧΕΙΑ ΕΙΝΑΙ ΟΝΟΜΑΣΤΙΚΑ ΚΑΙ ΕΧΟΥΝ ΗΜΕΡΟΜΗΝΙΑ. Είναι ήδη εφαρμοσμένα
// και οι μεταναστεύσεις είναι forward-only: δεν ξαναγράφονται. Η
// `20260902140000` διορθώνει το ΑΠΟΤΕΛΕΣΜΑ τους σε κάθε βάση. Ο κατάλογος δεν
// μεγαλώνει.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { projectFiles } from './lib/git-files.mjs';

const SELF = 'scripts/guard-project-ref.mjs';

/** Αρχεία γραμμένα ΠΡΙΝ τον κανόνα, ήδη εφαρμοσμένα, με τον λόγο τους. */
const GRANDFATHERED = new Set([
  'supabase/migrations/00000000000000_baseline.sql',
  'supabase/migrations/00000000000002_scheduling.sql',
  'supabase/migrations/20260722230000_infra_review_hardening.sql',
  'supabase/migrations/20260723090000_email_activation_safety.sql',
  'supabase/migrations/20260723092000_email_activation_fixes.sql',
  'supabase/migrations/20260804100000_schedule_ical_sync.sql',
  'supabase/migrations/20260824110000_ta_arxeia_fevgoun_apo_to_api.sql',
  'supabase/migrations/20260901120000_i_trofodosia_den_perimenei_anthropo.sql',
  'supabase/migrations/20260902120000_ta_epitokia_elenxontai_kathe_mera.sql',
  // Η ίδια η μετανάστευση που το διορθώνει: το ref εμφανίζεται μόνο μέσα σε
  // σχόλιο, ως περιγραφή του σφάλματος.
  'supabase/migrations/20260902140000_kanenas_den_manteuei_ti_dieuthynsi_tou.sql',
  // Ο αγωγός ΠΡΕΠΕΙ να ξέρει και τα δύο ref: αυτός διαλέγει έργο ανά κλάδο.
  '.github/workflows/supabase-deploy.yml',
  '.github/workflows/db-backup.yml',
  '.github/workflows/db-types.yml',
]);

/** Ref έργου Supabase: είκοσι πεζά γράμματα, μέσα σε διεύθυνση. */
const REF = /https:\/\/[a-z]{20}\.supabase\.co/;

const hits = [];
for (const f of projectFiles()) {
  if (f === SELF || GRANDFATHERED.has(f)) continue;
  if (!/\.(sql|ts|tsx|mjs|yml|yaml)$/.test(f)) continue;
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((l, i) => {
    if (!REF.test(l)) return;
    // Η αναφορά μέσα σε σχόλιο ή σε τεκμηρίωση δεν καλεί τίποτα.
    if (/^\s*(--|\/\/|\*|#)/.test(l)) return;
    hits.push(`${f}:${i + 1}\n     ${l.trim().slice(0, 96)}`);
  });
}

if (hits.length) {
  console.error(`✗ ${hits.length} καρφωμένα ref έργου Supabase, εκτός του καταλόγου:\n`);
  for (const h of hits) console.error('  ' + h);
  console.error(`
  Η διεύθυνση των edge functions διαβάζεται από private.functions_base_url()
  (vault: functions_base_url). Οταν λείπει, μη μαντεύεις: μην προγραμματίσεις
  τίποτα και γράψε warning. Ενα εφεδρικό που δείχνει σε ΑΛΛΟ έργο έστειλε τις
  εργασίες του staging στην παραγωγή — βλ. 20260902140000.\n`);
  process.exit(1);
}
console.log(`✅ Καμία διεύθυνση έργου καρφωμένη σε κώδικα (${GRANDFATHERED.size} ονομαστικά παλιά αρχεία, ήδη εφαρμοσμένα).`);
