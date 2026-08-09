// ═══════════════════════════════════════════════════════════════════════════
// «Η ΑΑΔΕ ΛΕΕΙ 7.200 €. ΤΑ ΔΙΚΑ ΣΟΥ ΛΕΝΕ 6.900 €. ΔΕΣ ΤΗ ΔΙΑΦΟΡΑ.»
//
// ΓΙΑΤΙ ΑΥΤΟ ΚΑΙ ΟΧΙ ΑΛΛΟ
// Η ΑΑΔΕ στέλνει πλέον το Ε2 ΠΡΟΣΥΜΠΛΗΡΩΜΕΝΟ, από τις δηλώσεις μισθώσεων και
// τα στοιχεία των πλατφορμών. Άρα κάθε λειτουργία που λέει «σου συμπληρώνω το
// έντυπο» έχει ημερομηνία λήξης: το κράτος το κάνει ήδη, και θα το κάνει
// καλύτερα κάθε χρόνο.
//
// Το προσυμπληρωμένο όμως είναι ΣΥΧΝΑ ΛΑΘΟΣ — γι' αυτό ακριβώς η ΑΑΔΕ αφήνει
// τον φορολογούμενο να το διορθώσει. Και ο ιδιοκτήτης δεν έχει τρόπο να ξέρει
// αν είναι λάθος, γιατί δεν κρατάει δικό του αρχείο. Υπογράφει ό,τι του δείχνουν,
// και το λάθος γίνεται δικό του.
//
// Αυτή είναι η μόνη λειτουργία που το κράτος ΔΕΝ μπορεί να αποκτήσει: δεν
// μπορεί να είναι ταυτόχρονα ο ελεγχόμενος και ο ελεγκτής.
//
// ΤΙ ΚΑΝΕΙ ΚΑΙ ΤΙ ΔΕΝ ΚΑΝΕΙ
// Συγκρίνει ΑΤΑΚ προς ΑΤΑΚ και, όπου υπάρχει διαφορά, ΕΞΗΓΕΙ την από στοιχεία
// που έχουμε — μήνες, ποσοστό συνιδιοκτησίας, ανείσπρακτα, προμήθεια πλατφόρμας.
// Όπου ΔΕΝ μπορεί να εξηγήσει, το λέει καθαρά και σταματά. Δεν προτείνει ποιο
// νούμερο είναι σωστό: αυτό είναι απόφαση του φορολογούμενου και του λογιστή
// του. Δεν υπολογίζει φόρο. Δεν υποβάλλει τίποτα.
//
// ΤΟ ΠΙΟ ΣΗΜΑΝΤΙΚΟ: ΚΑΜΙΑ ΕΞΗΓΗΣΗ ΧΩΡΙΣ ΑΠΟΔΕΙΞΗ
// Κάθε λόγος που επιστρέφεται κουβαλά τα νούμερα πάνω στα οποία στηρίχτηκε. Μια
// «εξήγηση» χωρίς νούμερα είναι εικασία, και σε οθόνη φορολογίας η εικασία που
// ακούγεται σαν διάγνωση είναι χειρότερη από τη σιωπή.
// ═══════════════════════════════════════════════════════════════════════════

import type { E2Row } from './e2';
import { fe } from '../core/format';

/** Μία γραμμή του προσυμπληρωμένου, όπως τη διάβασε ο χρήστης ή η σάρωση. */
export interface DeclaredRow {
  /** ΑΤΑΚ, το μόνο σταθερό κλειδί ταύτισης ακινήτου. */
  atak: string | null;
  /** Ακαθάριστο εισόδημα που δείχνει το έντυπο, σε ευρώ. */
  gross: number;
  /** Μήνες εκμίσθωσης κατά το έντυπο, αν φαίνονται. */
  months?: number | null;
}

/** Ό,τι ξέρουμε επιπλέον για το ακίνητο και βοηθά να εξηγηθεί μια διαφορά. */
export interface OurEvidence {
  atak: string | null;
  /** Ονομασία για την οθόνη. */
  name?: string;
  /** Ανείσπρακτα του έτους, αν τα ξέρουμε. Το Ε2 δηλώνει ΔΕΔΟΥΛΕΥΜΕΝΑ. */
  unpaid?: number | null;
  /** Προμήθειες πλατφόρμας του έτους (βραχυχρόνια). */
  platformFees?: number | null;
  /** Τέλος ανθεκτικότητας που εισπράχθηκε και αποδόθηκε — ΔΕΝ είναι έσοδο. */
  climateLevy?: number | null;
  /** Υπάρχουν διαμονές με απροσδιόριστη βάση ποσού (payout ή ακαθάριστο;). */
  unresolvedAmounts?: number | null;
  /** Είναι βραχυχρόνια; Αλλάζει ποιες εξηγήσεις έχουν νόημα. */
  shortTerm?: boolean;
}

