// ═══════════════════════════════════════════════════════════════════════════
// ΟΙ ΑΝΑΡΤΗΣΕΙΣ ΒΓΑΙΝΟΥΝ ΑΠΟ ΤΟ ΠΡΟΪΟΝ, ΟΧΙ ΑΠΟ ΕΜΠΝΕΥΣΗ
// ─────────────────────────────────────────────────────────────────────────
// ΓΙΑΤΙ ΥΠΑΡΧΕΙ. Το σχέδιο περιεχομένου λέει «μία ανάρτηση την ημέρα». Ο μόνος
// τρόπος να μη σταματήσει στον δεύτερο μήνα είναι να ΜΗ ΓΡΑΦΕΤΑΙ τίποτα από το
// μηδέν. Τρεις πηγές που υπάρχουν ήδη μέσα στην εφαρμογή:
//
//   ΤΟ ΦΟΡΟΛΟΓΙΚΟ ΗΜΕΡΟΛΟΓΙΟ  →  ο μετρητής προθεσμίας
//   Η ΚΛΙΜΑΚΑ ΤΟΥ ΦΟΡΟΥ       →  το λάθος που κοστίζει, με ΠΡΑΓΜΑΤΙΚΗ αριθμητική
//   ΟΙ ΑΛΛΑΓΕΣ ΝΟΜΟΘΕΣΙΑΣ     →  «το λέει ο νόμος», με τη νομική βάση του
//
// ── ΓΙΑΤΙ ΤΑ ΝΟΥΜΕΡΑ ΔΕΝ ΓΡΑΦΟΝΤΑΙ ΜΕ ΤΟ ΧΕΡΙ ────────────────────────────
// Στο πρώτο σχέδιο περιεχομένου έγραψα «ενοίκιο 9.600 €, χάνεις 480 € τον
// χρόνο». ΛΑΘΟΣ: τα 480 € είναι η έκπτωση που χάνεται, όχι ο φόρος. Ο φόρος
// είναι 15% αυτής, δηλαδή 72 €. Η ίδια συνάρτηση που υπολογίζει τον φόρο μέσα
// στην εφαρμογή τον υπολογίζει και εδώ, και τέτοιο λάθος δεν ξαναγράφεται.
//
// Σε φορολογικό περιεχόμενο, ένα λάθος νούμερο σβήνει την εμπιστοσύνη όλου του
// λογαριασμού. Δεν είναι λεπτομέρεια· είναι ολόκληρο το χαρτί που παίζουμε.
//
// ΧΡΗΣΗ:  npm run posts            (όλες οι μορφές)
//         npx tsx scripts/marketing/posts.ts 2026-09-01
// ═══════════════════════════════════════════════════════════════════════════
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { taxObligationsHorizon, type TaxObligation, type PropertyTaxProfile } from '../../lib/tax/greekTaxCalendar';
import { REGULATORY_UPDATES_2026, type RegulatoryUpdate } from '../../lib/accounting/updates2026';
import { rentalIncomeTax, RENTAL_TAX_BRACKETS_2026, marginalRate } from '../../lib/billing/greekTax';
import { presumptiveDeductionRate } from '../../lib/billing/consolidate';
import { MYAADE, AADE_HOME } from '../../lib/tax/aade';
import { athensToday, daysUntil } from '../../lib/core/time';
import { MONTHS_GEN } from '../../lib/core/months';
import { fe } from '../../lib/core/format';
import { askCta } from '../../lib/assistant/identity';
import { page, clip, sentenceClip, caps, W, H } from './shell';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const OUT = join(process.cwd(), 'docs/marketing/posts');
const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const today = process.argv[2] || athensToday();

/**
 * Πόσο μακριά βλέπει ο μετρητής.
 *
 * ΕΝΑΣ ΜΕΤΡΗΤΗΣ 188 ΗΜΕΡΩΝ ΔΕΝ ΕΙΝΑΙ ΕΠΕΙΓΟΝ, ΕΙΝΑΙ ΘΟΡΥΒΟΣ. Η μορφή δουλεύει
 * επειδή ο αριθμός πιέζει· σε έξι μήνες δεν πιέζει κανέναν, και μια ανάρτηση που
 * προσποιείται επείγον χωρίς να είναι εκπαιδεύει τον κόσμο να την αγνοεί.
 */
const MAX_DAYS = 45;

/** Το εύρος ισχύος, χωρίς παύλα: η παύλα σε θέση τιμής δεν διαβάζεται. */
const spanGr = (s: string): string => s.replace(/\s*[–—]\s*/g, ' ώς ');

