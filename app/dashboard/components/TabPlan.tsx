'use client';

// ═══════════════════════════════════════════════════════════════════════════
// ΑΞΙΟΠΟΙΗΣΗ — η οθόνη που απαντά σε ΜΙΑ ερώτηση: «τι κάνω τώρα με αυτό το
// ακίνητο;». Τέσσερις μορφές, μία για κάθε κατάσταση όπου η απάντηση δεν είναι
// προφανής: κενό, αμφισβητούμενο, προς πώληση, ανακαίνιση. Στη μακροχρόνια και
// τη βραχυχρόνια μίσθωση δεν υπάρχει σχέδιο να φτιαχτεί — υπάρχει ενοίκιο να
// εισπραχθεί — και στην ιδιοχρησία δεν υπάρχει καν ερώτηση. Ποια κατάσταση
// δείχνει η καρτέλα το ορίζει το lib/property/visibility, όχι αυτό το αρχείο.
//
// ══ ΤΙ ΑΛΛΑΞΕ ΤΕΛΕΙΩΣ, ΚΑΙ ΓΙΑΤΙ ═══════════════════════════════════════════
//
// Η προηγούμενη μορφή έλεγε τα σωστά πράγματα με πάρα πολλά λόγια. Κάθε γραμμή
// άνοιγε και έβγαζε μια παράγραφο, από κάτω δύο σειρές «ΠΟΤΕ» και «ΑΝ
// ΠΑΡΑΛΕΙΦΘΕΙ»· κάθε επιλογή κουβαλούσε δική της παράγραφο συν τρεις
// ετικέτες αξόνων. Μετρημένο στην πώληση: πέντε επιλογές επί τρεις άξονες
// σημαίνει ΔΕΚΑΠΕΝΤΕ φορές τυπωμένες οι λέξεις «ΚΟΠΟΣ», «ΡΙΣΚΟ», «ΧΡΟΝΟΣ» —
// για να πουν τρία πράγματα. Και από πάνω τους μια πρόταση που ΠΕΡΙΕΓΡΑΦΕ τη
// διάταξη («ίδιοι άξονες σε κάθε γραμμή: τι πιάνει, τι κόπο θέλει…») αντί να
// είναι η διάταξη. Το αποτέλεσμα διαβαζόταν σαν φυλλάδιο, όχι σαν εργαλείο.
//
// Η νέα φιλοσοφία είναι δύο κανόνες και τίποτε άλλο:
//
//   1. ΜΙΑ ΓΡΑΜΜΗ ΑΝΑ ΠΡΑΓΜΑ. Βήμα, επιλογή, πρόγραμμα, κανόνας, εκκρεμότητα:
//      μία σειρά, ίδιο ύψος, ίδιες στήλες, ίδια αφετηρία κειμένου. Καμία
//      παράγραφος δεν ζει στην επιφάνεια. Ο χρήστης σαρώνει κάθετα και βλέπει
//      ΤΙ υπάρχει· δεν διαβάζει για να το ανακαλύψει.
//
//   2. Η ΕΞΗΓΗΣΗ ΖΕΙ ΣΕ ΚΥΚΛΑΚΙ. Ό,τι ήταν παράγραφος («τι σημαίνει», «πότε»,
//      «αν παραλειφθεί», «ταιριάζει αν», «τι πληρώνεις») μπαίνει πίσω από ένα
//      ⓘ δίπλα στον τίτλο της γραμμής του. Τίποτα δεν κόπηκε και τίποτα δεν
//      αραιώθηκε: το κείμενο είναι το ίδιο, με τις ίδιες ετικέτες· ζει
//      ΠΑΝΤΑ στο δέντρο προσβασιμότητας — το `InfoHint` το γράφει σε κρυφό
//      κόμβο με `aria-describedby`, ανοιχτό ή κλειστό.
//
// ΔΥΟ ΧΕΙΡΟΝΟΜΙΕΣ, ΔΥΟ ΝΟΗΜΑΤΑ, ΚΑΜΙΑ ΕΠΙΚΑΛΥΨΗ:
//   ⓘ  εξηγεί ΜΙΑ ΓΡΑΜΜΗ. Δεν μετακινεί τίποτα, δεν αλλάζει το ύψος της οθόνης.
//   ›  ανοίγει ΜΙΑ ΛΙΣΤΑ (ομάδα βημάτων, φάκελος αναφοράς). Τίποτε άλλο.
// Πριν, το ίδιο βελάκι έκανε και τα δύο σε δύο επίπεδα ένθεσης: το βελάκι της
// ομάδας και το βελάκι του βήματος κάθονταν στην ίδια στήλη, δεκαοκτώ
// εικονοστοιχεία απόσταση, με διαφορετική συνέπεια το καθένα.
//
// Η ΣΥΓΚΡΙΣΗ ΕΙΝΑΙ ΠΙΝΑΚΑΣ, ΓΙΑΤΙ ΠΙΝΑΚΑΣ ΕΙΝΑΙ. Οι τρεις άξονες γίνονται τρεις
// στήλες με ΜΙΑ κεφαλίδα: δεκαπέντε ετικέτες έγιναν τρεις και οι τιμές
// στοιχίζονται κάθετα, δηλαδή η σύγκριση γίνεται με το μάτι αντί με τη μνήμη.
// Σε στενή οθόνη ο πίνακας δεν στέκει, οπότε οι τρεις τιμές πέφτουν σε μία
// σειρά και παίρνουν πίσω το ουσιαστικό τους («Λίγος κόπος», «Μέτριο ρίσκο»):
// το ίδιο κείμενο, μία φορά ορατό ανά πλάτος, ποτέ δύο.
//
// ΤΟ ΧΡΩΜΑ ΛΕΕΙ ΕΝΑ ΠΡΑΓΜΑ: «ΕΔΩ ΠΑΤΑΣ». Το μπλε εμφανίζεται μόνο στο κουτάκι
// που τσεκάρεις, όπως ακριβώς και στις Εργασίες. Καμία πράσινη επιβράβευση,
// κανένα πορτοκαλί σήμα: η πρόοδος είναι μέτρηση, όχι καλά νέα. Και η θέση σου
// στη σειρά δεν γράφεται με λέξεις («ΤΟ ΕΠΟΜΕΝΟ» από πάνω, γεμάτος κρίκος
// δίπλα, αυτόματο άνοιγμα από κάτω: τρία σήματα για ένα γεγονός) αλλά με ΕΝΑ
// σήμα, τυπογραφικό: το επόμενο βήμα είναι το μόνο σε πλήρες βάρος και πλήρη
// αντίθεση, τα υπόλοιπα ήσυχα, τα τελειωμένα διαγραμμένα.
//
// ΤΙ ΚΡΑΤΑΕΙ ΑΥΤΟ ΤΟ ΑΡΧΕΙΟ ΚΑΙ ΤΙ ΟΧΙ
// Καμία γνώση. Όλο το περιεχόμενο και όλη η λογική ζουν στο `lib/property/plan`
// με tests. Εδώ μένει η παρουσίαση και η μνήμη του χρήστη (τι έχει τσεκάρει, τι
// είδος εκκρεμότητας δήλωσε, τι δεδομένα έβαλε) — τοπικά, ανά χρήστη και ανά
// ακίνητο, χωρίς να απαιτείται νέος πίνακας στη βάση.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { T, TT, Card, SecHdr, PageTitle, fixedCols, settingsField, feAuto, pageShell } from '@/components/Theme';
import { InfoHint } from './InfoHint';
import { feSigned } from '@/lib/core/format';
import type { PropertyStatus } from '@/lib/property/status';
import {
  planFor, groupSteps, vacancyCost, renovationLoan, saleEstimate,
  ACTOR_LABEL, EFFORT_LABEL, RISK_LABEL, FUNDING_KIND_LABEL, DISPUTE_KINDS, PLAN_DISCLAIMER,
  type Step, type Option, type DisputeKind, type VacancyCostInput,
} from '@/lib/property/plan';

