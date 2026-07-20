'use client';

// ═══════════════════════════════════════════════════════════════════════════
// FeatureLock — ήρεμη, premium «κλειδωμένη» κατάσταση όταν μια δυνατότητα δεν
// καλύπτεται από το πλάνο σου. Χωρίς πίεση: εξηγεί το όφελος, δείχνει το πλάνο
// που χρειάζεται, και οδηγεί στη διαχείριση συνδρομής. Η ουσιαστική επιβολή του
// ορίου ακινήτων γίνεται και server-side (trigger)· εδώ είναι το UX.
// ═══════════════════════════════════════════════════════════════════════════

import { T, Card, Btn } from '@/components/Theme';
import { PLANS, type PlanId } from '@/lib/billing/plans';

const LockIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

// Μικρό λουκέτο για τα στοιχεία της μπάρας πλοήγησης.
export function LockBadge() {
  return (
    <span aria-label="Κλειδωμένο" title="Διαθέσιμο σε ανώτερο πλάνο"
      style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', flexShrink: 0 }}>
      <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    </span>
  );
}

export default function FeatureLock({ title, benefit, requiredPlan, currentPlanName, onManage }: {
  title: string;
  benefit: string;
  requiredPlan: PlanId;
  currentPlanName?: string;
  onManage: () => void;
}) {
  const plan = PLANS[requiredPlan];
  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)', maxWidth: 640 }}>
      <Card style={{ background: 'var(--surface-hero)', boxShadow: 'var(--highlight-inset), var(--elev-2)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 16, padding: '8px 4px' }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }}>
            <LockIcon />
          </div>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 10, border: '1px solid var(--border-subtle)', borderRadius: 100, padding: '4px 12px' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Πλάνο {plan.name}</span>
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)', margin: '0 0 8px', lineHeight: 1.2 }}>{title}</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6, maxWidth: 480 }}>{benefit}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 2 }}>
            <Btn variant="primary" onClick={onManage}>Δες τα πλάνα και αναβάθμισε</Btn>
            {currentPlanName && (
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Τρέχον πλάνο: {currentPlanName}</span>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
