// ═══════════════════════════════════════════════════════════════════════════
// ΠΟΙΑ ΠΕΔΙΑ ΒΛΕΠΕΙ ΑΥΤΟΣ Ο ΧΡΗΣΤΗΣ, ΣΕ ΑΥΤΗ ΤΗ ΦΟΡΜΑ, ΤΩΡΑ.
//
// ΤΟ ΠΡΟΒΛΗΜΑ ΠΟΥ ΛΥΝΕΙ
// Το lib/property/visibility.ts έκρυβε ΚΑΡΤΕΛΕΣ. Μέσα στις καρτέλες όμως τα
// πεδία εμφανίζονταν ΟΛΑ, σε όλους. Μετρήθηκε τον Ιούλιο 2026:
//   • 78 πεδία στη φόρμα ενοικιαστή — μαζί με 15 για πέντε είδη συντήρησης
//     (κλιματιστικό, ηλιακός, αντλία θερμότητας, φωτοβολταϊκά, απεντόμωση) και
//     9 για μετρητές, σε έναν ιδιοκτήτη που κληρονόμησε ένα διαμέρισμα
//   • 28 πεδία ανά αντικείμενο απογραφής, μαζί με «standby watt» και
//     οκτώ επιλογές προέλευσης («Δώρο», «Από προηγούμενο σπίτι»…)
//   • 20 πεδία επαφής, από τα οποία έξι δεν προκαλούν καμία ενέργεια
//   • CRM πεδία επαγγελματία διαχειριστή (εθνικότητα, VIP, πηγή γνωριμίας) σε
//     οικοδεσπότη Airbnb, όπου ο επισκέπτης έρχεται μία φορά
//
// Ο ιδιοκτήτης του προϊόντος το είπε ρητά: «όταν χτίζει το προφίλ, ανάλογα με
// το τι θα επιλέξεις βλέπεις και τα αντίστοιχα πεδία — όχι παντού τα πάντα».
//
// Η ΑΡΧΗ
// Ένα πεδίο δεν υπάρχει «επειδή μπορεί να το θέλει κάποιος». Υπάρχει επειδή
// ΚΑΠΟΙΑ ΕΠΙΛΟΓΗ ΤΟΥ ΧΡΗΣΤΗ το κάνει να έχει νόημα. Αν δεν μπορείς να γράψεις
// ποια επιλογή είναι αυτή, το πεδίο δεν μπαίνει.
//
// ΚΑΘΕ ΠΕΔΙΟ ΕΧΕΙ ΓΡΑΜΜΕΝΟ ΤΟ «ΓΙΑΤΙ»
// Δεν είναι διακόσμηση. Όποιος δεν καταλαβαίνει γιατί ζητάμε κάτι, δεν το
// συμπληρώνει — και μετά λείπει από τη δήλωση. Το ίδιο μάθημα με το
// lib/accounting/dossier.ts.
//
// ΤΡΙΑ ΕΠΙΠΕΔΑ, ΟΧΙ ΔΥΟ
//   'core'   → φαίνεται πάντα όταν έχει νόημα. Χωρίς αυτό η φόρμα δεν στέκει.
//   'more'   → έχει νόημα, αλλά σπάνια. Πίσω από «Περισσότερα», κλειστό.
//   'hidden' → δεν έχει νόημα για αυτόν τον χρήστη. Δεν υπάρχει καθόλου.
// Το «κλειδωμένο» ΔΕΝ είναι επιλογή: λουκέτο σε πεδίο σημαίνει «πλήρωσε για να
// συμπληρώσεις τα δικά σου στοιχεία», που είναι παράλογο.
//
// ΤΑ ΚΡΙΣΙΜΑ ΔΕΝ ΚΡΥΒΟΝΤΑΙ ΠΟΤΕ
// Ό,τι έχει σημαία `critical` αφορά συμμόρφωση — ΑΜΑ, ακαθάριστα, δήλωση. Δεν
// πηγαίνει ποτέ σε «Περισσότερα» και δεν μπαίνει ποτέ πίσω από συνδρομή, όσο
// σπάνιο κι αν είναι. Ο χρήστης δεν πληρώνει για να μάθει ότι έχει πρόβλημα.
// ═══════════════════════════════════════════════════════════════════════════

