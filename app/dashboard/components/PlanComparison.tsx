'use client';

// ═══════════════════════════════════════════════════════════════════════════
// PlanComparison — η «φιλόδοξη» επιφάνεια σύγκρισης πλάνων (ξεχωριστή από τη
// νηφάλια Χρέωση). Αποκαλύπτεται μέσα στη σελίδα «Λογαριασμός» όταν ο χρήστης
// πατήσει «Σύγκρινε πλάνα» / «Δες τα πλάνα». Στόχος: premium, καθαρή, ζωντανή,
// αξιόπιστη εμπειρία αναβάθμισης, στο ίδιο design system με όλη την εφαρμογή.
//
// Το «κόλπο N26»: φωτίζουμε ΜΟΝΟ τα κέρδη. Κάθε δυνατότητα που ξεκλειδώνει ένα
// ανώτερο πλάνο (και δεν την έχει το τρέχον) παίρνει διακριτική accent έμφαση,
// ώστε το «τι κερδίζεις αν αναβαθμίσεις» να ξεχωρίζει, χωρίς να φωνάζει.
// Καμία χρέωση εδώ· η πληρωμή (Stripe) έρχεται σύντομα.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, type ReactNode } from 'react';
import { PLANS, PLAN_ORDER, annualPerMonth, type PlanId } from '@/lib/billing/plans';
import { FEATURE_LABEL, FEATURE_MIN_PLAN, planAtLeast, type Feature } from '@/lib/billing/entitlements';
import { isPlanAllowedForProfile } from '@/lib/billing/entitlements';
import { T, Card, SecHdr, Btn, Chip, TierBadge, feAuto } from '@/components/Theme';

// ── Ποια πλάνα συγκρίνονται εδώ ─────────────────────────────────────────────
// ΟΧΙ όλα. Το «Γραφείο» είναι πλάνο για χαρτοφυλάκια άνω των 40 ακινήτων και δεν
// αγοράζεται συγκρίνοντας γραμμές σε πίνακα — αγοράζεται με συνομιλία. Μπαίνοντάς
// το ως τέταρτη στήλη θα στρίμωχνε τις τρεις που ΠΡΑΓΜΑΤΙΚΑ επιλέγει ο χρήστης,
// ιδίως σε κινητό, για να διαφημίσει κάτι που αφορά ελάχιστους. Αναφέρεται με μία
// γραμμή κάτω από τον πίνακα, εκεί που ανήκει.
// ΟΙ ΣΤΗΛΕΣ ΕΙΝΑΙ ΤΑ ΠΛΑΝΑ ΠΟΥ ΜΠΟΡΕΙ ΝΑ ΑΓΟΡΑΣΕΙ ΚΑΠΟΙΟΣ — ΟΛΑ ΤΟΥΣ.
// Έλειπαν το «Ένα ακίνητο» (3,90 €) και το «Γραφείο»: ο συνδρομητής του πρώτου
// άνοιγε τη σύγκριση πλάνων και δεν έβρισκε το δικό του πλάνο πουθενά.
type ComparedPlan = Extract<PlanId, 'free' | 'solo' | 'owner' | 'agency' | 'office'>;
const COMPARED: ComparedPlan[] = ['free', 'solo', 'owner', 'agency', 'office'];

// ── Πίνακας δυνατοτήτων (μία πηγή, καθρεφτίζει τα entitlements) ─────────────
type CellValue = boolean | string;
interface FeatureRow { label: string; values: Record<ComparedPlan, CellValue> }

/** Το όριο ακινήτων γράφεται ΠΑΝΤΑ από τα PLANS, ποτέ με το χέρι: αλλιώς ο
 *  πίνακας αποκλίνει σιωπηλά από αυτό που επιβάλλει ο server. */
const limitLabel = (id: ComparedPlan): string => {
  const n = PLANS[id].maxProperties;
  if (!Number.isFinite(n)) return 'Απεριόριστα';
  return n === 1 ? '1' : `Έως ${n}`;
};