export type Verdict =
  | 'match'          // ίδια νούμερα (εντός ανοχής στρογγυλοποίησης)
  | 'ours_higher'    // εμείς δείχνουμε περισσότερα
  | 'theirs_higher'  // η ΑΑΔΕ δείχνει περισσότερα
  | 'only_ours'      // ακίνητο που δεν υπάρχει στο προσυμπληρωμένο
  | 'only_theirs';   // γραμμή στο έντυπο για ακίνητο που δεν έχουμε

export interface Reason {
  /** Σταθερό αναγνωριστικό, για δοκιμές και για την οθόνη. */
  code: string;
  /** Η εξήγηση, με τα νούμερα μέσα. */
  text: string;
  /**
   * Πόσο της διαφοράς εξηγεί, σε ευρώ. `null` όταν ο λόγος είναι ποιοτικός
   * (π.χ. «το δικό μας είναι εκτίμηση») και δεν αποδίδεται σε ποσό.
   */
  amount: number | null;
}

export interface Line {
  atak: string | null;
  name: string;
  /** Το δικό μας ακαθάριστο. `null` όταν δεν έχουμε γραμμή. */
  ours: number | null;
  /** Το ακαθάριστο του προσυμπληρωμένου. `null` όταν δεν υπάρχει γραμμή. */
  theirs: number | null;
  /** ours − theirs. `null` όταν λείπει κάποια πλευρά. */
  diff: number | null;
  verdict: Verdict;
  reasons: Reason[];
  /** Πόσο της διαφοράς έμεινε ανεξήγητο. `null` όταν δεν υπάρχει διαφορά. */
  unexplained: number | null;
  /** Τι να κάνει ο χρήστης. Μία πρόταση, χωρίς ορολογία. */
  action: string;
}

export interface Reconciliation {
  lines: Line[];
  totalOurs: number;
  totalTheirs: number;
  totalDiff: number;
  /** Πόσες γραμμές χρειάζονται προσοχή. */
  needsAttention: number;
  /** Η μία φράση για την κορυφή της οθόνης. `null` όταν δεν υπάρχει τι να πει. */
  headline: string | null;
}

/**
 * Ανοχή στρογγυλοποίησης, σε ευρώ.
 *
 * ΓΙΑΤΙ 1 ΚΑΙ ΟΧΙ 0: το `buildE2Row` στρογγυλοποιεί το μερίδιο συνιδιοκτησίας
 * (`Math.round(gross × pct / 100)`), οπότε διαφορά ενός ευρώ είναι αριθμητική,
 * όχι ουσιαστική. ΓΙΑΤΙ ΟΧΙ ΜΕΓΑΛΥΤΕΡΗ: κάθε ευρώ πάνω από αυτό είναι πραγματικό
 * και ο χρήστης έχει δικαίωμα να το δει.
 */
export const TOLERANCE = 1;

// Ο ΜΟΡΦΟΠΟΙΗΤΗΣ ΕΥΡΩ ΔΕΝ ΞΑΝΑΓΡΑΦΕΤΑΙ. Αυτός εδώ στρογγυλοποιούσε στο ακέραιο
// («1.200 €» αντί για «1.200,00 €»), δηλαδή παραβίαζε τον κανόνα των δύο
// δεκαδικών σε κάθε πρόταση που παρήγαγε. Ο κανονικός ζει στο lib/core/format.ts
// και δεν εξαρτάται από React, ακριβώς ώστε να τον βλέπουν και οι βιβλιοθήκες.
const eur = fe;
const norm = (a: string | null | undefined) => String(a ?? '').replace(/\s/g, '').toUpperCase();

/** Είναι το «λείπει ο Χ μήνας»: πόσο κάνει ένας μήνας, με βάση το δικό μας σύνολο. */
function perMonth(gross: number, months: number): number | null {
  if (!(months > 0) || !(gross > 0)) return null;
  return gross / months;
}

