// ═══════════════════════════════════════════════════════════════════════════
// ΤΙ ΕΧΩ, ΤΙ ΠΛΗΡΩΝΩ, ΠΟΤΕ ΛΗΓΕΙ — Η ΑΠΑΝΤΗΣΗ ΠΡΙΝ ΤΗΝ ΕΡΩΤΗΣΗ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΤΑΞΙΔΙ ΠΟΥ ΔΙΟΡΘΩΝΕΤΑΙ. Η οθόνη «Συμβόλαια» άνοιγε με έξι κλειστά chips
// και μία γραμμή: «Διάλεξε κατηγορία για να δεις το συμβόλαιό σου». Δηλαδή
// τρία κλικ και μια άδεια οθόνη πριν ο ιδιοκτήτης δει οτιδήποτε ΔΙΚΟ ΤΟΥ — και
// πίσω από κάθε chip ένα πάνελ εκατοντάδων γραμμών με καταλόγους της αγοράς.
//
// Η ιεραρχία ήταν ανάποδη. Ο ιδιοκτήτης δεν ανοίγει τα Συμβόλαια για να
// μελετήσει την αγορά· ανοίγει για να θυμηθεί τι έχει και πόσο του κοστίζει.
// Η αγορά είναι η ΔΕΥΤΕΡΗ ερώτηση, και μόνο για όποιον τη ρωτήσει.
//
// ΑΠΟ ΠΟΥ ΒΓΑΙΝΕΙ Η ΑΠΑΝΤΗΣΗ, ΚΑΙ ΓΙΑΤΙ ΟΧΙ ΑΠΟ ΦΟΡΜΑ
// Από τους λογαριασμούς που ο χρήστης ΗΔΗ έχει — τους περισσότερους τους έχει
// σαρώσει από φωτογραφία, οπότε φέρουν πάροχο, ποσό και περίοδο. Καμία νέα
// φόρμα, κανένα «συμπλήρωσε τα στοιχεία του συμβολαίου σου»: ό,τι μπορεί να
// διαβαστεί δεν ζητιέται.
//
// ΜΙΑ ΜΗΧΑΝΗ, ΟΧΙ ΔΕΥΤΕΡΗ. Ο εντοπισμός των επαναλαμβανόμενων σειρών ζει ήδη
// στο `lib/expenses/expected.ts` (τυπικό ποσό με διάμεσο, ρυθμός από τα κενά,
// αναγνώριση διμήνου). Εδώ δεν ξαναγράφεται τίποτα από αυτά — μόνο
// ομαδοποιούνται ανά κατηγορία συμβολαίου.
// ═══════════════════════════════════════════════════════════════════════════

import { expectedSeries, type ExpectedSeries } from '../expenses/expected';
import type { LedgerEntry } from '../expenses/ledger';

/** Οι κατηγορίες που έχουν πάροχο και συμβόλαιο. Η σειρά είναι η σειρά οθόνης. */
export const CONTRACT_KINDS = [
  'electricity', 'gas', 'water', 'internet', 'insurance', 'common', 'subscriptions',
] as const;
export type ContractKind = (typeof CONTRACT_KINDS)[number];

/**
 * Τι ζητά η κάθε κενή κάρτα. ΔΙΑΦΟΡΕΤΙΚΟ ΑΝΑ ΚΑΤΗΓΟΡΙΑ, ΚΑΙ ΕΙΝΑΙ ΤΟ ΘΕΜΑ.
 *
 * Και οι επτά κάρτες έγραφαν την ίδια πρόταση: «Ανέβασε τον τελευταίο
 * λογαριασμό και συμπληρώνεται μόνο του». Επτά φορές το ίδιο κείμενο δεν είναι
 * οδηγία — είναι ταπετσαρία: το μάτι το διαβάζει μία φορά και μετά προσπερνά
 * και τις επτά. Χειρότερα, ήταν και ΛΑΘΟΣ σε τρεις: η ασφάλεια δεν έχει
 * «λογαριασμό» αλλά συμβόλαιο, τα κοινόχρηστα έρχονται από τον διαχειριστή, και
 * οι συνδρομές δεν στέλνουν χαρτί καθόλου.
 */
export const CONTRACT_EMPTY_HINT: Record<ContractKind, string> = {
  electricity: 'Ανέβασε έναν λογαριασμό ρεύματος και συμπληρώνονται πάροχος, τιμολόγιο και κατανάλωση',
  gas: 'Ανέβασε έναν λογαριασμό αερίου για να μπει ο πάροχος και το κόστος',
  water: 'Ο λογαριασμός νερού είναι συνήθως διμηνιαίος, ανέβασε τον τελευταίο',
  internet: 'Ανέβασε έναν λογαριασμό σταθερού ή internet',
  insurance: 'Φωτογράφισε το ασφαλιστήριο, διαβάζονται εταιρεία, ασφάλιστρο και λήξη',
  common: 'Καταχώρησε την ειδοποίηση κοινοχρήστων του διαχειριστή',
  subscriptions: 'Καταχώρησε μία συνδρομή στις Δαπάνες και παρακολουθείται από εκεί',
};

export const CONTRACT_LABEL: Record<ContractKind, string> = {
  electricity: 'Ρεύμα',
  gas: 'Φυσικό αέριο',
  water: 'Νερό',
  internet: 'Σταθερό και internet',
  insurance: 'Ασφάλεια κατοικίας',
  common: 'Κοινόχρηστα',
  subscriptions: 'Συνδρομές',
};

