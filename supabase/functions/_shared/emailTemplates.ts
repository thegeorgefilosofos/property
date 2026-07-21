// ═══════════════════════════════════════════════════════════════════════════
// Property OS — Κοινή βιβλιοθήκη email templates (lifecycle + marketing).
//
// ΜΙΑ πηγή αλήθειας για ΟΛΑ τα emails: ένα branded κέλυφος (P-logo header, λευκή
// κάρτα, footer/απεγγραφή/colophon), τυποποιημένη τυπογραφία, καθαρό ασπρόμαυρο
// με μοναδικό accent το μπλε του brand. Καθένα επιστρέφει { subject, html }.
//
// Καθαρό & χωρίς εξαρτήσεις (ισχύει σε Deno edge functions και σε plain TS), ώστε
// να το χρησιμοποιούν όλες οι functions αποστολής και να μη διαφέρει ποτέ η εικόνα.
//
// Segmentation ανά πλάνο (free / individual / professional) + εποχικές καμπάνιες.
// Η εξατομίκευση γίνεται με παραμέτρους (όνομα, πλάνο, ποσά…). Για μαζικά batch
// (send-client-email) υποστηρίζονται και tokens {{name}} που γεμίζει η function.
// ═══════════════════════════════════════════════════════════════════════════

export type Plan = 'free' | 'individual' | 'professional';

const ACCENT = '#1a73e8';
const INK = '#111111';
const MUTE = '#5f6368';
const FAINT = '#80868b';
const DEFAULT_APP = 'https://propertyos.gr';

// Η φωνή του προϊόντος: το tagline της landing, υπογραφή σε ΚΑΘΕ email (ομοιομορφία + brand awareness).
export const BRAND_TAGLINE = 'Το ακίνητό σου, υπό έλεγχο.';

const esc = (v: unknown): string =>
  String(v ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c));

export const PLAN_LABEL: Record<Plan, string> = {
  free: 'Δωρεάν', individual: 'Ιδιώτης', professional: 'Επαγγελματίας',
};

// ── Δομικά κομμάτια σώματος (τυποποιημένα) ───────────────────────────────────
export const p = (html: string): string =>
  `<p style="margin:0 0 14px;font-size:14px;color:#3c4043;line-height:1.7;">${html}</p>`;
export const h = (html: string): string =>
  `<h1 style="margin:0 0 12px;font-size:21px;color:${INK};font-weight:700;letter-spacing:-0.2px;">${html}</h1>`;
export const eyebrow = (text: string): string =>
  `<p style="margin:0 0 6px;font-size:10.5px;color:${ACCENT};text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">${esc(text)}</p>`;
export const bullets = (items: string[]): string =>
  `<table style="width:100%;border-collapse:collapse;margin:0 0 8px;">${items.map(it => `<tr><td style="vertical-align:top;padding:5px 10px 5px 0;width:18px;"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${ACCENT};"></span></td><td style="font-size:14px;color:#3c4043;line-height:1.6;padding:3px 0;">${it}</td></tr>`).join('')}</table>`;
export const button = (label: string, url: string): string =>
  `<div style="text-align:center;margin:24px 0 8px;"><a href="${esc(url)}" style="display:inline-block;background:${ACCENT};color:#fff;text-decoration:none;padding:12px 26px;border-radius:100px;font-weight:700;font-size:14px;">${esc(label)} →</a></div>`;
export const note = (html: string): string =>
  `<p style="margin:16px 0 0;font-size:12px;color:${MUTE};line-height:1.6;">${html}</p>`;
// Μόνο το μικρό όνομα (πιο ζεστό): «Μαρία Παπαδοπούλου» → «Μαρία».
export const firstNameOf = (name?: string): string => (name || '').trim().split(/\s+/)[0] || '';
export const greeting = (name?: string): string => {
  const f = firstNameOf(name);
  return p(`Γεια σου${f ? ` <b>${esc(f)}</b>` : ''},`);
};

