import Link from 'next/link';
import type { ReactNode } from 'react';
import { T } from '@/components/tokens';
import { PublicHeader, PublicFooter, WRAP, WRAP_PAD } from './PublicChrome';
import { BackLink } from './BackLink';

// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΚΕΛΥΦΟΣ ΤΩΝ ΤΡΙΩΝ ΣΕΛΙΔΩΝ ΕΜΠΙΣΤΟΣΥΝΗΣ
// (Ποιοι είμαστε · Πολιτική απορρήτου · Όροι χρήσης)
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΑΛΛΑΞΕ ΚΑΙ ΓΙΑΤΙ
//
// 1) ΤΟ ΕΥΡΕΤΗΡΙΟ ΗΤΑΝ ΚΟΥΤΙ ΠΟΥ ΚΥΛΟΥΣΕ ΚΑΙ ΧΑΝΟΤΑΝ. Δεκατέσσερις ενότητες σε
//    δύο στήλες μέσα σε πλαίσιο, στην κορυφή: ο αναγνώστης το διάβαζε μία φορά,
//    κατέβαινε και από εκεί και πέρα δεν είχε ιδέα πού βρίσκεται ούτε πώς να
//    πάει αλλού. Νομικό κείμενο δεν διαβάζεται από την αρχή ως το τέλος·
//    διαβάζεται στοχευμένα. Το ευρετήριο μένει ΚΑΡΦΩΜΕΝΟ στο πλάι όσο κυλάς.
//
// 2) ΤΟ ΚΕΙΜΕΝΟ ΗΤΑΝ 14 ΕΙΚΟΝΟΣΤΟΙΧΕΙΑ, ΜΙΚΡΟΤΕΡΟ ΑΠΟ ΚΑΘΕ ΑΛΛΗ ΣΕΛΙΔΑ. Οι
//    δεσμευτικοί όροι τυπώνονταν σε μέγεθος ψιλών γραμμάτων, ενώ η αρχική
//    διαβάζει στα 15. Ό,τι δεσμεύει τον χρήστη δεν επιτρέπεται να είναι το πιο
//    δυσανάγνωστο κείμενο του προϊόντος.
//
// 3) Η ΠΡΟΕΙΔΟΠΟΙΗΣΗ ΣΤΟ ΤΕΛΟΣ ΗΤΑΝ ΠΟΡΤΟΚΑΛΙ. Φορούσε τα χρώματα που η
//    εφαρμογή κρατά για εκκρεμότητες, δηλαδή το σήμα «κάτι πάει στραβά» — και
//    προσπερνιόταν όπως προσπερνιέται κάθε κίτρινο πλαίσιο.
//
// 4) ΤΟ «ΠΟΙΟΙ ΕΙΜΑΣΤΕ» ΕΣΤΗΝΕ ΔΙΚΟ ΤΟΥ ΚΟΣΜΟ. Δική του κεφαλίδα, δικό του
//    μέτρο (780 αντί 720), δικά του μεγέθη τίτλων, κανένα ευρετήριο και κανένα
//    υποσέλιδο. Οι τρεις σελίδες που ζητούν εμπιστοσύνη διάβαζαν σαν να τις
//    έγραψαν τρεις διαφορετικοί άνθρωποι. Τώρα μοιράζονται το ίδιο `LegalLayout`
//    και διαφέρουν μόνο στο περιεχόμενο — που είναι και το μόνο που πρέπει.
//
// Η ΚΕΦΑΛΙΔΑ ΚΑΙ ΤΟ ΥΠΟΣΕΛΙΔΟ ΕΡΧΟΝΤΑΙ ΑΠΟ ΤΟ PublicChrome, όπως και στον
// υπολογιστή φόρου: ένα μέτρο, ένα κουμπί, ένα υποσέλιδο παντού.
// ═══════════════════════════════════════════════════════════════════════════

/** Οι τρεις σελίδες εμπιστοσύνης, για τους συνδέσμους στο τέλος καθεμιάς. */
const TRUST_PAGES: [string, string][] = [
  ['/trust', 'Ποιοι είμαστε'],
  ['/privacy', 'Πολιτική απορρήτου'],
  ['/terms', 'Όροι χρήσης'],
];

