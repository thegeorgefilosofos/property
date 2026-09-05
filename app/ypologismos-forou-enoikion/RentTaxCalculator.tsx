'use client';
// ═══════════════════════════════════════════════════════════════════════════
// ΔΩΡΕΑΝ ΥΠΟΛΟΓΙΣΤΗΣ ΦΟΡΟΥ ΕΝΟΙΚΙΩΝ — ο διαδραστικός πυρήνας
// ─────────────────────────────────────────────────────────────────────────
// ΓΙΑΤΙ ΥΠΑΡΧΕΙ ΑΥΤΗ Η ΣΕΛΙΔΑ
// Η εφαρμογή περιέχει ήδη σωστή, δοκιμασμένη φορολογική λογική για το 2026. Ήταν
// όμως ΟΛΗ κλειδωμένη πίσω από τη σύνδεση, οπότε κανείς δεν μπορούσε να δει την
// αξία της πριν εγγραφεί. Ο Έλληνας ιδιοκτήτης ψάχνει «πόσο φόρο θα πληρώσω για
// τα ενοίκια» πριν ψάξει «εφαρμογή διαχείρισης ακινήτων» — και δεν είχαμε τίποτα
// να του δώσουμε σε εκείνη τη στιγμή.
//
// ΤΙ ΤΟ ΚΑΝΕΙ ΕΝΤΙΜΟ
//   • Καμία εγγραφή, κανένα email, καμία παρακολούθηση. Απαντά και τελείωσε.
//   • Ο υπολογισμός γίνεται ΣΤΗ ΣΥΣΚΕΥΗ. Κανένα ποσό δεν φεύγει από τον browser.
//   • Λέει ΤΙ ΔΕΝ περιλαμβάνει. Ένας υπολογιστής που παρουσιάζει εκτίμηση ως
//     βεβαιότητα σε φορολογικό θέμα κάνει ζημιά, όχι εντύπωση.
//
// ΜΙΑ ΠΗΓΗ: καλεί το lib/billing/greekTax.ts, το ίδιο που καλεί ο πίνακας
// ελέγχου. Αν διαφωνούσε, ο επισκέπτης θα έβλεπε άλλο νούμερο εδώ και άλλο μετά
// την εγγραφή — που είναι ο γρηγορότερος τρόπος να χάσεις την εμπιστοσύνη του.
// ═══════════════════════════════════════════════════════════════════════════
import { useMemo, useId } from 'react';
import { T, TT, feAuto, fn, fp, fixedCols } from '@/components/tokens';
import {
  rentalIncomeTax, marginalRate, effectiveRentalRate,
  rentalBracketsForYear, FIRST_YEAR_NEW_BRACKETS,
} from '@/lib/billing/greekTax';
import { parseAmount } from '@/lib/core/greek';
import { bankReceiptMatters, presumptiveDeductionRateForYear } from '@/lib/billing/consolidate';
import { PRESUMPTIVE_DEDUCTION_RATE } from '@/lib/accounting/statement';
import { Toggle } from '@/app/dashboard/components/UIComponents';
import { ToolCta, EstimateNote } from '@/app/PublicChrome';
import { useToolState, ToolActions, ToolPaper, ToolPaperFoot } from '@/app/ToolShare';

import LiveResult from '@/components/LiveResult';
// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ 5% ΔΕΝ ΕΙΝΑΙ ΔΕΔΟΜΕΝΟ ΑΠΟ ΤΟ 2026, ΚΑΙ Η ΣΕΛΙΔΑ ΤΟ ΕΛΕΓΕ ΣΑΝ ΝΑ ΕΙΝΑΙ
// ─────────────────────────────────────────────────────────────────────────
// Ο υπολογιστής εφάρμοζε πάντα την τεκμαρτή έκπτωση 5%, με μια σταθερά γραμμένη
// εδώ μέσα. Από 1/1/2026 όμως (ν.5246/2025) η έκπτωση ΠΡΟΫΠΟΘΕΤΕΙ ότι το ενοίκιο
// κατοικίας εισπράττεται με ηλεκτρονικό ή τραπεζικό μέσο· με μετρητά φορολογείται
// το 100% του ενοικίου αντί για το 95%.
//
// Δηλαδή η δημόσια σελίδα έδειχνε στον ιδιοκτήτη που εισπράττει σε μετρητά ΜΙΚΡΟΤΕΡΟ
// φόρο από τον πραγματικό, στην πρώτη του επαφή με το προϊόν. Και το χειρότερο:
// δεν του έλεγε καν ότι υπάρχει η προϋπόθεση, δηλαδή του έκρυβε ακριβώς την
// πληροφορία που θα του γλίτωνε τα χρήματα.
//
// Ο ΣΥΝΤΕΛΕΣΤΗΣ ΕΡΧΕΤΑΙ ΑΠΟ ΤΟ lib, ΟΧΙ ΑΠΟ ΣΤΑΘΕΡΑ ΕΔΩ. Η `presumptiveDeductionRate`
// είναι η ίδια συνάρτηση που τρέχει μέσα στην εφαρμογή (lib/billing/consolidate.ts),
// και η ίδια λογική με τη βραχυχρόνια (lib/tax/shortTermTax.ts). Τρεις οθόνες,
// ένας κανόνας: αν αλλάξει ο νόμος, δεν υπάρχει αντίγραφο να ξεχαστεί.
// ═══════════════════════════════════════════════════════════════════════════

