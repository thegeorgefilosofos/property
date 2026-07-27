'use client';

// ═══════════════════════════════════════════════════════════════════════════
// UpgradeModal — εμφανίζεται όταν ο χρήστης φτάσει το όριο ακινήτων του πλάνου.
// Ήρεμο, premium, χωρίς πίεση: εξηγεί γιατί, δείχνει το προτεινόμενο πλάνο,
// και οδηγεί στη διαχείριση συνδρομής (Ρυθμίσεις → Χρέωση).
// ═══════════════════════════════════════════════════════════════════════════

import { PLANS, PLAN_ORDER, normalizePlan, planForCount, annualPerMonth, type PlanId } from '@/lib/billing/plans';
import { isPlanAllowedForProfile, paidPlanForProfile, type ProfileType } from '@/lib/billing/entitlements';
import { T, feAuto } from '@/components/Theme';

export default function UpgradeModal({ currentCount, planId, profileType = 'individual', onClose, onManage }: {
  currentCount: number;
  planId: string | null | undefined;
  profileType?: ProfileType;
  onClose: () => void;
  onManage: () => void;
}) {
  const current = normalizePlan(planId);
  // Η πρόταση πρέπει να είναι ΑΓΟΡΑΣΙΜΗ από αυτό το προφίλ. Το σκέτο
  // planForCount() προτείνει «Επαγγελματίας» σε Ιδιώτη που έπιασε τα 3 ακίνητα —
  // πλάνο που το ALLOWED_PLANS του απαγορεύει, οπότε πατάει «Αναβάθμιση» και
  // βρίσκει κλειδωμένη στήλη. Αδιέξοδο· κρατάμε το ανώτατο επιτρεπτό.
  const byCount = planForCount(currentCount + 1);
  const allowed = isPlanAllowedForProfile(profileType, byCount) ? byCount : paidPlanForProfile(profileType);

  // Το ταβάνι που μπορεί να ΑΓΟΡΑΣΕΙ αυτό το προφίλ — όχι το πλάνο που έχει.
  // Κρίσιμο ότι δεν εξαρτάται από το τρέχον πλάνο: ο χρήστης που έληξε η δοκιμή
  // του κρατώντας 3 ακίνητα είναι στο ίδιο αδιέξοδο με τον συνδρομητή στα 3,
  // απλώς με άλλη ταμπέλα.
  const profileCeiling = PLANS[paidPlanForProfile(profileType)].maxProperties;
  const atCeiling = currentCount >= profileCeiling;

  // Ιδιώτης στο ταβάνι: η λύση είναι αλλαγή τρόπου χρήσης, όχι πλάνου.
  const needsProfileSwitch = profileType === 'individual' && atCeiling;
  // Επαγγελματίας στο ταβάνι: δεν υπάρχει μεγαλύτερο πλάνο — ανοίγουμε συζήτηση.
  const beyondTopPlan = profileType === 'professional' && atCeiling;

  // ΚΑΝΟΝΑΣ: δεν προτείνουμε ΠΟΤΕ πλάνο που δεν λύνει το πρόβλημα. Ούτε αυτό που
  // ήδη έχει (θα έγραφε «Προτεινόμενο» και «Το τρέχον πλάνο σου» στο ίδιο κουτί),
  // ούτε ένα που δεν χωράει ούτε ένα ακίνητο παραπάνω — που ήταν το χειρότερο:
  // πλήρωνες 9,90 € για ακριβώς τη χωρητικότητα που είχες ήδη εξαντλήσει.
  const recommended: PlanId | null =
    atCeiling || allowed === current || PLANS[allowed].maxProperties <= currentCount ? null : allowed;


  if (beyondTopPlan) {
    return (
      <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        className="md-scrim" style={{ fontFamily: T.font.sans }}>
        <div style={{ background: 'var(--bg-surface)', borderRadius: 18, width: '100%', maxWidth: 520, boxShadow: 'var(--shadow-xl)', padding: 'clamp(24px, 3vw, 34px)' }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)', margin: '0 0 8px' }}>Διαχειρίζεσαι μεγάλο χαρτοφυλάκιο</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 20px', lineHeight: 1.6 }}>
            Το πλάνο Επαγγελματίας καλύπτει έως {PLANS.agency.maxProperties} ακίνητα και τα έχεις ήδη συμπληρώσει.
            Για περισσότερα, στήνουμε πλάνο στα μέτρα σου. Γράψε μας στο <strong style={{ color: 'var(--text-primary)' }}>support@propertyos.gr</strong> και απαντάμε την ίδια ημέρα.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button onClick={onClose} style={{ height: 44, padding: '0 20px', borderRadius: 100, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Κλείσιμο</button>
            <a href="mailto:support@propertyos.gr?subject=Χαρτοφυλάκιο%20άνω%20των%20ακινήτων%20του%20πλάνου"
              style={{ height: 44, padding: '0 24px', borderRadius: 100, background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 14, fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Επικοινώνησε μαζί μας</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      className="md-scrim" style={{ fontFamily: T.font.sans }}>
      <div style={{ background: 'var(--bg-surface)', borderRadius: 18, width: '100%', maxWidth: 720, maxHeight: 'calc(100vh - 48px)', overflow: 'auto', boxShadow: 'var(--shadow-xl)', padding: 'clamp(24px, 3vw, 34px)' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 8 }}>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)', margin: '0 0 6px' }}>Χρειάζεσαι λίγο περισσότερο χώρο</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.55, maxWidth: 520 }}>
              Το πλάνο σου ({PLANS[current].name}) καλύπτει {PLANS[current].maxProperties === Infinity ? 'απεριόριστα' : PLANS[current].maxProperties} {PLANS[current].maxProperties === 1 ? 'ακίνητο' : 'ακίνητα'}.{' '}
              {needsProfileSwitch
                ? <>Με περισσότερα από {PLANS.owner.maxProperties} ακίνητα η διαχείριση γίνεται επαγγελματική δουλειά. Στις Ρυθμίσεις άλλαξε τον τρόπο χρήσης σε «Επαγγελματίας» — περνά αμέσως, χωρίς προϋπόθεση — και ξεκλειδώνει η αγορά του πλάνου Επαγγελματίας: έως {PLANS.agency.maxProperties} ακίνητα, χαρτοφυλάκιο και ομάδα.</>
                : <>Για να προσθέσεις κι άλλο, διάλεξε ένα πλάνο που σου ταιριάζει. Χωρίς δέσμευση, ακυρώνεις όποτε θέλεις.</>}
            </p>
          </div>
          <button onClick={onClose} aria-label="Κλείσιμο" style={{ width: 36, height: 36, borderRadius: 18, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12, margin: '22px 0 20px' }}>
          {PLAN_ORDER.map(id => {
            const p = PLANS[id as PlanId];
            const isRec = id === recommended;
            const isCurrent = id === current;
            return (
              <div key={id} style={{ background: 'var(--bg-elevated)', border: `1px solid ${isRec ? 'color-mix(in srgb, var(--accent) 55%, transparent)' : 'var(--border-subtle)'}`, borderRadius: 14, padding: 16, position: 'relative', display: 'flex', flexDirection: 'column' }}>
                {isRec && <div style={{ position: 'absolute', top: -10, left: 16, background: 'var(--accent)', color: 'var(--accent-text)', borderRadius: 100, padding: '3px 10px', fontSize: 10, fontWeight: 700 }}>Προτεινόμενο</div>}
                <div style={{ fontSize: 13, fontWeight: 700, color: isRec ? 'var(--accent)' : 'var(--text-primary)', marginBottom: 6 }}>{p.name}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{feAuto(p.priceMonthly)}</span>
                  {p.priceMonthly > 0 && <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>/μήνα</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', minHeight: 16 }}>
                  {p.priceAnnual > 0 ? `ή ${feAuto(p.priceAnnual)}/χρόνο (${feAuto(annualPerMonth(id as PlanId))}/μήνα)` : 'για πάντα'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '10px 0 0', lineHeight: 1.5 }}>
                  {p.maxProperties === Infinity ? 'Απεριόριστα ακίνητα' : `Έως ${p.maxProperties} ${p.maxProperties === 1 ? 'ακίνητο' : 'ακίνητα'}`}
                </div>
                {!isCurrent && p.id !== 'free' && (
                  <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {p.features.slice(0, 3).map((f, i) => (
                      <li key={i} style={{ display: 'flex', gap: 7, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M20 6 9 17l-5-5" /></svg>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {isCurrent && <div style={{ marginTop: 'auto', paddingTop: 12, fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600 }}>Το τρέχον πλάνο σου</div>}
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button onClick={onClose} style={{ height: 44, padding: '0 20px', borderRadius: 100, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Όχι τώρα</button>
          <button onClick={onManage} style={{ height: 44, padding: '0 24px', borderRadius: 100, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Δες τα πλάνα και αναβάθμισε</button>
        </div>
      </div>
    </div>
  );
}
