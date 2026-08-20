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
import { PLANS, normalizePlan, annualPerMonth, type PlanId } from '@/lib/billing/plans';
// Η ΦΑΣΗ ΤΗΣ ΣΥΝΔΡΟΜΗΣ ΔΕΝ ΚΡΙΝΕΤΑΙ ΕΔΩ. Οι καταστάσεις τις ονομάζει ο
// έμπορος και τις γράφει ο webhook· η οθόνη τις διαβάζει από την ίδια πηγή.
import { subPhase } from '@/lib/billing/lemon';
import { ALLOWED_PLANS, type ProfileType } from '@/lib/billing/entitlements';
import { SegmentControl } from './UIComponents';
import { notifyError } from '@/components/Toast';
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
}
const INIT: BillingData = {
  doc_type: 'receipt', full_name: '', company_name: '', afm: '', doy: '', profession: '',
  address: '', city: '', postal_code: '', country: 'GR', vat_number: '', phone: '', plan: 'free', billing_cycle: 'monthly',
  profile_type: 'individual', subscription_status: '', mor_renews_at: '', mor_ends_at: '',
  mor_subscription_id: '',
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

  useEffect(() => {
    (async () => {
      const [data, { data: u }] = await Promise.all([
        billing.profile<Partial<BillingData>>(supabase, userId, '*'),
        supabase.auth.getUser(),
      ]);
      const meta = (u.user?.user_metadata as Record<string, string> | undefined) || {};
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
  }, [userId]);

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

      <Subscription d={d} wantPlan={wantPlan} />
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
function Subscription({ d, wantPlan = null }: { d: BillingData; wantPlan?: PlanId | null }) {
  const [cycle, setCycle] = useState<'monthly' | 'annual'>(d.billing_cycle === 'annual' ? 'annual' : 'monthly');
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
  const target: PlanId = wantPlan ?? (current !== 'free' ? current : entry);
  const plan = PLANS[target];
  const price = cycle === 'annual' ? annualPerMonth(target) : plan.priceMonthly;

  const status = (d.subscription_status || '').trim();
  const phase = subPhase(status);
  const endsAt = (d.mor_ends_at || '').trim();
  const renewsAt = (d.mor_renews_at || '').trim();
  /** Τρέχει συνδρομή αυτή τη στιγμή; Τότε το ταμείο θα έφτιαχνε δεύτερη. */
  const running = phase === 'trial' || phase === 'active' || phase === 'retrying';
  /**
   * Υπάρχει πύλη διαχείρισης;
   *
   * ΚΡΙΝΕΤΑΙ ΑΠΟ ΔΕΔΟΜΕΝΟ ΠΟΥ ΕΧΟΥΜΕ ΗΔΗ, ΟΧΙ ΑΠΟ ΕΡΩΤΗΣΗ. Μια προκαταρκτική
   * κλήση θα ρωτούσε τον έμπορο σε ΚΑΘΕ φόρτωση της οθόνης, ακόμη και για
   * όποιον δεν πατήσει ποτέ το κουμπί. Η συνδρομή γράφεται από τον webhook· αν
   * υπάρχει, υπάρχει και πύλη.
   */
  const hasCustomer = !!(d.mor_subscription_id || '').trim();

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
        const res = await fetch(`/api/billing/checkout?plan=${target}&cycle=${cycle}`);
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

      {/* Ο ΔΙΑΚΟΠΤΗΣ ΠΑΝΩ ΑΠΟ ΤΗΝ ΤΙΜΗ: πρώτα η αιτία, μετά το αποτέλεσμα. Δίπλα
          στον μεγάλο αριθμό διαβαζόταν ως διακόσμηση, και δεν φαινόταν ότι είναι
          αυτός που τον αλλάζει. */}
      {/* Το πλάτος δένεται: ο διακόπτης απλώνεται στο 100% του γονέα και δύο
          επιλογές έπιαναν ολόκληρη την κάρτα, βαραίνοντας περισσότερο από την
          τιμή που ρυθμίζουν. */}
      <div style={{ marginTop: 2, maxWidth: 260 }}>
        <SegmentControl value={cycle} onChange={v => setCycle(v as 'monthly' | 'annual')}
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
    </Card>
  );
}
