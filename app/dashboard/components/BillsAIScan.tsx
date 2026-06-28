'use client';

import { useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

const T = {
  radius: { card: 14, inner: 10, badge: 6, btn: 10, pill: 100 },
  font:   { sans: "Inter, 'Google Sans', sans-serif", mono: "'JetBrains Mono', monospace" },
};
const fe = (n: number, d = 2) => `${n.toLocaleString('el-GR', { minimumFractionDigits: d, maximumFractionDigits: d })} €`;

interface ExtractedBill {
  provider:       string;
  category:       string;
  amount:         number;
  due_date:       string;
  period:         string;
  kwh?:           number;
  ert?:           number;
  etmear?:        number;
  dimotika?:      number;
  vat_rate?:      number;
  account_num?:   string;
  notes?:         string;
  confidence:     number; // 0-100
  raw_text?:      string;
}

const SYSTEM_PROMPT = `Είσαι ειδικός ανάλυσης ελληνικών λογαριασμών κοινής ωφέλειας. 
Εξάγαγε τα παρακάτω στοιχεία από τον λογαριασμό και επέστρεψε ΜΟΝΟ valid JSON, χωρίς markdown:
{
  "provider": "όνομα παρόχου (π.χ. ΔΕΗ, ΕΥΔΑΠ, COSMOTE)",
  "category": "electricity|water|gas|internet|phone|other",
  "amount": αριθμός (συνολικό ποσό πληρωμής σε ευρώ),
  "due_date": "YYYY-MM-DD ή κενό αν δεν φαίνεται",
  "period": "π.χ. Ιούν 2026 ή 01/04-30/06/2026",
  "kwh": αριθμός ή null (κατανάλωση kWh, μόνο για ρεύμα),
  "ert": αριθμός ή null (τέλος ΕΡΤ σε €, μόνο για ρεύμα),
  "etmear": αριθμός ή null (τέλος ΕΤΜΕΑΡ σε €, μόνο για ρεύμα),
  "dimotika": αριθμός ή null (δημοτικά τέλη σε €, μόνο για ρεύμα),
  "vat_rate": αριθμός (ΦΠΑ %, π.χ. 6 ή 24),
  "account_num": "αριθμός λογαριασμού/πελάτη αν φαίνεται",
  "notes": "οτιδήποτε σημαντικό",
  "confidence": αριθμός 0-100 (πόσο σίγουρος είσαι)
}`;

const CATEGORY_LABELS: Record<string, string> = {
  electricity: 'Ρεύμα', water: 'Νερό', gas: 'Φυσικό Αέριο',
  internet: 'Internet', phone: 'Τηλεφωνία', other: 'Άλλο',
};

interface Props { propertyId: string; userId?: string; onSaved?: () => void; }

export default function BillsAIScan({ propertyId, userId = '', onSaved }: Props) {
  const supabase    = createClient();
  const fileRef     = useRef<HTMLInputElement>(null);
  const cameraRef   = useRef<HTMLInputElement>(null);
  const [image,     setImage]     = useState<string>('');      // base64 preview
  const [imageType, setImageType] = useState<string>('');      // MIME type
  const [scanning,  setScanning]  = useState(false);
  const [result,    setResult]    = useState<ExtractedBill | null>(null);
  const [edited,    setEdited]    = useState<ExtractedBill | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [error,     setError]     = useState('');
  const [step,      setStep]      = useState<'upload'|'scan'|'review'|'done'>('upload');

  const loadImage = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      setError('Υποστηριζόμενα: JPG, PNG, HEIC, PDF'); return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl  = e.target?.result as string;
      const base64   = dataUrl.split(',')[1];
      const mimeType = file.type === 'application/pdf' ? 'application/pdf' : file.type;
      setImage(dataUrl);
      setImageType(mimeType);
      setResult(null); setEdited(null); setSaved(false); setError('');
      setStep('scan');
      // Auto-scan
      scanBill(base64, mimeType);
    };
    reader.readAsDataURL(file);
  }, []);

  const scanBill = async (base64: string, mimeType: string) => {
    setScanning(true); setError('');
    try {
      const contentPart = mimeType === 'application/pdf'
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
        : { type: 'image',    source: { type: 'base64', media_type: mimeType,           data: base64 } };

      const response = await fetch('/api/anthropic', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model:      'claude-sonnet-4-6',
          max_tokens: 1000,
          system:     SYSTEM_PROMPT,
          messages: [{ role: 'user', content: [contentPart, { type: 'text', text: 'Ανάλυσε αυτόν τον λογαριασμό και εξάγαγε τα στοιχεία.' }] }],
        }),
      });

      const data = await response.json();
      const text = (data.content || []).find((c: any) => c.type === 'text')?.text || '{}';
      const clean = text.replace(/```json?|```/g, '').trim();
      const extracted: ExtractedBill = JSON.parse(clean);

      setResult(extracted);
      setEdited({ ...extracted });
      setStep('review');
    } catch (e) {
      setError('Σφάλμα σάρωσης. Δοκίμασε πιο καθαρή φωτογραφία ή PDF.');
      setStep('upload');
    } finally { setScanning(false); }
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
        dimotika:    edited.dimotika|| null,
        vat_rate:    String(edited.vat_rate || 6),
        notes:       `AI scan · ${edited.notes || ''} · Λογαριασμός: ${edited.account_num || '—'}`,
        recurring:   false,
      });
      setSaved(true);
      setStep('done');
      onSaved?.();
    } catch (e) {
      setError('Σφάλμα αποθήκευσης.');
    } finally { setSaving(false); }
  };

  const Field = ({ label, value, onChange, type = 'text' }: { label: string; value: string | number; onChange: (v: string) => void; type?: string }) => (
    <div>
      <label style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4, fontFamily: T.font.sans }}>{label}</label>
      <input type={type} value={String(value || '')} onChange={e => onChange(e.target.value)}
        style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 4, padding: '8px 12px', color: 'var(--text-primary)', fontSize: 13, fontFamily: type === 'number' ? T.font.mono : T.font.sans, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
        onFocus={e => e.target.style.borderColor = 'var(--accent)'}
        onBlur={e => e.target.style.borderColor = 'var(--border-default)'}/>
    </div>
  );

  if (step === 'done') {
    return (
      <div style={{ textAlign: 'center', padding: 60, fontFamily: T.font.sans }}>
        <div style={{ marginBottom: 16 }}><svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="var(--positive)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg></div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--positive)', marginBottom: 8 }}>Λογαριασμός Αποθηκεύτηκε!</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>{edited?.provider} · {fe(edited?.amount || 0)}</div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 24 }}>Βρίσκεται τώρα στην Επισκόπηση Λογαριασμών</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button onClick={() => { setStep('upload'); setImage(''); setResult(null); setEdited(null); setSaved(false); }}
            style={{ background: 'var(--accent)', color: '#000', border: 'none', borderRadius: T.radius.pill, padding: '10px 28px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            Σάρωσε Νέο
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Σάρωση & Ανάλυση Λογαριασμού</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Φωτογράφισε ή ανέβασε λογαριασμό ΔΕΗ, ΕΥΔΑΠ, COSMOTE — εξαγωγή δεδομένων με AI αυτόματα</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: step === 'review' && image ? '1fr 1fr' : '1fr', gap: 20 }}>

        {/* Left: Image */}
        <div>
          {!image ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Camera button (mobile) */}
              <div onClick={() => cameraRef.current?.click()}
                style={{ border: '2px dashed var(--border-default)', borderRadius: T.radius.card, padding: 40, textAlign: 'center', cursor: 'pointer', background: 'transparent', transition: 'all 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-default)')}>
                <div style={{ marginBottom: 12 }}><svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/></svg></div>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Φωτογράφισε Λογαριασμό</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Κάμερα κινητού — tablet</div>
              </div>
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && loadImage(e.target.files[0])}/>

              {/* Upload button */}
              <div onClick={() => fileRef.current?.click()}
                style={{ border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 20, textAlign: 'center', cursor: 'pointer', background: 'var(--bg-elevated)', transition: 'all 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}>
                <div style={{ marginBottom: 8 }}><svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Ανέβασε Αρχείο</div>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>JPG · PNG · HEIC · PDF · CSV · Excel</div>
              </div>
              <input ref={fileRef} type="file" accept="image/*,.pdf,.csv,.txt,.xlsx,.xls,.ods" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && loadImage(e.target.files[0])}/>
            </div>
          ) : (
            <div>
              <img src={image} alt="Λογαριασμός" style={{ width: '100%', borderRadius: T.radius.card, border: '1px solid var(--border-subtle)', maxHeight: 500, objectFit: 'contain', background: '#fff' }}/>
              {scanning && (
                <div style={{ marginTop: 12, background: 'rgba(212,175,66,0.07)', border: '1px solid rgba(212,175,66,0.2)', borderRadius: T.radius.inner, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1.5s infinite' }}/>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    <strong style={{ color: 'var(--accent)' }}>Claude AI</strong> αναλύει τον λογαριασμό...
                  </div>
                </div>
              )}
              <button onClick={() => { setStep('upload'); setImage(''); setResult(null); setEdited(null); }}
                style={{ marginTop: 10, fontSize: 11, color: 'var(--text-tertiary)', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: T.radius.btn, padding: '6px 14px', cursor: 'pointer' }}>
                ← Νέα Φωτογραφία
              </button>
            </div>
          )}

          {error && <div style={{ marginTop: 12, background: 'rgba(197,34,31,0.07)', border: '1px solid rgba(197,34,31,0.25)', borderRadius: T.radius.inner, padding: '10px 14px', fontSize: 12, color: 'var(--negative)' }}>{error}</div>}
        </div>

        {/* Right: Extracted data editor */}
        {step === 'review' && edited && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Εξαγόμενα Στοιχεία</div>
              <div style={{ fontSize: 10, background: edited.confidence >= 80 ? 'rgba(52,168,83,0.1)' : 'rgba(242,153,0,0.1)', color: edited.confidence >= 80 ? 'var(--positive)' : 'var(--warning)', padding: '2px 10px', borderRadius: T.radius.pill, fontWeight: 700 }}>
                {edited.confidence}% βεβαιότητα
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="Πάροχος" value={edited.provider} onChange={v => setEdited(p => ({ ...p!, provider: v }))}/>
                <div>
                  <label style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>Κατηγορία</label>
                  <select value={edited.category} onChange={e => setEdited(p => ({ ...p!, category: e.target.value }))}
                    style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 4, padding: '8px 12px', color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: T.font.sans }}>
                    {Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="Ποσό (€)"           type="number" value={edited.amount}   onChange={v => setEdited(p => ({ ...p!, amount:   parseFloat(v) || 0 }))}/>
                <Field label="Ημερομηνία Λήξης"   type="date"   value={edited.due_date} onChange={v => setEdited(p => ({ ...p!, due_date: v }))}/>
              </div>
              <Field label="Περίοδος" value={edited.period} onChange={v => setEdited(p => ({ ...p!, period: v }))}/>

              {(edited.category === 'electricity') && (
                <div style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: T.radius.inner, padding: 12 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--warning)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Λεπτομέρειες Ρεύματος</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <Field label="Κατανάλωση (kWh)"  type="number" value={edited.kwh    || ''} onChange={v => setEdited(p => ({ ...p!, kwh:    parseFloat(v) || undefined }))}/>
                    <Field label="ΕΡΤ (€)"            type="number" value={edited.ert    || ''} onChange={v => setEdited(p => ({ ...p!, ert:    parseFloat(v) || undefined }))}/>
                    <Field label="ΕΤΜΕΑΡ (€)"         type="number" value={edited.etmear || ''} onChange={v => setEdited(p => ({ ...p!, etmear: parseFloat(v) || undefined }))}/>
                    <Field label="Δημοτικά (€)"       type="number" value={edited.dimotika || ''} onChange={v => setEdited(p => ({ ...p!, dimotika: parseFloat(v) || undefined }))}/>
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="ΦΠΑ %" type="number" value={edited.vat_rate || ''} onChange={v => setEdited(p => ({ ...p!, vat_rate: parseFloat(v) || 6 }))}/>
                <Field label="Αριθμός Λογαριασμού" value={edited.account_num || ''} onChange={v => setEdited(p => ({ ...p!, account_num: v }))}/>
              </div>
              {edited.notes && <Field label="Σημειώσεις" value={edited.notes} onChange={v => setEdited(p => ({ ...p!, notes: v }))}/>}

              {/* Summary */}
              <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '12px 16px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2 }}>{CATEGORY_LABELS[edited.category]} · {edited.period}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, fontFamily: T.font.mono, color: 'var(--text-primary)' }}>{fe(edited.amount)}</div>
                  </div>
                  <button onClick={saveBill} disabled={saving || !edited.amount}
                    style={{ background: edited.amount > 0 ? 'var(--accent)' : 'var(--bg-elevated)', color: edited.amount > 0 ? '#000' : 'var(--text-tertiary)', border: 'none', borderRadius: T.radius.btn, padding: '12px 24px', fontSize: 13, fontWeight: 700, cursor: edited.amount > 0 ? 'pointer' : 'not-allowed' }}>
                    {saving ? 'Αποθήκευση...' : 'Αποθήκευση →'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}