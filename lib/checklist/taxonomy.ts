// ═══════════════════════════════════════════════════════════════════════════
// ΟΙ ΚΑΤΗΓΟΡΙΕΣ ΚΑΙ ΟΙ ΠΡΟΤΕΡΑΙΟΤΗΤΕΣ ΕΡΓΑΣΙΑΣ, ΜΙΑ ΦΟΡΑ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΠΡΟΒΛΗΜΑ, ΜΕΤΡΗΜΕΝΟ. Ο ίδιος κατάλογος υπήρχε δύο φορές — στις
// «Εκκρεμότητες» και στο «Χαρτοφυλάκιο» — και ΔΕΝ ήταν αντίγραφα:
//
//   Εκκρεμότητες                    Χαρτοφυλάκιο
//   ─────────────────────────       ────────────────────────────
//   Παράδοση ακινήτου               Παράδοση Ακινήτου      ← άλλα κεφαλαία
//   Νομικά και ΑΑΔΕ                 Νομικά / ΑΑΔΕ          ← άλλο σημείο στίξης
//   Βραχυχρόνια μίσθωση             Short-term / Airbnb    ← ΑΓΓΛΙΚΑ
//   Ανακαίνιση                      (λείπει)
//   Αγορά ακινήτου                  (λείπει)
//
// Δηλαδή μια εργασία κατηγορίας «renovation», γραμμένη από τις Εκκρεμότητες,
// έφτανε στο Χαρτοφυλάκιο και ΔΕΝ έβρισκε ετικέτα: έδειχνε τον ωμό κωδικό ή
// τίποτα. Και οι προτεραιότητες είχαν άλλη σειρά στη μία οθόνη από την άλλη,
// οπότε το ίδιο μενού άλλαζε διάταξη ανάλογα με το πού το άνοιγες.
//
// Η ΣΕΙΡΑ ΕΧΕΙ ΝΟΗΜΑ. Οι προτεραιότητες γράφονται από την πιο επείγουσα προς
// την πιο ήρεμη: αυτό διαβάζει το μάτι σε λίστα, και αυτό περιμένει το χέρι σε
// αναπτυσσόμενο μενού.
// ═══════════════════════════════════════════════════════════════════════════

export interface TaskCategory { id: string; label: string }
export interface TaskLevel { value: string; label: string }

/** Οι κατηγορίες εργασίας, στη σειρά που εμφανίζονται σε κάθε μενού. */
export const TASK_CATEGORIES: readonly TaskCategory[] = [
  { id: 'checkin',     label: 'Παράδοση ακινήτου'    },
  { id: 'checkout',    label: 'Αποχώρηση ενοικιαστή' },
  { id: 'maintenance', label: 'Συντήρηση'            },
  { id: 'legal',       label: 'Νομικά και ΑΑΔΕ'      },
  { id: 'renovation',  label: 'Ανακαίνιση'           },
  { id: 'purchase',    label: 'Αγορά ακινήτου'       },
  { id: 'airbnb',      label: 'Βραχυχρόνια μίσθωση'  },
  { id: 'financial',   label: 'Οικονομικά'           },
  { id: 'other',       label: 'Άλλο'                 },
] as const;

/** Από την πιο επείγουσα προς την πιο ήρεμη. */
export const TASK_PRIORITIES: readonly TaskLevel[] = [
  { value: 'critical', label: 'Κρίσιμο'  },
  { value: 'high',     label: 'Υψηλή'    },
  { value: 'normal',   label: 'Κανονική' },
  { value: 'low',      label: 'Χαμηλή'   },
] as const;

/** Οι καταστάσεις μιας εργασίας, στη σειρά που τις περνά. */
export const TASK_STATUSES: readonly TaskLevel[] = [
  { value: 'pending',     label: 'Εκκρεμεί'      },
  { value: 'in_progress', label: 'Σε εξέλιξη'    },
  { value: 'done',        label: 'Ολοκληρώθηκε'  },
  { value: 'skipped',     label: 'Παραλείφθηκε'  },
] as const;

const label = (list: readonly { label: string }[], key: string, get: (x: never) => string): string =>
  (list as readonly Record<string, string>[]).find(x => get(x as never) === key)?.label ?? key;

/** Η ετικέτα μιας κατηγορίας. Άγνωστος κωδικός επιστρέφεται αυτούσιος, ώστε να φαίνεται. */
export const taskCategoryLabel = (id: string): string => label(TASK_CATEGORIES, id, (x: { id: string }) => x.id);
export const taskPriorityLabel = (v: string): string => label(TASK_PRIORITIES, v, (x: { value: string }) => x.value);
export const taskStatusLabel   = (v: string): string => label(TASK_STATUSES,   v, (x: { value: string }) => x.value);
