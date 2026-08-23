// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΣΥΣΤΗΜΑ ΤΩΝ ΑΝΑΡΤΗΣΕΩΝ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΑΛΛΑΞΕ ΚΑΙ ΓΙΑΤΙ. Η πρώτη εκδοχή έβαζε κάθε μορφή μέσα στην ίδια
// στρογγυλεμένη κάρτα, κεντραρισμένη σε φόντο με περιθώριο. Είναι η πιο
// αναγνωρίσιμη διάταξη παραγόμενου υλικού που υπάρχει, και διαβάζεται ως
// «φτιαγμένο από μηχανή» πριν καν διαβαστεί η πρώτη λέξη. Ο λόγος είναι
// δομικός: όταν κάθε ανάρτηση έχει τον ίδιο ρυθμό —επικεφαλίδα, κείμενο,
// σηματάκι, υποσέλιδο— δεν υπάρχει ιεραρχία ΜΕΤΑΞΥ των αναρτήσεων. Ολες
// φωνάζουν το ίδιο δυνατά, άρα καμία.
//
// ΤΟ ΣΥΣΤΗΜΑ ΕΙΝΑΙ Η ΤΑΥΤΟΤΗΤΑ, ΟΧΙ Η ΔΙΑΤΑΞΗ
// Σταθερά σε ΚΑΘΕ ανάρτηση: το έδαφος, η μία γραμμή τόνου πάνω αριστερά, η
// γραμματοσειρά, η θέση της υπογραφής. Αυτά χτίζουν την αναγνώριση.
// Διαφορετική σε κάθε ΜΟΡΦΗ: η στάση της σελίδας. Ο μετρητής είναι ένας
// τεράστιος αριθμός· ο νόμος είναι μια ετυμηγορία· η ερώτηση είναι διάλογος.
// Ενα στούντιο δουλεύει έτσι: σταθερή ταυτότητα, ελεύθερη σύνθεση.
//
// ΓΙΑ ΤΟ ΣΤΑΜΑΤΗΜΑ ΤΟΥ ΔΑΧΤΥΛΟΥ
// Στο χρονολόγιο, μια ανάρτηση έχει περίπου μισό δευτερόλεπτο. Σε αυτό το
// μισό δευτερόλεπτο δεν διαβάζεται πρόταση: διαβάζεται ΕΝΑ πράγμα. Γι' αυτό
// κάθε μορφή έχει ένα και μόνο σημείο έντασης, και όλα τα υπόλοιπα υποχωρούν.
//
// ΚΑΜΙΑ ΓΡΑΜΜΑΤΟΣΕΙΡΑ ΑΠΟ ΤΡΙΤΟ. Το έργο το απαγορεύει (scripts/security-check.mjs)
// επειδή διαρρέει διεύθυνση IP, και ο κανόνας δεν κάνει εξαίρεση για ό,τι
// «τρέχει τοπικά»: ό,τι τρέχει σήμερα στον υπολογιστή σου, αύριο σε διακομιστή.
// ═══════════════════════════════════════════════════════════════════════════
import { join } from 'node:path';

/** Κατακόρυφη ανάρτηση 4:5. Το μέγεθος που δίνει το μεγαλύτερο ύψος στο feed. */
export const W = 1080;
export const H = 1350;

const FONT_DIR = 'file://' + join(process.cwd(), 'public/fonts');

const FACES = `
  @font-face{font-family:Inter;src:url("${FONT_DIR}/inter-greek.woff2") format("woff2");font-weight:100 900;font-display:block}
  @font-face{font-family:Inter;src:url("${FONT_DIR}/inter-latin.woff2") format("woff2");font-weight:100 900;font-display:block}
  @font-face{font-family:"Roboto Mono";src:url("${FONT_DIR}/robotomono-greek.woff2") format("woff2");font-weight:100 700;font-display:block}
  @font-face{font-family:"Roboto Mono";src:url("${FONT_DIR}/robotomono-latin.woff2") format("woff2");font-weight:100 700;font-display:block}`;

/**
 * ΤΟ ΘΕΜΑ ΤΗΣ ΑΝΑΡΤΗΣΗΣ ΕΙΝΑΙ ΤΟ ΘΕΜΑ ΠΟΥ ΘΑ ΔΕΙ ΟΠΟΙΟΣ ΠΑΤΗΣΕΙ ΤΟΝ ΣΥΝΔΕΣΜΟ.
 *
 * Ο ThemeProvider ανοίγει σε σκοτεινό όταν δεν υπάρχει αποθηκευμένη προτίμηση,
 * δηλαδή για κάθε καινούριο επισκέπτη. Προεπιλογή λοιπόν το σκοτεινό· το
 * φωτεινό βγαίνει με `POSTS_MODE=light` για τοποθετήσεις σε λευκό φόντο.
 */
export type Mode = 'dark' | 'light';
export const MODE: Mode = process.env.POSTS_MODE === 'light' ? 'light' : 'dark';

