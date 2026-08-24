'use client';

// ═══════════════════════════════════════════════════════════════════════════
// ΣΥΝΔΡΟΜΗ ΚΑΙ ΣΤΟΙΧΕΙΑ ΤΙΜΟΛΟΓΗΣΗΣ
// ─────────────────────────────────────────────────────────────────────────
// ΠΟΙΟΣ ΠΟΥΛΑΕΙ, ΔΕΝ ΓΡΑΦΕΤΑΙ ΕΔΩ. Η οθόνη έλεγε με το χέρι ότι ο πάροχος
// «είναι ο έμπορος της συναλλαγής και αποδίδει τον ΦΠΑ». Δεν είναι: πωλητής
// είναι ο φορέας λειτουργίας, που εκδίδει το παραστατικό και αποδίδει τον
// ΦΠΑ, και ο πάροχος μόνο διεκπεραιώνει την πληρωμή. Η πρόταση έρχεται πλέον
// από τον διακομιστή, ίδια με εκείνη των Ορων και της Πολιτικής απορρήτου.
//
// ΤΙ ΚΑΝΕΙ Η ΟΘΟΝΗ ΚΑΙ ΤΙ ΔΕΝ ΚΑΝΕΙ. Κρατά τα στοιχεία τιμολόγησης, δείχνει
// την κατάσταση της συνδρομής όπως την ξέρει ο πάροχος, και ανοίγει δύο πόρτες
// του: το ταμείο για όποιον δεν έχει συνδρομή, και τη διαχείριση συνδρομής για
// όποιον έχει. ΔΕΝ αγγίζει ποτέ το πακέτο: το `plan` γράφεται μόνο από τον
// webhook, με ρόλο υπηρεσίας, αφού η πληρωμή έχει γίνει.
//
// ΚΑΙ ΔΕΝ ΥΠΟΣΧΕΤΑΙ ΚΟΥΜΠΙ ΠΟΥ ΔΕΝ ΥΠΑΡΧΕΙ. Οσο δεν έχει ρυθμιστεί ο πάροχος,
// η κάρτα το λέει καθαρά αντί να δείχνει απενεργοποιημένο κουμπί.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import * as properties from '@/lib/data/properties';
// Το προφίλ χρέωσης έχει ένα σπίτι: lib/data/billing.
import * as billing from '@/lib/data/billing';
import { TextInput, CustomSelect } from './UIComponents';
import { T, Btn, InfoBanner, Spinner, Card, SecHdr, fixedCols, fe, fd } from '@/components/Theme';
import { PLANS, PLAN_ORDER, normalizePlan, annualPerMonth, type PlanId, type BillingCycle } from '@/lib/billing/plans';
// Η ΦΑΣΗ ΤΗΣ ΣΥΝΔΡΟΜΗΣ ΔΕΝ ΚΡΙΝΕΤΑΙ ΕΔΩ. Οι καταστάσεις τις ονομάζει ο
// έμπορος και τις γράφει ο webhook· η οθόνη τις διαβάζει από την ίδια πηγή.
import { subPhase } from '@/lib/billing/lemon';
import { ALLOWED_PLANS, planFromParam, cycleFromParam, type ProfileType } from '@/lib/billing/entitlements';
import { SegmentControl } from './UIComponents';
import { notifyError, notifyOk } from '@/components/Toast';
import { ALL_COUNTRIES, isEuCountry, isReverseCharge, missingInvoiceFields, type InvoiceProfile } from '@/lib/billing/invoiceProfile';
import { determineVat, vatTreatmentLabel } from '@/lib/billing/invoicing';

interface BillingData {
  doc_type: string; full_name: string; company_name: string; afm: string; doy: string;
  profession: string; address: string; city: string; postal_code: string; country: string;
  vat_number: string; phone: string; plan: string; billing_cycle: string;
  /** Ο τύπος προφίλ κρίνει ΠΟΙΟ πακέτο αγοράζεται. */
  profile_type: string;
  /** Ο,τι ξέρει ο πάροχος για τη συνδρομή. Διαβάζεται, δεν γράφεται από εδώ. */
  subscription_status: string; mor_renews_at: string; mor_ends_at: string;
  /** Η συνδρομή στον έμπορο. Η ΥΠΑΡΞΗ της κρίνει αν υπάρχει πύλη διαχείρισης. */
  mor_subscription_id: string;
  /** Ο λογαριασμός δοκιμαστή. Οσο υπάρχει, δεν υπάρχει τίποτα να αγοραστεί. */
  tester_since: string;
  /** Υποβάθμιση που περιμένει την ανανέωση: τι κρατιέται, και ώς πότε. */
  hold_plan: string; hold_until: string;
}
const INIT: BillingData = {
  doc_type: 'receipt', full_name: '', company_name: '', afm: '', doy: '', profession: '',
  address: '', city: '', postal_code: '', country: 'GR', vat_number: '', phone: '', plan: 'free', billing_cycle: 'monthly',
  profile_type: 'individual', subscription_status: '', mor_renews_at: '', mor_ends_at: '',
  mor_subscription_id: '', tester_since: '', hold_plan: '', hold_until: '',
};