/** Τα πεδία όπως ταξιδεύουν στη διεύθυνση, με τις προεπιλογές τους. */
// ΤΟ ΕΤΟΣ ΕΙΝΑΙ ΠΕΔΙΟ, ΚΑΙ ΗΤΑΝ ΤΟ ΣΟΒΑΡΟΤΕΡΟ ΠΟΥ ΕΛΕΙΠΕ.
// Η σελίδα εφάρμοζε ΠΑΝΤΑ την κλίμακα του 2026 (15/25/35/45). Η δήλωση όμως
// που υποβάλλεται σήμερα αφορά εισοδήματα 2025, όπου δεν υπάρχει το ενδιάμεσο
// 25%: για 20.000 € ενοίκια ο σωστός φόρος είναι 4.250 € και η σελίδα έδειχνε
// 3.850 €. Υποεκτίμηση 400 €, στην ΠΡΩΤΗ επαφή του επισκέπτη με το προϊόν και
// προς την πλευρά που τον εφησυχάζει. Ο πυρήνας ήξερε ήδη τη διάκριση
// (`rentalBracketsForYear`)· η δημόσια σελίδα δεν τον ρωτούσε ποτέ.
const SPEC = { enoikio: '600', mines: '12', trapeza: '1', etos: '2025' } as const;
const PATH = '/ypologismos-forou-enoikion';

// Η ανάγνωση ποσού έρχεται από το lib/core/greek.ts, που ξέρει και τις δύο
// ελληνικές γραφές («1.234,56» και «1,234.56») και τα αρνητικά με παρενθέσεις.
// Είχα γράψει δική μου εκδοχή· ο φύλακας guard-single-source την έκοψε και
// σωστά: ακριβώς αυτή η διπλή υλοποίηση έκανε κάποτε το «1.234» να διαβάζεται
// άλλοτε ως 1,234 και άλλοτε ως 1234, ανάλογα με την οθόνη.
const amount = (s: string): number => Math.max(0, parseAmount(s) ?? 0);