import type { PropertyStatus } from './status';

/** Πού ζει το πεδίο στη φόρμα. */
export type Placement = 'core' | 'more' | 'hidden';

/**
 * Ό,τι έχει επιλέξει ο χρήστης και αλλάζει τη φόρμα.
 *
 * ΓΙΑΤΙ ΤΟΣΑ ΛΙΓΑ: κάθε είσοδος εδώ πρέπει να είναι κάτι που ο χρήστης έχει
 * ΔΗΛΩΣΕΙ, όχι κάτι που συμπεραίνουμε. Ένα συμπέρασμα που πέφτει έξω κρύβει
 * πεδίο που κάποιος χρειάζεται — και δεν έχει τρόπο να το βρει.
 */
export interface FieldContext {
  /** Η κατάσταση του ακινήτου (readStatus). Η σημαντικότερη είσοδος. */
  status: PropertyStatus;
  /** Έχει επιχειρηματική δραστηριότητα (ατομική, ΟΕ/ΕΕ, εταιρεία). */
  business: boolean;
  /** Διπλογραφικά. Ο ισολογισμός κρέμεται από ΕΔΩ, όχι από τη νομική μορφή. */
  doubleEntry: boolean;
  /** Πόσα ακίνητα έχει. Κάτω από 3 δεν υπάρχει «χαρτοφυλάκιο». */
  propertyCount: number;
  /** Επιπλωμένο; Χωρίς αυτό δεν υπάρχουν υπηρεσίες και απογραφή εξοπλισμού. */
  furnished?: boolean;
  /** Έχει ενεργό δάνειο στο ακίνητο. */
  hasLoan?: boolean;
  /** Εισπράττει μέσω τραπέζης — από 1/1/2026 κρίνει την τεκμαρτή έκπτωση. */
  rentsViaBank?: boolean;
}

export interface FieldRule {
  id: string;
  label: string;
  /** Γιατί το ζητάμε, σε μία φράση χωρίς ορολογία. Φαίνεται στον χρήστη. */
  why: string;
  /**
   * Πότε έχει νόημα. Αν λείπει, πάντα.
   * Επιστρέφει `false` → το πεδίο δεν υπάρχει καθόλου για αυτόν τον χρήστη.
   */
  when?: (c: FieldContext) => boolean;
  /** Σπάνιο αλλά υπαρκτό: πάει σε «Περισσότερα» αντί να λείπει. */
  rare?: boolean;
  /** Συμμόρφωση. Δεν κρύβεται ποτέ, δεν κλειδώνεται ποτέ. */
  critical?: boolean;
}

// ── Κατηγορήματα, ώστε οι κανόνες να διαβάζονται σαν προτάσεις ─────────────
const isShort = (c: FieldContext) => c.status === 'rent_short';
const isLong = (c: FieldContext) => c.status === 'rent_long';
const letsIt = (c: FieldContext) => isShort(c) || isLong(c);
const furnished = (c: FieldContext) => c.furnished === true;

// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΜΗΤΡΩΟ
//
// Ομαδοποιημένο κατά φόρμα. Το πρόθεμα του id είναι η φόρμα, ώστε μια οθόνη να
// ζητά τα δικά της χωρίς να ξέρει τα υπόλοιπα.
// ═══════════════════════════════════════════════════════════════════════════

