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
import { RentTaxCalculator } from './RentTaxCalculator';

const TITLE = 'Υπολογισμός φόρου ενοικίων 2026 · δωρεάν, χωρίς εγγραφή';
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
    a: 'Όχι απευθείας. Η βραχυχρόνια μίσθωση έχει επιπλέον υποχρεώσεις: τέλος ανθεκτικότητας '
     + 'ανά διανυκτέρευση και, σε ορισμένες περιπτώσεις, δημοτικό τέλος 0,5%, και μπορεί να '
     + 'θεωρηθεί επιχειρηματική δραστηριότητα ανάλογα με το πλήθος των ακινήτων και τις '
     + 'παρεχόμενες υπηρεσίες.',
  },
  {
    q: 'Τα δεδομένα μου αποθηκεύονται;',
    a: 'Όχι. Ο υπολογισμός γίνεται εξ ολοκλήρου στον browser σου. Κανένα ποσό δεν στέλνεται '
     + 'σε διακομιστή και δεν χρειάζεται ούτε email ούτε εγγραφή.',
  },
];

// ΕΝΑ ΜΕΤΡΟ ΓΙΑ ΟΛΗ ΤΗ ΣΕΛΙΔΑ. Κεφαλίδα, κείμενο και υποσέλιδο ξεκινούν από
// τον ίδιο άξονα, με τον ίδιο αέρα στα πλάγια. Οι 860 είναι πιο σφιχτές από τις
// 1044 της αρχικής επειδή αυτή η σελίδα είναι ΕΡΓΑΛΕΙΟ: δύο πεδία και ένας
// πίνακας θέλουν συγκέντρωση, όχι έκταση.
const WRAP = { maxWidth: 860, margin: '0 auto', padding: '0 clamp(20px,5vw,40px)' } as const;

/** Κεφαλίδα ενότητας, στο σχήμα της αρχικής: ετικέτα με κουκκίδα και τίτλος. */
function SectionHead({ over, title }: { over: string; title: string }) {
  return (
    <div style={{ marginBottom: 'clamp(18px,2.4vw,26px)' }}>
      <div className="lp-eyebrow">{over}</div>
      <h2 style={{ fontSize: 'clamp(21px,3vw,28px)', fontWeight: 680, letterSpacing: '-0.03em',
        lineHeight: 1.15, margin: 0, textWrap: 'balance' }}>{title}</h2>
    </div>
  );
}