export default function Billing({ userId, wantPlan = null }: {
  userId: string;
  /** Το πακέτο που διάλεξε ο χρήστης στη σύγκριση από πάνω. */
  wantPlan?: PlanId | null;
}) {
  const supabase = createClient();
  const [d, setD] = useState<BillingData>(INIT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveErr, setSaveErr] = useState(false);
  const [prefilled, setPrefilled] = useState(false);
  const set = (k: keyof BillingData, v: string) => setD(p => ({ ...p, [k]: v }));
  // Η κάρτα ξαναδιαβάζει το προφίλ όταν κάτι το άλλαξε στον διακομιστή — η
  // αλλαγή πακέτου δοκιμαστή γράφεται με ρόλο υπηρεσίας, οπότε η οθόνη δεν
  // μπορεί να τη μαντέψει.
  const [reloads, setReloads] = useState(0);
  const reload = () => setReloads(n => n + 1);

  // ── Η ΕΠΙΛΟΓΗ ΤΗΣ ΕΓΓΡΑΦΗΣ ΕΠΙΖΕΙ ΤΗΣ ΕΓΚΑΤΑΛΕΙΨΗΣ ΤΟΥ ΤΑΜΕΙΟΥ ────────
  // Πακέτο και κύκλος διαλέγονται στον τιμοκατάλογο και γράφονται στο προφίλ
  // με την εγγραφή. Οποιος όμως έκλεισε το ταμείο για να το ξανασκεφτεί
  // έβρισκε εδώ το ΦΘΗΝΟΤΕΡΟ πακέτο, μηνιαίο: η κάρτα δεν θυμόταν τίποτα, και
  // η επιλογή του έπρεπε να ξαναγίνει από την αρχή. Δείχνεται μόνο όσο δεν
  // υπάρχει συνδρομή — ό,τι πληρώνεται ήδη είναι ισχυρότερο από μια επιθυμία.
  const [wishPlan, setWishPlan] = useState<PlanId | null>(null);
  const [wishCycle, setWishCycle] = useState<BillingCycle>('monthly');

  useEffect(() => {
    (async () => {
      const [data, { data: u }] = await Promise.all([
        billing.profile<Partial<BillingData>>(supabase, userId, '*'),
        supabase.auth.getUser(),
      ]);
      const meta = (u.user?.user_metadata as Record<string, string> | undefined) || {};
      setWishPlan(planFromParam(meta.chosen_plan));
      setWishCycle(cycleFromParam(meta.chosen_cycle));
      const base: BillingData = { ...INIT, ...(data || {}) };

      // Έξυπνη προσυμπλήρωση: αντλούμε ό,τι ήδη ξέρουμε από το ακίνητο και τις
      // ρυθμίσεις του, ώστε ο χρήστης να μη βρίσκει άδεια φόρμα (αλλιώς δεν τη
      // συμπληρώνει ποτέ). Γεμίζουμε ΜΟΝΟ τα κενά· δεν πατάμε ό,τι υπάρχει ήδη.
      let did = false;
      const fill = (k: keyof BillingData, v?: string | null) => {
        if (!String(base[k] || '').trim() && v && String(v).trim()) { base[k] = String(v).trim(); did = true; }
      };
      try {
        const prop = (await properties.list<{ id: string; address: string | null; postal_code: string | null }>(
          supabase, userId, { columns: 'id, address, postal_code', orderBy: 'created_at' }))[0] || null;
        let ps: { owner_name?: string; owner_afm?: string; owner_phone?: string } | null = null;
        if (prop?.id) {
          const { data: s } = await supabase
            .from('property_settings').select('owner_name, owner_afm, owner_phone')
            .eq('property_id', prop.id).maybeSingle();
          ps = s;
        }
        fill('full_name', meta.full_name || ps?.owner_name);
        fill('afm', ps?.owner_afm);
        fill('phone', ps?.owner_phone);
        fill('address', prop?.address);
        fill('postal_code', prop?.postal_code);
      } catch { /* σιωπηλά: η προσυμπλήρωση είναι bonus, δεν μπλοκάρει */ }
      fill('full_name', meta.full_name);

      setD(base);
      setPrefilled(did);
      setLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, reloads]);

  const save = async () => {
    setSaving(true); setSaved(false); setSaveErr(false);
    // Το πλάνο και ο κύκλος χρέωσης ορίζονται ΜΟΝΟ από τη χρέωση, όχι από τον
    // πελάτη· το στρώμα τα αφαιρεί από κάθε εγγραφή, για όλες τις οθόνες.
    const { error } = await billing.save(supabase, userId, d as billing.BillingPatch);
    setSaving(false);
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 2500); }
    else setSaveErr(true);
  };

  if (loading) return <Spinner label="Φόρτωση…" />;
  const isInvoice = d.doc_type === 'invoice';
  const country = (d.country || 'GR').toUpperCase();
  const isGr = country === 'GR';
  const reverseCharge = isReverseCharge(d);
  const missing = missingInvoiceFields(d as InvoiceProfile);
  const vatLabel = isEuCountry(country) ? 'VAT (VIES)' : 'Φορολογικό μητρώο';
  const vatSummary = vatTreatmentLabel(determineVat(d));

  return (
    <div>
      <Card>
        <SecHdr label="Στοιχεία τιμολόγησης" />
        {prefilled && (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.5, marginTop: -6, marginBottom: 14 }}>
            Προσυμπληρώσαμε ό,τι ήδη ξέραμε από το ακίνητό σου. Έλεγξέ τα και αποθήκευσε.
          </div>
        )}
        {/* ΤΡΕΙΣ ΣΤΗΛΕΣ, ΓΡΑΜΜΕΝΕΣ ΩΣ ΑΠΟΦΑΣΗ. Το `formGrid` κόβει κάθε στήλη σε
            σταθερό μέγιστο, οπότε στην κάρτα των ρυθμίσεων έβγαζε δύο πεδία
            ανά σειρά και μισή κάρτα άδεια δεξιά: έντεκα πεδία σε έξι σειρές,
            με τη φόρμα να εκτείνεται πιο κάτω από την οθόνη. Με τρεις στήλες
            γίνονται τέσσερις σειρές και η φόρμα διαβάζεται με μια ματιά.
            Η στοίχιση είναι στην ΚΟΡΥΦΗ: μια ετικέτα δύο γραμμών δεν σπρώχνει
            το διπλανό πεδίο πιο κάτω από τα υπόλοιπα της σειράς. */}
        <div {...fixedCols(3, 14, 'start')}>
          <CustomSelect label="Τύπος παραστατικού" value={d.doc_type} onChange={v => set('doc_type', v)}
            options={[{ value: 'receipt', label: 'Απόδειξη (ιδιώτης)' }, { value: 'invoice', label: 'Τιμολόγιο (επιχείρηση)' }]} />
          <CustomSelect label="Χώρα" value={country} onChange={v => set('country', v)}
            options={ALL_COUNTRIES.map(c => ({ value: c.code, label: c.name }))} />
          <TextInput label="Ονοματεπώνυμο" value={d.full_name} onChange={v => set('full_name', v)} placeholder="Γιώργος Παπαδόπουλος" />
          {isInvoice && <TextInput label="Επωνυμία εταιρείας" value={d.company_name} onChange={v => set('company_name', v)} placeholder="Παράδειγμα Ε.Ε." />}
          {isInvoice && <TextInput label="Δραστηριότητα" value={d.profession} onChange={v => set('profession', v)} placeholder="Διαχείριση ακινήτων" />}
          {/* Φορολογικό αναγνωριστικό: ΑΦΜ/ΔΟΥ για Ελλάδα, κοινοτικό VAT (VIES) για ΕΕ, μητρώο για εκτός ΕΕ */}
          {isInvoice && isGr && <TextInput label="ΑΦΜ" value={d.afm} onChange={v => set('afm', v)} placeholder="123456789" />}
          {isInvoice && isGr && <TextInput label="ΔΟΥ" value={d.doy} onChange={v => set('doy', v)} placeholder="ΔΟΥ Α΄ Αθηνών" />}
          {isInvoice && !isGr && <TextInput label={vatLabel} value={d.vat_number} onChange={v => set('vat_number', v)} placeholder={isEuCountry(country) ? `${country}XXXXXXXXX` : 'Αριθμός μητρώου'} />}
          <TextInput label="Διεύθυνση" value={d.address} onChange={v => set('address', v)} placeholder="Οδός και αριθμός" />
          <TextInput label="Πόλη" value={d.city} onChange={v => set('city', v)} placeholder="Αθήνα" />
          <TextInput label="Ταχ. Κώδικας" value={d.postal_code} onChange={v => set('postal_code', v)} placeholder="11527" />
          <TextInput label="Τηλέφωνο" value={d.phone} onChange={v => set('phone', v)} placeholder="69XXXXXXXX" />
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 12, fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.55 }}>
          <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>Καθεστώς ΦΠΑ</span>
          <span>{vatSummary}{reverseCharge ? '. Χρειάζεται έγκυρος κοινοτικός VAT (VIES).' : ''}</span>
        </div>
        {isInvoice && missing.length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.55, marginTop: 10 }}>
            Για σωστό τιμολόγιο, συμπλήρωσε ακόμη: {missing.map(f => f.label).join(', ')}.
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
          <Btn variant="primary" onClick={save} disabled={saving}>{saving ? 'Αποθήκευση…' : 'Αποθήκευση στοιχείων'}</Btn>
          {saved && <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, fontWeight: 600 }}>Αποθηκεύτηκε</span>}
          {saveErr && <span style={{ fontSize: 12, color: 'var(--negative)', fontFamily: T.font.sans }}>Δεν αποθηκεύτηκε. Δοκίμασε ξανά.</span>}
        </div>
      </Card>

      <Subscription d={d} wantPlan={wantPlan} wishPlan={wishPlan} wishCycle={wishCycle} onChanged={reload} />
    </div>
  );
}