/** Μία ενότητα με ελεύθερο περιεχόμενο, όπως τη θέλει το «Ποιοι είμαστε». */
export interface LegalBlock {
  /**
   * Το ΜΕΡΟΣ στο οποίο ανήκει η ενότητα. Γράφεται μόνο στην ΠΡΩΤΗ ενότητα κάθε
   * μέρους· οι επόμενες το κληρονομούν.
   *
   * ΓΙΑΤΙ ΥΠΑΡΧΕΙ: είκοσι τέσσερις ενότητες στη σειρά δεν είναι ιεραρχία, είναι
   * λίστα. Ο αναγνώστης που ψάχνει «τι γίνεται αν ακυρώσω» δεν ξέρει αν θα το
   * βρει στη 8 ή στη 19 και τις διαβάζει όλες ή καμία. Τα μέρη του λένε από
   * πού να ξεκινήσει. Η ΑΡΙΘΜΗΣΗ ΜΕΝΕΙ ΣΥΝΕΧΟΜΕΝΗ (1 ως N) και όχι ανά μέρος:
   * αλλιώς κάθε παραπομπή «βλ. ενότητα 12» θα άλλαζε νόημα με το που μπει ένα
   * μέρος παραπάνω.
   */
  part?: string;
  /**
   * Σταθερό αναγνωριστικό για σύνδεσμο απ' έξω. Χωρίς αυτό, το άγκιστρο είναι
   * η ΘΕΣΗ της ενότητας («#s5»): αρκεί να προστεθεί μία ενότητα παραπάνω και
   * κάθε παλιός σύνδεσμος δείχνει σε λάθος κείμενο, χωρίς 404 που να το
   * προδώσει. Όποια ενότητα τη δείχνει κουμπί μέσα στην εφαρμογή, παίρνει `id`.
   */
  id?: string;
  h: string;
  body: ReactNode;
}

/**
 * Ο σκελετός: τίτλος, εισαγωγή, καρφωμένο ευρετήριο, αριθμημένες ενότητες.
 *
 * Ο αριθμός της ενότητας βγαίνει από τη σειρά και τυπώνεται ΕΞΩ από τον τίτλο.
 * Ήταν «1. Ορισμοί» μέσα στο ίδιο κείμενο, οπότε ένας τίτλος δύο γραμμών
 * τύλιγε κάτω από τον αριθμό και η δεύτερη σειρά ξεκινούσε από άλλο σημείο.
 */
