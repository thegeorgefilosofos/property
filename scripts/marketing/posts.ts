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

function card(o: TaxObligation, days: number): string {
  const c = countdown(days);
  const numeric = /^\d+$/.test(c.big);
  // Η ΜΠΑΡΑ ΕΙΝΑΙ Ο ΜΕΤΡΗΤΗΣ, και είναι ο τρόπος που η ίδια η εφαρμογή δείχνει
  // πρόοδο. Γεμίζει όσο πλησιάζει η προθεσμία, μέσα στον ορίζοντα των 45 ημερών.
  const fill = Math.max(4, Math.min(100, Math.round((1 - days / MAX_DAYS) * 100)));
  return `<!doctype html><html lang="el"><head><meta charset="utf-8">
<style>
  @font-face{font-family:Inter;src:url("${FONT_DIR}/inter-greek.woff2") format("woff2");font-weight:100 900;font-display:block}
  @font-face{font-family:Inter;src:url("${FONT_DIR}/inter-latin.woff2") format("woff2");font-weight:100 900;font-display:block}
  @font-face{font-family:"Roboto Mono";src:url("${FONT_DIR}/robotomono-greek.woff2") format("woff2");font-weight:100 700;font-display:block}
  @font-face{font-family:"Roboto Mono";src:url("${FONT_DIR}/robotomono-latin.woff2") format("woff2");font-weight:100 700;font-display:block}

  /* Τα ΙΔΙΑ tokens με το app/globals.css, φωτεινό θέμα. Καμία δεύτερη παλέτα. */
  :root{
    --bg-base:#f8f9fa; --bg-surface:#ffffff; --bg-elevated:#f1f3f4;
    --accent:#1560d4; --on-tone:#ffffff;
    --text-primary:#202124; --text-secondary:#5f6368; --text-tertiary:#63686d;
    --border-subtle:#e8eaed; --border-default:#dadce0;
  }
  *{box-sizing:border-box;margin:0}
  body{width:${W}px;height:${H}px;background:var(--bg-base);color:var(--text-primary);
       font-family:Inter,system-ui,sans-serif;padding:64px;display:flex}

  /* Η κάρτα: ίδια γωνία (14) και ίδιο περίγραμμα με κάθε κάρτα της εφαρμογής,
     σε κλίμακα ώστε να διαβάζεται σε τηλέφωνο. */
  .card{flex:1;background:var(--bg-surface);border:2px solid var(--border-subtle);
        border-radius:42px;padding:76px 72px;display:flex;flex-direction:column}

  .brand{display:flex;align-items:center;gap:20px}
  .brand .tile{width:64px;height:64px;border-radius:19px;background:var(--accent);
       color:var(--on-tone);display:flex;align-items:center;justify-content:center;
       font-size:33px;font-weight:800;line-height:1;letter-spacing:-0.02em}
  .brand .name{font-size:30px;font-weight:600;color:var(--text-secondary);letter-spacing:-0.01em}

  .mid{flex:1;display:flex;flex-direction:column;justify-content:center;gap:26px}
  .eyebrow{font-family:"Roboto Mono",monospace;font-size:23px;letter-spacing:0.14em;
           color:var(--text-tertiary)}
  .count{display:flex;align-items:baseline;gap:20px}
  .count .n{font-size:${numeric ? '250px' : '120px'};font-weight:800;line-height:0.84;
            letter-spacing:-0.05em;color:var(--accent);font-variant-numeric:tabular-nums}
  .count .u{font-size:40px;font-weight:500;color:var(--text-secondary);padding-bottom:16px}

  /* Ο μετρητής ως μπάρα: το ιδίωμα προόδου της εφαρμογής. */
  .bar{height:14px;border-radius:100px;background:var(--border-subtle);overflow:hidden}
  .bar i{display:block;height:100%;width:${fill}%;background:var(--accent);border-radius:100px}

  h1{font-size:62px;font-weight:700;line-height:1.14;letter-spacing:-0.02em;text-wrap:balance}
  .when{font-size:34px;color:var(--text-secondary)}

  .foot{display:flex;align-items:flex-end;justify-content:space-between;gap:28px;
        border-top:2px solid var(--border-subtle);padding-top:30px}
  .src{font-family:"Roboto Mono",monospace;font-size:19px;line-height:1.5;
       color:var(--text-tertiary);max-width:640px;word-break:break-all}
  .noa{width:72px;height:72px;border-radius:21px;background:var(--accent);color:var(--on-tone);
       display:flex;align-items:center;justify-content:center;font-size:37px;font-weight:800;
       line-height:1;letter-spacing:-0.02em;flex:none}
</style></head><body>
  <div class="card">
    <div class="brand"><div class="tile">P</div><div class="name">Property OS</div></div>
    <div class="mid">
      <div class="eyebrow">ΠΡΟΘΕΣΜΙΑ ΓΙΑ ΙΔΙΟΚΤΗΤΕΣ</div>
      <div class="count"><span class="n">${c.big}</span><span class="u">${numeric ? c.small : ''}</span></div>
      <div class="bar"><i></i></div>
      <h1>${o.title}</h1>
      <div class="when">${dateGr(o.date)}${o.confidence === 'announced' ? ' (αναμένεται)' : ''}</div>
    </div>
    <div class="foot">
      <div class="src">${o.official_url}</div>
      <div class="noa">Ν</div>
    </div>
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
