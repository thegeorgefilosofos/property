// ═══════════════════════════════════════════════════════════════════════════
// ΜΟΡΦΗ 5 · ΠΡΙΝ ΚΑΙ ΜΕΤΑ, ΧΩΡΙΣ ΛΟΓΙΑ
// ─────────────────────────────────────────────────────────────────────────
// Οι τέσσερις πρώτες μορφές είναι εικόνες: φτιάχνονται από δεδομένα και δεν
// δείχνουν προϊόν. Αυτή είναι η μόνη που δείχνει ΤΗΝ ΕΦΑΡΜΟΓΗ, και γι' αυτό
// είναι και η μόνη που δεν επιτρέπεται να «στηθεί».
//
// ── ΤΙ ΚΑΤΑΓΡΑΦΕΤΑΙ ΚΑΙ ΓΙΑΤΙ ΑΥΤΟ ────────────────────────────────────────
// Καταγράφεται η ΠΡΑΓΜΑΤΙΚΗ σελίδα, με πραγματικές πληκτρολογήσεις, στον
// πραγματικό περιηγητή. Καμία κίνηση δεν είναι ζωγραφισμένη και κανένας
// αριθμός δεν είναι γραμμένος από πάνω: ο,τι βλέπει ο θεατής το παράγει ο
// ίδιος κώδικας που θα τρέξει και στο δικό του τηλέφωνο.
//
// ΤΑ ΤΡΙΑ ΕΡΓΑΛΕΙΑ ΕΙΝΑΙ ΔΗΜΟΣΙΑ: δεν χρειάζονται λογαριασμό, άρα δεν
// χρειάζονται ούτε ψεύτικα δεδομένα ούτε λογαριασμό-βιτρίνα. Ο θεατής μπορεί
// να ανοίξει την ίδια διεύθυνση και να δει το ίδιο πράγμα, και αυτό είναι
// ολόκληρη η αξία της μορφής.
//
// ── ΤΙ ΛΕΙΠΕΙ, ΚΑΙ ΔΕΝ ΤΟ ΦΤΙΑΧΝΕΙ ΚΩΔΙΚΑΣ ───────────────────────────────
// Το «ΠΡΙΝ» του σχεδίου (ο φάκελος με τα σαράντα χαρτιά) είναι γύρισμα με
// τηλέφωνο, πάνω σε αληθινά χαρτιά. ΔΕΝ παράγεται εδώ και δεν προσομοιώνεται:
// μια ψεύτικη στοίβα χαρτιά σε ένα βίντεο που υπόσχεται «χωρίς λόγια» είναι
// ακριβώς το είδος του ψέματος που δεν κάνουμε. Το docs/marketing/reels/
// README.md λέει τι λείπει και ποιος το γυρίζει.
//
// ── ΠΡΟΫΠΟΘΕΣΗ ────────────────────────────────────────────────────────────
// Ζωντανός server, όπως και στα e2e:
//     npm run dev            (σε άλλο τερματικό)
//     npx tsx scripts/marketing/reel.ts
// ═══════════════════════════════════════════════════════════════════════════
import { mkdirSync, writeFileSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { POLICY_VERSION } from '../../lib/legal/identity';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const OUT = join(process.cwd(), 'docs/marketing/reels');
const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.E2E_BASE || 'http://localhost:3000';

/** Κατακόρυφο, όπως το κρατάει ο κόσμος το τηλέφωνο. Ιδιο με τις εικόνες. */
const VIEW = { width: 1080, height: 1350 };

/**
 * Ο ρυθμός. ΕΝΑ ΒΙΝΤΕΟ ΠΟΥ ΠΛΗΚΤΡΟΛΟΓΕΙ ΣΕ ΤΑΧΥΤΗΤΑ ΜΗΧΑΝΗΣ ΔΕΝ ΔΙΑΒΑΖΕΤΑΙ.
 * Ο θεατής χρειάζεται να προλάβει να δει ΠΟΥ πάει το βλέμμα: στο πεδίο όσο
 * γράφεται, στον αριθμό μόλις αλλάξει.
 */
const TYPE_MS = 110;
const BEAT = 900;
const HOLD = 2200;

interface Scene {
  file: string;
  path: string;
  what: string;
  play: (p: Page) => Promise<void>;
}

/** Ο,τι χρησιμοποιούμε από τη σελίδα του Playwright, χωρίς τους τύπους του. */
interface Locator {
  click(): Promise<void>;
  fill(v: string): Promise<void>;
  pressSequentially(v: string, o?: { delay: number }): Promise<void>;
  nth(i: number): Locator;
  first(): Locator;
  scrollIntoViewIfNeeded(): Promise<void>;
}
interface Page {
  goto(url: string, o?: { waitUntil: string }): Promise<unknown>;
  locator(sel: string, o?: { hasText: string }): Locator;
  getByRole(role: string, o?: { name: RegExp }): Locator;
  waitForTimeout(ms: number): Promise<void>;
  close(): Promise<void>;
  video(): { path(): Promise<string> };
}

/** Πληκτρολογεί σαν άνθρωπος: σβήνει ο,τι υπάρχει και γράφει γράμμα γράμμα. */
async function types(l: Locator, value: string): Promise<void> {
  await l.click();
  await l.fill('');
  await l.pressSequentially(value, { delay: TYPE_MS });
}

const SCENES: Scene[] = [
  {
    file: 'foros-enoikion.webm',
    path: '/ypologismos-forou-enoikion',
    what: 'Ενοίκιο 1.250 € τον μήνα, κλίμακα 2026: ο φόρος βγαίνει όσο γράφεις.',
    async play(p) {
      const inputs = p.locator('input');
      await p.waitForTimeout(BEAT);
      await types(inputs.nth(0), '1250');
      await p.waitForTimeout(HOLD);
      await p.getByRole('button', { name: /^2026/ }).click();
      await p.waitForTimeout(HOLD);
    },
  },
  {
    file: 'enfia.webm',
    path: '/ypologismos-enfia',
    what: 'ΕΝΦΙΑ για 120 τ.μ. σε ζώνη 3.200 €: εμβαδόν, ζώνη, όροφος, παλαιότητα.',
    async play(p) {
      const inputs = p.locator('input');
      await p.waitForTimeout(BEAT);
      await types(inputs.nth(0), '120');
      await p.waitForTimeout(BEAT);
      await types(inputs.nth(1), '3200');
      await p.waitForTimeout(HOLD);
      await p.locator('[role="combobox"]').nth(0).click();
      await p.waitForTimeout(500);
      await p.locator('[role="option"]', { hasText: 'Ισόγειο' }).first().click();
      await p.waitForTimeout(HOLD);
    },
  },
  {
    file: 'vraxyxronia-i-makroxronia.webm',
    path: '/vraxyxronia-i-makroxronia',
    what: 'Ενοίκιο 750 € τον μήνα απέναντι σε 95 € τη βραδιά με 62% πληρότητα.',
    async play(p) {
      // Η ΣΕΙΡΑ ΤΩΝ ΠΕΔΙΩΝ ΕΙΝΑΙ ΤΗΣ ΣΕΛΙΔΑΣ: ενοίκιο, τιμή διανυκτέρευσης,
      // πληρότητα. Με λάθος σειρά το βίντεο δείχνει ενοίκιο 85 € τον μήνα, και
      // ο θεατής που το πιάνει έχει κάθε λόγο να μην ξαναδεί τίποτα δικό μας.
      const inputs = p.locator('input');
      await p.waitForTimeout(BEAT);
      await types(inputs.nth(0), '750');
      await p.waitForTimeout(BEAT);
      await types(inputs.nth(1), '95');
      await p.waitForTimeout(BEAT);
      await types(inputs.nth(2), '62');
      await p.waitForTimeout(HOLD + BEAT);
    },
  },
];

mkdirSync(OUT, { recursive: true });
const RAW = join(OUT, '.raw');

void (async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

  // ΤΟ ΜΠΑΝΕΡ ΤΩΝ COOKIES ΔΕΝ ΕΙΝΑΙ ΤΟ ΠΡΟΪΟΝ. Μπαίνει η συγκατάθεση ΠΡΙΝ
  // ανοίξει η κάμερα, με το ίδιο κλειδί και την ίδια έκδοση που γράφει η
  // εφαρμογή — όχι με πάτημα μέσα στο βίντεο.
  const consent = JSON.stringify({ v: POLICY_VERSION, ts: new Date().toISOString() });

  const done: string[] = [];
  for (const s of SCENES) {
    rmSync(RAW, { recursive: true, force: true });
    const ctx = await browser.newContext({
      viewport: VIEW,
      locale: 'el-GR',
      recordVideo: { dir: RAW, size: VIEW },
    });
    await ctx.addInitScript(`try{localStorage.setItem('pos-cookie-consent',${JSON.stringify(consent)})}catch{}`);
    const p: Page = await ctx.newPage();
    await p.goto(BASE + s.path, { waitUntil: 'networkidle' });
    await s.play(p);
    await p.close();
    await ctx.close();

    const raw = readdirSync(RAW).find(f => f.endsWith('.webm'));
    if (!raw) throw new Error(`Δεν γράφτηκε βίντεο για ${s.file}`);
    renameSync(join(RAW, raw), join(OUT, s.file));
    done.push(s.file);
    console.log(`✓ ${s.file}`);
  }

  rmSync(RAW, { recursive: true, force: true });
  await browser.close();

  writeFileSync(join(OUT, 'README.md'), [
    '# Καταγραφές οθόνης · μορφή 5',
    '',
    'Κάθε αρχείο είναι καταγραφή της **πραγματικής** σελίδας σε πραγματικό',
    'περιηγητή, κατακόρυφα (1080×1350). Καμία κίνηση δεν είναι ζωγραφισμένη και',
    'κανένας αριθμός δεν είναι γραμμένος από πάνω.',
    '',
    ...SCENES.map(s => `- **${s.file}** · \`${s.path}\` · ${s.what}`),
    '',
    '## Τι λείπει, και δεν το φτιάχνει κώδικας',
    '',
    'Το «ΠΡΙΝ» του σχεδίου είναι ο φάκελος με τα χαρτιά. Γυρίζεται με τηλέφωνο,',
    'πάνω σε αληθινά χαρτιά, από εσένα. Δεν παράγεται εδώ και δεν προσομοιώνεται:',
    'μια στημένη στοίβα σε βίντεο που υπόσχεται «χωρίς λόγια» είναι ακριβώς το',
    'είδος του ψέματος που ακυρώνει τη μορφή.',
    '',
    '## Πριν τη δημοσίευση',
    '',
    '- Μουσική χωρίς δικαιώματα, από τη βιβλιοθήκη της κάθε πλατφόρμας.',
    '- Καμία αφήγηση. Η μορφή δουλεύει επειδή δεν εξηγεί.',
    '- Κόψιμο στα 8 ώς 15 δευτερόλεπτα ανά καταγραφή.',
    '',
  ].join('\n') + '\n');

  console.log(`\n${done.length} καταγραφές στο docs/marketing/reels/`);
})();