/** Φόρμα ενοικιαστή — μακροχρόνια μίσθωση. */
export const TENANT_FIELDS: readonly FieldRule[] = [
  { id: 'tenant.full_name', label: 'Ονοματεπώνυμο', why: 'Μπαίνει στο μισθωτήριο και στο Ε2.', when: isLong },
  { id: 'tenant.afm', label: 'ΑΦΜ', why: 'Το Ε2 ζητά ΑΦΜ μισθωτή. Χωρίς αυτό η δήλωση δεν κλείνει.', when: isLong, critical: true },
  { id: 'tenant.phone', label: 'Τηλέφωνο', why: 'Για να τον βρεις όταν χρειαστεί.', when: isLong },
  { id: 'tenant.email', label: 'Email', why: 'Για αποδείξεις και ειδοποιήσεις.', when: isLong, rare: true },
  { id: 'tenant.lease_start', label: 'Έναρξη μίσθωσης', why: 'Από εδώ βγαίνει η προθεσμία δήλωσης του μισθωτηρίου — 30 ημέρες.', when: isLong, critical: true },
  { id: 'tenant.lease_end', label: 'Λήξη μίσθωσης', why: 'Για να σου θυμίσουμε πριν λήξει, όχι μετά.', when: isLong },
  { id: 'tenant.rent', label: 'Μηνιαίο μίσθωμα', why: 'Η βάση για το Ε2 και για τον φόρο.', when: isLong, critical: true },
  { id: 'tenant.rent_iban', label: 'IBAN είσπραξης', why: 'Από 1/1/2026 η είσπραξη μέσω τραπέζης κρίνει την τεκμαρτή έκπτωση 5%.', when: isLong, critical: true },
  { id: 'tenant.deposit', label: 'Εγγύηση', why: 'Δεν είναι έσοδό σου — την επιστρέφεις. Την κρατάμε χωριστά για να μη μπει στον φόρο.', when: isLong },

  // Υπηρεσίες: υπάρχουν μόνο σε επιπλωμένο. Σε γυμνό διαμέρισμα δεν έχει νόημα
  // ούτε ένα από τα δεκαπέντε πεδία συντήρησης.
  { id: 'tenant.services', label: 'Τι πληρώνεις εσύ, τι ο ενοικιαστής', why: 'Καθαρίζει τη διαφωνία πριν γίνει. Ελεύθερες γραμμές: περιγραφή, κόστος, ποιος.', when: c => isLong(c) && furnished(c), rare: true },
];

/** Φόρμα επισκέπτη — βραχυχρόνια μίσθωση. */
export const CLIENT_FIELDS: readonly FieldRule[] = [
  { id: 'client.full_name', label: 'Όνομα', why: 'Για να ξεχωρίζεις τις διαμονές.', when: isShort },
  { id: 'client.contact', label: 'Τηλέφωνο ή email', why: 'Ένα από τα δύο αρκεί.', when: isShort },
  { id: 'client.channel', label: 'Κανάλι', why: 'Airbnb, Booking ή απευθείας — αλλάζει την προμήθεια.', when: isShort },
  { id: 'client.dates', label: 'Ημερομηνίες', why: 'Από αυτές βγαίνει η δήλωση βραχυχρόνιας διαμονής.', when: isShort, critical: true },
  { id: 'client.gross_guest_paid', label: 'Ποσό που πλήρωσε ο επισκέπτης', why: 'ΑΚΑΘΑΡΙΣΤΑ, πριν την προμήθεια. Αυτό δηλώνεται — όχι το ποσό που μπήκε στον λογαριασμό σου.', when: isShort, critical: true },
  { id: 'client.platform_fee', label: 'Προμήθεια πλατφόρμας', why: 'Είναι δαπάνη σου, όχι μείωση του εσόδου. Μπαίνει χωριστά.', when: isShort, critical: true },
  { id: 'client.climate_levy', label: 'Τέλος ανθεκτικότητας', why: 'Το πληρώνει ο επισκέπτης και το αποδίδεις. ΔΕΝ είναι έσοδό σου.', when: isShort, critical: true },
  { id: 'client.declared_at', label: 'Δηλώθηκε', why: 'Μία δήλωση ανά κράτηση. Εδώ βλέπεις ποιες λείπουν.', when: isShort, critical: true },
  { id: 'client.damages', label: 'Φθορές', why: 'Δαπάνη με παραστατικό — και συνδέεται με το αντικείμενο που έσπασε.', when: isShort, rare: true },
  { id: 'client.notes', label: 'Σημείωση', why: 'Ό,τι θέλεις να θυμάσαι. Ιδιωτική.', when: isShort, rare: true },
];

