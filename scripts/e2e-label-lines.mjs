#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΟΙ ΕΤΙΚΕΤΕΣ ΜΙΑΣ ΣΕΙΡΑΣ ΠΙΑΝΟΥΝ ΤΙΣ ΙΔΙΕΣ ΓΡΑΜΜΕΣ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΣΦΑΛΜΑ. Σε σειρά πέντε πεδίων, δύο ετικέτες («Καθαρό μηνιαίο εισόδημα»,
// «Υφιστάμενες μηνιαίες δόσεις») τσάκιζαν σε δεύτερη γραμμή και οι άλλες τρεις
// έμεναν σε μία. Αποτέλεσμα: τα κουτιά από κάτω τους ξεκινούσαν σε δύο
// διαφορετικά ύψη και η σειρά έχανε τη βάση της. Το ίδιο και σε σειρά μεγεθών,
// όπου η τιμή κάτω από μια δίγραμμη ετικέτα πέφτει δεκαοκτώ εικονοστοιχεία πιο
// χαμηλά από τη διπλανή της.
//
// ΓΙΑΤΙ ΔΕΝ ΤΟ ΠΙΑΝΕΙ Η ΣΤΟΙΧΙΣΗ ΧΕΙΡΙΣΤΗΡΙΩΝ. Εκείνη μετρά τα ΚΟΥΤΙΑ. Εδώ τα
// κουτιά μπορεί να είναι μια χαρά και να χαλάει η ΕΤΙΚΕΤΑ από πάνω τους.
//
// ΤΙ ΕΛΕΓΧΕΙ. Για κάθε δοχείο με δύο ή περισσότερα αδέλφια στην ίδια οπτική
// σειρά, μετρά πόσες γραμμές πιάνει η ετικέτα του καθενός. Αν δεν συμφωνούν,
// το γράφει: είναι σχεδιαστικό λάθος που διορθώνεται με πλάτος στήλης ή με
// συντομότερη ετικέτα, όχι κάτι που ορίζουν τα δεδομένα.
// ═══════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright-core';
import { chromePath } from './lib/chrome.mjs';
import { sweep } from './lib/sweep.mjs';
import { SCENES } from './lib/scenes.mjs';

const WIDTHS = [390, 768, 900, 1024, 1120, 1280, 1440];

