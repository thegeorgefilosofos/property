'use client';

import { useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

const T = {
  radius: { card: 14, inner: 10, badge: 6, btn: 10, pill: 100 },
  font:   { sans: "Inter, 'Google Sans', sans-serif", mono: "'JetBrains Mono', monospace" },
};
const fe = (n: number, d = 2) => `${n.toLocaleString('el-GR', { minimumFractionDigits: d, maximumFractionDigits: d })} €`;

interface ExtractedBill {
  provider:      string;
  category:      string;
  amount:        number;
  due_date:      string;
  period:        string;
  kwh?:          number;
  ert?:          number;
  etmear?:       number;
  dimotika?:     number;
  vat_rate?:     number;
  account_num?:  string;
  notes?:        string;
  confidence:    number;
}

const SYSTEM_PROMPT = `Είσαι ειδικός ανάλυσης ελληνικών λογαριασμών κοινής ωφέλειας.
Εξάγαγε τα στοιχεία από τον λογαριασμό και επέστρεψε ΜΟΝΟ valid JSON, χωρίς markdown:
{
  "provider": "όνομα παρόχου (π.χ. ΔΕΗ, ΕΥΔΑΠ, COSMOTE)",
  "category": "electricity|water|gas|internet|phone|other",
  "amount": αριθμός (συνολικό ποσό πληρωμής σε ευρώ),
  "due_date": "YYYY-MM-DD ή κενό",
  "period": "π.χ. Ιούν 2026 ή 01/04-30/06/2026",
  "kwh": αριθμός ή null,
  "ert": αριθμός ή null,
  "etmear": αριθμός ή null,
  "dimotika": αριθμός ή null,
  "vat_rate": αριθμός (π.χ. 6 ή 24),
  "account_num": "αριθμός λογαριασμού αν φαίνεται",
  "notes": "οτιδήποτε σημαντικό",
  "confidence": αριθμός 0-100
}`;

const CATEGORY_LABELS: Record<string, string> = {
  electricity: 'Ρεύμα', water: 'Νερό', gas: 'Φυσικό Αέριο',
  internet: 'Internet', phone: 'Τηλεφωνία', other: 'Άλλο',
};

// Reusable input field
const Field = ({
  label, value, onChange, type = 'text',
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
}) => (
  <div>
    <label style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', display: 'block', marginBottom: 4, fontFamily: T.font.sans }}>
      {label}
    </label>
    <input
      type={type}
      value={String(value || '')}
      onChange={e => onChange(e.target.value)}
      style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 4, padding: '8px 12px', color: 'var(--text-primary)', fontSize: 13, fontFamily: type === 'number' ? T.font.mono : T.font.sans, outline: 'none', boxSizing: 'border-box' as const, transition: 'border-color 0.15s' }}
      onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
      onBlur={e => (e.target.style.borderColor = 'var(--border-default)')}
    />
  </div>
);

interface Props { propertyId: string; userId?: string; onSaved?: () => void; }

