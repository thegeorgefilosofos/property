import { RENEWAL_NOTICE_DAYS, billableConnections, consentState, daysUntilExpiry } from './consent';
import type { BankConnection, ConnectionStatus } from './types';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { cond ? pass++ : (fail++, console.error('✗', name)); };

const NOW = new Date('2026-08-19T10:00:00Z');
const inDays = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString();
const conn = (status: ConnectionStatus, consentExpiresAt: string | null): Pick<BankConnection, 'status' | 'consentExpiresAt'> =>
  ({ status, consentExpiresAt });

// ── Η ΜΕΤΡΗΣΗ ΤΩΝ ΗΜΕΡΩΝ ──────────────────────────────────────────────────
ok('χωρίς ημερομηνία δεν ξέρουμε', daysUntilExpiry(null, NOW) === null);
ok('άκυρη ημερομηνία δεν ξέρουμε', daysUntilExpiry('όχι ημερομηνία', NOW) === null);
ok('τριάντα ημέρες μπροστά', daysUntilExpiry(inDays(30), NOW) === 30);
// Στρογγυλοποίηση ΠΡΟΣ ΤΑ ΚΑΤΩ: δώδεκα ώρες δεν είναι «1 ημέρα».
ok('δώδεκα ώρες δίνουν μηδέν', daysUntilExpiry(new Date(NOW.getTime() + 12 * 3_600_000).toISOString(), NOW) === 0);
ok('χθες δίνει αρνητικό', daysUntilExpiry(inDays(-1), NOW) === -1);

// ── ΟΙ ΚΑΤΑΣΤΑΣΕΙΣ ────────────────────────────────────────────────────────
const active = consentState(conn('active', inDays(60)), NOW);
ok('ενεργή δίνει κινήσεις', active.usable);
ok('ενεργή δεν ζητά ανανέωση', !active.needsRenewal);

const soon = consentState(conn('active', inDays(RENEWAL_NOTICE_DAYS)), NOW);
ok('στο όριο ειδοποίησης ζητά ανανέωση', soon.needsRenewal);
ok('στο όριο ειδοποίησης δίνει ακόμη κινήσεις', soon.usable);
ok('στο όριο λέει πόσες ημέρες', soon.message.includes(`${RENEWAL_NOTICE_DAYS} ημέρες`));

const oneDay = consentState(conn('active', inDays(1)), NOW);
ok('μία ημέρα σε ενικό', oneDay.message.includes('1 ημέρα') && !oneDay.message.includes('1 ημέρες'));

const today = consentState(conn('active', inDays(0)), NOW);
ok('σήμερα δεν γράφει αριθμό', today.message.includes('σήμερα') && today.needsRenewal && today.usable);

// Ο πάροχος λέει «active», η ημερομηνία λέει αλλιώς. Υπερισχύει η ημερομηνία,
// γιατί η κατάσταση του παρόχου ενημερώνεται με καθυστέρηση.
const stale = consentState(conn('active', inDays(-2)), NOW);
ok('ληγμένη ημερομηνία υπερισχύει του παρόχου', !stale.usable && stale.needsRenewal);

const pending = consentState(conn('pending', null), NOW);
ok('εκκρεμής δεν δίνει κινήσεις', !pending.usable);
ok('εκκρεμής δεν ζητά ανανέωση', !pending.needsRenewal);

const revoked = consentState(conn('revoked', inDays(40)), NOW);
ok('διακομμένη δεν δίνει κινήσεις', !revoked.usable);
ok('διακομμένη δεν ζητά ανανέωση', !revoked.needsRenewal);

const errored = consentState(conn('error', inDays(40)), NOW);
ok('σφάλμα δεν δίνει κινήσεις', !errored.usable);
ok('σφάλμα ζητά ξανασύνδεση', errored.needsRenewal);

// Καμία κατάσταση δεν μένει χωρίς εξήγηση, και καμία δεν λέει «-».
const ALL: ConnectionStatus[] = ['pending', 'active', 'expired', 'revoked', 'error'];
ok('κάθε κατάσταση έχει μήνυμα', ALL.every(s => consentState(conn(s, inDays(3)), NOW).message.trim().length > 10));

// ── ΤΙ ΧΡΕΩΝΕΤΑΙ ──────────────────────────────────────────────────────────
// Το πρόσθετο είναι «ανά συνδεδεμένο λογαριασμό τον μήνα»: πληρώνει ό,τι
// καταναλώνει άδεια στον πάροχο, όχι ό,τι ο χρήστης δεν ολοκλήρωσε ή έκοψε.
ok('χρεώνονται ενεργές, ληγμένες και σε σφάλμα', billableConnections(
  ALL.map(s => ({ status: s })),
) === 3);
ok('καμία σύνδεση, καμία χρέωση', billableConnections([]) === 0);
ok('εκκρεμής μόνη της δεν χρεώνεται', billableConnections([{ status: 'pending' }]) === 0);
ok('διακομμένη μόνη της δεν χρεώνεται', billableConnections([{ status: 'revoked' }]) === 0);

console.log(`banking/consent: ✓ ${pass} · ✗ ${fail}`);
if (fail) process.exit(1);