/** Μία στήλη συνδέσμων του υποσελίδου. Ίδια γεωμετρία και στις δύο. */
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

      {/* ΤΟ ΙΔΙΟ ΚΕΦΑΛΙ ΜΕ ΤΗΝ ΑΡΧΙΚΗ. Ήταν γυμνός σύνδεσμος σε χρώμα έμφασης
          δίπλα σε λογότυπο: ο επισκέπτης που έρχεται εδώ από αναζήτηση έβλεπε
          μια σελίδα που δεν έμοιαζε με το προϊόν που του προτείνει. Ίδιο ύψος,
          ίδιο κουμπί, ίδια συμπεριφορά — μία μάρκα, όχι δύο. */}
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

      {/* ΤΡΙΑ ΜΕΤΡΑ ΣΕ ΜΙΑ ΣΕΛΙΔΑ: η κεφαλίδα κρατούσε 860, το κυρίως 760 και
          το υποσέλιδο ακολουθούσε το δεύτερο. Το λογότυπο δηλαδή ξεκινούσε
          πενήντα εικονοστοιχεία αριστερότερα από τον τίτλο, σε κάθε οθόνη.
          Ένα μέτρο, και κάθε γραμμή της σελίδας ξεκινά από τον ίδιο άξονα. */}
      <main style={{ ...WRAP, padding: `clamp(36px,5vw,64px) ${WRAP.padding.split(' ')[1]} clamp(56px,7vw,88px)` }}>
        <div className="lp-eyebrow">Δωρεάν εργαλείο</div>
        <h1 style={{ fontSize: 'clamp(28px,4.4vw,42px)', fontWeight: 680, letterSpacing: '-0.035em',
          lineHeight: 1.1, margin: '0 0 14px', textWrap: 'balance' }}>
          Πόσο φόρο θα πληρώσεις για τα ενοίκιά σου
        </h1>
        {/* ΤΟ ΜΕΤΡΟ ΤΗΣ ΕΙΣΑΓΩΓΗΣ ΕΙΝΑΙ ΣΤΕΝΟΤΕΡΟ ΑΠΟ ΤΗΣ ΣΕΛΙΔΑΣ, ΣΚΟΠΙΜΑ:
            μια παράγραφος 16 εικονοστοιχείων σε πλάτος 860 βγάζει γραμμές των
            εκατόν είκοσι χαρακτήρων, όπου το μάτι χάνει τη σειρά του γυρίζοντας. */}
        <p style={{ fontSize: 'clamp(15px,2vw,17px)', lineHeight: 1.6, color: 'var(--text-secondary)',
          margin: '0 0 10px', maxWidth: 620 }}>
          Με την κλίμακα του 2026 και την τεκμαρτή έκπτωση 5%. Χωρίς εγγραφή και χωρίς email:
          ο υπολογισμός γίνεται στη συσκευή σου και δεν αποθηκεύεται πουθενά.
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: '0 0 clamp(26px,3.5vw,36px)', maxWidth: 620 }}>
          Ίδιοι υπολογισμοί με αυτούς που τρέχει το Property OS για τους ιδιοκτήτες του.
        </p>

        <RentTaxCalculator/>

        {/* ── Συχνές ερωτήσεις ──────────────────────────────────────────────
               ΗΤΑΝ ΠΕΝΤΕ ΚΟΥΤΙΑ ΜΕ ΠΕΡΙΓΡΑΜΜΑ ΚΑΙ ΤΟ ΒΕΛΑΚΙ ΤΟΥ ΠΕΡΙΗΓΗΤΗ. Η
               αρχική σελίδα λύνει το ίδιο πρόβλημα με λεπτές γραμμές και έναν
               σταυρό που γυρίζει: πέντε πλαίσια το ένα κάτω από το άλλο
               διαβάζονται ως πέντε αντικείμενα, ενώ είναι μία λίστα. Ίδιο
               σχήμα, ίδια συμπεριφορά, ίδιο περιθώριο. */}
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

      </main>

      {/* ΗΤΑΝ ΤΡΕΙΣ ΓΥΜΝΟΙ ΣΥΝΔΕΣΜΟΙ ΣΕ ΜΙΑ ΣΕΙΡΑ. Η αρχική έχει ταυτότητα και
          ομάδες με ετικέτα· εδώ ο επισκέπτης έφτανε στο τέλος μιας σελίδας που
          του πρότεινε συνδρομή και δεν είχε πού να δει ποιοι είμαστε. Ίδιο
          σχήμα με το υποσέλιδο της αρχικής, στο μέτρο αυτής της σελίδας. */}
      <footer style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <div style={{ ...WRAP, padding: `clamp(36px,5vw,56px) ${WRAP.padding.split(' ')[1]} clamp(24px,3vw,32px)` }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr', gap: 'clamp(24px,4vw,48px)', alignItems: 'start' }}>
            <div>
              <Link href="/" className="lp-link" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, textDecoration: 'none', color: 'var(--text-primary)', width: 'fit-content' }}>
                <BrandMark size={26} />
                <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em' }}>Property OS</span>
              </Link>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0, maxWidth: 300 }}>
                Το λειτουργικό σύστημα του ελληνικού ακινήτου. Για ιδιοκτήτες και επαγγελματίες στην Ελλάδα.
              </p>
            </div>
            <FootCol label="Προϊόν" links={[['/', 'Αρχική'], ['/signup', 'Ξεκίνα τη δοκιμή'], ['/login', 'Σύνδεση']]} />
            <FootCol label="Εμπιστοσύνη" links={[['/trust', 'Ποιοι είμαστε'], ['/privacy', 'Απόρρητο'], ['/terms', 'Όροι χρήσης']]} />
          </div>
          <div style={{ marginTop: 'clamp(28px,4vw,40px)', paddingTop: 18, borderTop: '1px solid var(--border-subtle)',
            display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-tertiary)' }}>
            <span>© {new Date().getFullYear()} Property OS</span>
            <span>Βάση δεδομένων στην ΕΕ · Σχεδιασμένο για GDPR</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
