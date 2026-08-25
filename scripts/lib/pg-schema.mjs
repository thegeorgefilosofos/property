// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΣΧΗΜΑ ΤΗΣ ΒΑΣΗΣ, ΔΙΑΒΑΣΜΕΝΟ ΑΠΟ ΤΑ MIGRATIONS
// ─────────────────────────────────────────────────────────────────────────
// ΓΙΑΤΙ ΞΕΧΩΡΙΣΤΟ ΑΡΧΕΙΟ. Δύο εργαλεία χρειάζονται τον ίδιο χάρτη: ο φύλακας
// που ελέγχει αν μια στήλη υπάρχει (guard-schema-drift) και η γεννήτρια που
// γράφει τους τύπους των γραμμών (gen-db-types). Γραμμένος δύο φορές, θα
// απέκλιναν την πρώτη μέρα που κάποιο migration χρησιμοποιούσε σύνταξη που
// είχε μάθει μόνο ο ένας — και η απόκλιση θα ήταν αόρατη, γιατί και οι δύο
// θα «περνούσαν».
//
// ΤΙ ΕΠΙΣΤΡΕΦΕΙ. Map<πίνακας, Map<στήλη, { sql, notNull }>>. Η σειρά των
// στηλών διατηρείται όπως στα migrations, ώστε το παραγόμενο αρχείο να μην
// αλλάζει σειρά χωρίς λόγο.
// ═══════════════════════════════════════════════════════════════════════════
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIG = 'supabase/migrations';
const BASELINE = '00000000000000_baseline.sql';

// Γραμμές μέσα σε CREATE TABLE που ΔΕΝ είναι στήλες.
const NOT_A_COLUMN = /^(constraint|primary|unique|foreign|check|like|exclude)$/i;