/**
 * Οι λόγοι της διαφοράς, με σειρά «πρώτα ό,τι εξηγεί τα περισσότερα ευρώ».
 *
 * ΚΑΘΕ ΛΟΓΟΣ ΕΛΕΓΧΕΤΑΙ ΠΡΙΝ ΕΙΠΩΘΕΙ. Αν το νούμερο δεν υπάρχει ή δεν ταιριάζει
 * στο μέγεθος της διαφοράς, ο λόγος ΔΕΝ μπαίνει. Καλύτερα «δεν το εξηγώ» παρά
 * μια εξήγηση που ο λογιστής θα καταρρίψει σε δέκα δευτερόλεπτα.
 */
function explain(row: E2Row, dec: DeclaredRow, ev: OurEvidence | undefined, diff: number): Reason[] {
  const out: Reason[] = [];
  const abs = Math.abs(diff);

  // ── 1. Μήνες. Η συχνότερη πραγματική αιτία: ένας μήνας που λείπει από τη μία
  //       πλευρά. Το λέμε ΜΟΝΟ όταν οι μήνες όντως διαφέρουν.
  const theirMonths = dec.months;
  if (typeof theirMonths === 'number' && theirMonths !== row.months) {
    const d = row.months - theirMonths;
    const pm = perMonth(row.grossIncome, row.months);
    const amount = pm != null ? Math.round(pm * d) : null;
    out.push({
      code: 'months',
      text: d > 0
        ? `Εσύ μετράς ${row.months} μήνες εκμίσθωσης, το έντυπο ${theirMonths}. Διαφορά ${Math.abs(d)} ${Math.abs(d) === 1 ? 'μήνας' : 'μήνες'}${pm != null ? `, περίπου ${eur(Math.abs(pm * d))}` : ''}.`
        : `Το έντυπο μετράει ${theirMonths} μήνες, εσύ ${row.months}. Έλεγξε αν λείπει μίσθωση από το αρχείο σου.`,
      amount,
    });
  }

  // ── 2. Συνιδιοκτησία. Αν η αναλογία theirs/ours πέφτει πάνω στο ποσοστό,
  //       η εξήγηση είναι ότι το έντυπο δείχνει το ΣΥΝΟΛΟ και εμείς το μερίδιο.
  if (row.ownershipPct > 0 && row.ownershipPct < 100 && row.grossIncome > 0 && dec.gross > 0) {
    const full = row.grossIncome * 100 / row.ownershipPct;
    if (Math.abs(full - dec.gross) <= Math.max(TOLERANCE, dec.gross * 0.01)) {
      out.push({
        code: 'ownership',
        text: `Το έντυπο δείχνει ολόκληρο το μίσθωμα (${eur(dec.gross)}). Εσύ δηλώνεις το ${row.ownershipPct}% σου, δηλαδή ${eur(row.grossIncome)}. Επιβεβαίωσε ότι οι υπόλοιποι συνιδιοκτήτες δηλώνουν τα δικά τους μερίδια.`,
        amount: Math.round(row.grossIncome - dec.gross),
      });
    }
  }

  // ── 3. Βραχυχρόνια: η προμήθεια της πλατφόρμας. Η πλατφόρμα δηλώνει
  //       ΑΚΑΘΑΡΙΣΤΑ· αν ο χρήστης κατέγραψε το ποσό που μπήκε στον λογαριασμό
  //       του, λείπει ακριβώς η προμήθεια.
  const fees = ev?.platformFees ?? 0;
  if (ev?.shortTerm && fees > 0 && diff < 0 && Math.abs(abs - fees) <= Math.max(TOLERANCE, fees * 0.2)) {
    out.push({
      code: 'platform_fee',
      text: `Η πλατφόρμα δηλώνει ΑΚΑΘΑΡΙΣΤΑ, πριν την προμήθειά της (${eur(fees)}). Αν κατέγραψες το ποσό που μπήκε στον λογαριασμό σου, η διαφορά είναι η προμήθεια, που είναι δαπάνη σου, όχι μείωση του εσόδου.`,
      amount: -Math.round(fees),
    });
  }

  // ── 4. Τέλος ανθεκτικότητας: το πληρώνει ο επισκέπτης και το αποδίδεις.
  //       Αν το έντυπο το έχει μέσα, δεν είναι έσοδό σου.
  const levy = ev?.climateLevy ?? 0;
  if (ev?.shortTerm && levy > 0 && diff < 0 && Math.abs(abs - levy) <= Math.max(TOLERANCE, levy * 0.2)) {
    out.push({
      code: 'climate_levy',
      text: `Η διαφορά ισούται με το τέλος ανθεκτικότητας που εισέπραξες και απέδωσες (${eur(levy)}). Δεν είναι έσοδό σου· έλεγξε αν το έντυπο το έχει προσθέσει στα ακαθάριστα.`,
      amount: -Math.round(levy),
    });
  }

  // ── 5. Ανείσπρακτα. ΠΡΟΣΟΧΗ ΣΤΗ ΔΙΑΤΥΠΩΣΗ: το Ε2 δηλώνει ΔΕΔΟΥΛΕΥΜΕΝΑ, άρα
  //       τα ανείσπρακτα ΔΕΝ δικαιολογούν μικρότερο ποσό — εκτός αν έχει
  //       προηγηθεί η νόμιμη διαδικασία. Δεν αποδίδουμε ποσό: δεν είναι εξήγηση
  //       της διαφοράς, είναι προειδοποίηση.
  const unpaid = ev?.unpaid ?? 0;
  if (unpaid > 0 && diff < 0) {
    out.push({
      code: 'unpaid',
      text: `Έχεις ${eur(unpaid)} ανείσπρακτα. Το Ε2 δηλώνει ΔΕΔΟΥΛΕΥΜΕΝΑ μισθώματα, δηλαδή όσα οφείλονται, ανεξάρτητα από το αν εισπράχθηκαν. Δεν μειώνεις το ποσό επειδή δεν πληρώθηκες, εκτός αν έχεις κάνει τη νόμιμη διαδικασία ΠΡΙΝ την υποβολή.`,
      amount: null,
    });
  }

  // ── 6. Απροσδιόριστη βάση ποσού: δεν ξέρουμε αν οι δικές μας εγγραφές είναι
  //       ακαθάριστα ή payout. Ποιοτικός λόγος, χωρίς ποσό.
  if ((ev?.unresolvedAmounts ?? 0) > 0) {
    out.push({
      code: 'unresolved_basis',
      text: `${eur(ev!.unresolvedAmounts!)} από τις δικές σου εγγραφές δεν ξέρουμε αν είναι ακαθάριστα ή το ποσό που μπήκε στον λογαριασμό σου. Μέχρι να το επιβεβαιώσεις, η σύγκριση δεν είναι ασφαλής.`,
      amount: null,
    });
  }

  // ── 7. Το δικό μας είναι εκτίμηση. Το ξέρει ήδη το buildE2Row και το γράφει
  //       στα flags — δεν το ξαναϋπολογίζουμε, το διαβάζουμε.
  if (row.flags.some(f => f.includes('εκτίμηση'))) {
    out.push({
      code: 'ours_estimated',
      text: 'Το δικό μας νούμερο είναι εκτίμηση, όχι καταγραφή: δεν υπάρχουν καταχωρημένες εισπράξεις για όλο το έτος. Καταχώρισε τα μισθώματα και ξαναδές τη σύγκριση.',
      amount: null,
    });
  }

  // Πρώτα όσα εξηγούν τα περισσότερα ευρώ, μετά οι ποιοτικοί λόγοι.
  return out.sort((a, b) => Math.abs(b.amount ?? 0) - Math.abs(a.amount ?? 0));
}

