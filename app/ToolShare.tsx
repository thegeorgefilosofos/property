'use client';
// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΑΠΟΤΕΛΕΣΜΑ ΦΕΥΓΕΙ ΑΠΟ ΤΗ ΣΕΛΙΔΑ: ΣΥΝΔΕΣΜΟΣ ΚΑΙ ΧΑΡΤΙ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΕΚΑΝΑΝ ΟΙ ΔΥΟ ΥΠΟΛΟΓΙΣΤΕΣ ΠΡΙΝ. Απαντούσαν και τελείωναν εκεί. Ο επισκέπτης
// έβγαζε τον αριθμό και μετά ήθελε να τον δείξει — στον λογιστή, στον σύζυγο,
// στον συνιδιοκτήτη αδελφό. Δεν είχε τι να στείλει: η διεύθυνση της σελίδας
// γυρίζει στις προεπιλογές, δηλαδή σε ΑΛΛΟ αποτέλεσμα από αυτό που είδε, και το
// στιγμιότυπο οθόνης κόβει τη μισή ανάλυση.
//
// ΔΥΟ ΔΡΟΜΟΙ, ΓΙΑΤΙ ΕΙΝΑΙ ΔΥΟ ΔΙΑΦΟΡΕΤΙΚΟΙ ΑΝΘΡΩΠΟΙ. Ο σύνδεσμος πάει σε όποιον
// θα ξαναπειράξει τα πεδία· το χαρτί (ή το PDF της εκτύπωσης) πάει σε φάκελο,
// σε τράπεζα, σε συνάντηση. Το ίδιο περιεχόμενο, δύο μεταφορικά μέσα.
//
// Η ΔΙΕΥΘΥΝΣΗ ΕΝΗΜΕΡΩΝΕΤΑΙ ΚΑΘΩΣ ΓΡΑΦΕΙ, ΧΩΡΙΣ ΝΑ ΠΑΤΗΣΕΙ ΤΙΠΟΤΑ. Έτσι
// δουλεύουν και ο σελιδοδείκτης, και η αντιγραφή από τη γραμμή διευθύνσεων, και
// το «άνοιγμα σε νέα καρτέλα» — τρεις συνήθειες που δεν περνούν από κουμπί.
// Χρησιμοποιείται `replaceState` και όχι `pushState`: με το δεύτερο, κάθε
// πληκτρολόγηση θα άφηνε βήμα στο ιστορικό και το κουμπί «πίσω» του περιηγητή
// θα χρειαζόταν σαράντα πατήματα για να βγει από τη σελίδα.
//
// ΚΑΝΕΝΑ ΔΕΔΟΜΕΝΟ ΔΕΝ ΦΕΥΓΕΙ, ΚΑΙ Η ΥΠΟΣΧΕΣΗ ΜΕΝΕΙ ΑΚΕΡΑΙΑ. Οι παράμετροι ζουν
// στη διεύθυνση του δικού του περιηγητή· ταξιδεύουν μόνο αν ο ίδιος στείλει τον
// σύνδεσμο. Η σελίδα εξακολουθεί να μη στέλνει τίποτα πουθενά.
// ═══════════════════════════════════════════════════════════════════════════
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { readTool, toolQuery, toolLink, type ToolSpec, type ToolValues } from '@/lib/tools/permalink';
import { SITE_HOST } from '@/lib/core/site';
import { T, fdLong } from '@/components/tokens';

/**
 * Τα πεδία ενός εργαλείου, με τη διεύθυνση να τα ακολουθεί.
 *
 * Η αρχική τιμή διαβάζεται ΜΙΑ φορά, από τη διεύθυνση με την οποία άνοιξε η
 * σελίδα. Δεν υπάρχει συγχρονισμός προς την αντίθετη κατεύθυνση, και σωστά: αν
 * η κατάσταση ξαναδιαβαζόταν σε κάθε αλλαγή της διεύθυνσης, το πεδίο θα
 * ξαναγραφόταν κάτω από τα δάχτυλα του χρήστη ενώ πληκτρολογεί.
 */
