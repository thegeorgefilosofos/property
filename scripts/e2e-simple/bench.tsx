// ═══════════════════════════════════════════════════════════════════════════
// Ο ΠΑΓΚΟΣ ΤΗΣ ΑΠΛΟΤΗΤΑΣ: ΠΟΣΑ ΚΟΥΤΙΑ ΒΛΕΠΕΙ ΠΡΑΓΜΑΤΙΚΑ Ο ΧΡΗΣΤΗΣ
// ─────────────────────────────────────────────────────────────────────────
// Η βαθμολογία της απλότητας γραφόταν με το μάτι: «πολλά πεδία», «πολλά
// βήματα». Ενας αριθμός που δεν μετριέται δεν πέφτει ποτέ, γιατί κανείς δεν
// ξέρει πότε έπεσε.
//
// Εδώ αποδίδεται ο ΑΛΗΘΙΝΟΣ οδηγός ακινήτου, με ολόκληρο το globals.css, σε
// έξι περιπτώσεις χρήστη. Ο έλεγχος μετρά τα ΟΡΑΤΑ χειριστήρια — όχι όσα
// υπάρχουν στο DOM, όσα βλέπει ο άνθρωπος πριν πατήσει «Περισσότερα».
//
// Κάθε περίπτωση ζει σε δικό της τμήμα με λαβή `data-s`, ώστε ο έλεγχος να μη
// χρειάζεται να διαβάζει ελληνικές ετικέτες που αλλάζουν.
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import AddPropertyWizard from '@/app/dashboard/components/AddPropertyWizard';
import { writeStatus, type PropertyStatus } from '@/lib/property/status';

/**
 * Ενα ακίνητο όπως θα ερχόταν από τη βάση, στην κατάσταση που θέλει η δοκιμή.
 *
 * Ο οδηγός ανοίγει σε ΕΠΕΞΕΡΓΑΣΙΑ και όχι σε δημιουργία, γιατί έτσι η
 * κατάσταση («μακροχρόνια», «οικόπεδο») είναι δεδομένη από την πρώτη απόδοση:
 * σε δημιουργία θα έπρεπε ο έλεγχος να πατήσει το πρώτο βήμα και θα μετρούσε
 * το πάτημα αντί για τη φόρμα.
 */
const propertyIn = (status: PropertyStatus, extra: Record<string, unknown> = {}) => ({
  id: 'p1', name: 'Δοκιμή', prop_type: 'apartment',
  // ΟΙ ΔΥΟ ΣΤΗΛΕΣ ΓΡΑΦΟΝΤΑΙ ΑΠΟ ΤΗ `writeStatus`, ΟΧΙ ΜΕ ΤΟ ΧΕΡΙ. Η πρώτη
  // γραφή έβαζε `status_detail: 'rent_long'` — τιμή που η `readStatus` δεν
  // αναγνωρίζει, οπότε ΚΑΙ ΟΙ ΕΞΙ περιπτώσεις διαβάζονταν ως «κενό» και ο
  // έλεγχος τύπωνε έξι φορές το ίδιο νούμερο, πράσινο. Ενας πάγκος που στήνει
  // μόνος του την κατάσταση με το χέρι μετρά τη δική του φαντασία.
  ...writeStatus(status),
  ...extra,
});

const CASES = [
  { k: 'vacant', label: 'Κενό διαμέρισμα', p: propertyIn('vacant') },
  { k: 'long', label: 'Μακροχρόνια μίσθωση', p: propertyIn('rent_long') },
  { k: 'short', label: 'Βραχυχρόνια μίσθωση', p: propertyIn('rent_short') },
  { k: 'own', label: 'Ιδιοχρησία', p: propertyIn('own_use') },
  { k: 'land', label: 'Οικόπεδο', p: propertyIn('vacant', { prop_type: 'land' }) },
  { k: 'shared', label: 'Συνιδιοκτησία 50%', p: propertyIn('rent_long', { ownership: 50 }) },
] as const;

function Bench() {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="app-shell"><main className="app-main"><div className="app-content" style={{ padding: 24, display: 'grid', gap: 12, maxWidth: 720 }}>
      <h1>Πάγκος απλότητας</h1>
      {CASES.map(c => (
        <section key={c.k} data-s={c.k}>
          <button data-s-open={c.k} onClick={() => setOpen(c.k)}>{c.label}</button>
        </section>
      ))}
      {open && (
        <AddPropertyWizard
          userId="u1"
          existing={CASES.find(c => c.k === open)!.p as never}
          onClose={() => setOpen(null)}
          onSaved={() => setOpen(null)}
        />
      )}
    </div></main></div>
  );
}

createRoot(document.body.appendChild(document.createElement('div'))).render(<Bench />);