/** Απογραφή εξοπλισμού. */
export const INVENTORY_FIELDS: readonly FieldRule[] = [
  // Χωρίς επίπλωση δεν υπάρχει απογραφή εξοπλισμού. Σε ιδιοχρησία ούτε.
  { id: 'inv.name', label: 'Τι είναι', why: 'Για να το αναγνωρίζεις.', when: c => letsIt(c) && furnished(c) },
  { id: 'inv.room', label: 'Δωμάτιο', why: 'Για την παράδοση και την παραλαβή.', when: c => letsIt(c) && furnished(c) },
  { id: 'inv.purchase_date', label: 'Ημερομηνία αγοράς', why: 'Από εδώ βγαίνει η εγγύηση και η υπολειπόμενη αξία.', when: c => letsIt(c) && furnished(c) },
  { id: 'inv.value', label: 'Αξία', why: 'Για τη ζημιά και για την ασφάλιση.', when: c => letsIt(c) && furnished(c) },
  { id: 'inv.receipt', label: 'Απόδειξη', why: 'Χωρίς παραστατικό η δαπάνη δεν εκπίπτει.', when: c => letsIt(c) && furnished(c) },
  { id: 'inv.warranty', label: 'Εγγύηση έως', why: 'Για να σου θυμίσουμε πριν λήξει.', when: c => letsIt(c) && furnished(c), rare: true },
  { id: 'inv.energy_class', label: 'Ενεργειακή κλάση', why: 'Δείχνει τι σου κοστίζει τον μήνα, στην τιμή ρεύματος που δήλωσες.', when: c => letsIt(c) && furnished(c), rare: true },
  { id: 'inv.replacement_cost', label: 'Κόστος αντικατάστασης', why: 'Η ασφαλιστέα αξία είναι το κόστος να το πάρεις καινούργιο — όχι η αποσβεσμένη αξία.', when: c => letsIt(c) && furnished(c), rare: true },
];

/** Επαφές συνεργατών. */
export const CONTACT_FIELDS: readonly FieldRule[] = [
  { id: 'contact.name', label: 'Όνομα', why: 'Για να τον βρεις.', },
  { id: 'contact.role', label: 'Ειδικότητα', why: 'Υδραυλικός, λογιστής, μεσίτης.', },
  { id: 'contact.phone', label: 'Τηλέφωνο', why: 'Ο λόγος που υπάρχει η επαφή.', },
  { id: 'contact.afm', label: 'ΑΦΜ', why: 'Συνδέει τα παραστατικά του με την επαφή — χωρίς αυτό το ταίριασμα γίνεται με το όνομα και αστοχεί.', },
  { id: 'contact.iban', label: 'IBAN', why: 'Για να πληρώσεις χωρίς να τον ξαναρωτήσεις.', rare: true },
  { id: 'contact.email', label: 'Email', why: 'Για τιμολόγια και προσφορές.', rare: true },
];

/** Οικονομικά και λογιστικά πεδία της καρτέλας Λογιστικά. */
export const ACCOUNTING_FIELDS: readonly FieldRule[] = [
  { id: 'acc.rents_via_bank', label: 'Εισπράττω μέσω τραπέζης', why: 'Από 1/1/2026 χωρίς αυτό χάνεται η τεκμαρτή έκπτωση 5% και ο φόρος υπολογίζεται στο 100%.', when: isLong, critical: true },
  { id: 'acc.efka', label: 'Εισφορές ΕΦΚΑ', why: 'Αφορά επιχειρηματική δραστηριότητα.', when: c => c.business },
  { id: 'acc.advance_tax', label: 'Προκαταβολή φόρου', why: 'Αφορά επιχειρηματικό εισόδημα, όχι ενοίκια φυσικού προσώπου.', when: c => c.business },
  { id: 'acc.building_depreciation', label: 'Απόσβεση κτιρίου', why: 'Μόνο όταν το ακίνητο είναι στα βιβλία επιχείρησης.', when: c => c.business },
  { id: 'acc.balance_sheet', label: 'Ισολογισμός', why: 'Υπάρχει μόνο στα διπλογραφικά. Μια Ο.Ε. με απλογραφικά δεν συντάσσει.', when: c => c.doubleEntry },
  { id: 'acc.journal', label: 'Ημερολόγιο άρθρων', why: 'Μόνο στα διπλογραφικά.', when: c => c.doubleEntry },
  { id: 'acc.inventory_count', label: 'Απογραφή τέλους χρήσης', why: 'Μόνο στα διπλογραφικά.', when: c => c.doubleEntry, rare: true },
  { id: 'acc.loan_interest', label: 'Τόκοι δανείου', why: 'Εκπίπτουν όταν το δάνειο αφορά το ακίνητο που αποδίδει.', when: c => c.hasLoan === true && letsIt(c) },
  { id: 'acc.portfolio_consolidation', label: 'Ενοποίηση χαρτοφυλακίου', why: 'Ο φόρος είναι προοδευτικός στο ΣΥΝΟΛΟ των ενοικίων, όχι ανά ακίνητο.', when: c => c.propertyCount >= 2 },
];

