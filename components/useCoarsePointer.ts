'use client';

// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΔΑΧΤΥΛΟ ΔΕΝ ΚΑΝΕΙ HOVER
// ─────────────────────────────────────────────────────────────────────────
// Πολλές ενέργειες της εφαρμογής εμφανίζονταν μόνο με `onMouseEnter`:
// μετονομασία και διαγραφή αρχείου, το πλαίσιο επιλογής, οι ενέργειες κάρτας.
// Σε οθόνη αφής κανένα από αυτά τα συμβάντα δεν πυροδοτείται από ένα απλό
// πάτημα — άρα οι ενέργειες δεν ήταν «διακριτικές», ήταν ΑΝΥΠΑΡΚΤΕΣ.
//
// Όπου η αποκάλυψη γίνεται με CSS, η λύση είναι `@media (hover: none)`.
// Όπου γίνεται με κατάσταση React (`hov && …`), χρειάζεται αυτό: η ίδια
// ερώτηση, μία φορά, ως hook.
//
// ΓΙΑΤΙ ΟΧΙ ΕΛΕΓΧΟΣ ΠΛΑΤΟΥΣ. Το πλάτος δεν λέει τίποτα για το χέρι: ένα
// tablet 900 εικονοστοιχείων χειρίζεται με δάχτυλο, ένα στενό παράθυρο στην
// επιφάνεια εργασίας με ποντίκι.
//
// ΓΙΑΤΙ useSyncExternalStore ΚΑΙ ΟΧΙ useEffect+useState. Ο δείκτης είναι
// εξωτερική πηγή αλήθειας, όχι κατάσταση της εφαρμογής. Με effect θα γινόταν
// δεύτερη απόδοση σε κάθε προσάρτηση κάθε καρτέλας, ενώ εδώ η τιμή διαβάζεται
// πριν την πρώτη. Το `getServerSnapshot` επιστρέφει `false`: ο διακομιστής δεν
// έχει δείκτη και η υπόθεση «ποντίκι» είναι αυτή που δεν αλλάζει τίποτα.
// ═══════════════════════════════════════════════════════════════════════════
import { useSyncExternalStore } from 'react';

const QUERY = '(hover: none)';

// Ένα MediaQueryList για όλη την εφαρμογή, όχι ένα ανά component.
let mql: MediaQueryList | null = null;
const query = (): MediaQueryList | null => {
  if (typeof window === 'undefined' || !window.matchMedia) return null;
  if (!mql) mql = window.matchMedia(QUERY);
  return mql;
};

// Αλλάζει πραγματικά: σύνδεση ποντικιού σε tablet, αποσύνδεση πληκτρολογίου.
const subscribe = (onChange: () => void): (() => void) => {
  const mq = query();
  if (!mq) return () => {};
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
};

const getSnapshot = () => query()?.matches ?? false;
const getServerSnapshot = () => false;

export function useCoarsePointer(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
