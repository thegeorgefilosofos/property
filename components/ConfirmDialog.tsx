'use client';

// ═══════════════════════════════════════════════════════════════════════════
// PROPERWISE — ο ΜΟΝΑΔΙΚΟΣ υποδοχέας επιβεβαίωσης.
// Το «γιατί» και το API ζουν στο components/confirmBus.ts (χωρίς React), ώστε
// να μπορεί να καλεί `confirmDialog()` και κώδικας που δεν είναι component.
//
// ΓΙΑΤΙ ΕΝΑΣ ΚΑΘΟΛΙΚΟΣ HOST ΚΑΙ ΟΧΙ ΤΟΠΙΚΟ ΠΑΡΑΘΥΡΟ ΑΝΑ ΣΗΜΕΙΟ ΚΛΗΣΗΣ:
//   • Το OverflowMenu της Απογραφής ΚΛΕΙΝΕΙ το μενού πριν εκτελέσει το onClick.
//     Ένας διάλογος αποδοσμένος μέσα σε εκείνο το υποδέντρο θα ξεφορτωνόταν
//     ενόσω το Promise περιμένει: η υπόσχεση δεν θα ψηφιζόταν ΠΟΤΕ και η
//     διαγραφή απλώς δεν θα γινόταν, χωρίς κανένα μήνυμα.
//   • Η φόρμα ενοικιαστή είναι χειροποίητο modal που κλείνει με κλικ στο
//     backdrop της. Ένας διάλογος μέσα σε εκείνο το υποδέντρο θα έστελνε κάθε
//     κλικ του πίσω στο backdrop → η φόρμα θα ξαναζητούσε επιβεβαίωση, επ'
//     άπειρον. Ζώντας στη ρίζα του layout, ο διάλογος δεν είναι απόγονος
//     κανενός backdrop, άρα κανένα κλικ του δεν φτάνει εκεί.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { T } from './tokens';
import { Modal } from './Theme';
import { subscribeConfirm, type ConfirmRequest } from './confirmBus';

// Ξανα-εξάγονται εδώ ώστε ένα component να χρειάζεται μία μόνο εισαγωγή.
export { confirmDialog, CONFIRM_OK, CONFIRM_CANCEL } from './confirmBus';
export type { ConfirmOptions, ConfirmTone } from './confirmBus';

