// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΚΕΛΥΦΟΣ ΤΩΝ ΔΗΜΟΣΙΩΝ ΣΕΛΙΔΩΝ — ΚΕΦΑΛΙΔΑ, ΥΠΟΣΕΛΙΔΟ, ΚΕΦΑΛΙΔΑ ΕΝΟΤΗΤΑΣ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΠΡΟΒΛΗΜΑ ΠΟΥ ΛΥΝΕΙ. Εκτός από την αρχική, το προϊόν έχει τέσσερις ακόμη
// σελίδες που βλέπει κάποιος πριν συνδεθεί: τον υπολογιστή φόρου, το «Ποιοι
// είμαστε», την Πολιτική απορρήτου και τους Όρους χρήσης. Καθεμία έστηνε τη
// δική της κεφαλίδα και το δικό της υποσέλιδο, με το χέρι:
//
//   · τρία διαφορετικά μέτρα (760, 780, 860) — δηλαδή το λογότυπο ξεκινούσε
//     από άλλο σημείο σε κάθε σελίδα, και ο επισκέπτης που πηγαίνει από τη μία
//     στην άλλη βλέπει το κεφάλι της σελίδας να «χοροπηδά»
//   · τρεις εκδοχές κουμπιού: μια κανονική, μια γυμνός σύνδεσμος σε μπλε, μια
//     καθόλου
//   · τέσσερα υποσέλιδα: ένα πλήρες, ένα με τρεις γυμνούς συνδέσμους, ένα με
//     τέσσερις, και ένα ανύπαρκτο
//
// Ο επισκέπτης που έρχεται από αναζήτηση προσγειώνεται σε ΜΙΑ από αυτές — και
// συνήθως όχι στην αρχική. Αν η σελίδα προσγείωσης δεν μοιάζει με το προϊόν
// που του προτείνει, το πρώτο πράγμα που μαθαίνει είναι ότι δεν προσέχουμε.
//
// ΤΙ ΔΕΝ ΚΑΝΕΙ. Δεν αφορά την αρχική σελίδα: εκείνη έχει δική της πλοήγηση με
// σύνδεση, κατάσταση χρήστη και συμπεριφορά στο κύλισμα. Ένα κέλυφος που θα
// κάλυπτε και τις πέντε θα ήταν παραμετροποιημένο σε βαθμό που δεν διαβάζεται.
// ═══════════════════════════════════════════════════════════════════════════
import BrandMark from '@/components/BrandMark';
import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * ΕΝΑ ΜΕΤΡΟ ΓΙΑ ΟΛΕΣ ΤΙΣ ΔΗΜΟΣΙΕΣ ΣΕΛΙΔΕΣ — ΤΟ ΙΔΙΟ ΜΕ ΤΗΣ ΑΡΧΙΚΗΣ.
 *
 * Είναι κατά λέξη το δοχείο της αρχικής (1140 με περιθώριο ως 48, δηλαδή 1044
 * ωφέλιμα). Οποιοδήποτε άλλο νούμερο εδώ σημαίνει ότι το λογότυπο μετακινείται
 * τη στιγμή που ο επισκέπτης πατά «Όροι χρήσης» — η ακριβώς ίδια ασυνέπεια που
 * λύνει αυτό το αρχείο, μόνο που θα την είχαμε γράψει εμείς.
 */
export const WRAP = {
  maxWidth: 1140,
  margin: '0 auto',
  padding: '0 clamp(20px, 5vw, 48px)',
} as const;

/** Το οριζόντιο περιθώριο του WRAP, για όποιον χτίζει δικό του padding. */
export const WRAP_PAD = 'clamp(20px, 5vw, 48px)';

/**
 * Το μέτρο του τρεχούμενου κειμένου, όπου δεν το ορίζει ήδη η στήλη.
 *
 * ΓΙΑΤΙ ΣΤΕΝΟΤΕΡΟ ΑΠΟ ΤΗ ΣΕΛΙΔΑ: μια παράγραφος 15 εικονοστοιχείων σε πλάτος
 * 1044 βγάζει γραμμές των εκατόν τριάντα ενός χαρακτήρων. Το μάτι χάνει τη
 * σειρά του γυρίζοντας αριστερά, και σε νομικό κείμενο αυτό δεν είναι αισθητικό
 * θέμα: είναι ο λόγος που κανείς δεν διαβάζει τους όρους. Στις νομικές σελίδες
 * το μέτρο το δίνει η ίδια η στήλη κειμένου (712 εικονοστοιχεία), οπότε εκεί
 * δεν χρειάζεται δεύτερο όριο από πάνω.
 */
