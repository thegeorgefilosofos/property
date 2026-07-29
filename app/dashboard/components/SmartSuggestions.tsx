'use client';

// ═══════════════════════════════════════════════════════════════════════════
// Νόα · Προτάσεις — τι έρχεται σε αυτό το ακίνητο.
// ─────────────────────────────────────────────────────────────────────────
// Διαβάζει τα δεδομένα του ακινήτου και προτείνει επερχόμενες υποχρεώσεις
// (συντήρηση, φόροι, ανανεώσεις), με ένα άγγιγμα στο ημερολόγιο. Ζει στην
// Επισκόπηση, όχι στις ρυθμίσεις: εκεί είναι το φυσικό της σημείο.
//
// ΓΙΑΤΙ ΔΕΝ ΛΕΓΕΤΑΙ ΠΙΑ «ΕΞΥΠΝΕΣ ΠΡΟΤΑΣΕΙΣ»
// Ήταν δεύτερο brand για το ίδιο ακριβώς πράγμα με τη συνομιλία: ίδια δεδομένα,
// ίδια κρίση, άλλο όνομα. Ο χρήστης δεν είχε τρόπο να καταλάβει ότι μιλάει στο
// ίδιο πρόσωπο, οπότε δεν χτιζόταν καμία σχέση. Τώρα η κάρτα λέει ποια μιλάει.
//
// ΤΟ ΥΦΟΣ: μία στήλη, ήρεμη ιεραρχία, τυπογραφία από τα tokens. Καμία έγχρωμη
// κορδέλα, κανένα emoji· η προτεραιότητα φαίνεται από τη σειρά, όχι από χρώμα.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Check, Plus, X, RotateCcw, CircleCheckBig, ListChecks } from 'lucide-react';
import { T, TT, fe, EmptyState } from '@/components/Theme';
import { ASSISTANT_INITIAL, suggestionsTitle, suggestionsSub } from '@/lib/assistant/identity';

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
    <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-raised)', borderRadius: T.radius.card, padding: 18, boxShadow: 'var(--highlight-inset), var(--elev-1)', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
          {/* Το σήμα είναι το αρχικό του ονόματος: ίδιο με το πλωτό κουμπί, ώστε
              ο χρήστης να δει με μια ματιά ότι μιλάει στο ίδιο πρόσωπο. */}
          <div aria-hidden style={{ width: 32, height: 32, flexShrink: 0, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', borderRadius: T.radius.inner, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', fontFamily: T.font.sans, fontWeight: 700, fontSize: 14, letterSpacing: '-0.01em' }}>{ASSISTANT_INITIAL}</div>
          <div style={{ minWidth: 0 }}>
            <p style={{ ...TT.h2, fontSize: 13 }}>{suggestionsTitle()}</p>
            <p style={{ ...TT.caption, marginTop: 2 }}>{suggestionsSub()}</p>
          </div>
        </div>
        <button onClick={generateSuggestions} disabled={loadingSugg} style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          height: T.h.md, padding: '0 16px',
          background: 'transparent',
          border: `1px solid ${loadingSugg ? 'var(--border-subtle)' : 'var(--border-default)'}`,
          borderRadius: T.radius.pill,
          cursor: loadingSugg ? 'default' : 'pointer',
          color: loadingSugg ? 'var(--text-tertiary)' : 'var(--text-primary)',
          fontSize: 12, fontWeight: 600, fontFamily: T.font.sans, whiteSpace: 'nowrap',
          transition: 'background 0.15s, border-color 0.15s',
        }}
          onMouseEnter={e => { if (!loadingSugg) { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent) 45%, transparent)'; } }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = loadingSugg ? 'var(--border-subtle)' : 'var(--border-default)'; }}>
          {loadingSugg ? 'Διαβάζει το ακίνητο…' : 'Δες τι έρχεται'}
        </button>
      </div>

      {/* Μία στήλη, χωρισμένη με γραμμές αντί για κάρτες: πέντε πλαίσια μέσα σε
          πλαίσιο διαβάζονται σαν θόρυβος, πέντε γραμμές σαν λίστα. */}
      {visibleSuggestions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {suggestions.map((s, idx) => {
            if (dismissedIds.has(idx)) return null;
            const label = catLabels[s.category] || s.category;
            const isAdded = addingId === idx;
            const first = visibleSuggestions[0] === s;
            return (
              <div key={idx} style={{
                display: 'flex', alignItems: 'flex-start', gap: 14,
                padding: '14px 2px', borderTop: first ? 'none' : '1px solid var(--border-subtle)',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: T.font.sans, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>{s.title}</span>
                    {s.amount != null && <span style={{ fontFamily: T.font.num, fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', color: 'var(--text-secondary)' }}>~{fe(s.amount)}</span>}
                  </div>
                  <p style={{ ...TT.caption, marginTop: 3, maxWidth: 620 }}>{s.reason}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                    <span style={{ ...TT.label, fontSize: 9, color: 'var(--text-tertiary)' }}>{label}</span>
                    {s.recurring && (
                      <span style={{ ...TT.caption, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <RotateCcw size={10} aria-hidden />{s.recurring_interval === 'annual' ? 'Ετήσιο' : s.recurring_interval === 'monthly' ? 'Μηνιαίο' : 'Τριμηνιαίο'}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => addSuggestion(s, idx)} disabled={isAdded} style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    height: T.h.sm, padding: '0 13px',
                    background: 'transparent', border: `1px solid ${isAdded ? 'var(--border-subtle)' : 'var(--border-default)'}`,
                    borderRadius: T.radius.pill, cursor: isAdded ? 'default' : 'pointer',
                    color: isAdded ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                    fontSize: 12, fontWeight: 600, fontFamily: T.font.sans, whiteSpace: 'nowrap',
                    transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                  }}
                    onMouseEnter={e => { if (!isAdded) { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; } }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = isAdded ? 'var(--text-tertiary)' : 'var(--text-secondary)'; }}>
                    {isAdded ? <Check size={12} aria-hidden /> : <Plus size={12} aria-hidden />}
                    {isAdded ? 'Προστέθηκε' : 'Στο ημερολόγιο'}
                  </button>
                  <button onClick={() => dismiss(idx)} aria-label={`Απόρριψη: ${s.title}`} title="Απόρριψη"
                    style={{ width: T.h.sm, height: T.h.sm, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', borderRadius: '50%', cursor: 'pointer', color: 'var(--text-tertiary)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                    <X size={13} aria-hidden />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {suggestions.length > 0 && visibleSuggestions.length === 0 && (
        <EmptyState icon={<CircleCheckBig size={20} />} title="Όλες οι προτάσεις διεκπεραιώθηκαν" hint="Ζήτα νέα ματιά όταν αλλάξουν δαπάνες, λογαριασμοί ή μίσθωση." />
      )}

      {suggestions.length === 0 && !loadingSugg && (
        <EmptyState icon={<ListChecks size={20} />} title="Καμία πρόταση ακόμη" hint="Πάτα «Δες τι έρχεται» για προτάσεις με βάση τα δικά σου δεδομένα." />
      )}

    </div>
  );
}
