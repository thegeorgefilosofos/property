'use client';
// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΚΟΥΜΠΙ ΠΟΥ ΣΤΕΛΝΕΙ ΣΤΗΝ ΑΑΔΕ — ΓΡΑΜΜΕΝΟ ΜΙΑ ΦΟΡΑ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΠΡΟΒΛΗΜΑ, ΜΕΤΡΗΜΕΝΟ. Ο ίδιος σύνδεσμος προς την ΑΑΔΕ ήταν γραμμένος με
// τα χέρια σε επτά σημεία, με έξι διαφορετικές εμφανίσεις: άλλοτε καρτέλα με
// βέλος, άλλοτε chip με περίγραμμα, άλλοτε σκέτο κείμενο μέσα σε παράγραφο.
// Στο `TabTenant.tsx` οι ΙΔΙΟΙ δύο σύνδεσμοι υπήρχαν δύο φορές — μία στην
// «Αναπροσαρμογή» και μία στα «Νομικά», με διαφορετικές ετικέτες, διαφορετικές
// διευθύνσεις και διαφορετικό ύψος. Ο χρήστης δεν μπορεί να μάθει ένα σχήμα
// που αλλάζει σε κάθε οθόνη.
//
// ΤΙ ΔΙΝΕΙ ΕΔΩ ΤΟ ΙΔΙΟ ΣΤΟΙΧΕΙΟ ΠΑΝΤΟΥ:
//
//   1. Τον προορισμό από το `lib/tax/aade.ts` — μία διεύθυνση ανά ενέργεια.
//   2. Τη ΔΙΑΔΡΟΜΗ ΣΕ ΛΕΞΕΙΣ, ώστε ο χρήστης να ξέρει πού πατά μέσα στην πύλη
//      ακόμη κι αν η ΑΑΔΕ αλλάξει τις διευθύνσεις της.
//   3. Την προειδοποίηση για κωδικούς ΠΡΙΝ ανοίξει η καρτέλα. Το να ανοίγει
//      οθόνη σύνδεσης χωρίς προειδοποίηση είναι ακριβώς το άγχος που ζητήθηκε
//      να φύγει.
//
// ΔΕΝ ΓΡΑΦΕΤΑΙ ΠΡΟΘΕΣΜΙΑ ΕΔΩ. Οι ημερομηνίες ζουν στο `greekTaxCalendar.ts`.
// ═══════════════════════════════════════════════════════════════════════════

import React from 'react';
import { T } from './tokens';
import { AADE_DESTINATIONS, aadePath, type AadeAction } from '@/lib/tax/aade';

const LOGIN_NOTE = 'Θέλει κωδικούς TAXISnet';

/** Ο τίτλος του συνδέσμου: διαδρομή, και αν χρειάζεται κωδικούς. */
export function aadeTitle(action: AadeAction): string {
  const d = AADE_DESTINATIONS[action];
  return d.login ? `${aadePath(action)} · ${LOGIN_NOTE}` : aadePath(action);
}

/**
 * ΧΩΡΙΣ ΒΕΛΗ. Είχε «→» ως διαχωριστή βημάτων ΚΑΙ «→» στο τέλος ως ένδειξη
 * συνδέσμου — τέσσερα ίδια σύμβολα στη σειρά, με το τελευταίο να σημαίνει άλλο
 * πράγμα. Τα βέλη σε κείμενο μοιάζουν μηχανικά και δεν ανήκουν σε ελληνικό
 * κείμενο· τα βήματα χωρίζονται με «·», όπως παντού αλλού στην εφαρμογή, και ο
 * σύνδεσμος αναγνωρίζεται από το χρώμα του.
 *
 * Καρτέλα προορισμού: ετικέτα και διαδρομή σε λέξεις.
 * Το `emphasis` σηκώνει μόνο την αριστερή γραμμή — καμία αλλαγή χρώματος
 * κειμένου, καμία σημασιολογία σε πράσινο ή κόκκινο.
 */
export function AadeLink({ action, emphasis = false }: { action: AadeAction; emphasis?: boolean }) {
  const d = AADE_DESTINATIONS[action];
  return (
    <a href={d.url} target="_blank" rel="noopener noreferrer" title={aadeTitle(action)}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', marginBottom: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderLeft: `3px solid ${emphasis ? 'var(--border-strong)' : 'var(--border-subtle)'}`, borderRadius: T.radius.inner, textDecoration: 'none' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.sans, marginBottom: 2 }}>{d.label}</div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.5 }}>
          {aadePath(action)}{d.login ? ` · ${LOGIN_NOTE}` : ''}
        </div>
      </div>
    </a>
  );
}

/** Πολλοί προορισμοί στη σειρά. Ο πρώτος παίρνει τον τόνο. */
export function AadeLinks({ actions }: { actions: readonly AadeAction[] }) {
  return <>{actions.map((a, i) => <AadeLink key={a} action={a} emphasis={i === 0} />)}</>;
}

/**
 * Η μικρή, ενσωματωμένη μορφή — για κεφαλίδες και κενές καταστάσεις, όπου η
 * καρτέλα θα ήταν βαριά. Ίδιο ύψος και ίδια ακτίνα με τα υπόλοιπα chip.
 */
export function AadePill({ action, label }: { action: AadeAction; label?: string }) {
  const d = AADE_DESTINATIONS[action];
  return (
    <a href={d.url} target="_blank" rel="noopener noreferrer" title={aadeTitle(action)}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans, fontWeight: 600, textDecoration: 'none', padding: '4px 12px', background: 'var(--bg-elevated)', borderRadius: T.radius.pill, border: '1px solid var(--border-subtle)' }}>
      {label ?? d.label}
    </a>
  );
}
