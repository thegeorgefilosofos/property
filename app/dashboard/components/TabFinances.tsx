'use client';

// ═══════════════════════════════════════════════════════════════════════════
// ΔΑΠΑΝΕΣ — δύο κουμπιά, όχι τρία.
//
// ΠΡΙΝ: [Λογαριασμοί] [Λοιπές δαπάνες] [Προϋπολογισμός] και πίσω από το πρώτο
// άλλες ΕΠΤΑ υποκαρτέλες. Ο ιδιοκτήτης που ήθελε να καταχωρήσει έναν λογαριασμό
// ρεύματος έκανε Δαπάνες, Λογαριασμοί, Ρεύμα και μόνο τότε έβλεπε πεδίο. Για
// έναν υδραυλικό πήγαινε αλλού, σε άλλη φόρμα, με άλλα πεδία, για το ίδιο
// ακριβώς πράγμα: χρήματα που έφυγαν.
//
// ΤΩΡΑ: [Δαπάνες] [Προϋπολογισμός].
// Ο λογαριασμός δεν είναι άλλο πράγμα από τη δαπάνη. Είναι δαπάνη που δεν την
// έχεις πληρώσει ακόμη.
//
// ΤΑ ΣΥΜΒΟΛΑΙΑ ΔΕΝ ΧΑΘΗΚΑΝ. Οι επτά υποκαρτέλες (Ρεύμα, Φυσικό αέριο,
// Κοινόχρηστα, Πάροχοι, Ασφάλεια, Υπηρεσίες) υπάρχουν ακέραιες πίσω από τον
// σύνδεσμο «Συμβόλαια και πάροχοι». Άλλαξε ο ρόλος τους, όχι το περιεχόμενο:
// έπαψαν να είναι σημείο καταχώρησης δαπάνης και έγιναν αυτό που πάντα ήταν,
// δηλαδή συμβόλαια και συγκρίσεις τιμών. Είναι σύνδεσμος και όχι κουμπί
// πλοήγησης επειδή τα συμβόλαια τα κοιτάς λίγες φορές τον χρόνο, ενώ τις
// δαπάνες κάθε φορά που μπαίνεις.
// ═══════════════════════════════════════════════════════════════════════════

import { navLabel } from '@/lib/nav/labels';
import { useState } from 'react';
import { T, Btn } from '@/components/Theme';
import ExpenseLedger from './ExpenseLedger';
import InboundInbox from './InboundInbox';
import { BankLinkRow } from './BankLink';
import TabBills from './TabBills';
import { type LegalForm } from '@/lib/accounting/dossier';
import BillsBudget from './BillsBudget';

interface Props {
  propertyId: string; userId: string;
  /** Το όνομα του ακινήτου, για να λέει η ουρά των εισερχομένων πού γράφει. */
  propertyName?: string;
  profileType?: 'individual' | 'professional';
  /**
   * Η νομική μορφή, όπως δηλώθηκε στην υποδοχή. Ταξιδεύει ως εδώ για ΕΝΑ πράγμα:
   * ο τόπος παροχής των συνδρομών (ενδοκοινοτική λήψη, τρίτη χώρα) γεννά
   * υποχρέωση μόνο όταν ο λήπτης είναι υποκείμενος στον φόρο. Ο ιδιώτης
   * ιδιοκτήτης δεν έχει τίποτα να δηλώσει, οπότε δεν βλέπει τίποτα.
   */
  legalForm?: LegalForm;
  // ΤΟ `plan` ΕΦΥΓΕ. Δηλωνόταν ως «ορίζει τι εργαλεία βλέπει ο χρήστης μέσα στις
  // Δαπάνες» και δεν διαβαζόταν πουθενά μέσα στο σώμα: ένα prop που ταξίδευε από
  // το page.tsx ως εδώ για να μη χρησιμοποιηθεί ποτέ. Ο περιορισμός ανά πλάνο
  // ζει στο entitlements, όχι σε παράμετρο που κανείς δεν κοιτάζει.
  /** Ανοίγει το παράθυρο σάρωσης της εφαρμογής. */
  onScan?: () => void;
  openAddNonce?: number;
}

type View = 'expenses' | 'budget';