export function RentTaxCalculator({ today }: { today: string }) {
  const [v, set] = useToolState(SPEC, PATH);
  const monthly = v.enoikio, months = v.mines, viaBank = v.trapeza !== '0';
  const year = v.etos === '2026' ? 2026 : 2025;
  const brackets = rentalBracketsForYear(year);
  // Η ΠΡΟΫΠΟΘΕΣΗ ΤΗΣ ΤΡΑΠΕΖΑΣ ΓΕΝΝΗΘΗΚΕ ΤΟ 2026. Για εισοδήματα 2025 η τεκμαρτή
  // έκπτωση 5% δίνεται ανεξάρτητα από τον τρόπο είσπραξης, οπότε η ερώτηση δεν
  // έχει νόημα εκεί και δεν εμφανίζεται: μια ερώτηση που δεν αλλάζει τίποτα
  // διδάσκει τον χρήστη ότι οι ερωτήσεις μας δεν αλλάζουν τίποτα.
  // Η σύγκριση ζει στο lib/billing/consolidate.ts: γραμμένη εδώ, η καρτέλα του
  // λογιστή δεν την έκανε καθόλου και έβγαζε άλλον φόρο για την ίδια χρονιά.
  const bankMatters = bankReceiptMatters(year);
  const monthlyId = useId(), monthsId = useId();

  const r = useMemo(() => {
    const m = amount(monthly);
    const n = Math.min(12, Math.max(0, Math.round(amount(months))));
    const gross = m * n;
    // Τεκμαρτή έκπτωση: ο νόμος τη δίνει χωρίς αποδείξεις, οπότε είναι το
    // ρεαλιστικό ελάχιστο για κάθε ιδιοκτήτη — και ο φόρος υπολογίζεται πάνω σε
    // αυτό, όχι στο μεικτό. Από 1/1/2026 όμως προϋποθέτει τραπεζική είσπραξη,
    // και ο συντελεστής γίνεται μηδέν όταν ο χρήστης πει «μετρητά».
    const rate = presumptiveDeductionRateForYear(year, viaBank);
    const taxable = gross * (1 - rate);
    const tax = rentalIncomeTax(taxable, brackets);
    return {
      gross, taxable, tax, months: n,
      deduction: gross - taxable,
      net: gross - tax,
      marginal: marginalRate(taxable, brackets),
      effective: taxable > 0 ? rentalIncomeTax(taxable, brackets) / taxable : 0,
      monthlyNet: n > 0 ? (gross - tax) / n : 0,
      // ΤΙ ΚΟΣΤΙΖΟΥΝ ΤΑ ΜΕΤΡΗΤΑ, ΣΕ ΕΥΡΩ. Η διαφορά των δύο φόρων, όχι το 5%
      // του ενοικίου: η έκπτωση μειώνει τη ΒΑΣΗ, οπότε το κόστος εξαρτάται από
      // το κλιμάκιο. Στα 7.200 € είναι 54,00 € (15%), στα 48.000 € είναι 108,00 €
      // (45%) — ένα ποσοστό στη θέση αυτού του αριθμού θα ήταν λάθος.
      cashCost: rentalIncomeTax(gross, brackets) - rentalIncomeTax(gross * (1 - PRESUMPTIVE_DEDUCTION_RATE), brackets),
    };
  }, [monthly, months, viaBank, brackets, bankMatters]);

  const field: React.CSSProperties = {
    width: '100%', height: T.h.lg, padding: '0 14px', borderRadius: T.radius.btn,
    border: '1px solid var(--border-default)', background: 'var(--bg-surface)',
    color: 'var(--text-primary)', fontSize: 16, fontFamily: T.font.num,
    // ΚΑΜΙΑ ΑΠΕΝΕΡΓΟΠΟΙΗΣΗ ΤΟΥ ΔΑΧΤΥΛΙΔΙΟΥ ΕΣΤΙΑΣΗΣ. Το `outline: 'none'` εδώ
    // ήταν inline, άρα νικούσε το :focus-visible του globals.css — και δεν
    // έμπαινε τίποτα στη θέση του. Μετρημένο σε πραγματικό περιηγητή: με το
    // πεδίο εστιασμένο, outlineWidth 0px, boxShadow none, εικόνα ΤΑΥΤΟΣΗΜΗ με
    // την ανεστίαστη. Ο χρήστης πληκτρολογίου δεν έβλεπε πού βρίσκεται.
    fontVariantNumeric: 'tabular-nums', boxSizing: 'border-box',
  };
  const label: React.CSSProperties = {
    display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
    textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 8,
  };

  return (
    <div style={{ fontFamily: T.font.sans }}>
      {/* ── Είσοδος: δύο πεδία, τίποτα άλλο ────────────────────────────────
          Ο επισκέπτης δεν έχει λόγο να μας εμπιστευτεί ακόμη. Κάθε επιπλέον
          πεδίο είναι μια αφορμή να φύγει, οπότε ζητάμε το ελάχιστο που δίνει
          σωστή απάντηση. */}
      {/* ΔΥΟ ΓΝΩΣΤΑ ΠΕΔΙΑ, ΡΗΤΑ ΔΥΟ ΣΤΗΛΕΣ. Το auto-fit έβγαζε άλλοτε δύο και
          άλλοτε ένα ανάλογα με το zoom του περιηγητή, στην ίδια οθόνη. */}
      <div {...fixedCols(2, 14, 'start', 'po-tool-controls')}>
        <div>
          <label htmlFor={monthlyId} style={label}>Μηνιαίο ενοίκιο</label>
          <div style={{ position: 'relative' }}>
            <input id={monthlyId} inputMode="decimal" value={monthly}
              onChange={e => set('enoikio', e.target.value)}
              style={{ ...field, paddingRight: 34 }} aria-describedby={`${monthlyId}-unit`}/>
            <span id={`${monthlyId}-unit`} aria-hidden style={{
              position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--text-tertiary)', fontSize: 15, pointerEvents: 'none' }}>€</span>
          </div>
        </div>
        <div>
          <label htmlFor={monthsId} style={label}>Μήνες που νοικιάζεται</label>
          <input id={monthsId} inputMode="numeric" value={months}
            onChange={e => set('mines', e.target.value)} style={field}/>
        </div>
      </div>

      {/* ── Ο ΟΡΟΣ ΠΟΥ ΑΛΛΑΖΕΙ ΤΟ ΝΟΥΜΕΡΟ, ΣΕ ΔΙΚΗ ΤΟΥ ΣΕΙΡΑ ────────────────
             Δεν μπαίνει τρίτο κελί στο πλέγμα των δύο πεδίων: τα άλλα δύο είναι
             ΠΟΣΑ που πληκτρολογείς, αυτό είναι ΓΕΓΟΝΟΣ που δηλώνεις. Μια
             ολόκληρη σειρά με την εξήγηση δίπλα του λέει και τι ρωτάμε και
             γιατί ρωτάμε, χωρίς να στριμωχτεί κάτω από ετικέτα δύο λέξεων. */}
      {/* ── ΠΟΙΑΣ ΧΡΟΝΙΑΣ ΕΙΣΟΔΗΜΑ ─────────────────────────────────────────
          Δύο κουμπιά, όχι μενού: οι επιλογές είναι δύο και θα μείνουν δύο ώσπου
          να αλλάξει ο νόμος. Η προεπιλογή είναι το 2025, γιατί αυτή είναι η
          δήλωση που υποβάλλει κάποιος σήμερα — και επειδή η προηγούμενη εκδοχή
          εφάρμοζε σιωπηλά το 2026 σε ανθρώπους που ρωτούσαν για το 2025. */}
      <div className="po-tool-controls" style={{ marginTop: 16 }}>
        <div style={{ ...TT.label, marginBottom: 8 }}>Εισόδημα ποιας χρονιάς</div>
        <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner }}>
          {([['2025', '2025', 'δηλώνεται τώρα'], ['2026', '2026', 'δηλώνεται το 2027']] as const).map(([val, lab, sub]) => {
            const on = v.etos === val;
            return (
              <button key={val} type="button" onClick={() => set('etos', val)} aria-pressed={on}
                style={{ flex: 1, minHeight: 44, borderRadius: T.radius.inner, border: 'none', cursor: 'pointer',
                  background: on ? 'var(--accent)' : 'transparent',
                  color: on ? 'var(--accent-text)' : 'var(--text-secondary)',
                  fontFamily: T.font.sans, fontSize: 13, fontWeight: 600, lineHeight: 1.25 }}>
                {lab}
                <span style={{ display: 'block', fontSize: 11, fontWeight: 400, opacity: on ? 0.85 : 1 }}>{sub}</span>
              </button>
            );
          })}
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.55, color: 'var(--text-tertiary)' }}>
          {year >= FIRST_YEAR_NEW_BRACKETS
            ? 'Κλίμακα 15 / 25 / 35 / 45% (ν.5246/2025), για εισοδήματα από 1/1/2026.'
            : 'Κλίμακα 15 / 35 / 45%, χωρίς το ενδιάμεσο κλιμάκιο. Ισχύει για τα εισοδήματα του 2025.'}
        </p>
      </div>

      {bankMatters && <div className="po-tool-controls" style={{
        marginTop: 14, padding: '12px 14px', borderRadius: T.radius.inner,
        border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 210 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
            Εισπράττω μέσω τραπέζης
          </div>
          {/* ΤΟ ΚΕΙΜΕΝΟ ΑΛΛΑΖΕΙ ΜΕ ΤΗΝ ΑΠΑΝΤΗΣΗ, ΚΑΙ ΔΕΝ ΛΕΕΙ ΔΥΟ ΦΟΡΕΣ ΤΟ ΙΔΙΟ.
              Όσο ο διακόπτης είναι ανοιχτός αρκεί ο κανόνας· μόλις κλείσει,
              στη θέση του κανόνα μπαίνει το ΠΟΣΟ που κοστίζει η επιλογή. */}
          <p style={{ margin: '3px 0 0', fontSize: 13, lineHeight: 1.55, color: 'var(--text-tertiary)' }}>
            {viaBank
              ? 'Προϋπόθεση για την τεκμαρτή έκπτωση 5%, από 1/1/2026 (ν.5246/2025).'
              : `Με μετρητά φορολογείται το 100% του ενοικίου (ν.5246/2025). Η έκπτωση που χάνεται κοστίζει ${feAuto(r.cashCost)} τον χρόνο.`}
          </p>
        </div>
        <Toggle on={viaBank} onChange={on => set('trapeza', on ? '1' : '0')}
          ariaLabel="Εισπράττω μέσω τραπέζης"/>
      </div>}

      {/* ── Η κεφαλίδα του χαρτιού, πάνω από το αποτέλεσμα ─────────────── */}
      {/* Ο τρόπος είσπραξης μπαίνει στο χαρτί ΜΟΝΟ όταν αλλάζει το ποσό: για
          εισοδήματα 2025 η έκπτωση δίνεται ανεξάρτητα και μια γραμμή που δεν
          επηρεάζει τίποτα διαβάζεται ως προϋπόθεση που δεν υπάρχει. */}
      <ToolPaper title={`Εκτίμηση φόρου ενοικίων ${year}`} on={today} inputs={[
        { k: 'Μηνιαίο ενοίκιο', v: feAuto(amount(monthly)) },
        { k: 'Μήνες', v: fn(r.months) },
        { k: 'Ετήσιο ενοίκιο', v: feAuto(r.gross) },
        ...(bankMatters ? [{ k: 'Είσπραξη', v: viaBank ? 'μέσω τραπέζης' : 'με μετρητά' }] : []),
      ]}/>

      {/* ── Το αποτέλεσμα ──────────────────────────────────────────────── */}
      <div className="po-tool-result" style={{
        marginTop: 20, padding: 'clamp(18px, 4vw, 26px)', borderRadius: T.radius.card,
        background: 'var(--surface-raised)', border: '1px solid var(--border-raised)',
        boxShadow: 'var(--well-inset)',
      }}>
        {/* ═══ ΤΟ ΚΟΚΚΙΝΟ ΚΑΙ ΤΟ ΠΡΑΣΙΝΟ ΕΦΥΓΑΝ ═══════════════════════════════
            Ο φόρος τυπωνόταν ΚΟΚΚΙΝΟΣ και το υπόλοιπο ΠΡΑΣΙΝΟ. Δύο προβλήματα
            σε μία γραμμή. Πρώτον, ο κανόνας του προϊόντος: καμία σημασιολογική
            χρήση πράσινου και κόκκινου — η ιεραρχία βγαίνει από μέγεθος, βάρος,
            θέση και κενό. Δεύτερον και σοβαρότερο, το χρώμα έβγαζε ΚΡΙΣΗ: ο
            φόρος δεν είναι σφάλμα ούτε κίνδυνος, είναι υποχρέωση που μετρήθηκε.
            Ένα εργαλείο που χρωματίζει τον φόρο κόκκινο δεν πληροφορεί,
            υπαινίσσεται — και η σελίδα πουλάει ακρίβεια, όχι στάση.

            Η ιεραρχία υπάρχει και είναι σαφέστερη από πριν: «Σου μένουν» είναι
            ΠΡΩΤΟ και το μεγαλύτερο νούμερο της οθόνης, γιατί είναι η απάντηση
            στην ερώτηση που έφερε εδώ τον επισκέπτη. Ο φόρος δίπλα του, ίδιο
            μέγεθος. Το ετήσιο ενοίκιο τρίτο και μικρότερο: είναι η ΕΙΣΟΔΟΣ,
            που ο χρήστης μόλις πληκτρολόγησε. */}
        {/* ΤΡΙΑ ΝΟΥΜΕΡΑ ΣΕ ΔΥΟ ΜΕΓΕΘΗ ΔΕΝ ΠΑΤΟΥΝ ΣΤΗΝ ΙΔΙΑ ΓΡΑΜΜΗ. Το «Ετήσιο
            ενοίκιο» ήταν μικρότερο από τα άλλα δύο, οπότε η βάση του καθόταν
            ψηλότερα: τρεις αριθμοί δίπλα δίπλα, σε τρία ύψη. Και ήταν ούτως ή
            άλλως η ΕΙΣΟΔΟΣ που μόλις πληκτρολόγησε ο χρήστης, δύο εκατοστά πιο
            πάνω — δηλαδή ένα από τα τρία μεγάλα νούμερα δεν του έλεγε τίποτα.
            Κατεβαίνει στην ανάλυση, όπου ανήκει και μένουν δύο ισομεγέθη
            νούμερα με κοινή γραμμή βάσης: αυτό που κρατάει και αυτό που δίνει. */}
        <div {...fixedCols(2, 24, 'start')}>
          <Figure label="Σου μένουν" value={feAuto(r.net)} big />
          <Figure label="Φόρος" value={feAuto(r.tax)} big />
        </div>
        <LiveResult say={`Φόρος ${feAuto(r.tax)}. Σου μένουν ${feAuto(r.net)}.`} />

        <div style={{ height: 1, background: 'var(--border-subtle)', margin: '20px 0 16px' }}/>

        {/* ΔΥΟ ΓΡΑΦΕΣ ΓΙΑ ΤΟ ΙΔΙΟ ΕΙΔΟΣ ΝΟΥΜΕΡΟΥ, ΔΙΠΛΑ ΔΙΠΛΑ. Ο πραγματικός
            συντελεστής τυπωνόταν «15,00%» και ο οριακός «15%», στην ίδια σειρά:
            ο αναγνώστης ψάχνει τη διαφορά που υπονοούν τα δεκαδικά και δεν
            υπάρχει. Και τα δύο περνούν πλέον από τον ίδιο μορφοποιητή. */}
        {/* Η ΤΕΚΜΑΡΤΗ ΕΚΠΤΩΣΗ ΗΤΑΝ ΑΟΡΑΤΗ, ΚΑΙ ΕΙΝΑΙ Ο ΠΥΡΗΝΑΣ ΤΟΥ ΥΠΟΛΟΓΙΣΜΟΥ.
            Υπήρχε μόνο ως λέξη μέσα σε μια ετικέτα («Φορολογητέο μετά την
            έκπτωση 5%»): ο χρήστης έβλεπε 7.200 να γίνονται 6.840 και έπρεπε να
            βγάλει μόνος του τη διαφορά για να καταλάβει τι έγινε. Γραμμένη ως
            δική της γραμμή, η αλυσίδα διαβάζεται ολόκληρη — ενοίκιο, έκπτωση,
            φορολογητέο — και το πλέγμα βγαίνει έξι κελιά σε τρεις ισόποσες
            σειρές, χωρίς ορφανό. */}
        <dl {...fixedCols(2, 24, 'start')} style={{ ...fixedCols(2, 24, 'start').style, rowGap: 12, margin: 0 }}>
          <Row k="Ετήσιο ενοίκιο" v={feAuto(r.gross)} />
          {/* Η ΕΤΙΚΕΤΑ ΕΛΕΓΕ «5%» ΚΑΙ ΜΕ ΤΟΝ ΔΙΑΚΟΠΤΗ ΚΛΕΙΣΤΟ ΘΑ ΕΛΕΓΕ ΨΕΜΑ:
              «Τεκμαρτή έκπτωση 5%: 0,00 €». Ο συντελεστής ζει πλέον στην
              εξήγηση του διακόπτη, δηλαδή εκεί που αποφασίζεται. */}
          <Row k="Τεκμαρτή έκπτωση" v={feAuto(r.deduction)} />
          <Row k="Φορολογητέο" v={feAuto(r.taxable)} />
          <Row k="Καθαρά ανά μήνα" v={feAuto(r.monthlyNet)} />
          <Row k="Πραγματικός συντελεστής" v={fp(r.effective * 100)} />
          <Row k="Συντελεστής στο επόμενο ευρώ" v={fp(r.marginal * 100)} />
        </dl>
      </div>

      <ToolActions path={PATH} spec={SPEC} values={v}/>

      {/* ── Η κλίμακα, ώστε να φαίνεται από πού βγήκε ο αριθμός ─────────── */}
      {/* ΗΤΑΝ <h2> ΣΤΑ 13 ΕΙΚΟΝΟΣΤΟΙΧΕΙΑ. Δηλαδή επικεφαλίδα δεύτερου επιπέδου —
          ίδιο βάρος στο δέντρο του εγγράφου με τις «Συχνές ερωτήσεις» — σε
          μέγεθος μικρότερο από το κείμενο γύρω της. Ο αναγνώστης οθόνης την
          ανακοίνωνε ως ενότητα, το μάτι την έβλεπε ως ψιλά γράμματα και η
          σελίδα είχε δύο τίτλους που μοιάζουν ίδιοι και δεν είναι.
          Είναι λεζάντα του πίνακα, οπότε γράφεται ως λεζάντα: ίδια τυπογραφία
          με τις άλλες ετικέτες αυτής της κάρτας και σωστή σημασιολογία. */}
      <div style={{ marginTop: 26 }}>
        <div className="po-scroll-x" style={{ overflowX: 'auto' }}>
          <table className="pin-1" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 300 }}>
            <caption style={{ captionSide: 'top', textAlign: 'left', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)',
              paddingBottom: 10 }}>
              Η κλίμακα του {year}
            </caption>
            <thead>
              <tr>
                <th scope="col" style={th}>Εισόδημα</th>
                <th scope="col" style={{ ...th, textAlign: 'right' }}>Συντελεστής</th>
                <th scope="col" style={{ ...th, textAlign: 'right' }}>Φόρος σε αυτό το κλιμάκιο</th>
              </tr>
            </thead>
            <tbody>
              {/* Ο ΣΥΝΤΕΛΕΣΤΗΣ ΔΙΑΒΑΖΟΤΑΝ ΑΠΟ ΤΟ ΚΕΙΜΕΝΟ ΤΗΣ ΕΤΙΚΕΤΑΣ. Η γραμμή
                  έλεγε `Number(row.rate.replace('%',''))`, δηλαδή ο φόρος του
                  κλιμακίου προέκυπτε από την αφαίρεση ενός χαρακτήρα από μια
                  συμβολοσειρά ΓΙΑ ΕΜΦΑΝΙΣΗ. Μια μέρα που κάποιος γράψει «15,0%»
                  ή «15 %», το `Number` δίνει NaN και ο πίνακας τυπώνει κενά
                  κελιά — χωρίς σφάλμα, χωρίς ίχνος. Ο αριθμητικός συντελεστής
                  υπάρχει ήδη στο RENTAL_TAX_BRACKETS_2026, στην ίδια σειρά και
                  το test του greekTax επιβεβαιώνει ότι τα όρια ταυτίζονται. */}
              {/* ΟΙ ΓΡΑΜΜΕΣ ΒΓΑΙΝΟΥΝ ΑΠΟ ΤΗΝ ΙΔΙΑ ΤΗΝ ΚΛΙΜΑΚΑ. Πριν υπήρχε δεύτερος
                  πίνακας μόνο για εμφάνιση (`RENTAL_TAX_ROWS_2026`), δηλαδή τα
                  όρια γραμμένα δύο φορές — και ο πίνακας ήταν καρφωμένος στο
                  2026 ακόμη κι αν ο υπολογισμός άλλαζε. Μία πηγή: αν αλλάξει ο
                  νόμος, αλλάζει σε ένα σημείο και ο πίνακας τον ακολουθεί. */}
              {brackets.map(b => {
                const slice = Math.max(0, Math.min(r.taxable, b.to) - b.from);
                const active = slice > 0;
                // Τα όρια είναι ποσά, άρα περνούν από τον μορφοποιητή όπως κάθε
                // άλλο ποσό της εφαρμογής: ο φύλακας euro-space το ζήτησε και έχει
                // δίκιο — μια στήλη με «12.000 €» δίπλα σε «1.800,00 €» δεν στοιχίζεται.
                const range = b.to === Infinity
                  ? `Πάνω από ${feAuto(b.from)}`
                  : `${feAuto(b.from === 0 ? 0 : b.from + 1)} – ${feAuto(b.to)}`;
                return (
                  <tr key={b.from} style={{ background: active ? 'var(--accent-soft)' : 'transparent' }}>
                    <td style={{ ...td, fontWeight: active ? 650 : 400, color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{range}</td>
                    {/* ΤΡΙΤΗ ΓΡΑΦΗ ΓΙΑ ΤΟ ΙΔΙΟ ΕΙΔΟΣ ΝΟΥΜΕΡΟΥ. Η στήλη έγραφε «15%»
                        ενώ δύο εκατοστά πιο πάνω ο πραγματικός συντελεστής γράφει
                        «15,00%»: ο αναγνώστης ψάχνει τη διαφορά που υπονοούν τα
                        δεκαδικά και δεν υπάρχει. Ενας μορφοποιητής ποσοστού. */}
                    <td style={{ ...td, textAlign: 'right', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{fp(b.rate * 100)}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums',
                      fontWeight: active ? 650 : 400,
                      color: active ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                      {feAuto(slice * b.rate)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Τι ΔΕΝ περιλαμβάνει ────────────────────────────────────────────
          Αυτό το κουτί δεν είναι νομική κάλυψη· είναι ο λόγος που ο υπολογιστής
          αξίζει εμπιστοσύνη. Ένα εργαλείο που παρουσιάζει εκτίμηση ως βεβαιότητα
          σε φορολογικό θέμα κάνει ζημιά στον χρήστη και στη φήμη μας. */}
      {/* ΤΟ ΠΟΡΤΟΚΑΛΙ ΕΦΥΓΕ. Το κουτί φορούσε τα χρώματα προειδοποίησης
          (`--warning-soft` / `--warning-border`), δηλαδή το σήμα που η εφαρμογή
          κρατά για εκκρεμότητες και κινδύνους. Εδώ όμως δεν υπάρχει κίνδυνος:
          υπάρχει το εύρος του εργαλείου, γραμμένο τίμια. Βαμμένο πορτοκαλί,
          διαβαζόταν ως «κάτι πάει στραβά» και ο επισκέπτης το προσπερνούσε
          ακριβώς όπως προσπερνά κάθε κίτρινο πλαίσιο. Ουδέτερη επιφάνεια και
          το βάρος του το δίνει η θέση του: ακριβώς κάτω από τον αριθμό. */}
      <div className="po-tool-note" style={{
        marginTop: 22, padding: 'clamp(14px,2.6vw,18px)', borderRadius: T.radius.inner,
        background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
      }}>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--text-primary)' }}>Τι δεν περιλαμβάνει.</strong>{' '}
          Ο υπολογισμός αφορά <strong>μόνο</strong> το εισόδημα από ενοίκια, με την τεκμαρτή
          έκπτωση 5% που δίνει ο νόμος χωρίς δικαιολογητικά. Δεν περιλαμβάνει άλλα
          εισοδήματά σου, ΕΝΦΙΑ, τέλος επιτηδεύματος, εισφορά αλληλεγγύης, ούτε
          ειδικές περιπτώσεις (βραχυχρόνια μίσθωση, συνιδιοκτησία, νομικό πρόσωπο,
          κενά διαστήματα, ανείσπρακτα). <EstimateNote />
        </p>
      </div>

      <ToolPaperFoot path={PATH} spec={SPEC} values={v}/>

      <ToolCta
        title="Θέλεις να μη χρειάζεται να το ξαναϋπολογίσεις;"
        body="Το PROPERWISE διατηρεί οργανωμένα ενοίκια, λογαριασμούς και δαπάνες όλη τη χρονιά και εξάγει με ένα κλικ όσα ζητά ο λογιστής σου."
      />
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 700,
  letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)',
  borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap',
};
const td: React.CSSProperties = {
  padding: '9px 10px', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)',
};

/**
 * Ένα μετρημένο νούμερο με την ετικέτα του.
 *
 * ΧΩΡΙΣ ΠΑΡΑΜΕΤΡΟ ΧΡΩΜΑΤΟΣ, ΕΠΙΤΗΔΕΣ. Είχε `tone: 'positive' | 'negative'` και
 * το μόνο που έκανε ήταν να βάφει τον φόρο κόκκινο και το υπόλοιπο πράσινο.
 * Όσο η παράμετρος υπάρχει, ο επόμενος θα τη χρησιμοποιήσει. Η έμφαση δίνεται
 * με μέγεθος και σειρά, που δουλεύουν και σε ασπρόμαυρη εκτύπωση και σε κάθε
 * μορφή αχρωματοψίας.
 */
function Figure({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
        color: 'var(--text-tertiary)', marginBottom: 8 }}>{label}</div>
      <div style={{
        fontFamily: T.font.num, fontSize: big ? 'clamp(24px, 4.4vw, 32px)' : 'clamp(18px, 3vw, 21px)',
        fontWeight: 680, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1,
        color: big ? 'var(--text-primary)' : 'var(--text-secondary)',
      }}>{value}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
      <dt style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{k}</dt>
      <dd style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)',
        fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{v}</dd>
    </div>
  );
}
