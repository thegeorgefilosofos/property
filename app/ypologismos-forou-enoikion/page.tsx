// ═══════════════════════════════════════════════════════════════════════════
// ΔΩΡΕΑΝ ΥΠΟΛΟΓΙΣΤΗΣ ΦΟΡΟΥ ΕΝΟΙΚΙΩΝ — η δημόσια σελίδα
// ─────────────────────────────────────────────────────────────────────────
// ΓΙΑΤΙ ΥΠΑΡΧΕΙ, ΩΣ ΑΠΟΦΑΣΗ ΠΡΟΪΟΝΤΟΣ
// Η δημόσια επιφάνεια του app ήταν: αρχική, σύνδεση, εγγραφή, νομικά. Δηλαδή
// κανένας λόγος να μας βρει κάποιος που δεν μας ξέρει ήδη. Ταυτόχρονα, μέσα στο
// lib/ υπάρχει σωστή και δοκιμασμένη ελληνική φορολογική λογική για το 2026 —
// το ακριβότερο κομμάτι του προϊόντος — κλειδωμένη πίσω από τη σύνδεση.
//
// Ο Έλληνας ιδιοκτήτης ψάχνει «πόσο φόρο θα πληρώσω για τα ενοίκια» ΠΡΙΝ ψάξει
// «εφαρμογή διαχείρισης ακινήτων». Αυτή η σελίδα απαντά σε εκείνη τη στιγμή,
// δωρεάν, χωρίς εγγραφή — και μόνο μετά προτείνει.
//
// ΚΟΣΤΟΣ: μηδέν. Στατική απόδοση, ο υπολογισμός γίνεται στη συσκευή, κανένα
// αίτημα σε βάση, κανένα AI, καμία εξωτερική υπηρεσία.
//
// Η σελίδα είναι Server Component (για SEO και ταχύτητα)· μόνο ο υπολογιστής
// είναι πελάτης. Οι εισαγωγές είναι από lib/ και components/tokens — ποτέ από
// module με 'use client', αλλιώς σπάει το SSR (βλ. components/tokens.ts).
// ═══════════════════════════════════════════════════════════════════════════
import BrandMark from '@/components/BrandMark';
import Link from 'next/link';
import type { Metadata } from 'next';
import { T } from '@/components/tokens';
import { RENTAL_TAX_ROWS_2026 } from '@/lib/billing/greekTax';
import { RentTaxCalculator } from './RentTaxCalculator';

const TITLE = 'Υπολογισμός φόρου ενοικίων 2026 — δωρεάν, χωρίς εγγραφή';
const DESC =
  'Υπολόγισε πόσο φόρο θα πληρώσεις για τα ενοίκιά σου με την κλίμακα του 2026 '
  + '(15% / 25% / 35% / 45%) και την τεκμαρτή έκπτωση 5%. Δωρεάν, χωρίς εγγραφή, '
  + 'ο υπολογισμός γίνεται στη συσκευή σου.';
const URL = 'https://propertyos.gr/ypologismos-forou-enoikion';

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

// Οι ερωτήσεις που κάνει πραγματικά ο ιδιοκτήτης, με απαντήσεις που στέκουν.
// Το ίδιο περιεχόμενο τροφοδοτεί και το δομημένο σχήμα παρακάτω — μία πηγή, ώστε
// να μη διαφωνήσουν ποτέ η σελίδα και ό,τι διαβάζει η μηχανή αναζήτησης.
const FAQ: { q: string; a: string }[] = [
  {
    q: 'Πώς φορολογούνται τα ενοίκια το 2026;',
    a: 'Με δική τους προοδευτική κλίμακα, ξεχωριστή από τους μισθούς: 15% έως 12.000 €, '
     + '25% από 12.000 έως 24.000 €, 35% από 24.000 έως 35.000 € και 45% πάνω από 35.000 €. '
     + 'Φορολογείται το πλάτος κάθε κλιμακίου, όχι όλο το εισόδημα με τον ανώτερο συντελεστή.',
  },
  {
    q: 'Τι είναι η έκπτωση 5%;',
    a: 'Ο νόμος αναγνωρίζει τεκμαρτή δαπάνη 5% επί του ακαθάριστου εισοδήματος από ακίνητα, '
     + 'χωρίς να χρειάζεται να προσκομίσεις δικαιολογητικά. Ο φόρος υπολογίζεται στο υπόλοιπο 95%.',
  },
  {
    q: 'Περιλαμβάνεται ο ΕΝΦΙΑ;',
    a: 'Όχι. Ο ΕΝΦΙΑ είναι φόρος κατοχής και υπολογίζεται χωριστά, με βάση την αντικειμενική '
     + 'αξία, τη ζώνη, τον όροφο και την παλαιότητα του ακινήτου. Δεν αφαιρείται από το '
     + 'εισόδημα από ενοίκια.',
  },
  {
    q: 'Ισχύει και για βραχυχρόνια μίσθωση;',
    a: 'Όχι απευθείας. Η βραχυχρόνια μίσθωση έχει επιπλέον υποχρεώσεις — τέλος ανθεκτικότητας '
     + 'ανά διανυκτέρευση και, σε ορισμένες περιπτώσεις, δημοτικό τέλος 0,5% — και μπορεί να '
     + 'θεωρηθεί επιχειρηματική δραστηριότητα ανάλογα με το πλήθος των ακινήτων και τις '
     + 'παρεχόμενες υπηρεσίες.',
  },
  {
    q: 'Τα δεδομένα μου αποθηκεύονται;',
    a: 'Όχι. Ο υπολογισμός γίνεται εξ ολοκλήρου στον browser σου. Κανένα ποσό δεν στέλνεται '
     + 'σε διακομιστή και δεν χρειάζεται ούτε email ούτε εγγραφή.',
  },
];