// ── Ο ΠΙΝΑΚΑΣ ΔΕΝ ΞΑΝΑΛΕΕΙ ΤΟΥΣ ΚΑΝΟΝΕΣ· ΤΟΥΣ ΔΙΑΒΑΖΕΙ ────────────────────
// Οι γραμμές ήταν γραμμένες με το χέρι ως booleans ανά πλάνο, και είχαν ήδη
// αποκλίνει από αυτό που ΕΠΙΒΑΛΛΕΙ ο κώδικας:
//
//   · «Εξαγωγή Ε2» έλεγε ότι θέλει «Ιδιοκτήτης». Το `FEATURE_MIN_PLAN` το
//     ξεκλειδώνει από το «Ένα ακίνητο», που κοστίζει πολλαπλάσια λιγότερο.
//   · Το ίδιο και η «Διαχείριση ενοικιαστών & εισπράξεις».
//
// Δηλαδή ο πίνακας τιμών έλεγε στον χρήστη να αγοράσει ακριβότερο πλάνο από όσο
// χρειαζόταν. Δεν είναι θέμα αισθητικής· είναι λάθος τιμολόγηση στην οθόνη που
// ζητά την κάρτα του. Τώρα κάθε κλειδωμένη γραμμή παράγεται από το ίδιο μητρώο
// που κρίνει και την πρόσβαση — δεν μπορούν να διαφωνήσουν.
const gated = (f: Feature): FeatureRow => ({
  label: FEATURE_LABEL[f],
  values: Object.fromEntries(COMPARED.map(p => [p, planAtLeast(p, FEATURE_MIN_PLAN[f])])) as Record<ComparedPlan, CellValue>,
});
/** Γραμμή που ισχύει για όλους — δεν περνά από entitlement. */
const forAll = (label: string): FeatureRow => ({
  label, values: Object.fromEntries(COMPARED.map(p => [p, true])) as Record<ComparedPlan, CellValue>,
});

const MATRIX: FeatureRow[] = [
  { label: 'Ακίνητα', values: Object.fromEntries(COMPARED.map(p => [p, limitLabel(p)])) as Record<ComparedPlan, CellValue> },
  forAll('Σάρωση εγγράφων και βοηθός με φωνή'),
  forAll('Αποδόσεις, δαπάνες, ενέργεια και φόρος 2026'),
  forAll('Έξυπνες ειδοποιήσεις και υπενθυμίσεις'),
  gated('e2_export'),
  gated('rent_collection'),
  gated('multi_property'),
  gated('comparison'),
  gated('clients'),
  gated('portfolio'),
  gated('report_branding'),
];

// Πλέγμα του πίνακα: ετικέτα + 3 στήλες πλάνων. Ελάχιστο πλάτος ώστε σε στενές
// οθόνες να κυλάει μέσα στο δικό του container (η σελίδα δεν σπρώχνεται ποτέ).
const MATRIX_GRID = `minmax(184px, 1.7fr) repeat(${COMPARED.length}, minmax(84px, 1fr))`;

