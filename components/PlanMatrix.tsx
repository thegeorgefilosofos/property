'use client';

// ═══════════════════════════════════════════════════════════════════════════
// ΤΙ ΠΕΡΙΛΑΜΒΑΝΕΙ ΚΑΘΕ ΠΑΚΕΤΟ — Ο ΠΙΝΑΚΑΣ, ΣΕ ΔΙΚΗ ΤΟΥ ΣΕΛΙΔΑ
//
// ΓΙΑΤΙ ΕΦΥΓΕ ΑΠΟ ΤΙΣ ΡΥΘΜΙΣΕΙΣ. Δεκαέξι γραμμές επί τέσσερις στήλες, δηλαδή
// εξήντα τέσσερα κελιά, κάθονταν μόνιμα ανοιχτά κάτω από τον τιμοκατάλογο. Ο
// συνδρομητής που μπήκε στις Ρυθμίσεις για να αλλάξει τη διεύθυνση τιμολόγησης
// κυλούσε από πάνω τους κάθε φορά. Ενας πίνακας δυνατοτήτων διαβάζεται ΜΙΑ φορά
// στη ζωή του λογαριασμού, τη στιγμή που διαλέγεις πακέτο.
//
// ΚΑΙ ΓΙΑΤΙ ΣΕ ΔΗΜΟΣΙΑ ΣΕΛΙΔΑ. Η ίδια ερώτηση («τι παίρνω με τι») είναι η πρώτη
// που κάνει και ο επισκέπτης που δεν έχει λογαριασμό. Κλειδωμένη πίσω από τη
// σύνδεση, η απάντηση δεν βρισκόταν ούτε από μηχανή αναζήτησης.
//
// ΜΙΑ ΠΗΓΗ. Κάθε κελί βγαίνει από τα `lib/billing`: τα όρια ακινήτων από τα
// `PLANS`, οι ερωτήσεις από το `aiLimitsFor` και οι κλειδωμένες γραμμές από το
// ΙΔΙΟ μητρώο `FEATURE_MIN_PLAN` που κρίνει και την πραγματική πρόσβαση. Ο
// πίνακας δεν μπορεί να διαφωνήσει με τον κώδικα, γιατί τον διαβάζει.
// ═══════════════════════════════════════════════════════════════════════════

import { PLANS, type PlanId } from '@/lib/billing/plans';
import { aiLimitsFor } from '@/lib/billing/aiLimits';
import { ASSISTANT_NAME } from '@/lib/assistant/identity';
import { FEATURE_LABEL, FEATURE_MIN_PLAN, planAtLeast, type Feature } from '@/lib/billing/entitlements';
import { T, fn } from '@/components/tokens';

export type ComparedPlan = Extract<PlanId, 'solo' | 'owner' | 'agency' | 'office'>;
export const COMPARED: ComparedPlan[] = ['solo', 'owner', 'agency', 'office'];

type CellValue = boolean | string;
interface FeatureRow { label: string; values: Record<ComparedPlan, CellValue> }

/** Το όριο ακινήτων γράφεται ΠΑΝΤΑ από τα PLANS, ποτέ με το χέρι. */
const limitLabel = (id: ComparedPlan): string => {
  const n = PLANS[id].maxProperties;
  if (!Number.isFinite(n)) return 'Απεριόριστα';
  return n === 1 ? '1' : `Έως ${n}`;
};

const gated = (f: Feature): FeatureRow => ({
  label: FEATURE_LABEL[f],
  values: Object.fromEntries(COMPARED.map(p => [p, planAtLeast(p, FEATURE_MIN_PLAN[f])])) as Record<ComparedPlan, CellValue>,
});
const forAll = (label: string): FeatureRow => ({
  label, values: Object.fromEntries(COMPARED.map(p => [p, true])) as Record<ComparedPlan, CellValue>,
});

export const MATRIX: FeatureRow[] = [
  { label: 'Ακίνητα', values: Object.fromEntries(COMPARED.map(p => [p, limitLabel(p)])) as Record<ComparedPlan, CellValue> },
  { label: `Ερωτήσεις στη ${ASSISTANT_NAME} τον μήνα`,
    values: Object.fromEntries(COMPARED.map(p => [p, fn(aiLimitsFor(p).perMonth)])) as Record<ComparedPlan, CellValue> },
  forAll('Σάρωση εγγράφων και φωνητική καταχώρηση'),
  forAll('Αποδόσεις, δαπάνες, ενέργεια και φόρος 2026'),
  forAll('Έξυπνες ειδοποιήσεις και υπενθυμίσεις'),
  gated('e2_export'),
  gated('rent_collection'),
  gated('multi_property'),
  gated('comparison'),
  gated('accounting_journal'),
  gated('bank_import'),
  gated('early_access'),
  gated('clients'),
  gated('portfolio'),
  gated('report_branding'),
  gated('investment_analysis'),
];

const GRID = `minmax(184px, 1.7fr) repeat(${COMPARED.length}, minmax(84px, 1fr))`;

function Tick() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth={2.4}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/**
 * Ο πίνακας μόνος του, χωρίς κάρτα και χωρίς επικεφαλίδα: τα βάζει ο καλών.
 *
 * Το `highlight` δίνει έμφαση στη στήλη του τρέχοντος πακέτου, όταν υπάρχει
 * τρέχον πακέτο. Στη δημόσια σελίδα δεν υπάρχει, οπότε καμία στήλη δεν
 * ξεχωρίζει: ο επισκέπτης δεν έχει ακόμη λόγο να προτιμήσει μία.
 */
export function PlanMatrix({ highlight }: { highlight?: PlanId }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 560 }}>
        <div style={{ display: 'grid', gridTemplateColumns: GRID, alignItems: 'end', borderBottom: '1px solid var(--border-subtle)', paddingBottom: 10 }}>
          <div />
          {COMPARED.map(id => (
            <div key={id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '0 8px' }}>
              <span style={{ fontSize: 12, fontWeight: id === highlight ? 800 : 700, color: id === highlight ? 'var(--accent)' : 'var(--text-secondary)', fontFamily: T.font.sans, textAlign: 'center' }}>{PLANS[id].name}</span>
            </div>
          ))}
        </div>
        {MATRIX.map(row => (
          <div key={row.label} style={{ display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.4, padding: '13px 12px 13px 2px' }}>{row.label}</div>
            {COMPARED.map(id => {
              const v = row.values[id];
              return (
                <div key={id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '13px 8px' }}>
                  {typeof v === 'string'
                    ? <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
                    : v === true ? <Tick />
                    : <span style={{ color: 'var(--text-tertiary)', fontSize: 13, fontFamily: T.font.sans }}>Όχι</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
