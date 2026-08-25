'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, TT, Btn, InfoBanner, Spinner, Card, SecHdr, formGrid } from '@/components/Theme';
import { TextInput, Toggle } from './UIComponents';
import { PLANS, type PlanId } from '@/lib/billing/plans';
import { planAtLeast, FEATURE_MIN_PLAN } from '@/lib/billing/entitlements';
import { sanitizeAccent, sanitizeLogo, DEFAULT_ACCENT } from '@/lib/reportBranding';
import { INK, INK_MUTED, PAPER } from '@/lib/print/ink';
import { failed } from '@/lib/core/dbError';

const MAX_LOGO_BYTES = 500_000;

export default function ReportBranding({ userId, plan, onUpgrade }: { userId: string; plan: PlanId; onUpgrade: () => void }) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [companyName, setCompanyName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [accent, setAccent] = useState(DEFAULT_ACCENT);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      // ΤΟ ΠΑΚΕΤΟ ΔΙΑΒΑΖΟΤΑΝ ΞΑΝΑ, ΚΑΙ ΑΛΛΙΩΣ. Η οθόνη ρωτούσε μόνη της το
      // `billing_profiles.plan` — το ΒΑΣΙΚΟ πακέτο, χωρίς τη δοκιμή, χωρίς τους
      // δωρεάν μήνες της πρόσκλησης, χωρίς την ιδιότητα του συνεργάτη. Δηλαδή
      // ο δοκιμαστής, ο προσκεκλημένος και ο συνεργάτης έβλεπαν κλειδωμένη μια
      // δυνατότητα που είχαν, ενώ κάθε άλλη οθόνη τους την έδινε. Το ενεργό
      // πακέτο υπολογίζεται ΜΙΑ φορά, στη σελίδα και κατεβαίνει ως ιδιότητα.
      const { data: rb } = await supabase.from('report_branding').select('*').eq('user_id', userId).maybeSingle();
      if (rb) {
        setEnabled(rb.enabled !== false);
        setCompanyName((rb.company_name as string) || '');
        setLogoUrl(sanitizeLogo(rb.logo_url as string));
        setAccent(sanitizeAccent(rb.accent_color as string));
        setPhone((rb.phone as string) || '');
        setEmail((rb.email as string) || '');
      }
      setLoading(false);
    })();
  }, [userId]);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError('');
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { setError('Μη έγκυρο αρχείο. Επιτρεπτά: PNG, JPG, WebP.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 320;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { setError('Σφάλμα επεξεργασίας εικόνας.'); return; }
        ctx.drawImage(img, 0, 0, w, h);
        const out = canvas.toDataURL('image/png');
        if (out.length > MAX_LOGO_BYTES) { setError('Το αρχείο είναι πολύ μεγάλο. Διάλεξε εικόνα έως 500 KB.'); return; }
        setLogoUrl(out);
      };
      img.onerror = () => setError('Μη έγκυρο αρχείο. Επιτρεπτά: PNG, JPG, WebP.');
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const save = async () => {
    setSaving(true); setError('');
    const { error: err } = await supabase.from('report_branding').upsert({
      user_id: userId, enabled, company_name: companyName.trim() || null,
      logo_url: logoUrl || null, accent_color: sanitizeAccent(accent),
      phone: phone.trim() || null, email: email.trim() || null, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    setSaving(false);
    if (err) { setError(failed('Η επωνυμία δεν αποθηκεύτηκε', err)); return; }
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  if (loading) return <Spinner label="Φόρτωση…" />;

  // ΤΟ «ΔΙΑΦΟΡΕΤΙΚΟ ΑΠΟ agency» ΕΚΛΕΙΝΕ ΕΞΩ ΤΟΝ ΑΚΡΙΒΟΤΕΡΟ ΣΥΝΔΡΟΜΗΤΗ.
  // Ο κάτοχος του «Επαγγελματίας+» πληρώνει 79,90 € τον μήνα για ένα πακέτο που
  // ΠΕΡΙΛΑΜΒΑΝΕΙ ό,τι έχει ο «Επαγγελματίας» — και έβλεπε κλειδωμένη οθόνη που
  // του πρότεινε να αναβαθμίσει σε ΦΘΗΝΟΤΕΡΟ πακέτο. Η ισότητα είναι λάθος
  // εργαλείο για κλίμακα: η ερώτηση είναι «φτάνει το επίπεδό του;» και την
  // απαντά το planAtLeast, όπως σε κάθε άλλο κλείδωμα της εφαρμογής.
  const minPlan = FEATURE_MIN_PLAN.report_branding;
  if (!planAtLeast(plan, minPlan)) {
    return (
      <Card>
        <SecHdr label="Επωνυμία στις αναφορές" />
        <InfoBanner tone="info">Διαθέσιμο από το πακέτο «{PLANS[minPlan].name}». Με την αναβάθμιση, κάθε εκτυπώσιμο PDF φέρει το λογότυπο, τα στοιχεία και τα χρώματα της επιχείρησής σου.</InfoBanner>
        <div style={{ marginTop: 14 }}><Btn variant="primary" onClick={onUpgrade}>Δες τα πακέτα</Btn></div>
      </Card>
    );
  }

  const previewName = companyName.trim() || 'Η επωνυμία σου';
  const contact = [phone.trim(), email.trim()].filter(Boolean).join(' · ');

  // ═══════════════════════════════════════════════════════════════════════
  // ΤΕΣΣΕΡΙΣ ΚΑΡΤΕΣ ΓΙΑ ΜΙΑ ΡΥΘΜΙΣΗ
  // ───────────────────────────────────────────────────────────────────────
  // Η οθόνη απαντά σε ΕΝΑ ερώτημα: «πώς δείχνουν οι αναφορές μου». Το έσπαγε
  // σε τέσσερα κουτιά με τέσσερα περιγράμματα, τέσσερις σκιές και τέσσερις
  // κεφαλίδες — «Επωνυμία», «Λογότυπο», «Χρώμα», «Προεπισκόπηση» — δηλαδή
  // τέσσερα σύνορα εκεί που δεν υπάρχει κανένα. Το κάθε κουτί έλεγε ένα πεδίο.
  //
  // Ενα κουτί, τέσσερις σειρές, λεπτές γραμμές αντί για περιγράμματα. Η
  // ιεραρχία λέγεται με το ΔΙΑΣΤΗΜΑ και το βάρος, όχι με σχήματα.
  //
  // Η ΠΡΟΕΠΙΣΚΟΠΗΣΗ ΔΕΝ ΕΙΝΑΙ ΕΝΟΤΗΤΑ, ΕΙΝΑΙ Η ΑΠΑΝΤΗΣΗ. Είχε δική της κάρτα
  // και δικό της όνομα, σαν να ήταν ακόμη μία ρύθμιση. Κάθεται τώρα δίπλα στα
  // χειριστήρια σε πλατιά οθόνη, ώστε η αλλαγή και το αποτέλεσμα να είναι στο
  // ίδιο βλέμμα και από κάτω σε στενή.
  //
  // ΚΑΙ ΤΟ ΚΟΥΜΠΙ ΑΝΑΣΑΙΝΕΙ. Ηταν κολλημένο στο κάτω περίγραμμα της τελευταίας
  // κάρτας — δηλαδή διαβαζόταν ως μέρος της, ενώ αποθηκεύει ΟΛΗ την οθόνη.
  // ═══════════════════════════════════════════════════════════════════════
  const line: React.CSSProperties = { height: 1, background: 'var(--border-subtle)', margin: '18px 0' };
  const rowLabel: React.CSSProperties = { ...TT.label, fontSize: 11, marginBottom: 10 };

  return (
    <div>
      <Card pad="lg">
        <SecHdr label="Επωνυμία στις αναφορές"
          sub="Ο,τι ορίζεις εδώ μπαίνει στην κεφαλίδα κάθε PDF που στέλνεις" />

        <Toggle on={enabled} onChange={setEnabled} label="Εμφάνιση της επωνυμίας μου στις αναφορές" />

        <div style={line} />

        <div style={{ ...formGrid(220, 297), gap: 14 }}>
          <TextInput label="Επωνυμία ή όνομα γραφείου" value={companyName} onChange={setCompanyName} placeholder="Παπαδόπουλος Ακίνητα" />
          <TextInput label="Τηλέφωνο επικοινωνίας" value={phone} onChange={setPhone} placeholder="210 0000000" />
          <TextInput label="Ηλεκτρονικό ταχυδρομείο επικοινωνίας" value={email} onChange={setEmail} placeholder="info@grafeio.gr" />
        </div>

        <div style={line} />

        {/* Λογότυπο και χρώμα είναι ΤΟ ΙΔΙΟ ΠΡΑΓΜΑ — η οπτική ταυτότητα — και
            κάθονται στην ίδια σειρά. Ηταν δύο κάρτες, η μία κάτω από την άλλη. */}
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ minWidth: 220 }}>
            <div style={rowLabel}>Λογότυπο</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              {logoUrl && <img src={logoUrl} alt="Λογότυπο επιχείρησης" style={{ height: 40, width: 'auto', maxWidth: 160, objectFit: 'contain', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: 5 }} />}
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={onFile} style={{ display: 'none' }} />
              <Btn variant="secondary" onClick={() => fileRef.current?.click()}>{logoUrl ? 'Αλλαγή' : 'Μεταφόρτωση'}</Btn>
              {logoUrl && <Btn variant="ghost" onClick={() => setLogoUrl('')}>Αφαίρεση</Btn>}
            </div>
            {/* Ηταν τρεις προτάσεις σε δική της παράγραφο. Οι περιορισμοί του
                αρχείου είναι υποσημείωση, όχι οδηγία. */}
            <div style={{ ...TT.caption, marginTop: 8 }}>PNG, JPG ή WebP · έως 500 KB · μειώνεται αυτόματα</div>
          </div>

          <div>
            <div style={rowLabel}>Χρώμα</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="color" value={sanitizeAccent(accent)} onChange={e => setAccent(e.target.value)}
                aria-label="Χρώμα επωνυμίας"
                style={{ width: 44, height: 44, border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, background: 'transparent', cursor: 'pointer', padding: 3, flexShrink: 0 }} />
              <div style={{ width: 132 }}>
                <TextInput label="" value={accent} onChange={v => setAccent(v)} placeholder="#1a73e8" />
              </div>
            </div>
          </div>
        </div>

        <div style={line} />

        <div style={rowLabel}>Έτσι θα φαίνεται</div>
        <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, overflow: 'hidden', background: PAPER }}>
          <div style={{ height: 4, background: sanitizeAccent(accent) }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px', borderBottom: `2px solid ${sanitizeAccent(accent)}` }}>
            {logoUrl
              ? <img src={logoUrl} alt="Λογότυπο επιχείρησης" style={{ height: 34, width: 'auto', maxWidth: 150, objectFit: 'contain' }} />
              : <div style={{ width: 34, height: 34, borderRadius: 8, background: sanitizeAccent(accent), color: PAPER, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16 }}>{(previewName[0] || 'P').toUpperCase()}</div>}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: INK, fontFamily: T.font.sans }}>{previewName}</div>
              <div style={{ fontSize: 11, color: INK_MUTED, fontFamily: T.font.sans }}>Αναφορά ακινήτου</div>
              {contact && <div style={{ fontSize: 11, color: INK_MUTED, fontFamily: T.font.sans, marginTop: 2 }}>{contact}</div>}
            </div>
          </div>
        </div>

        {/* ── ΤΟ ΣΦΑΛΜΑ ΚΑΙ ΤΟ ΚΟΥΜΠΙ ΜΕΣΑ ΣΤΗΝ ΚΑΡΤΑ ΤΟΥΣ ────────────────────
            Ηταν έξω από την Card, δηλαδή ένα κουμπί που αιωρούνταν ανάμεσα σε
            δύο ενότητες: από πάνω το τέλος της μιας κάρτας, από κάτω η κεφαλίδα
            της επόμενης και το κουμπί κολλητά πάνω της. Καμία άλλη ενότητα των
            Ρυθμίσεων δεν κάνει κάτι τέτοιο — οι ενέργειες κάθε ενότητας ζουν
            ΜΕΣΑ στην κάρτα της και η κάρτα κρατά τον ρυθμό των αποστάσεων. */}
        {error && <div style={{ marginTop: 16 }}><InfoBanner tone="warning">{error}</InfoBanner></div>}
        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
          <Btn variant="primary" onClick={save} disabled={saving}>{saving ? 'Αποθήκευση…' : saved ? 'Αποθηκεύτηκε' : 'Αποθήκευση επωνυμίας'}</Btn>
        </div>
      </Card>
    </div>
  );
}
