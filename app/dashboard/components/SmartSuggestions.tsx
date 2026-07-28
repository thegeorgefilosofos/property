'use client';

// ═══════════════════════════════════════════════════════════════════════════
// SmartSuggestions, «Έξυπνες Προτάσεις». Ανάλυση με AI που προτείνει επερχόμενες
// υποχρεώσεις (συντήρηση, φόροι, ανανεώσεις) και τις προσθέτει στο ημερολόγιο.
// Ζει στην αρχική του ακινήτου (Επισκόπηση), όχι στις ρυθμίσεις, όπου είναι το
// φυσικό της σημείο και δεν χάνεται.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Sparkles, Check, Plus, X, RotateCcw, CircleCheckBig } from 'lucide-react';
import { T, fe, EmptyState } from '@/components/Theme';

interface Suggestion {
  title: string;
  category: string;
  amount?: number;
  recurring: boolean;
  recurring_interval?: string;
  priority?: string;
  reason: string;
}

const catLabels: Record<string, string> = {
  financial: 'Οικονομικά', bills: 'Λογαριασμοί', maintenance: 'Συντήρηση',
  contract: 'Συμβόλαιο', tenant: 'Ενοικιαστής', reminder: 'Υπενθύμιση',
};

export default function SmartSuggestions({ userId, propertyId }: { userId: string; propertyId: string }) {
  const supabase = createClient();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingSugg, setLoadingSugg] = useState(false);
  const [addingId, setAddingId] = useState<number | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(new Set());

  async function generateSuggestions() {
    setLoadingSugg(true);
    setSuggestions([]);
    setDismissedIds(new Set());
    try {
      // Send the signed-in user's own access token — the function derives identity
      // from it and verifies the property belongs to them (never trusts a body id).
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('no session');
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/smart-suggestions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ property_id: propertyId }),
        }
      );
      const data = await response.json();
      if (data.suggestions?.length) setSuggestions(data.suggestions);
      else throw new Error('No suggestions');
    } catch {
      // Fallback αν δεν υπάρχει API key ακόμα
      setSuggestions([
        { title: 'Πληρωμή ΕΝΦΙΑ', category: 'financial', amount: 200, recurring: true, recurring_interval: 'annual', priority: 'high', reason: 'Ετήσια υποχρέωση, συνήθως Σεπτέμβριος' },
        { title: 'Ετήσιος έλεγχος ηλεκτρικής εγκατάστασης', category: 'maintenance', recurring: true, recurring_interval: 'annual', priority: 'medium', reason: 'Υποχρεωτικός για ασφάλεια ακινήτου' },
        { title: 'Service κλιματιστικού', category: 'maintenance', amount: 60, recurring: true, recurring_interval: 'annual', priority: 'medium', reason: 'Συνιστάται πριν το καλοκαίρι' },
        { title: 'Ανανέωση ασφαλιστηρίου', category: 'contract', recurring: true, recurring_interval: 'annual', priority: 'high', reason: 'Έλεγχος λήξης ασφάλισης ακινήτου' },
        { title: 'Έλεγχος κεντρικής θέρμανσης', category: 'maintenance', amount: 80, recurring: true, recurring_interval: 'annual', priority: 'medium', reason: 'Συνιστάται πριν τον χειμώνα' },
      ]);
    }
    setLoadingSugg(false);
  }

  async function addSuggestion(s: Suggestion, idx: number) {
    setAddingId(idx);
    const today = new Date();
    const eventDate = new Date(today.getFullYear(), today.getMonth() + 1, 1).toISOString().split('T')[0];
    await supabase.from('calendar_events').insert({
      property_id: propertyId, user_id: userId,
      title: s.title, category: s.category,
      event_date: eventDate, amount: s.amount || null,
      priority: s.priority || 'medium', status: 'pending',
      recurring: s.recurring, recurring_interval: s.recurring_interval || null,
      notes: `Πρόταση: ${s.reason}`, source: 'manual',
    });
    setAddingId(null);
    setDismissedIds(prev => new Set([...prev, idx]));
  }

  const dismiss = (idx: number) => setDismissedIds(prev => new Set([...prev, idx]));
  const visibleSuggestions = suggestions.filter((_, i) => !dismissedIds.has(i));

  return (
    <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-raised)', borderRadius: T.radius.card, padding: 16, boxShadow: 'var(--highlight-inset), var(--elev-1)', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', borderRadius: T.radius.inner, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={15} color="var(--accent)" />
          </div>
          <div>
            <p style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, fontFamily: T.font.sans }}>Έξυπνες Προτάσεις</p>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginTop: 1 }}>Ανάλυση με <span title="Τεχνητή Νοημοσύνη (Artificial Intelligence)">AI</span> βάσει των δεδομένων του ακινήτου</p>
          </div>
        </div>
        <button onClick={generateSuggestions} disabled={loadingSugg} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
          background: loadingSugg ? 'transparent' : 'var(--accent-soft)',
          border: '1px solid var(--accent-border)', borderRadius: 100,
          cursor: loadingSugg ? 'not-allowed' : 'pointer',
          color: 'var(--accent)', fontSize: 12, fontWeight: 600, fontFamily: T.font.sans,
        }}>
          <Sparkles size={12} style={{ animation: loadingSugg ? 'spin 1s linear infinite' : 'none' }} />
          {loadingSugg ? 'Ανάλυση…' : 'Ανάλυση ακινήτου'}
        </button>
      </div>

      {visibleSuggestions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {suggestions.map((s, idx) => {
            if (dismissedIds.has(idx)) return null;
            const label = catLabels[s.category] || s.category;
            const isAdded = addingId === idx;
            return (
              <div key={idx} style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                borderLeft: '3px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: '12px 14px',
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, fontFamily: T.font.sans }}>{s.title}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, fontFamily: T.font.sans, padding: '2px 7px', borderRadius: T.radius.pill, color: 'var(--text-secondary)', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>{label}</span>
                    {s.recurring && (
                      <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: T.font.sans, display: 'flex', alignItems: 'center', gap: 2 }}>
                        <RotateCcw size={9} />{s.recurring_interval === 'annual' ? 'Ετήσιο' : s.recurring_interval === 'monthly' ? 'Μηνιαίο' : 'Τριμηνιαίο'}
                      </span>
                    )}
                    {s.amount && <span style={{ fontSize: 10, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', color: 'var(--accent)' }}>~{fe(s.amount)}</span>}
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>{s.reason}</p>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => addSuggestion(s, idx)} disabled={isAdded} style={{
                    display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px',
                    background: 'var(--accent-soft)', border: '1px solid var(--accent-border)',
                    borderRadius: 100, cursor: 'pointer', color: 'var(--accent)', fontSize: 10, fontWeight: 600,
                    fontFamily: T.font.sans, whiteSpace: 'nowrap',
                  }}>
                    {isAdded ? <Check size={10} /> : <Plus size={10} />}
                    {isAdded ? 'Προστέθηκε' : 'Προσθήκη'}
                  </button>
                  <button onClick={() => dismiss(idx)} style={{ padding: '5px 7px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: T.radius.badge, cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex' }}>
                    <X size={11} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {suggestions.length > 0 && visibleSuggestions.length === 0 && (
        <EmptyState icon={<CircleCheckBig size={20} />} title="Όλες οι προτάσεις διεκπεραιώθηκαν" hint="Τρέξε νέα ανάλυση όταν αλλάξουν δαπάνες, λογαριασμοί ή μίσθωση." />
      )}

      {suggestions.length === 0 && !loadingSugg && (
        <EmptyState icon={<Sparkles size={20} />} title="Καμία πρόταση ακόμη" hint="Πάτα «Ανάλυση ακινήτου» για έξυπνες προτάσεις με βάση τα δεδομένα σου." />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
