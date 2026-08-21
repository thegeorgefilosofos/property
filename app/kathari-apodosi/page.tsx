// ═══════════════════════════════════════════════════════════════════════════
// ΔΩΡΕΑΝ ΥΠΟΛΟΓΙΣΤΗΣ ΚΑΘΑΡΗΣ ΑΠΟΔΟΣΗΣ — η δημόσια σελίδα
// ─────────────────────────────────────────────────────────────────────────
// ΓΙΑΤΙ ΤΕΤΑΡΤΟ ΕΡΓΑΛΕΙΟ, ΩΣ ΑΠΟΦΑΣΗ ΠΡΟΪΟΝΤΟΣ
// Τα τρία που υπήρχαν μιλούν σε όποιον ΕΧΕΙ ήδη ακίνητο και ρωτά τι θα
// πληρώσει: ΕΝΦΙΑ, φόρο ενοικίων, βραχυχρόνια ή μακροχρόνια. Κανένα δεν απαντά
// στην ερώτηση που προηγείται όλων και επαναλαμβάνεται κάθε χρόνο: «αξίζει;»
//
// Και είναι η ερώτηση όπου το διαδίκτυο απαντά συστηματικά λάθος. Κάθε αγγελία
// γράφει μεικτή απόδοση — ενοίκιο επί δώδεκα διά την αξία — και ο ιδιοκτήτης τη
// συγκρίνει με μια κατάθεση, όπου το ποσοστό είναι καθαρό. Η διαφορά είναι
// συνήθως ένα τέταρτο ώς ένα τρίτο του νούμερου.
//
// ΤΟ ΤΕΤΑΡΤΟ ΕΡΓΑΛΕΙΟ ΚΑΤΑΝΑΛΩΝΕΙ ΤΑ ΤΡΙΑ, ΔΕΝ ΤΑ ΕΠΑΝΑΛΑΜΒΑΝΕΙ. Ο φόρος
// έρχεται από την ίδια φορολογική λογική με τον υπολογιστή ενοικίων, ο ΕΝΦΙΑ
// είναι πεδίο με σύνδεσμο προς τον δικό του υπολογιστή, και η βραχυχρόνια μένει
// έξω με ρητή αναφορά. Καμία γραμμή νομοθεσίας δεν ξαναγράφεται εδώ.
//
// ΚΟΣΤΟΣ: μηδέν. Στατική απόδοση, ο υπολογισμός γίνεται στη συσκευή, κανένα
// αίτημα σε βάση, κανένα AI, καμία εξωτερική υπηρεσία.
// ═══════════════════════════════════════════════════════════════════════════
import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { T } from '@/components/tokens';
import { siteUrl } from '@/lib/core/site';
import { athensParts, athensToday } from '@/lib/core/time';
import { PublicHeader, PublicFooter, SectionHead, WRAP, WRAP_PAD } from '../PublicChrome';
import { BackLink } from '../BackLink';
import { ApodosiCalculator } from './ApodosiCalculator';

const TITLE = 'Καθαρή απόδοση ακινήτου · δωρεάν υπολογιστής, χωρίς εγγραφή';
const DESC =
  'Πόσο αποδίδει πραγματικά το ακίνητό σου μετά τον φόρο εισοδήματος, τον ΕΝΦΙΑ '
  + 'και τις δαπάνες. Μεικτή και καθαρή απόδοση δίπλα δίπλα, με τον φόρο στο δικό '
  + 'σου κλιμάκιο. Δωρεάν, χωρίς εγγραφή, ο υπολογισμός γίνεται στη συσκευή σου.';
const URL = siteUrl('/kathari-apodosi');

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESC,
  alternates: { canonical: URL },
  openGraph: {
    title: TITLE, description: DESC, url: URL,
    siteName: 'Property OS', locale: 'el_GR', type: 'website',
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESC },
};

