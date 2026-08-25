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
import { PRODUCT_NAME } from '@/lib/core/site';
import { jsonLdScript } from '@/lib/core/jsonLd';
import { BrandLogo } from '@/components/BrandMark';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { T } from '@/components/tokens';
import { TRIAL_DAYS } from '@/lib/billing/plans';
import { IDENTITY } from '@/lib/legal/identity';

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
        <Link href="/" className="lp-link lp-brand" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'var(--text-primary)' }}>
          <BrandLogo size={24} />
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          {/* Ο ΤΙΜΟΚΑΤΑΛΟΓΟΣ ΔΕΝ ΕΙΧΕ ΔΡΟΜΟ. Η ενότητα υπάρχει, έχει άγκυρα
              `#pricing`, και καμία σελίδα δεν έδειχνε προς τα εκεί: ο
              επισκέπτης που έφτανε από τον υπολογιστή ΕΝΦΙΑ ή από τους Όρους
              έπρεπε να μαντέψει ότι πρέπει να γυρίσει στην αρχική και να
              κυλήσει. Η πιο συχνή ερώτηση πριν την εγγραφή είναι η τιμή. */}
          <Link href="/#pricing" className="lp-link lp-nav-link" style={{ textDecoration: 'none', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
            Τιμές
          </Link>
          {/* ΟΛΟΚΛΗΡΟ ΤΟ ΛΕΚΤΙΚΟ ΕΒΓΑΖΕ ΤΗ ΣΕΛΙΔΑ ΕΞΩ ΑΠΟ ΤΗΝ ΟΘΟΝΗ. Μετρημένο
              σε Chromium στα 390: η ομάδα δεξιά πιάνει 185 ώς 392, δηλαδή δύο
              εικονοστοιχεία έξω, και μαζί της αποκτούσε οριζόντια κύλιση κάθε
              νομική σελίδα και κάθε δωρεάν εργαλείο. Η αρχική το είχε ήδη
              λύσει με κοντό λεκτικό· εδώ έλειπαν οι κλάσεις, που ζούσαν μέσα
              στο <style> της. Τώρα είναι καθολικές. */}
          <Link href="/signup" className="lp-cta lp-primary" style={{ textDecoration: 'none', fontSize: 14, fontWeight: 700, padding: '9px 16px', borderRadius: T.radius.pill, whiteSpace: 'nowrap' }}>
            <span className="lp-hide-xs">Ξεκίνα τη δοκιμή</span><span className="lp-only-xs">Δοκιμή</span>
          </Link>
        </div>
      </div>
    </header>
  );
}

