// npx tsx lib/billing/entitlements.test.ts
import {
  ALLOWED_PLANS, FEATURE_MIN_PLAN, TAB_MIN_PLAN, PROFESSIONAL_ONLY_TABS,
  planAtLeast, effectivePlan, activeComp, hasFeature, isTabAllowed,
  requiredPlanForTab, requiredPlanForFeature, propertyLimit, canAddProperty,
  isPlanAllowedForProfile, paidPlanForProfile, isTabRelevant,
  type EntitlementInput,
} from './entitlements';

let p = 0, f = 0;
const ok = (c: boolean, m: string) => { if (c) p++; else { f++; console.error('✗', m); } };

const NOW = Date.parse('2026-07-20T00:00:00Z');
const daysFromNow = (d: number) => new Date(NOW + d * 86400000).toISOString();

// ── Επιτρεπόμενα πλάνα ανά προφίλ ──
ok(ALLOWED_PLANS.individual.join(',') === 'free,owner', 'ιδιώτης → free,owner');
ok(ALLOWED_PLANS.professional.join(',') === 'agency', 'επαγγελματίας → agency');
ok(isPlanAllowedForProfile('individual', 'free') === true, 'ιδιώτης μπορεί δωρεάν');
ok(isPlanAllowedForProfile('individual', 'owner') === true, 'ιδιώτης μπορεί ιδιοκτήτης');
ok(isPlanAllowedForProfile('individual', 'agency') === false, 'ιδιώτης ΔΕΝ μπορεί επαγγελματίας');
ok(isPlanAllowedForProfile('professional', 'agency') === true, 'επαγγελματίας μπορεί agency');
ok(isPlanAllowedForProfile('professional', 'free') === false, 'επαγγελματίας ΔΕΝ μένει δωρεάν');
ok(isPlanAllowedForProfile('professional', 'owner') === false, 'επαγγελματίας ΔΕΝ παίρνει ιδιοκτήτη');
ok(paidPlanForProfile('individual') === 'owner', 'πληρωμένο πλάνο ιδιώτη = owner');
ok(paidPlanForProfile('professional') === 'agency', 'πληρωμένο πλάνο επαγγελματία = agency');

// ── Σειρά πλάνων ──
ok(planAtLeast('agency', 'owner') === true, 'agency ≥ owner');
ok(planAtLeast('owner', 'owner') === true, 'owner ≥ owner');
ok(planAtLeast('free', 'owner') === false, 'free < owner');
ok(planAtLeast('owner', 'agency') === false, 'owner < agency');
ok(planAtLeast('agency', 'free') === true, 'agency ≥ free');

// ── Ενεργό πλάνο: βασικό ──
ok(effectivePlan({ plan: 'free' }) === 'free', 'βασικό free');
ok(effectivePlan({ plan: 'owner' }) === 'owner', 'βασικό owner');
ok(effectivePlan({ plan: 'agency' }) === 'agency', 'βασικό agency');
ok(effectivePlan({ plan: 'trial' }) === 'free', 'άγνωστο plan → free');
ok(effectivePlan({ plan: null }) === 'free', 'κενό plan → free');

// ── Ενεργό πλάνο: partner ανυψώνει σε agency ──
ok(effectivePlan({ plan: 'free', partner: true }) === 'agency', 'partner → agency');
ok(effectivePlan({ plan: 'owner', partner: true }) === 'agency', 'partner ανυψώνει owner→agency');
ok(effectivePlan({ plan: 'agency', partner: false }) === 'agency', 'agency χωρίς partner παραμένει');