/** Όλα τα μητρώα μαζί, για τους ελέγχους και για τα εργαλεία. */
export const ALL_FIELDS: readonly FieldRule[] = [
  ...TENANT_FIELDS, ...CLIENT_FIELDS, ...INVENTORY_FIELDS, ...CONTACT_FIELDS, ...ACCOUNTING_FIELDS,
];

// ── Η ΑΠΟΦΑΣΗ ──────────────────────────────────────────────────────────────

export interface FieldDecision {
  id: string;
  label: string;
  why: string;
  placement: Placement;
  critical: boolean;
}

function ruleOf(id: string): FieldRule | undefined {
  return ALL_FIELDS.find(f => f.id === id);
}

/**
 * Πού πάει αυτό το πεδίο για αυτόν τον χρήστη.
 *
 * Άγνωστο id → 'core'. ΓΙΑΤΙ: αν κάποιος προσθέσει πεδίο και ξεχάσει τον κανόνα,
 * το πεδίο ΦΑΙΝΕΤΑΙ. Το αντίστροφο θα έκρυβε σιωπηλά κάτι που ο χρήστης
 * χρειάζεται, και κανείς δεν θα το μάθαινε ποτέ.
 */
export function fieldPlacement(id: string, ctx: FieldContext): Placement {
  const r = ruleOf(id);
  if (!r) return 'core';
  if (r.when && !r.when(ctx)) return 'hidden';
  // Τα κρίσιμα δεν πάνε ΠΟΤΕ σε «Περισσότερα», ακόμη κι αν έχουν σημαία rare.
  if (r.critical) return 'core';
  return r.rare ? 'more' : 'core';
}

export function fieldDecision(id: string, ctx: FieldContext): FieldDecision {
  const r = ruleOf(id);
  return {
    id,
    label: r?.label ?? id,
    why: r?.why ?? '',
    placement: fieldPlacement(id, ctx),
    critical: r?.critical === true,
  };
}

/**
 * Τα πεδία μιας φόρμας, χωρισμένα σε «φαίνονται» και «Περισσότερα».
 * Η σειρά διατηρείται από το μητρώο — μια φόρμα που αναδιατάσσεται μόνη της
 * κάνει τον χρήστη να ψάχνει.
 */
export function formFields(
  registry: readonly FieldRule[],
  ctx: FieldContext,
): { core: FieldDecision[]; more: FieldDecision[] } {
  const core: FieldDecision[] = [];
  const more: FieldDecision[] = [];
  for (const r of registry) {
    const d = fieldDecision(r.id, ctx);
    if (d.placement === 'core') core.push(d);
    else if (d.placement === 'more') more.push(d);
  }
  return { core, more };
}

/** Τα κρίσιμα που λείπουν — για τη γραμμή συμμόρφωσης στην κορυφή της οθόνης. */
export function missingCritical(
  registry: readonly FieldRule[],
  ctx: FieldContext,
  filled: ReadonlySet<string>,
): FieldDecision[] {
  return registry
    .filter(r => r.critical && fieldPlacement(r.id, ctx) !== 'hidden' && !filled.has(r.id))
    .map(r => fieldDecision(r.id, ctx));
}

/**
 * Πόσα πεδία γλίτωσε ο χρήστης. Χρήσιμο στα tests και στην τεκμηρίωση: δείχνει
 * μαύρο-άσπρο αν η μηχανή κάνει τη δουλειά της ή αν οι κανόνες είναι διακοσμητικοί.
 */
export function hiddenCount(registry: readonly FieldRule[], ctx: FieldContext): number {
  return registry.filter(r => fieldPlacement(r.id, ctx) === 'hidden').length;
}