export default function TabFinances({
  propertyId, userId, propertyName,
  profileType = 'individual', legalForm = 'individual', onScan, openAddNonce,
}: Props) {
  const [view, setView] = useState<View>('expenses');
  const [contracts, setContracts] = useState(false);
  // ΤΟ ΚΑΘΟΛΙΚΟ ΞΑΝΑΔΙΑΒΑΖΕΙ ΟΤΑΝ ΜΠΕΙ ΓΡΑΜΜΗ ΑΠΟ ΤΑ ΕΙΣΕΡΧΟΜΕΝΑ. Χωρίς αυτό,
  // ο ιδιοκτήτης πατά «Καταχώρηση», η δαπάνη γράφεται και η λίστα από κάτω
  // συνεχίζει να μην τη δείχνει — δηλαδή μοιάζει να μην έγινε τίποτα.
  const [ledgerKey, setLedgerKey] = useState(0);

  const segs: { k: View; label: string }[] = [
    { k: 'expenses', label: 'Δαπάνες' },
    { k: 'budget', label: 'Προϋπολογισμός' },
  ];

  // ── ΕΝΑ ΣΤΟΙΧΕΙΟ ΕΛΕΓΧΟΥ, ΟΧΙ ΤΡΙΑ ─────────────────────────────────────────
  //
  // ΠΡΙΝ, σε μία σειρά, υπήρχαν ΤΡΕΙΣ διαφορετικές μεταχειρίσεις: γεμάτο μπλε
  // κουμπί, διάφανο κουμπί μέσα στο ίδιο πλαίσιο και υπογραμμισμένος σύνδεσμος
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
      {/* ── Η ΟΘΟΝΗ ΧΡΕΙΑΖΕΤΑΙ ΟΝΟΜΑ, ΚΑΙ ΑΣ ΜΗΝ ΤΟ ΔΕΙΧΝΕΙ ──────────────────
          Δώδεκα καρτέλες έχουν ορατό τίτλο μέσω `PageTitle`, δηλαδή `h1`. Αυτή
          δεν είχε ΚΑΝΕΝΑ: ο αναγνώστης οθόνης ανακοίνωνε τη σελίδα χωρίς όνομα,
          η πλοήγηση ανά επικεφαλίδα —ο βασικός τρόπος που διαβάζει κανείς μια
          άγνωστη οθόνη— ξεκινούσε από `h2` ή `h3` και η ιεραρχία δεν είχε
          κορυφή. Το όνομα έρχεται από το `lib/nav/labels.ts`, την ίδια πηγή με
          το μενού και τη Νόα: δεν επινοείται δεύτερο εδώ.
          Κρυφό ΟΠΤΙΚΑ, όχι από τον αναγνώστη — η οθόνη έχει ήδη τη δική της
          κεφαλίδα και δεν αλλάζει ούτε ένα εικονοστοιχείο. */}
      <h1 className="sr-only">{navLabel('finances')}</h1>
      {/* ═══ Η ΚΥΡΙΑ ΕΝΕΡΓΕΙΑ ΑΝΕΒΑΙΝΕΙ ΣΤΗ ΣΕΙΡΑ ΤΩΝ ΚΑΡΤΕΛΩΝ ═══════════════
          Η σάρωση ζούσε ΜΟΝΟ μέσα στην κενή κατάσταση, δηλαδή εξαφανιζόταν τη
          στιγμή που καταχωρούνταν η πρώτη δαπάνη: ακριβώς τότε που ο χρήστης
          αρχίζει να τη χρειάζεται κάθε μήνα. Και όσο φαινόταν, καθόταν
          κεντραρισμένη στη μέση της οθόνης, τρίτη στοίχιση κάτω από αριστερά
          στοιχισμένες καρτέλες και αριστερά στοιχισμένη γραμμή τράπεζας.

          Τώρα κάθεται στη σειρά των καρτελών, στην ίδια γραμμή βάσης με αυτές
          και με το «Τι είναι» της τράπεζας από κάτω, στη δεξιά άκρη όπου η
          εφαρμογή βάζει παντού την κύρια ενέργεια. Είναι ορατή πάντα, με ή
          χωρίς δαπάνες. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: T.sp.xl }}>
      <div style={{
        display: 'inline-flex', padding: 3, gap: 2,
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
        {/* Η σάρωση αφορά ΜΟΝΟ τις δαπάνες. Στον Προϋπολογισμό και στα
            Συμβόλαια δεν υπάρχει τίποτα να σαρωθεί, οπότε δεν προσφέρεται. */}
        {/* ΛΕΓΕΤΑΙ «ΝΕΑ ΔΑΠΑΝΗ», ΓΙΑΤΙ ΑΥΤΟ ΚΑΝΕΙ. Το «Σάρωσε δαπάνη» υπόσχεται
            ΕΝΑΝ δρόμο, τη φωτογραφία, ενώ πίσω του ανοίγει οθόνη με τέσσερις:
            φωτογραφία, αρχείο, τράπεζα και χειροκίνητη καταχώρηση. Οποιος δεν
            έχει χαρτί μπροστά του δεν θα πατούσε ποτέ κουμπί που λέει «σάρωσε»
            και θα έψαχνε άλλο, που δεν υπάρχει. */}
        {onScan && !contracts && view === 'expenses' && (
          <Btn variant="primary" onClick={onScan}>Νέα δαπάνη</Btn>
        )}
      </div>

      {contracts
        ? <TabBills propertyId={propertyId} userId={userId} legalForm={legalForm} />
        : view === 'expenses'
          // Η ΤΡΑΠΕΖΑ ΠΡΟΤΕΙΝΕΤΑΙ ΕΚΕΙ ΠΟΥ ΓΕΝΝΙΕΤΑΙ Η ΑΠΟΡΙΑ. Ο χρήστης
          // κοιτάζει τι έχει καταχωρήσει και σκέφτεται «πρέπει να τα περνάω ένα
          // ένα;». Μία γραμμή, όχι κάρτα: η κάρτα θα έπαιρνε τη θέση αυτού που
          // ήρθε να δει.
          ? <>
              <InboundInbox propertyId={propertyId} userId={userId} propertyName={propertyName}
                onFiled={() => setLedgerKey(k => k + 1)} />
              <BankLinkRow />
              <ExpenseLedger key={ledgerKey} propertyId={propertyId} userId={userId} onScan={onScan} openAddNonce={openAddNonce} />
            </>
          : <BillsBudget propertyId={propertyId} userId={userId} profileType={profileType} />}
    </div>
  );
}