// ── Μικρά εικονίδια ────────────────────────────────────────────────────────
function Check({ tone }: { tone: 'accent' | 'muted' }) {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={tone === 'accent' ? 'var(--accent)' : 'var(--text-secondary)'} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
function LockGlyph() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

// Η δωρεάν δοκιμή ΔΕΝ ανακοινώνεται εδώ. Όσο τρέχει, ανεβάζει το ενεργό πλάνο
// σε «Ιδιοκτήτης», οπότε αυτή η στήλη είναι ήδη «το τρέχον πλάνο σου» — ένα τσιπ
// «30 ημέρες δωρεάν» δεν θα εμφανιζόταν ποτέ. Η κατάσταση της δοκιμής λέγεται
// μία φορά, στο πλαίσιο των Ρυθμίσεων, με τις ημέρες που απομένουν.
export default function PlanComparison({ profileType, currentPlan, onUpgrade }: {
  profileType: 'individual' | 'professional';
  currentPlan: PlanId;
  onUpgrade?: () => void;
}) {
  const [cycle, setCycle] = useState<'monthly' | 'annual'>('monthly');

  const rankOf = (id: PlanId) => PLAN_ORDER.indexOf(id);
  const curRank = rankOf(currentPlan);
  const recommended: PlanId = profileType === 'professional' ? 'agency' : 'owner';
  const lockHint = profileType === 'professional'
    ? 'Διαθέσιμο στον τρόπο «Ιδιώτης»'
    : 'Διαθέσιμο στον τρόπο «Επαγγελματίας»';

  // Κέρδος: κελί ανώτερου πλάνου που προσφέρει κάτι που δεν έχει το τρέχον.
  // boolean → true εκεί & false στο τρέχον. string («Ακίνητα») → κάθε ανώτερο
  // πλάνο (περισσότερα ακίνητα). Η στήλη του τρέχοντος δεν γίνεται ποτέ «κέρδος».
  const isGain = (row: FeatureRow, id: ComparedPlan): boolean => {
    if (rankOf(id) <= curRank) return false;
    const v = row.values[id];
    if (typeof v === 'string') return true;
    // Το «Γραφείο» δεν εμφανίζεται στον πίνακα· αν ο χρήστης είναι ήδη εκεί,
    // δεν έχει τίποτα να «κερδίσει» από τις στήλες που βλέπει.
    const shown = COMPARED.includes(currentPlan as ComparedPlan) ? (currentPlan as ComparedPlan) : 'agency';
    return v === true && row.values[shown] === false;
  };

  return (
    <div>
      {/* ── 1+2. Κεφαλίδα με διακόπτη κύκλου + στήλες πλάνων ───────────────── */}
      <Card className="acc-section" style={{ animationDelay: '0ms' }}>
        <SecHdr label="Σύγκριση πλάνων" right={
          <div style={{ display: 'inline-flex', padding: 3, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 100 }}>
            {(['monthly', 'annual'] as const).map(c => (
              <button key={c} onClick={() => setCycle(c)}
                style={{ appearance: 'none', border: 'none', cursor: 'pointer', padding: '5px 12px', borderRadius: 100, fontFamily: T.font.sans, fontSize: 11, fontWeight: 700, color: cycle === c ? 'var(--text-primary)' : 'var(--text-tertiary)', background: cycle === c ? 'var(--bg-surface)' : 'transparent', boxShadow: cycle === c ? 'var(--elev-1)' : 'none', transition: 'background-color 0.15s cubic-bezier(0.2,0,0,1), border-color 0.15s cubic-bezier(0.2,0,0,1), color 0.15s cubic-bezier(0.2,0,0,1), box-shadow 0.15s cubic-bezier(0.2,0,0,1), transform 0.15s cubic-bezier(0.2,0,0,1), opacity 0.15s cubic-bezier(0.2,0,0,1)' }}>
                {c === 'monthly' ? 'Μηνιαία' : 'Ετήσια'}
              </button>
            ))}
          </div>
        } />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12 }}>
          {COMPARED.map(id => {
            const p = PLANS[id];
            const isCurrent = id === currentPlan;
            const allowed = isPlanAllowedForProfile(profileType, id);
            const locked = !allowed && !isCurrent;
            const popular = !locked && !isCurrent && id === recommended;
            const isFree = p.priceMonthly === 0;
            const colRank = rankOf(id);

            const priceMain = isFree ? '0 €' : cycle === 'annual' ? feAuto(annualPerMonth(id)) : feAuto(p.priceMonthly);
            const priceUnit = isFree ? 'για πάντα' : '/μήνα';
            const monthsFree = p.priceAnnual > 0 && p.priceMonthly > 0 ? Math.round(12 - p.priceAnnual / p.priceMonthly) : 0;

            // Ένα και μόνο «ήρωας»: η προτεινόμενη στήλη (βάθος με surface-hero).
            const heroBg = popular ? 'var(--surface-hero)' : 'var(--bg-surface)';
            const borderColor = isCurrent ? 'var(--accent)' : popular ? 'var(--accent-border)' : 'var(--border-subtle)';
            const boxShadow = popular ? 'var(--highlight-inset), var(--elev-2)' : isCurrent ? '0 0 0 3px var(--accent-dim)' : 'none';

            const cta = isCurrent
              ? <Btn variant="ghost" disabled>Το τρέχον πλάνο σου</Btn>
              : locked
                ? <Btn variant="ghost" disabled>Κλειδωμένο</Btn>
                : colRank > curRank
                  ? <Btn variant="primary" onClick={() => onUpgrade?.()}>Αναβάθμιση</Btn>
                  : <Btn variant="ghost" onClick={() => onUpgrade?.()}>Υποβάθμιση</Btn>;

            return (
              <div key={id} className={locked ? undefined : 'acc-choice'} title={locked ? lockHint : undefined}
                style={{ position: 'relative', display: 'flex', flexDirection: 'column', opacity: locked ? 0.55 : 1, background: heroBg, border: `1.5px solid ${borderColor}`, borderRadius: T.radius.card, boxShadow, padding: 18 }}>

                {popular && (
                  <span style={{ position: 'absolute', top: -9, left: '50%', transform: 'translateX(-50%)', background: 'var(--accent)', color: 'var(--accent-text)', borderRadius: 100, padding: '2px 10px', fontSize: 9, fontWeight: 700, fontFamily: T.font.sans, letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>Πιο δημοφιλές</span>
                )}

                {/* Όνομα + μετάλλιο + ένδειξη κατάστασης */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    {(id === 'owner' || id === 'agency') && <TierBadge tier={id} showLabel={false} size={22} />}
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.sans }}>{p.name}</span>
                  </span>
                  {isCurrent ? (
                    <Chip tone="accent">
                      <span className="acc-live-dot accent" style={{ width: 6, height: 6, background: 'var(--accent)' }} />
                      Το πλάνο σου
                    </Chip>
                  ) : locked ? (
                    <span style={{ color: 'var(--text-tertiary)', display: 'inline-flex', flexShrink: 0 }}><LockGlyph /></span>
                  ) : null}
                </div>

                {/* Ταγκλάιν πλάνου */}
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.5, marginTop: 6, minHeight: 34 }}>{p.tagline}</div>

                {/* Τιμή */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 12 }}>
                  <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: isCurrent ? 'var(--accent)' : 'var(--text-primary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{priceMain}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>{priceUnit}</span>
                </div>

                {!isFree && cycle === 'annual' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{feAuto(p.priceAnnual)}/χρόνο</span>
                    {monthsFree > 0 && (
                      <Chip tone="positive">περίπου {monthsFree} μήνες δωρεάν</Chip>
                    )}
                  </div>
                )}

                {/* Το κόστος ανά ακίνητο βγαίνει από τα PLANS: όποτε αλλάξει τιμή ή
                    όριο, η γραμμή ακολουθεί χωρίς να ξεχαστεί. */}
                {!isFree && Number.isFinite(p.maxProperties) && p.maxProperties > 1 && (
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.5, marginTop: 8 }}>
                    {p.maxProperties} ακίνητα, {feAuto(Math.round((p.priceMonthly / p.maxProperties) * 100) / 100)} το καθένα τον μήνα.
                  </div>
                )}


                {/* CTA, καρφωμένο στη βάση ώστε οι στήλες να ισοϋψούνται */}
                <div style={{ marginTop: 'auto', paddingTop: 16 }}>{cta}</div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── 3. Πίνακας δυνατοτήτων ────────────────────────────────────────── */}
      <Card className="acc-section" style={{ animationDelay: '80ms' }}>
        <SecHdr label="Τι περιλαμβάνει κάθε πλάνο" />

        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 560 }}>
            {/* Κεφαλίδα πίνακα: επανάληψη ονομάτων, μικρά & διακριτικά */}
            <div style={{ display: 'grid', gridTemplateColumns: MATRIX_GRID, alignItems: 'end', borderBottom: '1px solid var(--border-subtle)', paddingBottom: 10 }}>
              <div />
              {COMPARED.map(id => (
                <div key={id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '0 8px' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', fontFamily: T.font.sans, textAlign: 'center' }}>{PLANS[id].name}</span>
                </div>
              ))}
            </div>

            {/* Γραμμές δυνατοτήτων */}
            {MATRIX.map(row => (
              <div key={row.label} style={{ display: 'grid', gridTemplateColumns: MATRIX_GRID, alignItems: 'center', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.4, padding: '13px 12px 13px 2px' }}>{row.label}</div>
                {COMPARED.map(id => {
                  const v = row.values[id];
                  const gain = isGain(row, id);
                  let content: ReactNode;
                  if (typeof v === 'string') {
                    content = <span style={{ fontSize: 13, fontWeight: gain ? 700 : 600, color: 'var(--text-primary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{v}</span>;
                  } else if (v === true) {
                    content = <Check tone="muted" />;
                  } else {
                    content = <span style={{ color: 'var(--text-tertiary)', fontSize: 13, fontFamily: T.font.sans }}>Όχι</span>;
                  }
                  return (
                    <div key={id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '13px 8px' }}>
                      {content}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* ── 4. Γραμμή εμπιστοσύνης ─────────────────────────────────────── */}
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.55, marginTop: 16 }}>
          Χωρίς δέσμευση. Αναβαθμίζεις ή προσαρμόζεις όποτε θες, με ένα κλικ.
        </div>
        {/* ── 5. Διαφάνεια ΦΠΑ ───────────────────────────────────────────── */}
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.5, marginTop: 8 }}>
          Η τελική τιμή με ΦΠΑ και η ακριβής ημερομηνία χρέωσης επιβεβαιώνονται στην πληρωμή, που έρχεται σύντομα.
        </div>
      </Card>
    </div>
  );
}