// Το ελάχιστο σχήμα ακινήτου που χρειάζεται η οθόνη. Μπαίνει ως παράμετρος τύπου
// ώστε να δέχεται και αντικείμενα με ΠΕΡΙΣΣΟΤΕΡΑ πεδία (η γραμμή της βάσης έχει
// δεκάδες) χωρίς μετατροπή στον καλούντα και χωρίς να αλλάζει το συμβόλαιο.
interface PlanProperty {
  id: string;
  name: string;
  address?: string | null;
  sqm?: number | null;
  value?: number | null;
  year_built?: number | null;
  postal_code?: string | null;
  prop_type?: string | null;
}

// Υποθέσεις ΜΟΝΟ για το μέγεθος της δόσης επισκευαστικού, δηλωμένες ρητά στην
// οθόνη δίπλα στον αριθμό. Δεν είναι προσφορά τράπεζας ούτε τρέχον επιτόκιο.
const ASSUMED_RATE_PCT = 6;
const ASSUMED_YEARS = 7;

// ── Μικρά δομικά στοιχεία της οθόνης ──────────────────────────────────────

/**
 * Μια ενότητα: κάρτα με επικεφαλίδα, όπως σε κάθε άλλη καρτέλα της εφαρμογής.
 *
 * Ο ΥΠΟΤΙΤΛΟΣ ΕΓΙΝΕ ΚΥΚΛΑΚΙ. Κάθε ενότητα είχε από κάτω μια πρόταση που τη
 * διάβαζες μία φορά στη ζωή σου και μετά την προσπερνούσες για πάντα, κρατώντας
 * μια σειρά σε κάθε επίσκεψη. Ως `info` λέει τα ίδια ακριβώς λόγια και κρατά
 * δεκατέσσερα εικονοστοιχεία δίπλα στον τίτλο.
 */
function Panel({ label, info, right, children }: {
  label: string; info?: ReactNode; right?: ReactNode; children: ReactNode;
}) {
  return (
    <Card pad="lg" gap={false} style={{ marginBottom: T.sp.lg }}>
      <SecHdr label={label} info={info} right={right} />
      {children}
    </Card>
  );
}

const ROW_BLEED: CSSProperties = { margin: '0 -12px', padding: '0 12px' };

/**
 * Το περιεχόμενο ενός κυκλακιού: μία πρόταση· από κάτω ό,τι έχει ετικέτα.
 *
 * ΟΛΑ ΣΕ `span`, ΚΑΙ ΔΕΝ ΕΙΝΑΙ ΛΕΠΤΟΜΕΡΕΙΑ. Το ίδιο δέντρο γράφεται δύο φορές:
 * μία στο popover και μία στον κρυφό κόμβο που δείχνει το `aria-describedby`.
 * Ο κρυφός κόμβος είναι `span`, οπότε ένα `<p>` ή ένα `<div>` μέσα του είναι
 * άκυρο HTML — ροή μπλοκ μέσα σε ενσωματωμένο στοιχείο. Το `display: block`
 * δίνει το ίδιο οπτικό αποτέλεσμα χωρίς να παραβεί τη γραμματική.
 */
function Tip({ lead, rows }: { lead?: string; rows?: readonly (readonly [string, string | undefined])[] }) {
  return (
    <>
      {lead && <span style={{ display: 'block' }}>{lead}</span>}
      {(rows ?? []).filter(([, v]) => v).map(([k, v]) => (
        <span key={k} style={{ display: 'block', marginTop: 9 }}>
          <span style={{ ...TT.label, fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 2 }}>{k}</span>
          {v}
        </span>
      ))}
    </>
  );
}

/**
 * Η στήλη της ιδιότητας: ποιος το κάνει, τι είδους χρήμα είναι.
 *
 * ΤΟ ΠΛΑΤΟΣ ΤΗΣ ΒΓΑΙΝΕΙ ΑΠΟ ΤΗ ΜΑΚΡΥΤΕΡΗ ΛΕΞΗ, ΟΧΙ ΑΠΟ ΤΟ ΜΑΤΙ. Το
 * «ΣΥΜΒΟΛΑΙΟΓΡΑΦΟΣ» είναι μία λέξη: δεν σπάει πουθενά, οπότε σε στενότερη στήλη
 * δεν αναδιπλώνεται — ξεχειλίζει και κολλάει πάνω στον γείτονά της. Μετρημένο
 * στην πώληση, 900 εικονοστοιχεία: με στήλη 116 η λέξη ακουμπούσε το βελάκι
 * χωρίς κενό. Το πλάτος ζει στο φύλλο στυλ μαζί με το ερώτημα μέσων που το
 * καταργεί σε κινητό.
 */
const Tag = ({ children }: { children: ReactNode }) => (
  <span className="plan-tag" style={{ ...TT.label, fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.3 }}>
    {children}
  </span>
);

/** Το βελάκι της αποκάλυψης. Ένα σχήμα, ένα νόημα: «εδώ ανοίγει λίστα». */
const Caret = ({ open }: { open: boolean }) => (
  <ChevronRight aria-hidden size={15} style={{
    flexShrink: 0, color: 'var(--text-tertiary)',
    transform: open ? 'rotate(90deg)' : 'none',
    transition: `transform .18s ${T.ease.standard}`,
  }} />
);

/**
 * Ο τίτλος μιας γραμμής, με τα τρία βάρη που έχει η οθόνη.
 *
 * `next` είναι το βήμα που ακολουθεί, `done` ό,τι τελείωσε, `plain` όλα τα
 * άλλα. Δεν υπάρχει τέταρτο. Τα ίδια τρία ισχύουν και εκεί που δεν υπάρχει
 * σειρά (επιλογές, προγράμματα, κανόνες): εκεί όλα είναι `plain` και η οθόνη
 * μένει επίπεδη, γιατί όντως είναι.
 */
const RowTitle = ({ state, children }: { state: 'next' | 'done' | 'plain'; children: ReactNode }) => (
  <span style={{
    fontFamily: T.font.sans, fontSize: 14, lineHeight: 1.35,
    fontWeight: state === 'next' ? 700 : 500,
    color: state === 'done' ? 'var(--text-tertiary)' : state === 'next' ? 'var(--text-primary)' : 'var(--text-secondary)',
    textDecoration: state === 'done' ? 'line-through' : 'none',
  }}>{children}</span>
);

/**
 * ΤΟ ΙΔΙΟ ΧΕΙΡΙΣΤΗΡΙΟ ΜΕ ΤΙΣ ΕΡΓΑΣΙΕΣ, ΓΙΑΤΙ ΕΙΝΑΙ Η ΙΔΙΑ ΠΡΑΞΗ.
 *
 * Ήταν ΠΡΑΣΙΝΟ (`--positive`), ενώ το αντίστοιχο κουμπί των Εργασιών είναι ΜΠΛΕ:
 * δύο χρώματα για «το τσέκαρα», σε δύο οθόνες της ίδιας εφαρμογής. Και το
 * πράσινο έλεγε κάτι που δεν ισχύει — η μπάρα προόδου δίπλα του γεμίζει με το
 * χρώμα του κειμένου, γιατί η πρόοδος είναι μέτρηση, όχι καλά νέα.
 *
 * ΤΟ ΠΕΡΙΓΡΑΜΜΑ ΔΕΙΧΝΕΙ ΠΟΥ ΒΡΙΣΚΕΣΑΙ. Όλα τα άτσεκα κουτάκια είχαν το ίδιο
 * έντονο περίγραμμα, οπότε η ράγα ήταν δώδεκα ισοδύναμοι κρίκοι. Τώρα ο κρίκος
 * του επόμενου βήματος είναι ο μόνος με πλήρες περίγραμμα: η θέση σου στη
 * διαδρομή φαίνεται από ένα μέτρο απόσταση, χωρίς λέξη και χωρίς χρώμα.
 */
