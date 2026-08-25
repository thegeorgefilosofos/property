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
// στην εφαρμογή τον υπολογίζει και εδώ και τέτοιο λάθος δεν ξαναγράφεται.
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
import { askCta, ASSISTANT_NAME } from '../../lib/assistant/identity';
import { page, clip, sentenceClip, caps, sourceName, W, H } from './shell';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const OUT = join(process.cwd(), 'docs/marketing/posts');
// Η διαδρομή ρωτιέται, δεν γράφεται: βλ. scripts/lib/chrome.mjs.
const { chromePath } = require('../lib/chrome.mjs');
const CHROME: string = chromePath();
const today = process.argv[2] || athensToday();

/**
 * Πόσο μακριά βλέπει ο μετρητής.
 *
 * ΕΝΑΣ ΜΕΤΡΗΤΗΣ 188 ΗΜΕΡΩΝ ΔΕΝ ΕΙΝΑΙ ΕΠΕΙΓΟΝ, ΕΙΝΑΙ ΘΟΡΥΒΟΣ. Η μορφή δουλεύει
 * επειδή ο αριθμός πιέζει· σε έξι μήνες δεν πιέζει κανέναν και μια ανάρτηση που
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

/**
 * Το ποσό σε μέγεθος αφίσας: το σύμβολο υποχωρεί, το νούμερο μένει.
 *
 * Στα 300px το «€» στο ίδιο μέγεθος με τα ψηφία τραβά το βλέμμα σε λάθος
 * σημείο — το βλέμμα πρέπει να πέσει στο ΠΟΣΟ. Το σύμβολο μένει, γιατί χωρίς
 * αυτό ο αριθμός δεν σημαίνει τίποτα· απλώς παίρνει τη θέση που του αναλογεί.
 */