// ── Το ΜΟΝΑΔΙΚΟ branded κέλυφος ──────────────────────────────────────────────
export function emailShell(opts: {
  bodyHtml: string; preheader?: string; unsubUrl?: string; footerNote?: string;
}): string {
  const pre = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(opts.preheader)}</div>`
    : '';
  const foot = opts.unsubUrl
    ? `Λαμβάνεις αυτό το email ως χρήστης του Property OS.<br><a href="${esc(opts.unsubUrl)}" style="color:${FAINT};text-decoration:underline;">Απεγγραφή από τα ενημερωτικά</a> · Property OS`
    : (opts.footerNote || 'Property OS · Έξυπνη διαχείριση ακινήτων');
  return `<!DOCTYPE html><html lang="el"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#f1f3f4;font-family:-apple-system,'Inter',Arial,sans-serif;">${pre}
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="display:flex;align-items:center;margin-bottom:22px;">
      <div style="width:34px;height:34px;background:${ACCENT};border-radius:8px;display:inline-flex;align-items:center;justify-content:center;"><span style="color:#fff;font-weight:800;font-size:17px;">P</span></div>
      <span style="font-size:16px;font-weight:700;color:${INK};margin-left:10px;">Property OS</span>
    </div>
    <div style="background:#fff;border:1px solid #e8eaed;border-radius:14px;padding:28px 26px;">${opts.bodyHtml}</div>
    <p style="text-align:center;font-size:12px;color:${ACCENT};font-weight:600;letter-spacing:.2px;margin:18px 0 5px;">${BRAND_TAGLINE}</p>
    <p style="text-align:center;font-size:11px;color:${FAINT};margin:0 0 4px;line-height:1.6;">${foot}</p>
  </div></body></html>`;
}

export interface Ctx { name?: string; appUrl?: string; unsubUrl?: string }

// Πλούσιο πλαίσιο εξατομίκευσης: ό,τι μοναδικό δεδομένο του χρήστη μπορεί να
// μπει ζωντανά στο κείμενο (το γεμίζει η send-lifecycle-email ανά χρήστη).
export interface Personal extends Ctx {
  plan?: Plan;
  properties?: number;       // πλήθος ακινήτων
  propertyName?: string;     // όνομα (νέου) ακινήτου
  collected?: number;        // εισπράξεις περιόδου, σε EUR
  outstanding?: number;      // ανείσπρακτα, σε EUR
  portfolioValue?: number;   // αξία χαρτοφυλακίου, σε EUR
  days?: number;             // μέρες από την εγγραφή
  assistantName?: string;    // όνομα βοηθού, αν έχει οριστεί
}
type Out = { subject: string; html: string };
const app = (c: Ctx) => c.appUrl || DEFAULT_APP;

// ── LIFECYCLE ────────────────────────────────────────────────────────────────

/** Καλωσόρισμα μετά την εγγραφή — segmented ανά πλάνο. */
export function welcomeEmail(c: Ctx & { plan?: Plan }): Out {
  const plan = c.plan || 'free';
  const next: Record<Plan, string[]> = {
    free: ['Πρόσθεσε το πρώτο σου ακίνητο σε 2 λεπτά.', 'Δες αυτόματα έσοδα, έξοδα και φόρους.', 'Δοκίμασε τον AI βοηθό για ό,τι σε απασχολεί.'],
    individual: ['Κατέγραψε ακίνητα, ενοικιαστές και εισπράξεις.', 'Βγάλε επίσημες καταστάσεις & βεβαιώσεις ενοικίου.', 'Άφησε τις υπενθυμίσεις να τρέχουν μόνες τους.'],
    professional: ['Διαχειρίσου χαρτοφυλάκιο πολλών ακινήτων.', 'Branded αναφορές & μαζική επικοινωνία πελατών.', 'Λογιστικά, φόροι και ροές εργασίας σε ένα σημείο.'],
  };
  const body = eyebrow('Καλωσόρισες') + h('Ξεκίνα με το Property OS')
    + greeting(c.name)
    + p(`Χαιρόμαστε που είσαι μαζί μας. Είσαι στο πλάνο <b>${PLAN_LABEL[plan]}</b> — να τα πρώτα βήματα για να πάρεις αξία από την πρώτη μέρα:`)
    + bullets(next[plan])
    + button('Άνοιξε τον πίνακα', `${app(c)}/dashboard`)
    + note('Είμαστε εδώ για ό,τι χρειαστείς. Απάντησε απευθείας σε αυτό το email.');
  return { subject: 'Καλωσόρισες στο Property OS', html: emailShell({ bodyHtml: body, preheader: 'Τα πρώτα βήματα για να ξεκινήσεις.' }) };
}

/** Αναβάθμιση συνδρομής — ευχαριστία + τι ξεκλείδωσε. */
export function planUpgradedEmail(c: Ctx & { plan: Plan }): Out {
  const perks: Record<Plan, string[]> = {
    free: ['Πρόσβαση στις βασικές λειτουργίες.'],
    individual: ['Απεριόριστες καταστάσεις & βεβαιώσεις ενοικίου.', 'Αυτόματες υπενθυμίσεις και ειδοποιήσεις.', 'Επίσημες, επαληθεύσιμες αναφορές PDF.'],
    professional: ['Χαρτοφυλάκιο πολλών ακινήτων χωρίς όριο.', 'Branded αναφορές & μαζικό email πελατών.', 'Προτεραιότητα στην υποστήριξη.'],
  };
  const body = eyebrow('Αναβάθμιση') + h(`Είσαι πλέον ${PLAN_LABEL[c.plan]} 🎉`)
    + greeting(c.name)
    + p('Ευχαριστούμε για την εμπιστοσύνη. Μόλις ξεκλείδωσες:')
    + bullets(perks[c.plan])
    + button('Δες τι νέο έχεις', `${app(c)}/dashboard`)
    + note('Η απόδειξη της συνδρομής σου είναι διαθέσιμη στις Ρυθμίσεις → Συνδρομή.');
  return { subject: `Καλωσόρισες στο πλάνο ${PLAN_LABEL[c.plan]}`, html: emailShell({ bodyHtml: body, preheader: 'Ευχαριστούμε — να τι ξεκλείδωσες.' }) };
}

/** Υποβάθμιση/λήξη συνδρομής — ευγενικό, χωρίς πίεση, με πόρτα επιστροφής. */
export function planDowngradedEmail(c: Ctx & { plan: Plan }): Out {
  const body = eyebrow('Αλλαγή πλάνου') + h(`Το πλάνο σου είναι τώρα ${PLAN_LABEL[c.plan]}`)
    + greeting(c.name)
    + p('Καταγράψαμε την αλλαγή στο πλάνο σου. Τα δεδομένα σου παραμένουν ασφαλή και δικά σου — τίποτα δεν χάνεται.')
    + p('Αν κάτι δεν πήγε όπως περίμενες ή θέλεις να επιστρέψεις σε περισσότερες δυνατότητες, είμαστε ένα κλικ μακριά.')
    + button('Διαχείριση συνδρομής', `${app(c)}/dashboard`)
    + note('Θα χαρούμε πολύ να ακούσουμε τη γνώμη σου — απάντησε και πες μας τι θα σε βοηθούσε.');
  return { subject: 'Ενημέρωση για τη συνδρομή σου', html: emailShell({ bodyHtml: body, preheader: 'Τα δεδομένα σου παραμένουν ασφαλή.' }) };
}

/** Προστέθηκε νέο ακίνητο — επιβεβαίωση + επόμενες κινήσεις. */
export function newPropertyEmail(c: Ctx & { propertyName: string }): Out {
  const body = eyebrow('Νέο ακίνητο') + h('Το ακίνητο προστέθηκε')
    + greeting(c.name)
    + p(`Το <b>${esc(c.propertyName)}</b> είναι πλέον στο χαρτοφυλάκιό σου. Για να δουλέψει «μόνο του», ολοκλήρωσε:`)
    + bullets(['Στοιχεία μίσθωσης & ενοικιαστή.', 'Έσοδα/έξοδα για αυτόματη λογιστική.', 'Υπενθυμίσεις για πληρωμές και λήξεις.'])
    + button('Άνοιξε το ακίνητο', `${app(c)}/dashboard`);
  return { subject: `Προστέθηκε: ${c.propertyName}`, html: emailShell({ bodyHtml: body, preheader: 'Ολοκλήρωσε τις ρυθμίσεις του ακινήτου.' }) };
}

/** Feedback μετά ~1 εβδομάδα χρήσης — ζεστό, σύντομο, χωρίς πίεση. */
export function feedbackRequestEmail(c: Ctx): Out {
  const body = eyebrow('Η γνώμη σου μετράει') + h('Πώς πάει μέχρι τώρα;')
    + greeting(c.name)
    + p('Πέρασε περίπου μία εβδομάδα με το Property OS. Θα εκτιμούσαμε πολύ 30 δευτερόλεπτα από τον χρόνο σου: τι σου άρεσε, τι σε δυσκόλεψε, τι λείπει;')
    + p('Διαβάζουμε <b>κάθε</b> απάντηση — και χτίζουμε το προϊόν με βάση αυτά που μας λέτε.')
    + button('Πες μας τη γνώμη σου', `${app(c)}/dashboard`)
    + note('Απλά απάντησε σε αυτό το email — φτάνει κατευθείαν σε εμάς.');
  return { subject: 'Πώς σου φαίνεται το Property OS;', html: emailShell({ bodyHtml: body, preheader: '30 δευτερόλεπτα που μας βοηθούν πολύ.' }) };
}

/** Ανακοίνωση mobile app. */
export function mobileLaunchEmail(c: Ctx): Out {
  const body = eyebrow('Έρχεται') + h('Το Property OS στο κινητό σου')
    + greeting(c.name)
    + p('Ετοιμάζουμε την εφαρμογή για κινητά — τα ακίνητά σου, οι εισπράξεις και οι ειδοποιήσεις στην τσέπη σου, όπου κι αν είσαι.')
    + bullets(['Ειδοποιήσεις σε πραγματικό χρόνο.', 'Γρήγορη καταχώρηση εσόδων/εξόδων.', 'Σάρωση εγγράφων με ένα tap.'])
    + button('Μπες στη λίστα αναμονής', `${app(c)}/dashboard`)
    + note('Θα είσαι από τους πρώτους που θα ειδοποιήσουμε μόλις είναι έτοιμη.');
  return { subject: 'Το Property OS έρχεται στο κινητό', html: emailShell({ bodyHtml: body, preheader: 'Μπες πρώτος στη λίστα αναμονής.' }) };
}

/** Πρόσκληση στο Referral program. */
export function referralInviteEmail(c: Ctx): Out {
  const body = eyebrow('Referral') + h('Κέρδισε προτείνοντας το Property OS')
    + greeting(c.name)
    + p('Ξέρεις κάποιον με ακίνητα; Πρότεινέ του το Property OS και <b>κερδίζετε και οι δύο</b>.')
    + bullets(['Μοναδικός σύνδεσμος πρόσκλησης, δικός σου.', 'Ανταμοιβή για κάθε ενεργό φίλο που φέρνεις.', 'Παρακολούθηση προσκλήσεων & ανταμοιβών live.'])
    + button('Δες το πρόγραμμα', `${app(c)}/dashboard`);
  return { subject: 'Πρότεινε το Property OS & κέρδισε', html: emailShell({ bodyHtml: body, preheader: 'Κερδίζετε και οι δύο.' }) };
}

/** Upsell δωρεάν → paid, με προαιρετική έκπτωση/εποχή. */
export function upsellEmail(c: Ctx & { toPlan?: Plan; discountPct?: number; seasonLabel?: string }): Out {
  const to = c.toPlan || 'individual';
  const disc = c.discountPct && c.discountPct > 0 ? c.discountPct : 0;
  const seasonLine = c.seasonLabel ? ` <b>${esc(c.seasonLabel)}</b>` : '';
  const body = eyebrow(disc ? `Προσφορά${seasonLine ? ' ·' : ''}${seasonLine}` : 'Αναβάθμιση')
    + h(disc ? `${disc}% έκπτωση στο πλάνο ${PLAN_LABEL[to]}` : `Ξεκλείδωσε το πλάνο ${PLAN_LABEL[to]}`)
    + greeting(c.name)
    + p(`Κάνεις ήδη ωραία δουλειά με το δωρεάν πλάνο. Με το <b>${PLAN_LABEL[to]}</b> κερδίζεις χρόνο και σιγουριά:`)
    + bullets(to === 'professional'
        ? ['Απεριόριστα ακίνητα & branded αναφορές.', 'Μαζική επικοινωνία πελατών.', 'Προτεραιότητα στην υποστήριξη.']
        : ['Απεριόριστες καταστάσεις & βεβαιώσεις.', 'Αυτόματες υπενθυμίσεις πληρωμών.', 'Επίσημες αναφορές PDF με QR επαλήθευσης.'])
    + button(disc ? `Κλείσε το ${disc}%` : 'Αναβάθμισε τώρα', `${app(c)}/dashboard`)
    + note(disc ? 'Η προσφορά ισχύει για περιορισμένο διάστημα.' : 'Ακύρωση όποτε θες — χωρίς δεσμεύσεις.');
  const subj = disc ? `${disc}% έκπτωση${c.seasonLabel ? ` — ${c.seasonLabel}` : ''} στο Property OS` : `Αναβάθμισε στο πλάνο ${PLAN_LABEL[to]}`;
  return { subject: subj, html: emailShell({ bodyHtml: body, preheader: disc ? `Ξεκλείδωσε το ${PLAN_LABEL[to]} με έκπτωση.` : 'Περισσότερος χρόνος, λιγότερος κόπος.' }) };
}

/** Ενημέρωση αλλαγής νομοθεσίας ακινήτων — brand awareness + χρησιμότητα. */
export function legislationUpdateEmail(c: Ctx & { headline: string; summaryHtml: string }): Out {
  const body = eyebrow('Νομοθεσία ακινήτων') + h(esc(c.headline))
    + greeting(c.name)
    + p(c.summaryHtml)
    + p('Το Property OS ενημερώνεται συνεχώς ώστε τα ακίνητά σου να είναι <b>πάντα σε τάξη</b> — εύκολα, γρήγορα, σωστά. Τώρα είναι η καλύτερη στιγμή να το ελέγξεις.')
    + button('Βάλε το ακίνητό σου σε τάξη', `${app(c)}/dashboard`)
    + note('Ενημερωτικό, με επίσημες πηγές. Για την τελική εφαρμογή, επιβεβαίωσε με τον λογιστή σου ή στο myAADE/gov.gr.');
  return { subject: `Property OS — ${c.headline}`, html: emailShell({ bodyHtml: body, preheader: 'Τι αλλάζει και τι πρέπει να κάνεις.' }) };
}

// ── ΕΠΟΧΙΚΕΣ ΚΑΜΠΑΝΙΕΣ ────────────────────────────────────────────────────────
export type Season = 'black_friday' | 'cyber_monday' | 'christmas' | 'new_year';
export const SEASONS: Record<Season, { label: string; hook: string }> = {
  black_friday: { label: 'Black Friday', hook: 'Η μεγαλύτερη προσφορά της χρονιάς.' },
  cyber_monday: { label: 'Cyber Monday', hook: 'Μια μέρα, μια ευκαιρία.' },
  christmas:    { label: 'Χριστούγεννα', hook: 'Κλείσε τη χρονιά με τα ακίνητά σου σε τάξη.' },
  new_year:     { label: 'Πρωτοχρονιά',  hook: 'Νέα χρονιά, καθαρά βιβλία.' },
};

/** Εποχική καμπάνια (τυποποιημένη) — χτίζει πάνω στο upsell με εποχικό πλαίσιο. */
export function seasonalCampaignEmail(c: Ctx & { season: Season; toPlan?: Plan; discountPct?: number }): Out {
  const s = SEASONS[c.season];
  return upsellEmail({ ...c, seasonLabel: s.label, discountPct: c.discountPct ?? 20, toPlan: c.toPlan });
}
