// ═══════════════════════════════════════════════════════════════════════════
// ΟΙ ΑΝΑΡΤΗΣΕΙΣ ΒΓΑΙΝΟΥΝ ΑΠΟ ΤΟ ΠΡΟΪΟΝ, ΟΧΙ ΑΠΟ ΕΜΠΝΕΥΣΗ
// ─────────────────────────────────────────────────────────────────────────
// ΓΙΑΤΙ ΥΠΑΡΧΕΙ. Το σχέδιο περιεχομένου λέει «μία ανάρτηση την ημέρα». Ο μόνος
// τρόπος να μη σταματήσει στον δεύτερο μήνα είναι να ΜΗ ΓΡΑΦΕΤΑΙ τίποτα από το
// μηδέν. Το φορολογικό ημερολόγιο ξέρει ήδη τι λήγει και πότε, με νομική βάση
// και επίσημη πηγή. Αυτό το αρχείο το μετατρέπει σε έτοιμες εικόνες.
//
// ΤΙ ΔΕΝ ΚΑΝΕΙ. Δεν δημοσιεύει, δεν συνδέεται πουθενά, δεν γράφει ισχυρισμό που
// δεν υπάρχει στα δεδομένα. Κάθε εικόνα κουβαλά την πηγή της, ώστε ο έλεγχος
// πριν τη δημοσίευση να είναι δυνατός σε δέκα δευτερόλεπτα.
//
// ΧΡΗΣΗ:  npx tsx scripts/marketing/posts.ts [YYYY-MM-DD]
// ═══════════════════════════════════════════════════════════════════════════
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { taxObligationsHorizon, type TaxObligation, type PropertyTaxProfile } from '../../lib/tax/greekTaxCalendar';
import { athensToday, daysUntil } from '../../lib/core/time';
import { MONTHS_GEN } from '../../lib/core/months';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const OUT = join(process.cwd(), 'docs/marketing/posts');
const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
/** Οι γραμματοσειρές του ίδιου του προϊόντος, από τον δίσκο. Καμία κλήση έξω. */
const FONT_DIR = 'file://' + join(process.cwd(), 'public/fonts');

/** Πόσες αναρτήσεις βγαίνουν σε ένα πέρασμα. Μία εβδομάδα, όχι ένας χρόνος. */
const HOW_MANY = 7;

/**
 * Πόσο μακριά βλέπει ο μετρητής.
 *
 * ΕΝΑΣ ΜΕΤΡΗΤΗΣ 188 ΗΜΕΡΩΝ ΔΕΝ ΕΙΝΑΙ ΕΠΕΙΓΟΝ, ΕΙΝΑΙ ΘΟΡΥΒΟΣ. Η μορφή δουλεύει
 * επειδή ο αριθμός πιέζει· σε έξι μήνες δεν πιέζει κανέναν, και μια ανάρτηση που
 * προσποιείται επείγον χωρίς να είναι εκπαιδεύει τον κόσμο να την αγνοεί. Οταν
 * δεν υπάρχουν αρκετές προθεσμίες μέσα στον ορίζοντα, βγαίνουν λιγότερες
 * αναρτήσεις και το λέμε.
 */
const MAX_DAYS = 45;

/** Το πλαίσιο της κατακόρυφης ανάρτησης. Ιδιο σε Instagram και TikTok. */
const W = 1080, H = 1350;

const today = process.argv[2] || athensToday();

/** Η φράση του χρόνου. Ο αριθμός είναι το θέμα, όχι η διακόσμηση. */
function countdown(days: number): { big: string; small: string } {
  if (days === 0) return { big: 'ΣΗΜΕΡΑ', small: 'Η προθεσμία λήγει σήμερα' };
  if (days === 1) return { big: 'ΑΥΡΙΟ', small: 'Μία ημέρα έμεινε' };
  return { big: String(days), small: days === 2 ? 'ημέρες έμειναν' : 'ημέρες έμειναν' };
}

const dateGr = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS_GEN[m - 1]} ${y}`;
};

/** Πόσο γεμάτος είναι ο δακτύλιος: όσο πλησιάζει η προθεσμία, τόσο κλείνει. */
const ringDash = (days: number): string => {
  const share = Math.max(0.06, Math.min(1, 1 - days / 90));
  const c = 2 * Math.PI * 196;
  return `${(c * share).toFixed(0)} ${(c * (1 - share) + 4).toFixed(0)}`;
};

function card(o: TaxObligation, days: number): string {
  const c = countdown(days);
  const numeric = /^\d+$/.test(c.big);
  return `<!doctype html><html lang="el"><head><meta charset="utf-8">