function parseColumns(body) {
  const cols = new Map();
  for (const line of body.split('\n')) {
    const m = /^\s*"?([a-z_][a-z0-9_]*)"?\s+(.+?),?\s*$/i.exec(line);
    if (!m || NOT_A_COLUMN.test(m[1])) continue;
    const rest = m[2];
    // Μια γραμμή σαν `"id" "uuid" DEFAULT … NOT NULL` — ο τύπος είναι ό,τι
    // προηγείται της πρώτης λέξης-κλειδί.
    const type = rest.split(/\s+(?:default|not\s+null|null|references|generated|primary|unique|check|collate)\b/i)[0];
    cols.set(m[1], { sql: type.replace(/"/g, '').trim(), notNull: /\bnot\s+null\b/i.test(rest) });
  }
  return cols;
}

/** Ο χάρτης του σχήματος: πίνακας → στήλη → { sql, notNull }. */
export function readSchema() {
  const schema = new Map();

  const base = readFileSync(join(MIG, BASELINE), 'utf8');
  for (const m of base.matchAll(/CREATE TABLE IF NOT EXISTS "public"\."(\w+)" \(([\s\S]*?)\n\);/g))
    schema.set(m[1], parseColumns(m[2]));

  for (const file of readdirSync(MIG).filter(f => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIG, file), 'utf8');
    // Πίνακες που γεννιούνται εκτός baseline.
    for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?(\w+)"?\s*\(([\s\S]*?)\n\);/gi)) {
      if (schema.has(m[1])) continue;
      schema.set(m[1], parseColumns(m[2]));
    }
    // ΕΝΑ `alter table` ΜΠΟΡΕΙ ΝΑ ΠΡΟΣΘΕΤΕΙ ΠΟΛΛΕΣ ΣΤΗΛΕΣ ΜΕ ΚΟΜΜΑΤΑ.
    for (const stmt of sql.matchAll(/alter\s+table\s+(?:only\s+)?(?:public\.)?"?(\w+)"?([\s\S]*?);/gi)) {
      const cols = schema.get(stmt[1]);
      if (!cols) continue;
      for (const c of stmt[2].matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?"?(\w+)"?\s*([a-z0-9_ ()\[\],]*)/gi))
        if (!cols.has(c[1])) cols.set(c[1], {
          // Το κόμμα που χωρίζει δύο `add column` στην ίδια πρόταση κολλούσε
          // στον τύπο: `numeric,` δεν είναι τύπος και δεν αντιστοιχίζεται.
          sql: (c[2] || 'text').trim().split(/\s+(?:default|not\s+null|references)\b/i)[0].replace(/,\s*$/, '').trim() || 'text',
          notNull: false,
        });
      // Μια στήλη που έγινε NOT NULL αργότερα μετράει ως NOT NULL.
      for (const c of stmt[2].matchAll(/alter\s+column\s+"?(\w+)"?\s+set\s+not\s+null/gi)) {
        const col = cols.get(c[1]);
        if (col) col.notNull = true;
      }
      // ── ΚΑΙ Η ΑΝΤΙΣΤΡΟΦΗ ΚΙΝΗΣΗ, ΠΟΥ ΕΛΕΙΠΕ ────────────────────────────
      // Ο αναγνώστης ήξερε `set not null` και όχι `drop not null`. Δύο
      // εντολές στο αποθετήριο, δύο ψέματα στους τύπους:
      //
      //   rent_payments.payment_date    (20260805072000)
      //   notification_log.event_id     (20260814020000)
      //
      // Ο TypeScript υποσχόταν «υπάρχει πάντα» για στήλες που η βάση δέχεται
      // κενές. Ο κώδικας τις χειριζόταν χωρίς έλεγχο και η ημερομηνία
      // πληρωμής είναι ακριβώς το είδος τιμής που, όταν λείπει, δεν σκάει:
      // ταξιδεύει ως `undefined` μέσα σε ταξινόμηση και σε άθροισμα.
      for (const c of stmt[2].matchAll(/alter\s+column\s+"?(\w+)"?\s+drop\s+not\s+null/gi)) {
        const col = cols.get(c[1]);
        if (col) col.notNull = false;
      }
      for (const c of stmt[2].matchAll(/drop\s+column\s+(?:if\s+exists\s+)?"?(\w+)"?/gi)) cols.delete(c[1]);
      // ── Η ΜΕΤΟΝΟΜΑΣΙΑ ΗΤΑΝ ΤΥΦΛΟ ΣΗΜΕΙΟ, ΚΑΙ ΠΡΟΣ ΤΙΣ ΔΥΟ ΚΑΤΕΥΘΥΝΣΕΙΣ ──
      // Ο αναγνώστης ήξερε `add`, `drop` και `set not null`, αλλά όχι
      // `rename column`. Οταν οι στήλες του εμπόρου μετονομάστηκαν από
      // `stripe_*` σε `mor_*`, ο χάρτης έμεινε με τα ΠΑΛΙΑ ονόματα:
      //
      //   · κάθε αναφορά στα ΝΕΑ ονόματα καταγγελλόταν ως ανύπαρκτη στήλη —
      //     θόρυβος, που οδηγεί στο να αγνοηθεί ο φύλακας·
      //   · κάθε αναφορά στα ΠΑΛΙΑ περνούσε αθόρυβα — δηλαδή ακριβώς το
      //     σφάλμα που ο φύλακας υπάρχει για να πιάνει (42703: το PostgREST
      //     απορρίπτει ΟΛΟΚΛΗΡΟ το ερώτημα και η οθόνη δείχνει κενό).
      //
      // Η μετονομασία κρατά ό,τι ξέραμε για τη στήλη· αλλάζει μόνο το κλειδί.
      for (const c of stmt[2].matchAll(/rename\s+column\s+"?(\w+)"?\s+to\s+"?(\w+)"?/gi)) {
        const was = cols.get(c[1]);
        if (was === undefined) continue;
        cols.delete(c[1]);
        cols.set(c[2], was);
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // ΚΑΙ Ο ΣΒΗΣΜΕΝΟΣ ΠΙΝΑΚΑΣ ΦΕΥΓΕΙ ΑΠΟ ΤΟΝ ΧΑΡΤΗ
    //
    // Ο αναγνώστης ήξερε `drop column` και όχι `drop table`. Τρεις πίνακες
    // σβήστηκαν ρητά με μετανάστευση και ΕΜΕΙΝΑΝ στον χάρτη:
    //
    //   calendar_feeds   (20260821160000, ήταν διπλότυπο)
    //   push_devices     (20260822090000)
    //   messaging_prefs  (20260823100000)
    //
    // Δύο συνέπειες και οι δύο σιωπηλές:
    //
    //   · Η γεννήτρια τύπων έγραφε `CalendarFeedsRow` για πίνακα που δεν
    //     υπάρχει. Ενα `db.from('calendar_feeds')` περνούσε τον TypeScript
    //     και έσκαγε 42P01 στην εκτέλεση — δηλαδή στον χρήστη.
    //   · Ο guard-schema-drift διαβάζει ΤΟΝ ΙΔΙΟ χάρτη, οπότε άφηνε το ίδιο
    //     ερώτημα να περάσει: ο φύλακας που γράφτηκε για να πιάνει το 42P01
    //     ήταν τυφλός ακριβώς σε αυτό.
    //
    // Η διαγραφή γίνεται ΣΤΟ ΤΕΛΟΣ του αρχείου, μετά τα create/alter του και
    // ανά αρχείο κατά σειρά: έτσι ένας πίνακας που σβήνεται σήμερα και
    // ξαναγεννιέται αύριο επιστρέφει σωστά στον χάρτη.
    for (const m of sql.matchAll(/drop\s+table\s+(?:if\s+exists\s+)?(?:public\.)?"?(\w+)"?/gi))
      schema.delete(m[1]);
  }
  return schema;
}

/** Μόνο τα ονόματα: πίνακας → Set(στήλες). Ό,τι χρειάζεται ο φύλακας. */
export function readColumnNames() {
  const out = new Map();
  for (const [t, cols] of readSchema()) out.set(t, new Set(cols.keys()));
  return out;
}
