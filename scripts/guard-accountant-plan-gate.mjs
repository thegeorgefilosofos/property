#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΚΑΘΕ ΠΟΡΤΑ ΤΗΣ ΠΥΛΗΣ ΛΟΓΙΣΤΗ ΡΩΤΑ ΤΗ ΣΥΝΔΡΟΜΗ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΣΦΑΛΜΑ. Στις 19/08 μπήκε η κλειδαριά συνδρομής στη `get_accountant_data`,
// με ρητό σκεπτικό: το token είναι διαπιστευτήριο κομιστή και δεν ξαναρωτά
// κανέναν, άρα ο έλεγχος ανήκει στη διαδρομή ΑΝΑΓΝΩΣΗΣ και τρέχει σε κάθε
// άνοιγμα. Εξι μέρες μετά γράφτηκε η `accountant_clients_overview` για τον
// χώρο εργασίας του λογιστή — και δεν τη ρώτησε.
//
// Ο ιδιοκτήτης που σταμάτησε να πληρώνει έμενε στη λίστα ολόκληρος: όνομα,
// ΑΦΜ, πλήθος ακινήτων, μετρητές δαπανών και διαμονών, τελευταία κίνηση,
// ανοιχτά αιτήματα και το ενεργό token. Ο φάκελος κλείδωνε, η κάρτα όχι.
//
// ── ΤΙ ΕΛΕΓΧΕΙ ─────────────────────────────────────────────────────────────
// Για κάθε συνάρτηση του καταλόγου, η ΤΕΛΕΥΤΑΙΑ της γραφή (οι μεταναστεύσεις
// διαβάζονται με χρονολογική σειρά ονόματος) περιέχει `user_plan_rank`.
//
// ΓΙΑΤΙ ΟΧΙ ΚΑΘΕ ΣΥΝΑΡΤΗΣΗ «accountant_». Η `accountant_link_live` απαντά αν ο
// σύνδεσμος ζει και τη ρωτούν οι υπόλοιπες· η `accountant_claim` είναι η
// στιγμή της ΕΚΔΟΣΗΣ, όπου το σκεπτικό της 19/08 λέει ρητά ότι ο έλεγχος δεν
// αρκεί. Ο κατάλογος είναι ονομαστικός: οι διαδρομές που ΕΠΙΣΤΡΕΦΟΥΝ δεδομένα
// ιδιοκτήτη σε λογιστή.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'supabase/migrations';
// Συνάρτηση → γιατί χρειάζεται την κλειδαριά.
const GATED = {
  get_accountant_data: 'ανοίγει τον φάκελο του ιδιοκτήτη με το token',
  accountant_clients_overview: 'δίνει ΑΦΜ, μετρητές και το ενεργό token κάθε πελάτη',
};

const files = readdirSync(DIR).filter(f => f.endsWith('.sql')).sort();
const latest = new Map();          // όνομα → { file, body }
for (const f of files) {
  const src = readFileSync(join(DIR, f), 'utf8');
  for (const name of Object.keys(GATED)) {
    const re = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\(`, 'i');
    const m = re.exec(src);
    if (!m) continue;
    // Το σώμα φτάνει ώς το κλείσιμο του dollar-quote.
    const from = m.index;
    const end = src.indexOf('\n$$;', from);
    latest.set(name, { file: f, body: src.slice(from, end === -1 ? src.length : end) });
  }
}

const findings = [];
for (const [name, why] of Object.entries(GATED)) {
  const hit = latest.get(name);
  if (!hit) { findings.push(`${name}: καμία γραφή στις μεταναστεύσεις — ${why}`); continue; }
  if (!/user_plan_rank/.test(hit.body)) {
    findings.push(`${DIR}/${hit.file}  «${name}» ${why}, χωρίς user_plan_rank`);
  }
}

if (findings.length) {
  console.error(`\n✗ ${findings.length} διαδρομές της πύλης λογιστή χωρίς κλειδαριά συνδρομής:\n`);
  for (const f of findings) console.error('  ' + f);
  console.error(`
  Προσθεσε \`public.user_plan_rank(<ιδιοκτήτης>) >= 1\`. Βαθμός 1 = πακέτο «Ενα
  ακίνητο». Χωρίς αυτό, ένας σύνδεσμος που εκδόθηκε όσο η συνδρομή ήταν ενεργή
  δουλεύει για πάντα: το token δεν ξαναρωτά κανέναν.`);
  process.exit(1);
}

console.log(`✓ και οι ${Object.keys(GATED).length} διαδρομές της πύλης λογιστή ρωτούν τη συνδρομή`);
