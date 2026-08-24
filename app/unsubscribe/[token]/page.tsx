'use client';

// ═══════════════════════════════════════════════════════════════════════════
// /unsubscribe/<token> — δημόσια, ένα-κλικ απεγγραφή από τα ενημερωτικά emails
// (GDPR). Δείχνει τι λαμβάνει ο χρήστης και του επιτρέπει να απεγγραφεί από τα
// προϊοντικά νέα, τα δεδομένα αγοράς, ή όλα. Χωρίς login.
// ═══════════════════════════════════════════════════════════════════════════
import BrandMark from '@/components/BrandMark';
import { T } from '@/components/tokens';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function Unsubscribe() {
  const token = String(useParams()?.token || '');
  const supabase = createClient();
  const [state, setState] = useState<'loading' | 'ok' | 'notfound'>('loading');
  const [product, setProduct] = useState(true);
  const [market, setMarket] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc('marketing_prefs_by_token', { p_token: token });
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row) { setState('notfound'); return; }
      setProduct(row.product_news); setMarket(row.market_news); setState('ok');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const unsubscribe = async (kind: 'product' | 'market' | 'all') => {
    setBusy(true);
    const { data } = await supabase.rpc('unsubscribe_email', { p_token: token, p_kind: kind });
    setBusy(false);
    if (data) {
      if (kind === 'product' || kind === 'all') setProduct(false);
      if (kind === 'market' || kind === 'all') setMarket(false);
      setDone(kind === 'all' ? 'Απεγγράφηκες από όλα τα ενημερωτικά emails.'
        : kind === 'product' ? 'Απεγγράφηκες από τα προϊοντικά νέα.' : 'Απεγγράφηκες από τα δεδομένα αγοράς.');
    }
  };

  const wrap: React.CSSProperties = { minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'Inter, system-ui, Arial, sans-serif', color: 'var(--text-primary)' };
  const card: React.CSSProperties = { width: '100%', maxWidth: 440, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '30px 28px', boxShadow: 'var(--elev-1)' };
  const btn = (danger?: boolean): React.CSSProperties => ({ width: '100%', height: 42, borderRadius: 10, border: '1px solid ' + (danger ? 'var(--border-default)' : 'var(--accent)'), background: danger ? 'var(--bg-surface)' : 'var(--accent)', color: danger ? 'var(--text-primary)' : 'var(--accent-text)', fontSize: 14, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: busy ? 0.6 : 1 });

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, paddingBottom: 18, borderBottom: '1px solid var(--border-subtle)' }}>
          <BrandMark size={34} />
          {/* Ο τίτλος της σελίδας είναι η δεύτερη γραμμή· το «PROPERWISE» είναι
              σήμα. Χωρίς `h1` η σελίδα ανακοινωνόταν ανώνυμη. */}
          <div><div style={{ fontSize: 15, fontWeight: 700 }}>PROPERWISE</div><h1 style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 400, margin: 0 }}>Προτιμήσεις ενημερωτικών emails</h1></div>
        </div>

        {state === 'loading' && <div style={{ padding: '34px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>Φόρτωση…</div>}
        {state === 'notfound' && <p style={{ paddingTop: 22, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>Ο σύνδεσμος δεν είναι έγκυρος ή έχει λήξει. Μπορείς να διαχειριστείς τις προτιμήσεις σου από τις Ρυθμίσεις μέσα στην εφαρμογή.</p>}

        {state === 'ok' && (
          <div style={{ paddingTop: 20 }}>
            {done
              ? <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--positive-soft)', border: '1px solid var(--positive-border)', borderRadius: 10, padding: '11px 14px', marginBottom: 18 }}><span style={{ color: 'var(--positive)', fontWeight: 700 }}>✓</span><span style={{ fontSize: 13, fontWeight: 600, color: 'var(--positive)' }}>{done}</span></div>
              : <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 18 }}>Διάλεξε από τι θέλεις να απεγγραφείς. Τα λειτουργικά emails (υπενθυμίσεις, καταστάσεις) δεν επηρεάζονται.</p>}
            <div style={{ display: 'grid', gap: 10 }}>
              {product && <button style={btn(true)} disabled={busy} onClick={() => unsubscribe('product')}>Απεγγραφή από προϊοντικά νέα</button>}
              {market && <button style={btn(true)} disabled={busy} onClick={() => unsubscribe('market')}>Απεγγραφή από δεδομένα αγοράς</button>}
              {(product || market) && <button style={btn(false)} disabled={busy} onClick={() => unsubscribe('all')}>Απεγγραφή από όλα</button>}
              {!product && !market && <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Έχεις απεγγραφεί από όλα τα ενημερωτικά emails.</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
