// ═══════════════════════════════════════════════════════════════════════════
// ΔΩΡΕΑΝ ΥΠΟΛΟΓΙΣΤΗΣ ΕΝΦΙΑ — η δημόσια σελίδα
// ─────────────────────────────────────────────────────────────────────────
// Δεύτερο δωρεάν εργαλείο, ίδια λογική με τον υπολογιστή φόρου ενοικίων: το
// lib/billing/enfia.ts περιέχει ήδη τον πλήρη υπολογισμό με νομική παραπομπή ανά
// συντελεστή (ζώνη, όροφος, παλαιότητα, μειώσεις, προσαύξηση, Ενότητα Γ). Ήταν
// κλειδωμένο πίσω από τη σύνδεση.
//
// Ο ΕΝΦΙΑ είναι η ερώτηση που κάνει ΚΑΘΕ Έλληνας ιδιοκτήτης, κάθε χρόνο, και
// συνήθως πανικόβλητος λίγο πριν τη λήξη της δόσης. Είναι η στιγμή που έχει
// μεγαλύτερη ανάγκη ένα εργαλείο οργάνωσης — και η στιγμή που δεν μας ξέρει.
//
// Κόστος λειτουργίας: μηδέν. Υπολογισμός στη συσκευή, καμία εγγραφή.
// ═══════════════════════════════════════════════════════════════════════════
import Link from 'next/link';
import type { Metadata } from 'next';
import { T } from '@/components/tokens';
import { EnfiaCalculator } from './EnfiaCalculator';

const TITLE = 'Υπολογισμός ΕΝΦΙΑ 2026 — δωρεάν, χωρίς εγγραφή';
const DESC =
  'Υπολόγισε τον ΕΝΦΙΑ του ακινήτου σου από τα τετραγωνικά, την τιμή ζώνης, τον όροφο '
  + 'και την παλαιότητα. Δωρεάν, χωρίς εγγραφή, ο υπολογισμός γίνεται στη συσκευή σου.';
const URL = 'https://propertyos.gr/ypologismos-enfia';

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: URL },
  openGraph: {
    title: TITLE, description: DESC, url: URL,
    siteName: 'Property OS', locale: 'el_GR', type: 'website',
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESC },
};

const FAQ: { q: string; a: string }[] = [
  {
    q: 'Πώς υπολογίζεται ο ΕΝΦΙΑ;',
    a: 'Ο κύριος φόρος κτίσματος προκύπτει από τα τετραγωνικά επί τον βασικό φόρο της ζώνης, '
     + 'πολλαπλασιασμένο με τον συντελεστή ορόφου και τον συντελεστή παλαιότητας, και επί το '
     + 'ποσοστό ιδιοκτησίας σου. Πάνω σε αυτό εφαρμόζονται μειώσεις ανάλογα με τη συνολική αξία '
     + 'της ακίνητης περιουσίας, και προσαύξηση αν αυτή ξεπερνά τις 500.000 €.',
  },
  {
    q: 'Πού βρίσκω την τιμή ζώνης;',
    a: 'Στο συμβόλαιο του ακινήτου, στη δήλωση Ε9, ή στον χάρτη αντικειμενικών αξιών της ΑΑΔΕ. '
     + 'Είναι η τιμή σε ευρώ ανά τετραγωνικό μέτρο για την περιοχή του ακινήτου.',
  },
  {
    q: 'Γιατί τα νεότερα κτίρια πληρώνουν περισσότερο;',
    a: 'Ο συντελεστής παλαιότητας μειώνεται όσο περνούν τα χρόνια: κτίσμα έως 4 ετών έχει '
     + 'συντελεστή 1,25 ενώ κτίσμα 26 ετών και άνω έχει 1,00. Ένα καινούργιο διαμέρισμα '
     + 'πληρώνει έτσι έως 25% περισσότερο από ένα παλιό ίδιων τετραγωνικών και ζώνης.',
  },
  {
    q: 'Υπάρχουν απαλλαγές;',
    a: 'Ναι, με κριτήρια: μείωση 50% για χαμηλό εισόδημα σε κύρια κατοικία, 100% απαλλαγή για '
     + 'τρίτεκνους, πολύτεκνους και αναπηρία άνω του 80% υπό εισοδηματικά και περιουσιακά όρια, '
     + 'και έκπτωση 20% για ασφαλισμένη κατοικία. Ο υπολογιστής δεν τις εφαρμόζει, γιατί '
     + 'εξαρτώνται από στοιχεία που δεν του δίνεις.',
  },
  {
    q: 'Το ποσό είναι ακριβώς αυτό που θα πληρώσω;',
    a: 'Όχι. Είναι εκτίμηση για ένα κτίσμα, με τη συνολική περιουσία να θεωρείται ίση με αυτό. '
     + 'Αν έχεις κι άλλα ακίνητα, οικόπεδα ή αποθήκες, αλλάζουν τόσο η μείωση όσο και η '
     + 'προσαύξηση. Το επίσημο ποσό βγαίνει από το εκκαθαριστικό της ΑΑΔΕ.',
  },
];

