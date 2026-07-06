'use client';

import { useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, fe } from '@/components/Theme';

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
  cubic_meters?: number;   // κυβικά νερού/αερίου (m³)
  meter_prev?:   number;   // προηγούμενη ένδειξη μετρητή
  meter_current?:number;   // τρέχουσα ένδειξη μετρητή
  energy_charge?:number;   // χρέωση ενέργειας/κατανάλωσης (€)
  network_charge?:number;  // χρεώσεις δικτύου/μεταφοράς (€)
  millesimi?:    number;   // χιλιοστά διαμερίσματος (κοινόχρηστα)
  notes?:        string;
  confidence:    number;
}

const SYSTEM_PROMPT = `Είσαι ειδικός ανάλυσης ελληνικών λογαριασμών κοινής ωφέλειας (ΔΕΗ/πάροχοι ρεύματος, ΕΥΔΑΠ/ύδρευση, φυσικό αέριο, κοινόχρηστα πολυκατοικίας, ΟΤΕ/COSMOTE, ασφάλειες).
Διάβασε ΠΡΟΣΕΚΤΙΚΑ όλα τα νούμερα και επέστρεψε ΜΟΝΟ valid JSON, χωρίς markdown:
{
  "provider": "όνομα παρόχου (π.χ. ΔΕΗ, ΕΥΔΑΠ, Ζενίθ, COSMOTE)",
  "category": "electricity|water|gas|internet|insurance|streaming|taxes|municipal|security|common|maintenance|elevator|pool|gardener|cleaner|plumber|electrician|other",
  "amount": αριθμός (ΣΥΝΟΛΙΚΟ πληρωτέο ποσό σε ευρώ),
  "due_date": "YYYY-MM-DD (λήξη πληρωμής) ή κενό",
  "period": "περίοδος κατανάλωσης, π.χ. Ιούν 2026 ή 01/04-30/06/2026",
  "kwh": κιλοβατώρες ρεύματος (μόνο για ρεύμα) ή null,
  "ert": αριθμός ή null,
  "etmear": αριθμός ή null,
  "dimotika": δημοτικά τέλη/φόρος σε € ή null,
  "cubic_meters": κυβικά μέτρα κατανάλωσης νερού Ή αερίου (m³) ή null,
  "meter_prev": προηγούμενη ένδειξη μετρητή ή null,
  "meter_current": τρέχουσα ένδειξη μετρητή ή null,
  "energy_charge": καθαρή χρέωση ενέργειας/κατανάλωσης σε € ή null,
  "network_charge": χρεώσεις δικτύου/μεταφοράς/διανομής σε € ή null,
  "millesimi": χιλιοστά συνιδιοκτησίας του διαμερίσματος (μόνο σε ειδοποιητήριο κοινοχρήστων) ή null,
  "vat_rate": ΦΠΑ % (π.χ. 6 ή 24),
  "account_num": "αριθμός παροχής/λογαριασμού αν φαίνεται",
  "notes": "οτιδήποτε άλλο σημαντικό (π.χ. τρόπος πληρωμής, ρυθμίσεις)",
  "confidence": 0-100
}
ΚΑΝΟΝΕΣ: Για ύδρευση συμπλήρωσε cubic_meters. Για κοινόχρηστα βάλε category "common" και, αν υπάρχει, τα millesimi. Για ρεύμα συμπλήρωσε kwh. Χρησιμοποίησε τελεία για δεκαδικά. Αν κάτι δεν υπάρχει, βάλε null.`;

const CATEGORY_LABELS: Record<string, string> = {
  electricity: 'Ρεύμα', water: 'Νερό', gas: 'Φυσικό Αέριο', internet: 'Internet',
  insurance: 'Ασφάλεια', streaming: 'Streaming & Συνδρομές', taxes: 'ΕΝΦΙΑ & Φόροι',
  municipal: 'Δημοτικά Τέλη', security: 'Security / Συναγερμός', common: 'Κοινόχρηστα',
  maintenance: 'Συντήρηση', elevator: 'Συντήρηση Ασανσέρ', pool: 'Καθαρισμός Πισίνας',
  gardener: 'Κηπουρός', cleaner: 'Καθαριότητα', plumber: 'Υδραυλικός', electrician: 'Ηλεκτρολόγος',
  other: 'Άλλο',
};