export default function BillsAIScan({ propertyId, userId = '', onSaved }: Props) {
  const supabase  = createClient();
  const fileRef   = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const [image,    setImage]    = useState('');
  const [imageType,setImageType]= useState('');
  const [scanning, setScanning] = useState(false);
  const [result,   setResult]   = useState<ExtractedBill | null>(null);
  const [edited,   setEdited]   = useState<ExtractedBill | null>(null);
  const [saving,   setSaving]   = useState(false);
  const [step,     setStep]     = useState<'upload' | 'review' | 'done'>('upload');
  const [error,    setError]    = useState('');

  const loadImage = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf' && !file.name.match(/\.(csv|xlsx|xls|txt)$/i)) {
      setError('Υποστηριζόμενα: JPG, PNG, HEIC, PDF, CSV, Excel');
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl  = e.target?.result as string;
      const base64   = dataUrl.split(',')[1];
      const mimeType = file.type || 'image/jpeg';
      setImage(dataUrl);
      setImageType(mimeType);
      setResult(null); setEdited(null); setError('');
      setStep('review');
      scanBill(base64, mimeType);
    };
    reader.readAsDataURL(file);
  }, []);

  const scanBill = async (base64: string, mimeType: string) => {
    setScanning(true); setError('');
    try {
      const isPdf = mimeType === 'application/pdf';
      const contentPart = isPdf
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
        : { type: 'image',    source: { type: 'base64', media_type: mimeType,           data: base64 } };

      const res  = await fetch('/api/anthropic', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6', max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: [contentPart, { type: 'text', text: 'Ανάλυσε αυτόν τον λογαριασμό.' }] }],
        }),
      });
      const data = await res.json();
      const text = (data.content || []).find((c: { type: string }) => c.type === 'text')?.text || '{}';
      const clean = text.replace(/```json?|```/g, '').trim();
      const extracted: ExtractedBill = JSON.parse(clean);
      setResult(extracted);
      setEdited({ ...extracted });
    } catch (_) {
      setError('Σφάλμα σάρωσης. Δοκίμασε πιο καθαρή φωτογραφία ή PDF.');
    } finally {
      setScanning(false);
    }
  };

  const saveBill = async () => {
    if (!edited) return;
    setSaving(true);
    try {
      await supabase.from('bills').insert({
        property_id: propertyId,
        user_id:     userId,
        category:    edited.category,
        name:        `${edited.provider}${edited.period ? ` — ${edited.period}` : ''}`,
        amount:      edited.amount,
        paid:        false,
        due_date:    edited.due_date || null,
        kwh:         edited.kwh     || null,
        ert:         edited.ert     || null,
        etmear:      edited.etmear  || null,
        dimotika:    edited.dimotika || null,
        vat_rate:    String(edited.vat_rate || 6),
        notes:       `AI σάρωση · ${edited.notes || ''} · Λογαριασμός: ${edited.account_num || '—'}`,
        recurring:   false,
      });
      setStep('done');
      onSaved?.();
    } catch (_) {
      setError('Σφάλμα αποθήκευσης.');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setStep('upload'); setImage(''); setResult(null);
    setEdited(null); setSaving(false); setError('');
  };

  // ── Done ──────────────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <div style={{ textAlign: 'center', padding: 60, fontFamily: T.font.sans }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(52,168,83,0.1)', border: '1px solid rgba(52,168,83,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="var(--positive)" strokeWidth="2.5" strokeLinecap="round">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, letterSpacing: '-0.02em' }}>
          Λογαριασμός Αποθηκεύτηκε
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
          {edited?.provider} — {fe(edited?.amount || 0)}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 28 }}>
          Βρίσκεται στην Επισκόπηση Λογαριασμών
        </div>
        <button onClick={reset}
          style={{ background: 'var(--accent)', color: '#000', border: 'none', borderRadius: T.radius.pill, padding: '10px 28px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: T.font.sans }}>
          Σάρωσε Νέο
        </button>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>
          Σάρωση & Ανάλυση Λογαριασμού
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Φωτογράφισε ή ανέβασε λογαριασμό ΔΕΗ, ΕΥΔΑΠ, COSMOTE — εξαγωγή δεδομένων αυτόματα
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: step === 'review' && image ? '1fr 1fr' : '1fr', gap: 24 }}>

        {/* ── Left column: upload / image preview ─────────────────────────── */}
        <div>
          {step === 'upload' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

              {/* Camera card */}
              <div
                onClick={() => cameraRef.current?.click()}
                style={{ border: '1px solid var(--border-default)', borderRadius: T.radius.card, minHeight: 168, cursor: 'pointer', background: 'var(--bg-elevated)', transition: 'all 0.2s', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0 }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'rgba(212,175,66,0.03)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.background = 'var(--bg-elevated)'; }}
              >
                <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12 }}>
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/>
                </svg>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, fontFamily: T.font.sans }}>Φωτογράφισε</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>Κάμερα κινητού · Tablet</div>
              </div>
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && loadImage(e.target.files[0])}/>

              {/* Upload card */}
              <div
                onClick={() => fileRef.current?.click()}
                style={{ border: '1px solid var(--border-default)', borderRadius: T.radius.card, minHeight: 168, cursor: 'pointer', background: 'var(--bg-elevated)', transition: 'all 0.2s', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0 }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'rgba(212,175,66,0.03)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.background = 'var(--bg-elevated)'; }}
              >
                <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12 }}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                </svg>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, fontFamily: T.font.sans }}>Ανέβασε Αρχείο</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>JPG · PNG · PDF · CSV · Excel</div>
              </div>
              <input ref={fileRef} type="file" accept="image/*,.pdf,.csv,.txt,.xlsx,.xls,.ods" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && loadImage(e.target.files[0])}/>

            </div>
          ) : (
            <div>
              <img
                src={image}
                alt="Λογαριασμός"
                style={{ width: '100%', borderRadius: T.radius.card, border: '1px solid var(--border-subtle)', maxHeight: 500, objectFit: 'contain', background: '#fff' }}
              />
              {scanning && (
                <div style={{ marginTop: 12, background: 'rgba(212,175,66,0.06)', border: '1px solid rgba(212,175,66,0.2)', borderRadius: T.radius.inner, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }}/>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>
                    <strong style={{ color: 'var(--accent)' }}>Claude AI</strong> αναλύει τον λογαριασμό...
                  </div>
                </div>
              )}
              <button
                onClick={reset}
                style={{ marginTop: 10, fontSize: 11, color: 'var(--text-tertiary)', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: T.radius.btn, padding: '6px 14px', cursor: 'pointer', fontFamily: T.font.sans }}
              >
                ← Νέα Σάρωση
              </button>
            </div>
          )}

          {error && (
            <div style={{ marginTop: 12, background: 'rgba(197,34,31,0.07)', border: '1px solid rgba(197,34,31,0.25)', borderRadius: T.radius.inner, padding: '10px 14px', fontSize: 12, color: 'var(--negative)', fontFamily: T.font.sans }}>
              {error}
            </div>
          )}
        </div>

        {/* ── Right column: extracted data editor ─────────────────────────── */}
        {step === 'review' && edited && !scanning && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, fontFamily: T.font.sans }}>Εξαγόμενα Στοιχεία</div>
              <div style={{ fontSize: 10, background: edited.confidence >= 80 ? 'rgba(52,168,83,0.1)' : 'rgba(242,153,0,0.1)', color: edited.confidence >= 80 ? 'var(--positive)' : 'var(--warning)', padding: '2px 10px', borderRadius: T.radius.pill, fontWeight: 700, fontFamily: T.font.sans }}>
                {edited.confidence}% βεβαιότητα
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="Πάροχος" value={edited.provider} onChange={v => setEdited(p => ({ ...p!, provider: v }))}/>
                <div>
                  <label style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', display: 'block', marginBottom: 4, fontFamily: T.font.sans }}>Κατηγορία</label>
                  <select
                    value={edited.category}
                    onChange={e => setEdited(p => ({ ...p!, category: e.target.value }))}
                    style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 4, padding: '8px 12px', color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: T.font.sans }}
                  >
                    {Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="Ποσό (€)" type="number" value={edited.amount} onChange={v => setEdited(p => ({ ...p!, amount: parseFloat(v) || 0 }))}/>
                <Field label="Ημερομηνία Λήξης" type="date" value={edited.due_date} onChange={v => setEdited(p => ({ ...p!, due_date: v }))}/>
              </div>

              <Field label="Περίοδος" value={edited.period} onChange={v => setEdited(p => ({ ...p!, period: v }))}/>

              {edited.category === 'electricity' && (
                <div style={{ background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.18)', borderRadius: T.radius.inner, padding: 12 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--warning)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 10, fontFamily: T.font.sans }}>Λεπτομέρειες Ρεύματος</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <Field label="Κατανάλωση (kWh)" type="number" value={edited.kwh    || ''} onChange={v => setEdited(p => ({ ...p!, kwh:     parseFloat(v) || undefined }))}/>
                    <Field label="ΕΡΤ (€)"          type="number" value={edited.ert    || ''} onChange={v => setEdited(p => ({ ...p!, ert:     parseFloat(v) || undefined }))}/>
                    <Field label="ΕΤΜΕΑΡ (€)"        type="number" value={edited.etmear || ''} onChange={v => setEdited(p => ({ ...p!, etmear:  parseFloat(v) || undefined }))}/>
                    <Field label="Δημοτικά Τέλη (€)" type="number" value={edited.dimotika || ''} onChange={v => setEdited(p => ({ ...p!, dimotika: parseFloat(v) || undefined }))}/>
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="ΦΠΑ %" type="number" value={edited.vat_rate || ''} onChange={v => setEdited(p => ({ ...p!, vat_rate: parseFloat(v) || 6 }))}/>
                <Field label="Αριθμός Λογαριασμού" value={edited.account_num || ''} onChange={v => setEdited(p => ({ ...p!, account_num: v }))}/>
              </div>

              {edited.notes && (
                <Field label="Σημειώσεις" value={edited.notes} onChange={v => setEdited(p => ({ ...p!, notes: v }))}/>
              )}

              {/* Save bar */}
              <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '14px 16px', border: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2, fontFamily: T.font.sans }}>
                    {CATEGORY_LABELS[edited.category] || edited.category}{edited.period ? ` · ${edited.period}` : ''}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, fontFamily: T.font.mono, color: 'var(--text-primary)', lineHeight: 1 }}>
                    {fe(edited.amount)}
                  </div>
                </div>
                <button
                  onClick={saveBill}
                  disabled={saving || !edited.amount}
                  style={{ background: edited.amount > 0 ? 'var(--accent)' : 'var(--bg-elevated)', color: edited.amount > 0 ? '#000' : 'var(--text-tertiary)', border: 'none', borderRadius: T.radius.btn, padding: '12px 24px', fontSize: 13, fontWeight: 700, cursor: edited.amount > 0 ? 'pointer' : 'not-allowed', fontFamily: T.font.sans }}
                >
                  {saving ? 'Αποθήκευση...' : 'Αποθήκευση →'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}