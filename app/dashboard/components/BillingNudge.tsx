'use client';

// ═══════════════════════════════════════════════════════════════════════════
// BillingNudge, διακριτική υπενθύμιση «συμπλήρωσε τα στοιχεία τιμολόγησης».
// Εμφανίζεται ΜΟΝΟ όταν (α) η πληρωμή είναι σχετική (πλάνο επί πληρωμή, ενεργή
// δωρεάν πρόσβαση, ή 2+ ακίνητα που ξεπερνούν το δωρεάν όριο) και (β) λείπουν
// νομικά απαραίτητα πεδία για σωστό παραστατικό. Παραπέμπει στις Ρυθμίσεις ώστε
// η μελλοντική χρέωση να κόψει σωστή απόδειξη ή τιμολόγιο.
//
// Premium/minimal: μία γραμμή, accent τελεία, χωρίς έντονα χρώματα. Κλείνει για
// τον τρέχοντα μήνα (δεν ενοχλεί), επανεμφανίζεται αν παραμένει ελλιπές.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import * as properties from '@/lib/data/properties';
// Το προφίλ χρέωσης έχει ένα σπίτι: lib/data/billing.
import * as billing from '@/lib/data/billing';
import { T, Btn } from '@/components/Theme';
import { missingInvoiceFields, type InvoiceProfile } from '@/lib/billing/invoiceProfile';

const monthKey = () => { const n = new Date(); return `po_billing_nudge_${n.getFullYear()}-${n.getMonth() + 1}`; };

export default function BillingNudge({ userId, onNavigate }: { userId: string; onNavigate?: (tab: string) => void }) {
  const supabase = createClient();
  const [show, setShow] = useState(false);
  const [missingLabels, setMissingLabels] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (typeof window !== 'undefined' && localStorage.getItem(monthKey()) === '1') return;
        const [prof, count] = await Promise.all([
          billing.profile<Record<string, string | null>>(supabase, userId,
            'doc_type, full_name, company_name, afm, doy, profession, address, city, postal_code, country, vat_number, plan, comp_plan, comp_until'),
          properties.count(supabase, userId),
        ]);
        const p = prof || {};
        const plan = p.plan || 'free';
        const compActive = !!p.comp_until && new Date(p.comp_until) > new Date();
        const paymentRelevant = plan === 'owner' || plan === 'agency' || compActive || (count || 0) > 1;
        if (!paymentRelevant) return;

        const invoice: InvoiceProfile = {
          doc_type: p.doc_type || 'receipt', full_name: p.full_name || '', company_name: p.company_name || '',
          afm: p.afm || '', doy: p.doy || '', profession: p.profession || '', address: p.address || '',
          city: p.city || '', postal_code: p.postal_code || '', country: p.country || 'GR',
          vat_number: p.vat_number || '', phone: '',
        };
        const miss = missingInvoiceFields(invoice);
        if (alive && miss.length > 0) { setMissingLabels(miss.map(f => f.label)); setShow(true); }
      } catch { /* σιωπηλά: η υπενθύμιση είναι bonus */ }
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (!show) return null;

  const dismiss = () => { try { localStorage.setItem(monthKey(), '1'); } catch { /* noop */ } setShow(false); };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
      borderRadius: T.radius.card, padding: '12px 16px', marginBottom: 16,
    }}>
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-tertiary)', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.sans }}>
          Ολοκλήρωσε τα στοιχεία τιμολόγησης
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.5, marginTop: 2 }}>
          Ώστε η επόμενη χρέωση να κόψει σωστό παραστατικό. Λείπει: {missingLabels.slice(0, 4).join(', ')}{missingLabels.length > 4 ? '…' : ''}.
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <Btn variant="secondary" onClick={() => onNavigate?.('settings')}>Συμπλήρωσε τα στοιχεία</Btn>
        <button onClick={dismiss} aria-label="Απόκρυψη" style={{ appearance: 'none', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'inline-flex', padding: 6, borderRadius: 8 }}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>
    </div>
  );
}
