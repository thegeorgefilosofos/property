// npx tsx lib/referral/referral.test.ts
import {
  referralCode, referralLink, isValidReferral, isSelfOrDuplicate, normalizePhone,
  isActivated, REFEREE_TRIAL_MONTHS,
  individualReferralReward, INDIV_PER_REFERRAL_MONTHS, INDIV_PRO_BONUS_MONTHS,
  INDIV_VOLUME_TARGET, INDIV_VOLUME_BONUS_MONTHS,
  PRO_PAID_TARGET, PRO_PAID_BONUS_MONTHS, PRO_FREE_TARGET, PRO_FREE_BONUS_MONTHS,
  progress, currentStreak, isPartner, streakProgress,
  partnerCommission, partnerCommissionFromSubs,
  STREAK_TARGET_MONTHS, PARTNER_COMMISSION_RATE, PARTNER_MONTHLY_FREE_MONTHS,
} from './referral';

let p = 0, f = 0;
const ok = (c: boolean, m: string) => { if (c) p++; else { f++; console.error('✗', m); } };

// ── Κωδικός & σύνδεσμος ──
const uid = '3f9a12b7-0c4e-4a11-9d2e-77aa11bb22cc';
ok(referralCode(uid) === referralCode(uid), 'κωδικός ντετερμινιστικός');
ok(/^PO[0-9A-Z]{7}$/.test(referralCode(uid)), 'κωδικός σε μορφή (PO + 7, χωρίς απώλεια ψηφίων)');
ok(referralCode(uid).length === 9, 'κωδικός σταθερού μήκους 9');
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

// ── Ενεργοποίηση ──
ok(isActivated({ propertiesAdded: 1, documentsScanned: 1 }) === true, 'ενεργοποιήθηκε');
ok(isActivated({ propertiesAdded: 1, documentsScanned: 0 }) === false, 'χωρίς σάρωση → όχι');

// ── Πρόγραμμα Ιδιώτη: ανταμοιβή ανά σύσταση ──
const ri = individualReferralReward('free');
ok(ri.selfMonths === INDIV_PER_REFERRAL_MONTHS && ri.selfMonths === 1, 'ιδιώτης φέρνει δωρεάν → +1 μήνας σε σένα');
ok(ri.refereeMonths === REFEREE_TRIAL_MONTHS, 'ο νέος → δώρο καλωσορίσματος');
ok(individualReferralReward('owner').selfMonths === 1, 'ιδιώτης φέρνει ιδιώτη → +1 μήνας');
ok(individualReferralReward('agency').selfMonths === INDIV_PRO_BONUS_MONTHS, 'ιδιώτης φέρνει Επαγγελματία → +2 μήνες');
ok(individualReferralReward('agency').selfMonths === 2, 'μπόνους επαγγελματία = 2 μήνες');
ok(INDIV_VOLUME_TARGET === 5 && INDIV_VOLUME_BONUS_MONTHS === 1, '5 νέοι ιδιώτες/μήνα → +1 μήνας');

// ── Πρόγραμμα Επαγγελματία: milestones ──
ok(PRO_PAID_TARGET === 5 && PRO_PAID_BONUS_MONTHS === 2, '5 συνδρομητές/μήνα → 2 μήνες Επαγγελματία');
ok(PRO_FREE_TARGET === 10 && PRO_FREE_BONUS_MONTHS === 1, '10 δωρεάν/μήνα → 1 μήνας Επαγγελματία');

// ── Γενική πρόοδος ──
const pr = progress(3, 5);
ok(pr.count === 3 && pr.target === 5 && pr.remaining === 2 && pr.reached === false, 'πρόοδος 3/5, λείπουν 2');
ok(Math.round(pr.pct) === 60, 'πρόοδος 60%');
ok(progress(7, 5).reached === true && progress(7, 5).remaining === 0, 'πάνω από στόχο → επιτεύχθηκε');
ok(progress(4, 10).pct === 40, 'πρόοδος 4/10 = 40%');

// ── Σερί & Συνεργάτης (μετρά ΣΥΝΔΡΟΜΗΤΕΣ ≥5/μήνα) ──
ok(currentStreak([5, 5, 5]) === 3, 'σερί 3 μηνών');
ok(currentStreak([5, 2, 5, 6]) === 2, 'σερί μετρά μόνο τα τελευταία συνεχόμενα');
ok(currentStreak([6, 6, 3]) === 0, 'σπασμένο σερί στον τελευταίο μήνα → 0');
ok(currentStreak([4, 4, 4]) === 0, 'κάτω από 5 συνδρομητές → κανένα σερί');
ok(currentStreak([]) === 0, 'κενό ιστορικό → 0');
ok(isPartner([5, 5, 5]) === true, 'τρεις σερί → Συνεργάτης');
ok(isPartner([5, 5, 4]) === false, 'δύο σερί → όχι ακόμη');
ok(isPartner([9, 9, 9, 9]) === true, 'τέσσερις σερί → Συνεργάτης');
const sp2 = streakProgress([5, 5]);
ok(sp2.current === 2 && sp2.target === STREAK_TARGET_MONTHS && sp2.reached === false, 'πρόοδος σερί 2/3');
ok(Math.round(sp2.pct) === 67, 'πρόοδος σερί 2/3 → ~67%');
ok(streakProgress([5, 5, 5, 5]).current === STREAK_TARGET_MONTHS, 'πρόοδος σερί κόβεται στο target');
ok(streakProgress([5, 5, 5]).pct === 100, 'σερί ολοκληρωμένο → 100%');
ok(PARTNER_MONTHLY_FREE_MONTHS === 1, 'κάθε επιτυχημένος μήνας Συνεργάτη → 1 μήνας δωρεάν');

// ── Προμήθεια Συνεργάτη ──
ok(partnerCommission(100) === 20, 'προμήθεια 20% στα 100€');
ok(partnerCommission(-50) === 0, 'αρνητικά έσοδα → 0 προμήθεια');
ok(Math.abs(partnerCommission(18.9) - 3.78) < 1e-9, 'προμήθεια σε 18,90€');
ok(partnerCommissionFromSubs([5.9, 18.9, 5.9]) === PARTNER_COMMISSION_RATE * (5.9 + 18.9 + 5.9), 'προμήθεια από λίστα συνδρομών');
ok(partnerCommissionFromSubs([5.9, -3, 18.9]) === PARTNER_COMMISSION_RATE * (5.9 + 18.9), 'αγνοεί μη-θετικά');

console.log(`\nreferral/referral.ts — ${p} passed, ${f} failed`);
if (f > 0) process.exit(1);
console.log('όλα πέρασαν');