<style>
  @font-face{font-family:Inter;src:url("${FONT_DIR}/inter-greek.woff2") format("woff2");font-weight:100 900;font-display:block}
  @font-face{font-family:"Roboto Mono";src:url("${FONT_DIR}/robotomono-greek.woff2") format("woff2");font-weight:100 700;font-display:block}
  :root { --paper:#F1F0EC; --ink:#1A1720; --muted:#6B6472; --accent:#4B2E83; --rule:rgba(26,23,32,0.10); }
  *{box-sizing:border-box;margin:0}
  body{width:${W}px;height:${H}px;background:var(--paper);color:var(--ink);
       font-family:Inter,system-ui,sans-serif;
       padding:88px 84px;display:flex;flex-direction:column}
  .main{flex:1;display:flex;flex-direction:column;justify-content:center}
  .eyebrow{font-family:"Roboto Mono",monospace;font-size:24px;letter-spacing:0.18em;color:var(--muted)}
  .count{display:flex;align-items:baseline;gap:22px;margin-top:56px}
  .count .n{font-family:"Roboto Mono",monospace;font-weight:500;
            font-size:${numeric ? '300px' : '150px'};line-height:0.86;letter-spacing:-0.04em;color:var(--accent)}
  .count .u{font-family:Inter,sans-serif;font-size:46px;color:var(--muted);padding-bottom:22px}
  h1{font-family:Inter,sans-serif;font-weight:700;font-size:74px;line-height:1.1;
     letter-spacing:-0.01em;margin-top:44px;text-wrap:balance}
  .when{font-size:38px;color:var(--muted);margin-top:22px}
  .foot{display:flex;align-items:center;justify-content:space-between;gap:30px;
        border-top:3px solid var(--ink);padding-top:30px}
  .src{font-family:"Roboto Mono",monospace;font-size:19px;line-height:1.5;color:var(--muted);max-width:640px;word-break:break-all}
  svg{width:118px;height:118px;flex:none}
</style></head><body>
  <div class="main">
    <div class="eyebrow">ΠΡΟΘΕΣΜΙΑ ΓΙΑ ΙΔΙΟΚΤΗΤΕΣ</div>
    <div class="count"><span class="n">${c.big}</span><span class="u">${numeric ? c.small : ''}</span></div>
    <h1>${o.title}</h1>
    <div class="when">${dateGr(o.date)}${o.confidence === 'announced' ? ' (αναμένεται)' : ''}</div>
  </div>
  <div class="foot">
    <div class="src">${o.official_url}</div>
    <svg viewBox="0 0 512 512">
      <defs><clipPath id="nc"><circle cx="256" cy="256" r="256"/></clipPath></defs>
      <g clip-path="url(#nc)">
        <rect width="512" height="512" fill="#FFFFFF"/>
        <circle cx="256" cy="256" r="196" fill="none" stroke="var(--rule)" stroke-width="20"/>
        <circle cx="256" cy="256" r="196" fill="none" stroke="var(--accent)" stroke-width="20"
                stroke-linecap="round" stroke-dasharray="${ringDash(days)}" transform="rotate(-90 256 256)"/>
        <text x="256" y="262" text-anchor="middle" dominant-baseline="central"
              font-family="Inter, sans-serif" font-size="230" font-weight="700" fill="var(--ink)">Ν</text>
      </g>
    </svg>
  </div>
</body></html>`;
}

const PROFILES: PropertyTaxProfile[] = ['owner', 'long_term', 'short_term'];

// ΜΙΑ ΓΡΑΜΜΗ ΑΝΑ ΥΠΟΧΡΕΩΣΗ, ΟΧΙ ΤΡΕΙΣ. Η ίδια προθεσμία εμφανίζεται σε
// περισσότερα από ένα προφίλ· μια ανάρτηση ανά προφίλ θα ήταν η ίδια εικόνα
// τρεις φορές στο ίδιο προφίλ κοινωνικού δικτύου.
const seen = new Set<string>();
const kinds = new Set<string>();
const upcoming: Array<{ o: TaxObligation; days: number }> = [];
for (const p of PROFILES) {
  for (const o of taxObligationsHorizon(today, p)) {
    if (seen.has(o.id) || kinds.has(o.kind)) continue;
    const days = daysUntil(o.date, new Date(`${today}T12:00:00Z`));
    if (days === null || days < 0 || days > MAX_DAYS) continue;
    seen.add(o.id);
    kinds.add(o.kind);
    upcoming.push({ o, days });
  }
}
upcoming.sort((a, b) => a.days - b.days);
const chosen = upcoming.slice(0, HOW_MANY);

mkdirSync(OUT, { recursive: true });

void (async () => {
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });

const index: string[] = [`# Αναρτήσεις που παράχθηκαν στις ${today}`, '',
  'Κάθε εικόνα βγήκε από το `lib/tax/greekTaxCalendar.ts`. **Ελεγξε την ημερομηνία',
  'στην επίσημη πηγή πριν δημοσιεύσεις**: το ημερολόγιο σημειώνει ποιες είναι',
  'θεσμοθετημένες και ποιες απλώς αναμένονται.', ''];

for (const { o, days } of chosen) {
  const page = await ctx.newPage();
  await page.setContent(card(o, days), { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const file = `${o.id}.png`;
  await page.screenshot({ path: join(OUT, file) });
  await page.close();
  index.push(`- **${file}** · ${o.title} · ${dateGr(o.date)} · σε ${days} ημέρες · ${o.confidence === 'statutory' ? 'θεσμοθετημένη' : 'αναμένεται'}`);
  index.push(`  - πηγή: ${o.official_url}`);
  console.log(`✓ ${file}  (${days} ημέρες)`);
}

await browser.close();
writeFileSync(join(OUT, 'README.md'), index.join('\n') + '\n');
console.log(`\n${chosen.length} αναρτήσεις στο docs/marketing/posts/`);
if (chosen.length < HOW_MANY) {
  console.log(`  (μόνο ${chosen.length} προθεσμίες μέσα στις επόμενες ${MAX_DAYS} ημέρες· οι υπόλοιπες αναρτήσεις της εβδομάδας βγαίνουν από τις άλλες μορφές)`);
}
})();