const dateGr = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS_GEN[m - 1]} ${y}`;
};

interface Post { file: string; html: string; note: string; source: string }

// ═══════════════════════════════════════════════════════════════════════════
// ΜΟΡΦΗ 1 · Ο ΜΕΤΡΗΤΗΣ
// ═══════════════════════════════════════════════════════════════════════════

function countdownWords(days: number): { big: string; small: string } {
  if (days === 0) return { big: 'ΣΗΜΕΡΑ', small: '' };
  if (days === 1) return { big: 'ΑΥΡΙΟ', small: '' };
  return { big: String(days), small: 'ημέρες έμειναν' };
}

function countdownPost(o: TaxObligation, days: number): Post {
  const c = countdownWords(days);
  const numeric = /^\d+$/.test(c.big);
  // Η ΜΠΑΡΑ ΕΙΝΑΙ Ο ΜΕΤΡΗΤΗΣ, και είναι ο τρόπος που η ίδια η εφαρμογή δείχνει
  // πρόοδο. Γεμίζει όσο πλησιάζει η προθεσμία, μέσα στον ορίζοντα.
  const fill = Math.max(4, Math.min(100, Math.round((1 - days / MAX_DAYS) * 100)));
  const css = `
    .count{display:flex;align-items:baseline;gap:20px}
    .count .n{font-size:${numeric ? '250px' : '120px'};font-weight:800;line-height:0.84;
              letter-spacing:-0.05em;color:var(--accent);font-variant-numeric:tabular-nums}
    .count .u{font-size:40px;font-weight:500;color:var(--text-secondary);padding-bottom:16px}
    .bar{height:14px;border-radius:100px;background:var(--border-subtle);overflow:hidden}
    .bar i{display:block;height:100%;width:${fill}%;background:var(--accent);border-radius:100px}
    .when{font-size:34px;color:var(--text-secondary)}`;
  const body = `
    <div class="eyebrow">${caps('Προθεσμία για ιδιοκτήτες')}</div>
    <div class="count"><span class="n">${c.big}</span><span class="u">${c.small}</span></div>
    <div class="bar"><i></i></div>
    <h1>${o.title}</h1>
    <div class="when">${dateGr(o.date)}${o.confidence === 'announced' ? ' (αναμένεται)' : ''}</div>`;
  return {
    file: `metritis-${o.id}.png`,
    html: page(body, o.official_url, css),
    note: `${o.title} · ${dateGr(o.date)} · σε ${days} ημέρες · ${o.confidence === 'statutory' ? 'θεσμοθετημένη' : 'αναμένεται'}`,
    source: o.official_url,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ΜΟΡΦΗ 2 · ΤΟ ΛΑΘΟΣ ΠΟΥ ΚΟΣΤΙΖΕΙ
// ─────────────────────────────────────────────────────────────────────────
// Η αριθμητική γίνεται ΜΠΡΟΣΤΑ ΣΤΑ ΜΑΤΙΑ ΤΟΥ ΘΕΑΤΗ, και υπολογίζεται από την
// ίδια συνάρτηση που υπολογίζει τον φόρο μέσα στην εφαρμογή. Καμία στρογγυλή
// «περίπου» εκτίμηση: ή ξέρουμε το νούμερο ή δεν κάνουμε την ανάρτηση.
// ═══════════════════════════════════════════════════════════════════════════

/** Ετήσια ενοίκια που καλύπτουν τυπικά ελληνικά χαρτοφυλάκια, ένα ανά κλιμάκιο. */
const RENT_CASES = [9_600, 14_400, 30_000, 48_000];

function cashRentPost(annualRent: number): Post {
  // Με τράπεζα φορολογείσαι στο 95%, με μετρητά στο 100% (ν.5246/2025). Ο ΙΔΙΟΣ
  // ΚΑΝΟΝΑΣ ΠΟΥ ΤΟ ΚΡΙΝΕΙ ΜΕΣΑ ΣΤΗΝ ΕΦΑΡΜΟΓΗ ΤΟ ΚΡΙΝΕΙ ΚΑΙ ΕΔΩ: το «0,95»
  // γραμμένο με το χέρι θα ζούσε στο μάρκετινγκ και μετά την επόμενη αλλαγή του
  // νόμου, λέγοντας κάτι που η εφαρμογή δεν λέει πια.
  const taxable = (viaBank: boolean): number => annualRent * (1 - presumptiveDeductionRate(viaBank));
  const bank = rentalIncomeTax(taxable(true), RENTAL_TAX_BRACKETS_2026);
  const cash = rentalIncomeTax(taxable(false), RENTAL_TAX_BRACKETS_2026);
  const diff = Math.round((cash - bank) * 100) / 100;
  const rate = Math.round(marginalRate(annualRent, RENTAL_TAX_BRACKETS_2026) * 100);
  const css = `
    .rows{display:flex;flex-direction:column;gap:0}
    .r{display:flex;align-items:baseline;justify-content:space-between;gap:24px;
       padding:22px 0;border-bottom:2px solid var(--border-subtle)}
    .r:last-child{border-bottom:0}
    .r .k{font-size:32px;color:var(--text-secondary)}
    .r .v{font-size:38px;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:-0.02em}
    .r.big{padding-top:30px}
    .r.big .k{font-size:34px;color:var(--text-primary);font-weight:600}
    .r.big .v{font-size:76px;font-weight:800;color:var(--accent);letter-spacing:-0.04em}`;
  const body = `
    <div class="eyebrow">${caps('Το λάθος που κοστίζει')}</div>
    <h1>Παίρνεις το ενοίκιο σε μετρητά</h1>
    <div class="say">Σε ετήσιο ενοίκιο <b>${fe(annualRent)}</b>, με οριακό συντελεστή ${rate}%.</div>
    <div class="rows">
      <div class="r"><span class="k">Φόρος με κατάθεση</span><span class="v">${fe(bank)}</span></div>
      <div class="r"><span class="k">Φόρος με μετρητά</span><span class="v">${fe(cash)}</span></div>
      <div class="r big"><span class="k">Σου κοστίζει τον χρόνο</span><span class="v">${fe(diff)}</span></div>
    </div>
    <div class="chip">ν.5246/2025 · από 1/1/2026</div>`;
  return {
    file: `lathos-metrita-${annualRent}.png`,
    html: page(body, MYAADE, css),
    note: `Ενοίκιο ${fe(annualRent)}: μετρητά αντί κατάθεσης κοστίζουν ${fe(diff)} τον χρόνο (οριακός ${rate}%)`,
    source: MYAADE,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ΜΟΡΦΗ 3 · ΤΟ ΛΕΕΙ Ο ΝΟΜΟΣ, ΟΧΙ ΕΓΩ
// ─────────────────────────────────────────────────────────────────────────
// Η νομική βάση είναι ΜΕΓΑΛΗ στην οθόνη, όχι ψιλά γράμματα. Αυτή η μορφή
// υπάρχει ακριβώς για να αντέχει τη διαφωνία στα σχόλια: όποιος διαφωνεί,
// διαφωνεί με το ΦΕΚ.
// ═══════════════════════════════════════════════════════════════════════════

function lawPost(u: RegulatoryUpdate): Post {
  const title = clip(u.title, 90);
  const say = sentenceClip(u.summary, 330);
  const css = `
    h1{font-size:${title.length > 46 ? 50 : 60}px}
    .say{font-size:${say.length > 240 ? 30 : 34}px}
    .basis{font-size:30px;line-height:1.4;color:var(--text-primary);font-weight:600;
           border-left:8px solid var(--accent);padding-left:26px}`;
  const body = `
    <div class="eyebrow">${caps('Το λέει ο νόμος')}</div>
    <h1>${title}</h1>
    <div class="say">${say}</div>
    <div class="basis">${u.legalBasis}<br>Ισχύς: ${spanGr(u.effective)}</div>`;
  return {
    file: `nomos-${u.id}.png`,
    html: page(body, u.sourceHref || AADE_HOME, css),
    note: `${u.title} · ${u.legalBasis} · ισχύς ${u.effective}`,
    source: u.sourceHref || AADE_HOME,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ΜΟΡΦΗ 4 · ΡΩΤΑ ΤΗ ΝΟΑ
// ─────────────────────────────────────────────────────────────────────────
// Η ερώτηση έρχεται από ΠΡΑΓΜΑΤΙΚΟ σχόλιο και μπαίνει σε αυτό το αρχείο με το
// χέρι. Δεν εφευρίσκεται: μια ψεύτικη ερώτηση διαβάζεται αμέσως ως ψεύτικη, και
// σκοτώνει τη μόνη μορφή που έχει μηδενικό κόστος παραγωγής.
// ═══════════════════════════════════════════════════════════════════════════

interface Ask { id: string; question: string; answer: string; basis: string; source: string }

const ASKS: Ask[] = [
  {
    id: 'kena-3etia',
    question: 'Εχω ένα διαμέρισμα κλειστό δύο χρόνια. Αν το νοικιάσω, πληρώνω φόρο;',
    answer: 'Οχι για τρία χρόνια, αν πληροί τις προϋποθέσεις: κατοικία έως 120 τ.μ. που ήταν κενή ή σε βραχυχρόνια και περνά σε μακροχρόνια μίσθωση.',
    basis: 'Δες τους ακριβείς όρους πριν βασιστείς σε αυτό',
    source: MYAADE,
  },
  {
    id: 'ama-aggelia',
    question: 'Πρέπει να βάζω τον ΑΜΑ σε κάθε αγγελία ή μόνο στο Airbnb;',
    answer: 'Σε κάθε αγγελία, σε κάθε πλατφόρμα, και σε κάθε ανάρτηση που διαφημίζει το ακίνητο. Οχι μόνο εκεί που έγινε η κράτηση.',
    basis: 'Μητρώο Ακινήτων Βραχυχρόνιας Διαμονής',
    source: 'https://www.gov.gr',
  },
];

function askPost(a: Ask): Post {
  const css = `
    .q{font-size:40px;line-height:1.32;font-weight:600;color:var(--text-primary);
       background:var(--bg-elevated);border-radius:28px;padding:34px 38px}
    .a{font-size:36px;line-height:1.4;color:var(--text-secondary)}
    .a b{color:var(--text-primary);font-weight:700}`;
  const body = `
    <div class="eyebrow">${caps(askCta())}</div>
    <div class="q">${clip(a.question, 130)}</div>
    <div class="a">${clip(a.answer, 240)}</div>
    <div class="chip words">${a.basis}</div>`;
  return {
    file: `noa-${a.id}.png`,
    html: page(body, a.source, css),
    note: `Ερώτηση: ${a.question}`,
    source: a.source,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Η ΣΥΛΛΟΓΗ
// ═══════════════════════════════════════════════════════════════════════════

const PROFILES: PropertyTaxProfile[] = ['owner', 'long_term', 'short_term'];

/** Οι προθεσμίες μέσα στον ορίζοντα, μία ανά ΕΙΔΟΣ. */
function upcomingObligations(): Array<{ o: TaxObligation; days: number }> {
  const seen = new Set<string>();
  const kinds = new Set<string>();
  const out: Array<{ o: TaxObligation; days: number }> = [];
  for (const p of PROFILES) {
    for (const o of taxObligationsHorizon(today, p)) {
      if (seen.has(o.id) || kinds.has(o.kind)) continue;
      const days = daysUntil(o.date, new Date(`${today}T12:00:00Z`));
      if (days === null || days < 0 || days > MAX_DAYS) continue;
      seen.add(o.id);
      kinds.add(o.kind);
      out.push({ o, days });
    }
  }
  return out.sort((a, b) => a.days - b.days);
}

const posts: Post[] = [
  ...upcomingObligations().map(({ o, days }) => countdownPost(o, days)),
  ...RENT_CASES.map(cashRentPost),
  // ΜΟΝΟ ΟΣΕΣ ΖΗΤΟΥΝ ΚΙΝΗΣΗ. Το `info` είναι υπόβαθρο, δεν είναι ανάρτηση.
  ...REGULATORY_UPDATES_2026.filter(u => u.severity !== 'info').map(lawPost),
  ...ASKS.map(askPost),
];

mkdirSync(OUT, { recursive: true });

void (async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });

  const index: string[] = [
    `# Αναρτήσεις που παράχθηκαν στις ${today}`, '',
    'Κάθε εικόνα βγήκε από τα δεδομένα της εφαρμογής. **Ελεγξε πριν δημοσιεύσεις**:',
    'το φορολογικό ημερολόγιο σημειώνει ποιες προθεσμίες είναι θεσμοθετημένες και',
    'ποιες αναμένονται, και κάθε ισχυρισμός κουβαλά τη νομική του βάση.', '',
  ];

  for (const p of posts) {
    const pg = await ctx.newPage();
    await pg.setContent(p.html, { waitUntil: 'networkidle' });
    await pg.waitForTimeout(600);
    await pg.screenshot({ path: join(OUT, p.file) });
    await pg.close();
    index.push(`- **${p.file}** · ${p.note}`);
    index.push(`  - πηγή: ${p.source}`);
    console.log(`✓ ${p.file}`);
  }

  await browser.close();
  writeFileSync(join(OUT, 'README.md'), index.join('\n') + '\n');

  const counts = posts.reduce<Record<string, number>>((m, p) => {
    const k = p.file.split('-')[0];
    m[k] = (m[k] || 0) + 1;
    return m;
  }, {});
  console.log(`\n${posts.length} αναρτήσεις στο docs/marketing/posts/`);
  console.log(`  ${Object.entries(counts).map(([k, n]) => `${k}: ${n}`).join(' · ')}`);
})();