/**
 * Από την κατηγορία δαπάνης στην κατηγορία συμβολαίου.
 *
 * Οι κατηγορίες της ταξινομίας είναι περισσότερες και λεπτότερες από τα
 * συμβόλαια: «streaming», «cloud» και «συνδρομή» είναι τρεις δαπάνες και ΕΝΑ
 * συμβόλαιο στο μυαλό του χρήστη.
 */
const KIND_OF: { kind: ContractKind; keys: string[] }[] = [
  { kind: 'electricity', keys: ['electric', 'ρευμα', 'ρεύμα', 'δεη'] },
  { kind: 'gas', keys: ['gas', 'αεριο', 'αέριο'] },
  { kind: 'water', keys: ['water', 'νερο', 'νερό', 'ευδαπ'] },
  { kind: 'internet', keys: ['internet', 'telecom', 'τηλεφ', 'σταθερ', 'κινητ'] },
  { kind: 'insurance', keys: ['insurance', 'ασφαλ'] },
  { kind: 'common', keys: ['common', 'κοινοχρηστ', 'κοινόχρηστ'] },
  { kind: 'subscriptions', keys: ['stream', 'subscription', 'συνδρομ', 'cloud', 'netflix', 'spotify', 'disney'] },
];

const bare = (s: string): string =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function contractKindOf(category: string, title = ''): ContractKind | null {
  const hay = `${bare(category)} ${bare(title)}`;
  for (const { kind, keys } of KIND_OF) if (keys.some(k => hay.includes(bare(k)))) return kind;
  return null;
}

export interface ContractCard {
  kind: ContractKind;
  label: string;
  /** Ο πάροχος όπως γράφεται στον λογαριασμό. Κενό όταν δεν τον ξέρουμε. */
  provider: string;
  /** Τι κοστίζει τον μήνα, από το ιστορικό. `null` όταν δεν φτάνει. */
  monthly: number | null;
  /** Κάθε πόσους μήνες έρχεται. 2 για ΕΥΔΑΠ και συχνά ΔΕΗ. */
  everyMonths: number;
  /** Πόσες περίοδοι μετρήθηκαν. Ο χρήστης δικαιούται να ξέρει πόσο στηρίζεται. */
  occurrences: number;
  /** Ο τελευταίος μήνας που εμφανίστηκε, «2026-07». Κενό όταν δεν υπάρχει. */
  lastMonth: string;
  /** Υπάρχουν δεδομένα, ή είναι κενή κάρτα που περιμένει τον πρώτο λογαριασμό; */
  known: boolean;
}

/** Το άθροισμα των μηνιαίων, για την κεφαλίδα. Μόνο ό,τι γνωρίζουμε. */
export function totalMonthly(cards: readonly ContractCard[]): number {
  return Math.round(cards.reduce((s, c) => s + (c.monthly ?? 0), 0) * 100) / 100;
}

/**
 * Μία κάρτα ανά κατηγορία συμβολαίου.
 *
 * ΟΛΕΣ οι κατηγορίες επιστρέφονται, και οι άγνωστες με `known: false`. Ο λόγος
 * είναι η κενή κατάσταση: μια κατηγορία που λείπει από την οθόνη δεν διδάσκει
 * τίποτα, ενώ μια κάρτα «Φυσικό αέριο — δεν έχει καταχωρηθεί λογαριασμός» λέει
 * ταυτόχρονα τι λείπει και πώς μπαίνει.
 *
 * ΤΟ ΠΟΣΟ ΕΙΝΑΙ ΑΝΑ ΜΗΝΑ, ΟΧΙ ΑΝΑ ΛΟΓΑΡΙΑΣΜΟ. Ο διμηνιαίος λογαριασμός των 90 €
 * είναι 45 € τον μήνα· γραμμένος ως 90 θα διπλασίαζε το σύνολο της κεφαλίδας.
 */
export function contractOverview(
  entries: readonly LedgerEntry[], today: Date,
): ContractCard[] {
  const series = expectedSeries(entries, today);

  const byKind = new Map<ContractKind, ExpectedSeries[]>();
  for (const s of series) {
    const kind = contractKindOf(s.category, s.title);
    if (!kind) continue;
    const list = byKind.get(kind);
    if (list) list.push(s); else byKind.set(kind, [s]);
  }

  return CONTRACT_KINDS.map((kind): ContractCard => {
    const list = (byKind.get(kind) ?? []).sort((a, b) => b.typicalAmount - a.typicalAmount);
    if (!list.length) {
      return {
        kind, label: CONTRACT_LABEL[kind], provider: '', monthly: null,
        everyMonths: 1, occurrences: 0, lastMonth: '', known: false,
      };
    }
    const monthly = list.reduce((s, x) => s + x.typicalAmount / x.everyMonths, 0);
    const main = list[0];
    return {
      kind, label: CONTRACT_LABEL[kind],
      // Πολλοί πάροχοι στην ίδια κατηγορία (ρεύμα σπιτιού και γκαράζ): δείχνεται
      // ο μεγαλύτερος, και το πλήθος το λέει η οθόνη.
      provider: (main.vendor || '').trim(),
      monthly: Math.round(monthly * 100) / 100,
      everyMonths: main.everyMonths,
      occurrences: list.reduce((s, x) => s + x.occurrences, 0),
      lastMonth: list.map(x => x.lastMonth).sort().pop() || '',
      known: true,
    };
  });
}