// Οι ερωτήσεις που κάνει πραγματικά ο ιδιοκτήτης, με απαντήσεις που στέκουν. Το
// ίδιο περιεχόμενο τροφοδοτεί και το δομημένο σχήμα παρακάτω — μία πηγή, ώστε να
// μη διαφωνήσουν ποτέ η σελίδα και ό,τι διαβάζει η μηχανή αναζήτησης.
const FAQ: { q: string; a: string }[] = [
  {
    q: 'Τι διαφορά έχει η καθαρή από τη μεικτή απόδοση;',
    a: 'Η μεικτή είναι το ετήσιο ενοίκιο διά την αξία του ακινήτου: το νούμερο που '
     + 'γράφουν οι αγγελίες. Η καθαρή αφαιρεί πρώτα τον φόρο εισοδήματος, τον ΕΝΦΙΑ '
     + 'και τις δαπάνες συντήρησης, ασφάλισης και κοινοχρήστων. Μόνο η καθαρή '
     + 'συγκρίνεται με μια κατάθεση ή με ένα ομόλογο, γιατί μόνο αυτή είναι χρήματα '
     + 'που μένουν στην τσέπη.',
  },
  {
    q: 'Γιατί ο φόρος εξαρτάται από τα άλλα μου ενοίκια;',
    a: 'Επειδή η κλίμακα των ενοικίων είναι προοδευτική στο ΣΥΝΟΛΟ του εισοδήματός '
     + 'σου από ακίνητα, όχι ανά ακίνητο. Ένα διαμέρισμα με 8.400 € ενοίκια κοστίζει '
     + '1.197 € φόρο αν είναι το μοναδικό σου, και 2.293 € αν δηλώνεις ήδη άλλα '
     + '20.000 €. Ίδιο ακίνητο, διαφορά 1.096 € τον χρόνο. Γι’ αυτό ο υπολογιστής '
     + 'ρωτά τι άλλο δηλώνεις.',
  },
  {
    q: 'Τι δαπάνες να βάλω;',
    a: 'Συντήρηση και επισκευές, ασφάλιση, τα κοινόχρηστα που βαρύνουν τον ιδιοκτήτη '
     + 'και τυχόν αμοιβή διαχείρισης. Αν δεν έχεις δικό σου νούμερο, ο νόμος τεκμαίρει '
     + 'δαπάνη 5% του ενοικίου χωρίς παραστατικά, και ο υπολογιστής τη συμπληρώνει με '
     + 'ένα πάτημα.',
  },
  {
    q: 'Περιλαμβάνεται η άνοδος της αξίας του ακινήτου;',
    a: 'Όχι. Ο υπολογισμός αφορά μόνο την ταμειακή απόδοση της χρονιάς. Η μεταβολή '
     + 'της αξίας δεν είναι εισόδημα μέχρι να πουληθεί το ακίνητο, δεν είναι '
     + 'προβλέψιμη, και δεν την επινοούμε.',
  },
  {
    q: 'Πώς βρίσκω τον ΕΝΦΙΑ του ακινήτου;',
    a: 'Είναι γραμμένος στο εκκαθαριστικό της ΑΑΔΕ. Αν δεν το έχεις πρόχειρο, ο '
     + 'υπολογιστής ΕΝΦΙΑ της ίδιας σελίδας τον εκτιμά από τα τετραγωνικά και την '
     + 'τιμή ζώνης.',
  },
  {
    q: 'Ισχύει και για βραχυχρόνια μίσθωση;',
    a: 'Όχι. Η βραχυχρόνια έχει τέλος ανθεκτικότητας ανά διανυκτέρευση, προμήθεια '
     + 'πλατφόρμας που δεν εκπίπτει για το φυσικό πρόσωπο, λειτουργικά ανά νύχτα και '
     + 'δικά της όρια πριν θεωρηθεί επιχειρηματική δραστηριότητα. Τη συγκρίνει '
     + 'χωριστά το εργαλείο «Βραχυχρόνια ή μακροχρόνια».',
  },
  {
    q: 'Τα δεδομένα μου αποθηκεύονται;',
    a: 'Όχι. Ο υπολογισμός γίνεται εξ ολοκλήρου στον browser σου. Κανένα ποσό δεν '
     + 'στέλνεται σε διακομιστή και δεν χρειάζεται ούτε email ούτε εγγραφή.',
  },
];