function bigEuro(n: number): string {
  const t = fe(n);
  const i = t.lastIndexOf(' ');
  return `${t.slice(0, i)}<small>${t.slice(i)}</small>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// ΜΟΡΦΗ 1 · Ο ΜΕΤΡΗΤΗΣ
// ─────────────────────────────────────────────────────────────────────────
// ΣΤΑΣΗ: ο αριθμός πάνω, η υποχρέωση κάτω και ανάμεσά τους αέρας. Ο αριθμός
// δεν εξηγείται· φαίνεται. Οποιος τον δει και δεν ξέρει τι είναι, θα διαβάσει
// το κάτω μέρος — και αυτή ακριβώς η κίνηση του βλέμματος είναι η ανάρτηση.
// ═══════════════════════════════════════════════════════════════════════════

function countdownPost(o: TaxObligation, days: number): Post {
  // ΜΗΔΕΝ ΚΑΙ ΕΝΑ ΔΕΝ ΓΡΑΦΟΝΤΑΙ ΜΕ ΨΗΦΙΟ. «ΣΗΜΕΡΑ» χτυπά πιο δυνατά από ένα
  // «0» και το «1 ημέρα» διαβάζεται ως λάθος πληκτρολόγησης.
  const word = days === 0 ? 'ΣΗΜΕΡΑ' : days === 1 ? 'ΑΥΡΙΟ' : null;
  const css = `
    .n{font-size:${word ? 190 : 400}px;${word ? 'letter-spacing:-0.03em;' : ''}}
    .unit{font-family:"Roboto Mono",monospace;font-size:26px;font-weight:500;
          letter-spacing:0.22em;color:var(--muted);margin-top:34px}
    h1{font-size:62px;margin-top:auto}
    .when{font-family:"Roboto Mono",monospace;font-size:28px;font-weight:500;
          letter-spacing:0.06em;color:var(--accent);margin:26px 0 44px}`;
  const soon = o.confidence === 'announced' ? 'αναμένεται' : '';
  const when = word ? soon : [dateGr(o.date), soon].filter(Boolean).join(' · ');
  const stage = `
    <div class="huge n">${word || days}</div>
    <div class="unit">${word ? caps(dateGr(o.date)) : 'ΗΜΕΡΕΣ ΕΜΕΙΝΑΝ'}</div>
    <h1>${o.title}</h1>
    ${when ? `<div class="when">${when}</div>` : ''}`;
  return {
    file: `metritis-${o.id}.png`,
    html: page(caps('Προθεσμία'), stage, sourceName(o.official_url), css),
    note: `${o.title} · ${dateGr(o.date)} · σε ${days} ημέρες · ${o.confidence === 'statutory' ? 'θεσμοθετημένη' : 'αναμένεται'}`,
    source: o.official_url,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ΜΟΡΦΗ 2 · ΤΟ ΛΑΘΟΣ ΠΟΥ ΚΟΣΤΙΖΕΙ
// ─────────────────────────────────────────────────────────────────────────
// ΣΤΑΣΗ: η απάντηση πρώτη, η απόδειξη δεύτερη. Η πρώτη εκδοχή ξεκινούσε με
// «Παίρνεις το ενοίκιο σε μετρητά» και κατέληγε στο ποσό — δηλαδή ζητούσε
// από τον θεατή να διαβάσει τρεις γραμμές πριν πάρει τον λόγο να μείνει.
// Στο χρονολόγιο δεν τον παίρνει: φεύγει στη δεύτερη.
//
// Η αριθμητική μένει ΟΛΟΚΛΗΡΗ από κάτω, γιατί χωρίς αυτήν το ποσό είναι
// ισχυρισμός· και υπολογίζεται από τη μηχανή φόρου του ίδιου του προϊόντος.
// ═══════════════════════════════════════════════════════════════════════════

/** Ετήσια ενοίκια που καλύπτουν τυπικά ελληνικά χαρτοφυλάκια, ένα ανά κλιμάκιο. */
const RENT_CASES = [9_600, 14_400, 30_000, 48_000];

function cashRentPost(annualRent: number): Post {
  // Με τράπεζα φορολογείσαι στο 95%, με μετρητά στο 100% (ν.5246/2025). Ο ΙΔΙΟΣ
  // ΚΑΝΟΝΑΣ ΠΟΥ ΤΟ ΚΡΙΝΕΙ ΜΕΣΑ ΣΤΗΝ ΕΦΑΡΜΟΓΗ ΤΟ ΚΡΙΝΕΙ ΚΑΙ ΕΔΩ: το «0,95»
  // γραμμένο με το χέρι θα ζούσε στο μάρκετινγκ και μετά την επόμενη αλλαγή
  // του νόμου, λέγοντας κάτι που η εφαρμογή δεν λέει πια.
  const taxable = (viaBank: boolean): number => annualRent * (1 - presumptiveDeductionRate(viaBank));
  const bank = rentalIncomeTax(taxable(true), RENTAL_TAX_BRACKETS_2026);
  const cash = rentalIncomeTax(taxable(false), RENTAL_TAX_BRACKETS_2026);
  const diff = Math.round((cash - bank) * 100) / 100;
  const rate = Math.round(marginalRate(annualRent, RENTAL_TAX_BRACKETS_2026) * 100);
  const css = `
    .n{font-size:${diff >= 1000 ? 205 : 245}px}
    .unit{font-family:"Roboto Mono",monospace;font-size:26px;font-weight:500;
          letter-spacing:0.22em;color:var(--muted);margin-top:34px}
    .tail{margin-top:auto;margin-bottom:52px}
    h1{font-size:54px;max-width:900px}
    .proof{margin-top:44px;display:flex;flex-direction:column}
    .p{display:flex;align-items:baseline;justify-content:space-between;gap:24px;padding:22px 0}
    .p + .p{border-top:2px solid var(--rule)}
    .p .k{font-size:31px;color:var(--muted)}
    .p .v{font-family:"Roboto Mono",monospace;font-size:33px;font-weight:500;
          font-variant-numeric:tabular-nums;letter-spacing:-0.01em}
    .cite{font-family:"Roboto Mono",monospace;font-size:21px;font-weight:500;
          letter-spacing:0.06em;color:var(--muted);margin-top:18px}`;
  const stage = `
    <div class="huge n">${bigEuro(diff)}</div>
    <div class="unit">${caps('Τον χρόνο')}</div>
    <div class="tail">
      <h1>Ενοίκιο ${fe(annualRent)} που εισπράττεται σε μετρητά</h1>
      <div class="proof">
        <div class="p"><span class="k">Φόρος με κατάθεση</span><span class="v">${fe(bank)}</span></div>
        <div class="p"><span class="k">Φόρος με μετρητά</span><span class="v">${fe(cash)}</span></div>
      </div>
      <div class="cite">ν.5246/2025 · από 1/1/2026 · οριακός συντελεστής ${rate}%</div>
    </div>`;
  return {
    file: `lathos-metrita-${annualRent}.png`,
    html: page(caps('Το λάθος που κοστίζει'), stage, sourceName(MYAADE), css),
    note: `Ενοίκιο ${fe(annualRent)}: μετρητά αντί κατάθεσης κοστίζουν ${fe(diff)} τον χρόνο (οριακός ${rate}%)`,
    source: MYAADE,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ΜΟΡΦΗ 3 · ΤΟ ΛΕΕΙ Ο ΝΟΜΟΣ, ΟΧΙ ΕΓΩ
// ─────────────────────────────────────────────────────────────────────────
// ΣΤΑΣΗ: ετυμηγορία. Ο τίτλος μεγάλος, ΜΙΑ πρόταση από κάτω και η νομική
// βάση κάτω κάτω με τον τόνο πάνω της. Η πρώτη εκδοχή έβαζε 330 χαρακτήρες
// περίληψης — εννιά σειρές, που στο χρονολόγιο κανείς δεν διαβάζει.
//
// Η μία πρόταση δεν είναι σύνοψη της σύνοψης: είναι η ΠΡΩΤΗ πρόταση της
// πηγής, δηλαδή ο κανόνας ο ίδιος. Ο,τι ακολουθεί είναι εξαιρέσεις και οι
// εξαιρέσεις ανήκουν στη λεζάντα και στα σχόλια, όχι στην εικόνα.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ΤΟ MONO ΕΙΝΑΙ ΓΙΑ ΤΟΝ ΑΡΙΘΜΟ ΤΟΥ ΝΟΜΟΥ, ΟΧΙ ΓΙΑ ΤΗ ΦΡΑΣΗ ΔΙΠΛΑ ΤΟΥ.
 *
 * Το «ν.5073/2023» κερδίζει από τα σταθερά πλάτη — είναι κωδικός και θέλει να
 * διαβάζεται ψηφίο ψηφίο. Το «και εφαρμοστικές αποφάσεις» στο ίδιο μέγεθος
 * mono τυλίγεται σε δεύτερη σειρά και μοιάζει με σπασμένο στοιχείο. Χωρίζονται:
 * ο κωδικός μπροστά, η φράση από κάτω και μικρότερη.
 */
function citation(basis: string): { code: string; rest: string } {
  const m = basis.match(/^((?:[νΝ]\.|ΠΔ\s*|ΚΥΑ\s*)[\d./]+)\s*(.*)$/);
  return m ? { code: m[1], rest: m[2].trim() } : { code: '', rest: basis };
}

function lawPost(u: RegulatoryUpdate): Post {
  const title = clip(u.title, 90);
  const say = sentenceClip(u.summary, 230);
  const cite = citation(u.legalBasis);
  const css = `
    h1{font-size:${title.length > 46 ? 66 : 76}px}
    .say{font-size:${say.length > 150 ? 32 : 36}px;line-height:1.44;color:var(--muted);
         margin-top:38px;max-width:900px}
    .basis{margin-top:auto;margin-bottom:44px}
    .basis .law{font-family:"Roboto Mono",monospace;font-size:46px;font-weight:500;
                letter-spacing:-0.01em;color:var(--accent);line-height:1.2}
    .basis .of{font-size:30px;color:var(--ink);margin-top:10px}
    .basis .from{font-family:"Roboto Mono",monospace;font-size:26px;font-weight:500;
                 letter-spacing:0.06em;color:var(--muted);margin-top:16px}`;
  const stage = `
    <h1>${title}</h1>
    <div class="say">${say}</div>
    <div class="basis">
      ${cite.code ? `<div class="law">${cite.code}</div>` : ''}
      ${cite.rest ? `<div class="of">${cite.code ? cite.rest : caps(cite.rest)}</div>` : ''}
      <div class="from">Ισχύς: ${spanGr(u.effective)}</div>
    </div>`;
  return {
    file: `nomos-${u.id}.png`,
    html: page(caps('Το λέει ο νόμος'), stage, sourceName(u.sourceHref || AADE_HOME), css),
    note: `${u.title} · ${u.legalBasis} · ισχύς ${u.effective}`,
    source: u.sourceHref || AADE_HOME,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ΜΟΡΦΗ 4 · ΡΩΤΑ ΤΗ ΝΟΑ
// ─────────────────────────────────────────────────────────────────────────
// ΣΤΑΣΗ: διάλογος. Η ερώτηση στο πλήρες πλάτος, η απάντηση σε εσοχή. Η
// ασυμμετρία ΕΙΝΑΙ το νόημα: δύο φωνές, όχι μία με υπότιτλο.
//
// Η ερώτηση έρχεται από ΠΡΑΓΜΑΤΙΚΟ σχόλιο και μπαίνει εδώ με το χέρι. Δεν
// εφευρίσκεται: μια ψεύτικη ερώτηση διαβάζεται αμέσως ως ψεύτικη και σκοτώνει
// τη μόνη μορφή που έχει μηδενικό κόστος παραγωγής.
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
    answer: 'Σε κάθε αγγελία, σε κάθε πλατφόρμα και σε κάθε ανάρτηση που διαφημίζει το ακίνητο. Οχι μόνο εκεί που έγινε η κράτηση.',
    basis: 'Μητρώο Ακινήτων Βραχυχρόνιας Διαμονής',
    source: 'https://www.gov.gr',
  },
];

function askPost(a: Ask): Post {
  const q = clip(a.question, 130);
  const css = `
    .who{font-family:"Roboto Mono",monospace;font-size:24px;font-weight:500;
         letter-spacing:0.2em;color:var(--muted);margin-bottom:26px}
    .who.noa{color:var(--accent)}
    .q{font-size:${q.length > 72 ? 56 : 64}px;font-weight:800;letter-spacing:-0.028em;
       line-height:1.14;text-wrap:balance}
    .answer{margin-top:auto}
    .a{font-size:34px;line-height:1.46;color:var(--muted)}
    .answer{margin-bottom:44px}
    .basis{margin-top:30px;font-size:24px;color:var(--muted)}`;
  const stage = `
    <div class="who">${caps('Ερώτηση')}</div>
    <div class="q">${q}</div>
    <div class="answer spine">
      <div class="who noa">${caps(ASSISTANT_NAME)}</div>
      <div class="a">${clip(a.answer, 240)}</div>
      <div class="basis">${a.basis}</div>
    </div>`;
  return {
    file: `noa-${a.id}.png`,
    html: page(caps(askCta()), stage, sourceName(a.source), css),
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
    'ποιες αναμένονται και κάθε ισχυρισμός κουβαλά τη νομική του βάση.', '',
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