function actionFor(v: Verdict, unexplained: number | null, hasReasons: boolean): string {
  if (v === 'match') return 'Συμφωνούν. Δεν χρειάζεται κάτι.';
  if (v === 'only_theirs') return 'Το έντυπο έχει ακίνητο που δεν υπάρχει στο αρχείο σου. Πρόσθεσέ το ή ζήτα διόρθωση.';
  if (v === 'only_ours') return 'Έχεις ακίνητο που δεν εμφανίζεται στο έντυπο. Έλεγξε αν πρέπει να προστεθεί.';
  if (unexplained != null && Math.abs(unexplained) > TOLERANCE) {
    return hasReasons
      ? `Μένουν ${eur(Math.abs(unexplained))} που δεν εξηγούνται από τα δικά σου στοιχεία. Δείξ’ το στον λογιστή σου πριν υποβάλεις.`
      : `Διαφορά ${eur(Math.abs(unexplained))} χωρίς εξήγηση από τα δικά σου στοιχεία. Δείξ’ το στον λογιστή σου πριν υποβάλεις.`;
  }
  return 'Η διαφορά εξηγείται πλήρως από τα δικά σου στοιχεία. Επιβεβαίωσε και προχώρα.';
}

/**
 * Η σύγκριση.
 *
 * Ταύτιση ΜΟΝΟ με ΑΤΑΚ: είναι το μοναδικό σταθερό κλειδί ακινήτου. Ταύτιση με
 * διεύθυνση θα έβγαζε λάθος ζευγάρια σε πολυκατοικίες, και ένα λάθος ζευγάρι
 * παράγει φανταστική διαφορά που στέλνει τον χρήστη σε λάθος κατεύθυνση.
 */
