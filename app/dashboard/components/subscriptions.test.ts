// ═══════════════════════════════════════════════════════════════════════════
// Ο ΚΑΤΑΛΟΓΟΣ ΣΥΝΔΡΟΜΩΝ ΕΧΕΙ ΣΕΙΡΑ, ΚΑΙ Η ΣΕΙΡΑ ΕΛΕΓΧΕΤΑΙ
// ─────────────────────────────────────────────────────────────────────────
// ΓΙΑΤΙ ΥΠΑΡΧΕΙ. Η σειρά των υπηρεσιών και των πακέτων δεν είναι διακόσμηση:
// είναι το μόνο πράγμα που κάνει τον κατάλογο εικοσιδύο υπηρεσιών χρήσιμο. Και
// είναι ακριβώς το είδος κανόνα που σπάει σιωπηλά — αρκεί μία νέα γραμμή
// γραμμένη «στο τέλος γιατί εκεί την πρόσθεσα».
//
// ΤΙ ΚΡΑΤΑΕΙ:
//   1. Οι υπηρεσίες αλφαβητικά.
//   2. Οι βαθμίδες κάθε υπηρεσίας από τη φθηνότερη στην ακριβότερη.
//   3. Κάθε προπληρωμή ΑΜΕΣΩΣ κάτω από τη βαθμίδα της, κατά διάρκεια.
//   4. Καμία τιμή γραμμένη μέσα σε όνομα πακέτου.
//   5. Κάθε προπληρωμή δείχνει σε βαθμίδα που υπάρχει, με μηνιαία χρέωση.
//   6. Μοναδικά αναγνωριστικά — ένα διπλό `id` σημαίνει ρύθμιση που χάνεται.
// ═══════════════════════════════════════════════════════════════════════════
import { STREAMING, SPORTS, CLOUD } from './BillsInsurance';

let fails = 0;
const ok = (cond: boolean, msg: string) => {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.log(`  ✗ ${msg}`); fails++; }
};

const CATALOGS = [
  ['Ψυχαγωγία', STREAMING],
  ['Αθλητικά', SPORTS],
  ['Cloud', CLOUD],
] as const;

type Plan = { id: string; name: string; price?: number; upfront?: number; months?: number; tier?: string };
const monthly = (p: Plan) => p.price ?? (p.upfront && p.months ? p.upfront / p.months : 0);

const seen = new Set<string>();

for (const [name, catalog] of CATALOGS) {
  console.log(`\n${name} · ${catalog.length} υπηρεσίες`);

  const labels = catalog.map(s => s.label);
  const sorted = [...labels].sort((a, b) => a.localeCompare(b, 'el'));
  ok(labels.join('|') === sorted.join('|'), `αλφαβητικά: ${labels.join(', ')}`);

  for (const svc of catalog) {
    const plans = svc.plans as Plan[];

    // Κάθε πακέτο ξέρει τι κοστίζει, και το λέει σε δικό του πεδίο.
    for (const p of plans) {
      // Τιμή μέσα σε όνομα σημαίνει το ίδιο ποσό σε δύο σημεία — και ένα regex
      // που το κόβει πριν το δείξει ο επιλογέας. Ούτε νόμισμα ούτε υποδιαστολή.
      ok(!p.name.includes('€') && !/\d,\d/.test(p.name),
        `${svc.label} · «${p.name}» χωρίς τιμή μέσα στο όνομα`);
      ok(monthly(p) > 0, `${svc.label} · «${p.name}» έχει μηνιαίο κόστος`);
      ok(!seen.has(p.id), `μοναδικό αναγνωριστικό: ${p.id}`);
      seen.add(p.id);
    }

    // Η προπληρωμή δείχνει σε βαθμίδα που υπάρχει και χρεώνεται μηνιαία.
    for (const p of plans.filter(x => x.tier)) {
      const base = plans.find(x => x.id === p.tier);
      ok(!!base && base.price !== undefined, `${svc.label} · η «${p.name}» δένει με βαθμίδα μηνιαίας χρέωσης`);
      ok(p.upfront !== undefined && p.months !== undefined, `${svc.label} · η «${p.name}» δηλώνει εφάπαξ ποσό και μήνες`);
    }

    // Βαθμίδα πρώτα, διάρκεια μέσα της.
    const anchor = (p: Plan) => monthly(plans.find(x => x.id === p.tier) ?? p);
    const inOrder = plans.every((p, i) => {
      if (i === 0) return true;
      const q = plans[i - 1];
      return anchor(q) < anchor(p) || (anchor(q) === anchor(p) && (q.months ?? 1) <= (p.months ?? 1));
    });
    ok(inOrder, `${svc.label} · ${plans.map(p => p.name).join(' → ')}`);
  }
}

// Η τιμή του πλακιδίου: το φθηνότερο πακέτο με ΜΗΝΙΑΙΑ χρέωση, ποτέ προπληρωμή.
for (const [, catalog] of CATALOGS) {
  for (const svc of catalog) {
    const first = (svc.plans as Plan[])[0];
    ok(first.price !== undefined, `${svc.label} · η τιμή εισόδου είναι μηνιαία χρέωση («${first.name}»)`);
  }
}

console.log(`\nsubscriptions: ${fails === 0 ? '✓ όλα' : `✗ ${fails}`}`);
if (fails) process.exit(1);
