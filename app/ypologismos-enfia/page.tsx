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
import { PublicHeader, PublicFooter, SectionHead, WRAP, WRAP_PAD } from '../PublicChrome';
import { BackLink } from '../BackLink';
import { EnfiaCalculator } from './EnfiaCalculator';

const TITLE = 'Υπολογισμός ΕΝΦΙΑ 2026 · δωρεάν, χωρίς εγγραφή';
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

      <PublicHeader />

      <main style={{ ...WRAP, padding: `clamp(28px,4vw,44px) ${WRAP_PAD} clamp(56px,7vw,88px)` }}>
        <BackLink />
        <div className="lp-eyebrow">Δωρεάν εργαλείο</div>
        <h1 style={{ fontSize: 'clamp(28px,4.4vw,42px)', fontWeight: 680, letterSpacing: '-0.035em',
          lineHeight: 1.1, margin: '0 0 14px', textWrap: 'balance' }}>
          Πόσο ΕΝΦΙΑ θα πληρώσεις φέτος
        </h1>
        {/* Ίδια δομή με τον υπολογιστή φόρου ενοικίων: η σημείωση πάει ΔΕΞΙΑ της
            εισαγωγής, στην ίδια γραμμή βάσης, ώστε η σειρά να κλείνει πέρα ως
            πέρα αντί να αφήνει τριακόσια εικονοστοιχεία λευκά. */}
        <div className="lg-lede" style={{ marginBottom: 'clamp(26px,3.5vw,36px)' }}>
          <p style={{ fontSize: 'clamp(15px,2vw,17px)', lineHeight: 1.6, color: 'var(--text-secondary)', margin: 0 }}>
            Από τα τετραγωνικά, την τιμή ζώνης, τον όροφο και την παλαιότητα. Χωρίς εγγραφή και χωρίς email:
            ο υπολογισμός γίνεται στη συσκευή σου και δεν αποθηκεύεται πουθενά.
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.55 }}>
            Ίδιοι υπολογισμοί με αυτούς που τρέχει το Property OS για τους ιδιοκτήτες του.
          </p>
        </div>

        <EnfiaCalculator/>

        {/* ── Συχνές ερωτήσεις ──────────────────────────────────────────────
               ΗΤΑΝ ΠΕΝΤΕ ΚΟΥΤΙΑ ΜΕ ΠΕΡΙΓΡΑΜΜΑ ΚΑΙ ΤΟ ΒΕΛΑΚΙ ΤΟΥ ΠΕΡΙΗΓΗΤΗ, ενώ ο
               αδελφός υπολογιστής δίπλα λύνει το ίδιο πρόβλημα με λεπτές γραμμές
               και έναν σταυρό που γυρίζει. Δύο εργαλεία της ίδιας σελίδας δεν
               επιτρέπεται να έχουν δύο διαφορετικά σχήματα για την ίδια λίστα. */}
        <section style={{ marginTop: 'clamp(44px,6vw,72px)' }}>
          <SectionHead over="Συχνές ερωτήσεις" title="Ό,τι ρωτούν πριν υπολογίσουν" />
          <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            {FAQ.map(f => (
              <details key={f.q} className="lp-faq" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <summary style={{ cursor: 'pointer', listStyle: 'none', padding: '17px 0', fontSize: 15,
                  fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                  {f.q}
                  <span className="lp-plus" style={{ color: 'var(--accent)', fontSize: 20, fontWeight: 450,
                    lineHeight: 1, transition: 'transform .2s', flexShrink: 0 }}>+</span>
                </summary>
                <p style={{ margin: '0 0 18px', fontSize: 15, lineHeight: 1.65, color: 'var(--text-secondary)' }}>
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* Ο ΔΕΥΤΕΡΟΣ ΥΠΟΛΟΓΙΣΤΗΣ ΕΙΝΑΙ ΤΟ ΕΠΟΜΕΝΟ ΒΗΜΑ, ΟΧΙ ΥΠΟΣΗΜΕΙΩΣΗ. Ο
            ιδιοκτήτης που μόλις βρήκε τον ΕΝΦΙΑ του και νοικιάζει το ακίνητο
            έχει ακριβώς μία ακόμη ερώτηση. */}
        <section style={{ marginTop: 'clamp(40px,5vw,60px)' }}>
          <SectionHead over="Και μετά" title="Ο φόρος των ενοικίων υπολογίζεται χωριστά" />
          <p style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--text-secondary)', margin: 0, maxWidth: 720 }}>
            Ο ΕΝΦΙΑ είναι φόρος <strong style={{ color: 'var(--text-primary)' }}>κατοχής</strong> και δεν
            αφαιρείται από το εισόδημα των ενοικίων: τα δύο ποσά αθροίζονται, δεν αλληλοεξουδετερώνονται. Αν
            νοικιάζεις το ακίνητο, δες και τον{' '}
            <Link href="/ypologismos-forou-enoikion" className="lp-link" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
              δωρεάν υπολογισμό φόρου ενοικίων
            </Link>.
          </p>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