// Αντιστοίχιση κατηγορίας λογαριασμού → ομάδα/κατηγορία Δαπανών (ώστε να ρέει
// αυτόματα στα Έξοδα και στην Επισκόπηση με μία σάρωση).
const EXPENSE_MAP: Record<string, { group: string; cat: string }> = {
  electricity: { group: 'fixed',       cat: 'Ρεύμα' },
  water:       { group: 'fixed',       cat: 'Νερό' },
  gas:         { group: 'fixed',       cat: 'Φυσικό Αέριο' },
  internet:    { group: 'fixed',       cat: 'Internet' },
  insurance:   { group: 'fixed',       cat: 'Ασφάλεια Κτιρίου' },
  streaming:   { group: 'fixed',       cat: 'Άλλη Πάγια' },
  taxes:       { group: 'fixed',       cat: 'ΕΝΦΙΑ' },
  municipal:   { group: 'fixed',       cat: 'Δημοτικά Τέλη' },
  security:    { group: 'fixed',       cat: 'Σύστημα Συναγερμού' },
  common:      { group: 'fixed',       cat: 'Κοινόχρηστα' },
  maintenance: { group: 'maintenance', cat: 'Γενική Συντήρηση' },
  elevator:    { group: 'maintenance', cat: 'Συντήρηση Ασανσέρ' },
  pool:        { group: 'maintenance', cat: 'Καθαρισμός Πισίνας' },
  gardener:    { group: 'maintenance', cat: 'Κηπουρός' },
  cleaner:     { group: 'maintenance', cat: 'Καθαριότητα' },
  plumber:     { group: 'maintenance', cat: 'Υδραυλικός' },
  electrician: { group: 'maintenance', cat: 'Ηλεκτρολόγος' },
  other:       { group: 'other',       cat: 'Άλλο' },
};

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
  const [savedInfo, setSavedInfo] = useState<string[]>([]);

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
          // FIX: 'claude-sonnet-4-6' was not a valid model identifier.
          // Current Claude API model strings: claude-opus-4-8, claude-sonnet-5, claude-haiku-4-5-20251001.
          model: 'claude-sonnet-5', max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: [contentPart, { type: 'text', text: 'Ανάλυσε αυτόν τον λογαριασμό.' }] }],
        }),
      });
      const data = await res.json();

      // Κενή, επεξεργάσιμη φόρμα ώστε ο χρήστης να ΜΗΝ κολλάει ποτέ — μπορεί πάντα
      // να συμπληρώσει χειροκίνητα, ακόμη κι αν η ανάγνωση αποτύχει.
      const blank: ExtractedBill = { provider: '', category: 'electricity', amount: 0, due_date: '', period: '', confidence: 0 };

      // Σφάλμα σε επίπεδο υπηρεσίας (λείπει κλειδί, όριο χρήσης, κλπ.)
      if (!res.ok || data?.error) {
        const msg = String(data?.error || '');
        setError(msg.includes('ANTHROPIC_API_KEY') ? 'key_missing' : 'service');
        setResult(blank); setEdited(blank);
        return;
      }

      const text = (data.content || []).find((c: { type: string }) => c.type === 'text')?.text || '{}';
      const clean = text.replace(/```json?|```/g, '').trim();
      let extracted: ExtractedBill | null = null;
      try { extracted = JSON.parse(clean); } catch { extracted = null; }

      // Δεν διαβάστηκε τίποτα χρήσιμο → καθοδήγησε τον χρήστη (χωρίς να τον μπλοκάρεις)
      if (!extracted || (!extracted.amount && !extracted.provider)) {
        setError('unreadable');
        setResult(blank); setEdited(blank);
        return;
      }

      setResult(extracted);
      setEdited({ ...extracted });
    } catch (_) {
      // Δικτυακό/άγνωστο σφάλμα — δώσε κενή φόρμα + καθοδήγηση
      const blank: ExtractedBill = { provider: '', category: 'electricity', amount: 0, due_date: '', period: '', confidence: 0 };
      setError('unreadable'); setResult(blank); setEdited(blank);
    } finally {
      setScanning(false);
    }
  };

  const saveBill = async () => {
    if (!edited) return;
    setSaving(true);
    const today = new Date().toISOString().split('T')[0];
    const done: string[] = [];
    try {
      // Δομημένη σημείωση με ό,τι διάβασε το AI (κατανάλωση, ενδείξεις, χιλιοστά)
      const consumption = [
        edited.kwh ? `${edited.kwh} kWh` : '',
        edited.cubic_meters ? `${edited.cubic_meters} m³` : '',
        (edited.meter_prev != null && edited.meter_current != null) ? `Ένδειξη ${edited.meter_prev}→${edited.meter_current}` : '',
        edited.millesimi ? `${edited.millesimi}‰` : '',
      ].filter(Boolean).join(' · ');
      const notes = [`AI σάρωση`, consumption, edited.notes || '', edited.account_num ? `Παροχή: ${edited.account_num}` : '']
        .filter(Boolean).join(' · ');

      // 1) Λογαριασμός → πίνακας bills. Κρατάμε το id για να συνδέσουμε τα υπόλοιπα.
      const { data: billRow, error: billErr } = await supabase.from('bills').insert({
        property_id: propertyId, user_id: userId,
        category: edited.category,
        name: `${edited.provider}${edited.period ? ` — ${edited.period}` : ''}`,
        amount: edited.amount, paid: false, due_date: edited.due_date || null,
        kwh: edited.kwh || null, ert: edited.ert || null, etmear: edited.etmear || null,
        dimotika: edited.dimotika || null, vat_rate: String(edited.vat_rate || 6),
        notes, recurring: false,
      }).select('id').single();
      if (billErr) throw billErr;
      const billId = billRow?.id as string | undefined;
      done.push('Λογαριασμοί');

      // 2) Έξοδο → expenses, ΣΥΝΔΕΔΕΜΕΝΟ με τον λογαριασμό (bill_id) για ακριβή
      // συμφωνία/αναίρεση. Προστασία διπλοεγγραφής (ίδιο ποσό/κατηγορία/ημέρα).
      const map = EXPENSE_MAP[edited.category] || EXPENSE_MAP.other;
      const expDate = edited.due_date || today;
      const { data: dup } = await supabase.from('expenses').select('id')
        .eq('property_id', propertyId).eq('category', map.cat)
        .eq('amount', edited.amount).eq('date', expDate).limit(1);
      if (dup && dup.length) {
        done.push('Έξοδα (υπάρχει ήδη)');
      } else {
        const { error: expErr } = await supabase.from('expenses').insert({
          property_id: propertyId, user_id: userId, bill_id: billId,
          description: `${map.cat} — ${edited.provider}${edited.period ? ` (${edited.period})` : ''}`,
          amount: edited.amount, category: map.cat, expense_group: map.group,
          date: expDate, paid_by: 'owner', paid: false,
          notes: `Από σάρωση λογαριασμού${consumption ? ` · ${consumption}` : ''}`,
        });
        if (!expErr) done.push('Έξοδα');
      }

      // 3) Υπενθύμιση πληρωμής → Ημερολόγιο (μόνο αν υπάρχει ημ/νία λήξης),
      // συνδεδεμένη με τον λογαριασμό ώστε να «κλείνει» αυτόματα στη συμφωνία.
      if (edited.due_date && billId) {
        await supabase.from('calendar_events').insert({
          property_id: propertyId, user_id: userId, bill_id: billId,
          title: `Πληρωμή: ${edited.provider}`, category: 'bills',
          event_date: edited.due_date, amount: edited.amount,
          priority: 'medium', status: 'pending', recurring: false,
          notes: `Από σάρωση λογαριασμού${consumption ? ` · ${consumption}` : ''}`, source: 'scan',
        });
        done.push('Ημερολόγιο');
      }

      // 4) Κοινόχρηστα → ενημέρωση πεδίου Κοινόχρηστα (χιλιοστά + ιστορικό μήνα)
      if (edited.category === 'common') {
        const { data: cur } = await supabase.from('bills_settings').select('data')
          .eq('property_id', propertyId).eq('section', 'common').maybeSingle();
        const d = (cur?.data as Record<string, unknown>) || {};
        const history = Array.isArray(d.history) ? [...(d.history as string[])] : Array(12).fill('');
        const m = new Date().getMonth();
        if (edited.amount) history[m] = String(edited.amount);
        const nextData = {
          ...d,
          history,
          ...(edited.millesimi && !d.millesimi ? { millesimi: String(edited.millesimi) } : {}),
        };
        const { error: cErr } = await supabase.from('bills_settings').upsert(
          { property_id: propertyId, user_id: String(userId), section: 'common', data: nextData, updated_at: new Date().toISOString() },
          { onConflict: 'property_id,section' });
        if (!cErr) done.push('Κοινόχρηστα');
      }

      setSavedInfo(done);
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
    setEdited(null); setSaving(false); setError(''); setSavedInfo([]);
  };

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
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
          {edited?.provider} — {fe(edited?.amount || 0)}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 28 }}>
          {(savedInfo.length ? savedInfo : ['Λογαριασμοί']).map(s => (
            <span key={s} style={{ fontSize: 11, fontWeight: 700, color: 'var(--positive)', background: 'rgba(52,168,83,0.1)', border: '1px solid rgba(52,168,83,0.25)', borderRadius: T.radius.pill, padding: '4px 12px', fontFamily: T.font.sans }}>
              ✓ {s}
            </span>
          ))}
        </div>
        <button onClick={reset}
          style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: T.radius.pill, padding: '10px 28px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: T.font.sans }}>
          Σάρωσε Νέο
        </button>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>
          Σάρωση & Ανάλυση Λογαριασμού
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Φωτογράφισε ή ανέβασε λογαριασμό ΔΕΗ, ΕΥΔΑΠ, COSMOTE — εξαγωγή δεδομένων αυτόματα
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: step === 'review' && image ? '1fr 1fr' : '1fr', gap: 24 }}>

        <div>
          {step === 'upload' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12 }}>

              <div
                onClick={() => cameraRef.current?.click()}
                style={{ border: '1px solid var(--border-default)', borderRadius: T.radius.card, minHeight: 168, cursor: 'pointer', background: 'var(--bg-elevated)', transition: 'all 0.2s', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0 }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'rgba(26,115,232,0.03)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.background = 'var(--bg-elevated)'; }}
              >
                <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12 }}>
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/>
                </svg>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, fontFamily: T.font.sans }}>Φωτογράφισε</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>Κάμερα κινητού · Tablet</div>
              </div>
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && loadImage(e.target.files[0])}/>

              <div
                onClick={() => fileRef.current?.click()}
                style={{ border: '1px solid var(--border-default)', borderRadius: T.radius.card, minHeight: 168, cursor: 'pointer', background: 'var(--bg-elevated)', transition: 'all 0.2s', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0 }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'rgba(26,115,232,0.03)'; }}
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
                <div style={{ marginTop: 12, background: 'rgba(26,115,232,0.06)', border: '1px solid rgba(26,115,232,0.2)', borderRadius: T.radius.inner, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
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

          {error && (() => {
            const tone = error === 'key_missing' ? 'info' : 'warning';
            const title = error === 'unreadable' ? 'Δεν μπόρεσα να διαβάσω καθαρά τον λογαριασμό'
              : error === 'key_missing' ? 'Η αυτόματη ανάγνωση δεν είναι ενεργή ακόμη'
              : error === 'service' ? 'Η υπηρεσία ανάγνωσης δεν είναι διαθέσιμη τώρα'
              : error;
            const tips = error === 'unreadable'
              ? ['Τράβα τη φωτογραφία με καλό φως, χωρίς σκιές και αντανακλάσεις', 'Κράτα το κάδρο ίσιο, να χωράει όλος ο λογαριασμός', 'Αν έχεις το PDF από τον πάροχο, ανέβασέ το — διαβάζεται καλύτερα']
              : error === 'key_missing'
              ? ['Μπορείς να συμπληρώσεις τα πεδία χειροκίνητα παρακάτω και να αποθηκεύσεις κανονικά', 'Για αυτόματη ανάγνωση, χρειάζεται το κλειδί AI στο αρχείο ρυθμίσεων (.env.local)']
              : ['Δοκίμασε ξανά σε λίγο', 'Στο μεταξύ μπορείς να συμπληρώσεις τα πεδία χειροκίνητα'];
            return (
              <div style={{ marginTop: 12, background: `var(--${tone}-soft)`, border: `1px solid var(--${tone}-border)`, borderRadius: T.radius.inner, padding: '12px 16px', fontFamily: T.font.sans }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: `var(--${tone})`, marginBottom: 8 }}>{title}</div>
                <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {tips.map((t, i) => <li key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{t}</li>)}
                </ul>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>Τα πεδία παρακάτω είναι επεξεργάσιμα — δεν χάνεις χρόνο ό,τι κι αν συμβεί.</div>
              </div>
            );
          })()}
        </div>

        {step === 'review' && edited && !scanning && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, fontFamily: T.font.sans }}>Εξαγόμενα Στοιχεία</div>
              <div style={{ fontSize: 10, background: edited.confidence >= 80 ? 'rgba(52,168,83,0.1)' : 'rgba(242,153,0,0.1)', color: edited.confidence >= 80 ? 'var(--positive)' : 'var(--warning)', padding: '2px 10px', borderRadius: T.radius.pill, fontWeight: 700, fontFamily: T.font.sans }}>
                {edited.confidence}% βεβαιότητα
              </div>
            </div>

            {(edited.confidence < 65 || !edited.amount) && (
              <div style={{ background: 'var(--warning-soft)', border: '1px solid var(--warning-border)', borderRadius: T.radius.inner, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--warning)', marginTop: 6, flexShrink: 0 }} />
                <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.55, fontFamily: T.font.sans }}>
                  {!edited.amount
                    ? <>Δεν εντοπίστηκε ποσό. <strong>Έλεγξε και συμπλήρωσε</strong> τα πεδία πριν αποθηκεύσεις.</>
                    : <>Χαμηλή βεβαιότητα ανάγνωσης. <strong>Έλεγξε προσεκτικά</strong> ποσό, ημερομηνία και κατανάλωση πριν αποθηκεύσεις — ίσως χρειάζεται πιο καθαρή φωτογραφία.</>}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 10 }}>
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

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 10 }}>
                <Field label="Ποσό (€)" type="number" value={edited.amount} onChange={v => setEdited(p => ({ ...p!, amount: parseFloat(v) || 0 }))}/>
                <Field label="Ημερομηνία Λήξης" type="date" value={edited.due_date} onChange={v => setEdited(p => ({ ...p!, due_date: v }))}/>
              </div>

              <Field label="Περίοδος" value={edited.period} onChange={v => setEdited(p => ({ ...p!, period: v }))}/>

              {edited.category === 'electricity' && (
                <div style={{ background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.18)', borderRadius: T.radius.inner, padding: 12 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--warning)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 10, fontFamily: T.font.sans }}>Λεπτομέρειες Ρεύματος</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 8 }}>
                    <Field label="Κατανάλωση (kWh)" type="number" value={edited.kwh    || ''} onChange={v => setEdited(p => ({ ...p!, kwh:     parseFloat(v) || undefined }))}/>
                    <Field label="ΕΡΤ (€)"          type="number" value={edited.ert    || ''} onChange={v => setEdited(p => ({ ...p!, ert:     parseFloat(v) || undefined }))}/>
                    <Field label="ΕΤΜΕΑΡ (€)"        type="number" value={edited.etmear || ''} onChange={v => setEdited(p => ({ ...p!, etmear:  parseFloat(v) || undefined }))}/>
                    <Field label="Δημοτικά Τέλη (€)" type="number" value={edited.dimotika || ''} onChange={v => setEdited(p => ({ ...p!, dimotika: parseFloat(v) || undefined }))}/>
                  </div>
                </div>
              )}

              {edited.category === 'water' && (
                <div style={{ background: 'rgba(26,115,232,0.04)', border: '1px solid rgba(26,115,232,0.18)', borderRadius: T.radius.inner, padding: 12 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 10, fontFamily: T.font.sans }}>Λεπτομέρειες Νερού</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 8 }}>
                    <Field label="Κατανάλωση (m³)"     type="number" value={edited.cubic_meters  || ''} onChange={v => setEdited(p => ({ ...p!, cubic_meters:  parseFloat(v) || undefined }))}/>
                    <Field label="Ένδειξη προηγ."       type="number" value={edited.meter_prev    || ''} onChange={v => setEdited(p => ({ ...p!, meter_prev:    parseFloat(v) || undefined }))}/>
                    <Field label="Ένδειξη τρέχουσα"     type="number" value={edited.meter_current || ''} onChange={v => setEdited(p => ({ ...p!, meter_current: parseFloat(v) || undefined }))}/>
                  </div>
                </div>
              )}

              {edited.category === 'gas' && (
                <div style={{ background: 'rgba(242,153,0,0.04)', border: '1px solid rgba(242,153,0,0.18)', borderRadius: T.radius.inner, padding: 12 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--warning)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 10, fontFamily: T.font.sans }}>Λεπτομέρειες Αερίου</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 8 }}>
                    <Field label="Κατανάλωση (m³)"     type="number" value={edited.cubic_meters  || ''} onChange={v => setEdited(p => ({ ...p!, cubic_meters:  parseFloat(v) || undefined }))}/>
                    <Field label="Χρέωση ενέργειας (€)" type="number" value={edited.energy_charge || ''} onChange={v => setEdited(p => ({ ...p!, energy_charge: parseFloat(v) || undefined }))}/>
                    <Field label="Χρεώσεις δικτύου (€)" type="number" value={edited.network_charge || ''} onChange={v => setEdited(p => ({ ...p!, network_charge: parseFloat(v) || undefined }))}/>
                  </div>
                </div>
              )}

              {edited.category === 'common' && (
                <div style={{ background: 'rgba(26,115,232,0.04)', border: '1px solid rgba(26,115,232,0.18)', borderRadius: T.radius.inner, padding: 12 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 10, fontFamily: T.font.sans }}>Λεπτομέρειες Κοινοχρήστων</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 8 }}>
                    <Field label="Χιλιοστά διαμ/τος (‰)" type="number" value={edited.millesimi || ''} onChange={v => setEdited(p => ({ ...p!, millesimi: parseFloat(v) || undefined }))}/>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 8, fontFamily: T.font.sans, lineHeight: 1.5 }}>
                    Το ποσό και τα χιλιοστά θα ενημερώσουν αυτόματα την καρτέλα <strong>Κοινόχρηστα</strong>.
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 10 }}>
                <Field label="ΦΠΑ %" type="number" value={edited.vat_rate || ''} onChange={v => setEdited(p => ({ ...p!, vat_rate: parseFloat(v) || 6 }))}/>
                <Field label="Αριθμός Λογαριασμού" value={edited.account_num || ''} onChange={v => setEdited(p => ({ ...p!, account_num: v }))}/>
              </div>

              {edited.notes && (
                <Field label="Σημειώσεις" value={edited.notes} onChange={v => setEdited(p => ({ ...p!, notes: v }))}/>
              )}

              <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '14px 16px', border: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2, fontFamily: T.font.sans }}>
                    {CATEGORY_LABELS[edited.category] || edited.category}{edited.period ? ` · ${edited.period}` : ''}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)', lineHeight: 1 }}>
                    {fe(edited.amount)}
                  </div>
                </div>
                <button
                  onClick={saveBill}
                  disabled={saving || !edited.amount}
                  style={{ background: edited.amount > 0 ? 'var(--accent)' : 'var(--bg-elevated)', color: edited.amount > 0 ? 'var(--accent-text)' : 'var(--text-tertiary)', border: 'none', borderRadius: T.radius.btn, padding: '12px 24px', fontSize: 13, fontWeight: 700, cursor: edited.amount > 0 ? 'pointer' : 'not-allowed', fontFamily: T.font.sans }}
                >
                  {saving ? 'Αποθήκευση…' : edited.confidence < 65 && edited.amount ? 'Αποθήκευση παρόλα αυτά →' : 'Αποθήκευση →'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}