// ── Ενεργό πλάνο: δωρεάν μήνες (comp) ──
ok(effectivePlan({ plan: 'free', compPlan: 'owner', compUntil: daysFromNow(10), now: NOW }) === 'owner', 'ενεργό comp owner ανυψώνει');
ok(effectivePlan({ plan: 'free', compPlan: 'agency', compUntil: daysFromNow(10), now: NOW }) === 'agency', 'ενεργό comp agency ανυψώνει');
ok(effectivePlan({ plan: 'free', compPlan: 'owner', compUntil: daysFromNow(-1), now: NOW }) === 'free', 'ληγμένο comp δεν ανυψώνει');
ok(effectivePlan({ plan: 'owner', compPlan: 'owner', compUntil: daysFromNow(10), now: NOW }) === 'owner', 'comp ίσο με βασικό δεν αλλάζει');
ok(effectivePlan({ plan: 'agency', compPlan: 'owner', compUntil: daysFromNow(10), now: NOW }) === 'agency', 'comp μικρότερο από βασικό δεν υποβαθμίζει');
ok(effectivePlan({ plan: 'free', compPlan: 'agency', compUntil: 'not-a-date', now: NOW }) === 'free', 'άκυρη ημερομηνία comp αγνοείται');
ok(effectivePlan({ plan: 'free', compUntil: daysFromNow(10), now: NOW }) === 'free', 'comp χωρίς compPlan αγνοείται');

// ── activeComp ──
ok(activeComp({ compPlan: 'owner', compUntil: daysFromNow(5), now: NOW })?.plan === 'owner', 'activeComp επιστρέφει owner');
ok(activeComp({ compPlan: 'owner', compUntil: daysFromNow(-5), now: NOW }) === null, 'activeComp ληγμένο → null');
ok(activeComp({ now: NOW }) === null, 'activeComp χωρίς στοιχεία → null');

// ── Δυνατότητες ανά ελάχιστο πλάνο ──
ok(FEATURE_MIN_PLAN.multi_property === 'owner', 'multi_property ≥ owner');
ok(FEATURE_MIN_PLAN.comparison === 'owner', 'comparison ≥ owner');
ok(FEATURE_MIN_PLAN.e2_export === 'owner', 'e2_export ≥ owner');
ok(FEATURE_MIN_PLAN.rent_collection === 'owner', 'rent_collection ≥ owner');
ok(FEATURE_MIN_PLAN.clients === 'agency', 'clients ≥ agency');
ok(FEATURE_MIN_PLAN.portfolio === 'agency', 'portfolio ≥ agency');
ok(FEATURE_MIN_PLAN.report_branding === 'agency', 'report_branding ≥ agency');

// free δεν έχει καμία κλειδωμένη δυνατότητα
const free: EntitlementInput = { plan: 'free' };
ok(hasFeature(free, 'multi_property') === false, 'free δεν έχει multi_property');
ok(hasFeature(free, 'comparison') === false, 'free δεν έχει comparison');
ok(hasFeature(free, 'e2_export') === false, 'free δεν έχει e2_export');
ok(hasFeature(free, 'clients') === false, 'free δεν έχει clients');
ok(hasFeature(free, 'portfolio') === false, 'free δεν έχει portfolio');
ok(hasFeature(free, 'report_branding') === false, 'free δεν έχει report_branding');

// owner έχει owner-δυνατότητες αλλά όχι agency
const owner: EntitlementInput = { plan: 'owner' };
ok(hasFeature(owner, 'multi_property') === true, 'owner έχει multi_property');
ok(hasFeature(owner, 'comparison') === true, 'owner έχει comparison');
ok(hasFeature(owner, 'e2_export') === true, 'owner έχει e2_export');
ok(hasFeature(owner, 'rent_collection') === true, 'owner έχει rent_collection');
ok(hasFeature(owner, 'clients') === false, 'owner ΔΕΝ έχει clients');
ok(hasFeature(owner, 'portfolio') === false, 'owner ΔΕΝ έχει portfolio');
ok(hasFeature(owner, 'report_branding') === false, 'owner ΔΕΝ έχει report_branding');

// agency έχει τα πάντα
const agency: EntitlementInput = { plan: 'agency' };
(['multi_property','comparison','e2_export','rent_collection','clients','portfolio','report_branding'] as const)
  .forEach(feat => ok(hasFeature(agency, feat) === true, `agency έχει ${feat}`));

// partner (free βάση) έχει τα πάντα μέσω ανύψωσης
const partner: EntitlementInput = { plan: 'free', partner: true };
ok(hasFeature(partner, 'clients') === true, 'partner έχει clients');
ok(hasFeature(partner, 'portfolio') === true, 'partner έχει portfolio');

