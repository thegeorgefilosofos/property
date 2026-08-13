// npx tsx lib/bank/link.test.ts
//
// ΤΟ ΚΕΙΜΕΝΟ ΤΗΣ ΣΥΝΔΕΣΗΣ ΕΙΝΑΙ ΝΟΜΙΚΗ ΥΠΟΣΧΕΣΗ, ΟΧΙ ΔΙΑΦΗΜΙΣΤΙΚΟ. Λέει τι
// επιτρέπει η οδηγία, τι δεν μπορεί να κάνει ο πάροχος και τι δεν κρατάμε.
// Εδώ κλειδώνει ότι δεν θα γίνει ποτέ κάτι από τα εξής: να υποσχεθεί «δωρεάν»,
// να ονομάσει πάροχο που δεν έχουμε, να δώσει διάρκεια άδειας σε μέρες, ή να
// πει «σύνδεση» ενώ η σύνδεση δεν υπάρχει ακόμη.
import {
  BANK_LINK_TITLE, BANK_LINK_TAGLINE, BANK_LINK_POINTS,
  bankLinkState, bankLinkCta, bankLinkStatusLine, bankLinkPriceLine,
} from './link';
import { ADDONS, available } from '@/lib/billing/addons';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n); } };

const ALL = [BANK_LINK_TITLE, BANK_LINK_TAGLINE, bankLinkPriceLine(),
  bankLinkStatusLine('open'), bankLinkStatusLine('coming'), bankLinkCta('open'), bankLinkCta('coming'),
  ...BANK_LINK_POINTS.flatMap(p => [p.title, p.body])].join(' ');

// ── ΤΙ ΔΕΝ ΛΕΜΕ ΠΟΤΕ ──────────────────────────────────────────────────────
ok('πουθενά «δωρεάν»', !/δωρεάν/i.test(ALL));
ok('κανένα όνομα παρόχου χωρίς υπογραφή',
   !/(enable\s*banking|gocardless|nordigen|yapily|salt\s*edge|tink|plaid)/i.test(ALL));
ok('καμία διάρκεια άδειας σε μέρες', !/\d+\s*(ημέρ|μέρ)/i.test(ALL));
ok('καμία υπόσχεση μεταφοράς χρημάτων',
   !/(θα\s+πληρών|εκτελ\w*\s+πληρωμ|μεταφέρ\w*\s+χρήματ)/i.test(ALL));
ok('χωρίς emoji', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(ALL));

// ── ΤΙ ΛΕΜΕ ΟΠΩΣΔΗΠΟΤΕ ────────────────────────────────────────────────────
ok('αναφέρεται η οδηγία PSD2', /PSD2/.test(ALL));
ok('λέει ότι είναι μόνο ανάγνωση', /μόνο ανάγνωση/i.test(ALL));
ok('λέει ότι η έγκριση δίνεται στην τράπεζα', /σελίδα της τράπεζ/i.test(ALL));
ok('λέει ότι δεν βλέπουμε κωδικούς', /δεν τους βλέπουμε/i.test(ALL));
ok('λέει ότι οι κινήσεις δεν αποθηκεύονται', /δεν αποθηκεύονται/i.test(ALL));
ok('λέει ότι ανακαλείται', /ανακαλείς/i.test(ALL));
ok('λέει ότι χρεώνεται', /χρεώνεται/i.test(ALL));

// ── Η ΔΟΜΗ ────────────────────────────────────────────────────────────────
ok('τέσσερα σημεία', BANK_LINK_POINTS.length === 4);
ok('πρώτο το «γιατί»', BANK_LINK_POINTS[0].title.startsWith('Γιατί'));
ok('μοναδικοί τίτλοι', new Set(BANK_LINK_POINTS.map(p => p.title)).size === 4);
ok('κανένας τίτλος σε προστακτική',
   BANK_LINK_POINTS.every(p => !/^(Σύνδεσε|Πάτησε|Δες|Κάνε|Πρόσθεσε)/.test(p.title)));
ok('κάθε σώμα ολοκληρωμένη πρόταση',
   BANK_LINK_POINTS.every(p => p.body.trim().endsWith('.') && p.body.length > 80));
ok('ο υπότιτλος χωρίς τελεία', !BANK_LINK_TAGLINE.endsWith('.'));

// ── Η ΚΑΤΑΣΤΑΣΗ ΑΚΟΛΟΥΘΕΙ ΤΗΝ ΤΙΜΗ, ΟΧΙ ΞΕΧΩΡΙΣΤΗ ΣΗΜΑΙΑ ─────────────────
ok('η κατάσταση δένεται με τη διαθεσιμότητα του πρόσθετου',
   bankLinkState() === (available('bank_link') ? 'open' : 'coming'));
if (ADDONS.bank_link.priceMonthly == null) {
  ok('χωρίς τιμή, δεν λέμε «Σύνδεση τράπεζας»', bankLinkState() === 'coming');
  ok('το κουμπί ζητά ειδοποίηση', /ειδοποίησέ/i.test(bankLinkCta()));
  ok('και η γραμμή τιμής το παραδέχεται', /θα φαίνεται πριν/i.test(bankLinkPriceLine()));
} else {
  ok('με τιμή, το κουμπί συνδέει', bankLinkCta() === 'Σύνδεση τράπεζας');
}

// Η μονάδα χρέωσης λέγεται με τα ίδια λόγια όπως στο τιμολόγιο.
ok('η μονάδα χρέωσης έρχεται από το πρόσθετο',
   bankLinkPriceLine().includes(ADDONS.bank_link.unit));

console.log(`${pass} πέρασαν, ${fail} απέτυχαν`);
if (fail) process.exit(1);
