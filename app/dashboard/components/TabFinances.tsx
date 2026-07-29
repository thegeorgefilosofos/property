'use client';

// ═══════════════════════════════════════════════════════════════════════════
// ΔΑΠΑΝΕΣ — δύο κουμπιά, όχι τρία.
//
// ΠΡΙΝ: [Λογαριασμοί] [Λοιπές δαπάνες] [Προϋπολογισμός], και πίσω από το πρώτο
// άλλες ΕΠΤΑ υποκαρτέλες. Ο ιδιοκτήτης που ήθελε να καταχωρήσει έναν λογαριασμό
// ρεύματος έκανε Δαπάνες, Λογαριασμοί, Ρεύμα, και μόνο τότε έβλεπε πεδίο. Για
// έναν υδραυλικό πήγαινε αλλού, σε άλλη φόρμα, με άλλα πεδία, για το ίδιο
// ακριβώς πράγμα: χρήματα που έφυγαν.
//
// ΤΩΡΑ: [Δαπάνες] [Προϋπολογισμός].
// Ο λογαριασμός δεν είναι άλλο πράγμα από τη δαπάνη. Είναι δαπάνη που δεν την
// έχεις πληρώσει ακόμη.
//
// ΤΑ ΣΥΜΒΟΛΑΙΑ ΔΕΝ ΧΑΘΗΚΑΝ. Οι επτά υποκαρτέλες (Ρεύμα, Φυσικό Αέριο,
// Κοινόχρηστα, Πάροχοι, Ασφάλεια, Υπηρεσίες) υπάρχουν ακέραιες πίσω από τον
// σύνδεσμο «Συμβόλαια και πάροχοι». Άλλαξε ο ρόλος τους, όχι το περιεχόμενο:
// έπαψαν να είναι σημείο καταχώρησης δαπάνης και έγιναν αυτό που πάντα ήταν,
// δηλαδή συμβόλαια και συγκρίσεις τιμών. Είναι σύνδεσμος και όχι κουμπί
// πλοήγησης επειδή τα συμβόλαια τα κοιτάς λίγες φορές τον χρόνο, ενώ τις
// δαπάνες κάθε φορά που μπαίνεις.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from 'react';
import { T } from '@/components/Theme';
import ExpenseLedger from './ExpenseLedger';
import TabBills from './TabBills';
import BillsBudget from './BillsBudget';

interface Props {
  propertyId: string; userId: string;
  propertyName?: string; propertyAddress?: string;
  profileType?: 'individual' | 'professional';
  /** Ανοίγει το παράθυρο σάρωσης της εφαρμογής. */
  onScan?: () => void;
}

type View = 'expenses' | 'budget';

export default function TabFinances({
  propertyId, userId, propertyName = '', propertyAddress = '',
  profileType = 'individual', onScan,
}: Props) {
  const [view, setView] = useState<View>('expenses');
  const [contracts, setContracts] = useState(false);

  const segs: { k: View; label: string }[] = [
    { k: 'expenses', label: 'Δαπάνες' },
    { k: 'budget', label: 'Προϋπολογισμός' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: T.sp.lg }}>
        <div style={{ display: 'inline-flex', border: '1px solid var(--border-default)', borderRadius: T.radius.pill, overflow: 'hidden' }}>
          {segs.map(s => {
            const on = view === s.k && !contracts;
            return (
              <button key={s.k} onClick={() => { setView(s.k); setContracts(false); }}
                style={{ appearance: 'none', border: 'none', cursor: 'pointer', padding: '9px 20px', fontFamily: T.font.sans, fontSize: 13.5, fontWeight: on ? 700 : 500, background: on ? 'var(--accent)' : 'transparent', color: on ? 'var(--accent-text)' : 'var(--text-secondary)', transition: 'background .15s, color .15s' }}>
                {s.label}
              </button>
            );
          })}
        </div>

        <button onClick={() => setContracts(v => !v)}
          style={{ appearance: 'none', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: T.font.sans, fontSize: 13, color: contracts ? 'var(--accent)' : 'var(--text-tertiary)', fontWeight: contracts ? 700 : 500, padding: 0, textDecoration: contracts ? 'none' : 'underline', textUnderlineOffset: 3 }}>
          {contracts ? 'Πίσω στις δαπάνες' : 'Συμβόλαια και πάροχοι'}
        </button>
      </div>

      {contracts
        ? <TabBills propertyId={propertyId} userId={userId} propertyName={propertyName} propertyAddress={propertyAddress} />
        : view === 'expenses'
          ? <ExpenseLedger propertyId={propertyId} userId={userId} onScan={onScan} />
          : <BillsBudget propertyId={propertyId} userId={userId} profileType={profileType} />}
    </div>
  );
}