// ─── Η ΣΥΝΔΡΟΜΗ ─────────────────────────────────────────────────────────────
//
// ΜΙΑ ΚΑΡΤΑ, ΜΙΑ ΠΡΑΞΗ ΤΗ ΦΟΡΑ. Οποιος δεν έχει συνδρομή βλέπει το ταμείο·
// όποιος έχει, βλέπει τη διαχείρισή της. ΠΟΤΕ ΚΑΙ ΤΑ ΔΥΟ: ένα ταμείο πάνω σε
// ενεργή συνδρομή δεν την αλλάζει, φτιάχνει ΔΕΥΤΕΡΗ και ο πελάτης πληρώνει
// δύο φορές το ίδιο πράγμα.
//
// Το ταμείο εμφανίζεται μόνο όταν ο πάροχος είναι ρυθμισμένος — αυτό το ξέρει
// ο διακομιστής, όχι η οθόνη, γιατί το κλειδί ζει σε μεταβλητή περιβάλλοντος.
function Subscription({ d, wantPlan = null, wishPlan = null, wishCycle = 'monthly', onChanged }: {
  d: BillingData;
  wantPlan?: PlanId | null;
  /** Ο,τι διάλεξε στην εγγραφή, όσο δεν έχει συνδρομή. */
  wishPlan?: PlanId | null;
  wishCycle?: BillingCycle;
  onChanged: () => void;
}) {
  /**
   * Υπάρχει πύλη διαχείρισης;
   *
   * ΚΡΙΝΕΤΑΙ ΑΠΟ ΔΕΔΟΜΕΝΟ ΠΟΥ ΕΧΟΥΜΕ ΗΔΗ, ΟΧΙ ΑΠΟ ΕΡΩΤΗΣΗ. Μια προκαταρκτική
   * κλήση θα ρωτούσε τον έμπορο σε ΚΑΘΕ φόρτωση της οθόνης, ακόμη και για
   * όποιον δεν πατήσει ποτέ το κουμπί. Η συνδρομή γράφεται από τον webhook· αν
   * υπάρχει, υπάρχει και πύλη.
   */
  const hasCustomer = !!(d.mor_subscription_id || '').trim();
  // Ο κύκλος του επιλογέα: πρώτα εκείνος που ΠΛΗΡΩΝΕΤΑΙ ήδη, και μόνο όταν δεν
  // υπάρχει συνδρομή, εκείνος που διάλεξε στην εγγραφή. Χωρίς τη δεύτερη
  // γραμμή, όποιος πάτησε «ετήσια» στον τιμοκατάλογο έβρισκε εδώ «μηνιαία»,
  // γιατί αυτή είναι η προεπιλογή της στήλης πριν γραφτεί καμία συνδρομή.
  const [cycle, setCycle] = useState<BillingCycle>(
    hasCustomer ? (d.billing_cycle === 'annual' ? 'annual' : 'monthly') : wishCycle);
  const [busy, setBusy] = useState(false);

  const type: ProfileType = d.profile_type === 'professional' ? 'professional' : 'individual';
  const current = normalizePlan(d.plan);
  // ── ΠΟΙΟ ΠΑΚΕΤΟ ΔΕΙΧΝΕΙ Η ΚΑΡΤΑ ───────────────────────────────────────
  // Πρώτα ό,τι διάλεξε ο ΙΔΙΟΣ στη σύγκριση από πάνω. Μετά ό,τι ήδη πληρώνει,
  // δηλαδή η ανανέωσή του. Και μόνο αν δεν υπάρχει τίποτα από τα δύο, το
  // ΦΘΗΝΟΤΕΡΟ πακέτο που επιτρέπει το προφίλ του.
  //
  // ΟΧΙ ΤΟ ΑΚΡΙΒΟΤΕΡΟ. Η πρώτη γραφή έδειχνε το ανώτατο επιτρεπτό: ένας ιδιώτης
  // χωρίς συνδρομή έβλεπε «Ιδιοκτήτης+ · 9,90 €» ενώ η είσοδος είναι
  // «Ιδιοκτήτης · 3,90 €». Μια προεπιλογή που τυχαίνει να είναι η κερδοφόρα δεν
  // είναι προεπιλογή, είναι πώληση με το ζόρι.
  const entry = ALLOWED_PLANS[type].find(p => PLANS[p].priceMonthly > 0) ?? ALLOWED_PLANS[type][0];
  // Η επιθυμία της εγγραφής μπαίνει ΜΟΝΟ αν το προφίλ την αγοράζει. Ενας
  // ιδιώτης που πάτησε από περιέργεια την κάρτα «Επαγγελματίας» θα έβλεπε
  // αλλιώς ένα πακέτο που το ταμείο του απαντά 403.
  const wished = wishPlan && ALLOWED_PLANS[type].includes(wishPlan) ? wishPlan : null;
  // Η ΕΠΙΛΟΓΗ ΤΟΥ ΧΡΗΣΤΗ ΜΕΣΑ ΣΤΗΝ ΙΔΙΑ ΚΑΡΤΑ. Ο συνδρομητής έβλεπε τον
  // διακόπτη κύκλου να αλλάζει την τιμή και κανένα κουμπί να την εφαρμόζει:
  // ένα χειριστήριο που δεν κάνει τίποτα. Και το πακέτο δεν άλλαζε καθόλου
  // από εδώ — έπρεπε να κατέβει στη σύγκριση, να διαλέξει, και να ανέβει πάλι.
  const [pick, setPick] = useState<PlanId | null>(null);
  const target: PlanId = pick ?? wantPlan ?? (current !== 'free' ? current : (wished ?? entry));
  const plan = PLANS[target];
  const price = cycle === 'annual' ? annualPerMonth(target) : plan.priceMonthly;

  const status = (d.subscription_status || '').trim();
  const phase = subPhase(status);
  const endsAt = (d.mor_ends_at || '').trim();
  const renewsAt = (d.mor_renews_at || '').trim();
  /** Τρέχει συνδρομή αυτή τη στιγμή; Τότε το ταμείο θα έφτιαχνε δεύτερη. */
  const running = phase === 'trial' || phase === 'active' || phase === 'retrying';

  // ── ΤΟ ΚΟΥΜΠΙ ΡΩΤΑΕΙ ΠΡΙΝ ΕΜΦΑΝΙΣΤΕΙ ────────────────────────────────────
  // Οι σύνδεσμοι αγοράς ζουν σε μεταβλητή περιβάλλοντος, δηλαδή ο περιηγητής
  // ΔΕΝ μπορεί να ξέρει αν υπάρχει ταμείο. Χωρίς αυτή την ερώτηση, το κουμπί
  // εμφανιζόταν πάντα και απαντούσε «δοκίμασε ξανά σε λίγο» — μήνυμα που
  // υπόσχεται ότι το πρόβλημα είναι προσωρινό ενώ δεν είναι.
  //
  // `null` = δεν ξέρουμε ακόμη. Ούτε κουμπί ούτε άρνηση: τα δύο ψέματα είναι
  // συμμετρικά, και η απάντηση έρχεται σε ένα αίτημα.
  //
  // ΚΑΙ Η ΦΡΑΣΗ ΕΡΧΕΤΑΙ ΜΑΖΙ. Η οθόνη δεν κρίνει μόνη της τι ισχύει: παίρνει
  // την ίδια διατύπωση που διαβάζουν οι Οροι και η Πολιτική απορρήτου.
  const [live, setLive] = useState<boolean | null>(null);
  const [note, setNote] = useState('');
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/billing/checkout?plan=${target}&cycle=${cycle}&probe=1`);
        const body = await res.json() as { available?: boolean; note?: string };
        if (alive) { setLive(!!body.available); setNote(body.note || ''); }
      } catch { if (alive) setLive(false); }
    })();
    return () => { alive = false; };
  }, [target, cycle]);

  // ΤΟ ΣΦΑΛΜΑ ΛΕΓΕΤΑΙ. Ενα κουμπί που δεν κάνει τίποτα όταν πατηθεί είναι
  // χειρότερο από κουμπί που λείπει: ο χρήστης το ξαναπατά και θεωρεί ότι
  // χρεώθηκε δύο φορές. Και οι δύο πόρτες του παρόχου ανοίγουν με τον ίδιο
  // τρόπο — σύνδεσμος μιας χρήσης από τον διακομιστή — οπότε και η μία μόνο
  // διαδικασία, με το όνομα της πόρτας μέσα στο μήνυμα.
  const open = async (url: string, what: string) => {
    setBusy(true);
    try {
      const res = await fetch(url);
      const body = await res.json() as { url?: string | null };
      if (!body.url) { notifyError(`${what} δεν άνοιξε. Δοκίμασε ξανά σε λίγο.`); setBusy(false); return; }
      window.location.href = body.url;
    } catch {
      notifyError(`${what} δεν άνοιξε. Ελεγξε τη σύνδεσή σου και δοκίμασε ξανά.`);
      setBusy(false);
    }
  };
  const go = () => open(`/api/billing/checkout?plan=${target}&cycle=${cycle}`, 'Το ταμείο');
  const manage = () => open('/api/billing/portal', 'Η διαχείριση συνδρομής');

  // ── Ο ΔΟΚΙΜΑΣΤΗΣ ΔΕΝ ΕΧΕΙ ΣΥΝΔΡΟΜΗ ────────────────────────────────────
  // Δεν πληρώνει, δεν έχει πελάτη στον έμπορο, δεν υπάρχει πύλη διαχείρισης.
  // Ολα τα κουμπιά της κάρτας αφορούν κάτι που δεν τον αφορά — και ένα κουμπί
  // «Πληρωμή με κάρτα» σε άνθρωπο που του υποσχεθήκαμε δωρεάν χρήση είναι το
  // χειρότερο μήνυμα που μπορεί να δει.
  const isTester = !!(d.tester_since || '').trim();

  // ── Η ΥΠΟΒΑΘΜΙΣΗ ΠΟΥ ΠΕΡΙΜΕΝΕΙ ────────────────────────────────────────
  // Ο,τι κρατιέται ώς την ανανέωση. Το `plan` δείχνει ήδη το ΝΕΟ πακέτο (ο
  // webhook το έγραψε τη στιγμή της αλλαγής): χωρίς αυτή τη γραμμή, ο πελάτης
  // θα διάβαζε ότι έχει ήδη κατέβει ενώ κρατά ακόμη ό,τι πλήρωσε.
  const heldPlan = normalizePlan(d.hold_plan);
  const heldUntil = (d.hold_until || '').trim();
  const holding = heldPlan !== 'free' && !!heldUntil && current !== 'free';

  /** Ο κύκλος που πληρώνεται τώρα, για να ξέρουμε αν η επιλογή τον αλλάζει. */
  const paidCycle: BillingCycle = d.billing_cycle === 'annual' ? 'annual' : 'monthly';
  /** Διαφέρει η επιλογή από ό,τι τρέχει; Μόνο τότε υπάρχει κάτι να πατηθεί. */
  const moves = running && (target !== current || cycle !== paidCycle);
  const goingDown = moves && PLAN_ORDER.indexOf(target) < PLAN_ORDER.indexOf(current);

  // ── Ο ΚΩΔΙΚΟΣ ΠΡΟΣΚΛΗΣΗΣ ─────────────────────────────────────────────
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState('');
  const linkish: React.CSSProperties = {
    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
    fontSize: 13, fontFamily: T.font.sans, color: 'var(--text-secondary)',
    textDecoration: 'underline', textUnderlineOffset: 3,
  };

  /**
   * Η εξαργύρωση.
   *
   * ΤΟ ΙΔΙΟ ΜΗΝΥΜΑ ΓΙΑ ΚΑΘΕ ΑΠΟΤΥΧΙΑ, όπως και στον διακομιστή: η διαφορά
   * ανάμεσα σε «λάθος κωδικός» και «δεν υπάρχει πρόγραμμα» θα άξιζε τον κόπο
   * να δοκιμάσει κανείς δεύτερο.
   */
  const redeem = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/billing/tester', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) { notifyError('Ο κωδικός δεν αναγνωρίζεται.'); setBusy(false); return; }
      notifyOk('Ο κωδικός εξαργυρώθηκε');
      setCode(''); setCodeOpen(false);
      onChanged();
    } catch {
      notifyError('Η εξαργύρωση δεν ολοκληρώθηκε. Ελεγξε τη σύνδεσή σου.');
    }
    setBusy(false);
  };

  /**
   * Η αλλαγή πακέτου. Ενα κουμπί, τρεις καταλήξεις, και ο διακομιστής ξέρει
   * ποια ισχύει: ο δοκιμαστής γράφεται επιτόπου, ο συνδρομητής που ανεβαίνει
   * χρεώνεται τη διαφορά, ο συνδρομητής που κατεβαίνει κρατά ώς την ανανέωση.
   *
   * ΤΟ ΜΗΝΥΜΑ ΛΕΕΙ ΤΙ ΕΓΙΝΕ ΠΡΑΓΜΑΤΙΚΑ, όχι τι ζητήθηκε: ένα «το πακέτο έγινε
   * Ιδιοκτήτης» μετά από υποβάθμιση θα ήταν ψέμα ώς την ανανέωση.
   */
  const switchPlan = async (id: PlanId) => {
    setBusy(true);
    try {
      const res = await fetch('/api/billing/plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: id, cycle }),
      });
      const body = await res.json().catch(() => ({})) as {
        kind?: string; holdPlan?: string | null; holdUntil?: string | null; error?: string;
      };
      if (!res.ok) {
        notifyError(typeof body.error === 'string' && body.error ? body.error : 'Το πακέτο δεν άλλαξε. Δοκίμασε ξανά.');
        setBusy(false); return;
      }
      if (body.kind === 'downgrade' && body.holdPlan && body.holdUntil) {
        notifyOk(`Κρατάς το «${PLANS[normalizePlan(body.holdPlan)].name}» ώς τις ${fd(body.holdUntil)}`);
      } else {
        notifyOk(`Το πακέτο έγινε «${PLANS[id].name}»`);
      }
      setPick(null);
      onChanged();
    } catch {
      notifyError('Το πακέτο δεν άλλαξε. Ελεγξε τη σύνδεσή σου.');
    }
    setBusy(false);
  };

  if (isTester) return (
    <Card>
      <SecHdr label="Συνδρομή" />
      <InfoBanner tone="info">
        Λογαριασμός δοκιμαστή. Όλα τα πακέτα είναι ανοιχτά, χωρίς καμία χρέωση και χωρίς συνδρομή στον έμπορο, και αλλάζεις όποτε θέλεις.
      </InfoBanner>
      {/* ΟΛΑ ΤΑ ΠΑΚΕΤΑ, ΧΩΡΙΣ ΦΡΑΓΜΟ ΤΥΠΟΥ ΠΡΟΦΙΛ. Ο δοκιμαστής δεν αγοράζει:
          δοκιμάζει. Το να του κλείσουμε τα μισά θα ακύρωνε τον λόγο που του
          δώσαμε τον κωδικό. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
        {PLAN_ORDER.filter(id => PLANS[id].priceMonthly > 0).map(id => (
          <Btn key={id} variant={current === id ? 'primary' : 'secondary'}
            onClick={() => switchPlan(id)} disabled={busy || current === id}>
            {PLANS[id].name}
          </Btn>
        ))}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.55, marginTop: 14 }}>
        Η ιδιότητα δόθηκε στις {fd(d.tester_since)}. Όταν τελειώσει η δοκιμαστική φάση θα σου το πούμε πριν αλλάξει οτιδήποτε.
      </div>
    </Card>
  );

  return (
    <Card>
      <SecHdr label="Συνδρομή" />
      {/* Η ΑΚΥΡΩΣΗ ΕΙΝΑΙ ΔΕΔΟΜΕΝΟ, ΟΧΙ ΚΑΤΑΣΤΑΣΗ. Οσο τρέχει η πληρωμένη περίοδος
          η συνδρομή μένει ενεργή στον πάροχο· εκείνο που αλλάζει είναι ότι
          υπάρχει ημερομηνία λήξης αντί για ημερομηνία ανανέωσης. */}
      {endsAt ? (
        <InfoBanner tone="warning">Η συνδρομή έχει ακυρωθεί και ισχύει ώς τις <strong>{fd(endsAt)}</strong>. Μετά την ημερομηνία αυτή ο λογαριασμός επιστρέφει σε χωρίς συνδρομή.</InfoBanner>
      ) : phase === 'trial' || phase === 'active' ? (
        <InfoBanner tone="info">
          {phase === 'trial' ? 'Δοκιμαστική περίοδος σε εξέλιξη' : `Ενεργή συνδρομή, ${plan.name}`}
          {renewsAt ? `. Ανανέωση στις ${fd(renewsAt)}.` : '.'}
        </InfoBanner>
      ) : phase === 'retrying' ? (
        <InfoBanner tone="warning">Η τελευταία χρέωση δεν ολοκληρώθηκε. Ο λογαριασμός παραμένει ανοιχτός όσο ο έμπορος ξαναδοκιμάζει την κάρτα. Ανανέωσε την κάρτα σου από τη διαχείριση συνδρομής.</InfoBanner>
      ) : null}

      {/* ── Η ΥΠΟΒΑΘΜΙΣΗ ΠΟΥ ΠΕΡΙΜΕΝΕΙ, ΓΡΑΜΜΕΝΗ ────────────────────────────
          Ο έμπορος έχει ήδη αλλάξει την παραλλαγή, οπότε το `plan` δείχνει το
          ΝΕΟ πακέτο. Χωρίς αυτή τη γραμμή ο πελάτης θα διάβαζε ότι έχει ήδη
          κατέβει, ενώ κρατά ώς την ανανέωση ό,τι πλήρωσε — και θα ρωτούσε
          γιατί «δεν εφαρμόστηκε» κάτι που εφαρμόστηκε σωστά. */}
      {holding && (
        <InfoBanner tone="info">
          Ζήτησες αλλαγή σε <strong>{plan.name}</strong>. Κρατάς το <strong>{PLANS[heldPlan].name}</strong> ώς τις <strong>{fd(heldUntil)}</strong>, γιατί το έχεις ήδη πληρώσει.
        </InfoBanner>
      )}

      {/* ── ΤΟ ΠΑΚΕΤΟ ΑΛΛΑΖΕΙ ΑΠΟ ΕΔΩ ─────────────────────────────────────
          Ο συνδρομητής δεν είχε κανέναν τρόπο να αλλάξει πακέτο μέσα σε αυτή
          την κάρτα: έβλεπε την τιμή του δικού του και ένα κουμπί «Διαχείριση
          συνδρομής» που ανοίγει την πύλη του εμπόρου — όπου η αλλαγή πακέτου
          δεν υπάρχει καν. Οι επιλογές είναι όσες επιτρέπει ο τύπος προφίλ,
          όπως και στο ταμείο: ένα κουμπί που απαντά 403 δεν είναι επιλογή. */}
      {running && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4, marginBottom: 14 }}>
          {ALLOWED_PLANS[type].filter(id => PLANS[id].priceMonthly > 0).map(id => (
            <Btn key={id} variant={target === id ? 'primary' : 'secondary'}
              onClick={() => setPick(id)} disabled={busy}>
              {PLANS[id].name}
            </Btn>
          ))}
        </div>
      )}

      {/* Ο ΔΙΑΚΟΠΤΗΣ ΠΑΝΩ ΑΠΟ ΤΗΝ ΤΙΜΗ: πρώτα η αιτία, μετά το αποτέλεσμα. Δίπλα
          στον μεγάλο αριθμό διαβαζόταν ως διακόσμηση, και δεν φαινόταν ότι είναι
          αυτός που τον αλλάζει. */}
      {/* Το πλάτος δένεται: ο διακόπτης απλώνεται στο 100% του γονέα και δύο
          επιλογές έπιαναν ολόκληρη την κάρτα, βαραίνοντας περισσότερο από την
          τιμή που ρυθμίζουν. */}
      <div style={{ marginTop: 2, maxWidth: 260 }}>
        <SegmentControl value={cycle} onChange={v => setCycle(v as BillingCycle)} ariaLabel="Κύκλος χρέωσης"
          options={[{ value: 'monthly', label: 'Μηνιαία' }, { value: 'annual', label: 'Ετήσια' }]} />
      </div>

      {/* Η ΤΙΜΗ ΛΕΕΙ ΤΗ ΜΟΝΑΔΑ ΤΗΣ. Το ετήσιο δείχνεται ανά μήνα, όπως και στη
          σύγκριση πακέτων, ώστε τα δύο νούμερα να συγκρίνονται μεταξύ τους. */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>{plan.name}</div>
        <div style={{ fontFamily: T.font.num, fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', lineHeight: 1.1, marginTop: 4 }}>{fe(price)}</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, marginTop: 2 }}>
          τον μήνα{cycle === 'annual' ? `, με ετήσια χρέωση ${fe(plan.priceAnnual)}` : ''}
        </div>
      </div>

      {/* ΤΟ ΤΑΜΕΙΟ ΜΟΝΟ ΟΤΑΝ ΔΕΝ ΤΡΕΧΕΙ ΣΥΝΔΡΟΜΗ. Η αλλαγή πακέτου σε ενεργή
          συνδρομή γίνεται από την πύλη, που την τροποποιεί· το ταμείο θα
          έφτιαχνε δεύτερη συνδρομή δίπλα στην πρώτη. */}
      {(live === true && !running) || hasCustomer ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 18 }}>
          {live === true && !running && (
            <Btn variant="primary" onClick={go} disabled={busy}>{busy ? 'Ανοίγει…' : 'Πληρωμή με κάρτα'}</Btn>
          )}
          {/* ΕΜΦΑΝΙΖΕΤΑΙ ΜΟΝΟ ΟΤΑΝ Η ΕΠΙΛΟΓΗ ΔΙΑΦΕΡΕΙ. Ενα μόνιμο «Αλλαγή
              πακέτου» που δεν αλλάζει τίποτα όταν πατηθεί είναι χειρότερο από
              κουμπί που λείπει. */}
          {moves && live === true && (
            <Btn variant="primary" onClick={() => switchPlan(target)} disabled={busy}>
              {busy ? 'Αλλαγή…'
                : target === current
                  ? `Αλλαγή σε ${cycle === 'annual' ? 'ετήσια' : 'μηνιαία'} χρέωση`
                  : `Αλλαγή σε ${plan.name}`}
            </Btn>
          )}
          {/* ΟΙ ΤΡΕΙΣ ΥΠΟΣΧΕΣΕΙΣ ΤΩΝ ΟΡΩΝ ΕΧΟΥΝ ΚΟΥΜΠΙ: ακύρωση, παραστατικά,
              αλλαγή κάρτας. Χωρίς αυτό, οι Οροι δέσμευαν σε κάτι που δεν
              υπήρχε πουθενά στην εφαρμογή. */}
          {hasCustomer && (
            <Btn variant={running ? 'primary' : 'secondary'} onClick={manage} disabled={busy}>
              {busy ? 'Ανοίγει…' : 'Διαχείριση συνδρομής'}
            </Btn>
          )}
        </div>
      ) : null}
      {/* ΤΙ ΘΑ ΓΙΝΕΙ ΜΕ ΤΑ ΧΡΗΜΑΤΑ, ΠΡΙΝ ΠΑΤΗΘΕΙ ΤΟ ΚΟΥΜΠΙ ──────────────────
          Οι τρεις καταλήξεις είναι εντελώς διαφορετικές και καμία δεν είναι
          προφανής: αναβάθμιση χρεώνει σήμερα, υποβάθμιση δεν επιστρέφει, και
          μέσα στη δοκιμή δεν κινείται τίποτα. Οποιος πατά χωρίς να το ξέρει,
          το μαθαίνει από την κίνηση της κάρτας του. */}
      {moves && live === true && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.55, marginTop: 12 }}>
          {phase === 'trial'
            ? `Δεν χρεώνεσαι σήμερα. Η πρώτη χρέωση γίνεται ${renewsAt ? `στις ${fd(renewsAt)}` : 'στη λήξη της δοκιμής'}, στη νέα τιμή.`
            : goingDown
              ? `Δεν επιστρέφονται χρήματα. Κρατάς το «${PLANS[current].name}» ${renewsAt ? `ώς τις ${fd(renewsAt)}` : 'ώς την ανανέωση'}, και από εκεί χρεώνεσαι στη νέα τιμή.`
              : 'Χρεώνεται σήμερα μόνο η διαφορά, για τις ημέρες που απομένουν ώς την ανανέωση.'}
        </div>
      )}

      {/* ΟΤΑΝ ΔΕΝ ΥΠΑΡΧΕΙ ΤΑΜΕΙΟ, ΤΟ ΛΕΜΕ. Απενεργοποιημένο κουμπί θα ήταν
          υπόσχεση που δεν τηρείται με το πάτημα· η πρόταση λέει το ίδιο πράγμα
          με τους Ορους και την Πολιτική απορρήτου, από την ίδια πηγή. */}
      {live === false && (
        <div style={{ marginTop: 18 }}>
          <InfoBanner tone="info">{note} Συμπλήρωσε από τώρα τα στοιχεία τιμολόγησης, ώστε η ενεργοποίηση να μη σου ζητήσει τίποτα άλλο.</InfoBanner>
        </div>
      )}

      {/* ΠΟΙΟΣ ΧΡΕΩΝΕΙ, ΓΡΑΜΜΕΝΟ ΠΡΙΝ ΤΗ ΧΡΕΩΣΗ. Στην κίνηση της κάρτας φαίνεται
          το όνομα του παρόχου· ένας πελάτης που δεν το περίμενε το καταγγέλλει
          ως απάτη. Η ΔΙΑΤΥΠΩΣΗ ΕΡΧΕΤΑΙ ΑΠΟ ΤΟΝ ΔΙΑΚΟΜΙΣΤΗ, ίδια με των Ορων:
          η προηγούμενη, γραμμένη εδώ με το χέρι, έλεγε ότι ο πάροχος αποδίδει
          τον ΦΠΑ — και δεν τον αποδίδει αυτός. */}
      {live === true && note && (
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.55, marginTop: 14 }}>
          {note} Σταματάς όποτε θες και η συνδρομή τρέχει ώς το τέλος της περιόδου που έχεις πληρώσει.
        </div>
      )}

      {/* ── Ο ΚΩΔΙΚΟΣ ΠΡΟΣΚΛΗΣΗΣ ─────────────────────────────────────────
          ΚΛΕΙΣΤΟΣ ΩΣΠΟΥ ΝΑ ΖΗΤΗΘΕΙ. Ενα ορθάνοιχτο πεδίο «κωδικός» δίπλα στην
          τιμή λέει σε κάθε επισκέπτη ότι κάπου υπάρχει έκπτωση που δεν του
          δόθηκε, και τον στέλνει να τη ψάξει αντί να πληρώσει. Οποιος έχει
          κωδικό ξέρει ότι τον έχει. */}
      <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
        {!codeOpen ? (
          <button type="button" onClick={() => setCodeOpen(true)} style={linkish}>Έχω κωδικό πρόσκλησης</button>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            {/* ΤΟ `placeholder` ΔΕΝ ΟΝΟΜΑΖΕΙ: σβήνεται με τον πρώτο χαρακτήρα και
                το πεδίο ξαναμένει ανώνυμο για τον αναγνώστη οθόνης. */}
            <input value={code} onChange={e => setCode(e.target.value)} placeholder="Κωδικός"
              aria-label="Κωδικός πρόσκλησης"
              autoComplete="off" spellCheck={false} onKeyDown={e => { if (e.key === 'Enter') redeem(); }}
              style={{ height: T.h.md, padding: '0 12px', borderRadius: T.radius.inner, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 14, fontFamily: T.font.sans, outline: 'none', minWidth: 180 }} />
            <Btn variant="secondary" onClick={redeem} disabled={busy || !code.trim()}>Εξαργύρωση</Btn>
          </div>
        )}
      </div>
    </Card>
  );
}