export const READING = 720;

export function PublicHeader() {
  return (
    <header style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
      <div style={{ ...WRAP, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <Link href="/" className="lp-link" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'var(--text-primary)' }}>
          <BrandMark />
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em' }}>Property OS</span>
        </Link>
        <Link href="/signup" className="lp-cta lp-primary" style={{ textDecoration: 'none', fontSize: 14, fontWeight: 700, padding: '9px 16px', borderRadius: 100, whiteSpace: 'nowrap' }}>
          Ξεκίνα τη δοκιμή
        </Link>
      </div>
    </header>
  );
}

/** Μία στήλη συνδέσμων. Ίδια γεωμετρία σε κάθε δημόσια σελίδα. */
function FootCol({ label, links }: { label: string; links: [string, string][] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>{label}</span>
      {links.map(([href, text]) => (
        <Link key={href} href={href} className="lp-link" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 14, lineHeight: 1.3 }}>{text}</Link>
      ))}
    </div>
  );
}

export function PublicFooter() {
  return (
    <footer style={{ borderTop: '1px solid var(--border-subtle)' }}>
      <div style={{ ...WRAP, padding: `clamp(36px,5vw,56px) ${WRAP_PAD} clamp(24px,3vw,32px)` }}>
        <div className="lp-foot">
          <div>
            <Link href="/" className="lp-link" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, textDecoration: 'none', color: 'var(--text-primary)', width: 'fit-content' }}>
              <BrandMark size={26} />
              <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em' }}>Property OS</span>
            </Link>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0, maxWidth: 300 }}>
              Το λειτουργικό σύστημα του ελληνικού ακινήτου. Για ιδιοκτήτες και επαγγελματίες στην Ελλάδα.
            </p>
          </div>
          {/* ΤΡΕΙΣ ΣΤΗΛΕΣ ΤΩΝ ΤΡΙΩΝ. Η μεσαία είχε δύο συνδέσμους και έμοιαζε
              κολοβή δίπλα στις άλλες· έλειπε όμως και ο υπολογιστής ΕΝΦΙΑ, που
              υπάρχει, σερβίρεται και δεν τον έδειχνε καμία σελίδα. */}
          <FootCol label="Προϊόν" links={[['/', 'Αρχική'], ['/signup', 'Ξεκίνα τη δοκιμή'], ['/login', 'Σύνδεση']]} />
          <FootCol label="Εργαλεία" links={[['/ypologismos-forou-enoikion', 'Φόρος ενοικίων'], ['/ypologismos-enfia', 'ΕΝΦΙΑ'], ['/#faq', 'Συχνές ερωτήσεις']]} />
          <FootCol label="Εμπιστοσύνη" links={[['/trust', 'Ποιοι είμαστε'], ['/privacy', 'Απόρρητο'], ['/terms', 'Όροι χρήσης']]} />
        </div>
        <div style={{ marginTop: 'clamp(32px,4vw,48px)', paddingTop: 18, borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-tertiary)' }}>
          <span>© {new Date().getFullYear()} Property OS</span>
          <span>Βάση δεδομένων στην ΕΕ · Σχεδιασμένο για GDPR</span>
        </div>
      </div>
    </footer>
  );
}

/** Κεφαλίδα ενότητας: ετικέτα με κουκκίδα και τίτλος, όπως στην αρχική. */
export function SectionHead({ over, title, sub }: { over: string; title: string; sub?: ReactNode }) {
  return (
    <div style={{ marginBottom: 'clamp(18px,2.4vw,26px)' }}>
      <div className="lp-eyebrow">{over}</div>
      <h2 style={{ fontSize: 'clamp(21px,3vw,28px)', fontWeight: 680, letterSpacing: '-0.03em', lineHeight: 1.15, margin: 0, textWrap: 'balance' }}>{title}</h2>
      {sub && <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '10px 0 0', maxWidth: READING }}>{sub}</p>}
    </div>
  );
}