export default function Page() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        name: 'Υπολογισμός ΕΝΦΙΑ 2026',
        url: URL,
        applicationCategory: 'FinanceApplication',
        operatingSystem: 'Web',
        inLanguage: 'el',
        description: DESC,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      },
      {
        '@type': 'FAQPage',
        mainEntity: FAQ.map(f => ({
          '@type': 'Question', name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    ],
  };

  return (
    <div style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', minHeight: '100vh', fontFamily: T.font.sans }}>
      <script type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}/>

      <header style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 clamp(20px,5vw,40px)', height: 60,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--accent)', color: 'var(--on-tone)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14 }}>P</div>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Property OS</span>
          </Link>
          <Link href="/signup" style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--accent)', textDecoration: 'none' }}>
            Ξεκίνα δωρεάν
          </Link>
        </div>
      </header>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: 'clamp(28px,5vw,52px) clamp(20px,5vw,40px) 64px' }}>
        <h1 style={{ fontSize: 'clamp(25px,4vw,36px)', fontWeight: 800, letterSpacing: '-0.025em',
          lineHeight: 1.2, margin: '0 0 10px', textWrap: 'balance' }}>
          Πόσο ΕΝΦΙΑ θα πληρώσεις φέτος
        </h1>
        <p style={{ fontSize: 'clamp(14.5px,2vw,16.5px)', lineHeight: 1.65, color: 'var(--text-secondary)',
          margin: '0 0 6px', textWrap: 'balance' }}>
          Από τα τετραγωνικά, την τιμή ζώνης, τον όροφο και την παλαιότητα. Χωρίς εγγραφή —
          ο υπολογισμός γίνεται στη συσκευή σου και δεν αποθηκεύεται πουθενά.
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '0 0 26px' }}>
          Ίδιοι υπολογισμοί με αυτούς που τρέχει το Property OS για τους ιδιοκτήτες του.
        </p>

        <EnfiaCalculator/>

        <section style={{ marginTop: 44 }}>
          <h2 style={{ fontSize: 'clamp(18px,2.6vw,22px)', fontWeight: 700, letterSpacing: '-0.015em', margin: '0 0 16px' }}>
            Συχνές ερωτήσεις
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {FAQ.map(f => (
              <details key={f.q} style={{
                borderRadius: T.radius.inner, border: '1px solid var(--border-subtle)',
                background: 'var(--bg-surface)', padding: '12px 16px',
              }}>
                <summary style={{ cursor: 'pointer', fontSize: 14.5, fontWeight: 650,
                  color: 'var(--text-primary)', listStyle: 'revert' }}>
                  {f.q}
                </summary>
                <p style={{ margin: '10px 0 2px', fontSize: 13.5, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        <section style={{ marginTop: 36 }}>
          <h2 style={{ fontSize: 'clamp(18px,2.6vw,22px)', fontWeight: 700, letterSpacing: '-0.015em', margin: '0 0 12px' }}>
            Και ο φόρος των ενοικίων;
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.75, color: 'var(--text-secondary)', margin: 0 }}>
            Ο ΕΝΦΙΑ είναι φόρος <strong>κατοχής</strong> και δεν αφαιρείται από το εισόδημα των
            ενοικίων. Αν νοικιάζεις το ακίνητο, δες και τον{' '}
            <Link href="/ypologismos-forou-enoikion" style={{ color: 'var(--accent)' }}>
              δωρεάν υπολογισμό φόρου ενοικίων
            </Link>.
          </p>
        </section>

        <footer style={{ marginTop: 44, paddingTop: 20, borderTop: '1px solid var(--border-subtle)',
          display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12.5 }}>
          <Link href="/" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Αρχική</Link>
          <Link href="/trust" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Ποιοι είμαστε</Link>
          <Link href="/privacy" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Απόρρητο</Link>
        </footer>
      </main>
    </div>
  );
}