export default function Page() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        name: 'Υπολογισμός φόρου ενοικίων 2026',
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
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    ],
  };

  return (
    <div style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', minHeight: '100vh', fontFamily: T.font.sans }}>
      {/* Το δομημένο σχήμα δίνει στη Google τις ερωτήσεις/απαντήσεις αυτούσιες.
          Παράγεται από τον ΙΔΙΟ πίνακα FAQ που αποδίδεται παρακάτω, ώστε να μην
          μπορεί ποτέ να πει άλλα η σελίδα και άλλα το σχήμα. */}
      <script type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}/>

      <header style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 clamp(20px,5vw,40px)', height: 60,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <BrandMark />
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Property OS</span>
          </Link>
          <Link href="/signup" style={{ fontSize: 14, fontWeight: 650, color: 'var(--accent)', textDecoration: 'none' }}>
            Ξεκίνα δωρεάν
          </Link>
        </div>
      </header>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: 'clamp(28px,5vw,52px) clamp(20px,5vw,40px) 64px' }}>
        <h1 style={{ fontSize: 'clamp(25px,4vw,36px)', fontWeight: 800, letterSpacing: '-0.025em',
          lineHeight: 1.2, margin: '0 0 10px', textWrap: 'balance' }}>
          Πόσο φόρο θα πληρώσεις για τα ενοίκιά σου
        </h1>
        <p style={{ fontSize: 'clamp(14.5px,2vw,16.5px)', lineHeight: 1.65, color: 'var(--text-secondary)',
          margin: '0 0 6px', textWrap: 'balance' }}>
          Με την κλίμακα του 2026 και την τεκμαρτή έκπτωση 5%. Χωρίς εγγραφή, χωρίς email —
          ο υπολογισμός γίνεται στη συσκευή σου και δεν αποθηκεύεται πουθενά.
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '0 0 26px' }}>
          Ίδιοι υπολογισμοί με αυτούς που τρέχει το Property OS για τους ιδιοκτήτες του.
        </p>

        <RentTaxCalculator/>

        {/* ── Συχνές ερωτήσεις ─────────────────────────────────────────── */}
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
                <summary style={{ cursor: 'pointer', fontSize: 14, fontWeight: 650,
                  color: 'var(--text-primary)', listStyle: 'revert' }}>
                  {f.q}
                </summary>
                <p style={{ margin: '10px 0 2px', fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* ── Η κλίμακα ως κείμενο, για όποιον ήρθε μόνο γι' αυτήν ────────
            Οι αριθμοί έρχονται από το lib, όχι γραμμένοι ξανά εδώ: αν αλλάξει ο
            νόμος, αλλάζει ένα σημείο και ενημερώνονται μαζί ο πίνακας ελέγχου
            και αυτή η σελίδα. */}
        <section style={{ marginTop: 36 }}>
          <h2 style={{ fontSize: 'clamp(18px,2.6vw,22px)', fontWeight: 700, letterSpacing: '-0.015em', margin: '0 0 12px' }}>
            Κλίμακα φόρου ενοικίων 2026
          </h2>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.9, color: 'var(--text-secondary)' }}>
            {RENTAL_TAX_ROWS_2026.map(r => (
              <li key={r.range}>
                <strong style={{ color: 'var(--text-primary)' }}>{r.range}</strong> — {r.rate}
              </li>
            ))}
          </ul>
          <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-tertiary)', margin: '14px 0 0' }}>
            Η κλίμακα είναι προοδευτική: κάθε κλιμάκιο φορολογείται με τον δικό του
            συντελεστή. Ένα εισόδημα 20.000 € δεν φορολογείται όλο με 25% — τα πρώτα
            12.000 € με 15% και μόνο τα υπόλοιπα με 25%.
          </p>
        </section>

        <footer style={{ marginTop: 44, paddingTop: 20, borderTop: '1px solid var(--border-subtle)',
          display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13 }}>
          <Link href="/" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Αρχική</Link>
          <Link href="/trust" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Ποιοι είμαστε</Link>
          <Link href="/privacy" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Απόρρητο</Link>
        </footer>
      </main>
    </div>
  );
}