export function useToolState<S extends ToolSpec>(spec: S, path: string) {
  const params = useSearchParams();
  const [values, setValues] = useState<ToolValues<S>>(() => readTool(spec, params));

  // ΤΟ ΓΡΑΨΙΜΟ ΣΤΗ ΔΙΕΥΘΥΝΣΗ ΓΙΝΕΤΑΙ ΜΕΣΑ ΣΤΟ ΓΕΓΟΝΟΣ, ΟΧΙ ΣΕ useEffect ΚΑΙ ΟΧΙ
  // ΜΕΣΑ ΣΤΟΝ ΕΝΗΜΕΡΩΤΗ ΤΟΥ setState. Ο ενημερωτής οφείλει να είναι καθαρός —
  // σε αυστηρή λειτουργία τρέχει δύο φορές, οπότε η παρενέργεια θα γινόταν
  // διπλή· και ένα useEffect θα έγραφε στη διεύθυνση μία απόδοση αργότερα.
  const set = (key: keyof S & string, v: string) => {
    const next = { ...values, [key]: v } as ToolValues<S>;
    setValues(next);
    window.history.replaceState(null, '', path + toolQuery(spec, next));
  };

  return [values, set] as const;
}

const btn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, height: T.h.sm,
  padding: '0 14px', borderRadius: T.radius.pill,
  border: '1px solid var(--border-default)', background: 'var(--bg-surface)',
  color: 'var(--text-secondary)', fontSize: 12.5, fontWeight: 600,
  fontFamily: T.font.sans, cursor: 'pointer', whiteSpace: 'nowrap',
};

function IconLink() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  );
}
function IconPrint() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
      <path d="M6 14h12v8H6z"/>
    </svg>
  );
}

/**
 * Οι δύο έξοδοι του αποτελέσματος. Δεν εμφανίζονται στην εκτύπωση: ένα κουμπί
 * «Εκτύπωση» τυπωμένο σε χαρτί είναι ο ορισμός του περιττού.
 */
export function ToolActions<S extends ToolSpec>(
  { path, spec, values }: { path: string; spec: S; values: Readonly<Record<string, string>> },
) {
  const [copied, setCopied] = useState(false);
  // ΟΤΑΝ ΤΟ ΠΡΟΧΕΙΡΟ ΕΙΝΑΙ ΚΛΕΙΣΤΟ, Ο ΣΥΝΔΕΣΜΟΣ ΦΑΙΝΕΤΑΙ. Σε ασφαλή περιβάλλοντα
  // χωρίς άδεια —παλιός περιηγητής, ιδιωτική περιήγηση, ενσωματωμένο webview—
  // το `writeText` απορρίπτεται. Ένα κουμπί που δεν κάνει τίποτα και δεν το λέει
  // είναι χειρότερο από κανένα κουμπί, οπότε ο σύνδεσμος εμφανίζεται ολόκληρος
  // και επιλεγμένος, έτοιμος για αντιγραφή με το χέρι.
  const [manual, setManual] = useState<string | null>(null);

  const copy = async () => {
    const link = toolLink(window.location.origin, path, spec, values);
    try {
      await navigator.clipboard.writeText(link);
      setManual(null);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setManual(link);
    }
  };

  return (
    <>
      <div className="po-noprint" style={{
        marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end',
      }}>
        <button type="button" onClick={copy} style={btn}>
          <IconLink/>
          {copied ? 'Ο σύνδεσμος αντιγράφηκε' : 'Αντιγραφή συνδέσμου'}
        </button>
        <button type="button" onClick={() => window.print()} style={btn}>
          <IconPrint/>
          Εκτύπωση
        </button>
      </div>

      {manual !== null && (
        <input readOnly value={manual} onFocus={e => e.currentTarget.select()} autoFocus
          aria-label="Ο σύνδεσμος του υπολογισμού"
          className="po-noprint"
          style={{
            marginTop: 10, width: '100%', height: T.h.md, padding: '0 12px',
            borderRadius: T.radius.btn, border: '1px solid var(--border-default)',
            background: 'var(--bg-surface)', color: 'var(--text-secondary)',
            fontSize: 12.5, fontFamily: T.font.num, boxSizing: 'border-box',
          }}/>
      )}

    </>
  );
}

