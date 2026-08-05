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
  /** Το ενεργό πλάνο, όπως το υπολογίζει το entitlements. Ορίζει τι εργαλεία
   *  βλέπει ο χρήστης μέσα στις Δαπάνες, όχι μόνο ποιες καρτέλες. */
  plan?: string;
  /** Ανοίγει το παράθυρο σάρωσης της εφαρμογής. */
  onScan?: () => void;
}

type View = 'expenses' | 'budget';

export default function TabFinances({
  propertyId, userId, propertyName = '', propertyAddress = '',
  profileType = 'individual', plan = 'free', onScan,
}: Props) {
  const [view, setView] = useState<View>('expenses');
  const [contracts, setContracts] = useState(false);

  const segs: { k: View; label: string }[] = [
    { k: 'expenses', label: 'Δαπάνες' },
    { k: 'budget', label: 'Προϋπολογισμός' },
  ];

  // ── ΕΝΑ ΣΤΟΙΧΕΙΟ ΕΛΕΓΧΟΥ, ΟΧΙ ΤΡΙΑ ─────────────────────────────────────────
  //
  // ΠΡΙΝ, σε μία σειρά, υπήρχαν ΤΡΕΙΣ διαφορετικές μεταχειρίσεις: γεμάτο μπλε
  // κουμπί, διάφανο κουμπί μέσα στο ίδιο πλαίσιο, και υπογραμμισμένος σύνδεσμος
  // χωρίς ύψος που έπαιρνε δικό του τετράγωνο περίγραμμα στο πληκτρολόγιο. Τρία
  // σχήματα, δύο ύψη, δύο χρώματα, για την ίδια ακριβώς ενέργεια: αλλαγή όψης.
  //
  // ΤΩΡΑ όλα είναι τμήματα του ίδιου διακόπτη, με ένα ύψος και ένα σχήμα. Το
  // ΕΝΕΡΓΟ δεν είναι μπλε: είναι ανασηκωμένη επιφάνεια με έντονο κείμενο. Το
  // μπλε μένει ΜΟΝΟ για την κύρια ενέργεια της οθόνης, ώστε το μάτι να ξέρει
  // πάντα πού να πάει. Δύο μπλε σημεία στην ίδια οθόνη είναι κανένα.
  const tabs: { k: View | 'contracts'; label: string }[] = [
    ...segs.map(s => ({ k: s.k as View | 'contracts', label: s.label })),
    { k: 'contracts', label: 'Συμβόλαια' },
  ];
  const active: View | 'contracts' = contracts ? 'contracts' : view;

  return (
    <div>
      <div style={{
        display: 'inline-flex', padding: 3, gap: 2, marginBottom: T.sp.xl,
        background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
        borderRadius: T.radius.pill, maxWidth: '100%', overflowX: 'auto',
      }}>
        {tabs.map(t => {
          const on = active === t.k;
          return (
            <button key={t.k}
              onClick={() => { if (t.k === 'contracts') { setContracts(true); } else { setContracts(false); setView(t.k as View); } }}
              aria-pressed={on}
              style={{
                appearance: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                height: T.h.md, padding: '0 18px', borderRadius: T.radius.pill,
                fontFamily: T.font.sans, fontSize: 13, fontWeight: on ? 700 : 500,
                background: on ? 'var(--bg-surface)' : 'transparent',
                border: on ? '1px solid var(--border-default)' : '1px solid transparent',
                color: on ? 'var(--text-primary)' : 'var(--text-secondary)',
                boxShadow: on ? 'var(--elev-1)' : 'none',
                transition: 'background .15s, color .15s',
              }}>
              {t.label}
            </button>
          );
        })}
      </div>

      {contracts
        ? <TabBills propertyId={propertyId} userId={userId} propertyName={propertyName} propertyAddress={propertyAddress} />
        : view === 'expenses'
          ? <ExpenseLedger propertyId={propertyId} userId={userId} onScan={onScan} />
          : <BillsBudget propertyId={propertyId} userId={userId} profileType={profileType} />}
    </div>
  );
}