/** Μία στήλη συνδέσμων. Ίδια γεωμετρία σε κάθε δημόσια σελίδα. */
function FootCol({ label, links }: { label: string; links: [string, string][] }) {
  return (
    <div className="lp-footcol" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>{label}</span>
      {/* ΤΟ `nowrap` ΕΣΠΡΩΧΝΕ ΤΗ ΣΕΛΙΔΑ ΔΕΞΙΑ. Στα 390 εικονοστοιχεία η στήλη
          πιάνει 163 και το «Βραχυχρόνια ή μακροχρόνια» θέλει 193: ο σύνδεσμος
          δεν έσπαγε, οπότε ολόκληρη η σελίδα αποκτούσε οριζόντια κύλιση δέκα
          εικονοστοιχείων, μετρημένη σε Chromium και στους τρεις υπολογιστές.
          Ο σύνδεσμος σπάει σε δύο γραμμές· η σελίδα δεν κουνιέται. */}
      {links.map(([href, text]) => (
        <Link key={href} href={href} className="lp-link" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 14, lineHeight: 1.3, textWrap: 'pretty' }}>{text}</Link>
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
            <Link href="/" className="lp-link lp-brand" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, textDecoration: 'none', color: 'var(--text-primary)', width: 'fit-content' }}>
              <BrandLogo size={26} />
            </Link>
            {/* ΔΥΟ ΠΡΟΤΑΣΕΙΣ, ΔΥΟ ΓΡΑΜΜΕΣ, ΚΑΙ Η ΑΛΛΑΓΗ ΕΙΝΑΙ ΡΗΤΗ.
                Ηταν μία συνεχόμενη φράση που άφηνε την αναδίπλωση στο πλάτος
                της στήλης: έσπαγε σε τρεις γραμμές, και το πού έσπαγε άλλαζε
                με κάθε μέγεθος οθόνης — άλλοτε στη μέση της πρώτης πρότασης,
                άλλοτε μετά. Δύο μπλοκ σπάνε ΜΟΝΟ εκεί που τελειώνει νόημα. */}
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0, maxWidth: 340 }}>
              <span style={{ display: 'block' }}>Το λειτουργικό σύστημα για ακίνητα στην Ελλάδα.</span>
              <span style={{ display: 'block' }}>Ιδανικό για ιδιοκτήτες και επαγγελματίες.</span>
            </p>
          </div>
          {/* ΤΡΕΙΣ ΣΤΗΛΕΣ ΤΩΝ ΤΡΙΩΝ. Η μεσαία είχε δύο συνδέσμους και έμοιαζε
              κολοβή δίπλα στις άλλες· έλειπε όμως και ο υπολογιστής ΕΝΦΙΑ, που
              υπάρχει, σερβίρεται και δεν τον έδειχνε καμία σελίδα. */}
          {/* Η ΣΕΙΡΑ ΑΚΟΛΟΥΘΕΙ ΤΗΝ ΠΡΟΘΕΣΗ: πρώτα η δοκιμή, μετά το τι κοστίζει
              μετά τη δοκιμή. Το «Τιμές» πήγαινε πριν το «Ξεκίνα», δηλαδή
              ρωτούσε για χρήματα κάποιον που δεν έχει δει ακόμη το προϊόν. */}
          <FootCol label="Προϊόν" links={[['/', 'Αρχική'], ['/signup', 'Ξεκίνα τη δοκιμή'], ['/#pricing', 'Τιμολόγηση'], ['/#faq', 'Συχνές ερωτήσεις']]} />
          <FootCol label="Εργαλεία" links={[['/ypologismos-enfia', 'ΕΝΦΙΑ'], ['/ypologismos-forou-enoikion', 'Φορολογία ενοικίων'], ['/kathari-apodosi', 'Καθαρή απόδοση'], ['/vraxyxronia-i-makroxronia', 'Βραχυχρόνια ή μακροχρόνια']]} />
          {/* ΚΑΜΙΑ ΔΗΜΟΣΙΑ ΣΕΛΙΔΑ ΔΕΝ ΕΔΙΝΕ ΤΡΟΠΟ ΝΑ ΜΑΣ ΜΙΛΗΣΕΙ ΚΑΝΕΙΣ. Η
              διεύθυνση υποστήριξης υπήρχε στο μητρώο νομικής ταυτότητας και
              δεν την τύπωνε καμία σελίδα εκτός από το «Ποιοι είμαστε». Ο
              επισκέπτης που έχει ερώτηση πριν δώσει τα φορολογικά του
              στοιχεία δεν ψάχνει· φεύγει. */}
          <FootCol label="Εμπιστοσύνη" links={[['/trust', 'Ποιοι είμαστε'], ['/privacy', 'Απόρρητο'], ['/terms', 'Όροι χρήσης'], [`mailto:${IDENTITY.supportEmail}`, 'Επικοινωνία']]} />
        </div>
        <div style={{ marginTop: 'clamp(32px,4vw,48px)', paddingTop: 18, borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-tertiary)' }}>
          <span>© {new Date().getFullYear()} PROPERWISE</span>
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

// ═══════════════════════════════════════════════════════════════════════════
// Η ΠΡΟΣΚΛΗΣΗ ΣΤΟ ΤΕΛΟΣ ΤΩΝ ΔΩΡΕΑΝ ΕΡΓΑΛΕΙΩΝ
// ─────────────────────────────────────────────────────────────────────────
// ΓΙΑΤΙ ΚΟΙΝΗ. Ο κάθε υπολογιστής έστηνε τη δική του κάρτα, με το χέρι: ίδια
// γεωμετρία αντιγραμμένη, ίδιο κουμπί γραμμένο δύο φορές, και δύο εκδοχές της
// φράσης για τη δοκιμή. Με τρίτο εργαλείο θα γίνονταν τρεις.
//
// ΔΥΟ ΓΡΑΜΜΕΣ, ΟΧΙ ΜΙΑ ΠΑΡΑΓΡΑΦΟΣ. Η υπόσχεση του προϊόντος και οι όροι της
// δοκιμής είναι δύο διαφορετικά πράγματα και τα διαβάζει διαφορετικός
// άνθρωπος: το πρώτο πείθει, το δεύτερο καθησυχάζει. Κολλημένα σε μία σειρά,
// το «30 ημέρες δωρεάν» χανόταν στο τέλος μιας πρότασης για λογιστική.
//
// ΔΕΝ ΤΥΠΩΝΕΤΑΙ. Σε χαρτί που πάει στον λογιστή, μια πρόσκληση για δοκιμή δεν
// είναι πληροφορία.
// ═══════════════════════════════════════════════════════════════════════════

/** Η φράση της δοκιμής, μία φορά για όλα τα εργαλεία. */
export const TRIAL_LINE = `${TRIAL_DAYS} ημέρες δωρεάν δοκιμή, χωρίς δέσμευση.`;

/**
 * ΤΑ ΔΟΜΗΜΕΝΑ ΔΕΔΟΜΕΝΑ, ΓΡΑΜΜΕΝΑ ΜΙΑ ΦΟΡΑ ΚΑΙ ΜΕ ΔΙΑΦΥΓΗ.
 *
 * Η ίδια γραμμή `JSON.stringify(jsonLd)` ήταν σε πέντε σελίδες. Πέρα από την
 * επανάληψη, το `JSON.stringify` ΔΕΝ ΕΙΝΑΙ ΑΣΦΑΛΕΣ μέσα σε `<script>`: αν μια
 * τιμή περιέχει «</script», ο αναλυτής HTML κλείνει την ετικέτα εκεί, και ό,τι
 * ακολουθεί γίνεται σήμα προς εκτέλεση. Σήμερα όλες οι τιμές είναι σταθερές
 * γραμμένες από εμάς, άρα δεν υπάρχει κίνδυνος· η διαφυγή μπαίνει ΤΩΡΑ ώστε να
 * μην εξαρτάται η ασφάλεια από το να θυμηθεί κάποιος τον κανόνα την ημέρα που
 * θα βάλει εδώ όνομα ακινήτου ή κείμενο χρήστη.
 *
 * Το «<» γίνεται `\u003c`: μένει έγκυρο JSON, ίδιο για τη μηχανή αναζήτησης,
 * και δεν μπορεί να κλείσει ετικέτα.
 */
export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLdScript(data) }}
    />
  );
}

