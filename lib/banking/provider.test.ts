import { readFileSync } from 'node:fs';
import {
  AisNotConfiguredError, CREDENTIAL_ENV, PROVIDER_ENV,
  aisConfigError, configuredProviderId, getAisProvider,
} from './provider';
import { AIS_PROVIDERS } from './types';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { cond ? pass++ : (fail++, console.error('✗', name)); };

const full = { [PROVIDER_ENV]: 'enablebanking', AIS_CLIENT_ID: 'id', AIS_CLIENT_SECRET: 'secret' };

// ── ΠΟΙΟΣ ΠΑΡΟΧΟΣ ─────────────────────────────────────────────────────────
ok('χωρίς μεταβλητή, κανένας πάροχος', configuredProviderId({}) === null);
ok('άγνωστο όνομα δεν γίνεται δεκτό', configuredProviderId({ [PROVIDER_ENV]: 'ilios_bank' }) === null);
ok('το όνομα διαβάζεται', configuredProviderId({ [PROVIDER_ENV]: 'enablebanking' }) === 'enablebanking');
ok('κεφαλαία και κενά δεν χαλούν το όνομα', configuredProviderId({ [PROVIDER_ENV]: '  EnableBanking ' }) === 'enablebanking');

// ── ΤΟ ΜΗΝΥΜΑ ΛΕΕΙ ΤΙ ΛΕΙΠΕΙ ──────────────────────────────────────────────
// «Δεν είναι διαθέσιμο» δεν λέει σε κανέναν τι να κάνει.
ok('χωρίς πάροχο, το λέει ονομαστικά', aisConfigError({}).includes(PROVIDER_ENV));
ok('χωρίς πάροχο, δίνει τις επιτρεπτές τιμές', AIS_PROVIDERS.every(p => aisConfigError({}).includes(p)));

const unknown = aisConfigError({ [PROVIDER_ENV]: 'ilios_bank' });
ok('άγνωστος πάροχος αναφέρεται με το όνομά του', unknown.includes('ilios_bank'));

const noSecret = aisConfigError({ [PROVIDER_ENV]: 'enablebanking', AIS_CLIENT_ID: 'id' });
ok('λείπει το μυστικό και λέγεται ποιο', noSecret.includes('AIS_CLIENT_SECRET'));
ok('δεν κατηγορείται το κλειδί που υπάρχει', !noSecret.includes('AIS_CLIENT_ID'));

const noneAtAll = aisConfigError({ [PROVIDER_ENV]: 'tink' });
ok('λείπουν και τα δύο, λέγονται και τα δύο', CREDENTIAL_ENV.every(k => noneAtAll.includes(k)));

// Πλήρης ρύθμιση, αλλά προσαρμογέας δεν υπάρχει. Το μήνυμα ΔΕΝ κρύβεται πίσω
// από «τεχνικό πρόβλημα»: λέει ότι λείπει η τεκμηρίωση του παρόχου.
const noAdapter = aisConfigError(full);
ok('χωρίς προσαρμογέα, το λέει', noAdapter.includes('προσαρμογέας'));
ok('χωρίς προσαρμογέα, ονομάζει τον πάροχο', noAdapter.includes('enablebanking'));
ok('εξηγεί γιατί δεν γράφεται από εικασία', noAdapter.includes('εικασία'));
ok('δεν είναι έτοιμο', noAdapter !== '');

// ── Η ΑΡΝΗΣΗ ΕΙΝΑΙ ΘΟΡΥΒΩΔΗΣ ──────────────────────────────────────────────
// Πάροχος που γυρίζει κενές λίστες θα έδειχνε «καμία κίνηση» — ψέμα με τη
// μορφή άδειας οθόνης.
let threw = '';
try { getAisProvider(full); } catch (e) { threw = e instanceof AisNotConfiguredError ? e.message : 'λάθος τύπος'; }
ok('η κλήση σκάει αντί να γυρίσει κενό', threw === noAdapter);

let threwEmpty = false;
try { getAisProvider({}); } catch (e) { threwEmpty = e instanceof AisNotConfiguredError; }
ok('χωρίς ρύθμιση σκάει με δικό της τύπο', threwEmpty);

// ── ΟΙ ΔΥΟ ΚΑΤΑΛΟΓΟΙ ΣΥΜΦΩΝΟΥΝ ────────────────────────────────────────────
// Η βάση έχει `check (provider in (…))`. Αν αποκλίνει από τον τύπο, η εισαγωγή
// θα σκάει στην παραγωγή με σφάλμα περιορισμού που δεν εξηγεί τίποτα.
const sql = readFileSync('supabase/migrations/20260819160000_i_trapeza_milaei_moni_tis.sql', 'utf8');
const m = sql.match(/check \(provider in \(([^)]*)\)\)/);
const inSql = (m?.[1] || '').split(',').map(s => s.trim().replace(/'/g, ''));
ok('ο κατάλογος της βάσης βρέθηκε', inSql.length > 0);
ok('η βάση δέχεται ό,τι δέχεται ο τύπος', AIS_PROVIDERS.every(p => inSql.includes(p)));
ok('η βάση δεν δέχεται τίποτα παραπάνω', inSql.every(p => (AIS_PROVIDERS as readonly string[]).includes(p)));

console.log(`banking/provider: ✓ ${pass} · ✗ ${fail}`);
if (fail) process.exit(1);
