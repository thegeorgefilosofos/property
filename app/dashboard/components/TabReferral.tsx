'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  referralCode, referralLink,
  REFEREE_TRIAL_MONTHS, SLOT_REWARD_MONTHS, PAID_REWARD_MONTHS,
  PRO_REFEREE_BONUS_MONTHS, MONTHLY_CAP_AGENCY, MONTHLY_CAP_DEFAULT,
} from '@/lib/referral/referral';

// ═══════════════════════════════════════════════════════════════════════════
// TabReferral — «Προσκάλεσε & Κέρδισε». Persona-gated: ο επαγγελματίας βλέπει
// το Πρόγραμμα Συνεργατών (ιδιαίτερα δελεαστικό, φέρνει πελάτες-ιδιοκτήτες),
// ο ιδιώτης βλέπει το δικό του πρόγραμμα. Τα λεκτικά ανταμοιβής προκύπτουν από
// τη ΜΙΑ πηγή αλήθειας (lib/referral), ώστε να μη διαφέρουν ποτέ από τους
// πραγματικούς κανόνες. Μοντέλο αξίας-για-αξία, χωρίς μετρητά.
// ═══════════════════════════════════════════════════════════════════════════

const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: 'clamp(18px, 2.4vw, 26px)' };
const eyebrow: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-tertiary)' };