// Τα χρώματα είναι του app/globals.css. Τα ονόματα εδώ είναι ρόλοι σελίδας
// (έδαφος, μελάνι, τόνος) και όχι ρόλοι διεπαφής: δεν υπάρχει «επιφάνεια»
// σε μια αφίσα, γιατί δεν υπάρχει κάρτα.
const PALETTE: Record<Mode, string> = {
  dark: `
    --ground:#202124; --ink:#e8eaed; --muted:#a8aeb3;
    --accent:#8ab4f8; --rule:#3c4043;`,
  light: `
    --ground:#ffffff; --ink:#202124; --muted:#5f6368;
    --accent:#1560d4; --rule:#dadce0;`,
};

/**
 * Η ΓΕΩΜΕΤΡΙΑ. Ενα περιθώριο, μία ραχοκοκαλιά, τρεις ζώνες.
 *
 * Η ραχοκοκαλιά (88px) είναι το πλάτος της γραμμής τόνου πάνω αριστερά, και
 * ταυτόχρονα η εσοχή στην οποία στοιχίζεται ό,τι είναι δευτερεύον. Ενα μέτρο,
 * δύο δουλειές: γι' αυτό η σελίδα φαίνεται χτισμένη και όχι στοιβαγμένη.
 */
const PAD = 76;
const SPINE = 88;

const BASE = `
  *{box-sizing:border-box;margin:0}
  body{width:${W}px;height:${H}px;background:var(--ground);color:var(--ink);
       font-family:Inter,system-ui,sans-serif;padding:${PAD}px;
       display:flex;flex-direction:column;-webkit-font-smoothing:antialiased}

  /* ── Η ΥΠΟΓΡΑΦΗ: μία γραμμή τόνου και μία ετικέτα, πάντα στο ίδιο σημείο ── */
  .top{display:flex;align-items:center;gap:24px;flex:none}
  .top i{display:block;width:${SPINE}px;height:6px;background:var(--accent);flex:none}
  .label{font-family:"Roboto Mono",monospace;font-size:22px;font-weight:500;
         letter-spacing:0.17em;color:var(--muted);white-space:nowrap}

  /* Η ΣΚΗΝΗ. Καμία κοινή στοίχιση εδώ: την ορίζει η κάθε μορφή. */
  .stage{flex:1;display:flex;flex-direction:column;padding:${PAD}px 0 0}

  /* ── ΤΟ ΥΠΟΣΕΛΙΔΟ: ποιος το λέει, και με ποια πηγή ──────────────────────── */
  .foot{flex:none;display:flex;align-items:baseline;justify-content:space-between;
        gap:32px;border-top:2px solid var(--rule);padding-top:26px}
  .mark{font-family:"Roboto Mono",monospace;font-size:22px;font-weight:500;
        letter-spacing:0.2em;color:var(--ink)}
  .mark b{color:var(--accent);font-weight:500}
  .src{font-family:"Roboto Mono",monospace;font-size:22px;font-weight:500;
       letter-spacing:0.1em;color:var(--muted);text-align:right}

  /* ── ΚΟΙΝΑ ΣΤΟΙΧΕΙΑ ΤΥΠΟΓΡΑΦΙΑΣ ────────────────────────────────────────── */
  /* Ο ΤΕΡΑΣΤΙΟΣ ΑΡΙΘΜΟΣ. Βάρος 900, στενό διάστιχο, αρνητικό tracking: σε αυτό
     το μέγεθος τα κανονικά διάκενα ανοίγουν τρύπες μέσα στον ίδιο τον αριθμό. */
  .huge{font-weight:900;line-height:0.78;letter-spacing:-0.055em;
        font-variant-numeric:tabular-nums;color:var(--accent)}
  .huge small{font-size:0.4em;font-weight:800;letter-spacing:-0.02em;vertical-align:baseline}

  h1{font-weight:800;letter-spacing:-0.03em;line-height:1.06;text-wrap:balance}
  .body{font-size:34px;line-height:1.45;font-weight:400;color:var(--muted)}
  .body b{color:var(--ink);font-weight:600}
  .spine{padding-left:${SPINE + 24}px}
  .rule{height:2px;background:var(--rule)}`;

/**
 * Ολόκληρη η σελίδα μιας ανάρτησης.
 *
 * @param label Η ετικέτα δίπλα στη γραμμή τόνου. Κεφαλαία, χωρίς τόνους.
 * @param stage Η σύνθεση της συγκεκριμένης μορφής.
 * @param source Η αρχή που το λέει. ΠΑΝΤΑ ορατή: μια ανάρτηση για φόρους χωρίς
 *   πηγή είναι ισχυρισμός, και ο πρώτος που θα τον αμφισβητήσει έχει δίκιο.
 * @param extraCss Ο,τι χρειάζεται ΜΟΝΟ αυτή η μορφή.
 */
export function page(label: string, stage: string, source: string, extraCss = ''): string {
  return `<!doctype html><html lang="el"><head><meta charset="utf-8">
<style>${FACES}:root{${PALETTE[MODE]}}${BASE}${extraCss}</style></head><body>
  <div class="top"><i></i><div class="label">${label}</div></div>
  <div class="stage">${stage}</div>
  <div class="foot">
    <div class="mark">PROPERTY<b>OS</b></div>
    <div class="src">${source}</div>
  </div>
</body></html>`;
}

