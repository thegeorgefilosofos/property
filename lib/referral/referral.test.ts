// npx tsx lib/referral/referral.test.ts
import {
  referralCode, referralLink, isValidReferral, isSelfOrDuplicate, normalizePhone,
  withinMonthlyCap, monthlyCapFor, isActivated, referrerRewardFor, refereeReward,
  countActiveSlots, effectiveMaxProperties, canAddWithReferrals,
  MAX_ACTIVE_SLOTS, MONTHLY_CAP_DEFAULT, MONTHLY_CAP_AGENCY, REFEREE_TRIAL_MONTHS,
} from './referral';

let p = 0, f = 0;
const ok = (c: boolean, m: string) => { if (c) p++; else { f++; console.error('✗', m); } };

// ── Κωδικός & σύνδεσμος ──
const uid = '3f9a12b7-0c4e-4a11-9d2e-77aa11bb22cc';
ok(referralCode(uid) === referralCode(uid), 'κωδικός ντετερμινιστικός');
ok(/^PO[0-9A-Z]{2,6}$/.test(referralCode(uid)), 'κωδικός σε μορφή');
ok(referralCode(uid) !== referralCode('other'), 'διαφορετικοί χρήστες → διαφορετικοί κωδικοί');
ok(referralLink('https://property-os.gr/', uid) === `https://property-os.gr/signup?ref=${referralCode(uid)}`, 'σύνδεσμος καθαρός');

// ── Εγκυρότητα ──
ok(isValidReferral('A', 'B', true) === true, 'έγκυρη');
ok(isValidReferral('A', 'A', true) === false, 'άκυρη: αυτο-παραπομπή (id)');
ok(isValidReferral('A', 'B', false) === false, 'άκυρη: μη-νέος');

// ── Anti-abuse: τηλέφωνο, email, συσκευή ──
ok(normalizePhone('+30 697 1234567') === '6971234567', 'κανονικοποίηση τηλεφώνου');
ok(normalizePhone('0030-6971234567') === '6971234567', 'ίδιο τηλέφωνο, άλλη μορφή');
ok(isSelfOrDuplicate({ referrerId: 'A', refereeId: 'A' }) === true, 'μπλοκ: ίδιο id');
ok(isSelfOrDuplicate({ referrerId: 'A', refereeId: 'B', referrerEmail: 'X@a.gr', refereeEmail: 'x@a.gr' }) === true, 'μπλοκ: ίδιο email');
ok(isSelfOrDuplicate({ referrerId: 'A', refereeId: 'B', referrerPhone: '+306971234567', refereePhone: '6971234567' }) === true, 'μπλοκ: ίδιο τηλέφωνο');
ok(isSelfOrDuplicate({ referrerId: 'A', refereeId: 'B', sharedDevice: true }) === true, 'μπλοκ: κοινή συσκευή');
ok(isSelfOrDuplicate({ referrerId: 'A', refereeId: 'B', referrerPhone: '6971111111', refereePhone: '6972222222' }) === false, 'ΟΚ: διαφορετικά στοιχεία');

// ── Πλαφόν ανά προφίλ ──
ok(monthlyCapFor('free') === MONTHLY_CAP_DEFAULT, 'πλαφόν δωρεάν');
ok(monthlyCapFor('agency') === MONTHLY_CAP_AGENCY, 'πλαφόν επαγγελματία υψηλότερο');
ok(withinMonthlyCap('agency', MONTHLY_CAP_DEFAULT + 1) === true, 'επαγγελματίας ακόμη εντός');
ok(withinMonthlyCap('free', MONTHLY_CAP_DEFAULT) === false, 'δωρεάν εκτός στο όριο');

// ── Ενεργοποίηση ──
ok(isActivated({ propertiesAdded: 1, documentsScanned: 1 }) === true, 'ενεργοποιήθηκε');
ok(isActivated({ propertiesAdded: 1, documentsScanned: 0 }) === false, 'χωρίς σάρωση → όχι');

// ── Ανταμοιβή: πίνακας προφίλ × τι έφερε ──
const fr = referrerRewardFor('free', 'free', 0, 0);
ok(fr.kind === 'slot' && fr.slots === 1 && fr.months === 1, 'δωρεάν → φίλο: +θέση 1 μήνα (προσωρινή)');
ok(referrerRewardFor('free', 'agency', 0, 0).kind === 'free_month', 'δωρεάν → επαγγελματία: μήνας Ιδιοκτήτη');
const or = referrerRewardFor('owner', 'free', 0, 0);
ok(or.kind === 'free_month' && or.months === 1, 'ιδιοκτήτης → φίλο: 1 μήνας');
const op = referrerRewardFor('owner', 'agency', 0, 0);
ok(op.kind === 'free_month' && op.months === 2, 'ιδιοκτήτης → επαγγελματία: 2 μήνες (μπόνους)');
const ap = referrerRewardFor('agency', 'agency', 0, 0);
ok(ap.kind === 'free_month' && ap.months === 2, 'επαγγελματίας → επαγγελματία: 2 μήνες');
ok(referrerRewardFor('free', 'free', MAX_ACTIVE_SLOTS, 0).kind === 'none', 'δωρεάν με γεμάτες θέσεις → none');
ok(referrerRewardFor('free', 'free', 0, MONTHLY_CAP_DEFAULT).kind === 'none', 'πάνω από πλαφόν → none');
ok(referrerRewardFor('agency', 'free', 0, MONTHLY_CAP_DEFAULT + 3).kind === 'free_month', 'επαγγελματίας ακόμη ανταμείβεται πάνω από το κοινό πλαφόν');

// ── Δώρο νέου χρήστη ──
ok(refereeReward().months === REFEREE_TRIAL_MONTHS, 'φίλος → 2 μήνες');

// ── Ενεργές θέσεις με λήξη ──
const grants = [{ expiresAt: '2026-01-01T00:00:00Z' }, { expiresAt: '2027-01-01T00:00:00Z' }, { expiresAt: null }];
ok(countActiveSlots(grants, '2026-06-01T00:00:00Z') === 2, 'μετράει μόνο ενεργές (1 ληγμένη)');
ok(countActiveSlots(grants, '2028-06-01T00:00:00Z') === 1, 'μόνο η μόνιμη μένει');

// ── Πραγματικό όριο & προσθήκη ──
ok(effectiveMaxProperties('free', 0) === 1, 'δωρεάν βάση 1');
ok(effectiveMaxProperties('free', 2) === 3, 'δωρεάν +2 ενεργές = 3');
ok(effectiveMaxProperties('free', 99) === 1 + MAX_ACTIVE_SLOTS, 'θέσεις κόβονται στο πλαφόν');
ok(effectiveMaxProperties('owner', 1) === 7, 'ιδιοκτήτης 6 +1 = 7');
ok(effectiveMaxProperties('agency', 5) === Infinity, 'επαγγελματίας απεριόριστος');
ok(canAddWithReferrals('free', 2, 2) === true, 'δωρεάν +2 θέσεις, 2 ακίνητα → 3ο επιτρεπτό');
ok(canAddWithReferrals('free', 2, 3) === false, 'δωρεάν +2 θέσεις, 3 ακίνητα → όχι');

console.log(`\nreferral/referral.ts — ${p} passed, ${f} failed`);
if (f > 0) process.exit(1);
console.log('όλα πέρασαν');