// comp owner ξεκλειδώνει owner-δυνατότητες μόνο
const compOwner: EntitlementInput = { plan: 'free', compPlan: 'owner', compUntil: daysFromNow(15), now: NOW };
ok(hasFeature(compOwner, 'comparison') === true, 'comp owner ξεκλειδώνει comparison');
ok(hasFeature(compOwner, 'clients') === false, 'comp owner ΔΕΝ ξεκλειδώνει clients');

// ── Καρτέλες ──
ok(TAB_MIN_PLAN.comparison === 'owner', 'tab comparison ≥ owner');
ok(TAB_MIN_PLAN.portfolio === 'agency', 'tab portfolio ≥ agency');
ok(TAB_MIN_PLAN.clients === 'agency', 'tab clients ≥ agency');
ok(isTabAllowed(free, 'overview') === true, 'free βλέπει overview');
ok(isTabAllowed(free, 'finances') === true, 'free βλέπει δαπάνες');
ok(isTabAllowed(free, 'accounting') === true, 'free βλέπει λογιστική');
ok(isTabAllowed(free, 'tenant') === true, 'free βλέπει ενοικιαστή');
ok(isTabAllowed(free, 'inventory') === true, 'free βλέπει απογραφή');
ok(isTabAllowed(free, 'comparison') === false, 'free ΔΕΝ βλέπει σύγκριση');
ok(isTabAllowed(free, 'clients') === false, 'free ΔΕΝ βλέπει πελατολόγιο');
ok(isTabAllowed(owner, 'comparison') === true, 'owner βλέπει σύγκριση');
ok(isTabAllowed(owner, 'clients') === false, 'owner ΔΕΝ βλέπει πελατολόγιο');
ok(isTabAllowed(agency, 'clients') === true, 'agency βλέπει πελατολόγιο');
ok(isTabAllowed(agency, 'portfolio') === true, 'agency βλέπει χαρτοφυλάκιο');
ok(requiredPlanForTab('comparison') === 'owner', 'required tab comparison = owner');
ok(requiredPlanForTab('overview') === 'free', 'required tab overview = free (default)');
ok(requiredPlanForFeature('clients') === 'agency', 'required feature clients = agency');

// ── Σχετικότητα καρτέλας ανά προφίλ (portfolio/clients μόνο σε επαγγελματίες) ──
ok(PROFESSIONAL_ONLY_TABS.has('portfolio') === true, 'portfolio professional-only');
ok(PROFESSIONAL_ONLY_TABS.has('clients') === true, 'clients professional-only');
ok(isTabRelevant('individual', 'portfolio') === false, 'ιδιώτης δεν βλέπει χαρτοφυλάκιο καθόλου');
ok(isTabRelevant('individual', 'clients') === false, 'ιδιώτης δεν βλέπει πελατολόγιο καθόλου');
ok(isTabRelevant('professional', 'portfolio') === true, 'επαγγελματίας βλέπει χαρτοφυλάκιο (έστω κλειδωμένο)');
ok(isTabRelevant('individual', 'comparison') === true, 'ιδιώτης βλέπει σύγκριση (μπορεί να πάρει owner)');
ok(isTabRelevant('individual', 'overview') === true, 'ιδιώτης βλέπει overview');

// ── Όριο ακινήτων ──
ok(propertyLimit(free) === 1, 'free → 1 ακίνητο');
ok(propertyLimit(owner) === 6, 'owner → 6 ακίνητα');
ok(propertyLimit(agency) === Infinity, 'agency → απεριόριστα');
ok(propertyLimit(partner) === Infinity, 'partner → απεριόριστα');
ok(canAddProperty(free, 0) === true, 'free μπορεί το 1ο');
ok(canAddProperty(free, 1) === false, 'free ΔΕΝ μπορεί 2ο');
ok(canAddProperty(owner, 5) === true, 'owner μπορεί το 6ο');
ok(canAddProperty(owner, 6) === false, 'owner ΔΕΝ μπορεί 7ο');
ok(canAddProperty(agency, 999) === true, 'agency πάντα μπορεί');
ok(canAddProperty(compOwner, 3) === true, 'comp owner μπορεί έως 6');
ok(canAddProperty(compOwner, 6) === false, 'comp owner σταματά στα 6');

console.log(`\nbilling/entitlements.ts — ${p} passed, ${f} failed`);
if (f > 0) process.exit(1);
console.log('όλα πέρασαν');
