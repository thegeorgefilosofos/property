'use client';

// ═══════════════════════════════════════════════════════════════════════════
// Λογαριασμός — μία καθαρή σελίδα με κύλιση (προφίλ, συνδρομή, προτιμήσεις,
// ειδοποιήσεις, δεδομένα & απόρρητο). Στυλ fintech: κάρτες, SecHdr, tokens.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useId, useCallback } from 'react';
import { leaveDevice } from '@/lib/localPrivacy';
import { createClient } from '@/lib/supabase/client';
import { shouldStop, leftoverText, type DeleteReport } from './deletionReport';
import * as properties from '@/lib/data/properties';
// Οι ρυθμίσεις ανά ενότητα έχουν ένα σπίτι: lib/data/settings.
import * as settings from '@/lib/data/settings';
// Το προφίλ χρέωσης έχει ένα σπίτι: lib/data/billing.
import * as billing from '@/lib/data/billing';
import NotificationSettings from './NotificationSettings';
import { CustomSelect, Toggle } from './UIComponents';
import { T, TT, Card, SecHdr, Btn, InfoBanner, PageTitle, fdLong, fn, settingsField, ABSENT, pageShell, Bar } from '@/components/Theme';
import { SetList, SetRow, SaveNote, useAutosave } from './SettingsKit';
import { AppPreferences, DEFAULT_PREFERENCES } from './useAppPreferences';
import { downloadTableXlsx } from './exportCsv';
import Billing from './Billing';
import ReportBranding from './ReportBranding';
import { ThemeToggle } from './ThemeToggle';
import SettingsRoadmap from './SettingsRoadmap';
import Feedback from './Feedback';
import PlanComparison from './PlanComparison';
import SecuritySettings from './SecuritySettings';
import InboundAddress from './InboundAddress';
import CalendarFeedRow from './CalendarFeedRow';
import ActivityLog from './ActivityLog';
import OrgTeam from './OrgTeam';
import { exportAllData } from '@/lib/dataExport';
import * as accountantLink from '@/lib/data/accountantLink';
import { PLANS, PLAN_ORDER, normalizePlan, type PlanId } from '@/lib/billing/plans';

/** Τα πακέτα που αγοράζονται. Το «χωρίς συνδρομή» είναι κατάσταση, όχι πακέτο. */
const PAID_PLAN_ORDER = PLAN_ORDER.filter(id => PLANS[id].priceMonthly > 0) as PlanId[];
import { effectivePlan, activeComp, planAtLeast, propertyLimit, trialState, isOpenEnded } from '@/lib/billing/entitlements';
import { athensToday } from '@/lib/core/time';
import { savedData } from '@/components/dbWrite';
import { notifyError } from '@/components/Toast';
import { SAY, failed } from '@/lib/core/dbError';
import { useLoad } from '@/app/hooks/useLoad';
import { useRememberedFlag } from '@/components/useRememberedFlag';

type ProfileType = 'individual' | 'professional';

// Ρυθμίσεις ακινήτου: κρατούνται μόνο για την εξαγωγή CSV (η επεξεργασία γίνεται
// πλέον στον οδηγό ακινήτου).
type S = Record<string, unknown>;

/**
 * ΤΙ ΕΙΝΑΙ ΡΥΘΜΙΣΗ ΚΑΙ ΤΙ ΕΙΝΑΙ ΥΔΡΑΥΛΙΚΑ ΤΗΣ ΒΑΣΗΣ.
 *
 * Ο πίνακας έχει και `id`, `user_id`, `property_id`: κλειδιά που δεν λένε
 * τίποτα σε κανέναν έξω από τη βάση και δεν έχουν λόγο να ταξιδεύουν σε φύλλο
 * που ανοίγει άνθρωπος. Η σειρά εδώ είναι η σειρά που θα τα έγραφε κάποιος σε
 * χαρτί: ποιος είναι ο ιδιοκτήτης, ποιοι οι πάροχοι, ποιος διαχειρίζεται, τι
 * ασφάλεια υπάρχει.
 */
const SETTINGS_FIELDS: readonly (readonly [string, string])[] = [
  ['owner_name', 'Ονομα ιδιοκτήτη'],
  ['owner_afm', 'ΑΦΜ ιδιοκτήτη'],
  ['owner_phone', 'Τηλέφωνο ιδιοκτήτη'],
  ['owner_email', 'Ηλεκτρονικό ταχυδρομείο ιδιοκτήτη'],
  ['electricity_provider', 'Πάροχος ρεύματος'],
  ['water_provider', 'Πάροχος νερού'],
  ['internet_provider', 'Πάροχος internet'],
  ['internet_plan', 'Πρόγραμμα internet'],
  ['kwh_price', 'Τιμή κιλοβατώρας'],
  ['property_manager', 'Διαχειριστής'],
  ['property_manager_phone', 'Τηλέφωνο διαχειριστή'],
  ['insurance_company', 'Ασφαλιστική εταιρεία'],
  ['insurance_policy', 'Αριθμός συμβολαίου'],
  ['insurance_expiry', 'Λήξη ασφάλειας'],
  ['notes', 'Σημειώσεις'],
];

// ── Κοινά δομικά κομμάτια της σελίδας ─────────────────────────────────────
// Οι γραμμές ρύθμισης (τίτλος, εξήγηση, διακόπτης, «ετικέτα … τιμή») ζουν στο
// SettingsKit — εδώ γράφονταν ξεχωριστά, με άλλα περιθώρια από τις υπόλοιπες
// έξι ενότητες της ίδιας σελίδας.
const divider = { borderTop: '1px solid var(--border-subtle)', paddingTop: 16, marginTop: 16 } as const;

/**
 * Ενότητα ρυθμίσεων που ελαχιστοποιείται. Ξεκινά κλειστή· ανοίγει με ένα κλικ.
 *
 * Η `hint` ΕΙΝΑΙ Ο ΛΟΓΟΣ ΠΟΥ ΤΟ ΚΛΕΙΣΤΟ ΔΕΝ ΕΙΝΑΙ ΚΡΥΦΟ. Έξι κλειστές
 * κεφαλίδες η μία κάτω από την άλλη έλεγαν μόνο το όνομά τους: για να μάθει ο
 * χρήστης αν το «Δεδομένα και απόρρητο» περιέχει τη διαγραφή λογαριασμού,
 * έπρεπε να το ανοίξει. Τρεις λέξεις δίπλα στον τίτλο λύνουν έξι ανοίγματα και
 * σβήνουν μόλις η ενότητα ανοίξει, γιατί τότε το λέει το ίδιο το περιεχόμενο.
 */