export default function Page() {
  const { year } = athensParts();
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        name: 'Υπολογισμός καθαρής απόδοσης ακινήτου',
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
    <div className="po-tool-page" style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', minHeight: '100vh', fontFamily: T.font.sans }}>
      {/* Το δομημένο σχήμα παράγεται από τον ΙΔΙΟ πίνακα FAQ που αποδίδεται
          παρακάτω, ώστε να μην μπορεί να πει άλλα η σελίδα και άλλα το σχήμα. */}
      <script type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}/>

      <PublicHeader />

      <main style={{ ...WRAP, padding: `clamp(28px,4vw,44px) ${WRAP_PAD} clamp(56px,7vw,88px)` }}>
        <BackLink />
        <div className="lp-eyebrow">Δωρεάν εργαλείο</div>
        <h1 style={{ fontSize: 'clamp(28px,4.4vw,42px)', fontWeight: 680, letterSpacing: '-0.035em',
          lineHeight: 1.1, margin: '0 0 14px', textWrap: 'balance' }}>
          Πόσο αποδίδει πραγματικά το ακίνητό σου
        </h1>
        <p className="po-tool-lede" style={{ fontSize: 'clamp(15px,2vw,17px)', lineHeight: 1.6,
          color: 'var(--text-secondary)', margin: '0 0 clamp(26px,3.5vw,36px)', textWrap: 'pretty' }}>
          <span style={{ display: 'block' }}>Μεικτή και καθαρή απόδοση δίπλα δίπλα, με τον φόρο στο δικό σου κλιμάκιο. Χωρίς εγγραφή και χωρίς email:</span>
          ο υπολογισμός γίνεται στη συσκευή σου και μένει εκεί.
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 14 }}>
            *Οι ίδιοι υπολογισμοί που τρέχει το Property OS.
          </span>
        </p>

        {/* Ο υπολογιστής διαβάζει τη διεύθυνση, άρα θέλει όριο αναμονής: χωρίς
            αυτό ολόκληρη η σελίδα βγαίνει από τη στατική απόδοση και χάνει το
            SEO για το οποίο υπάρχει. Η εφεδρεία έχει το ίδιο ύψος με τη φόρμα,
            ώστε το κείμενο από κάτω να μην αναπηδήσει μόλις φορτώσει. */}
        <Suspense fallback={<div style={{ minHeight: 460 }} aria-hidden/>}>
          <ApodosiCalculator year={year} today={athensToday()}/>
        </Suspense>

        <section className="po-tool-more" style={{ marginTop: 'clamp(44px,6vw,72px)' }}>
          <SectionHead over="Συχνές ερωτήσεις" title="Ό,τι ρωτούν πριν αγοράσουν" />
          <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            {FAQ.map(f => (
              <details key={f.q} className="lp-faq">
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

        {/* Τα τέσσερα εργαλεία είναι μια αλυσίδα, όχι τέσσερις άσχετες σελίδες
            που τυχαίνει να ζουν στο ίδιο domain. */}
        <section className="po-tool-more" style={{ marginTop: 'clamp(40px,5vw,60px)' }}>
          <SectionHead over="Και μετά" title="Τα δύο νούμερα που μπαίνουν εδώ μέσα" />
          <p style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--text-secondary)', margin: 0, textWrap: 'pretty' }}>
            Ο{' '}
            <Link href="/ypologismos-enfia" className="lp-link" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
              ΕΝΦΙΑ
            </Link>{' '}βγαίνει από τα τετραγωνικά και την τιμή ζώνης, και ο{' '}
            <Link href="/ypologismos-forou-enoikion" className="lp-link" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
              φόρος ενοικίων
            </Link>{' '}αναλυτικά, κλιμάκιο κλιμάκιο. Και αν σκέφτεσαι να το βγάλεις σε
            βραχυχρόνια, η{' '}
            <Link href="/vraxyxronia-i-makroxronia" className="lp-link" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
              σύγκριση βραχυχρόνιας και μακροχρόνιας
            </Link>{' '}δείχνει από ποια πληρότητα και πάνω συμφέρει.
          </p>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
