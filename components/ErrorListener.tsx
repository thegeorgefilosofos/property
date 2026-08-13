'use client';
// ═══════════════════════════════════════════════════════════════════════════
// ΤΑ ΣΦΑΛΜΑΤΑ ΠΟΥ ΔΕΝ ΠΙΑΝΕΙ ΚΑΝΕΝΑ ΟΡΙΟ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΚΕΝΟ. Τα τρία όρια σφάλματος της εφαρμογής πιάνουν όσα σκάνε ΚΑΤΑ ΤΗΝ
// ΑΠΟΔΟΣΗ, δηλαδή όσα κάνουν την οθόνη λευκή. Τα υπόλοιπα περνούν από δίπλα:
//
//   • σφάλμα μέσα σε χειριστή πατήματος — το κουμπί απλώς δεν κάνει τίποτα,
//   • σφάλμα σε ασύγχρονη κλήση — η αποθήκευση «δεν προχωρά» χωρίς εξήγηση,
//   • promise που απορρίφθηκε και κανείς δεν το έπιασε.
//
// Και τα τρία είναι ακριβώς τα σφάλματα για τα οποία ο χρήστης ΔΕΝ τηλεφωνεί:
// δεν βλέπει κατάρρευση, βλέπει κάτι που «δεν δουλεύει», και φεύγει.
//
// ΓΙΑΤΙ ΣΤΟΙΧΕΙΟ ΚΑΙ ΟΧΙ ΣΕΝΑΡΙΟ ΣΤΗ ΔΙΑΤΑΞΗ. Ο ακροατής πρέπει να φεύγει όταν
// φεύγει η σελίδα. Ένα σενάριο γραμμένο κατευθείαν στη διάταξη θα εγγραφόταν
// ξανά σε κάθε ενυδάτωση και δεν θα ξεγραφόταν ποτέ.
//
// ΤΙ ΔΕΝ ΚΑΝΕΙ. Δεν αγγίζει το σφάλμα και δεν εμποδίζει τον περιηγητή να το
// τυπώσει στην κονσόλα. Απλώς το αναφέρει — και μόνο όσα αξίζουν (δες
// `worthReporting`: ο θόρυβος από επεκτάσεις και σενάρια τρίτων μένει έξω).
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect } from 'react';
import { captureError, worthReporting } from '@/lib/observability/report';

export default function ErrorListener() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      const err = e.error ?? e.message;
      if (worthReporting(err)) captureError(err, { boundary: 'window', source: e.filename || undefined });
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      if (worthReporting(e.reason)) captureError(e.reason, { boundary: 'promise' });
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
  return null;
}
