'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, Btn, InfoBanner, Spinner, Card, SecHdr } from '@/components/Theme';
import { TextInput, Toggle } from './UIComponents';
import { normalizePlan } from '@/lib/billing/plans';
import { sanitizeAccent, sanitizeLogo, DEFAULT_ACCENT } from '@/lib/reportBranding';
import { INK, INK_MUTED, PAPER } from '@/lib/print/ink';
import { failed } from '@/lib/core/dbError';

const MAX_LOGO_BYTES = 500_000;

export default function ReportBranding({ userId, onUpgrade }: { userId: string; onUpgrade: () => void }) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState('free');
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
      const [{ data: bp }, { data: rb }] = await Promise.all([
        supabase.from('billing_profiles').select('plan').eq('user_id', userId).maybeSingle(),
        supabase.from('report_branding').select('*').eq('user_id', userId).maybeSingle(),
      ]);
      setPlan((bp?.plan as string) || 'free');
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

  if (normalizePlan(plan) !== 'agency') {
    return (
      <Card>
        <SecHdr label="Επωνυμία στις αναφορές" />
        <InfoBanner tone="info">Διαθέσιμο στο πλάνο «Επαγγελματίας». Με την αναβάθμιση, κάθε εκτυπώσιμο PDF φέρει το λογότυπο, τα στοιχεία και τα χρώματα της επιχείρησής σου.</InfoBanner>
        <div style={{ marginTop: 14 }}><Btn variant="primary" onClick={onUpgrade}>Δες τα πλάνα</Btn></div>
      </Card>
    );
  }

  const previewName = companyName.trim() || 'Η επωνυμία σου';
  const contact = [phone.trim(), email.trim()].filter(Boolean).join(' · ');

  return (
    <div>
      <Card>
        <SecHdr label="Επωνυμία στις αναφορές" />
        <div style={{ marginBottom: 16 }}>
          <Toggle on={enabled} onChange={setEnabled} label="Εμφάνιση της επωνυμίας μου στις αναφορές" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 14 }}>
          <TextInput label="Επωνυμία ή όνομα γραφείου" value={companyName} onChange={setCompanyName} placeholder="Παπαδόπουλος Ακίνητα" />
          <TextInput label="Τηλέφωνο επικοινωνίας" value={phone} onChange={setPhone} placeholder="210 0000000" />
          <TextInput label="Ηλεκτρονικό ταχυδρομείο επικοινωνίας" value={email} onChange={setEmail} placeholder="info@grafeio.gr" />
        </div>
      </Card>

      <Card>
        <SecHdr label="Λογότυπο" />
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.6, marginBottom: 14 }}>
          PNG, JPG ή WebP, ιδανικά τετράγωνο ή οριζόντιο. Μειώνεται αυτόματα, μέγιστο 500 KB.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          {logoUrl && <img src={logoUrl} alt="Λογότυπο επιχείρησης" style={{ height: 44, width: 'auto', maxWidth: 200, objectFit: 'contain', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: 6 }} />}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={onFile} style={{ display: 'none' }} />
          <Btn variant="secondary" onClick={() => fileRef.current?.click()}>Μεταφόρτωση λογοτύπου</Btn>
          {logoUrl && <Btn variant="ghost" onClick={() => setLogoUrl('')}>Αφαίρεση</Btn>}
        </div>
      </Card>

      <Card>
        <SecHdr label="Χρώμα επωνυμίας" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <input type="color" value={sanitizeAccent(accent)} onChange={e => setAccent(e.target.value)}
            style={{ width: 48, height: 40, border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, background: 'transparent', cursor: 'pointer', padding: 2 }} />
          <div style={{ width: 160 }}>
            <TextInput label="" value={accent} onChange={v => setAccent(v)} placeholder="#1a73e8" />
          </div>
        </div>
      </Card>

      <Card>
        <SecHdr label="Προεπισκόπηση κεφαλίδας" />
        <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, overflow: 'hidden', background: PAPER }}>
          <div style={{ height: 4, background: sanitizeAccent(accent) }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px', borderBottom: `2px solid ${sanitizeAccent(accent)}` }}>
            {logoUrl
              ? <img src={logoUrl} alt="Λογότυπο επιχείρησης" style={{ height: 34, width: 'auto', maxWidth: 150, objectFit: 'contain' }} />
              : <div style={{ width: 34, height: 34, borderRadius: 8, background: sanitizeAccent(accent), color: PAPER, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 17 }}>{(previewName[0] || 'P').toUpperCase()}</div>}
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: INK, fontFamily: T.font.sans }}>{previewName}</div>
              <div style={{ fontSize: 11, color: INK_MUTED, fontFamily: T.font.sans }}>Αναφορά ακινήτου</div>
              {contact && <div style={{ fontSize: 10, color: INK_MUTED, fontFamily: T.font.sans, marginTop: 2 }}>{contact}</div>}
            </div>
          </div>
        </div>
      </Card>

      {error && <div style={{ marginBottom: 12 }}><InfoBanner tone="warning">{error}</InfoBanner></div>}
      <Btn variant="primary" onClick={save} disabled={saving}>{saving ? 'Αποθήκευση…' : saved ? 'Αποθηκεύτηκε ✓' : 'Αποθήκευση επωνυμίας'}</Btn>
    </div>
  );
}