/**
 * Η υπογραφή του χαρτιού: η διεύθυνση που ξαναβγάζει αυτόν ακριβώς τον
 * υπολογισμό.
 *
 * ΓΙΑΤΙ ΞΕΧΩΡΙΣΤΑ ΑΠΟ ΤΑ ΚΟΥΜΠΙΑ. Ζούσε μέσα στο `ToolActions`, δηλαδή ΣΤΗ ΜΕΣΗ
 * του χαρτιού — ανάμεσα στον πίνακα και στην επιφύλαξη. Μια υπογραφή στη μέση
 * της σελίδας διαβάζεται ως τέλος του κειμένου, και ό,τι ακολουθεί μοιάζει
 * παράρτημα. Μπαίνει τελευταία, όπου ανήκει.
 *
 * Γράφεται η ΚΑΝΟΝΙΚΗ διεύθυνση και όχι το `window.location`: σε χαρτί, ένα
 * «localhost:3000» ή μια διεύθυνση προεπισκόπησης δεν οδηγεί πουθενά.
 */
export function ToolPaperFoot<S extends ToolSpec>(
  { path, spec, values }: { path: string; spec: S; values: Readonly<Record<string, string>> },
) {
  return (
    <p className="po-printonly po-paper-foot">
      {SITE_HOST}{path}{toolQuery(spec, values)}
    </p>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Η ΚΕΦΑΛΙΔΑ ΤΟΥ ΧΑΡΤΙΟΥ: ΤΙ ΥΠΟΛΟΓΙΣΤΗΚΕ, ΜΕ ΤΙ ΔΕΔΟΜΕΝΑ, ΠΟΤΕ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΕΒΓΑΖΕ Η ΕΚΤΥΠΩΣΗ ΠΡΙΝ. Ολόκληρη τη σελίδα: τον διαφημιστικό τίτλο, την
// υπόσχεση «χωρίς εγγραφή», τα πεδία της φόρμας ως άδεια πλαίσια, πέντε
// συχνές ερωτήσεις και μια πρόσκληση για δοκιμή. Τέσσερις σελίδες χαρτί, από
// τις οποίες η μία έφερε το αποτέλεσμα.
//
// ΤΙ ΧΡΕΙΑΖΕΤΑΙ ΟΠΟΙΟΣ ΚΡΑΤΑΕΙ ΤΟ ΧΑΡΤΙ. Τρία πράγματα, και τα τρία απαραίτητα:
// τι υπολογίστηκε, με ποια δεδομένα, και πότε. Χωρίς τα δεδομένα εισόδου ο
// αριθμός είναι αναπόδεικτος — ο λογιστής δεν μπορεί να τον ελέγξει και ο
// ιδιοκτήτης δεν θυμάται σε έναν μήνα τι είχε βάλει.
//
// ΓΙΑΤΙ ΤΑ ΠΕΔΙΑ ΣΕ ΜΙΑ ΣΕΙΡΑ ΚΑΙ ΟΧΙ ΣΕ ΠΙΝΑΚΑ. Ενας πίνακας πέντε γραμμών
// για πέντε τιμές παίρνει το ένα τρίτο της σελίδας και διαβάζεται πιο αργά από
// μια σειρά. Στο χαρτί η πυκνότητα είναι ευγένεια.
// ═══════════════════════════════════════════════════════════════════════════

/** Ενα δεδομένο εισόδου, όπως γράφεται στο χαρτί. */
export interface PaperInput { k: string; v: string }

/**
 * Η κεφαλίδα της εκτύπωσης. Αόρατη στην οθόνη: εκεί τα ίδια στοιχεία τα λένε
 * ήδη ο τίτλος και τα ίδια τα πεδία, και μια δεύτερη φορά θα ήταν θόρυβος.
 *
 * Η ημερομηνία έρχεται από τον διακομιστή, σε ώρα Ελλάδας. Υπολογισμένη στον
 * περιηγητή θα διέφερε από την απόδοση του διακομιστή τα μεσάνυχτα, και η
 * ενυδάτωση θα έσπαγε.
 */
export function ToolPaper(
  { title, on, inputs }: { title: string; on: string; inputs: readonly PaperInput[] },
) {
  return (
    <header className="po-printonly po-paper">
      <div className="po-paper-top">
        <span>PROPERWISE</span>
        <span>{fdLong(on)}</span>
      </div>
      <h2 className="po-paper-title">{title}</h2>
      <p className="po-paper-inputs">
        {inputs.map((i, n) => (
          <span key={i.k}>
            {n > 0 && <span className="po-paper-sep"> · </span>}
            <span className="po-paper-k">{i.k}</span> {i.v}
          </span>
        ))}
      </p>
    </header>
  );
}
