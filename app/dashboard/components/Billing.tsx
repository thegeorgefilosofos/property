'use client';

// ═══════════════════════════════════════════════════════════════════════════
// ΣΥΝΔΡΟΜΗ ΚΑΙ ΣΤΟΙΧΕΙΑ ΤΙΜΟΛΟΓΗΣΗΣ
// ─────────────────────────────────────────────────────────────────────────
// Ο ΕΜΠΟΡΟΣ ΔΕΝ ΕΙΝΑΙ Η STRIPE. Το σχόλιο εδώ έλεγε «όταν προστεθεί ο Stripe»
// και οι στήλες της βάσης λέγονταν `stripe_*` — για πάροχο που δεν επιλέχθηκε
// ποτέ. Ο έμπορος τύπου record είναι η Lemon Squeezy: εκείνη εκδίδει το
// παραστατικό και αποδίδει τον ΦΠΑ κάθε χώρας, δηλαδή επιτρέπει πωλήσεις πριν
// υπάρξει εταιρεία.
//
// ΤΙ ΚΑΝΕΙ Η ΟΘΟΝΗ ΚΑΙ ΤΙ ΔΕΝ ΚΑΝΕΙ. Κρατά τα στοιχεία τιμολόγησης, δείχνει
// την κατάσταση της συνδρομής όπως την ξέρει ο έμπορος, και ανοίγει το ταμείο
// του. ΔΕΝ αγγίζει ποτέ το πακέτο: το `plan` γράφεται μόνο από τον webhook, με
// ρόλο υπηρεσίας, αφού η πληρωμή έχει γίνει.
//
// ΚΑΙ ΔΕΝ ΥΠΟΣΧΕΤΑΙ ΚΟΥΜΠΙ ΠΟΥ ΔΕΝ ΥΠΑΡΧΕΙ. Οσο δεν έχουν οριστεί σύνδεσμοι
// αγοράς, η κάρτα το λέει καθαρά αντί να δείχνει απενεργοποιημένο κουμπί.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import * as properties from '@/lib/data/properties';
// Το προφίλ χρέωσης έχει ένα σπίτι: lib/data/billing.
import * as billing from '@/lib/data/billing';
import { TextInput, CustomSelect } from './UIComponents';
import { T, Btn, InfoBanner, Spinner, Card, SecHdr, fixedCols, fe, fd } from '@/components/Theme';
import { PLANS, normalizePlan, annualPerMonth, type PlanId } from '@/lib/billing/plans';
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
  /** Ο,τι ξέρει ο έμπορος για τη συνδρομή. Διαβάζεται, δεν γράφεται από εδώ. */
  subscription_status: string; mor_renews_at: string; mor_ends_at: string;
}
const INIT: BillingData = {
  doc_type: 'receipt', full_name: '', company_name: '', afm: '', doy: '', profession: '',
  address: '', city: '', postal_code: '', country: 'GR', vat_number: '', phone: '', plan: 'free', billing_cycle: 'monthly',
  profile_type: 'individual', subscription_status: '', mor_renews_at: '', mor_ends_at: '',
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
// ΜΙΑ ΚΑΡΤΑ, ΤΡΕΙΣ ΚΑΤΑΣΤΑΣΕΙΣ, ΚΑΜΙΑ ΨΕΥΤΙΚΗ. Ενεργή συνδρομή, ακυρωμένη που
// τρέχει ώς την ημερομηνία της, ή καμία. Το κουμπί εμφανίζεται μόνο όταν
// υπάρχει πραγματικός σύνδεσμος αγοράς — αυτό το ξέρει ο διακομιστής, όχι η
// οθόνη, γιατί οι σύνδεσμοι ζουν σε μεταβλητές περιβάλλοντος.
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
  const endsAt = (d.mor_ends_at || '').trim();
  const renewsAt = (d.mor_renews_at || '').trim();

  const go = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/billing/checkout?plan=${target}&cycle=${cycle}`);
      const body = await res.json() as { url?: string | null };
      // ΤΟ ΣΦΑΛΜΑ ΛΕΓΕΤΑΙ. Ενα κουμπί που δεν κάνει τίποτα όταν πατηθεί είναι
      // χειρότερο από κουμπί που λείπει: ο χρήστης το ξαναπατά και θεωρεί ότι
      // χρεώθηκε δύο φορές.
      if (!body.url) { notifyError('Το ταμείο δεν άνοιξε. Δοκίμασε ξανά σε λίγο.'); setBusy(false); return; }
      window.location.href = body.url;
    } catch {
      notifyError('Το ταμείο δεν άνοιξε. Ελεγξε τη σύνδεσή σου και δοκίμασε ξανά.');
      setBusy(false);
    }
  };

  return (
    <Card>
      <SecHdr label="Συνδρομή" />
      {status === 'cancelled' && endsAt ? (
        <InfoBanner tone="warning">Η συνδρομή έχει ακυρωθεί και ισχύει ώς τις <strong>{fd(endsAt)}</strong>. Μετά την ημερομηνία αυτή ο λογαριασμός επιστρέφει σε χωρίς συνδρομή.</InfoBanner>
      ) : status === 'active' || status === 'on_trial' ? (
        <InfoBanner tone="info">
          {status === 'on_trial' ? 'Δοκιμαστική περίοδος σε εξέλιξη' : `Ενεργή συνδρομή, ${plan.name}`}
          {renewsAt ? `. Ανανέωση στις ${fd(renewsAt)}.` : '.'}
        </InfoBanner>
      ) : status === 'past_due' ? (
        <InfoBanner tone="warning">Η τελευταία χρέωση δεν ολοκληρώθηκε. Ο λογαριασμός παραμένει ανοιχτός όσο ο έμπορος ξαναδοκιμάζει την κάρτα.</InfoBanner>
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

      <div style={{ marginTop: 18 }}>
        <Btn variant="primary" onClick={go} disabled={busy}>{busy ? 'Ανοίγει…' : 'Πληρωμή με κάρτα'}</Btn>
      </div>

      {/* ΠΟΙΟΣ ΧΡΕΩΝΕΙ, ΓΡΑΜΜΕΝΟ ΠΡΙΝ ΤΗ ΧΡΕΩΣΗ. Στην κίνηση της κάρτας θα
          φανεί το όνομα του εμπόρου, όχι το δικό μας· ένας πελάτης που δεν το
          περίμενε το καταγγέλλει ως απάτη. */}
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.55, marginTop: 14 }}>
        Η πληρωμή και το παραστατικό γίνονται από τη Lemon Squeezy, που είναι ο έμπορος της συναλλαγής και αποδίδει τον ΦΠΑ. Η ακύρωση είναι τόσο απλή όσο και η εγγραφή: σταματάς όποτε θες και η συνδρομή τρέχει ώς το τέλος της περιόδου που έχεις πληρώσει.
      </div>
    </Card>
  );
}