export function reconcileE2(
  ours: readonly E2Row[],
  declared: readonly DeclaredRow[],
  evidence: readonly OurEvidence[] = [],
): Reconciliation {
  const evByAtak = new Map<string, OurEvidence>();
  for (const e of evidence) if (norm(e.atak)) evByAtak.set(norm(e.atak), e);

  const decByAtak = new Map<string, DeclaredRow>();
  for (const d of declared) if (norm(d.atak)) decByAtak.set(norm(d.atak), d);

  const lines: Line[] = [];
  const seen = new Set<string>();

  for (const row of ours) {
    const key = norm(row.atak);
    const ev = evByAtak.get(key);
    const name = ev?.name || row.address || row.atak || 'Ακίνητο';
    const dec = key ? decByAtak.get(key) : undefined;
    if (dec) seen.add(key);

    if (!dec) {
      // ΧΩΡΙΣ ΑΤΑΚ ΔΕΝ ΥΠΑΡΧΕΙ ΣΥΓΚΡΙΣΗ. Το λέμε αντί να ταιριάξουμε στην τύχη.
      lines.push({
        atak: row.atak || null, name,
        ours: row.grossIncome, theirs: null, diff: null,
        verdict: 'only_ours',
        reasons: key ? [] : [{
          code: 'no_atak',
          text: 'Λείπει ο ΑΤΑΚ, που είναι το μόνο σταθερό κλειδί ταύτισης. Συμπλήρωσέ τον για να μπορεί να γίνει η σύγκριση.',
          amount: null,
        }],
        unexplained: null,
        action: actionFor('only_ours', null, false),
      });
      continue;
    }

    const diff = row.grossIncome - dec.gross;
    if (Math.abs(diff) <= TOLERANCE) {
      lines.push({
        atak: row.atak || null, name,
        ours: row.grossIncome, theirs: dec.gross, diff,
        verdict: 'match', reasons: [], unexplained: 0,
        action: actionFor('match', 0, false),
      });
      continue;
    }

    const reasons = explain(row, dec, ev, diff);
    const explained = reasons.reduce((s, r) => s + (r.amount ?? 0), 0);
    const unexplained = Math.round(diff - explained);
    lines.push({
      atak: row.atak || null, name,
      ours: row.grossIncome, theirs: dec.gross, diff,
      verdict: diff > 0 ? 'ours_higher' : 'theirs_higher',
      reasons, unexplained,
      action: actionFor(diff > 0 ? 'ours_higher' : 'theirs_higher', unexplained, reasons.length > 0),
    });
  }

  // Γραμμές του εντύπου για ακίνητα που δεν έχουμε: το πιο επικίνδυνο εύρημα,
  // γιατί σημαίνει ότι το κράτος γνωρίζει εισόδημα που εσύ δεν κατέγραψες.
  for (const d of declared) {
    const key = norm(d.atak);
    if (key && seen.has(key)) continue;
    lines.push({
      atak: d.atak || null, name: d.atak || 'Γραμμή εντύπου',
      ours: null, theirs: d.gross, diff: null,
      verdict: 'only_theirs', reasons: [], unexplained: null,
      action: actionFor('only_theirs', null, false),
    });
  }

  const totalOurs = lines.reduce((s, l) => s + (l.ours ?? 0), 0);
  const totalTheirs = lines.reduce((s, l) => s + (l.theirs ?? 0), 0);
  const totalDiff = totalOurs - totalTheirs;
  const needsAttention = lines.filter(l => l.verdict !== 'match').length;

  let headline: string | null = null;
  if (lines.length === 0) headline = null;
  else if (needsAttention === 0) headline = `Το προσυμπληρωμένο συμφωνεί με τα δικά σου στοιχεία σε ${lines.length === 1 ? 'ένα ακίνητο' : `${lines.length} ακίνητα`}.`;
  else if (Math.abs(totalDiff) <= TOLERANCE) headline = `Τα σύνολα συμφωνούν, αλλά ${needsAttention === 1 ? 'ένα ακίνητο διαφέρει' : `${needsAttention} ακίνητα διαφέρουν`} μεταξύ τους.`;
  else headline = `Η ΑΑΔΕ λέει ${eur(totalTheirs)}. Τα δικά σου λένε ${eur(totalOurs)}. Διαφορά ${eur(Math.abs(totalDiff))}.`;

  return { lines, totalOurs, totalTheirs, totalDiff, needsAttention, headline };
}
