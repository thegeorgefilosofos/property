'use client';

// ═══════════════════════════════════════════════════════════════════════════
// Δαπάνες — ενοποιημένη είσοδος για Λογαριασμούς και λοιπές δαπάνες.
// Ενοποιεί σε ΕΝΑ σημείο (καρτέλα «Δαπάνες») αλλά κρατά διακριτή, ξεκάθαρη δομή:
//   • Λογαριασμοί    → πάγιοι/επαναλαμβανόμενοι (ρεύμα, νερό, πάροχοι, ασφάλειες…)
//   • Λοιπές δαπάνες → όλες οι υπόλοιπες δαπάνες
//   • Προϋπολογισμός → ΕΝΑΣ στόχος για όλα τα έξοδα (λογαριασμοί + λοιπές δαπάνες)
// Καμία διπλή λογική: κάθε ενότητα αποδίδει το υπάρχον, δοκιμασμένο εργαλείο της.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from 'react';
import { T } from '@/components/Theme';
import TabBills from './TabBills';
import TabExpenses from './TabExpenses';
import BillsBudget from './BillsBudget';

interface Props {
  propertyId: string; userId: string;
  propertyName?: string; propertyAddress?: string;
  profileType?: 'individual' | 'professional';
}

type View = 'bills' | 'expenses' | 'budget';

export default function TabFinances({ propertyId, userId, propertyName = '', propertyAddress = '', profileType = 'individual' }: Props) {
  const [view, setView] = useState<View>('bills');
  const segs: { k: View; label: string }[] = [
    { k: 'bills', label: 'Λογαριασμοί' },
    { k: 'expenses', label: 'Λοιπές δαπάνες' },
    { k: 'budget', label: 'Προϋπολογισμός' },
  ];
  return (
    <div>
      {/* Ενιαία, ήσυχη εναλλαγή ενοτήτων (ίδιο idiom με τα view toggles της εφαρμογής) */}
      <div style={{ display: 'inline-flex', border: '1px solid var(--border-default)', borderRadius: T.radius.pill, overflow: 'hidden', marginBottom: 18 }}>
        {segs.map(s => {
          const on = view === s.k;
          return (
            <button key={s.k} onClick={() => setView(s.k)}
              style={{ appearance: 'none', border: 'none', cursor: 'pointer', padding: '9px 18px', fontFamily: T.font.sans, fontSize: 13, fontWeight: on ? 700 : 500, background: on ? 'var(--accent)' : 'transparent', color: on ? 'var(--accent-text)' : 'var(--text-secondary)', transition: 'background .15s, color .15s' }}>
              {s.label}
            </button>
          );
        })}
      </div>
      {view === 'bills' && <TabBills propertyId={propertyId} userId={userId} propertyName={propertyName} propertyAddress={propertyAddress} />}
      {view === 'expenses' && <TabExpenses propertyId={propertyId} userId={userId} />}
      {view === 'budget' && <BillsBudget propertyId={propertyId} userId={userId} profileType={profileType} />}
    </div>
  );
}