function Icon({ d, size = 18, color = 'currentColor' }: { d: string; size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">{d.split('|').map((p, i) => <path key={i} d={p} />)}</svg>;
}

export default function TabReferral({ userId, plan, profileType }: {
  userId: string; plan: string; profileType: 'individual' | 'professional';
}) {
  const [origin, setOrigin] = useState('https://property-os.gr');
  const [copied, setCopied] = useState(false);
  useEffect(() => { try { setOrigin(window.location.origin); } catch { /* SSR */ } }, []);

  const code = useMemo(() => referralCode(userId), [userId]);
  const link = useMemo(() => referralLink(origin, userId), [origin, userId]);
  const isPro = profileType === 'professional';

  const invite = isPro
    ? `Σου στέλνω το Property OS για να έχεις τα οικονομικά του ακινήτου σου οργανωμένα και έτοιμα. Το πρώτο ακίνητο δωρεάν, με ${REFEREE_TRIAL_MONTHS} μήνες δώρο: ${link}`
    : `Οργανώνω το ακίνητό μου με το Property OS: σάρωση λογαριασμών, φορολογία, αποδόσεις, όλα σε ένα. Το πρώτο ακίνητο δωρεάν και ${REFEREE_TRIAL_MONTHS} μήνες δώρο με τον σύνδεσμό μου: ${link}`;

  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ } };
  const nativeShare = async () => { try { await (navigator as Navigator & { share?: (d: { text: string }) => Promise<void> }).share?.({ text: invite }); } catch { /* ignore */ } };

  const shares = [
    { label: 'WhatsApp', href: `https://wa.me/?text=${encodeURIComponent(invite)}`, d: 'M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-4-1L3 20l1-4.5a8.5 8.5 0 0 1-1-4A8.38 8.38 0 0 1 11.5 3 8.5 8.5 0 0 1 21 11.5z' },
    { label: 'Viber', href: `viber://forward?text=${encodeURIComponent(invite)}`, d: 'M12 3a9 9 0 0 0-9 9 8.7 8.7 0 0 0 2 5.6L4 21l3.6-1a9 9 0 1 0 4.4-17z|M9 8c1.5 3 3.5 5 6.5 6' },
    { label: 'Telegram', href: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(invite)}`, d: 'M21 4 3 11l5 2 2 6 3-4 5 4z' },
  ];

  // Ανταμοιβές, από τους πραγματικούς κανόνες (lib/referral).
  const youGet = isPro
    ? `${PAID_REWARD_MONTHS} μήνας Επαγγελματία δωρεάν για κάθε πελάτη που ξεκινά, ${PAID_REWARD_MONTHS + PRO_REFEREE_BONUS_MONTHS} αν φέρεις άλλον επαγγελματία. Έως ${MONTHLY_CAP_AGENCY} τον μήνα.`
    : plan === 'free'
      ? `+1 ακίνητο για ${SLOT_REWARD_MONTHS} μήνα, για κάθε φίλο που ξεκινά. Αν φέρεις επαγγελματία, κερδίζεις έναν μήνα Ιδιοκτήτη δωρεάν. Έως ${MONTHLY_CAP_DEFAULT} τον μήνα.`
      : `${PAID_REWARD_MONTHS} μήνας Ιδιοκτήτη δωρεάν ανά φίλο, ${PAID_REWARD_MONTHS + PRO_REFEREE_BONUS_MONTHS} αν είναι επαγγελματίας. Έως ${MONTHLY_CAP_DEFAULT} τον μήνα.`;
  const friendGets = `${REFEREE_TRIAL_MONTHS} μήνες δυνατοτήτων Ιδιοκτήτη δωρεάν, από την πρώτη μέρα.`;

  return (
    <div style={{ maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Κεφαλίδα, ανά προφίλ */}
      <div>
        <div style={{ ...eyebrow, color: 'var(--accent)', marginBottom: 10 }}>{isPro ? 'Πρόγραμμα Συνεργατών' : 'Προσκάλεσε & Κέρδισε'}</div>
        <h2 style={{ fontSize: 'clamp(22px, 3vw, 28px)', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.15, margin: '0 0 8px', color: 'var(--text-primary)' }}>
          {isPro ? 'Φέρε τους πελάτες σου. Κέρδισε μήνες.' : 'Ξέρεις κι άλλον ιδιοκτήτη;'}
        </h2>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0, maxWidth: 560 }}>
          {isPro
            ? 'Κάθε ιδιοκτήτης-πελάτης που φέρνεις οργανώνεται και σου στέλνει έτοιμα στοιχεία, ενώ εσύ κερδίζεις δωρεάν μήνες. Ιδανικό για λογιστές, μεσίτες και διαχειριστές.'
            : 'Βοήθησέ τον να βάλει το ακίνητό του σε τάξη. Κάθε φίλος που ξεκινά κερδίζει δώρο, και το ίδιο κι εσύ. Ιδιοκτήτες που βοηθούν ιδιοκτήτες.'}
        </p>
      </div>

      {/* Σύνδεσμος πρόσκλησης */}
      <div style={card}>
        <div style={{ ...eyebrow, marginBottom: 12 }}>Ο σύνδεσμός σου</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 220, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '11px 14px' }}>
            <Icon d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1|M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" size={15} color="var(--text-tertiary)" />
            <span style={{ fontSize: 13.5, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: "'Inter',sans-serif" }}>{link}</span>
          </div>
          <button onClick={copy} style={{ padding: '11px 18px', background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            {copied ? 'Αντιγράφηκε ✓' : 'Αντιγραφή'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          {shares.map(s => (
            <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 100, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', textDecoration: 'none' }}>
              <Icon d={s.d} size={15} color="var(--text-secondary)" />{s.label}
            </a>
          ))}
          <button onClick={nativeShare} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 14px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 100, fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}>
            <Icon d="M4 12v8h16v-8|M12 16V4|M8 8l4-4 4 4" size={15} color="var(--text-secondary)" />Κοινοποίηση
          </button>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 12 }}>Κωδικός: <strong style={{ color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>{code}</strong></div>
      </div>

      {/* Τι κερδίζει ο καθένας */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 12 }}>
        <div style={{ ...card, background: 'color-mix(in srgb, var(--accent) 7%, var(--bg-surface))', border: '1px solid color-mix(in srgb, var(--accent) 24%, transparent)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Icon d="M12 2l2.4 7.4H22l-6 4.4 2.3 7.2L12 16.6 5.7 21l2.3-7.2-6-4.4h7.6z" size={16} color="var(--accent)" />
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Εσύ κερδίζεις</div>
          </div>
          <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.55, margin: 0 }}>{youGet}</p>
        </div>
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Icon d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2|M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" size={16} color="var(--text-secondary)" />
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{isPro ? 'Ο πελάτης σου' : 'Ο φίλος σου'} κερδίζει</div>
          </div>
          <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.55, margin: 0 }}>{friendGets}</p>
        </div>
      </div>

      {/* Κατάσταση προσκλήσεων (θα συνδεθεί με τον πίνακα referrals στο επόμενο βήμα) */}
      <div style={card}>
        <div style={{ ...eyebrow, marginBottom: 14 }}>Οι προσκλήσεις σου</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, textAlign: 'center' }}>
          {[['Προσκλήσεις', '0'], ['Ενεργοποιήθηκαν', '0'], ['Ανταμοιβές', '0']].map(([l, v], i) => (
            <div key={i}>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{v}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 6 }}>{l}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)', lineHeight: 1.5, margin: '14px 0 0', textAlign: 'center' }}>
          Μόλις ξεκίνησες. Η ανταμοιβή κλειδώνει όταν ο {isPro ? 'πελάτης' : 'φίλος'} σου προσθέσει ακίνητο και σαρώσει το πρώτο του έγγραφο.
        </p>
      </div>
    </div>
  );
}