/** Κόβει κείμενο σε όριο ΛΕΞΗΣ, με σημάδι ότι υπάρχει συνέχεια. */
export function clip(s: string, n: number): string {
  const t = s.trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…';
}

/**
 * Κρατά ΑΚΕΡΑΙΕΣ προτάσεις, όσες χωρούν.
 *
 * ΜΙΑ ΠΡΟΤΑΣΗ ΚΟΜΜΕΝΗ ΣΤΗ ΜΕΣΗ ΔΕΝ ΕΙΝΑΙ ΣΥΝΤΟΜΙΑ, ΕΙΝΑΙ ΛΑΘΟΣ. Το «Ζήτησε
 * από τους ενοικιαστές κατάθεση και κράτα…» αφήνει τον αναγνώστη με μισή
 * οδηγία για φορολογικό θέμα, και η μισή οδηγία είναι χειρότερη από καμία.
 */
export function sentenceClip(s: string, n: number): string {
  const t = s.trim();
  if (t.length <= n) return t;
  const parts = t.split(/(?<=\.)\s+/);
  let out = '';
  for (const part of parts) {
    const next = out ? `${out} ${part}` : part;
    if (next.length > n) break;
    out = next;
  }
  return out || clauseClip(t, n);
}

/**
 * Οταν ούτε η πρώτη πρόταση δεν χωρά, κόβει σε όριο ΠΡΟΤΑΣΗΣ ΜΕΣΑ ΣΤΗΝ ΠΡΟΤΑΣΗ.
 *
 * Το «…φυσικό φωτισμό/αερισμό, υπεύθυνη…» σταματά μέσα σε απαρίθμηση και
 * διαβάζεται ως βλάβη. Το «…πυρασφάλεια…» σταματά εκεί που σταματά και η
 * ανάσα: μετά από κόμμα ή άνω τελεία. Η ίδια πληροφορία, χωρίς το ράκος.
 */
export function clauseClip(s: string, n: number): string {
  const t = s.trim();
  if (t.length <= n) return t;
  const head = t.slice(0, n);
  const cut = Math.max(head.lastIndexOf(','), head.lastIndexOf(':'), head.lastIndexOf(';'));
  // Πολύ πρώιμο κόμμα θα άφηνε μισή πρόταση· κάτω από τα δύο τρίτα, λέξη.
  if (cut > n * 0.66) return t.slice(0, cut) + '…';
  return clip(t, n);
}

/**
 * ΚΕΦΑΛΑΙΑ ΧΩΡΙΣ ΤΟΝΟΥΣ, όπως τα γράφουν τα ελληνικά.
 *
 * Το `text-transform: uppercase` του CSS κρατά τον τόνο («ΡΩΤΑ ΤΗ ΝΌΑ») και
 * είναι ορθογραφικό λάθος. Γίνεται εδώ, μία φορά, ώστε να μη γράφεται καμία
 * επικεφαλίδα κεφαλαία με το χέρι.
 */
const TONOI: Record<string, string> = {
  ά: 'α', έ: 'ε', ή: 'η', ί: 'ι', ό: 'ο', ύ: 'υ', ώ: 'ω',
  ϊ: 'ι', ϋ: 'υ', ΐ: 'ι', ΰ: 'υ',
};
export function caps(s: string): string {
  return s.replace(/[άέήίόύώϊϋΐΰ]/g, c => TONOI[c]).toUpperCase();
}

/**
 * Η ΑΡΧΗ ΠΟΥ ΤΟ ΛΕΕΙ, ΟΧΙ Η ΔΙΕΥΘΥΝΣΗ ΤΗΣ.
 *
 * Μια διεύθυνση 96 χαρακτήρων που τυλίγεται σε τρεις σειρές δεν είναι πηγή:
 * είναι θόρυβος που κανείς δεν πληκτρολογεί. Στην ανάρτηση μπαίνει το όνομα
 * της αρχής· ο σύνδεσμος ζει στη λεζάντα, όπου πατιέται.
 *
 * ΚΑΝΕΝΑ ΟΝΟΜΑ ΔΕΝ ΕΠΙΝΟΕΙΤΑΙ: αν ο κεντρικός υπολογιστής δεν είναι γνωστός,
 * γράφεται ο ίδιος ο κεντρικός υπολογιστής και τίποτε άλλο.
 */
const AUTHORITY: Record<string, string> = {
  'www.aade.gr': 'ΑΑΔΕ',
  'www.myaade.gov.gr': 'ΑΑΔΕ · myAADE',
  'www.gov.gr': 'gov.gr',
  'www.valuemaps.gov.gr': 'valuemaps.gov.gr',
};
export function sourceName(url: string): string {
  try {
    const host = new URL(url).host;
    return AUTHORITY[host] || host;
  } catch {
    return url;
  }
}
