// npx tsx lib/referral/referral.test.ts
import {
  referralCode, referralLink, isValidReferral, isSelfOrDuplicate, normalizePhone,
  isActivated, REFEREE_TRIAL_MONTHS,
  individualReferrerReward, refereeWelcome,
  REFERRER_SLOT_MONTHS, INDIV_PRO_BONUS_MONTHS,
  REFEREE_FREE_SLOT_MONTHS, REFEREE_OWNER_MONTHS, REFEREE_AGENCY_MONTHS,
  INDIV_VOLUME_TARGET, INDIV_VOLUME_BONUS_MONTHS,
  PRO_PAID_TARGET, PRO_PAID_BONUS_MONTHS, PRO_FREE_TARGET, PRO_FREE_BONUS_MONTHS,
  progress, currentStreak, isPartner, streakProgress, partnerFreeMonths,
  STREAK_TARGET_MONTHS, PARTNER_MONTHLY_FREE_MONTHS,
} from './referral';
import * as referral from './referral';

let p = 0, f = 0;
const ok = (c: boolean, m: string) => { if (c) p++; else { f++; console.error('✗', m); } };

// ── Κωδικός & σύνδεσμος ──
const uid = '3f9a12b7-0c4e-4a11-9d2e-77aa11bb22cc';
ok(referralCode(uid) === referralCode(uid), 'κωδικός ντετερμινιστικός');
ok(/^PO[0-9A-Z]{7}$/.test(referralCode(uid)), 'κωδικός σε μορφή (PO + 7, χωρίς απώλεια ψηφίων)');
ok(referralCode(uid).length === 9, 'κωδικός σταθερού μήκους 9');
ok(referralCode(uid) !== referralCode('other'), 'διαφορετικοί χρήστες → διαφορετικοί κωδικοί');
ok(referralLink('https://propertyos.gr/', uid) === `https://propertyos.gr/signup?ref=${referralCode(uid)}`, 'σύνδεσμος καθαρός');

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

// ── Πρόγραμμα Ιδιώτη: ανταμοιβή ανά σύσταση (συστήνων) ──
// ΕΝΑΣ ΚΑΝΟΝΑΣ ΓΙΑ ΟΛΟΥΣ: ένα ακίνητο παραπάνω για έναν μήνα, ό,τι πλάνο κι αν
// έχει ο συστήνων. Πριν έπαιρνε ακίνητο ο δωρεάν και μήνα ο συνδρομητής — δύο
// κανόνες για την ίδια πράξη, που δεν εξηγούνταν σε μία πρόταση.
const free2free = individualReferrerReward(false, 'free');
ok(free2free.isSlot && free2free.months === REFERRER_SLOT_MONTHS && free2free.months === 1, 'δωρεάν συστήνων: +1 ακίνητο για 1 μήνα');
const own2free = individualReferrerReward(true, 'free');
ok(own2free.isSlot && own2free.months === 1, 'συνδρομητής συστήνων: ΤΟ ΙΔΙΟ, +1 ακίνητο για 1 μήνα');
// Η μόνη εξαίρεση, και έχει λόγο: η σύσταση Επαγγελματία αξίζει πολύ
// περισσότερο από μία θέση ακινήτου.
const any2pro = individualReferrerReward(false, 'agency');
ok(!any2pro.isSlot && any2pro.months === INDIV_PRO_BONUS_MONTHS && any2pro.months === 1, 'νέος γίνεται Επαγγελματίας → εσύ +1 μήνας Ιδιώτης');
ok(individualReferrerReward(true, 'agency').months === 1, 'ίδιο και για Ιδιώτη συστήνοντα');
ok(INDIV_VOLUME_TARGET === 3 && INDIV_VOLUME_BONUS_MONTHS === 1, '3 νέοι ιδιώτες/μήνα → +1 μήνας');

// ── Πρόγραμμα Ιδιώτη: δώρο νέου χρήστη ανά επιλογή πλάνου ──
// ΕΝΑΣ ΜΗΝΑΣ ΔΩΡΕΑΝ, ΣΤΟ ΠΛΑΝΟ ΠΟΥ ΔΙΑΛΕΓΕΙ. Ο νέος χρήστης δεν χρειάζεται να
// καταλάβει τρία διαφορετικά δώρα πριν καν μπει: διαλέγει πλάνο ανάλογα με τα
// ακίνητά του, και ο πρώτος μήνας είναι δώρο — όποιο κι αν είναι.
const wFree = refereeWelcome('free');
ok(wFree.isSlot && wFree.months === REFEREE_FREE_SLOT_MONTHS && wFree.months === 1, 'νέος δωρεάν: +1 ακίνητο για 1 μήνα');
ok(refereeWelcome('owner').months === REFEREE_OWNER_MONTHS && refereeWelcome('owner').months === 1 && !refereeWelcome('owner').isSlot, 'νέος στο Ιδιώτης: 1 μήνας δωρεάν');
const wPro = refereeWelcome('agency');
ok(wPro.months === REFEREE_AGENCY_MONTHS && wPro.months === 1 && wPro.tier === 'agency', 'νέος Επαγγελματίας: 1 μήνας Επαγγελματία');
ok(REFEREE_TRIAL_MONTHS === 1, 'δώρο καλωσορίσματος στο invite = 1 μήνας');
// Και τα τρία μονοπάτια δίνουν ΤΟΝ ΙΔΙΟ αριθμό μηνών: αυτό είναι ολόκληρο το μήνυμα.
ok([refereeWelcome('free'), refereeWelcome('owner'), refereeWelcome('agency')].every(w => w.months === 1),
   'ένας μήνας δωρεάν, ό,τι πλάνο κι αν διαλέξει');

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

// ── Ανταμοιβή Συνεργάτη: ΔΩΡΕΑΝ ΜΗΝΕΣ, ΟΧΙ ΜΕΤΡΗΤΑ ──
// Η οθόνη υποσχόταν «20% προμήθεια κάθε μήνα» πάνω σε μηχανή που δέχεται μόνο
// kind='months'|'slot': κανένα ledger, κανένα payout, και η στρατηγική αποκλείει
// ρητά τις πληρωμές. Ό,τι δεν μπορεί να πληρωθεί δεν υπάρχει στον κώδικα.
ok(partnerFreeMonths([5, 5, 5]) === 3 * PARTNER_MONTHLY_FREE_MONTHS, 'Συνεργάτης: κάθε μήνας στόχου → ένας δωρεάν');
ok(partnerFreeMonths([5, 5]) === 0, 'χωρίς την ιδιότητα Συνεργάτη → κανένας δωρεάν μήνας');
ok(partnerFreeMonths([5, 5, 4]) === 0, 'σπασμένο σερί → κανένας δωρεάν μήνας');
ok(partnerFreeMonths([]) === 0, 'κενό ιστορικό → 0');
ok(!('partnerCommission' in referral) && !('PARTNER_COMMISSION_RATE' in referral),
  'καμία προμήθεια σε μετρητά δεν επιστρέφει στη μηχανή');

console.log(`\nreferral/referral.ts — ${p} passed, ${f} failed`);
if (f > 0) process.exit(1);
console.log('όλα πέρασαν');