export function ConfirmHost() {
  const [req, setReq] = useState<ConfirmRequest | null>(null);
  const msgId = useId();
  const okRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  // Πού επιστρέφει η εστίαση μετά την απάντηση. Το native confirm το έκανε
  // δωρεάν· χωρίς αυτό ο χρήστης πληκτρολογίου χάνει τη θέση του και ξαναρχίζει
  // το Tab από την αρχή της σελίδας μετά από κάθε ακύρωση.
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => subscribeConfirm(r => {
    // Η στιγμή της κλήσης είναι η μόνη αξιόπιστη: αργότερα το κουμπί μπορεί να
    // έχει ήδη ξεφορτωθεί (μενού που κλείνει) και το activeElement να είναι το body.
    returnTo.current = (document.activeElement as HTMLElement | null) ?? null;
    setReq(r);
  }), []);

  // Δέχεται ρητά το αίτημα αντί να το διαβάζει από το closure, ώστε ο listener
  // του Escape (που στήνεται μία φορά ανά αίτημα) να μη μπορεί να απαντήσει σε
  // παλιό αίτημα αν μεσολαβήσει render.
  const answer = (r: ConfirmRequest | null, ok: boolean) => {
    if (!r) return;
    const back = returnTo.current;
    returnTo.current = null;
    setReq(null);
    r.settle(ok);
    // isConnected: αν ο κόμβος ξεφορτώθηκε όσο ήταν ανοιχτός ο διάλογος, το
    // focus() θα ήταν αθόρυβο no-op — το ελέγχουμε για να μη μοιάζει με τύχη.
    if (back?.isConnected) back.focus();
  };

  useEffect(() => {
    if (!req) return;

    // ── Escape: το πιάνουμε στη ΦΑΣΗ ΣΥΛΛΗΨΗΣ και το σταματάμε εκεί ──────────
    // Το κοινό <Modal> ακούει keydown στο `document` (φάση αναπήδησης) και
    // κλείνει. Όταν ο διάλογος επιβεβαίωσης ανοίγει ΠΑΝΩ από ένα άλλο Modal,
    // ένα Escape θα έφτανε και στα δύο: ο χρήστης θα ακύρωνε τη διαγραφή και
    // ταυτόχρονα θα του έκλεινε η φόρμα από κάτω, χάνοντας ό,τι είχε γράψει.
    // Η σύλληψη στο document τρέχει ΠΡΙΝ από κάθε listener αναπήδησης, οπότε το
    // stopPropagation κρατά το Escape αποκλειστικά για τον διάλογο.
    const onKeyCapture = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      answer(req, false);
    };
    document.addEventListener('keydown', onKeyCapture, true);

    const dlg = bodyRef.current?.closest('[role="dialog"],[role="alertdialog"]') as HTMLElement | null;
    if (dlg) {
      // Το κοινό <Modal> γράφει role="dialog". Μια ερώτηση που ΔΙΑΚΟΠΤΕΙ τον
      // χρήστη πρέπει να είναι alertdialog, αλλιώς ο αναγνώστης οθόνης την
      // ανακοινώνει σαν απλό παράθυρο και δεν διαβάζει το μήνυμα από μόνος του.
      // Το αναβαθμίζουμε στον ίδιο τον κόμβο αντί να φορκάρουμε το Modal — ένας
      // 14ος ορισμός παραθύρου θα κόστιζε πολύ περισσότερα από δύο setAttribute.
      dlg.setAttribute('role', 'alertdialog');
      if (req.message) dlg.setAttribute('aria-describedby', msgId);
      else dlg.removeAttribute('aria-describedby');
    }

    // Σε καταστροφική ενέργεια προεπιλέγεται το ΑΚΥΡΟ: ένα βιαστικό Enter ή
    // Space δεν επιτρέπεται να διαγράψει τίποτα. Στις ουδέτερες ερωτήσεις
    // («η ημερομηνία είναι στο μέλλον, συνέχεια;») προεπιλέγεται η συνέχεια,
    // όπως έκανε και το native confirm με το OK.
    (req.tone === 'negative' ? cancelRef : okRef).current?.focus();

    return () => document.removeEventListener('keydown', onKeyCapture, true);
    // Εξαρτάται ΜΟΝΟ από το αίτημα: η εστίαση μπαίνει μία φορά όταν ανοίγει ο
    // διάλογος. Αν έτρεχε σε κάθε render, ένα άσχετο render θα άρπαζε πίσω την
    // εστίαση από το κουμπί που μόλις διάλεξε ο χρήστης με Tab.
  }, [req, msgId]);

  if (!req) return null;

  const negative = req.tone === 'negative';

  return (
    // ΓΙΑΤΙ ΤΟ ΠΕΡΙΤΥΛΙΓΜΑ: το κοινό <Modal> έχει σταθερό z-index 1000, ενώ στην
    // εφαρμογή ζουν επιφάνειες σε 1500 (συρτάρι κινητού), 3000 (οδηγοί, tooltips)
    // και 9000/9999 (μενού υπερχείλισης). Μια ερώτηση που εμφανίζεται ΠΙΣΩ από
    // αυτά αφήνει τον χρήστη με σκοτεινή οθόνη που δεν αποκρίνεται — απόλυτο
    // κόλλημα, ακριβώς πάνω σε μια διαγραφή. Το position:relative + z-index
    // φτιάχνει δικό του πλαίσιο στοίβαξης, οπότε το 1000 του Modal μετράει πια
    // ΜΕΣΑ σε αυτό και ολόκληρο το παράθυρο κάθεται πάνω από τα πάντα.
    <div style={{ position: 'relative', zIndex: 10000 }}>
      <Modal
        open
        onClose={() => answer(req, false)}   // Escape, κλικ έξω και το × = ΑΚΥΡΟ, ποτέ «ναι»
        title={req.title}
        width={460}
        footer={
          <>
            <button ref={cancelRef} type="button" style={{ ...btnBase, ...btnSecondary }} onClick={() => answer(req, false)}>
              {req.cancelLabel}
            </button>
            <button ref={okRef} type="button" style={{ ...btnBase, ...(negative ? btnDanger : btnPrimary) }} onClick={() => answer(req, true)}>
              {req.confirmLabel}
            </button>
          </>
        }
      >
        <div
          ref={bodyRef} id={msgId}
          style={{
            fontFamily: T.font.sans, fontSize: 14, lineHeight: 1.6,
            color: 'var(--text-secondary)',
            // pre-line: το native confirm σεβόταν τις αλλαγές γραμμής. Χωρίς
            // αυτό, το μήνυμα της διαγραφής ακινήτου —που χωρίζει σε παραγράφους
            // το «τι θα σβηστεί» από το «δεν αναιρείται»— γίνεται ένας πυκνός
            // χυλός και η πιο σοβαρή πρόταση χάνεται μέσα του.
            whiteSpace: 'pre-line',
          }}
        >
          {req.message}
        </div>
      </Modal>
    </div>
  );
}