function CollapsibleSection({ title, hint, defaultOpen = false, delay, children }: { title: string; hint?: string; defaultOpen?: boolean; delay?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  return (
    <Card className="acc-section" style={{ animationDelay: delay }}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-controls={panelId} className="po-sec-toggle"
        style={{ appearance: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none', borderBottom: open ? '1px solid var(--border-subtle)' : 'none', background: 'transparent', width: '100%', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, padding: 0, textAlign: 'left', marginBottom: open ? 16 : 0, paddingBottom: open ? 10 : 0 }}>
        <span style={{ ...TT.label, flex: 1, minWidth: 0 }}>{title}</span>
        {hint && !open && <span style={{ ...TT.caption, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hint}</span>}
        <svg aria-hidden="true" focusable="false" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transition: 'transform 0.2s cubic-bezier(0.2,0,0,1)', transform: open ? 'rotate(180deg)' : 'none' }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <div id={panelId} hidden={!open}>{open && children}</div>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ΠΡΟΣΒΑΣΗ ΛΟΓΙΣΤΗ: ΕΔΩ ΕΛΕΓΧΕΤΑΙ, ΔΕΝ ΔΙΝΕΤΑΙ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΥΠΗΡΧΕ. Το ΙΔΙΟ κουμπί «δημιουργία συνδέσμου» με τη Λογιστική, γραμμένο
// δεύτερη φορά και ήδη αποκλίνον: το upsert εδώ δεν έγραφε `expires_at` και η
// προεπιλογή της βάσης ισχύει ΜΟΝΟ σε insert. Δηλαδή μετά τις 180 ημέρες αυτό
// το κουμπί έλεγε «Αντιγράφηκε» και παρέδιδε ληγμένο σύνδεσμο· ο ιδιοκτήτης τον
// έστελνε, ο λογιστής έβλεπε «δεν είναι έγκυρος» και κανείς δεν ήξερε γιατί.
//
// ΤΙ ΚΑΝΕΙ ΤΩΡΑ, ΚΑΙ ΓΙΑΤΙ ΑΥΤΟ. Η ΠΑΡΑΧΩΡΗΣΗ ζει στη Λογιστική, μέσα στη ροή
// όπου ετοιμάζεις τη χρήση και θέλεις να τη στείλεις. Οι Ρυθμίσεις απαντούν
// άλλη ερώτηση, τη μόνη που φέρνει κάποιον στα «Δεδομένα και απόρρητο»: ποιος
// βλέπει τα δεδομένα μου αυτή τη στιγμή και πώς του το κόβω. Ενα κουμπί ανά
// ερώτηση, καμία διπλή υλοποίηση.
//
// ΚΑΙ ΤΟ ΣΒΗΣΙΜΟ ΔΕΝ ΥΠΗΡΧΕ ΠΟΥΘΕΝΑ. Η «Ανάκληση» της Λογιστικής ΠΕΡΙΣΤΡΕΦΕΙ το
// κλειδί: σκοτώνει τον παλιό σύνδεσμο και γεννά αμέσως καινούριο, ζωντανό.
// Σωστό όταν αλλάζεις λογιστή· δεν είναι ανάκληση όταν θέλεις απλώς να πάψει
// να βλέπει κανείς. Μέχρι σήμερα η πύλη δεν έκλεινε ποτέ, μόνο άλλαζε κλειδαριά.
// ═══════════════════════════════════════════════════════════════════════════
function AccountantAccess({ userId }: { userId: string }) {
  const supabase = createClient();
  const [link, setLink] = useState<accountantLink.AccountantLink | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    accountantLink.current(supabase, userId).then(l => { setLink(l); setLoaded(true); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const cut = async () => {
    setBusy(true);
    const ok = await accountantLink.revoke(supabase, userId);
    setBusy(false);
    if (ok) setLink(l => (l ? { ...l, live: false } : l));
    else notifyError('Η πρόσβαση δεν ανακλήθηκε');
  };

  // Η κατάσταση λέγεται με πρόταση, όχι με χρώμα: το πράσινο και το κόκκινο δεν
  // φέρουν νόημα σε αυτό το προϊόν και μια λέξη διαβάζεται και χωρίς αυτά.
  const state = !loaded ? ''
    : link?.live ? `Ενεργή ${accountantLink.expiryLabel(link)}.`.replace(' .', '.')
    : link ? 'Καμία ενεργή πρόσβαση. Ο παλιός σύνδεσμος δεν απαντά πλέον.'
    : 'Καμία πρόσβαση δεν έχει δοθεί.';

  return (
    <SetRow title="Πρόσβαση λογιστή"
      desc="Ένας σύνδεσμος μόνο ανάγνωσης δίνει στον λογιστή σου την εικόνα εσόδων και δαπανών ανά χρήση. Χωρίς πελατολόγιο και χωρίς στοιχεία τρίτων."
      control={link?.live ? <Btn variant="secondary" onClick={cut} disabled={busy}>{busy ? 'Ανάκληση…' : 'Ανάκληση πρόσβασης'}</Btn> : undefined}>
      {state && (
        <div style={{ ...TT.bodySm, color: 'var(--text-secondary)' }}>
          {state}{!link?.live && ' Ο σύνδεσμος βγαίνει από τη Λογιστική, στον φάκελο για τον λογιστή.'}
        </div>
      )}
    </SetRow>
  );
}

// ── Συγκατάθεση δεδομένων κοινότητας (opt-in), bare row ───────────────────
// Ήταν opt-out με προεπιλογή «ναι»: ο χρήστης συνεισέφερε χωρίς να το επιλέξει
// και, στην πράξη, χωρίς να το δει. Τώρα ξεκινά ΚΛΕΙΣΤΟ και η απόφαση
// καταγράφεται με χρονοσήμανση — το άρθρο 7§1 GDPR ζητά να μπορούμε να
// ΑΠΟΔΕΙΞΟΥΜΕ τη συγκατάθεση και μια προεπιλογή δεν αποδεικνύει τίποτα.
function MarketDataSharing({ userId }: { userId: string }) {
  const supabase = createClient();
  const [on, setOn] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    billing.profileOutcome<{ share_market_data: boolean | null }>(supabase, userId, 'share_market_data')
      .then(({ data, error }) => {
        // Σφάλμα ανάγνωσης ⇒ μένουμε στο ΚΛΕΙΣΤΟ. Fail-closed: ένα πρόβλημα
        // δικτύου δεν επιτρέπεται να δείξει τον διακόπτη ανοιχτό και να
        // παραπλανήσει τον χρήστη ότι συμμετέχει ή ότι δεν συμμετέχει.
        if (!error && data) setOn(data.share_market_data === true);
        setLoaded(true);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
  const toggle = async (v: boolean) => {
    setOn(v);
    // Η ΧΡΟΝΟΣΗΜΑΝΣΗ ΜΕΝΕΙ, ΚΑΙ ΔΕΝ ΕΙΝΑΙ ΔΙΑΚΟΣΜΗΤΙΚΗ: το άρθρο 7§1 GDPR ζητά
    // να μπορούμε να ΑΠΟΔΕΙΞΟΥΜΕ πότε δόθηκε η συγκατάθεση. Απλώς δεν την
    // ανακοινώνει πια η οθόνη — ο διακόπτης λέει ήδη πού βρίσκεται.
    const { error } = await billing.save(supabase, userId,
      { share_market_data: v, share_market_data_decided_at: new Date().toISOString() });
    if (error) setOn(!v);   // επαναφορά αν η αποθήκευση απέτυχε
  };
  return (
    <SetRow title="Συνεισφορά στα δεδομένα κοινότητας"
      control={loaded ? <Toggle on={on} onChange={toggle} size="sm" /> : null}
      desc={<>
        Αν το ενεργοποιήσεις, τα ακίνητά σου συμμετέχουν <strong>ανώνυμα και συγκεντρωτικά</strong> στα δεδομένα
        αγοράς ανά περιοχή (διάμεση απόδοση και τιμή), που βοηθούν κάθε ιδιοκτήτη να συγκρίνει ρεαλιστικά.
        Δεν κοινοποιείται ποτέ μεμονωμένο ακίνητο, διεύθυνση ή στοιχείο σου· εμφανίζονται μόνο περιοχές με
        τουλάχιστον πέντε ακίνητα. Είναι κλειστό εξ ορισμού και το ανοίγεις ή το κλείνεις όποτε θέλεις.
      </>} />
  );
}

// ── Οριστική διαγραφή λογαριασμού (μη αναστρέψιμη), bare block ─────────────
/**
 * Η ΟΘΟΝΗ ΕΒΓΑΖΕ ΣΥΜΠΕΡΑΣΜΑ ΓΙΑ ΚΑΤΙ ΠΟΥ ΔΕΝ ΓΙΝΟΤΑΝ ΠΟΤΕ. Οσο η βάση
 * προσπαθούσε να σβήσει αρχεία με τρόπο που η Supabase απαγορεύει, το «χωρίς
 * σφάλμα» εδώ σήμαινε μόνο «η βάση δεν παραπονέθηκε»: τα μισθωτήρια και οι
 * ταυτότητες έμεναν στους τέσσερις ιδιωτικούς κάδους, όλα, κάθε φορά.
 *
 * Τα αρχεία φεύγουν πλέον ΠΡΙΝ από τη βάση, μέσα από την /api/account/delete
 * και με τη συνεδρία του ίδιου του ανθρώπου. Οσα δεν προλάβουν μπαίνουν σε
 * ουρά. Ο χρήστης σταματά μόνο για αυτά τα δύο, όχι για το μηδέν.
 */
function DeleteAccount() {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leftover, setLeftover] = useState<string | null>(null);
  const ready = confirmText.trim().toUpperCase() === 'ΔΙΑΓΡΑΦΗ';

  const signOut = async () => {
    await supabase.auth.signOut();
    // Ο διακομιστής έσβησε τα πάντα· ο περιηγητής δεν μένει η τελευταία θέση
    // όπου επιβιώνουν προσωπικά δεδομένα τρίτων.
    leaveDevice();
    window.location.assign('/login');
  };

  /**
   * Η ΔΙΑΓΡΑΦΗ ΠΕΡΝΑΕΙ ΑΠΟ ΤΟΝ ΔΙΑΚΟΜΙΣΤΗ, ΚΑΙ ΟΧΙ ΓΙΑ ΤΥΠΙΚΟΤΗΤΑ.
   *
   * Πριν, η οθόνη καλούσε κατευθείαν τη `delete_my_account`. Ο λογαριασμός
   * έφευγε, το προφίλ χρέωσης με το αναγνωριστικό της συνδρομής έφευγε μαζί
   * του και η ΚΑΡΤΑ ΣΥΝΕΧΙΖΕ ΝΑ ΧΡΕΩΝΕΤΑΙ — χωρίς λογαριασμό απέναντι και
   * χωρίς κουμπί για να σταματήσει. Η ακύρωση στον έμπορο θέλει το κλειδί
   * API, δηλαδή διακομιστή· η διαδρομή κάνει πρώτα εκείνη και μετά αυτό.
   */
  const del = async () => {
    if (!ready || busy) return;
    setBusy(true); setError(null);
    let payload: unknown = null;
    try {
      const res = await fetch('/api/account/delete', { method: 'POST' });
      payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (payload as { error?: string } | null)?.error;
        setError(typeof msg === 'string' && msg ? msg : SAY.accountNotDeleted);
        setBusy(false); return;
      }
    } catch {
      setError('Ο λογαριασμός δεν διαγράφηκε. Ελεγξε τη σύνδεσή σου και δοκίμασε ξανά.');
      setBusy(false); return;
    }
    const report = (payload ?? {}) as DeleteReport;
    // Ο λογαριασμός έχει ήδη φύγει, οπότε η αποσύνδεση γίνεται ούτως ή άλλως:
    // εδώ κρίνεται μόνο αν ο χρήστης θα δει πρώτα τι δεν σβήστηκε.
    if (shouldStop(report)) { setLeftover(leftoverText(report, fn)); setBusy(false); return; }
    await signOut();
  };

  return (
    <SetRow title="Διαγραφή λογαριασμού"
      desc="Διαγράφει οριστικά τον λογαριασμό και όλα τα δεδομένα σου: ακίνητα, ενοικιαστές, πελάτες, δαπάνες, λογαριασμούς, έγγραφα και αρχεία. Η ενέργεια δεν αναιρείται. Αν θέλεις αντίγραφο, προηγείται η εξαγωγή δεδομένων παραπάνω.">
      {leftover ? (
        // Ο λογαριασμός έφυγε, κάτι όμως έμεινε πίσω. Η αποσύνδεση περιμένει
        // τον χρήστη, ώστε το μήνυμα να μην περάσει με μια ανακατεύθυνση.
        <div style={{ background: 'var(--warning-soft)', border: '1px solid var(--warning-border)', borderRadius: T.radius.inner, padding: 16 }}>
          <div style={{ fontSize: 13, color: 'var(--text-primary)', fontFamily: T.font.sans, marginBottom: 12 }}>
            {leftover}
          </div>
          <button onClick={signOut}
            style={{ appearance: 'none', cursor: 'pointer', minHeight: 44, padding: '9px 18px', borderRadius: T.radius.btn, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-primary)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 700 }}>
            Αποσύνδεση
          </button>
        </div>
      ) : !open ? (
        // Ουδέτερο ως προεπιλογή· γίνεται κόκκινο μόνο στο hover/focus, ώστε να μη
        // «σπρώχνει» τον χρήστη προς την έξοδο, αλλά να είναι σαφές όταν το πλησιάζει.
        <button onClick={() => setOpen(true)}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--negative-border)'; e.currentTarget.style.color = 'var(--negative)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          onFocus={e => { e.currentTarget.style.borderColor = 'var(--negative-border)'; e.currentTarget.style.color = 'var(--negative)'; }}
          onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          style={{ appearance: 'none', cursor: 'pointer', padding: '9px 18px', borderRadius: T.radius.btn, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 700, transition: 'color 0.15s, border-color 0.15s' }}>
          Διαγραφή του λογαριασμού μου
        </button>
      ) : (
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: T.radius.inner, padding: 16 }}>
          <div style={{ fontSize: 13, color: 'var(--text-primary)', fontFamily: T.font.sans, marginBottom: 10 }}>
            Για επιβεβαίωση, γράψε <strong>ΔΙΑΓΡΑΦΗ</strong> στο πεδίο και πάτησε την οριστική διαγραφή.
          </div>
          <input aria-label="Επιβεβαίωση διαγραφής" value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder="ΔΙΑΓΡΑΦΗ" autoFocus className="po-field"
            style={{ ...settingsField, maxWidth: 260, marginBottom: 12 }} />
          {error && <div style={{ fontSize: 12, color: 'var(--negative)', fontFamily: T.font.sans, marginBottom: 10 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {/* Ουδέτερο ως προεπιλογή· κόκκινο μόνο στο hover/focus, όταν είναι ενεργό (γραμμένο ΔΙΑΓΡΑΦΗ). */}
            <button onClick={del} disabled={!ready || busy}
              onMouseEnter={e => { if (ready && !busy) { e.currentTarget.style.background = 'var(--negative)'; e.currentTarget.style.borderColor = 'var(--negative)'; e.currentTarget.style.color = 'var(--text-inverse)'; } }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = ready && !busy ? 'var(--text-primary)' : 'var(--text-tertiary)'; }}
              onFocus={e => { if (ready && !busy) { e.currentTarget.style.background = 'var(--negative)'; e.currentTarget.style.borderColor = 'var(--negative)'; e.currentTarget.style.color = 'var(--text-inverse)'; } }}
              onBlur={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = ready && !busy ? 'var(--text-primary)' : 'var(--text-tertiary)'; }}
              style={{ appearance: 'none', cursor: ready && !busy ? 'pointer' : 'not-allowed', padding: '9px 18px', borderRadius: T.radius.btn, border: '1px solid var(--border-default)', background: 'transparent', color: ready && !busy ? 'var(--text-primary)' : 'var(--text-tertiary)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 700, transition: 'background 0.15s, color 0.15s, border-color 0.15s' }}>
              {busy ? 'Διαγραφή…' : 'Οριστική διαγραφή'}
            </button>
            <button onClick={() => { setOpen(false); setConfirmText(''); setError(null); }} disabled={busy}
              style={{ appearance: 'none', cursor: 'pointer', padding: '9px 18px', borderRadius: T.radius.btn, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 500 }}>
              Ακύρωση
            </button>
          </div>
        </div>
      )}
    </SetRow>
  );
}


/**
 * Στοιχείο ταυτότητας που αλλάζει: κλειστό δείχνει την τιμή, ανοιχτό γίνεται πεδίο.
 *
 * ΗΤΑΝ ΓΡΑΜΜΕΝΟ ΔΥΟ ΦΟΡΕΣ, ΚΑΙ ΤΟ «ΣΧΕΔΟΝ ΙΔΙΟ» ΦΑΙΝΟΤΑΝ. Η μία γραμμή έλεγε
 * για την κενή τιμή «—» και η άλλη «Δεν έχει οριστεί»· η μία κρατούσε το
 * μήνυμα σε πράσινο και η άλλη μόνο σε κόκκινο· η μία είχε ετικέτα «Νέο email»
 * στην επεξεργασία και η άλλη «Όνομα ή επωνυμία». Τέσσερις μικρές αποκλίσεις σε
 * δύο διαδοχικές γραμμές της ίδιας κάρτας. Τώρα μία φορά, με τα ίδια λόγια.
 */
function IdentityRow({ label, value, empty, type = 'text', placeholder, locked = false, hint, onSave }: {
  label: string; value: string; empty: string;
  type?: 'text' | 'email'; placeholder: string;
  locked?: boolean; hint?: string;
  onSave: (v: string) => Promise<{ ok: boolean; text: string } | null>;
}) {
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const commit = async () => {
    const v = draft.trim();
    if (!v || v === value) { setEdit(false); return; }
    setBusy(true); setMsg(null);
    const res = await onSave(v);
    setBusy(false); setMsg(res);
    if (!res || res.ok) setEdit(false);
  };

  return (
    <div>
      {!edit ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: T.sp.lg }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ ...TT.bodySm }}>{label}</div>
            <div style={{ ...TT.body, fontWeight: 600, color: value ? 'var(--text-primary)' : 'var(--text-tertiary)', marginTop: 2, overflowWrap: 'anywhere' }}>{value || empty}</div>
          </div>
          <button onClick={() => { setDraft(value); setMsg(null); setEdit(true); }} disabled={locked}
            onMouseEnter={e => { if (!locked) e.currentTarget.style.color = 'var(--accent)'; }}
            onMouseLeave={e => { if (!locked) e.currentTarget.style.color = 'var(--text-secondary)'; }}
            style={{ appearance: 'none', border: 'none', background: 'transparent', cursor: locked ? 'default' : 'pointer', color: locked ? 'var(--text-tertiary)' : 'var(--text-secondary)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 700, padding: 0, flexShrink: 0, transition: 'color 0.15s' }}>
            Αλλαγή
          </button>
        </div>
      ) : (
        <div>
          <div style={{ ...TT.bodySm, marginBottom: 6 }}>{label}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input type={type} autoFocus value={draft} onChange={e => setDraft(e.target.value)} className="po-field"
              aria-label={label} placeholder={placeholder} style={{ ...settingsField, flex: 1, minWidth: 200 }} />
            <Btn variant="primary" onClick={commit} disabled={busy}>{busy ? 'Αποθήκευση…' : 'Αποθήκευση'}</Btn>
            <Btn variant="secondary" onClick={() => setEdit(false)} disabled={busy}>Ακύρωση</Btn>
          </div>
        </div>
      )}
      {msg && <div style={{ ...TT.bodySm, marginTop: 8, color: msg.ok ? 'var(--text-secondary)' : 'var(--negative)' }}>{msg.text}</div>}
      {hint && <div style={{ ...TT.caption, marginTop: 6 }}>{hint}</div>}
    </div>
  );
}

// ── Προφίλ: email (επεξεργάσιμο) + όνομα (μία αλλαγή ανά μήνα) ─────────────
//
// ΤΟ ΑΦΜ ΕΦΥΓΕ ΑΠΟ ΕΔΩ. Εμφανιζόταν ως τρίτη γραμμή, μόνο για ανάγνωση, ενώ
// γράφεται και διορθώνεται στα «Στοιχεία τιμολόγησης». Ο χρήστης που ήθελε να
// το αλλάξει το έβλεπε εδώ και δεν είχε πού να το πατήσει· χειρότερα, αν άλλαζε
// τύπο παραστατικού σε «Απόδειξη», το πεδίο εξαφανιζόταν από την τιμολόγηση και
// έμενε ορατό μόνο εδώ, οριστικά αμετάβλητο. Το στοιχείο ζει σε ένα σημείο:
// εκεί που το γράφεις.
function ProfileCard({ userId, email }: { userId: string; email: string }) {
  const supabase = createClient();
  const [name, setName] = useState('');
  const [changedAt, setChangedAt] = useState<string | null>(null);

  useEffect(() => {
    billing.profile<{ full_name: string | null; full_name_changed_at: string | null }>(
      supabase, userId, 'full_name, full_name_changed_at')
      .then(data => { if (data) { setName(data.full_name || ''); setChangedAt(data.full_name_changed_at || null); } });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Το ρολόι διαβάζεται ΜΙΑ φορά, στην προσάρτηση — όχι σε κάθε απόδοση.
  const [nowMs] = useState(() => Date.now());
  const daysLeft = changedAt ? Math.max(0, 30 - Math.floor((nowMs - new Date(changedAt).getTime()) / 86400000)) : 0;
  const nameLocked = daysLeft > 0;

  const saveEmail = async (v: string) => {
    const { error } = await supabase.auth.updateUser({ email: v });
    return error
      ? { ok: false, text: SAY.changeFailed }
      : { ok: true, text: 'Σου στείλαμε σύνδεσμο επιβεβαίωσης στη νέα διεύθυνση.' };
  };
  const saveName = async (v: string) => {
    const nowIso = new Date().toISOString();
    const { error } = await billing.save(supabase, userId, { full_name: v, full_name_changed_at: nowIso });
    if (error) return { ok: false, text: failed('Το όνομα δεν αποθηκεύτηκε', error) };
    setName(v); setChangedAt(nowIso);
    return null;
  };

  return (
    <Card className="acc-section">
      <SecHdr label="Προφίλ" />
      <SetList>
        <IdentityRow label="Ηλεκτρονικό ταχυδρομείο" value={email} empty={ABSENT}
          type="email" placeholder="ονομα@email.com" onSave={saveEmail} />
        <IdentityRow label="Όνομα ή επωνυμία" value={name} empty={ABSENT}
          placeholder="Το όνομά σου" locked={nameLocked} onSave={saveName}
          hint={nameLocked
            ? `Το όνομα αλλάζει μία φορά τον μήνα. Ξανά σε ${daysLeft} ${daysLeft === 1 ? 'ημέρα' : 'ημέρες'}.`
            : 'Το όνομα αλλάζει μία φορά τον μήνα.'} />
      </SetList>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════

export default function TabSettings({ propertyId, userId, profileType = 'individual', onProfileChange }: { propertyId: string; userId: string; profileType?: ProfileType; onProfileChange?: (v: ProfileType) => void }) {
  const supabase = createClient();

  // Ταυτότητα λογαριασμού & χρέωσης
  const [accountEmail, setAccountEmail] = useState('');
  // Ημερομηνία δημιουργίας λογαριασμού: βάση για τη δωρεάν δοκιμή 30 ημερών.
  const [accountCreatedAt, setAccountCreatedAt] = useState<string | null>(null);
  const [plan, setPlan] = useState('free');
  const [partner, setPartner] = useState(false);
  const [compPlan, setCompPlan] = useState<string | null>(null);
  const [compUntil, setCompUntil] = useState<string | null>(null);
  /** Η σφραγίδα της δοκιμής: μόλις μπει, η τοπική δοκιμή δεν ισχύει πια. */
  const [trialUsedAt, setTrialUsedAt] = useState<string | null>(null);
  const [holdPlan, setHoldPlan] = useState<string | null>(null);
  // Οι θέσεις από συστάσεις μπαίνουν στο όριο, όπως ακριβώς στη βάση.
  const [bonusProps, setBonusProps] = useState<number | null>(null);
  const [bonusUntil, setBonusUntil] = useState<string | null>(null);
  const [holdUntil, setHoldUntil] = useState<string | null>(null);
  const [propertyCount, setPropertyCount] = useState<number | null>(null);
  const [inOrg, setInOrg] = useState(false);

  // Ρυθμίσεις ακινήτου (μόνο για την εξαγωγή τους σε φύλλο)
  const [s, setS] = useState<S>({});

  // Προτιμήσεις εφαρμογής: κρατούνται ΟΛΕΣ, γράφεται πίσω το πλήρες αντικείμενο.
  const [prefs, setPrefs] = useState<AppPreferences>(DEFAULT_PREFERENCES);

  // Ενιαία «Διαχείριση συνδρομής»: σύγκριση πλάνων + στοιχεία τιμολόγησης, σε μία
  // αποκάλυψη (κλειστή ως προεπιλογή, ώστε να μη μοιάζει με λίστα).
  const [showManage, setShowManage] = useState(false);
  const manageRef = useRef<HTMLDivElement | null>(null);
  // Δεύτερος στόχος κύλισης, μέσα στην ίδια αποκάλυψη: η χρέωση. Χωρίς αυτόν,
  // κάθε CTA κατέληγε στην ΚΟΡΥΦΗ της ενότητας και το κουμπί που πατιέται από
  // τη μέση της σύγκρισης έστελνε τον χρήστη πίσω σε ό,τι μόλις διάβαζε.
  const billingRef = useRef<HTMLDivElement | null>(null);
  /** Το πακέτο που διάλεξε ο χρήστης στη σύγκριση, για να το αγοράσει από κάτω. */
  const [wantPlan, setWantPlan] = useState<PlanId | null>(null);
  const [exporting, setExporting] = useState(false);
  const [sheetNote, setSheetNote] = useState('');
  const [exportErr, setExportErr] = useState('');
  const [exportOk, setExportOk] = useState('');
  // ΟΙ ΔΥΟ ΠΡΟΤΙΜΗΣΕΙΣ ΠΡΟΣΒΑΣΙΜΟΤΗΤΑΣ ΖΟΥΝ ΣΤΟΝ ΠΕΡΙΗΓΗΤΗ, ΟΧΙ ΣΤΗ REACT. Ηταν
  // «ξεκινάω με ψέμα και το διορθώνω σε effect»: ο χρήστης που είχε ζητήσει
  // λιγότερη κίνηση έβλεπε τον διακόπτη σβηστό για μία απόδοση, σε ΑΚΡΙΒΩΣ
  // εκείνη την οθόνη που του υπόσχεται ότι τον θυμάται.
  const [reduceMotion, setReduceMotion] = useRememberedFlag('po_reduce_motion');
  const [largeText, setLargeText] = useRememberedFlag('po_large_text');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setAccountEmail(data.user?.email || '');
      setAccountCreatedAt(data.user?.created_at ?? null);
    });
  }, []);

  useEffect(() => {
    billing.profile<{ plan: string | null; comp_plan: string | null; comp_until: string | null; trial_used_at: string | null; hold_plan: string | null; hold_until: string | null; bonus_properties: number | null; bonus_properties_until: string | null }>(
      supabase, userId, 'plan, comp_plan, comp_until, trial_used_at, hold_plan, hold_until')
      .then(data => { if (data) { setPlan(data.plan || 'free'); setCompPlan(data.comp_plan || null); setCompUntil(data.comp_until || null); setTrialUsedAt(data.trial_used_at || null); setHoldPlan(data.hold_plan || null); setHoldUntil(data.hold_until || null); setBonusProps(data.bonus_properties ?? null); setBonusUntil(data.bonus_properties_until || null); } });
    supabase.from('referral_partners').select('user_id').eq('user_id', userId).maybeSingle()
      .then(({ data }) => setPartner(!!data));
    properties.count(supabase, userId).then(setPropertyCount);
    supabase.from('organization_members').select('id').eq('user_id', userId).eq('status', 'active').limit(1)
      .then(({ data }) => setInOrg((data?.length ?? 0) > 0));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function loadSettings() {
    const { data } = await supabase.from('property_settings').select('*').eq('property_id', propertyId).maybeSingle();
    if (data) setS(data);
  }
  async function loadPrefs() {
    const data = await settings.section<Partial<AppPreferences>>(supabase, propertyId, 'app_preferences', userId);
    if (data) setPrefs(p => ({ ...p, ...data }));
    else setPrefs(DEFAULT_PREFERENCES);
  }

  // Δύο φορτώσεις του ίδιου ακινήτου, δηλωμένες ως μία.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const boot = useCallback(() => Promise.all([loadSettings(), loadPrefs()]), [propertyId]);
  useLoad(boot);

  const savePrefs = useCallback(async (next: AppPreferences) => {
    const { error } = await settings.put(supabase, propertyId, userId, 'app_preferences', { ...next });
    return !error;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, userId]);
  const { state: prefsState, schedule: schedulePrefs } = useAutosave(savePrefs);

  function updatePrefs(partial: Partial<AppPreferences>) {
    setPrefs(prev => {
      const next = { ...prev, ...partial };
      schedulePrefs(next);
      return next;
    });
  }

  // Έξυπνη αλλαγή τύπου προφίλ (persist όπως πριν· η ειδοποίηση εμφανίζεται από το derived state)
  const setProfile = async (v: ProfileType) => {
    if (v === profileType) return;
    // Ο τρόπος χρήσης είναι ΔΗΛΩΣΗ ΠΡΟΘΕΣΗΣ, όχι δικαίωμα — και γι' αυτό περνά
    // πάντα. Παλιότερα μπλοκαριζόταν αν δεν είχες ήδη το πλάνο Επαγγελματίας,
    // που έφτιαχνε κλειστό κύκλο: για να πάρεις το πλάνο έπρεπε να είσαι σε
    // επαγγελματικό προφίλ (ALLOWED_PLANS) και για να μπεις σε επαγγελματικό
    // προφίλ έπρεπε να έχεις το πλάνο. Ο Ιδιώτης στα 3 ακίνητα δεν είχε ΚΑΜΙΑ
    // διαδρομή προς τα εμπρός.
    //
    // Οι επαγγελματικές δυνατότητες εξακολουθούν να ανοίγουν ΜΟΝΟ με το πλάνο:
    // το effProfileType στο page.tsx παραμένει «individual» όσο λείπει. Αλλάζει
    // μόνο ποιο πλάνο μπορείς να αγοράσεις.
    const prev = profileType;
    onProfileChange?.(v);
    const { error } = await billing.save(supabase, userId, { profile_type: v });
    if (error) { onProfileChange?.(prev); return; } // επαναφορά αν απέτυχε
    // Δηλώθηκε επαγγελματίας χωρίς το πλάνο: δείχνουμε αμέσως τι λείπει.
    if (v === 'professional' && !planAtLeast(effPlan, 'agency')) openComparison();
  };

  // Ένα σημείο εισόδου: όλα τα CTA (διαχείριση, σύγκριση, «Δες τα πλάνα») ανοίγουν
  // την ίδια ενοποιημένη ενότητα.
  const openManage = () => {
    setShowManage(true);
    setTimeout(() => manageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };
  const openComparison = openManage;

  // ═══ ΤΟ ΚΟΥΜΠΙ ΤΗΣ ΣΥΓΚΡΙΣΗΣ ΠΗΓΑΙΝΕΙ ΠΛΕΟΝ ΚΑΠΟΥ ═══════════════════════
  //
  // Το κύριο κουμπί κάθε ανώτερης στήλης καλούσε `openManage`, ενώ ο μόνος
  // τρόπος να το δει κανείς είναι να είναι ΗΔΗ ανοιχτή η ενότητα (η σύγκριση
  // αποδίδεται μέσα στο `showManage`). Δηλαδή έθετε σε true κάτι που ήταν true
  // και κυλούσε στην κορυφή της ίδιας ενότητας: μία ενέργεια που ακύρωνε την
  // ανάγνωση αντί να την προχωρήσει.
  //
  // Το επόμενο βήμα είναι η χρέωση από κάτω: στοιχεία τιμολόγησης και το ταμείο
  // του εμπόρου. Εκεί οδηγεί και το πακέτο ταξιδεύει μαζί.
  const openBilling = (want?: PlanId) => {
    setShowManage(true);
    // ΠΟΙΟ ΠΑΚΕΤΟ ΤΑΞΙΔΕΥΕΙ ΜΑΖΙ ΜΕ ΤΗΝ ΚΥΛΙΣΗ. Χωρίς αυτό, η κάρτα χρέωσης
    // διάλεγε μόνη της — και η «λογική» προεπιλογή ήταν το ακριβότερο πακέτο
    // που επιτρέπει το προφίλ. Ο χρήστης πατούσε «Ιδιοκτήτης» και έβλεπε τιμή
    // «Ιδιοκτήτης+».
    if (want) setWantPlan(want);
    setTimeout(() => billingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  const ent = { plan, profileType, partner, compPlan, compUntil, trialUsedAt, holdPlan, holdUntil, bonusProperties: bonusProps, bonusUntil, createdAt: accountCreatedAt };
  const effPlan = effectivePlan(ent);
  const comp = activeComp(ent);
  // Η δωρεάν δοκιμή μετράει μόνο όσο δεν έχει ήδη πληρωμένο πλάνο (αλλιώς δεν
  // «ανυψώνει» τίποτα και δεν έχει νόημα να την ανακοινώνουμε).
  const trial = trialState(ent);
  const trialShowing = trial.active && normalizePlan(plan) === 'free' && !comp && !partner;
  const propLimit = propertyLimit(ent);
  const propLimitLabel = propLimit === Infinity ? 'απεριόριστα' : String(propLimit);
  const usagePct = propLimit === Infinity || !propertyCount ? 0 : Math.min(100, Math.round((propertyCount / propLimit) * 100));
  const atLimit = propLimit !== Infinity && (propertyCount ?? 0) >= propLimit;
  const nearLimit = propLimit !== Infinity && !atLimit && propLimit > 1 && (propertyCount ?? 0) >= propLimit - 1;
  const planMeta = PLANS[effPlan];
  const isProPlan = effPlan === 'agency';
  const proEligible = planAtLeast(effPlan, 'agency');
  const tier: 'owner' | 'agency' | 'partner' = partner ? 'partner' : profileType === 'professional' ? 'agency' : 'owner';

  // ── Η ΕΞΑΓΩΓΗ ΡΥΘΜΙΣΕΩΝ ΗΤΑΝ ΧΩΜΑΤΕΡΗ ΤΗΣ ΒΑΣΗΣ ────────────────────────
  // Εγραφε `Object.entries` της γραμμής, δηλαδή έστελνε στον χρήστη ελληνικού
  // προϊόντος ένα φύλλο με στήλη «Πεδίο» γεμάτη `owner_afm`, `internet_plan`,
  // `user_id`, `created_at`. Και όταν το ακίνητο δεν είχε ακόμη γραμμή
  // ρυθμίσεων, κατέβαινε φύλλο με ΜΟΝΟ τις επικεφαλίδες: ο χρήστης πατά
  // «Εξαγωγή», ανοίγει το αρχείο και βρίσκει δύο άδειες στήλες. Δεν μπορεί να
  // ξεχωρίσει αν δεν έχει δεδομένα ή αν η εξαγωγή χάλασε.
  //
  // Τώρα φεύγουν μόνο τα πεδία που σημαίνουν κάτι για άνθρωπο, με ελληνικό
  // όνομα και στη σειρά που τα σκέφτεται· τα κλειδιά της βάσης δεν είναι
  // ρύθμιση. Και όταν δεν υπάρχει τίποτα, δεν κατεβαίνει αρχείο: το λέει.
  const exportSettingsSheet = () => {
    const rows = SETTINGS_FIELDS
      .map(([key, label]) => [label, String((s as Record<string, unknown>)[key] ?? '').trim()])
      .filter(([, value]) => value !== '');
    if (rows.length === 0) {
      setSheetNote('Δεν υπάρχει καμία καταχωρημένη ρύθμιση σε αυτό το ακίνητο.');
      return;
    }
    setSheetNote('');
    downloadTableXlsx(`Ρυθμίσεις ακινήτου ${athensToday()}`, {
      title: 'Ρυθμίσεις ακινήτου', headers: ['Ρύθμιση', 'Τιμή'], rows,
    });
  };

  const exportAll = async () => {
    if (exporting) return;
    setExporting(true); setExportErr(''); setExportOk('');
    const res = await exportAllData();
    setExporting(false);
    if (!res.ok) { setExportErr('Δεν ήταν δυνατή η εξαγωγή αυτή τη στιγμή. Δοκίμασε ξανά.'); return; }
    // ΤΙ ΚΑΤΕΒΗΚΕ, ΜΕ ΑΡΙΘΜΟΥΣ. Ένα αρχείο που εμφανίζεται στις λήψεις χωρίς
    // καμία ένδειξη δεν επιβεβαιώνει τίποτα — και σε αίτημα φορητότητας
    // δεδομένων ο χρήστης έχει κάθε λόγο να θέλει να ξέρει ότι πήρε τα πάντα.
    setExportOk(`Κατέβηκαν ${fn(res.rows ?? 0)} εγγραφές από ${fn(res.tables ?? 0)} πίνακες.`);
  };

  // Η γραφή στον localStorage γίνεται πλέον από το `useRememberedFlag`. Εδώ μένει
  // μόνο η κλάση στο <html>, που είναι το ορατό αποτέλεσμα.
  const setA11y = (cls: string, v: boolean, setter: (b: boolean) => void) => {
    setter(v);
    try { document.documentElement.classList.toggle(cls, v); } catch { /* ignore */ }
  };

  const PROFILE_OPTS: { v: ProfileType; title: string; sub: string }[] = [
    { v: 'individual', title: 'Ιδιώτης', sub: 'Ένα ή λίγα δικά μου ακίνητα. Απλό, καθαρό, χωρίς περιττά.' },
    { v: 'professional', title: 'Επαγγελματίας', sub: 'Πολλά ακίνητα. Χαρτοφυλάκιο, σύγκριση, εργαλεία διαχείρισης.' },
  ];

  return (
    <div style={{ ...pageShell(880), color: 'var(--text-primary)' }}>

      {/* Ο ΥΠΟΤΙΤΛΟΣ ΑΠΑΡΙΘΜΟΥΣΕ ΤΙΣ ΕΝΟΤΗΤΕΣ ΠΟΥ ΕΠΟΝΤΑΙ. «Προφίλ, συνδρομή,
          ειδοποιήσεις, ασφάλεια και τα δεδομένα σου» — και από κάτω, με τη
          σειρά: Προφίλ, Συνδρομή, Ειδοποιήσεις, Ασφάλεια, Δεδομένα. Ο ίδιος
          κατάλογος δύο φορές, σε απόσταση σαράντα εικονοστοιχείων. Ο υπότιτλος
          λέει τώρα τι ΕΙΝΑΙ η σελίδα· τι περιέχει το λένε οι κεφαλίδες της. */}
      <PageTitle title="Λογαριασμός" sub="Ό,τι αφορά εσένα και τον έλεγχό σου πάνω στα δεδομένα σου" />

      {/* ── 1. ΠΡΟΦΙΛ ─────────────────────────────────────────────────── */}
      <ProfileCard userId={userId} email={accountEmail} />

      {/* ── 2. ΣΥΝΔΡΟΜΗ (hero) ────────────────────────────────────────── */}
      <Card className="acc-section" style={{ animationDelay: '70ms', background: 'var(--surface-hero)', boxShadow: 'var(--highlight-inset), var(--elev-2)' }}>
        {/* ΤΡΕΙΣ ΛΕΞΕΙΣ ΓΙΑ ΔΥΟ ΠΡΑΓΜΑΤΑ, ΣΤΗΝ ΙΔΙΑ ΚΑΡΤΑ. Το μετάλλιο έγραφε
            «ΙΔΙΟΤΗΤΑ · Επαγγελματίας» — που είναι ο ΤΡΟΠΟΣ ΧΡΗΣΗΣ, όχι το πακέτο
            — ακριβώς δίπλα στο «Πακέτο Επαγγελματίας», που είναι το πακέτο. Δύο
            διαφορετικά πράγματα με το ίδιο όνομα, σε απόσταση διακοσίων
            εικονοστοιχείων και ο ίδιος τρόπος χρήσης ξαναρωτιέται με κάρτες
            επιλογής τετρακόσια πιο κάτω. Χειρότερα, όποιος είχε πακέτο
            «Επαγγελματίας» με προφίλ «Ιδιώτη» διάβαζε «ΙΔΙΟΤΗΤΑ Ιδιώτης» πάνω από
            το «Πακέτο Επαγγελματίας» και δεν καταλάβαινε ποιο ισχύει.
            Και το μετάλλιο έφυγε κι αυτό: το πακέτο γράφεται με το όνομά του
            τρεις γραμμές πιο κάτω, οπότε το σήμα ήταν τέταρτη επανάληψη. */}
        <SecHdr label="Συνδρομή" />

        {/* Τρέχον πλάνο */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid var(--border-subtle)', borderRadius: T.radius.pill, padding: '4px 12px' }}>
              <span className={isProPlan ? 'acc-live-dot accent' : 'acc-live-dot'} style={{ width: 6, height: 6, background: isProPlan ? 'var(--accent)' : 'var(--positive)' }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.sans }}>Πακέτο {planMeta.name}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginTop: 8, lineHeight: 1.5 }}>{planMeta.tagline}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn variant={showManage ? 'secondary' : 'primary'} onClick={() => showManage ? setShowManage(false) : openManage()}>
              {showManage ? 'Κλείσιμο' : 'Διαχείριση συνδρομής'}
            </Btn>
          </div>
        </div>

        {/* ═══ ΤΑ ΤΕΣΣΕΡΑ ΠΑΚΕΤΑ, ΟΡΑΤΑ ΜΕΣΑ ΣΤΗΝ ΕΦΑΡΜΟΓΗ ══════════════════
            Η οθόνη έλεγε μόνο ΠΟΙΟ πακέτο έχεις. Τα ονόματα των άλλων τριών
            ζούσαν στην αρχική σελίδα και σε ένα παράθυρο που άνοιγε με κουμπί:
            ο συνδρομητής δεν είχε τρόπο να δει τη σκάλα ολόκληρη, ούτε πού
            βρίσκεται πάνω της. Τέσσερα ονόματα, μία σειρά, το δικό σου
            σημαδεμένο. Χωρίς τιμές και χωρίς πίεση — η σύγκριση ανοίγει με το
            «Διαχείριση συνδρομής» για όποιον τη θέλει. */}
        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
          {PAID_PLAN_ORDER.map(id => {
            const on = id === effPlan;
            return (
              <div key={id} style={{
                textAlign: 'center', padding: '9px 6px', borderRadius: T.radius.inner,
                border: `1px solid ${on ? 'var(--accent-border)' : 'var(--border-subtle)'}`,
                background: on ? 'var(--accent-dim)' : 'var(--bg-surface)',
              }}>
                <div style={{ fontSize: 12, fontWeight: on ? 700 : 500, color: on ? 'var(--accent)' : 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.3 }}>{PLANS[id].name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                  {PLANS[id].maxProperties === Infinity ? 'απεριόριστα' : `${PLANS[id].maxProperties} ${PLANS[id].maxProperties === 1 ? 'ακίνητο' : 'ακίνητα'}`}
                </div>
              </div>
            );
          })}
        </div>

        {/* Μετρητής ακινήτων: προ-πουλά ήρεμα το όριο, χωρίς τοίχο-έκπληξη */}
        {propertyCount != null && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 7 }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>Ακίνητα</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.sans, fontVariantNumeric: 'tabular-nums' }}>{propertyCount} από {propLimitLabel}</span>
            </div>
            {propLimit !== Infinity && (
              <Bar pct={usagePct} tone={atLimit ? 'var(--warning)' : 'var(--accent)'} track="var(--bg-elevated)" label="Ακίνητα σε χρήση" />
            )}
            {(atLimit || nearLimit) && (
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginTop: 8, lineHeight: 1.5 }}>
                {atLimit
                  ? 'Έφτασες το όριο του πακέτου σου. Αναβάθμισε για να κρατάς κι άλλα ακίνητα σε ένα σημείο.'
                  : 'Ένα ακόμη ακίνητο και φτάνεις το όριο του πακέτου σου.'}
              </div>
            )}
          </div>
        )}

        {/* ── Η ΤΟΠΙΚΗ ΔΟΚΙΜΗ, ΔΗΛΑΔΗ ΑΥΤΗ ΧΩΡΙΣ ΚΑΡΤΑ ──────────────────────
            ΤΟ ΠΛΑΙΣΙΟ ΔΕΝ ΕΜΦΑΝΙΖΕΤΑΙ ΠΟΤΕ ΣΕ ΟΠΟΙΟΝ ΕΧΕΙ ΔΩΣΕΙ ΚΑΡΤΑ και
            αυτό είναι που κάνει τη διατύπωση αληθινή. Το `trialState` σβήνει
            μόλις ο webhook σφραγίσει το `trial_used_at`, δηλαδή μόλις ο
            έμπορος δώσει τη δική του δοκιμή· από εκεί και πέρα μιλά η κάρτα
            της συνδρομής, που ξέρει την ημερομηνία της πρώτης χρέωσης.

            Ο λόγος γράφεται ΜΕΣΑ στην πρόταση («δεν έχεις δηλώσει μέσο
            πληρωμής»): έτσι, αν κάποτε σπάσει η σύζευξη, το κείμενο θα φαίνεται
            ψεύτικο αντί να είναι σιωπηλά ψεύτικο. */}
        {trialShowing && (
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'flex-start', gap: 10, background: 'var(--accent-dim)', border: '1px solid var(--accent-border)', borderRadius: T.radius.inner, padding: '12px 14px' }}>
            <span className="acc-live-dot accent" style={{ width: 6, height: 6, background: 'var(--accent)', flexShrink: 0, marginTop: 6 }} />
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.55 }}>
              Δοκιμάζεις δωρεάν το <strong style={{ color: 'var(--text-primary)' }}>{PLANS[effPlan].name}</strong> για {trial.daysLeft === 1 ? 'ακόμη μία ημέρα' : `ακόμη ${trial.daysLeft} ημέρες`}.
              {' '}Δεν έχεις δηλώσει μέσο πληρωμής, οπότε δεν πρόκειται να χρεωθείς: όταν λήξει, ο λογαριασμός σου συνεχίζει στο «{PLANS.free.name}», με το πρώτο σου ακίνητο και τα δεδομένα σου ανέπαφα.
            </div>
          </div>
        )}

        {/* Ενεργή δωρεάν πρόσβαση (κερδισμένοι μήνες) */}
        {comp && (
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'flex-start', gap: 10, background: 'var(--positive-soft)', border: '1px solid var(--positive-border)', borderRadius: T.radius.inner, padding: '12px 14px' }}>
            <span className="acc-live-dot" style={{ width: 6, height: 6, background: 'var(--positive)', flexShrink: 0, marginTop: 6 }} />
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.55 }}>
              {/* «ΕΩΣ ΤΙΣ 1 ΙΑΝΟΥΑΡΙΟΥ 2100». Δύο λάθη σε μία φράση. Το «τις»
                  θέλει πληθυντικό ημερομηνιών, όχι «1 Ιανουαρίου». Και το 2100
                  δεν είναι ημερομηνία: είναι η τιμή που γράφει ο κώδικας όταν η
                  πρόσβαση δεν λήγει ποτέ. Ο χρήστης διάβαζε ένα αστείο εκεί που
                  περίμενε όρο. Ό,τι απέχει πάνω από δέκα χρόνια λέγεται με
                  λέξεις, γιατί αυτό ακριβώς σημαίνει. */}
              Έχεις δωρεάν πρόσβαση <strong style={{ color: 'var(--text-primary)' }}>{PLANS[comp.plan].name}</strong>
              {isOpenEnded(comp.until)
                ? ', χωρίς ημερομηνία λήξης'
                : <> έως και {fdLong(comp.until)}</>}. Την κέρδισες από το Πρόγραμμα Πρόσκλησης, χωρίς καμία χρέωση.
            </div>
          </div>
        )}

        {/* Τρόπος χρήσης: Ιδιώτης / Επαγγελματίας */}
        <div style={divider}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.sans, marginBottom: 3 }}>Τρόπος χρήσης</div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginBottom: 14, lineHeight: 1.5 }}>
            Αλλάζει όποτε θες.{partner ? ' Είσαι ενεργός Συνεργάτης PROPERWISE.' : ''}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 12 }}>
            {PROFILE_OPTS.map(o => {
              const on = profileType === o.v;
              const requiresUpgrade = o.v === 'professional' && !proEligible;
              return (
                <button key={o.v} onClick={() => setProfile(o.v)} className="acc-choice"
                  title={requiresUpgrade ? 'Απαιτεί το πακέτο Επαγγελματίας' : undefined}
                  style={{ textAlign: 'left', cursor: 'pointer', borderRadius: T.radius.card, padding: '16px 16px 15px', border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border-default)'}`, background: on ? 'var(--accent-soft)' : 'var(--bg-surface)', boxShadow: on ? '0 0 0 3px var(--accent-dim)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: on ? 'var(--accent)' : 'var(--text-primary)', fontFamily: T.font.sans }}>{o.title}</span>
                    {requiresUpgrade ? (
                      <span aria-hidden style={{ flexShrink: 0, color: 'var(--text-tertiary)', display: 'inline-flex' }}>
                        <svg aria-hidden="true" width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                      </span>
                    ) : (
                      <span style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, border: `2px solid ${on ? 'var(--accent)' : 'var(--border-default)'}`, background: on ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {on && <svg aria-hidden="true" width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--accent-text)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, marginTop: 5, lineHeight: 1.5 }}>{o.sub}</div>
                  {requiresUpgrade && (
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginTop: 8 }}>Απαιτεί αναβάθμιση στο πακέτο Επαγγελματίας.</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ═══ Η ΠΡΟΩΡΗ ΠΡΟΣΒΑΣΗ ΕΦΥΓΕ ΑΠΟ ΕΔΩ ══════════════════════════════
            Δύο σειρές κειμένου για εφαρμογή κινητού που δεν έχει βγει και δεν
            έχει ημερομηνία, μέσα στην κάρτα που ο συνδρομητής ανοίγει για να
            αλλάξει πακέτο. Είναι όρος του πακέτου, όχι νέα: ζει στη σειρά
            «Πρόωρη πρόσβαση» του πίνακα δυνατοτήτων και στους Ορους Χρήσης,
            δηλαδή εκεί που τη διαβάζει όποιος τη ζητά. */}

      </Card>

      {/* Επωνυμία αναφορών (Επαγγελματίας): δική της ενότητα, χωρίς Card-in-Card. */}
      {profileType === 'professional' && (
        <ReportBranding userId={userId} plan={effPlan} onUpgrade={openComparison} />
      )}

      {/* Ενοποιημένη «Διαχείριση συνδρομής»: πρώτα η σύγκριση πλάνων (τι κερδίζεις),
          έπειτα τα στοιχεία τιμολόγησης και η χρέωση (νηφάλια). Μία αποκάλυψη. */}
      {showManage && (
        <div ref={manageRef} style={{ scrollMarginTop: 16 }}>
          <PlanComparison profileType={profileType} currentPlan={effPlan} onUpgrade={openBilling} />
          <div ref={billingRef} style={{ scrollMarginTop: 16 }}><Billing userId={userId} wantPlan={wantPlan} /></div>
        </div>
      )}

      {/* ═══ Η ΣΕΙΡΑ ΤΩΝ ΕΝΟΤΗΤΩΝ ΑΛΛΑΞΕ, ΚΑΙ ΕΙΝΑΙ ΑΠΟΦΑΣΗ ══════════════════
          «Η γνώμη σου» και «Τι έρχεται» κάθονταν ΑΝΑΜΕΣΑ στις ειδοποιήσεις και
          στην εμφάνιση: δύο μεγάλες, μόνιμα ανοιχτές κάρτες που έκοβαν στη μέση
          τη στήλη των έξι ελαχιστοποιημένων ρυθμίσεων. Όποιος κατέβαινε για την
          «Ασφάλεια» περνούσε πρώτα από ένα ερωτηματολόγιο και μια εφαρμογή
          κινητού που δεν έχει βγει ακόμη.
          Πρώτα ό,τι ρυθμίζεται, μετά ό,τι έρχεται και ό,τι μας λες. */}

      {/* ── ΟΡΓΑΝΙΣΜΟΣ & ΟΜΑΔΑ (Επαγγελματίας ή μέλος ομάδας) ───────────── */}
      {(profileType === 'professional' || inOrg) && (
        <CollapsibleSection title="Οργανισμός και ομάδα" hint="Μέλη και δικαιώματα" delay="110ms">
          <OrgTeam userId={userId} />
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Ειδοποιήσεις" hint="Υπενθυμίσεις και μηνύματα" delay="140ms">
        <NotificationSettings userId={userId} />
      </CollapsibleSection>

      <CollapsibleSection title="Εμφάνιση και γλώσσα" hint="Θέμα, κείμενο, προθεσμίες" delay="170ms">
        <SetList>
          <SetRow title="Θέμα" desc="Εναλλαγή ανάμεσα σε φωτεινό και σκοτεινό." control={<ThemeToggle />} />
          {/* Η ΡΥΘΜΙΣΗ «ΔΕΚΑΔΙΚΑ ΣΤΑ ΠΟΣΑ» ΕΦΥΓΕ, ΚΑΙ ΔΕΝ ΕΛΕΙΨΕ ΣΕ ΚΑΝΕΝΑΝ.
              Δεν τη διάβαζε ΟΥΤΕ ΕΝΑ σημείο της εφαρμογής: ο χρήστης άλλαζε την
              επιλογή, η οθόνη έδειχνε ότι αποθηκεύτηκε και δεν συνέβαινε τίποτα.
              Ένας διακόπτης που δεν κάνει τίποτα είναι χειρότερος από απόντα —
              διδάσκει ότι οι ρυθμίσεις δεν μετράνε.
              Τα ποσά γράφονται πάντα με δύο δεκαδικά, γιατί αλλιώς η υποδιαστολή
              κάθεται σε άλλη θέση σε κάθε γραμμή και η στήλη σπάει. */}
          <SetRow title="Ορίζοντας προθεσμιών" desc="Πόσο μπροστά κοιτά η λίστα «Τι χρειάζεται τώρα» στην αρχική οθόνη. Ό,τι είναι πιο μακριά ζει στο Ημερολόγιο και στις Εκκρεμότητες. Οι εκπρόθεσμες εμφανίζονται πάντα, όποια τιμή κι αν επιλέξεις."
            control={<div style={{ width: 264 }}>
              <CustomSelect ariaLabel="Ορίζοντας προθεσμιών" value={String(prefs.agendaHorizonDays)}
                onChange={v => updatePrefs({ agendaHorizonDays: Number(v) as AppPreferences['agendaHorizonDays'] })}
                options={[
                  { value: '30',  label: 'Επόμενος μήνας (30 ημέρες)' },
                  { value: '60',  label: 'Δύο μήνες (60 ημέρες)' },
                  { value: '90',  label: 'Τρίμηνο (90 ημέρες)' },
                  { value: '180', label: 'Εξάμηνο (180 ημέρες)' },
                  { value: '365', label: 'Ολόκληρο έτος (365 ημέρες)' },
                ]} />
            </div>} />
          <SetRow title="Μειωμένη κίνηση" desc="Περιορίζει τα εφέ κίνησης σε όλη την εφαρμογή, για πιο ήρεμη εμπειρία."
            control={<Toggle on={reduceMotion} onChange={v => setA11y('a11y-reduce-motion', v, setReduceMotion)} size="sm" />} />
          <SetRow title="Μεγαλύτερο κείμενο" desc="Ήπια μεγέθυνση της διεπαφής για πιο άνετη ανάγνωση."
            control={<Toggle on={largeText} onChange={v => setA11y('a11y-large-text', v, setLargeText)} size="sm" />} />
          {/* ── ΤΟ «ΑΠΛΟΠΟΙΗΜΕΝΟ ΜΕΝΟΥ» ΕΦΥΓΕ ΑΠΟ ΕΔΩ ────────────────────────
              Η ίδια προτίμηση ρυθμιζόταν σε δύο σημεία, με δύο ονόματα και
              ΑΝΤΙΣΤΡΟΦΗ πολικότητα: στην πλαϊνή μπάρα ως «Όλες οι καρτέλες» /
              «Λιγότερες καρτέλες» κι εδώ ως διακόπτης που είναι ΑΝΟΙΧΤΟΣ όταν
              το `navShowAll` είναι ψευδές. Ο χρήστης που πατούσε «Όλες οι
              καρτέλες» στη μπάρα και ερχόταν εδώ, έβρισκε έναν διακόπτη που
              είχε κλείσει μόνος του.
              Μένει η μπάρα: εκεί γίνεται η ενέργεια και εκεί φαίνεται αμέσως
              το αποτέλεσμά της. Μια ρύθμιση που τη βλέπεις να συμβαίνει δεν
              χρειάζεται δεύτερο διακόπτη σε άλλη οθόνη. */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 18 }}>
            <span style={{ ...TT.caption }}>Γλώσσα: Ελληνικά · Νόμισμα: ευρώ (€)</span>
            <SaveNote state={prefsState} />
          </div>
        </SetList>
      </CollapsibleSection>

      <CollapsibleSection title="Ασφάλεια" hint="Κωδικός και επαλήθευση δύο βημάτων" delay="200ms">
        <SecuritySettings />
      </CollapsibleSection>

      <CollapsibleSection title="Δραστηριότητα" hint="Το ιστορικό των ενεργειών σου" delay="230ms">
        <ActivityLog />
      </CollapsibleSection>

      <CollapsibleSection title="Δεδομένα και απόρρητο" hint="Εισαγωγή, εξαγωγή, λογιστής, διαγραφή" delay="260ms">
        <SetList>
          {/* Η ΕΙΣΑΓΩΓΗ ΠΡΩΤΗ. Ολα τα υπόλοιπα εδώ βγάζουν δεδομένα προς τα έξω
              ή τα κλείνουν· αυτό είναι το μόνο που τα φέρνει μέσα και είναι το
              πρώτο που θα ψάξει όποιος διάβασε γι' αυτό. */}
          <InboundAddress userId={userId} />
          {/* Η ίδια ιδέα προς την άλλη κατεύθυνση: το email φέρνει δεδομένα
              ΜΕΣΑ, το ημερολόγιο βγάζει τις προθεσμίες ΕΞΩ, εκεί που ο
              ιδιοκτήτης κοιτάζει ήδη κάθε μέρα. */}
          <CalendarFeedRow userId={userId} />
          <SetRow title="Εξαγωγή όλων των δεδομένων" desc="Κάθε εγγραφή που σε αφορά, σε ένα αρχείο JSON, για μεταφορά σε άλλη υπηρεσία ή για δικό σου αντίγραφο. Είναι μορφή για μηχανές: το δικαίωμα φορητότητας τη ζητά έτσι. Για να διαβάσεις δεδομένα, κάθε καρτέλα έχει τη δική της εξαγωγή σε Excel."
            control={<Btn variant="secondary" onClick={exportAll} disabled={exporting}>{exporting ? 'Εξαγωγή…' : 'Εξαγωγή όλων'}</Btn>}>
            {exportErr && <div style={{ ...TT.bodySm, color: 'var(--negative)' }}>{exportErr}</div>}
            {exportOk && <div style={{ ...TT.bodySm }}>{exportOk}</div>}
          </SetRow>
          <SetRow title="Εξαγωγή ρυθμίσεων ακινήτου" desc="Ιδιοκτήτης, πάροχοι, διαχειριστής και ασφάλεια αυτού του ακινήτου, σε φύλλο Excel."
            control={<Btn variant="secondary" onClick={exportSettingsSheet}>Εξαγωγή Excel</Btn>}>
            {sheetNote && <div style={{ ...TT.bodySm }}>{sheetNote}</div>}
          </SetRow>
          <AccountantAccess userId={userId} />
          <MarketDataSharing userId={userId} />
          {/* Η εμπιστοσύνη δεν είναι μόνο για τη σελίδα πωλήσεων: ο υπάρχων χρήστης
              πρέπει να βρίσκει με ένα κλικ πού ζουν τα δεδομένα του και ποιοι είμαστε. */}
          <SetRow title="Πού φυλάσσονται τα δεδομένα σου"
            desc="Ποιοι είμαστε, σε ποια χώρα βρίσκονται τα δεδομένα σου, ποιος μπορεί να τα δει και τι δεν κάνουμε ποτέ μ’ αυτά.">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a href="/trust" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}><Btn variant="secondary">Ποιοι είμαστε</Btn></a>
              <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}><Btn variant="ghost">Πολιτική απορρήτου</Btn></a>
              <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}><Btn variant="ghost">Όροι χρήσης</Btn></a>
            </div>
          </SetRow>
          <DeleteAccount />
        </SetList>
      </CollapsibleSection>

      {/* ── ΤΙ ΕΡΧΕΤΑΙ, ΚΑΙ ΜΕΤΑ Η ΓΝΩΜΗ ΣΟΥ ─────────────────────────────
          Στο τέλος, όχι επειδή μετρούν λιγότερο, αλλά επειδή δεν είναι
          ρυθμίσεις: κοιτούν μπροστά, ενώ όλα τα παραπάνω ρυθμίζουν το τώρα. */}
      <Card className="acc-section" style={{ animationDelay: '290ms' }}>
        <SettingsRoadmap userId={userId} />
      </Card>

      <div className="acc-section" style={{ animationDelay: '320ms', marginBottom: T.sp.lg }}>
        <Feedback target="general" />
      </div>

    </div>
  );
}
