'use client';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { SITE } from '@/lib/core/site';
import { downloadTableXlsx, csvDate } from './exportCsv';
import { saved } from '@/components/dbWrite';
import { drawQrToCanvas } from '@/lib/qr';
import { T, TT, Badge, PageTitle, ExportButton, EmptyState, Modal, SkeletonKPIs, fn, fixedCols, pageShell } from '@/components/Theme';
import { PLANS, TRIAL_DAYS, type PlanId } from '@/lib/billing/plans';
import { UserPlus } from 'lucide-react';
import {
  referralCode, referralLink, progress,
  individualReferrerReward,
  INDIV_PRO_BONUS_MONTHS, REFERRER_SLOT_MONTHS,
  INDIV_VOLUME_TARGET, INDIV_VOLUME_BONUS_MONTHS,
  PRO_PAID_TARGET, PRO_PAID_BONUS_MONTHS, PARTNER_WELCOME_MONTHS, partnerWelcomeTier,
  STREAK_TARGET_MONTHS, PARTNER_MONTHLY_FREE_MONTHS,
  ACTIVATION_MIN_PROPERTIES, ACTIVATION_MIN_DOCUMENTS,
} from '@/lib/referral/referral';

// ═══════════════════════════════════════════════════════════════════════════
// TabReferral — δύο ΞΕΧΩΡΙΣΤΑ προγράμματα ανά προφίλ:
//  • Ιδιώτης  → «Πρόγραμμα Πρόσκλησης»  (κοινωνικό, αξία ανά φίλο). Ο τρόπος
//    χρήσης λέγεται «Ιδιώτης»· το ΠΑΚΕΤΟ που κερδίζει λέγεται «Ιδιοκτήτης» και
//    το όνομά του διαβάζεται πάντα από το PLANS, ποτέ γραμμένο στο χέρι εδώ.
//  • Επαγγελματίας → «Πρόγραμμα Συνεργατών» (milestones συνδρομητών + ιδιότητα
//    Συνεργάτη). Καθένας βλέπει ΜΟΝΟ ό,τι τον αφορά.
//
// ΤΡΕΙΣ ΔΙΟΡΘΩΣΕΙΣ ΠΟΥ ΑΛΛΑΖΟΥΝ ΤΟ ΝΟΗΜΑ ΤΗΣ ΟΘΟΝΗΣ
//
// 1. Έφυγε το «20% προμήθεια σε κάθε συνδρομή, κάθε μήνα». Πίσω από την υπόσχεση
//    δεν υπήρχε ούτε ledger ούτε payout (`referral_rewards` δέχεται μόνο μήνες ή
//    ακίνητο), η ίδια η μηχανή έγραφε «όλα ΑΞΙΑ ΠΡΟΪΟΝΤΟΣ, όχι μετρητά» και η
//    στρατηγική αποκλείει ρητά τις πληρωμές. Μένουν δωρεάν μήνες, που πληρώνονται
//    από τις συνδρομές που έφερε ο ίδιος.
// 2. Κάθε αριθμός της οθόνης διαβάζεται από τη μηχανή, κανένας δεν ξαναγράφεται
//    εδώ. Το μήνυμα πρόσκλησης είναι κείμενο που ο χρήστης στέλνει σε φίλο του:
//    αν πει άλλο πράγμα από όσα δίνει το `lib/referral/referral.ts`, εκτίθεται ο
//    χρήστης μας, όχι εμείς.
// 3. Έφυγαν ~180 γραμμές διακόσμησης (νόμισμα με ακτίνες σε canvas, odometer,
//    κομφετί, PNG με καρφωμένα χρώματα εκτός συστήματος). Ένας ιδιοκτήτης που
//    φοβάται τον ΕΝΦΙΑ δεν θέλει νόμισμα με ακτίνες· θέλει να ξέρει τι κερδίζει.
//
// Design system του app (T/TT tokens, elevation για βάθος, ένα accent στο hover).
// ═══════════════════════════════════════════════════════════════════════════

const Ic = ({ d, s = 18, c = 'currentColor', sw = 1.8 }: { d: string; s?: number; c?: string; sw?: number }) => (
  <svg aria-hidden="true" width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    {d.split('|').map((p, i) => <path key={i} d={p} />)}
  </svg>
);

// Η ΜΟΝΑΔΑ «ΜΗΝΑΣ» ΓΡΑΦΕΤΑΙ ΜΙΑ ΦΟΡΑ, ΚΑΙ ΚΛΙΝΕΤΑΙ. Τα κείμενα διαβάζουν τους
// αριθμούς από τη μηχανή· χωρίς αυτό, κάθε αλλαγή κανόνα άφηνε πίσω της ένα
// «1 μήνες» — δηλαδή ένα προϊόν που δεν ξέρει ελληνικά.
const moAcc = (n: number) => (n === 1 ? 'έναν μήνα' : `${n} μήνες`);
const moNom = (n: number) => `${n} ${n === 1 ? 'μήνας' : 'μήνες'}`;

/**
 * Πλέγμα καρτών με ΡΗΤΟ πλήθος στηλών και το κενό της ενότητας από κάτω.
 *
 * Ήταν τέσσερα χειρόγραφα `auto-fit` με τέσσερα διαφορετικά ελάχιστα (220, 260,
 * 280), δηλαδή τέσσερις διατάξεις που άλλαζαν πλήθος στηλών με το zoom του
 * περιηγητή: δύο κάρτες γίνονταν μία από κάτω, τρία βήματα γίνονταν δύο και ένα.
 */
const cardGrid = (n: number) => {
  const g = fixedCols(n, 12, 'stretch');
  return { className: g.className, style: { ...g.style, marginBottom: T.sp.xl } };
};

const card: React.CSSProperties = {
  background: 'var(--surface-raised)', border: '1px solid var(--border-raised)',
  borderRadius: T.radius.card, boxShadow: 'var(--highlight-inset), var(--elev-1)',
};
const PAD = T.sp.xl;
// Κοινό στυλ «chip» για τα κανάλια κοινοποίησης (ενιαία εμφάνιση).
// Το ύψος έρχεται από την κοινή κλίμακα (T.h.md): τα chips κοινοποίησης κάθονται
// στην ίδια γραμμή με κουμπιά άλλων αρχείων και κάθε literal εδώ τα ξεσυγχρόνιζε.
// ═══ ΕΠΤΑ ΤΡΟΠΟΙ ΚΟΙΝΟΠΟΙΗΣΗΣ, ΜΙΑ ΣΕΙΡΑ ═══════════════════════════════════
// Μετρημένο στα 1.440: τα επτά πλακίδια ζητούσαν 1.019 εικονοστοιχεία μέσα σε
// 846, οπότε η «Κοινοποίηση» έπεφτε μόνη της σε δεύτερη σειρά — ένα κουμπί
// κάτω αριστερά, χωρίς λόγο να ξεχωρίζει από τα άλλα έξι.
//
// ΤΑ 173 ΠΟΥ ΕΛΕΙΠΑΝ ΒΓΗΚΑΝ ΑΠΟ ΤΙΣ ΛΕΞΕΙΣ, ΟΧΙ ΑΠΟ ΤΟΝ ΣΤΟΧΟ ΑΦΗΣ. Το ύψος
// μένει `T.h.md`, δηλαδή 44 με δάχτυλο. Το γέμισμα κατεβαίνει δύο και το κενό
// ένα· τα υπόλοιπα τα έδωσαν δύο ετικέτες που ήταν διπλάσιες από κάθε αδελφή
// τους σε σειρά όπου όλες οι άλλες είναι μία λέξη.
const CHIP: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, height: T.h.md, padding: '0 12px',
  background: 'transparent', border: '1px solid var(--border-default)', borderRadius: T.radius.pill,
  fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textDecoration: 'none',
};
// Επικεφαλίδα ενότητας: πραγματικό <h2> (σημασιολογία + πλοήγηση αναγνώστη οθόνης).
function SectionLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <h2 style={{ ...TT.label, margin: '0 0 12px', ...style }}>{children}</h2>;
}
// Διακριτικό pill κοινωνικής απόδειξης / κατάταξης. Το κείμενο σκουραίνει προς το
// κύριο χρώμα κειμένου ώστε να περνά άνετα την αντίθεση AA και στα δύο θέματα.
const PILL: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 12px',
  borderRadius: T.radius.pill, background: 'var(--accent-dim)', border: '1px solid var(--accent-border)',
};
const PILL_TEXT = 'color-mix(in srgb, var(--accent) 68%, var(--text-primary))';

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Πόσες ημέρες απομένουν ως το τέλος του τρέχοντος μήνα (για επείγουσα ώθηση).
const daysLeftInMonth = () => {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1); // αρχή επόμενου μήνα
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86400000));
};

// Αριθμός μετρικής: tabular ώστε να μη «χοροπηδά» η στήλη. Ήταν odometer 29
// γραμμών που κυλούσε ψηφία σε κάθε φόρτωση — κίνηση χωρίς πληροφορία, σε οθόνη
// όπου το ερώτημα είναι «τι κερδίζω», όχι «πόσο ωραία μετράει».
const Num = ({ value }: { value: number }) => (
  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fn(Math.max(0, Math.round(Number(value) || 0)))}</span>
);