const Check = ({ on, next }: { on: boolean; next?: boolean }) => (
  <span aria-hidden style={{
    width: 20, height: 20, borderRadius: '50%', flexShrink: 0, boxSizing: 'border-box',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: on ? 'var(--accent)' : 'var(--surface-raised)',
    border: `2px solid ${on ? 'var(--accent)' : next ? 'var(--border-default)' : 'var(--border-subtle)'}`,
  }}>
    {on && (
      <svg aria-hidden="true" width={10} height={10} viewBox="0 0 12 12"><polyline points="2,6 5,9 10,3" fill="none" stroke="var(--text-inverse)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    )}
  </span>
);

/** Ήσυχο κουμπί κειμένου, για δεύτερες ενέργειες μέσα σε επικεφαλίδα. */
const quietBtn: CSSProperties = {
  appearance: 'none', background: 'none', border: 'none', padding: 0, cursor: 'pointer',
  fontFamily: T.font.sans, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
};

/** Χειριστήριο επιλογής ενός από λίγα: ίδιο σχήμα σε είδος εκκρεμότητας και σε μεσίτη. */
function Pick({ on, onClick, small, children }: { on: boolean; onClick: () => void; small?: boolean; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      style={{
        appearance: 'none', cursor: 'pointer', height: small ? T.h.sm : T.h.md, padding: small ? '0 14px' : '0 16px',
        borderRadius: T.radius.pill, fontFamily: T.font.sans, fontSize: small ? 12 : 13,
        fontWeight: on ? 700 : 500,
        background: on ? 'var(--bg-elevated)' : 'transparent',
        border: `1px solid ${on ? 'var(--border-default)' : 'var(--border-subtle)'}`,
        color: on ? 'var(--text-primary)' : 'var(--text-secondary)',
        boxShadow: on ? 'var(--highlight-inset), var(--elev-1)' : 'none',
        transition: 'background .15s, color .15s',
      }}>
      {children}
    </button>
  );
}

/**
 * Πεδίο ποσού: ετικέτα, κουτί και το ευρώ ΜΕΣΑ στο κουτί, δεξιά.
 *
 * Το σύμβολο δεν είναι διακόσμηση — είναι η μονάδα. Χωρίς αυτό, τέσσερα γυμνά
 * κουτιά δίπλα δίπλα («ΕΝΦΙΑ», «Κοινόχρηστα», «Πάγια», «Ασφάλιστρο») δεν λένε αν
 * περιμένουν ευρώ, μήνες ή ποσοστό. Το ίδιο σχήμα χρησιμοποιούν ήδη οι
 * Λογαριασμοί και το Καθολικό Δαπανών.
 *
 * ΚΑΙ Η ΕΤΙΚΕΤΑ ΕΧΕΙ ΣΤΑΘΕΡΟ ΥΨΟΣ ΔΥΟ ΣΕΙΡΩΝ, ΓΙΑΤΙ ΑΛΛΙΩΣ ΤΑ ΚΟΥΤΙΑ ΔΕΝ
 * ΕΥΘΥΓΡΑΜΜΙΖΟΝΤΑΙ. Μετρημένο στα 900: το «ΠΑΓΙΑ ΡΕΥΜΑ/ΝΕΡΟ (ΜΗΝΑΣ)» έπιανε
 * δύο σειρές και τα άλλα τρία μία, οπότε το τρίτο κουτί κάθισε δεκαπέντε
 * εικονοστοιχεία χαμηλότερα από τα γειτονικά του — τέσσερα πεδία της ίδιας
 * σειράς σε δύο διαφορετικά ύψη. Τα 33 είναι δύο σειρές: το ύψος γραμμής της
 * ετικέτας μετρήθηκε στον περιηγητή, 16,5 εικονοστοιχεία. Γραμμένο πρώτα ως 26
 * («11 επί 1,2 επί 2»), δηλαδή με αριθμητική αντί για μέτρηση, δεν έφτανε: το
 * τρίτο κουτί έμενε επτά εικονοστοιχεία χαμηλότερα από τα άλλα τρία.
 */
function MoneyField({ label, hint, value, onChange }: {
  label: string; hint?: string; value: number | null | undefined; onChange: (v: number | undefined) => void;
}) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ ...TT.label, fontSize: 11, color: 'var(--text-tertiary)', display: 'block', minHeight: 33 }}>{label}</span>
      <span style={{ position: 'relative', display: 'block', marginTop: 6 }}>
        {/* ΤΟ placeholder ΗΤΑΝ «0» ΚΑΙ ΤΑ ΠΕΔΙΑ ΔΙΑΒΑΖΟΝΤΑΝ ΩΣ ΜΗΔΕΝΙΚΑ. Το ίδιο
            σφάλμα είχε ήδη βρεθεί στο ιστορικό κατανάλωσης του ρεύματος: κενή
            φόρμα που δηλώνει «ΕΝΦΙΑ μηδέν» δεν είναι κενή, είναι λάθος απάντηση.
            Το άγνωστο δεν γράφεται μηδέν. */}
        <input type="number" min={0} inputMode="decimal" className="po-field" placeholder=""
          value={value ?? ''}
          onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          style={{ ...settingsField, height: T.h.md, fontSize: 13, paddingRight: 30 }} />
        <span aria-hidden style={{
          position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)',
          fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.num, pointerEvents: 'none',
        }}>€</span>
      </span>
      {hint && <span style={{ ...TT.caption, color: 'var(--text-tertiary)', display: 'block', marginTop: 5 }}>{hint}</span>}
    </label>
  );
}

// ── Η ΜΝΗΜΗ ΤΟΥ ΧΡΗΣΤΗ ────────────────────────────────────────────────────
//
// Τι έχει τσεκάρει, τι είδος εκκρεμότητας δήλωσε, τι δεδομένα έβαλε. Τοπικά, ανά
// χρήστη και ανά ακίνητο: σε κοινό υπολογιστή τα βήματα του ενός δεν
// εμφανίζονται στον άλλον. Χωρίς τοπική αποθήκευση (ιδιωτική περιήγηση) η οθόνη
// δουλεύει κανονικά — απλώς δεν θυμάται. Δεν είναι λόγος να μη φορτώσει.

function readLocal<V>(key: string, fallback: V, valid: (v: unknown) => boolean): V {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return valid(parsed) ? (parsed as V) : fallback;
  } catch {
    return fallback;
  }
}

const writeLocal = (key: string, value: unknown): void => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* δες παραπάνω */ }
};

const isStringArray = (v: unknown): boolean => Array.isArray(v) && v.every(x => typeof x === 'string');
const isObject = (v: unknown): boolean => !!v && typeof v === 'object' && !Array.isArray(v);
const isKind = (v: unknown): boolean => DISPUTE_KINDS.some(k => k.key === v);

// ── Η καρτέλα ─────────────────────────────────────────────────────────────

/**
 * Το `key` δεν είναι διακοσμητικό: όταν αλλάξει χρήστης, ακίνητο ή κατάσταση,
 * ο πίνακας ξεκινά από την αρχή και ξαναδιαβάζει τη σωστή μνήμη, αντί να
 * κρατήσει τα τσεκαρισμένα του προηγούμενου ακινήτου.
 */