/**
 * Η ΕΙΣΑΓΩΓΗ ΚΑΘΕ ΔΩΡΕΑΝ ΥΠΟΛΟΓΙΣΤΗ, ΓΡΑΜΜΕΝΗ ΜΙΑ ΦΟΡΑ.
 *
 * Οι τέσσερις υπολογιστές είχαν την ΙΔΙΑ παράγραφο αντιγραμμένη: ίδιο στυλ,
 * ίδια εγγύηση απορρήτου, ίδια υποσημείωση, ίδιο σχόλιο δεκαπέντε γραμμών.
 * Διέφερε μόνο η πρώτη πρόταση, αυτή που λέει τι κάνει ο κάθε υπολογιστής.
 *
 * Η επανάληψη δεν ήταν αθώα: όταν η υποσημείωση διορθώθηκε ώστε να πιάνει δική
 * της σειρά, η ίδια διόρθωση χρειάστηκε να γίνει τέσσερις φορές. Η επόμενη θα
 * ήθελε πάλι τέσσερις, και η πρώτη που θα ξεχνιόταν θα άφηνε έναν υπολογιστή
 * να δείχνει διαφορετικά από τους αδελφούς του.
 *
 * ΤΙ ΜΕΝΕΙ ΙΔΙΟ ΓΙΑ ΟΛΟΥΣ: η δεύτερη σειρά με την εγγύηση απορρήτου ξεκινά με
 * πεζό γιατί συνεχίζει την άνω τελεία της πρώτης, και η υποσημείωση είναι
 * μπλοκ γιατί ενσωματωμένη χωρούσε μόνο στα 1280 — μετρημένο σε 768 και σε
 * 390, έσπαγε στη μέση και άφηνε το «το PROPERWISE.» ορφανό.
 */
export function ToolLede({ children }: { children: ReactNode }) {
  return (
    <p className="po-tool-lede" style={{ fontSize: 'clamp(15px,2vw,17px)', lineHeight: 1.6,
      color: 'var(--text-secondary)', margin: '0 0 clamp(26px,3.5vw,36px)', textWrap: 'pretty' }}>
      <span style={{ display: 'block' }}>{children} Χωρίς εγγραφή και χωρίς email:</span>
      ο υπολογισμός γίνεται στη συσκευή σου και μένει εκεί.
      <span style={{ display: 'block', marginTop: 8, fontSize: 12, color: 'var(--text-tertiary)' }}>
        *Οι ίδιοι υπολογισμοί που τρέχει το {PRODUCT_NAME}.
      </span>
    </p>
  );
}

export function ToolCta({ title, body }: { title: string; body: ReactNode }) {
  return (
    <div className="po-noprint" style={{
      marginTop: 20, padding: 'clamp(16px, 4vw, 22px)', borderRadius: T.radius.card,
      border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)',
      display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14,
    }}>
      <div style={{ flex: 1, minWidth: 240 }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 650, color: 'var(--text-primary)', letterSpacing: '-0.015em' }}>
          {title}
        </p>
        <p style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.6, color: 'var(--text-secondary)', textWrap: 'pretty' }}>
          {body}
        </p>
        <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--text-tertiary)' }}>
          {TRIAL_LINE}
        </p>
      </div>
      <Link href="/signup" className="lp-cta lp-primary" style={{
        display: 'inline-flex', alignItems: 'center', height: 44, padding: '0 24px',
        borderRadius: T.radius.pill, fontSize: 14, fontWeight: 700,
        textDecoration: 'none', whiteSpace: 'nowrap',
      }}>
        Ξεκίνα τη δοκιμή
      </Link>
    </div>
  );
}