export function LegalLayout({ eyebrow, title, intro, meta, blocks, closing }: {
  eyebrow: string;
  title: string;
  intro: ReactNode;
  /** Δεξιά της εισαγωγής, στην ίδια γραμμή βάσης: ημερομηνία ή πεδίο ισχύος. */
  meta?: string;
  blocks: LegalBlock[];
  /** Τελευταία σημείωση, κάτω από την τελευταία ενότητα. */
  closing?: ReactNode;
}) {
  return (
    <div style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', minHeight: '100vh', fontFamily: T.font.sans }}>
      <PublicHeader />

      <main style={{ ...WRAP, padding: `clamp(28px,4vw,44px) ${WRAP_PAD} clamp(48px,6vw,80px)` }}>
        <BackLink />
        <div className="lp-eyebrow">{eyebrow}</div>
        <h1 style={{ fontSize: 'clamp(28px,4.4vw,42px)', fontWeight: 680, letterSpacing: '-0.035em', lineHeight: 1.1, margin: '0 0 14px', textWrap: 'balance' }}>
          {title}
        </h1>

        {/* Η ΗΜΕΡΟΜΗΝΙΑ ΔΕΞΙΑ, ΟΧΙ ΑΠΟ ΚΑΤΩ. Η εισαγωγή έχει το μέτρο της, άρα
            από μόνη της άφηνε τριακόσια εικονοστοιχεία λευκά στα δεξιά της. Η
            ημερομηνία τα γεμίζει και η σειρά κλείνει πέρα ως πέρα. */}
        <div className="lg-lede">
          <p style={{ fontSize: 15.5, color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0 }}>{intro}</p>
          {meta && <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0, whiteSpace: 'nowrap' }}>{meta}</p>}
        </div>

        {/* ΔΥΟ ΣΤΗΛΕΣ: ΤΟ ΕΥΡΕΤΗΡΙΟ ΜΕΝΕΙ, ΤΟ ΚΕΙΜΕΝΟ ΚΥΛΑΕΙ. Σε στενή οθόνη
            πέφτουν η μία κάτω από την άλλη και το ευρετήριο ξεκαρφώνεται: ένα
            καρφωμένο στοιχείο σε κινητό τρώει μισή οθόνη. */}
        <div className="lg-grid">
          <nav aria-label="Περιεχόμενα" className="lg-toc">
            <div className="lg-toc-head">Περιεχόμενα</div>
            <ol className="lg-toc-list">
              {blocks.map((b, i) => (
                <li key={i}>
                  {b.part && <span className="lg-toc-part">{b.part}</span>}
                  <a href={`#${b.id || `s${i + 1}`}`} className="lg-toc-link">
                    <span className="lg-toc-num">{i + 1}</span>
                    <span>{b.h}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          {/* Η ΣΤΗΛΗ ΕΙΝΑΙ ΤΟ ΜΕΤΡΟ. Καμία παράγραφος από μέσα δεν βάζει δικό
              της πλάτος: 712 εικονοστοιχεία στα 15 βγάζουν γραμμές ογδόντα
              εννέα χαρακτήρων και κάθε γραμμή τελειώνει εκεί που τελειώνει
              και η προηγούμενη. */}
          <div className="lg-body">
            {blocks.map((b, i) => (
              <section key={i} id={b.id || `s${i + 1}`} style={{ scrollMarginTop: 24, marginTop: i === 0 ? 0 : 'clamp(30px,4vw,46px)' }}>
                {b.part && <div className={i === 0 ? 'lg-part lg-part-first' : 'lg-part'}>{b.part}</div>}
                <h2 style={{ display: 'flex', gap: 12, alignItems: 'baseline', fontSize: 'clamp(18px,2.2vw,21px)', fontWeight: 680, letterSpacing: '-0.02em', lineHeight: 1.3, margin: '0 0 12px' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums', flexShrink: 0, minWidth: 18 }}>{i + 1}</span>
                  <span style={{ textWrap: 'balance' }}>{b.h}</span>
                </h2>
                {b.body}
              </section>
            ))}

            {closing}

            <div style={{ marginTop: 'clamp(32px,4vw,48px)', paddingTop: 20, borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              {TRUST_PAGES.map(([href, label]) => (
                <Link key={href} href={href} className="lp-link po-tap" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>{label}</Link>
              ))}
            </div>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}

/** Κάθε ενότητα καθαρού κειμένου: παράγραφοι, προαιρετική λίστα, σημείωση. */
export interface LegalSection {
  h: string; p?: string[]; list?: string[]; note?: string; id?: string; part?: string;
}

/** Απόρρητο και Όροι: μόνο κείμενο, άρα δηλώνονται ως δεδομένα, όχι ως JSX. */
export function LegalShell({ title, updated, intro, sections, disclaimer }: {
  title: string; updated: string; intro: string; sections: LegalSection[]; disclaimer?: string;
}) {
  return (
    <LegalLayout
      eyebrow="Νομικά"
      title={title}
      intro={intro}
      meta={`Τελευταία ενημέρωση: ${updated}`}
      blocks={sections.map(s => ({
        id: s.id,
        h: s.h,
        part: s.part,
        body: (
          <>
            {(s.p || []).map((para, j) => <p key={j} className="lg-p">{para}</p>)}
            {s.list && <ul className="lg-ul">{s.list.map((li, j) => <li key={j}>{li}</li>)}</ul>}
            {s.note && <p className="lg-note">{s.note}</p>}
          </>
        ),
      }))}
      closing={disclaimer ? <p className="lg-note lg-closing">{disclaimer}</p> : undefined}
    />
  );
}