const probe = () => {
  const out = [];
  // Ετικέτα πεδίου ή μεγέθους: το πρώτο παιδί-κείμενο του κελιού.
  const labelOf = cell => {
    for (const el of cell.querySelectorAll('label,p,span')) {
      if (el.children.length) continue;
      const t = (el.textContent || '').trim();
      if (!t) continue;
      const r = el.getBoundingClientRect();
      if (r.height < 6) continue;
      return el;
    }
    return null;
  };
  const lines = el => {
    const r = document.createRange();
    r.selectNodeContents(el);
    return [...r.getClientRects()].filter(x => x.width > 1 && x.height > 1).length;
  };
  for (const g of document.querySelectorAll('.fixed-cols, .form-row, .approval-row, .lens-bar, [class*="grid"]')) {
    const kids = [...g.children].filter(c => c.getBoundingClientRect().height > 8);
    if (kids.length < 2) continue;
    // ΜΙΑ ΟΠΤΙΚΗ ΣΕΙΡΑ ΒΓΑΙΝΕΙ ΑΠΟ ΕΠΙΚΑΛΥΨΗ, ΟΧΙ ΑΠΟ ΙΔΙΟ «top». Με
    // `align-items: end` ένα κελί με δίγραμμη ετικέτα ξεκινά ΨΗΛΟΤΕΡΑ από το
    // διπλανό του: αν η σειρά κλειδώνει στο πάνω άκρο, ο έλεγχος χωρίζει σε δύο
    // σειρές ακριβώς τα κελιά που ήθελε να συγκρίνει — δηλαδή σιωπά πάνω στο
    // σφάλμα που ψάχνει. Δύο κελιά είναι στην ίδια σειρά όταν τα κατακόρυφα
    // διαστήματά τους τέμνονται πάνω από το μισό του κοντύτερου.
    const rows = [];
    for (const c of kids) {
      const r = c.getBoundingClientRect();
      const row = rows.find(g => {
        const q = g[0].getBoundingClientRect();
        const overlap = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top);
        return overlap > Math.min(r.height, q.height) / 2;
      });
      if (row) row.push(c); else rows.push([c]);
    }
    for (const row of rows) {
      if (row.length < 2) continue;
      // ΚΑΡΤΑ ΔΕΝ ΕΙΝΑΙ ΠΕΔΙΟ. Δύο κάρτες εργαλείων δίπλα δίπλα έχουν κι αυτές
      // «πρώτη ετικέτα», αλλά η μία δεν στοιχίζεται με την άλλη: μεταξύ τους
      // μεσολαβεί ολόκληρο περιεχόμενο. Κελί είναι ό,τι κρατά λίγα κείμενα.
      const leaves = c => [...c.querySelectorAll('label,p,span')].filter(e => !e.children.length && (e.textContent||'').trim()).length;
      if (row.some(c => leaves(c) > 4)) continue;
      // ΟΤΑΝ ΤΑ ΚΕΛΙΑ ΕΧΟΥΝ ΙΔΙΟ ΥΨΟΣ, ΤΙΠΟΤΑ ΔΕΝ ΜΕΤΑΤΟΠΙΖΕΤΑΙ. Σε πλέγμα με
      // `stretch` μια δίγραμμη ετικέτα δεν σπρώχνει το διπλανό κουτί: η σειρά
      // μένει ζυγισμένη. Το ελάττωμα είναι η ΜΕΤΑΤΟΠΙΣΗ, όχι το τύλιγμα.
      const hs = row.map(c => Math.round(c.getBoundingClientRect().height));
      if (new Set(hs).size === 1) continue;
      const ls = row.map(c => { const el = labelOf(c); return el ? { t: (el.textContent||'').trim(), n: lines(el) } : null });
      if (ls.some(x => !x)) continue;
      const counts = [...new Set(ls.map(x => x.n))];
      if (counts.length < 2) continue;
      out.push({
        row: ls.map(x => `${x.t.slice(0, 22)}=${x.n}`).join(' · '),
      });
    }
  }
  return out;
};

const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox'] });
// ΤΑ ΔΙΠΛΩΜΕΝΑ ΠΑΝΕΛ ΔΕΝ ΕΙΝΑΙ ΕΚΤΟΣ ΕΛΕΓΧΟΥ, ΕΙΝΑΙ ΤΟ ΜΙΣΟ ΠΡΟΪΟΝ. Το πάνελ
// έγκρισης και η ανάλυση ESIS ζουν πίσω από πτυσσόμενη ενότητα: χωρίς άνοιγμα,
// ο σαρωτής έβγαζε καθαρή σκηνή για οθόνη που δεν είχε δει. Δύο περάσματα,
// γιατί ενότητα μπορεί να κρύβει ενότητα.
const swept = await sweep(browser, {
  widths: WIDTHS, height: 1000, scenes: SCENES, passes: 2,
  visit: (page) => page.evaluate(probe),
});
await browser.close();
const findings = swept.flatMap(({ scene, width, value }) => value.map(f => ({ where: `${scene}@${width}`, ...f })));

if (findings.length) {
  console.error(`\n✗ ${findings.length} σειρές με ετικέτες σε διαφορετικό αριθμό γραμμών:\n`);
  for (const f of findings) console.error(`  ${f.where.padEnd(24)} ${f.row}`);
  console.error(`
  Οι τιμές κάτω από ετικέτες διαφορετικού ύψους δεν στοιχίζονται. Διόρθωσε με
  πλάτος στήλης (δώσε στη μακριά ετικέτα περισσότερο) ή με συντομότερη ετικέτα.`);
  process.exit(1);
}
console.log(`✓ κάθε σειρά έχει τις ετικέτες της στο ίδιο ύψος, σε ${SCENES.length} σκηνές × ${WIDTHS.length} πλάτη`);