// Μπάρα που γεμίζει από το 0 στο mount, με ομαλή καμπύλη.
function Bar({ pct, tone = 'var(--accent)' }: { pct: number; tone?: string }) {
  // Η ΜΠΑΡΑ ΓΕΜΙΖΕΙ ΜΕ ΜΕΤΑΒΑΣΗ CSS, ΟΧΙ ΜΕ ΔΕΥΤΕΡΗ ΑΠΟΔΟΣΗ. Ηταν `useState(0)`
  // και effect που έγραφε την πραγματική τιμή στο επόμενο καρέ: με σβηστή την
  // κίνηση, η γραφή ήταν ΣΥΓΧΡΟΝΗ μέσα σε effect, δηλαδή ακριβώς το μοτίβο που
  // απαγορεύεται. Το ίδιο αποτέλεσμα βγαίνει από το `transition` που ήδη
  // υπάρχει: η μπάρα ξεκινά από μηδέν στην πρώτη προσάρτηση επειδή το πλάτος
  // της αλλάζει, χωρίς καμία κατάσταση.
  // Η αρχική τιμή υπολογίζεται ΜΙΑ φορά, με τεμπέλικη αρχικοποίηση: με σβηστή
  // την κίνηση η μπάρα ξεκινά ήδη γεμάτη και δεν χρειάζεται δεύτερη απόδοση.
  const [w, setW] = useState(() => (reducedMotion() ? pct : 0));
  useEffect(() => { const id = requestAnimationFrame(() => setW(pct)); return () => cancelAnimationFrame(id); }, [pct]);
  return (
    <div style={{ height: 8, background: 'var(--ring-track)', borderRadius: T.radius.pill, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, w))}%`, background: tone, borderRadius: T.radius.pill, transition: `width 0.65s ${T.ease.emphasized}` }} />
    </div>
  );
}

// Το κομφετί έφυγε: χρησιμοποιούσε τα σημασιολογικά χρώματα (--positive,
// --warning) ως ΔΙΑΚΟΣΜΗΣΗ, δηλαδή έσπαγε τον κανόνα «το χρώμα σημαίνει κάτι ή
// δεν υπάρχει» στην ίδια οθόνη όπου το πράσινο σημαίνει «το πέτυχες».

type Overview = {
  invites: number; activated: number;
  m_pro: number; m_indiv: number; m_paid: number; m_free: number;
  streak: number; partner: boolean;
};
type Reward = { kind: string; months: number; tier: string; reason: string; status: string; created_at: string };
type Referee = { created_at: string; activated_at: string | null };

// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΟΝΟΜΑ ΤΗΣ ΑΝΤΑΜΟΙΒΗΣ ΓΡΑΦΕΤΑΙ ΜΙΑ ΦΟΡΑ, ΓΙΑ ΤΙΣ ΔΥΟ ΟΨΕΙΣ ΤΗΣ
// ─────────────────────────────────────────────────────────────────────────
// Η λίστα «Τα δώρα σου» είχε τα ονόματα μέσα στον βρόχο απόδοσης και η
// εξαγωγή δεδομένων δίπλα της έγραφε τον ωμό κωδικό της βάσης με σταθερό
// πληθυντικό: «1 μήνες · per_referral». Δύο λάθη σε ένα κελί, μέσα στο αρχείο
// που κατεβάζει ο χρήστης όταν ζητά τα δεδομένα του (Άρθ. 15/20).
//
// ΤΟ 'referee_welcome' ΕΙΝΑΙ ΤΟ ΔΩΡΟ ΤΟΥ ΝΕΟΥ ΧΡΗΣΤΗ. Το πρόγραμμα υπόσχεται
// δύο δώρα σε κάθε σύσταση, ένα σε καθέναν από τους δύο. Χωρίς όνομα εδώ, ο
// νέος χρήστης θα έβλεπε τον δικό του μήνα ως σκέτο «Μπόνους», δηλαδή δεν θα
// τον αναγνώριζε ως αυτό που του υποσχέθηκε η πρόσκληση.
// ═══════════════════════════════════════════════════════════════════════════
const REWARD_REASON: Record<string, string> = {
  per_referral: 'Σύσταση φίλου', per_referral_pro: 'Σύσταση Επαγγελματία',
  indiv_volume: `${INDIV_VOLUME_TARGET} νέοι μέσα στον μήνα`,
  pro_paid: `${PRO_PAID_TARGET} συνδρομητές μέσα στον μήνα`,
  referee_welcome: 'Δώρο καλωσορίσματος',
  milestone: 'Μηνιαίο μπόνους', partner: 'Ιδιότητα συνεργάτη',
};
const rewardReason = (reason: string) => REWARD_REASON[reason] || 'Μπόνους';
const rewardTitle = (r: Reward) => r.kind === 'slot'
  ? `1 δωρεάν ακίνητο για ${moAcc(r.months)}`
  : `${moNom(r.months)} ${r.tier === 'agency' ? PLANS.agency.nameGen : PLANS.solo.nameGen} δωρεάν`;

// ═══════════════════════════════════════════════════════════════════════════
// ΚΑΡΤΑ ΜΗΝΙΑΙΟΥ ΣΤΟΧΟΥ — ΟΡΙΖΕΤΑΙ ΕΞΩ ΑΠΟ ΤΟ COMPONENT
// ─────────────────────────────────────────────────────────────────────────
// Ήταν δηλωμένη ΜΕΣΑ στο σώμα του TabReferral. Κάθε render έφτιαχνε ΝΕΑ
// συνάρτηση, άρα η React έβλεπε νέο τύπο συστατικού και ΞΑΝΑΠΡΟΣΑΡΤΟΥΣΕ
// ολόκληρο το υποδέντρο: η κίνηση εμφάνισης («ref-rise») ξανάπαιζε από την
// αρχή, ο μετρητής ξεκινούσε πάλι από το μηδέν και κάθε κατάσταση μέσα του
// χανόταν — σε κάθε πάτημα πλήκτρου αλλού στην οθόνη.
//
// Ό,τι χρειάζεται και δεν είναι σταθερό (η κατάσταση διεκδίκησης και η ενέργεια)
// περνά ως prop. Όλα τα υπόλοιπα ήταν ήδη module-level.
// ═══════════════════════════════════════════════════════════════════════════
type ClaimState = 'idle' | 'saving' | 'done' | 'error';

/**
 * ΤΟ ΟΡΟΣΗΜΟ ΕΧΕΙ ΤΟ ΙΔΙΟ ΣΧΗΜΑ ΜΕ ΤΙΣ ΑΛΛΕΣ ΚΑΡΤΕΣ ΑΝΤΑΜΟΙΒΗΣ.
 *
 * ΤΕΣΣΕΡΙΣ ΚΑΡΤΕΣ, ΤΡΙΑ ΣΧΗΜΑΤΑ. Οι δύο πρώτες άνοιγαν με εικονίδιο και
 * κεφαλαία ετικέτα, η τρίτη με τίτλο `h2` δεκαέξι στιγμών και αυτή εδώ με άλλον
 * έναν `h2` συν μετρητή. Ο αναγνώστης δεν έβρισκε δύο φορές την ίδια πληροφορία
 * στο ίδιο ύψος: ένα πλέγμα από τέσσερις κάρτες διαβάζεται ΚΑΘΕΤΑ, στήλη τη
 * στήλη, μόνο όταν η κάθε σειρά σημαίνει το ίδιο πράγμα σε όλες.
 *
 * ΤΩΡΑ ΚΑΘΕ ΚΑΡΤΑ ΛΕΕΙ ΤΑ ΙΔΙΑ ΤΡΙΑ, ΜΕ ΤΗΝ ΙΔΙΑ ΣΕΙΡΑ: τι είναι (εικονίδιο και
 * ετικέτα), τι κερδίζεις (ένα μεγάλο νούμερο) και πώς (μία πρόταση).
 *
 * ΚΑΙ Η ΑΝΤΑΜΟΙΒΗ ΛΕΓΕΤΑΙ ΜΙΑ ΦΟΡΑ. Ηταν γραμμένη και στη μεγάλη γραμμή και
 * μέσα στην πρόταση («…και κέρδισε έναν μήνα επιπλέον Ιδιοκτήτη»). Η πρόταση
 * κρατά πλέον μόνο την ενέργεια που λείπει.
 */
// ═══ ΜΙΑ ΚΑΡΤΑ ΣΤΟΧΟΥ, ΟΧΙ ΔΥΟ ΠΟΥ ΜΟΙΑΖΟΥΝ ═══════════════════════════════════
// Ο «Στόχος του μήνα» και η «Ιδιότητα συνεργάτη» είναι το ίδιο πράγμα: κάτι
// μετριέται, φτάνει σε νούμερο, δίνει δώρο. Ηταν γραμμένες δύο φορές και οι δύο
// γραφές απέκλιναν σε ό,τι μπορούσαν — η μία έβαζε εικονίδιο και ετικέτα πάνω,
// η άλλη τίτλο· η μία έγραφε τον στόχο σε δικό του μεγάλο μέγεθος, η άλλη τον
// έκρυβε σε παράγραφο· η μία μετρούσε «0 / 5», η άλλη «0 / 3 μήνες» με τη
// μονάδα κολλημένη μέσα στον αριθμό.
//
// Μία γραφή, τέσσερα προαιρετικά: η μονάδα δίπλα στον στόχο, η γραμμή κάτω από
// τη μπάρα, η προθεσμία του μήνα και ό,τι κρέμεται από κάτω.
function Milestone({ title, icon, count, target, unit, kind, rewardTitle, claimState, onClaim, note, deadline = true, children }: {
  title: string; icon: string; count: number; target: number; rewardTitle: string;
  /** Η μονάδα δίπλα στον στόχο: «0 / 3 μήνες». Χωρίς αυτήν, σκέτο πλήθος. */
  unit?: string;
  /** Η γραμμή κάτω από τη μπάρα, όταν δεν είναι η τυπική «σου λείπουν N». */
  note?: string;
  /** Η προθεσμία του μήνα. Ο στόχος που μετρά ΜΗΝΕΣ δεν λήγει στο τέλος του μήνα. */
  deadline?: boolean;
  /** Το δώρο αναλυτικά, όταν δεν χωρά σε μία γραμμή. */
  children?: ReactNode;
  /** Το δώρο που παραλαμβάνεται με πάτημα. Χωρίς αυτά, ο στόχος απλώς μετρά. */
  kind?: string; claimState?: ClaimState; onClaim?: (kind: string) => void;
}) {
    const pr = progress(count, target);
    const st = claimState ?? 'idle';
    const dleft = daysLeftInMonth();
    return (
      <div className="ref-lift" style={{ ...card, padding: PAD, position: 'relative', overflow: 'visible', ...(pr.reached ? { borderColor: 'color-mix(in srgb, var(--positive) 38%, var(--border-raised))', background: 'linear-gradient(180deg, color-mix(in srgb, var(--positive) 8%, var(--surface-raised)), var(--surface-raised) 62%)' } : {}) }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, minHeight: 22 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <Ic d={icon} s={16} c="var(--text-secondary)" />
            <span style={{ ...TT.label }}>{title}</span>
          </span>
          <span className={pr.reached ? undefined : 'ref-kpi-hover'} style={{ ...TT.kpi, flexShrink: 0, color: pr.reached ? 'var(--positive)' : undefined }}><Num value={pr.count} /><span style={{ ...TT.caption }}> / {target}{unit ? ` ${unit}` : ''}</span></span>
        </div>
        <div style={{ ...TT.displaySm, marginBottom: 10 }}>{rewardTitle}</div>
        <Bar pct={pr.pct} tone={pr.reached ? 'var(--positive)' : 'var(--accent)'} />
        <p style={{ ...TT.bodySm, marginTop: 12, lineHeight: 1.55 }}>
          {note ?? (pr.reached
            ? 'Μπράβο, το πέτυχες.'
            : pr.count === 0
              ? `Προσκάλεσε ${target} μέσα στον ίδιο μήνα.`
              : pr.remaining === 1
                ? 'Σου λείπει μόλις ένας ακόμη. Είσαι ένα βήμα πριν τον στόχο.'
                : `Σου λείπουν ${pr.remaining} ακόμη. Συνέχισε.`)}
        </p>
        {children && <div style={{ marginTop: 12 }}>{children}</div>}
        {deadline && !pr.reached && (
          <div style={{ ...TT.caption, marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, color: dleft <= 5 ? 'var(--warning)' : 'var(--text-tertiary)' }}>
            <Ic d="M12 8v4l3 2|M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" s={13} c="currentColor" />
            {dleft <= 1 ? 'Τελευταία ημέρα του μήνα' : `Απομένουν ${dleft} ημέρες ως το τέλος του μήνα`}
          </div>
        )}
        {pr.reached && kind && onClaim && (
          <div style={{ marginTop: 12 }}>
            {st === 'done'
              ? <span role="status" style={{ ...TT.bodySm, color: 'var(--positive)', fontWeight: 600 }}>Το δώρο σου καταχωρήθηκε. Πιστώνεται στη συνδρομή σου.</span>
              : <button onClick={() => onClaim(kind)} disabled={st === 'saving'} className="ref-cta" style={{ height: T.h.md, padding: '0 16px', background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: T.radius.pill, fontSize: 12, fontWeight: 700, fontFamily: T.font.sans, cursor: st === 'saving' ? 'default' : 'pointer', opacity: st === 'saving' ? 0.6 : 1 }}>{st === 'saving' ? 'Καταχώρηση…' : 'Πάρ’ το δώρο σου'}</button>}
            {st === 'error' && <div role="alert" style={{ ...TT.caption, color: 'var(--warning)', marginTop: 8 }}>Το δώρο δεν καταχωρήθηκε. Δοκίμασε ξανά.</div>}
          </div>
        )}
      </div>
    );
  }

/** Ο τομέας δεν αλλάζει όσο είναι ανοιχτή η σελίδα: καμία συνδρομή. */
const ORIGIN_NEVER_CHANGES = () => () => {};

export default function TabReferral({ userId, plan = 'free', profileType }: {
  userId: string; plan?: string; profileType: 'individual' | 'professional';
}) {

  const [copied, setCopied] = useState(false);
  const [msgCopied, setMsgCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  // Το Escape, η αρχική εστίαση και η επαναφορά της ήταν γραμμένα εδώ στο χέρι
  // (ένα useEffect, ένας ref στο κουμπί «Έτοιμο») — δεύτερο αντίγραφο αυτού που
  // ήδη κάνει το Modal, χωρίς όμως το κλείδωμα κύλισης του φόντου. Έφυγαν μαζί
  // με το χειρόγραφο overlay: τα δίνει το primitive.
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const [stats, setStats] = useState<Overview | null>(null);
  const [social, setSocial] = useState(0);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [list, setList] = useState<Referee[]>([]);
  const [standing, setStanding] = useState(0);
  const [claim, setClaim] = useState<Record<string, 'idle' | 'saving' | 'done' | 'error'>>({});
  // Η ΔΙΕΥΘΥΝΣΗ ΤΟΥ ΙΣΤΟΤΟΠΟΥ ΔΕΝ ΕΙΝΑΙ ΚΑΤΑΣΤΑΣΗ. Ήταν κατάσταση με προεπιλογή
  // και effect που την αντικαθιστούσε μετά την πρώτη απόδοση: ο σύνδεσμος
  // πρόσκλησης εμφανιζόταν στιγμιαία με λάθος τομέα και ένα γρήγορο πάτημα
  // «Αντιγραφή» τον έπαιρνε λάθος. Ο διακομιστής δηλώνει τη δική του τιμή.
  const origin = useSyncExternalStore(ORIGIN_NEVER_CHANGES, () => window.location.origin, () => SITE);

  const code = useMemo(() => referralCode(userId), [userId]);
  const link = useMemo(() => referralLink(origin, userId), [origin, userId]);
  const isPro = profileType === 'professional';
  // QR κώδικας συνδέσμου: σχεδιάζεται τοπικά στη συσκευή όταν ανοίξει το modal.
  useEffect(() => {
    if (qrOpen && qrCanvasRef.current) drawQrToCanvas(qrCanvasRef.current, link, { size: 200 });
  }, [qrOpen, link]);

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    let alive = true;
    (async () => {
      try {
        await saved('Ο κωδικός σύστασης δεν καταχωρήθηκε',
          supabase.from('referral_codes').upsert({ user_id: userId, code }, { onConflict: 'user_id' }));
        // Καταγράφει την ανά-σύσταση αξία στο ledger (idempotent) πριν το διαβάσουμε.
        await supabase.rpc('reconcile_referral_rewards', { p_code: code });
        const [{ data }, { data: sp }, { data: rw }, { data: ls }, { data: st }] = await Promise.all([
          supabase.rpc('get_referral_overview', { p_code: code }),
          supabase.rpc('get_referral_social_proof'),
          supabase.from('referral_rewards').select('kind,months,tier,reason,status,created_at').order('created_at', { ascending: false }),
          supabase.rpc('get_referral_list', { p_code: code }),
          supabase.rpc('get_referral_standing'),
        ]);
        if (alive && typeof sp === 'number') setSocial(sp);
        if (alive && Array.isArray(rw)) setRewards(rw as Reward[]);
        if (alive && Array.isArray(ls)) setList(ls as Referee[]);
        if (alive && typeof st === 'number') setStanding(st);
        if (alive && data) setStats({
          invites: Number(data.invites) || 0, activated: Number(data.activated) || 0,
          m_pro: Number(data.m_pro) || 0, m_indiv: Number(data.m_indiv) || 0,
          m_paid: Number(data.m_paid) || 0, m_free: Number(data.m_free) || 0,
          streak: Number(data.streak) || 0, partner: !!data.partner,
        });
      } catch { /* δουλεύει και χωρίς σύνδεση: δείχνει μηδενική πρόοδο */ }
    })();
    return () => { alive = false; };
  }, [userId, code]);

  // ΤΟ ΜΗΝΥΜΑ ΠΟΥ ΣΤΕΛΝΕΙ Ο ΧΡΗΣΤΗΣ ΣΕ ΦΙΛΟ ΤΟΥ. Αν ο φίλος ανοίξει το app και
  // δει άλλο πράγμα από αυτό που του υποσχέθηκαν, εκτίθεται ο χρήστης μας — γι'
  // αυτό το κείμενο διαβάζεται από τη μηχανή, όχι από τη διάθεση.
  //
  // ΕΦΥΓΕ ΤΟ «ΣΤΟ ΠΑΚΕΤΟ ΠΟΥ ΘΑ ΔΙΑΛΕΞΕΙΣ», ΓΙΑ ΔΥΟ ΜΕΤΡΗΜΕΝΟΥΣ ΛΟΓΟΥΣ.
  // 1) Ο δωρεάν μήνας δεν αποδίδεται στο πακέτο της επιλογής: η
  //    sync_comp_from_referrals γράφει comp_plan από τον ΤΥΠΟ ΠΡΟΦΙΛ, άρα
  //    «Ιδιοκτήτης+» στον Ιδιώτη και «Επαγγελματίας» στον Επαγγελματία. Ο
  //    φίλος που διάλεγε «Επαγγελματίας+» (79,90 €) διάβαζε μήνα σε αυτό και
  //    έπαιρνε ένα σκαλί πιο κάτω (24,90 €).
  // 2) Η ίδια φράση μπαίνει και στο τρίτο βήμα, όπου ο υποκείμενος είναι ο
  //    φίλος: έβγαινε «Εκείνος παίρνει έναν μήνα δωρεάν στο πακέτο που θα
  //    διαλέξεις», δηλαδή δεύτερο πρόσωπο μέσα σε πρόταση τρίτου προσώπου.
  // Ποιο πακέτο πιάνει ο μήνας λέγεται στην κάρτα «Ο φίλος σου κερδίζει», που
  // έχει χώρο να ονομάσει και τα δύο.
  // ═══ ΤΙ ΚΕΡΔΙΖΕΙ ΠΡΑΓΜΑΤΙΚΑ Ο ΦΙΛΟΣ: ΤΗ ΔΟΚΙΜΗ ΠΟΥ ΠΑΙΡΝΟΥΝ ΟΛΟΙ ══════════
  //
  // ΕΔΩ ΓΡΑΦΟΤΑΝ «έναν μήνα συνδρομή δωρεάν» ΚΑΙ ΔΕΝ ΤΟΝ ΕΠΑΙΡΝΕ ΠΟΤΕ. Ελέγχθηκε
  // στη ρίζα: και οι πέντε εγγραφές στο `referral_rewards` γράφουν `v_owner`,
  // δηλαδή τον ΣΥΣΤΗΝΟΝΤΑ. Δεν υπάρχει trigger στον πίνακα `referrals` και
  // κανένα μονοπάτι εγγραφής δεν επιμηκύνει τη δοκιμή του νέου χρήστη.
  //
  // ΓΙΑΤΙ ΕΙΝΑΙ ΤΟ ΧΕΙΡΟΤΕΡΟ ΕΙΔΟΣ ΛΑΘΟΥΣ: η φράση δεν έμενε στην οθόνη. Μπαίνει
  // στο έτοιμο μήνυμα που ο χρήστης αντιγράφει και στέλνει στον φίλο του. Η
  // εφαρμογή έβαζε τον ΙΔΙΟ ΤΟΝ ΧΡΗΣΤΗ να δώσει υπόσχεση που δεν τηρείται.
  //
  // Η ΑΠΟΦΑΣΗ ΠΑΡΘΗΚΕ: Η ΑΠΟΝΟΜΗ ΔΕΝ ΧΤΙΖΕΤΑΙ. Ο προσκεκλημένος παίρνει τη
  // δοκιμή, όπως κάθε νέος λογαριασμός. Η `refereeWelcome` και οι σταθερές
  // `REFEREE_*` σβήστηκαν από το lib/referral στο ίδιο πέρασμα: όσο έμεναν,
  // διαβάζονταν ως κανόνας που απλώς δεν είχε συνδεθεί ακόμη.
  const friendGift = `${TRIAL_DAYS} ημέρες δωρεάν δοκιμή`;
  const invite = isPro
    ? `Για το ακίνητό σου, σου προτείνω το PROPERWISE. Κρατάει τα οικονομικά σου σε τάξη και ετοιμάζει σωστά τα στοιχεία για τη φορολογική σου δήλωση, ώστε να μην τρέχεις εσύ. Με τον σύνδεσμό μου κερδίζεις ${friendGift}: ${link}`
    : `Οργανώνω το ακίνητό μου με το PROPERWISE και μου έλυσε τα χέρια: σαρώνω λογαριασμούς, βλέπω φόρους και αποδόσεις, όλα σε ένα. Ρίξε του μια ματιά. Με τον σύνδεσμό μου κερδίζεις ${friendGift}: ${link}`;

  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ } };
  const copyMsg = async () => { try { await navigator.clipboard.writeText(invite); setMsgCopied(true); setTimeout(() => setMsgCopied(false), 1800); } catch { /* ignore */ } };
  // GDPR φορητότητα (Άρθ. 15/20): εξαγωγή των δικών σου δεδομένων σύστασης σε CSV.
  const exportMyData = () => {
    const rows: (string | number | null)[][] = [];
    list.forEach(rf => rows.push(['Πρόσκληση', csvDate(rf.created_at), rf.activated_at ? 'Ενεργοποιήθηκε' : 'Εκκρεμεί ενεργοποίηση', rf.activated_at ? csvDate(rf.activated_at) : '']));
    rewards.forEach(r => rows.push(['Ανταμοιβή', csvDate(r.created_at), r.status === 'granted' ? 'Ενεργό' : 'Σε εκκρεμότητα', `${rewardTitle(r)} · ${rewardReason(r.reason)}`]));
    downloadTableXlsx(`Προσκλήσεις ${code}`, {
      title: 'Προσκλήσεις και ανταμοιβές',
      headers: ['Κατηγορία', 'Ημερομηνία', 'Κατάσταση', 'Λεπτομέρεια'], rows,
    });
  };
  const nativeShare = async () => { try { await (navigator as Navigator & { share?: (d: { text: string }) => Promise<void> }).share?.({ text: invite }); } catch { /* ignore */ } };
  const doClaim = async (kind: string) => {
    setClaim(c => ({ ...c, [kind]: 'saving' }));
    try {
      const supabase = createClient();
      const { data } = await supabase.rpc('claim_referral_bonus', { p_code: code, p_kind: kind });
      const ok = data && (data as { ok?: boolean }).ok;
      setClaim(c => ({ ...c, [kind]: ok ? 'done' : 'error' }));
    } catch { setClaim(c => ({ ...c, [kind]: 'error' })); }
  };

  const emailSubject = isPro ? 'Πρόσκληση στο PROPERWISE για τα ακίνητα των πελατών σου' : 'Σου προτείνω το PROPERWISE για το ακίνητό σου';
  const shares = [
    { label: 'WhatsApp', href: `https://wa.me/?text=${encodeURIComponent(invite)}`, d: 'M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-4-1L3 20l1-4.5a8.5 8.5 0 0 1-1-4A8.38 8.38 0 0 1 11.5 3 8.5 8.5 0 0 1 21 11.5z' },
    { label: 'Viber', href: `viber://forward?text=${encodeURIComponent(invite)}`, d: 'M12 3a9 9 0 0 0-9 9 8.7 8.7 0 0 0 2 5.6L4 21l3.6-1a9 9 0 1 0 4.4-17z|M9 8c1.5 3 3.5 5 6.5 6' },
    { label: 'Telegram', href: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(invite)}`, d: 'M21 4 3 11l5 2 2 6 3-4 5 4z' },
    { label: 'Ηλ. ταχυδρομείο', href: `mailto:?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(invite)}`, d: 'M2 5h20v14H2z|M2 6l10 7 10-7' },
  ];

  // ΤΟ «monthly / annual» ΔΕΝ ΕΙΝΑΙ ΠΑΚΕΤΟ, ΕΙΝΑΙ ΚΥΚΛΟΣ ΧΡΕΩΣΗΣ. Η στήλη
  // billing_profiles.plan κρατά ΟΝΟΜΑ ΠΑΚΕΤΟΥ ('free', 'solo', 'owner',
  // 'agency', 'office'), οπότε η σύγκριση με τις δύο αυτές τιμές ήταν πάντα
  // false: κανένας συστήνων δεν μετρούσε ποτέ ως συνδρομητής. Η βάση είχε ήδη
  // την ίδια διόρθωση (20260811090000, is_paying_plan) και ένα test τη φυλάει
  // στο SQL· το αντίγραφο εδώ έμεινε πίσω. Η ίδια πηγή δίνει την απάντηση:
  // πληρωμένο είναι το πακέτο με τιμή.
  const referrerPaying = (PLANS[plan as PlanId]?.priceMonthly ?? 0) > 0;
  // ═══ ΤΡΙΑ ΒΗΜΑΤΑ, ΤΡΕΙΣ ΙΣΕΣ ΓΡΑΜΜΕΣ ══════════════════════════════════════
  // ΤΟ ΣΦΑΛΜΑ ΗΤΑΝ ΟΡΑΤΟ ΩΣ ΚΕΝΟ: το τρίτο βήμα κουβαλούσε τέσσερις σειρές με
  // ολόκληρο τον μηχανισμό του στόχου, ενώ τα δύο πρώτα είχαν μία. Οι τρεις
  // κάρτες παίρνουν το ύψος της ψηλότερης, οπότε η οθόνη έδειχνε δύο μισοάδεια
  // κουτιά δίπλα σε ένα γεμάτο. Και ο μηχανισμός ήταν ΗΔΗ γραμμένος, δύο φορές,
  // στις δύο κάρτες στόχου από πάνω: εδώ λεγόταν τρίτη.
  //
  // Ενα βήμα είναι μία πράξη και μία πρόταση. Ο,τι δεν χωρά σε μία πρόταση δεν
  // είναι βήμα, είναι όρος — και οι όροι ζουν στον στόχο που τους μετρά.
  const steps = isPro
    ? [
        { n: '1', t: 'Στέλνεις τον σύνδεσμο', d: 'Στους ιδιοκτήτες που έχεις πελάτες.', d2: 'M22 2 11 13|M22 2 15 22l-4-9-9-4z' },
        { n: '2', t: 'Ο νέος ιδιοκτήτης ξεκινά', d: 'Ένα ακίνητο, ένα σαρωμένο έγγραφο.', d2: 'M22 11.08V12a10 10 0 1 1-5.93-9.14|M22 4 12 14.01l-3-3' },
        { n: '3', t: 'Παίρνεις πίσω τη συνδρομή σου', d: 'Δωρεάν μήνες Επαγγελματία.', d2: 'M23 6l-9.5 9.5-5-5L1 18|M17 6h6v6' },
      ]
    : [
        { n: '1', t: 'Στέλνεις τον σύνδεσμο', d: 'Σε έναν ιδιοκτήτη ακινήτου.', d2: 'M22 2 11 13|M22 2 15 22l-4-9-9-4z' },
        { n: '2', t: 'Ο νέος ιδιοκτήτης ξεκινά', d: 'Ένα ακίνητο, ένα σαρωμένο έγγραφο.', d2: 'M22 11.08V12a10 10 0 1 1-5.93-9.14|M22 4 12 14.01l-3-3' },
        { n: '3', t: 'Παίρνεις το δώρο σου', d: `Ένα επιπλέον ακίνητο για ${moAcc(REFERRER_SLOT_MONTHS)}.`, d2: 'M20 12v9H4v-9|M2 7h20v5H2z|M12 22V7|M12 7S9 2 6.5 4.5 12 7 12 7z|M12 7s3-5 5.5-2.5S12 7 12 7z' },
      ];

  const partner = stats?.partner ?? false;
  const streak = Math.min(stats?.streak ?? 0, STREAK_TARGET_MONTHS);
  const youBase = individualReferrerReward(referrerPaying, 'free');   // τι κερδίζεις για δωρεάν φίλο
  const styleBlock = (
    <style>{`
      .ref-chip { transition: border-color .16s ${T.ease.standard}, background .16s, color .16s, transform .16s; }
      .ref-chip:hover { border-color: var(--accent-border); background: var(--accent-dim); color: var(--accent); transform: translateY(-1px); }
      .ref-chip:hover svg { stroke: var(--accent); }
      .ref-step { transition: transform .18s ${T.ease.standard}, box-shadow .18s, border-color .18s; }
      .ref-step:hover { transform: translateY(-2px); box-shadow: var(--highlight-inset-strong), var(--elev-3); border-color: var(--accent-border); }
      .ref-step:hover .ref-step-ic { color: var(--accent); }
      .ref-step:hover .ref-step-n { background: var(--accent-dim); color: var(--accent); }
      .ref-cta { transition: filter .15s, transform .15s; }
      .ref-cta:hover { filter: brightness(1.06); transform: translateY(-1px); }
      .ref-linkbox { transition: border-color .16s ${T.ease.standard}; }
      .ref-linkbox:hover { border-color: var(--accent-border); }
      .ref-lift { transition: transform .18s ${T.ease.standard}, box-shadow .18s, border-color .18s; }
      .ref-lift:hover { transform: translateY(-2px); box-shadow: var(--highlight-inset-strong), var(--elev-3); border-color: var(--accent-border); }
      .ref-kpi-hover { color: var(--text-primary); transition: color .16s ${T.ease.standard}; }
      .ref-lift:hover .ref-kpi-hover { color: var(--accent); }
      .ref-hover-accent:hover .ref-kpi-hover { color: var(--accent); }
      @keyframes ref-rise { 0% { opacity: 0; transform: translateY(6px); } 100% { opacity: 1; transform: none; } }
      .ref-rise { animation: ref-rise .5s ${T.ease.decel} both; }
      @media (prefers-reduced-motion: reduce) { .ref-chip:hover, .ref-step:hover, .ref-cta:hover, .ref-lift:hover { transform: none; } .ref-rise { animation: none; } }
    `}</style>
  );

  return (
    <div style={pageShell(900)}>
      {styleBlock}

      {/* ── QR κωδικός συνδέσμου (για διά ζώσης πρόσκληση) ──
          Το παράθυρο ήταν χειρόγραφο, με ΔΙΚΟ ΤΟΥ scrim `rgba(6,12,24,0.55)`
          (τιμή εκτός tokens, ενώ το T.scrim λέει `rgba(0,0,0,0.55)`) και δικό
          του z-index 60 — δηλαδή κάτω από κάθε άλλο παράθυρο της εφαρμογής,
          που ζει στο 1000. Τίτλος, μία πρόταση, περιεχόμενο και μία ενέργεια:
          αυτό ακριβώς είναι το Modal. */}
      <Modal open={qrOpen} onClose={() => setQrOpen(false)} size="sm"
        ariaLabel="Κωδικός QR πρόσκλησης"
        title="Σάρωσε για να προσκαλέσεις"
        subtitle="Δείξε τον κωδικό ώστε να ανοίξει τον σύνδεσμό σου από το κινητό."
        footer={<button onClick={() => setQrOpen(false)} className="ref-cta" style={{ height: T.h.lg, padding: '0 22px', background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: T.radius.pill, fontSize: 13, fontWeight: 700, fontFamily: T.font.sans, cursor: 'pointer' }}>Έτοιμο</button>}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ background: 'var(--qr-paper)', padding: 14, borderRadius: T.radius.inner, display: 'inline-block', boxShadow: 'var(--well-inset)' }}>
            <canvas ref={qrCanvasRef} role="img" aria-label="Κωδικός QR πρόσκλησης" style={{ display: 'block' }} />
          </div>
        </div>
      </Modal>

      {/* ── Κεφαλίδα ── */}
      <div style={{ marginBottom: T.sp.xxl }}>
        {/* ═══ Η ΙΔΙΟΤΗΤΑ ΤΡΕΙΣ ΦΟΡΕΣ ΣΤΗΝ ΙΔΙΑ ΟΘΟΝΗ ══════════════════════════
            Το σήμα «Ιδιώτης» στεκόταν εδώ, ξανά στην κάρτα των στατιστικών από
            κάτω και ΗΔΗ στην πάνω μπάρα της εφαρμογής — που φαίνεται σε κάθε
            καρτέλα. Η ιδιότητα του χρήστη δεν αλλάζει επειδή άνοιξε τις
            προσκλήσεις: δεν είναι πληροφορία αυτής της οθόνης, είναι κατάσταση
            του λογαριασμού και λέγεται εκεί που ζει ο λογαριασμός. */}
        {/* ΙΔΙΑ ΚΕΦΑΛΙΔΑ ΜΕ ΤΙΣ ΑΛΛΕΣ ΕΝΤΕΚΑ ΚΑΡΤΕΛΕΣ. Ήταν στημένη στο χέρι
            (ετικέτα, τίτλος, παράγραφος), με δικά της περιθώρια και ΜΠΛΕ
            ετικέτα — ενώ κάθε άλλη ετικέτα κεφαλίδας στην εφαρμογή είναι
            ουδέτερη. Το μπλε είναι το χρώμα της ενέργειας, όχι της τοποθεσίας.
            Και το όνομα γραφόταν «PROPERWISE», σε έντεκα σημεία, ενώ σε άλλα
            εκατόν ένα γράφεται «PROPERWISE». */}
        <PageTitle
          over={isPro ? 'PROPERWISE · Πρόγραμμα Συνεργατών' : 'PROPERWISE · Πρόγραμμα Πρόσκλησης'}
          title={isPro ? 'Προσκάλεσε τους πελάτες σου. Πάρε τον ίδιο φάκελο από όλους.' : 'Ξέρεις κι άλλον ιδιοκτήτη;'}
          lede={isPro
            ? 'Κάθε ιδιοκτήτης που προσκαλείς φτάνει σε εσένα με τον ίδιο φάκελο, στην ίδια δομή, με ονόματα αρχείων που δεν αλλάζουν από χρόνο σε χρόνο. Εσύ σταματάς να κυνηγάς έγγραφα τον Ιούνιο και κερδίζεις δωρεάν μήνες Επαγγελματία.'
            : 'Δείξε του πώς να βάλει το ακίνητό του σε τάξη. Με κάθε ιδιοκτήτη που ξεκινά, κερδίζετε και οι δύο.'} />
        {(standing > 0 || social >= 8) && (
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            {standing > 0 && (
              <div className="ref-rise" style={PILL}>
                <span style={{ color: 'var(--accent)', display: 'inline-flex' }}><Ic d="M23 6l-9.5 9.5-5-5L1 18|M17 6h6v6" s={15} /></span>
                <span style={{ ...TT.bodySm, color: PILL_TEXT, fontWeight: 600 }}>Είσαι στο κορυφαίο {standing}% όσων προσκαλούν αυτόν τον μήνα</span>
              </div>
            )}
            {social >= 8 && (
              <div className="ref-rise" style={PILL}>
                <span style={{ color: 'var(--accent)', display: 'inline-flex' }}><Ic d="M20 21v-2a4 4 0 0 0-3-3.87|M4 21v-2a4 4 0 0 1 3-3.87|M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M16 3.13a4 4 0 0 1 0 7.75" s={15} /></span>
                <span style={{ ...TT.bodySm, color: PILL_TEXT, fontWeight: 600 }}>{fn(social)} ιδιοκτήτες κάλεσαν φίλο αυτόν τον μήνα</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Σύνδεσμος πρόσκλησης (focal, elevated) ── */}
      <div style={{ ...card, boxShadow: 'var(--highlight-inset), var(--elev-2)', padding: 'clamp(18px, 2.4vw, 26px)', marginBottom: T.sp.xl }}>
        {/* Ο ΚΩΔΙΚΟΣ ΕΣΠΑΓΕ ΤΗ ΣΕΙΡΑ ΤΩΝ ΚΟΥΜΠΙΩΝ, ΚΑΙ ΔΕΝ ΕΙΝΑΙ ΚΟΥΜΠΙ. Καθόταν
            τελευταίος μέσα στη σειρά των επτά τρόπων κοινοποίησης, με `margin-left:
            auto`: ένα όγδοο στοιχείο που δεν πατιέται, να διεκδικεί χώρο από επτά
            που πατιούνται. Το άθροισμα ξεπερνούσε τη γραμμή και έσπαγε το τελευταίο
            κουμπί μόνο του σε δεύτερη σειρά. Ο κωδικός είναι ΤΑΥΤΟΤΗΤΑ, όχι
            ενέργεια: πάει στην επικεφαλίδα, δίπλα στον σύνδεσμο που τον περιέχει. */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <SectionLabel>Ο προσωπικός σου σύνδεσμος</SectionLabel>
          <span style={{ ...TT.caption }}>Κωδικός <strong style={{ color: 'var(--text-secondary)', fontFamily: T.font.num, letterSpacing: '0.04em' }}>{code}</strong></span>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="ref-linkbox" style={{ flex: 1, minWidth: 240, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface-sunken)', border: '1px solid var(--border-default)', borderRadius: T.radius.inner, padding: '11px 14px', minHeight: 44, boxSizing: 'border-box', boxShadow: 'var(--well-inset)' }}>
            <Ic d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1|M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" s={15} c="var(--text-tertiary)" />
            <span style={{ ...TT.body, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link}</span>
          </div>
          {/* Το 44 μένει σκόπιμα εκτός κλίμακας (T.h.lg = 40): είναι το ελάχιστο μέγεθος
              στόχου αφής και ζευγαρώνει με το minHeight:44 του πλαισίου συνδέσμου δίπλα.
              Αν πέσει στα 40, τα δύο στοιχεία της ίδιας γραμμής παύουν να ευθυγραμμίζονται. */}
          <button onClick={copy} className="ref-cta" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 44, padding: '0 20px', background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: T.radius.inner, fontSize: 13, fontWeight: 700, fontFamily: T.font.sans, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <Ic d={copied ? 'M20 6 9 17l-5-5' : 'M8 4h10a2 2 0 0 1 2 2v10|M4 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z'} s={15} />
            {copied ? 'Αντιγράφηκε' : 'Αντιγραφή'}
          </button>
        </div>
        <span aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{copied ? 'Ο σύνδεσμος αντιγράφηκε' : msgCopied ? 'Το μήνυμα αντιγράφηκε' : ''}</span>
        <div style={{ display: 'flex', gap: 7, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {shares.map(s => (
            <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" className="ref-chip" style={CHIP}>
              <Ic d={s.d} s={15} c="var(--text-tertiary)" />{s.label}
            </a>
          ))}
          <button onClick={copyMsg} className="ref-chip" style={{ ...CHIP, cursor: 'pointer', fontFamily: T.font.sans }}>
            <Ic d={msgCopied ? 'M20 6 9 17l-5-5' : 'M8 4h10a2 2 0 0 1 2 2v10|M4 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z'} s={15} c="var(--text-tertiary)" />{msgCopied ? 'Αντιγράφηκε' : 'Μήνυμα'}
          </button>
          <button onClick={() => setQrOpen(true)} className="ref-chip" style={{ ...CHIP, cursor: 'pointer', fontFamily: T.font.sans }}>
            <Ic d="M3 3h7v7H3z|M14 3h7v7h-7z|M3 14h7v7H3z|M14 14h3v3|M20 20h1|M20 14h1|M14 20h1" s={15} c="var(--text-tertiary)" />QR
          </button>
          <button onClick={nativeShare} className="ref-chip" style={{ ...CHIP, cursor: 'pointer', fontFamily: T.font.sans }}>
            <Ic d="M4 12v8h16v-8|M12 16V4|M8 8l4-4 4 4" s={15} c="var(--text-tertiary)" />Κοινοποίηση
          </button>
        </div>
      </div>

      {/* ═══ Η ΠΡΟΤΡΟΠΗ ΠΟΥ ΕΠΑΝΕΛΑΒΕ ΤΑ ΚΟΥΜΠΙΑ ΑΠΟ ΠΑΝΩ ══════════════════
          Εδώ ζούσε κάρτα «Κάνε την πρώτη σου πρόσκληση» με κουμπί «Μοιράσου
          τώρα», σε έντονο πλαίσιο και βαμμένο φόντο. Δεκαπέντε εικονοστοιχεία
          πιο πάνω, στην ίδια οθόνη, υπάρχουν ήδη επτά τρόποι να μοιραστεί ο
          σύνδεσμος: WhatsApp, Viber, Telegram, μήνυμα, αντιγραφή, κωδικός QR
          και κοινοποίηση. Η κάρτα δεν πρόσθετε δρόμο, πρόσθετε πλαίσιο — και
          μάλιστα το πιο έντονο της σελίδας, γύρω από το λιγότερο νέο πράγμα.

          Ένα προϊόν που φωνάζει στον χρήστη να κάνει αυτό που μόλις του έδειξε
          πώς να κάνει δεν είναι εργαλείο· είναι διαφήμιση του εαυτού του. */}

      {/* Όσο το `stats` είναι null δεν αποδιδόταν ΤΙΠΟΤΑ εδώ: οι τρεις μετρικές
          έπεφταν μέσα αργότερα και έσπρωχναν όλη τη σελίδα προς τα κάτω, τη στιγμή
          που ο χρήστης διάβαζε ήδη τα παρακάτω. Ο σκελετός κρατά τη θέση τους. */}
      {!stats && <SkeletonKPIs n={3} />}

      {/* ── Τα κέρδη σου με μια ματιά (μόλις υπάρχει δραστηριότητα) ── */}
      {stats && stats.invites > 0 && (
        <div className="ref-rise ref-hover-accent" style={{ ...card, boxShadow: 'var(--highlight-inset), var(--elev-2)', borderColor: 'var(--accent-border)', background: 'linear-gradient(180deg, var(--accent-soft), transparent 160%)', padding: PAD, marginBottom: T.sp.xl, display: 'flex', alignItems: 'center', gap: 'clamp(16px, 3vw, 28px)', flexWrap: 'wrap' }}>
          {([
            ['Προσκλήσεις', stats.invites, false],
            ['Ενεργοποιήθηκαν', stats.activated, true],
            [isPro ? 'Συνδρομητές τον μήνα' : 'Νέοι τον μήνα', isPro ? stats.m_paid : stats.m_indiv, false],
          ] as [string, number, boolean][]).map(([l, v, hi], i) => (
            <div key={i} style={{ minWidth: 88 }}>
              <div className={hi ? 'ref-kpi-hover' : undefined} /* 26 δεν υπάρχει στην τυπογραφική κλίμακα (…22, 24, 28…): ήταν ένα μέγεθος
                     φτιαγμένο στο μάτι, μόνο γι' αυτά τα τρία πλακίδια. Το 24 είναι το
                     αμέσως επόμενο σκαλί και το ίδιο που χρησιμοποιεί το TT.displaySm. */
                  style={{ ...TT.kpi, fontSize: 24, color: hi ? undefined : 'var(--text-primary)' }}><Num value={Number(v)} /></div>
              <div style={{ ...TT.caption, marginTop: 3 }}>{l}</div>
            </div>
          ))}
          {/* Ήταν «Κάρτα προόδου»: ένα PNG 1080×1350 με νόμισμα, ακτίνες και τέσσερα
              καρφωμένα χρώματα εκτός του σχεδιαστικού συστήματος. Στη θέση του, η
              ενέργεια που όντως φέρνει την επόμενη ανταμοιβή. */}
          <button onClick={async () => { await nativeShare(); copy(); }} className="ref-cta" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, height: T.h.lg, padding: '0 18px', background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: T.radius.pill, fontSize: 13, fontWeight: 700, fontFamily: T.font.sans, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <Ic d="M4 12v8h16v-8|M12 16V4|M8 8l4-4 4 4" s={15} />Στείλε άλλη πρόσκληση
          </button>
        </div>
      )}

      {isPro ? (
        /* ═══ ΕΠΑΓΓΕΛΜΑΤΙΑΣ — ο φάκελος, μετά οι στόχοι, μετά ο Συνεργάτης ═══ */
        <>
          {/* ΤΟ ΜΟΝΟ ΠΟΥ ΕΝΔΙΑΦΕΡΕΙ ΤΟΝ ΛΟΓΙΣΤΗ, ΚΑΙ ΕΛΕΙΠΕ.
              Η οθόνη τον έβλεπε ως γενικό «Επαγγελματία» και του πούλαγε προμήθεια.
              Το 80% της δουλειάς του τον Ιούνιο είναι να ζητάει έγγραφα από
              ανθρώπους που δεν απαντούν· η αξία είναι «ο ίδιος φάκελος, με την ίδια
              ονοματοδοσία, από όλους». Ο σύνδεσμος μόνο-ανάγνωσης υπάρχει ήδη στις
              Ρυθμίσεις — εδώ λέγεται γιατί αξίζει να τον μοιράσει. */}
          <SectionLabel>Γιατί να στείλεις τον σύνδεσμο στους πελάτες σου</SectionLabel>
          <div style={{ ...card, padding: PAD, marginBottom: T.sp.xl }}>
            <ul style={{ ...TT.bodySm, lineHeight: 1.7, margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
              {/* ═══ ΤΕΣΣΕΡΑ ΟΦΕΛΗ, ΟΧΙ ΤΕΣΣΕΡΙΣ ΠΑΡΑΓΡΑΦΟΙ ═══════════════════════
                  Δύο από τα τέσσερα τύλιγαν σε δεύτερη σειρά και το τελευταίο
                  κουβαλούσε ΟΔΗΓΙΕΣ ΠΛΟΗΓΗΣΗΣ («Ρυθμίσεις, Σύνδεσμος για τον
                  λογιστή σου») μέσα σε κατάλογο που απαντά «γιατί». Το πού
                  βρίσκεται το κουμπί δεν είναι όφελος.

                  ΚΑΙ ΕΝΑ ΗΤΑΝ ΛΑΘΟΣ: υποσχόταν «αρχείο ΤΙ ΛΕΙΠΕΙ». Ο φάκελος
                  έγινε ένα βιβλίο εργασίας και το «Τι λείπει» είναι ΦΥΛΛΟ μέσα
                  του, με αυτό ακριβώς το όνομα. */}
              {[
                'Ο ίδιος φάκελος από κάθε πελάτη: ίδια δομή, ίδια ονόματα, κάθε χρόνο.',
                'Ένα φύλλο «Τι λείπει» που το γράφει, ώστε να μην το ψάχνεις εσύ.',
                'Οι παγίδες πιασμένες πριν γίνουν λάθη: ΑΜΑ, ακαθάριστα αντί καθαρών, τέλος ανθεκτικότητας.',
                'Δικός σου σύνδεσμος ανά πελάτη, μόνο για ανάγνωση. Χωρίς πελατολόγιο ή στοιχεία τρίτων.',
              ].map((t, i) => (
                <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 3 }}><Ic d="M20 6 9 17l-5-5" s={14} /></span>{t}
                </li>
              ))}
            </ul>
          </div>

          {/* ΕΝΑΣ ΣΤΟΧΟΣ, ΟΧΙ ΤΡΕΙΣ. Ο δεύτερος μετρητής αντάμειβε «δωρεάν
              χρήστες»: εγγραφές χωρίς έσοδο, σε προϊόν που δεν έχει πια δωρεάν
              πακέτο. Ο επαγγελματίας κρατούσε τρία νούμερα στο μυαλό του για να
              καταλάβει τι κερδίζει. Τώρα κρατά ένα. */}
          <SectionLabel>Ο στόχος του μήνα</SectionLabel>
          <div style={{ marginBottom: T.sp.xl }}>
            <Milestone title="Συνδρομητές, σε οποιοδήποτε πακέτο"
              icon="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M23 21v-2a4 4 0 0 0-3-3.9|M16 3.1a4 4 0 0 1 0 7.8"
              count={stats?.m_paid ?? 0} target={PRO_PAID_TARGET} kind="pro_paid"
              rewardTitle={`+${moNom(PRO_PAID_BONUS_MONTHS)} συνδρομής δωρεάν`} claimState={claim.pro_paid || 'idle'} onClaim={doClaim} />
          </div>

          {/* ── Συνεργάτης: Η ΙΔΙΑ ΚΑΡΤΑ ΜΕ ΤΟΝ ΣΤΟΧΟ ΤΟΥ ΜΗΝΑ ──────────────────
              Ηταν δική της γραφή, με άλλη σειρά στοιχείων: τίτλος αντί για
              ετικέτα μετρούμενου, μονάδα κολλημένη μέσα στον αριθμό, το δώρο
              κρυμμένο σε παράγραφο αντί για τη θέση του δώρου. Δύο κάρτες που
              κάνουν την ίδια δουλειά, δίπλα δίπλα, με άλλη ανατομία η καθεμιά.
              Πλέον διαβάζονται με ΤΟ ΙΔΙΟ βλέμμα: τι μετριέται, πόσο, τι
              κερδίζεις, πόσο έχεις φτάσει. */}
          <SectionLabel>Ιδιότητα συνεργάτη</SectionLabel>
          <div style={{ marginBottom: T.sp.xl }}>
            <Milestone title="Μήνες με πιασμένο τον στόχο"
              icon="M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z|M8 21h8"
              count={streak} target={STREAK_TARGET_MONTHS} unit="μήνες" deadline={false}
              rewardTitle={partner ? 'Είσαι Συνεργάτης PROPERWISE' : 'Ιδιότητα Συνεργάτη'}
              note={partner
                ? 'Ενεργή ιδιότητα.'
                : `Πιάσε τον στόχο των ${PRO_PAID_TARGET} συνδρομητών ${STREAK_TARGET_MONTHS} συνεχόμενους μήνες.`}>
              <ul style={{ ...TT.bodySm, lineHeight: 1.7, margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
                {[
                  // ΤΟ ΟΝΟΜΑ ΤΟΥ ΔΩΡΟΥ ΗΤΑΝ ΓΡΑΜΜΕΝΟ ΜΕ ΤΟ ΧΕΡΙ, ΚΑΙ ΗΤΑΝ ΑΛΛΟ. Τώρα
                  // δεν είναι καν σταθερό: το δώρο είναι ένα σκαλί πάνω από το πακέτο
                  // που ήδη έχεις, οπότε το όνομά του το δίνει η ίδια η συνάρτηση που
                  // το αποδίδει. Δύο πηγές για το ίδιο νούμερο έχουν ήδη διαφωνήσει
                  // δύο φορές σε αυτό το αρχείο.
                  `${moNom(PARTNER_WELCOME_MONTHS)} ${PLANS[partnerWelcomeTier(plan)].name} δώρο, μόλις την αποκτήσεις`,
                  `Κάθε μήνας που πιάνει τον στόχο χαρίζει ${moAcc(PARTNER_MONTHLY_FREE_MONTHS)} δωρεάν`,
                  'Προτεραιότητα σε νέες κυκλοφορίες και αναβαθμίσεις',
                ].map((t, i) => (
                  <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ color: partner ? 'var(--accent)' : 'var(--text-tertiary)', flexShrink: 0, marginTop: 3 }}><Ic d="M20 6 9 17l-5-5" s={14} /></span>{t}
                  </li>
                ))}
              </ul>
            </Milestone>
            {/* Η ΜΙΑ ΠΡΟΕΙΔΟΠΟΙΗΣΗ ΠΟΥ ΑΞΙΖΕΙ ΘΕΣΗ: ο μήνας κλείνει και το σερί
                χάνεται. Δεν λέγεται ποτέ όταν δεν υπάρχει σερί να χαθεί. */}
            {(() => {
              const d = daysLeftInMonth();
              const r = PRO_PAID_TARGET - (stats?.m_paid ?? 0);
              if (!(streak >= 1 && r > 0 && d <= 10)) return null;
              return (
                <div style={{ marginTop: 12, display: 'flex', gap: 9, alignItems: 'flex-start', padding: '10px 12px', borderRadius: T.radius.inner, background: 'color-mix(in srgb, var(--warning) 9%, transparent)', border: '1px solid color-mix(in srgb, var(--warning) 26%, transparent)' }}>
                  <span style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 1 }}><Ic d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z|M12 9v4|M12 17h.01" s={15} /></span>
                  <span style={{ ...TT.bodySm, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {d === 1 ? 'Ο μήνας κλείνει αύριο.' : `Ο μήνας κλείνει σε ${d} ημέρες.`} {r === 1 ? 'Σου λείπει ένας συνδρομητής' : `Σου λείπουν ${r} συνδρομητές`} {partner ? 'για να εξασφαλίσεις τον δωρεάν μήνα.' : 'για να διατηρήσεις τους συνεχόμενους μήνες σου.'}
                  </span>
                </div>
              );
            })()}
          </div>
        </>
      ) : (
        /* ═══ ΙΔΙΩΤΗΣ — αξία ανά φίλο + μηνιαίο μπόνους όγκου ═══ */
        <>
          <SectionLabel>Τι κερδίζετε σε κάθε πρόσκληση</SectionLabel>
          <div {...cardGrid(2)}>
            <div className="ref-lift" style={{ ...card, padding: PAD }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Ic d="M12 2l2.4 7.4H22l-6 4.4 2.3 7.2L12 16.6 5.7 21l2.3-7.2-6-4.4h7.6z" s={16} c="var(--text-secondary)" />
                <span style={{ ...TT.label }}>Εσύ κερδίζεις</span>
              </div>
              {/* ΤΟ ΟΝΟΜΑ ΤΟΥ ΠΑΚΕΤΟΥ ΕΡΧΕΤΑΙ ΑΠΟ ΤΟΝ ΤΙΜΟΚΑΤΑΛΟΓΟ. Έγραφε
                  «Ιδιώτη» — πακέτο με αυτό το όνομα δεν υπάρχει· «Ιδιώτης»
                  είναι ο τρόπος χρήσης στις Ρυθμίσεις. Το πακέτο λέγεται
                  «Ιδιοκτήτης» και η ανταμοιβή πρέπει να λέγεται όπως αυτό που
                  θα βρει ο χρήστης στη «Συνδρομή». */}
              <div style={{ ...TT.displaySm, marginBottom: 6 }}>{youBase.isSlot ? '+1 ακίνητο' : `+${moNom(youBase.months)} ${PLANS.solo.nameGen}`}</div>
              <div style={{ ...TT.bodySm, lineHeight: 1.55 }}>{youBase.isSlot
                ? `για ${moAcc(youBase.months)}, στο πακέτο σου, για κάθε φίλο που ενεργοποιεί τον λογαριασμό του.`
                : 'στη συνδρομή σου, για κάθε φίλο που ενεργοποιεί τον λογαριασμό του.'}</div>
            </div>
            <div className="ref-lift" style={{ ...card, padding: PAD }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Ic d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2|M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" s={16} c="var(--text-secondary)" />
                <span style={{ ...TT.label }}>Ο φίλος σου ξεκινά με</span>
              </div>
              <div style={{ ...TT.displaySm, marginBottom: 6 }}>{TRIAL_DAYS} ημέρες δοκιμή</div>
              <div style={{ ...TT.bodySm, lineHeight: 1.55 }}>στο πακέτο που θα διαλέξει, «{PLANS.solo.name}» ή «{PLANS.agency.name}». Η χρέωση ξεκινά μετά τη δοκιμή.</div>
            </div>
          </div>

          <SectionLabel>Επιπλέον μπόνους</SectionLabel>
          <div {...cardGrid(2)}>
            {/* Ποιοτικό μπόνους: φέρε έναν Επαγγελματία */}
            <div className="ref-lift" style={{ ...card, padding: PAD }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, minHeight: 22 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <Ic d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z|M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" s={16} c="var(--text-secondary)" />
                  <span style={{ ...TT.label }}>Προσκάλεσε έναν Επαγγελματία</span>
                </span>
                {(stats?.m_pro ?? 0) >= 1 && <Badge tone="positive">Το πέτυχες</Badge>}
              </div>
              <div style={{ ...TT.displaySm, marginBottom: 6 }}>+{moNom(INDIV_PRO_BONUS_MONTHS)} {PLANS.solo.nameGen}</div>
              <div style={{ ...TT.bodySm, lineHeight: 1.55 }}>μόλις κάποιος που προσκάλεσες γίνει Επαγγελματίας. Ολόκληρος μήνας, όχι ένα ακίνητο.</div>
            </div>
            {/* Μπόνους όγκου: ο στόχος διαβάζεται από τη μηχανή, δεν ξαναγράφεται. */}
            <Milestone title={`${INDIV_VOLUME_TARGET} νέοι τον μήνα`}
              icon="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M23 21v-2a4 4 0 0 0-3-3.9|M16 3.1a4 4 0 0 1 0 7.8"
              count={stats?.m_indiv ?? 0} target={INDIV_VOLUME_TARGET} kind="indiv_volume"
              rewardTitle={`+${moNom(INDIV_VOLUME_BONUS_MONTHS)} ${PLANS.solo.nameGen}`}
              claimState={claim.indiv_volume || 'idle'} onClaim={doClaim} />
          </div>
        </>
      )}

      {/* ── Πώς λειτουργεί: τρία βήματα ── */}
      <SectionLabel>Πώς λειτουργεί</SectionLabel>
      <div {...cardGrid(3)}>
        {steps.map((st, i) => (
          <div key={i} className="ref-step" style={{ ...card, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="ref-step-n" style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--bg-overlay)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, transition: 'background .18s, color .18s' }}>{st.n}</span>
              <span className="ref-step-ic" style={{ color: 'var(--text-tertiary)', transition: 'color .18s' }}><Ic d={st.d2} s={20} /></span>
            </div>
            <div style={{ ...TT.h2, fontSize: 13 }}>{st.t}</div>
            <div style={{ ...TT.bodySm, lineHeight: 1.55 }}>{st.d}</div>
          </div>
        ))}
      </div>

      {/* ── Οι προσκλήσεις σου (χωνί ανά στάδιο, χωρίς στοιχεία ταυτότητας) ── */}
      {list.length > 0 && (
        <div style={{ marginBottom: T.sp.xl }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
            <SectionLabel style={{ margin: 0 }}>Οι προσκλήσεις σου</SectionLabel>
            <div style={{ ...TT.caption }}>{list.filter(r => r.activated_at).length} από {list.length} ενεργοποιήθηκαν</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {list.map((rf, i) => {
              const stage = rf.activated_at ? 'Ενεργοποιήθηκε' : 'Εκκρεμεί ενεργοποίηση';
              const pending = !rf.activated_at;
              const when = new Date(rf.created_at).toLocaleDateString('el-GR', { day: 'numeric', month: 'short' });
              return (
                <div key={i} className="ref-lift" style={{ ...card, display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px' }}>
                  <div style={{ width: 38, height: 38, borderRadius: T.radius.inner, background: pending ? 'var(--surface-sunken)' : 'var(--accent-dim)', color: pending ? 'var(--text-tertiary)' : 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: pending ? 'var(--well-inset)' : undefined }}>
                    <Ic d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2|M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" s={18} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ ...TT.h2, fontSize: 13 }}>{stage}</div>
                    {/* Έλεγε «Εκκρεμεί ενεργοποίηση» χωρίς να λέει ΤΙ λείπει, ενώ ο
                        κανόνας είναι γραμμένος στη βάση (mark_referral_activated: ακίνητο +
                        σαρωμένο έγγραφο). Δύο λέξεις παραπάνω κλείνουν το χωνί. */}
                    <div style={{ ...TT.bodySm, marginTop: 2 }}>{pending
                      ? `Λείπει ${ACTIVATION_MIN_PROPERTIES === 1 ? '1 ακίνητο' : `${ACTIVATION_MIN_PROPERTIES} ακίνητα`} και ${ACTIVATION_MIN_DOCUMENTS === 1 ? '1 σαρωμένο έγγραφο' : `${ACTIVATION_MIN_DOCUMENTS} σαρωμένα έγγραφα`}. Θύμισέ του· κερδίζετε κι οι δύο.`
                      : `Ξεκίνησε ${when}`}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Χωρίς αυτόν τον κλάδο, η ενότητα «Οι προσκλήσεις σου» απλώς ΕΛΕΙΠΕ όταν δεν
          υπήρχαν προσκλήσεις — ο χρήστης δεν είχε τρόπο να ξέρει αν δεν έχει ακόμη
          καμία ή αν η λίστα δεν φόρτωσε. Το `stats &&` κρατά τον έλεγχο μετά τη φόρτωση. */}
      {stats && list.length === 0 && (
        <div style={{ marginBottom: T.sp.xl }}>
          <SectionLabel>Οι προσκλήσεις σου</SectionLabel>
          <EmptyState icon={<UserPlus size={20} />} title="Καμία πρόσκληση ακόμη" hint="Μοιράσου τον σύνδεσμό σου. Κάθε φίλος που ενεργοποιείται εμφανίζεται εδώ." />
        </div>
      )}

      {/* ── Τα δώρα σου (ιστορικό ανταμοιβών) ── */}
      {rewards.length > 0 && (
        <div style={{ marginBottom: T.sp.xl }}>
          <SectionLabel>Τα δώρα σου</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rewards.map((r, i) => {
              const granted = r.status === 'granted';
              const title = rewardTitle(r);
              const reasonLabel = rewardReason(r.reason);
              return (
                <div key={i} className="ref-lift" style={{ ...card, display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px' }}>
                  <div style={{ width: 38, height: 38, borderRadius: T.radius.inner, background: 'var(--accent-dim)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Ic d="M20 12v9H4v-9|M2 7h20v5H2z|M12 22V7|M12 7S9 2 6.5 4.5 12 7 12 7z|M12 7s3-5 5.5-2.5S12 7 12 7z" s={19} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ ...TT.h2, fontSize: 13 }}>{title}</div>
                    <div style={{ ...TT.bodySm, marginTop: 2 }}>{reasonLabel}</div>
                  </div>
                  <Badge tone={granted ? 'positive' : 'warning'}>{granted ? 'Ενεργό' : 'Σε εκκρεμότητα'}</Badge>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ ΤΕΣΣΕΡΙΣ ΠΡΟΤΑΣΕΙΣ ΕΓΙΝΑΝ ΔΥΟ ═════════════════════════════════════
          Ελεγε: πότε κατοχυρώνεται η ανταμοιβή, ΓΙΑΤΙ το κάνουμε έτσι, σε τι
          δίνεται και ότι δεν δίνεται σε μετρητά. Το δεύτερο («έτσι επιβραβεύουμε
          μόνο πραγματικές συστάσεις») είναι το προϊόν που χειροκροτεί τον εαυτό
          του: ο χρήστης δεν ρώτησε γιατί, ρώτησε πότε. Το τρίτο και το τέταρτο
          λένε το ίδιο πράγμα από δύο πλευρές. Μένουν οι δύο απαντήσεις: πότε
          κλειδώνει και σε τι πληρώνεται. */}
      <p style={{ ...TT.caption, lineHeight: 1.6 }}>
        Η ανταμοιβή κλειδώνει μόλις ο φίλος σου προσθέσει {ACTIVATION_MIN_PROPERTIES === 1 ? 'ένα ακίνητο' : `${ACTIVATION_MIN_PROPERTIES} ακίνητα`} και σαρώσει {ACTIVATION_MIN_DOCUMENTS === 1 ? 'ένα έγγραφο' : `${ACTIVATION_MIN_DOCUMENTS} έγγραφα`}.
        {' '}Πάντα σε δωρεάν μήνες ή ακίνητα στη συνδρομή σου, ποτέ σε μετρητά.
      </p>

      {(list.length > 0 || rewards.length > 0) && (
        <div style={{ marginTop: 14 }}><ExportButton onClick={exportMyData} label="Εξαγωγή των δεδομένων μου" /></div>
      )}
    </div>
  );
}