// ΓΙΑΤΙ ΟΧΙ ΤΟ <Btn> ΤΟΥ Theme.tsx: χρειάζονται δύο πράγματα που δεν δίνει —
// ref (για την αυτόματη εστίαση στο «Άκυρο») και καταστροφική παραλλαγή. Οι
// τιμές παρακάτω είναι ΑΚΡΙΒΩΣ οι δικές του, ώστε το υποσέλιδο του διαλόγου να
// μη μοιάζει ξένο δίπλα στα άλλα παράθυρα της εφαρμογής.
const btnBase: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  // ΤΟ ΣΧΟΛΙΟ ΑΠΟ ΠΑΝΩ ΕΛΕΓΕ «ΑΚΡΙΒΩΣ ΟΙ ΔΙΚΕΣ ΤΟΥ», ΚΑΙ ΕΛΕΙΠΕ ΜΙΑ ΓΡΑΜΜΗ.
  // Το `Btn` έχει `minHeight: T.h.md`· εδώ δεν υπήρχε, οπότε το «Άκυρο» και το
  // «Επιβεβαίωση» ΚΑΘΕ διαλόγου της εφαρμογής έβγαιναν 35 εικονοστοιχεία.
  minHeight: T.h.md,
  padding: '9px 18px', borderRadius: T.radius.btn,
  fontSize: 12, fontWeight: 700, fontFamily: T.font.sans,
  cursor: 'pointer', border: '1px solid transparent',
  transition: `all 0.15s ${T.ease.standard}`,
};
const btnSecondary: CSSProperties = { background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' };
const btnPrimary: CSSProperties   = { background: 'var(--accent)', color: 'var(--accent-text)' };

// ── Η ΚΑΤΑΣΤΡΟΦΙΚΗ ΕΝΕΡΓΕΙΑ ΔΕΝ ΦΩΝΑΖΕΙ ──────────────────────────────────
//
// Ηταν γεμάτο πλακίδιο στο πιο κορεσμένο κόκκινο της παλέτας: το πιο δυνατό
// χρώμα ολόκληρης της οθόνης, πάνω σε ένα παράθυρο που ήδη έχει σταματήσει τον
// χρήστη και του έχει ονομάσει τι πρόκειται να σβήσει. Το σταμάτημα το κάνει η
// ερώτηση· το χρώμα απλώς ούρλιαζε από πάνω της.
//
// ΤΟ ΣΗΜΑ ΜΕΝΕΙ, Ο ΘΟΡΥΒΟΣ ΦΕΥΓΕΙ. Το κόκκινο περνά στο ΚΕΙΜΕΝΟ και σε ένα
// λεπτό περίγραμμα — αρκετά για να μη μοιάζει με το «Ακύρωση» δίπλα του,
// αρκετά διακριτικά ώστε το βαρύτερο στοιχείο του παραθύρου να παραμένει η
// πρόταση που εξηγεί τι χάνεται.
//
// Η ΕΣΤΙΑΣΗ ΞΕΚΙΝΑ ΣΤΟ «ΑΚΥΡΩΣΗ» ούτως ή άλλως (γρ. 94), οπότε το Enter δεν
// σβήνει τίποτα κατά λάθος: η ασφάλεια είναι στη ροή, όχι στη βαφή.
const btnDanger: CSSProperties = {
  background: 'transparent',
  border: '1px solid color-mix(in srgb, var(--negative) 45%, transparent)',
  color: 'var(--negative)',
};
