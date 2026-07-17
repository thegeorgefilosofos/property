// npx tsx lib/referral/referral.test.ts
import {
  referralCode, referralLink, isValidReferral, withinMonthlyCap, isActivated,
  referrerRewardFor, refereeReward, effectiveMaxProperties, canAddWithReferrals,
  MAX_EARNED_SLOTS, MONTHLY_REWARD_CAP, REFEREE_TRIAL_MONTHS,
} from './referral';

let p = 0, f = 0;
const ok = (c: boolean, m: string) => { if (c) p++; else { f++; console.error('✗', m); } };

// ── Κωδικός & σύνδεσμος ──
const uid = '3f9a12b7-0c4e-4a11-9d2e-77aa11bb22cc';
ok(referralCode(uid) === referralCode(uid), 'κωδικός ντετερμινιστικός');
ok(/^PO[0-9A-Z]{2,6}$/.test(referralCode(uid)), 'κωδικός σε αναμενόμενη μορφή');
ok(referralCode(uid) !== referralCode('another-user-id'), 'διαφορετικοί χρήστες → διαφορετικοί κωδικοί');
ok(referralLink('https://property-os.gr/', uid) === `https://property-os.gr/signup?ref=${referralCode(uid)}`, 'σύνδεσμος καθαρός, χωρίς διπλή κάθετο');

// ── Εγκυρότητα ──
ok(isValidReferral('A', 'B', true) === true, 'έγκυρη: άλλος, νέος');
ok(isValidReferral('A', 'A', true) === false, 'άκυρη: αυτο-παραπομπή');
ok(isValidReferral('A', 'B', false) === false, 'άκυρη: μη-νέος χρήστης');
ok(isValidReferral('', 'B', true) === false, 'άκυρη: κενός προσκαλών');

// ── Πλαφόν μήνα ──
ok(withinMonthlyCap(0) === true, 'εντός πλαφόν στην αρχή');
ok(withinMonthlyCap(MONTHLY_REWARD_CAP - 1) === true, 'εντός πλαφόν στο όριο-1');
ok(withinMonthlyCap(MONTHLY_REWARD_CAP) === false, 'εκτός πλαφόν στο όριο');

// ── Ενεργοποίηση ──
ok(isActivated({ propertiesAdded: 1, documentsScanned: 1 }) === true, 'ενεργοποιήθηκε');
ok(isActivated({ propertiesAdded: 1, documentsScanned: 0 }) === false, 'χωρίς σάρωση → όχι');
ok(isActivated({ propertiesAdded: 0, documentsScanned: 3 }) === false, 'χωρίς ακίνητο → όχι');

// ── Υβριδική ανταμοιβή προσκαλούντος ──
const rFree = referrerRewardFor('free', 0, 0);
ok(rFree.kind === 'slot' && rFree.slots === 1, 'δωρεάν → +1 θέση');
const rPaid = referrerRewardFor('owner', 0, 0);
ok(rPaid.kind === 'free_month' && rPaid.months === 1, 'πληρωμένος → +1 μήνας');
const rAgency = referrerRewardFor('agency', 0, 0);
ok(rAgency.kind === 'free_month', 'επαγγελματίας → μήνας');
ok(referrerRewardFor('free', MAX_EARNED_SLOTS, 0).kind === 'none', 'δωρεάν με γεμάτες θέσεις → none');
ok(referrerRewardFor('owner', 0, MONTHLY_REWARD_CAP).kind === 'none', 'πάνω από πλαφόν → none');

// ── Δώρο νέου χρήστη ──
ok(refereeReward().months === REFEREE_TRIAL_MONTHS, 'φίλος → 2 μήνες');

// ── Πραγματικό όριο ακινήτων ──
ok(effectiveMaxProperties('free', 0) === 1, 'δωρεάν βάση 1');
ok(effectiveMaxProperties('free', 2) === 3, 'δωρεάν +2 θέσεις = 3');
ok(effectiveMaxProperties('free', 99) === 1 + MAX_EARNED_SLOTS, 'κερδισμένες θέσεις κόβονται στο πλαφόν');
ok(effectiveMaxProperties('owner', 1) === 7, 'ιδιοκτήτης 6 +1 = 7');
ok(effectiveMaxProperties('agency', 5) === Infinity, 'επαγγελματίας μένει απεριόριστος');

// ── Προσθήκη ακινήτου με κερδισμένες θέσεις ──
ok(canAddWithReferrals('free', 0, 0) === true, 'δωρεάν, 0 ακίνητα → μπορεί');
ok(canAddWithReferrals('free', 0, 1) === false, 'δωρεάν, 1 ακίνητο, 0 θέσεις → όχι');
ok(canAddWithReferrals('free', 2, 2) === true, 'δωρεάν +2 θέσεις, 2 ακίνητα → μπορεί (3ο)');
ok(canAddWithReferrals('free', 2, 3) === false, 'δωρεάν +2 θέσεις, 3 ακίνητα → όχι');

console.log(`\nreferral/referral.ts — ${p} passed, ${f} failed`);
if (f > 0) process.exit(1);
console.log('όλα πέρασαν');
