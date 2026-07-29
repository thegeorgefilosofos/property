'use client';

// ═══════════════════════════════════════════════════════════════════════════
// ΠΡΟΣΩΡΙΝΟ ΚΕΛΥΦΟΣ — ΘΑ ΑΝΤΙΚΑΤΑΣΤΑΘΕΙ.
//
// Το πραγματικό «Σχέδιο» γράφεται αυτή τη στιγμή από άλλον agent. Το αρχείο
// υπάρχει εδώ μόνο ώστε να μεταγλωττίζεται η πλοήγηση που το καλεί, με το
// συμβόλαιο props κλειδωμένο:
//   <TabPlan propertyId userId status property />
// Μην χτίσεις τίποτα πάνω του: η επόμενη έκδοση το γράφει από την αρχή.
// ═══════════════════════════════════════════════════════════════════════════

import { T, EmptyState } from '@/components/Theme';
import { BY_KEY, type PropertyStatus } from '@/lib/property/status';

interface Props {
  propertyId: string;
  userId: string;
  status: PropertyStatus;
  property: { id: string; name: string };
}

export default function TabPlan({ status, property }: Props) {
  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 20px', lineHeight: 1.15 }}>Σχέδιο</h1>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 8 }}>
        <EmptyState
          title="Ετοιμάζεται"
          hint={`Το σχέδιο για «${property.name}» — κατάσταση: ${BY_KEY[status].label}. Εδώ θα μπουν τα βήματα που έχουν νόημα για αυτή την κατάσταση.`}
        />
      </div>
    </div>
  );
}
