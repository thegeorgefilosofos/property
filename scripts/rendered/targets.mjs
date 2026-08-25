// ═══════════════════════════════════════════════════════════════════════════
// ΤΙ ΜΕΤΡΙΕΤΑΙ, ΚΑΙ ΠΟΥ
// ─────────────────────────────────────────────────────────────────────────
// Δύο κόσμοι, γιατί δύο τρόποι πρόσβασης. Οι δημόσιες σελίδες σερβίρονται από
// διακομιστή· ο πίνακας ελέγχου ζει πίσω από σύνδεση και τον φτάνει ο πάγκος,
// που αποδίδει τα ΙΔΙΑ components με ψεύτικη μόνο τη βάση.
// ═══════════════════════════════════════════════════════════════════════════
export const PUBLIC = [
  '/', '/signup', '/login', '/trust', '/privacy', '/terms',
  '/ypologismos-enfia', '/ypologismos-forou-enoikion', '/kathari-apodosi',
  '/vraxyxronia-i-makroxronia',
];

export const BENCH = ['portfolio', 'cash', 'rent', 'inbox', 'ledger', 'checklist', 'modal', 'select'];

export const benchUrl = (c, n = 12) =>
  `file://${process.cwd()}/.perf-bench/mobile.html?c=${c}&n=${n}`;

/**
 * Τα παράθυρα. Τα 320 είναι το iPhone SE και κάθε φθηνό Android που κυκλοφορεί
 * ακόμη· το 844 × 390 είναι το ίδιο κινητό γυρισμένο πλάγια, που συμβαίνει
 * κάθε φορά που κάποιος δείχνει την οθόνη του σε άλλον.
 */
export const SIZES = [
  ['στενό', 320, 800], ['κινητό', 390, 844], ['κινητό πλάγια', 844, 390],
  ['κινητό+', 430, 932], ['ταμπλέτα', 768, 1024], ['ταμπλέτα↔', 1024, 768],
  ['φορητός', 1280, 800], ['επιτραπέζιος', 1440, 900],
];

export const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');

/** Κλείνει τη συγκατάθεση cookies, που αλλιώς σκεπάζει τον πάτο κάθε σελίδας. */
export const dismissConsent = (page) => page.evaluate(() => {
  const el = [...document.querySelectorAll('button,a')].find(e => /Το κατάλαβα/.test(e.textContent || ''));
  if (el) el.click();
});