export default function TabPlan<P extends PlanProperty>(props: {
  propertyId: string;
  userId: string;
  status: PropertyStatus;
  property: P;
}) {
  return <PlanScreen key={`${props.userId}:${props.propertyId}:${props.status}`} {...props} />;
}

function PlanScreen<P extends PlanProperty>({ propertyId, userId, status, property }: {
  propertyId: string;
  userId: string;
  status: PropertyStatus;
  property: P;
}) {
  const base = `pos-plan-${userId}-${propertyId}`;
  const doneKey = `${base}-done-${status}`;
  const kindKey = `${base}-kind`;
  const costKey = `${base}-cost`;

  const [done, setDone] = useState<string[]>(() => readLocal<string[]>(doneKey, [], isStringArray));
  const [kind, setKind] = useState<DisputeKind>(() => readLocal<DisputeKind>(kindKey, 'unknown', isKind));
  const [costs, setCosts] = useState<VacancyCostInput>(() => readLocal<VacancyCostInput>(costKey, {}, isObject));
  const [loanAmount, setLoanAmount] = useState<number | null>(null);
  // ΤΟ «ΚΑΘΑΡΟ ΕΣΟΔΟ» ΧΡΕΩΝΕ ΠΑΝΤΑ ΜΕΣΙΤΗ, ΧΩΡΙΣ ΝΑ ΤΟ ΛΕΕΙ. Η `saleEstimate`
  // δέχεται `useAgent` με προεπιλογή «ναι» και καλούνταν χωρίς όρισμα. Στην
  // ίδια οθόνη ο χρήστης καλείται να διαλέξει ΑΚΡΙΒΩΣ ΑΥΤΟ: «Με μεσίτη» ή «Μόνος
  // σου». Του δείχναμε το καθαρό ποσό της μίας επιλογής και το παρουσιάζαμε ως
  // το καθαρό ποσό της πώλησης. Τώρα το νούμερο ακολουθεί την επιλογή.
  const [useAgent, setUseAgent] = useState(true);

  // ── ΤΙ ΕΙΝΑΙ ΑΝΟΙΧΤΟ ─────────────────────────────────────────────────────
  // ΔΥΟ ΚΑΤΑΣΤΑΣΕΙΣ, ΟΧΙ ΕΞΙ. Ήταν `openStep`, `shutGroups`, `openFund`,
  // `openOption`, `refOpen`, `openRef`: έξι μεταβλητές για να θυμούνται ποια
  // παράγραφος είναι ανοιχτή σε πέντε λίστες. Οι παράγραφοι έφυγαν από την
  // επιφάνεια και μαζί τους οι τέσσερις καταστάσεις. Μένουν οι δύο ΛΙΣΤΕΣ που
  // όντως ανοίγουν και κλείνουν: οι ομάδες της σειράς και ο φάκελος αναφοράς.
  const [shutGroups, setShutGroups] = useState<Record<string, boolean>>({});
  const [refOpen, setRefOpen] = useState(false);
  // ΤΑ ΠΕΔΙΑ ΤΟΥ ΚΕΝΟΥ ΜΑΖΕΥΟΝΤΑΝ ΚΑΤΩ ΑΠΟ ΤΑ ΔΑΧΤΥΛΑ ΤΟΥ ΧΡΗΣΤΗ. Η κατάσταση
  // υπολογιζόταν από το τρέχον σύνολο («υπάρχει νούμερο, άρα κλείσε»), οπότε με
  // το που έμπαινε ο ΕΝΦΙΑ — πρώτο από τα τέσσερα πεδία — η φόρμα εξαφανιζόταν
  // και τα άλλα τρία δεν συμπληρώνονταν ποτέ. Το κριτήριο είναι «τι ήξερε η
  // οθόνη ΟΤΑΝ ΑΝΟΙΞΕ»: όποιος ξαναμπαίνει με συμπληρωμένα δεδομένα βλέπει το
  // αποτέλεσμα, όποιος τα γράφει τώρα δεν χάνει τη φόρμα από μπροστά του.
  const [costsOpen, setCostsOpen] = useState(() => vacancyCost(costs).monthly === 0);

  const write = useCallback((key: string, value: unknown) => { writeLocal(key, value); }, []);

  const toggle = useCallback((id: string) => {
    setDone(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      write(doneKey, next);
      return next;
    });
  }, [doneKey, write]);

  const pickKind = useCallback((k: DisputeKind) => {
    setKind(k);
    write(kindKey, k);
  }, [kindKey, write]);

  const setCost = useCallback((field: keyof VacancyCostInput, v: number | undefined) => {
    setCosts(prev => {
      const next = { ...prev, [field]: v };
      write(costKey, next);
      return next;
    });
  }, [costKey, write]);

  const plan = useMemo(() => planFor({
    status, done, disputeKind: kind,
    sqm: property.sqm ?? null,
    value: property.value ?? null,
    yearBuilt: property.year_built ?? null,
  }), [status, done, kind, property.sqm, property.value, property.year_built]);

  const drain = useMemo(() => vacancyCost(costs), [costs]);
  const sale = useMemo(() => saleEstimate(property.value ?? 0, { useAgent }), [property.value, useAgent]);
  // Ενδεικτική δόση επισκευαστικού: το τοκοχρεολύσιο έρχεται από το lib/loans και
  // το επιτόκιο δηλώνεται ρητά ως υπόθεση, ακριβώς κάτω από τον αριθμό.
  const loan = useMemo(() => renovationLoan(loanAmount ?? 0, ASSUMED_RATE_PCT, ASSUMED_YEARS), [loanAmount]);

  // Καρτέλα που δεν αφορά αυτή την κατάσταση δεν πρέπει να είναι ορατή (το κρίνει
  // το lib/property/visibility). Αν παρ' όλα αυτά αποδοθεί, δεν σκάει και δεν
  // επινοεί περιεχόμενο.
  if (!plan) return null;

  const checked = new Set(done);
  const isDispute = plan.status === 'disputed';
  const groups = groupSteps(plan.steps);

  /**
   * Ένα βήμα πάνω στη ράγα.
   *
   * Η ράγα είναι δύο κομμάτια γραμμής μέσα στην πρώτη στήλη: ένα κοντό από πάνω
   * (μόνο αν υπάρχει προηγούμενο βήμα) και ένα που τεντώνεται ως το κάτω άκρο
   * της γραμμής (μόνο αν υπάρχει επόμενο). Έτσι δεν προεξέχει στο πρώτο και στο
   * τελευταίο βήμα.
   *
   * ΤΟ ΚΟΥΜΠΙ ΕΙΝΑΙ 44 ΕΠΙ 44, ΤΟ ΣΗΜΑΔΙ 20 ΕΠΙ 20. Ο κρίκος είναι ο μόνος
   * στόχος αφής της γραμμής και ήταν όσο και το σχήμα του, δηλαδή στο μισό του
   * ορίου. Το πλάτος βγαίνει έξω από τη στήλη με αρνητικό περιθώριο, ώστε η ράγα
   * να μείνει ακριβώς εκεί που ήταν και η γραμμή να μη μετακινηθεί ούτε κατά ένα.
   */
  const stepRow = (s: Step, first: boolean, last: boolean) => {
    const on = checked.has(s.id);
    const isNext = plan.next?.id === s.id;
    const rail: CSSProperties = { width: 1, background: 'var(--border-subtle)' };
    return (
      <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '20px minmax(0, 1fr)', gap: 14, alignItems: 'stretch' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ ...rail, flex: '0 0 14px', opacity: first ? 0 : 1 }} />
          {/* ΤΟ ΚΟΥΜΠΙ ΕΙΝΑΙ 44 ΚΑΙ ΚΑΤΑΛΑΜΒΑΝΕΙ 20. Το αρνητικό περιθώριο των
              12 βγάζει τη ζώνη αφής έξω από τη ροή και προς τις τέσσερις
              πλευρές: η στήλη μένει 20 φαρδιά, οι δύο ράγες ακουμπούν ακριβώς
              στα άκρα του κρίκου και η γραμμή δεν μετακινείται ούτε κατά ένα.
              Χωρίς αυτό, γύρω από κάθε κρίκο έμενε κενό δώδεκα εικονοστοιχείων
              και η συνεχής ράγα διαβαζόταν ως διακεκομμένη. */}
          <button type="button" onClick={() => toggle(s.id)} aria-pressed={on}
            aria-label={on ? `Αναίρεση: ${s.title}` : `Ολοκληρώθηκε: ${s.title}`}
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer', lineHeight: 0,
              width: 44, height: 44, margin: -12, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <Check on={on} next={isNext} />
          </button>
          <div style={{ ...rail, flex: 1, opacity: last ? 0 : 1 }} />
        </div>
        <div className="plan-row plan-row-step">
          <span style={{ minWidth: 0 }}>
            <RowTitle state={on ? 'done' : isNext ? 'next' : 'plain'}>{s.title}</RowTitle>
            <InfoHint label={`Τι σημαίνει: ${s.title}`}>
              <Tip lead={s.detail} rows={[['Πότε', s.when], ['Αν παραλειφθεί', s.cost]]} />
            </InfoHint>
          </span>
          <Tag>{ACTOR_LABEL[s.who]}</Tag>
        </div>
      </div>
    );
  };

  return (
    <div style={pageShell(920)}>
      {/* ── Η ΚΕΦΑΛΙΔΑ ────────────────────────────────────────────────────
          ΗΤΑΝ ΔΥΟ ΚΕΦΑΛΙΔΕΣ, ΚΑΙ Η ΚΑΤΑΣΤΑΣΗ ΓΡΑΦΟΤΑΝ ΔΥΟ ΦΟΡΕΣ. Η σελίδα
          τύπωνε από πάνω «ΑΞΙΟΠΟΙΗΣΗ ΑΚΙΝΗΤΟΥ / Κενό· πώς θα μισθωθεί ή θα
          αξιοποιηθεί» και αμέσως μετά η καρτέλα τύπωνε «ΚΕΝΟ · Όνομα» και τον
          δικό της τίτλο: τέσσερα μπλοκ επικεφαλίδας στη σειρά, με τη λέξη
          «Κενό» δύο φορές μέσα σε εξήντα εικονοστοιχεία. Μία κεφαλίδα, από το
          κοινό PageTitle που χρησιμοποιούν οι άλλες έντεκα καρτέλες. */}
      <PageTitle over={`Αξιοποίηση · ${plan.label}`} title={plan.headline} lede={plan.lede} />

      {/* ── ΤΙ ΕΙΔΟΥΣ ΕΚΚΡΕΜΟΤΗΤΑ: αλλάζει ΟΛΗ τη σειρά, άρα ρωτιέται πρώτο ──
          Ο υπότιτλος ήταν η εξήγηση του ΕΠΙΛΕΓΜΕΝΟΥ είδους, τυπωμένη κάτω από
          τον τίτλο της ενότητας: δηλαδή μια πρόταση που άλλαζε ανάλογα με το
          ποια πιλούλα είναι πατημένη, δεκαπέντε εικονοστοιχεία μακριά της. Πάει
          στο κυκλάκι της, όπου διαβάζεται δίπλα στο πράγμα που περιγράφει. */}
      {isDispute && (
        <Panel label="Τι είδους εκκρεμότητα είναι"
          info={<InfoHint label="Τι σημαίνει κάθε είδος">
            <Tip rows={DISPUTE_KINDS.map(k => [k.label, k.hint] as const)} />
          </InfoHint>}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {DISPUTE_KINDS.map(k => (
              <Pick key={k.key} on={k.key === kind} onClick={() => pickKind(k.key)}>{k.label}</Pick>
            ))}
          </div>
        </Panel>
      )}

      {/* ── ΤΟ ΝΟΥΜΕΡΟ ΤΟΥ ΚΕΝΟΥ: χωρίς αυτό, οι επιλογές μοιάζουν ίδιες ───
          ΤΑ ΤΕΣΣΕΡΑ ΠΕΔΙΑ ΜΕΝΟΥΝ ΑΝΟΙΧΤΑ ΟΣΟ ΔΕΝ ΕΧΟΥΝ ΑΠΑΝΤΗΣΗ. Μόλις υπάρχει
          νούμερο, η φόρμα δεν έχει τι άλλο να πει: μαζεύεται και μένει το
          αποτέλεσμα, που είναι και ο λόγος που ζητήθηκαν. */}
      {plan.status === 'vacant' && (
        <Panel label="Τι κοστίζει ο μήνας που περνάει"
          info={<InfoHint label="Τι μετράει και τι όχι">
            Μόνο όσα φεύγουν από τον λογαριασμό σου. Το ενοίκιο που δεν εισπράττεις είναι άλλη συζήτηση.
          </InfoHint>}
          right={drain.monthly > 0
            ? <button type="button" style={quietBtn} onClick={() => setCostsOpen(o => !o)} aria-expanded={costsOpen}>
                {costsOpen ? 'Σύμπτυξη' : 'Αλλαγή δεδομένων'}
              </button>
            : undefined}>
          {costsOpen && (
            /* ΡΗΤΕΣ ΤΕΣΣΕΡΙΣ ΣΤΗΛΕΣ, ΟΧΙ auto-fit. Με ελάχιστο 170 το ίδιο
               πλέγμα έβγαζε τέσσερα πεδία στο 100% zoom και «τρία και ένα» στο
               125%: η ίδια οθόνη, άλλη διάταξη σε κάθε ρύθμιση περιηγητή. Το
               `fixedCols` είναι η μία απάντηση της εφαρμογής σε αυτό. Στοίχιση
               στην κορυφή: κάθε πεδίο κουβαλά υπόδειξη ΑΠΟ ΚΑΤΩ, οπότε το κάτω
               άκρο δεν είναι το κουτί. */
            <div {...fixedCols(4, 14, 'start')}>
              <MoneyField label="ΕΝΦΙΑ (έτος)" hint="Από το εκκαθαριστικό" value={costs.enfiaYear} onChange={v => setCost('enfiaYear', v)} />
              <MoneyField label="Κοινόχρηστα (μήνας)" hint="Ό,τι πληρώνεις κλειστό" value={costs.commonMonthly} onChange={v => setCost('commonMonthly', v)} />
              <MoneyField label="Πάγια ρεύμα/νερό (μήνας)" hint="Χωρίς κατανάλωση" value={costs.utilitiesMonthly} onChange={v => setCost('utilitiesMonthly', v)} />
              <MoneyField label="Ασφάλιστρο (έτος)" hint="Αν υπάρχει" value={costs.insuranceYear} onChange={v => setCost('insuranceYear', v)} />
            </div>
          )}
          {drain.monthly > 0 && (
            <div style={{ marginTop: costsOpen ? T.sp.xl : 0, paddingTop: costsOpen ? T.sp.lg : 0, borderTop: costsOpen ? '1px solid var(--border-subtle)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ ...TT.kpi }}>{feAuto(drain.monthly)}</span>
                <span style={{ ...TT.bodySm, color: 'var(--text-secondary)' }}>
                  κάθε μήνα που μένει κενό · {feAuto(drain.yearly)} τον χρόνο
                </span>
              </div>
              <div style={{ ...TT.caption, color: 'var(--text-tertiary)', marginTop: 8 }}>
                {drain.parts.map(p => `${p.label} ${feAuto(p.monthly)}`).join(' · ')}
              </div>
            </div>
          )}
        </Panel>
      )}

      {/* ── Η ΣΕΙΡΑ ──────────────────────────────────────────────────────
          Ο ΥΠΟΤΙΤΛΟΣ ΕΦΥΓΕ ΟΛΟΚΛΗΡΟΣ, ΚΑΙ ΔΕΝ ΠΗΓΕ ΟΥΤΕ ΣΕ ΚΥΚΛΑΚΙ. Έγραφε
          «από πάνω προς κάτω· ό,τι είναι πιο πάνω εμποδίζει ό,τι είναι πιο
          κάτω», δηλαδή περιέγραφε με λόγια τη ράγα που περνά μπροστά από τα
          μάτια του χρήστη και ενώνει τα δώδεκα κουτάκια. Η ράγα το λέει
          καλύτερα, χωρίς λέξη. Ένα κυκλάκι που επαναλαμβάνει ό,τι δείχνει το
          σχήμα δεν είναι διακριτικότητα, είναι η ίδια επανάληψη πιο μικρή. */}
      <Panel
        label="Η σειρά"
        right={
          /* Η ΠΡΟΟΔΟΣ ΖΕΙ ΣΤΗΝ ΕΠΙΚΕΦΑΛΙΔΑ ΤΟΥ ΠΡΑΓΜΑΤΟΣ ΠΟΥ ΜΕΤΡΑΕΙ. Ήταν δικό
             της μπλοκ κάτω από την εισαγωγή, με δικό του περιθώριο: μια γραμμή
             τριών εικονοστοιχείων που κόστιζε εξήντα κατακόρυφα και μετρούσε
             βήματα που εμφανίζονταν εκατόν πενήντα εικονοστοιχεία πιο κάτω.
             Στο μηδέν η μπάρα δεν σχεδιάζεται: άδειο αυλάκι δίπλα σε ένα «0 από
             12» δεν δείχνει πρόοδο, δείχνει ότι δεν υπάρχει.

             ΚΑΙ ΤΟ «ΟΛΟΚΛΗΡΩΜΕΝΑ» ΕΦΥΓΕ. Δίπλα σε μπάρα προόδου, το «0 από 12»
             δεν χρειάζεται ουσιαστικό για να διαβαστεί. */
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            {plan.progress.done > 0 && (
              <div style={{ width: 88, height: 3, borderRadius: 2, background: 'var(--border-subtle)', overflow: 'hidden' }}>
                <div style={{
                  width: `${plan.progress.pct}%`, height: '100%',
                  background: 'var(--text-primary)', transition: `width .3s ${T.ease.standard}`,
                }} />
              </div>
            )}
            <span style={{ ...TT.caption, color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              {plan.progress.done} από {plan.progress.total}
            </span>
          </div>
        }>
        {groups.map((g, gi) => {
          const doneHere = g.items.filter(s => checked.has(s.id)).length;
          const finished = doneHere === g.items.length;
          const shut = g.group ? shutGroups[g.group] ?? finished : false;
          return (
            <div key={g.group ?? `g${gi}`} style={{ marginTop: g.group && gi > 0 ? T.sp.lg : 0 }}>
              {g.group && (
                /* Η ομάδα κουβαλά και τη μέτρησή της: τέσσερα βήματα «πριν
                   ξεκινήσεις» με τα δύο τσεκαρισμένα είναι διαφορετική εικόνα
                   από τέσσερα άθικτα, χωρίς να μετρήσει κανείς κουτάκια. */
                <button type="button" className="acc-toggle" aria-expanded={!shut} aria-label={g.group}
                  onClick={() => setShutGroups(prev => ({ ...prev, [g.group as string]: !shut }))}
                  style={{
                    ...ROW_BLEED, display: 'flex', alignItems: 'center', gap: 10, width: 'calc(100% + 24px)',
                    minHeight: 44, textAlign: 'left', cursor: 'pointer', background: 'none',
                    border: 'none', opacity: finished ? 0.5 : 1, transition: 'opacity .15s',
                  }}>
                  <span style={{ ...TT.label, fontSize: 11, color: 'var(--text-tertiary)', flex: 1, minWidth: 0 }}>{g.group}</span>
                  <span style={{ ...TT.caption, color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
                    {doneHere} από {g.items.length}
                  </span>
                  <Caret open={!shut} />
                </button>
              )}
              {!shut && g.items.map((s, i) => stepRow(s, i === 0, i === g.items.length - 1))}
            </div>
          );
        })}
        {!plan.next && (
          <div style={{ marginTop: T.sp.lg, paddingTop: T.sp.lg, borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ ...TT.h2 }}>Δεν μένει κάτι ανοιχτό.</div>
            <div style={{ ...TT.bodySm, color: 'var(--text-secondary)', marginTop: 6 }}>
              Πέρασες όλη τη σειρά. Αν άλλαξε κάτι στο ακίνητο, άλλαξε και την κατάστασή του: αυτή η καρτέλα
              υπάρχει για όσο διαρκεί η μεταβατική περίοδος, όχι για πάντα.
            </div>
          </div>
        )}
      </Panel>

      {/* ── Η ΣΥΓΚΡΙΣΗ, ΩΣ ΠΙΝΑΚΑΣ ────────────────────────────────────────
          ΟΙ ΤΡΕΙΣ ΑΞΟΝΕΣ ΗΤΑΝ ΤΡΕΙΣ ΕΤΙΚΕΤΕΣ ΣΕ ΚΑΘΕ ΓΡΑΜΜΗ. Σε έξι επιλογές
          αυτό είναι δεκαοκτώ ετικέτες για τρία πράγματα· οι τιμές δεν
          στοίχιζαν ποτέ μεταξύ τους: το «Μέτριο» της δεύτερης γραμμής ξεκινούσε
          εκεί που τελείωνε το «Λίγος» της πρώτης. Δηλαδή πίνακας σύγκρισης όπου
          η σύγκριση απαιτούσε να θυμάσαι.

          Τώρα είναι ΕΝΑ πλέγμα για όλη την ενότητα: η κεφαλίδα και κάθε γραμμή
          μοιράζονται τις ίδιες τέσσερις στήλες, οπότε τα «Λίγος / Πολύς /
          Μέτριος» πέφτουν το ένα κάτω από το άλλο. Το `display: contents` στο
          δοχείο των τριών τιμών είναι που το επιτρέπει: σε φαρδιά οθόνη οι τρεις
          τιμές είναι κελιά του ίδιου πλέγματος, σε στενή γίνεται το δοχείο
          κανονικό flex και τις μαζεύει σε μία σειρά. */}
      {plan.options.length > 0 && (
        <Panel label={plan.optionsTitle}>
          <div className="plan-table">
            <span className="plan-head" aria-hidden />
            <span className="plan-head" aria-hidden>Κόπος</span>
            <span className="plan-head" aria-hidden>Ρίσκο</span>
            <span className="plan-head" aria-hidden>Χρόνος</span>
            {plan.options.map((o: Option, i: number) => (
              <div key={o.id} style={{ display: 'contents' }}>
                {i > 0 && <span className="plan-span" style={{ borderTop: '1px solid var(--border-subtle)' }} />}
                <span className="plan-name">
                  <RowTitle state="plain">{o.title}</RowTitle>
                  <InfoHint label={`Τι σημαίνει: ${o.title}`}>
                    <Tip lead={o.payoff} rows={[['Ταιριάζει αν', o.fits], ['Τι πληρώνεις', o.cost]]} />
                  </InfoHint>
                </span>
                {/* Η ΛΕΞΗ ΤΟΥ ΑΞΟΝΑ ΕΙΝΑΙ ΚΡΥΦΗ ΣΤΗ ΦΑΡΔΙΑ ΟΘΟΝΗ, ΟΧΙ ΑΝΥΠΑΡΚΤΗ.
                    Την τυπώνει η κεφαλίδα των στηλών, οπότε το μάτι δεν τη
                    χρειάζεται· ο αναγνώστης οθόνης όμως δεν βλέπει στήλες και θα
                    άκουγε «Λίγος, Μέτριο, Αμέσως» χωρίς να ξέρει τι είναι τι.
                    Στη στενή οθόνη, όπου η κεφαλίδα δεν υπάρχει, η ίδια λέξη
                    γίνεται ορατή και ενώνεται με την τιμή: «Λίγος κόπος». */}
                <span className="plan-axes">
                  <span className="plan-axis">{EFFORT_LABEL[o.effort]}<span className="plan-axis-k"> κόπος</span></span>
                  <span className="plan-axis">{RISK_LABEL[o.risk]}<span className="plan-axis-k"> ρίσκο</span></span>
                  <span className="plan-axis"><span className="sr-only">Χρόνος: </span>{o.speed}</span>
                </span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* ── ΤΙ ΜΕΝΕΙ ΚΑΘΑΡΟ (πώληση, όταν υπάρχει καταχωρημένη αξία) ─────── */}
      {plan.status === 'for_sale' && sale && (
        <Panel label="Τι μένει καθαρό"
          info={<InfoHint label="Πάνω σε τι υπολογίζεται">
            <Tip lead={`Ενδεικτικά, με βάση την αξία που έχεις καταχωρήσει (${feAuto(sale.price)}).`}
              rows={[['Επιβεβαίωσε', sale.note]]} />
          </InfoHint>}
          right={
            <div style={{ display: 'flex', gap: 6 }}>
              {[{ k: true, l: 'Με μεσίτη' }, { k: false, l: 'Μόνος σου' }].map(o => (
                <Pick key={o.l} small on={useAgent === o.k} onClick={() => setUseAgent(o.k)}>{o.l}</Pick>
              ))}
            </div>
          }>
          {sale.lines.map((l, i) => (
            <div key={l.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid var(--border-subtle)' }}>
              <span style={{ ...TT.bodySm, color: 'var(--text-secondary)' }}>{l.label}</span>
              {/* Το λογιστικό μείον γραφόταν με το χέρι, δίπλα σε `feAuto`, ενώ το
                  `feSigned` υπάρχει στο `lib/core/format` ακριβώς γι’ αυτό, με δικό
                  του test — και δεν το καλούσε ΚΑΝΕΝΑ σημείο της εφαρμογής. Μια
                  συνάρτηση που κανείς δεν χρησιμοποιεί δεν φυλάει τίποτα. */}
              <span style={{ ...TT.figure, fontSize: 13, color: 'var(--text-primary)' }}>{feSigned(-l.amount)}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '14px 0 0', borderTop: '1px solid var(--border-default)', marginTop: 4 }}>
            <span style={{ fontFamily: T.font.sans, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Καθαρό έσοδο</span>
            <span style={{ ...TT.kpi, fontSize: 20 }}>{feAuto(sale.net)}</span>
          </div>
        </Panel>
      )}

      {/* ── ΠΟΙΟΣ ΜΠΟΡΕΙ ΝΑ ΠΛΗΡΩΣΕΙ ΤΙ (ανακαίνιση) ─────────────────────
          ΠΕΝΤΕ ΠΡΟΓΡΑΜΜΑΤΑ ΜΕ ΤΙΣ ΕΠΙΦΥΛΑΞΕΙΣ ΤΟΥΣ ΑΝΟΙΧΤΕΣ ΗΤΑΝ ΤΕΤΡΑΚΟΣΙΕΣ
          ΛΕΞΕΙΣ. Κλειστά, οι πέντε γραμμές απαντούν στο μόνο που ρωτάει κάποιος
          που μόλις έμαθε ότι υπάρχουν: ποια είναι, τι είδους χρήμα είναι και πού
          διαβάζονται οι όροι τους. */}
      {plan.funding.length > 0 && (
        <Panel label="Ποιος μπορεί να πληρώσει τι"
          info={<InfoHint label="Γιατί δεν γράφεται κανένα ποσοστό">
            Οι όροι κάθε προγράμματος αλλάζουν σε κάθε κύκλο, γι’ αυτό δεν γράφεται εδώ κανένα ποσοστό.
          </InfoHint>}>
          {plan.funding.map((f, i) => (
            <div key={f.id} className="plan-row plan-row-fund" style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border-subtle)' }}>
              <span style={{ minWidth: 0 }}>
                <RowTitle state="plain">{f.title}</RowTitle>
                <InfoHint label={`Τι σημαίνει: ${f.title}`}>
                  <Tip lead={f.what} rows={[['Επιβεβαίωσε', f.confirm]]} />
                </InfoHint>
              </span>
              <Tag>{FUNDING_KIND_LABEL[f.kind]}</Tag>
              {/* ΔΥΟ ΜΠΛΕ ΣΤΗΝ ΙΔΙΑ ΟΘΟΝΗ, ΚΑΙ ΤΟ ΕΝΑ ΕΙΧΕ ΔΗΛΩΣΕΙ ΑΠΟΚΛΕΙΣΤΙΚΟΤΗΤΑ.
                  Το σχόλιο στην κορυφή αυτού του αρχείου γράφει: «το μπλε εμφανίζεται
                  ΜΟΝΟ στην κύρια ενέργεια, ώστε το μάτι να ξέρει πάντα πού να πάει».
                  Και τέσσερις γραμμές πιο κάτω, ο σύνδεσμος του προγράμματος ήταν
                  `var(--info)` — άλλο μπλε, ίδια ένταση, σε ενότητα που δεν είναι
                  ενέργεια. Εδώ γίνεται αυτό που είναι: ήσυχος σύνδεσμος κειμένου. */}
              {f.href
                ? <a href={f.href} target="_blank" rel="noopener noreferrer" className="tap-link"
                    style={{
                      fontFamily: T.font.sans, fontSize: 12, fontWeight: 600,
                      color: 'var(--text-secondary)', textDecoration: 'none',
                      borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap',
                    }}>
                    Επίσημη σελίδα
                  </a>
                : <span />}
            </div>
          ))}

          {/* ── Ο ΥΠΟΛΟΓΙΣΜΟΣ ΤΗΣ ΔΟΣΗΣ ───────────────────────────────────
              Ένα ένθετο πλαίσιο με δύο πλευρές: αριστερά τι δίνεις, δεξιά τι
              βγαίνει. Το τοκοχρεολύσιο δεν ξαναγράφεται εδώ — έρχεται από το
              lib/loans, που είναι η πηγή αλήθειας για κάθε δόση. Και οι
              παραδοχές του δεν είναι πια λεζάντα τριών σειρών από κάτω: είναι
              κυκλάκι δίπλα στον αριθμό που τις χρησιμοποιεί. */}
          <div style={{
            marginTop: T.sp.xl, padding: 16, borderRadius: T.radius.inner,
            background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
              <div style={{ width: 180 }}>
                <MoneyField label="Ποσό ανακαίνισης" value={loanAmount} onChange={v => setLoanAmount(v ?? null)} />
              </div>
              {loan && (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', paddingBottom: 2 }}>
                  <span style={{ ...TT.kpi, fontSize: 20 }}>{feAuto(loan.monthly)}</span>
                  <span style={{ ...TT.bodySm, color: 'var(--text-secondary)' }}>
                    τον μήνα για {ASSUMED_YEARS} έτη · συνολικοί τόκοι {feAuto(loan.interest)}
                    <InfoHint label="Πάνω σε τι υπολογίζεται η δόση">
                      Ενδεικτική δόση επισκευαστικού με υποθετικό επιτόκιο {ASSUMED_RATE_PCT}% σε {ASSUMED_YEARS} έτη.
                      Τα σημερινά επιτόκια και τα έξοδα συγκρίνονται στην καρτέλα Δάνειο.
                    </InfoHint>
                  </span>
                </div>
              )}
            </div>
          </div>
        </Panel>
      )}

      {/* ═══ ΑΝΑΦΟΡΑ ══════════════════════════════════════════════════════
          ΗΤΑΝ ΔΥΟ ΑΚΟΜΗ ΕΝΟΤΗΤΕΣ ΜΕ ΤΟ ΙΔΙΟ ΑΚΡΙΒΩΣ ΥΦΟΣ, ΑΝΟΙΧΤΕΣ, ΣΤΟ ΤΕΛΟΣ.
          «Οι κανόνες» και «Προς επιβεβαίωση»: ίδια ετικέτα, ίδια λεπτή γραμμή,
          ίδιες σειρές κειμένου με τις τρεις από πάνω. Όταν όλα μοιάζουν εξίσου
          σημαντικά, τίποτα δεν είναι — και ο χρήστης κάνει το μόνο λογικό: κυλά
          μέχρι κάτω χωρίς να διαβάσει. Καμία από τις δύο δεν ζητά ενέργεια:
          είναι υλικό αναφοράς, μία γραμμή που ανοίγει.

          ΚΑΙ ΜΕΣΑ ΤΟΥΣ ΔΕΝ ΥΠΑΡΧΕΙ ΠΙΑ ΔΕΥΤΕΡΟ ΕΠΙΠΕΔΟ ΑΝΟΙΓΜΑΤΟΣ. Ήταν
          ακορντεόν μέσα σε ακορντεόν: άνοιγες τη «Αναφορά» και έβρισκες επτά
          γραμμές που άνοιγαν κι αυτές, με το ίδιο βελάκι, στην ίδια στήλη. Τώρα
          το βελάκι ανοίγει τη λίστα και το κυκλάκι εξηγεί τη γραμμή. */}
      <Card pad="lg" gap={false} style={{ marginBottom: T.sp.lg }}>
        <button type="button" className="acc-toggle plan-row plan-row-bare" aria-expanded={refOpen} aria-label="Αναφορά"
          onClick={() => setRefOpen(o => !o)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: T.font.sans }}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', minWidth: 0 }}>
            <span style={{ ...TT.label, fontSize: 11, color: 'var(--text-secondary)' }}>Αναφορά</span>
            <span style={{ ...TT.caption, color: 'var(--text-tertiary)' }}>
              Κανόνες που κοστίζουν χρήματα και όσα αλλάζουν από χρονιά σε χρονιά.
            </span>
          </span>
          <span style={{ display: 'flex', justifyContent: 'flex-end' }}><Caret open={refOpen} /></span>
        </button>

        {refOpen && (
          /* ΔΥΟ ΣΤΗΛΕΣ ΔΕΝ ΖΥΓΙΖΟΝΤΑΙ ΠΟΤΕ, ΓΙΑΤΙ ΤΟ ΠΕΡΙΕΧΟΜΕΝΟ ΤΟΥΣ ΔΕΝ ΕΙΝΑΙ
             ΙΣΟ. Τέσσερις κανόνες με παραγράφους αριστερά, τρία ερωτήματα με από
             δύο απαντήσεις δεξιά: η μία στήλη τελείωνε τριακόσια εικονοστοιχεία
             πριν την άλλη και καμία από τις δύο δεν έφτανε στην άκρη της κάρτας.
             Το πλέγμα δεν διορθώνεται με ρυθμίσεις — αφαιρείται. */
          <div className="budget-rise" style={{ paddingTop: T.sp.md, marginTop: 2, borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ ...TT.label, fontSize: 11, color: 'var(--text-tertiary)', paddingBottom: 6, marginBottom: 2, borderBottom: '1px solid var(--border-subtle)' }}>
              Οι κανόνες που κοστίζουν χρήματα
            </div>
            {plan.rules.map(r => (
              <div key={r.id} className="plan-row plan-row-bare">
                <span style={{ minWidth: 0 }}>
                  <RowTitle state="plain">{r.title}</RowTitle>
                  <InfoHint label={`Ο κανόνας: ${r.title}`}>{r.body}</InfoHint>
                </span>
              </div>
            ))}

            {/* ΤΟ ΠΟΡΤΟΚΑΛΙ ΣΗΜΑ ΜΕ ΤΟ «3» ΕΦΥΓΕ. Ένα γυμνό «3» δεν λέει καν
                τρία τι και ήταν γραμμένο στο χρώμα που η εφαρμογή κρατά για
                εκκρεμότητες — σε ενότητα που ρητά δεν ζητά καμία ενέργεια. */}
            <div style={{ ...TT.label, fontSize: 11, color: 'var(--text-tertiary)', paddingBottom: 6, marginTop: T.sp.lg, marginBottom: 2, borderBottom: '1px solid var(--border-subtle)' }}>
              Προς επιβεβαίωση
            </div>
            {plan.verify.map(v => (
              <div key={v.id} className="plan-row plan-row-bare">
                {/* ΔΕΝ ΕΙΝΑΙ ΤΙΤΛΟΣ, ΕΙΝΑΙ ΕΡΩΤΗΜΑ και γι᾽ αυτό δεν φοράει το
                    βάρος του τίτλου κανόνα από πάνω: μια ερώτηση δύο σειρών σε
                    14/600 διαβάζεται σαν κραυγή. */}
                <span style={{ minWidth: 0 }}>
                  <span style={{ ...TT.body, color: 'var(--text-secondary)' }}>{v.what}</span>
                  <InfoHint label={`Πού ελέγχεται: ${v.what}`}>
                    <Tip rows={[['Πού', v.where], ['Γιατί αλλάζει', v.why]]} />
                  </InfoHint>
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ΤΟ ΥΨΟΣ ΓΡΑΜΜΗΣ ΤΗΣ ΛΕΖΑΝΤΑΣ ΕΙΝΑΙ 1,45 ΚΑΙ Η ΓΡΑΜΜΗ ΕΔΩ ΦΤΑΝΕΙ 101
          ΧΑΡΑΚΤΗΡΕΣ. Μετρημένο από τον σαρωτή σε πέντε πλάτη, από τα 768 ώς τα
          1.440: δύο προτάσεις που πάνε πέρα πέρα, σε ύψος γραμμής φτιαγμένο για
          λεζάντα τριών λέξεων. Το κείμενο ΔΕΝ στενεύει — ο κανόνας του έργου
          είναι να πηγαίνει πέρα πέρα — οπότε παίρνει τον αέρα του: 1,7, όπως
          κάθε άλλο κείμενο πλήρους πλάτους της εφαρμογής. */}
      <p style={{ ...TT.caption, lineHeight: 1.7, color: 'var(--text-tertiary)', margin: 0, padding: '0 2px' }}>
        {PLAN_DISCLAIMER}
      </p>
    </div>
  );
}
