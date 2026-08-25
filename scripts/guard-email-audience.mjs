#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΚΟΙΝΟ ΤΩΝ EMAIL ΕΙΝΑΙ ΤΥΠΟΣ ΠΡΟΦΙΛ, ΟΧΙ ΠΑΚΕΤΟ ΧΡΕΩΣΗΣ
// ─────────────────────────────────────────────────────────────────────────
// ΔΥΟ ΛΕΞΙΛΟΓΙΑ ΜΕ ΕΝΑ ΟΝΟΜΑ, ΚΑΙ ΕΧΕΙ ΗΔΗ ΔΑΓΚΩΣΕΙ ΜΙΑ ΦΟΡΑ:
//
//   τύπος προφίλ   individual | professional        (lib/billing/entitlements.ts)
//   πακέτο χρέωσης free | solo | owner | agency | office   (lib/billing/plans.ts)
//
// Το `PLAN_LABEL` του emailTemplates.ts λέγεται «plan» αλλά έχει κλειδιά του
// ΠΡΟΦΙΛ. Οσο η SQL περνούσε το πακέτο σε αυτό το πεδίο, η σύγκριση δεν
// πετύχαινε ποτέ και κάθε χρήστης έπαιρνε το κείμενο του «free». Διορθώθηκε
// στη μετανάστευση 20260819130000 και η SQL περνά πλέον ρητά το `profile`.
//
// ΤΟ ΛΑΘΟΣ ΟΜΩΣ ΦΥΛΑΓΕΤΑΙ ΜΕ ΣΧΟΛΙΟ, ΚΑΙ ΤΑ ΣΧΟΛΙΑ ΔΕΝ ΚΟΚΚΙΝΙΖΟΥΝ. Αν κάποιος
// προσθέσει «solo» ή «owner» στο PLAN_LABEL νομίζοντας ότι συμπληρώνει κάτι
// που λείπει, ή αν αλλάξουν οι τύποι προφίλ και το PLAN_LABEL μείνει πίσω, η
// επιστολή θα τυπώσει «undefined» στη θέση του ονόματος. Εδώ ελέγχεται.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';

const TPL = 'supabase/functions/_shared/emailTemplates.ts';
const ENT = 'lib/billing/entitlements.ts';
const PLANS = 'lib/billing/plans.ts';

const tpl = readFileSync(TPL, 'utf8');
const ent = readFileSync(ENT, 'utf8');
const plans = readFileSync(PLANS, 'utf8');

const problems = [];

// 1. Οι τύποι προφίλ, όπως τους ορίζει η πηγή τους.
const profileTypes = (/export type ProfileType\s*=\s*([^;]+);/.exec(ent)?.[1] || '')
  .split('|').map(x => x.trim().replace(/^'|'$/g, '')).filter(Boolean);
if (!profileTypes.length) problems.push(`δεν διαβάστηκε το ProfileType από ${ENT}`);

// 2. Τα πακέτα χρέωσης, που ΔΕΝ επιτρέπεται να εμφανιστούν ως κοινό.
const planIds = [...plans.matchAll(/^\s*id: '([a-z]+)',/gm)].map(m => m[1]);
if (!planIds.length) problems.push(`δεν διαβάστηκαν τα πακέτα από ${PLANS}`);

// 3. Τα κλειδιά του PLAN_LABEL.
const body = /export const PLAN_LABEL[^{]*\{([\s\S]*?)\}/.exec(tpl)?.[1];
if (body == null) problems.push(`δεν βρέθηκε το PLAN_LABEL στο ${TPL}`);
const labelKeys = body ? [...body.matchAll(/(\w+)\s*:/g)].map(m => m[1]) : [];

if (labelKeys.length) {
  // Το «free» είναι το κοινό χωρίς συνδρομή και ζει και στις δύο λίστες.
  const want = ['free', ...profileTypes].sort();
  const got = [...labelKeys].sort();
  if (want.join('|') !== got.join('|'))
    problems.push(`το PLAN_LABEL έχει «${got.join(', ')}» και όφειλε «${want.join(', ')}»`);

  const billing = labelKeys.filter(k => k !== 'free' && planIds.includes(k));
  if (billing.length)
    problems.push(`πακέτο χρέωσης ως κοινό email: «${billing.join(', ')}» — αυτά ζουν στο ${PLANS}`);
}

// 4. Και ο τύπος που τα κρατά, με τις ίδιες τιμές.
const planType = (/export type Plan\s*=\s*([^;]+);/.exec(tpl)?.[1] || '')
  .split('|').map(x => x.trim().replace(/^'|'$/g, '')).filter(Boolean);
if (planType.length) {
  const want = ['free', ...profileTypes].sort().join('|');
  if ([...planType].sort().join('|') !== want)
    problems.push(`ο τύπος Plan του ${TPL} έχει «${planType.join(', ')}» και όφειλε «free, ${profileTypes.join(', ')}»`);
}

if (problems.length) {
  console.error(`✗ το κοινό των email δεν συμφωνεί με τους τύπους προφίλ:\n`);
  for (const p of problems) console.error(`  · ${p}`);
  console.error(`
  Το πεδίο «plan» των email κρατά ΤΥΠΟ ΠΡΟΦΙΛ. Το πακέτο χρέωσης
  (${planIds.join(', ')}) δεν μπαίνει ποτέ εκεί: θα τύπωνε «undefined»
  μέσα σε επιστολή προς πελάτη.
`);
  process.exit(1);
}
console.log(`✓ το κοινό των email είναι «free, ${profileTypes.join(', ')}», χωρίς πακέτα χρέωσης`);
