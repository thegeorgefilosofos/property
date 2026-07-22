// Generates a self-contained visual preview of every non-email message
// (Viber / WhatsApp / iMessage / push), rendered from the REAL code in
// messaging.ts — so what you see is exactly what would be sent. Output is a
// body-only HTML fragment (the claude.ai Artifact host wraps head/body); it also
// opens fine on its own if you paste a minimal <html><body> around it.
//
//   Run from the repo root:  npx tsx docs/marketing/console/gen-messages-preview.ts
//   → writes docs/marketing/console/messages-preview.html
import { MSG, renderPush, pickChannel, type ChannelMessage } from '../../../supabase/functions/_shared/messaging.ts'
import { policyFor } from '../../../supabase/functions/_shared/emailPolicy.ts'
import type { Personal } from '../../../supabase/functions/_shared/emailTemplates.ts'
import { writeFileSync } from 'node:fs'

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c))

// One rich context so every message renders with real-looking content.
const ctx: Personal = {
  name: 'Ελένη Παπαδοπούλου', appUrl: 'https://propertyos.gr',
  propertyName: 'Διαμέρισμα Κολωνάκι', period: 'Ιούλιος 2026',
  daysOverdue: 7, deadlineDate: '31/07', leaseEndDate: '20/08', policyEndDate: '15/08',
  certificateName: 'Ενεργειακό (ΠΕΑ)', certificateEndDate: '30/09',
  appointmentTitle: 'Επίσκεψη υδραυλικού', appointmentDate: 'Τρ 23/07', appointmentTime: '18:00',
  maintenanceTitle: 'Συντήρηση καυστήρα', maintenanceDate: '24/07',
  guestName: 'John Smith', friendName: 'Νίκος', location: 'Αθήνα',
  digestItems: [{ title: 'Δόση φόρου' }, { title: 'ΕΝΦΙΑ' }, { title: 'Λήξη ασφάλειας' }],
  tenantGender: 'female', rewardLabel: '1 μήνας δώρο',
}

const GROUPS: Array<{ id: string; label: string; blurb: string; keys: string[] }> = [
  { id: 'tx', label: 'Συναλλακτικά', blurb: 'Άμεσα, χωρίς ποσά ή ονόματα στην οθόνη κλειδώματος.',
    keys: ['subscription_receipt', 'payment_failed', 'security_login', 'tenant_rent_receipt', 'payout_received', 'maintenance_completed'] },
  { id: 'ob', label: 'Υποχρεώσεις & προθεσμίες', blurb: 'Ό,τι λήγει ή θέλει δράση. Συγχωνεύονται σε digest όταν πέφτουν μαζί.',
    keys: ['dunning_1', 'dunning_2', 'dunning_final', 'tax_installment', 'lease_ending', 'insurance_expiring', 'certificate_expiring', 'card_expiring', 'appointment_reminder', 'maintenance_scheduled', 'lease_declaration_reminder', 'str_registration_reminder', 'str_stay_tax', 'data_retention_notice'] },
  { id: 'str', label: 'Βραχυχρόνια μίσθωση', blurb: 'Το πρόγραμμα της ημέρας: αφίξεις, αναχωρήσεις, καθαρισμοί.',
    keys: ['checkin_today', 'checkout_today', 'cleaning_scheduled'] },
  { id: 'dg', label: 'Ενοποιημένα (digests)', blurb: 'Πολλά θέματα μιας μέρας σε ΕΝΑ μήνυμα, αντί για βομβαρδισμό.',
    keys: ['digest_obligations', 'digest_tax', 'digest_str_today'] },
  { id: 'lc', label: 'Ευκαιρία & ενημέρωση', blurb: 'Υπάρχει σύντομη εκδοχή, αλλά μένουν στο email εκτός αν είναι συναλλακτικά.',
    keys: ['limit_reached', 'rate_alert', 'monthly_statement', 'referral_friend_activated'] },
]

const CATLABEL: Record<string, string> = {
  transactional: 'Συναλλακτικό', obligation: 'Υποχρέωση', opportunity: 'Ευκαιρία', lifecycle: 'Ενημέρωση', soft: 'Ήπιο',
}
const URL = 'https://propertyos.gr/dashboard'

function pushBanner(m: ChannelMessage) {
  const p = renderPush(m)
  return `<div class="dev push"><div class="ico">P</div><div class="pmeta"><div class="prow"><span class="pname">Property OS</span><span class="ptime">τώρα</span></div><div class="ptitle">${esc(p.title)}</div><div class="pbody">${esc(p.body)}</div></div></div>`
}
function bubble(kind: 'viber' | 'wa' | 'im', m: ChannelMessage) {
  const cta = m.cta ? `<a class="lnk ${kind}lnk" href="${URL}" target="_blank" rel="noreferrer">${esc(m.cta)} →</a>` : ''
  if (kind === 'wa') return `<div class="dev bub wa"><div class="bhead"><span class="watag">WhatsApp Business</span></div><div class="btitle"><b>${esc(m.title)}</b></div><div class="bbody">${esc(m.body)}</div>${cta}<div class="btime">10:24 ✓✓</div></div>`
  if (kind === 'viber') return `<div class="dev bub viber"><div class="btitle">${esc(m.title)}</div><div class="bbody">${esc(m.body)}</div>${cta}<div class="btime">10:24</div></div>`
  return `<div class="dev bub im"><div class="btitle">${esc(m.title)}</div><div class="bbody">${esc(m.body)}</div><a class="preview" href="${URL}" target="_blank" rel="noreferrer"><span class="pv-ico">P</span><span class="pv-tx"><b>${m.cta ? esc(m.cta) : 'Άνοιξε τον πίνακά σου'}</b><small>propertyos.gr</small></span></a></div>`
}

let cards = 0
const sections = GROUPS.map(g => {
  const items = g.keys.filter(k => MSG[k]).map(k => {
    const m = MSG[k](ctx)
    const pol = policyFor(k)
    const eligible = pol.category === 'transactional' || pol.category === 'obligation'
    if (eligible) pickChannel(k, { viber: true }) // sanity: routing resolves
    cards++
    const routeBadge = eligible ? `<span class="badge ok">Τηλέφωνο, αν επιλεγεί</span>` : `<span class="badge mut">Μένει στο email</span>`
    return `<article class="card"><header class="chead"><div class="chl"><code class="cid">${esc(k)}</code><span class="badge cat">${esc(CATLABEL[pol.category] || pol.category)}</span></div>${routeBadge}</header><div class="devs"><div class="col"><span class="clab push-l">Push</span>${pushBanner(m)}</div><div class="col"><span class="clab viber-l">Viber</span>${bubble('viber', m)}</div><div class="col"><span class="clab wa-l">WhatsApp</span>${bubble('wa', m)}</div><div class="col"><span class="clab im-l">iMessage</span>${bubble('im', m)}</div></div></article>`
  }).join('\n')
  return `<section class="grp"><div class="ghead"><h2>${esc(g.label)}</h2><p>${esc(g.blurb)}</p></div><div class="cards">${items}</div></section>`
}).join('\n')

const CSS = `<style>
:root{--accent:#1a73e8;--accent-weak:#e8f0fe;--ink:#15171a;--mute:#5b6169;--faint:#8a9099;--bg:#eef0f2;--card:#fff;--card2:#f7f8fa;--line:#e4e7eb;--chip:#eef1f4;--viber:#7360f2;--wa:#1eb257;--im:#0a84ff;--ok:#188038;--ok-weak:#e6f4ea;--r:14px;--mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;--font:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
@media (prefers-color-scheme:dark){:root{--ink:#e7e9ec;--mute:#9aa0a8;--faint:#6b7178;--bg:#0d0f12;--card:#171a1f;--card2:#1e2228;--line:#262b31;--chip:#20242b;--accent-weak:#182640;--ok:#5bb974;--ok-weak:#15281b}}
:root[data-theme="dark"]{--ink:#e7e9ec;--mute:#9aa0a8;--faint:#6b7178;--bg:#0d0f12;--card:#171a1f;--card2:#1e2228;--line:#262b31;--chip:#20242b;--accent-weak:#182640;--ok:#5bb974;--ok-weak:#15281b}
:root[data-theme="light"]{--ink:#15171a;--mute:#5b6169;--faint:#8a9099;--bg:#eef0f2;--card:#fff;--card2:#f7f8fa;--line:#e4e7eb;--chip:#eef1f4;--accent-weak:#e8f0fe;--ok:#188038;--ok-weak:#e6f4ea}
*{box-sizing:border-box}body{margin:0}
.wrap{font-family:var(--font);background:var(--bg);color:var(--ink);min-height:100vh;padding:40px 20px 72px;-webkit-font-smoothing:antialiased}
.inner{max-width:1120px;margin:0 auto}
.top{display:flex;align-items:center;gap:14px;margin-bottom:8px}
.logo{width:38px;height:38px;border-radius:10px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:19px}
.brand{font-size:19px;font-weight:750;letter-spacing:-.02em}
.count{margin-left:auto;font-size:12px;color:var(--mute);border:1px solid var(--line);border-radius:100px;padding:5px 12px;font-variant-numeric:tabular-nums}
.lede{font-size:14.5px;color:var(--mute);line-height:1.6;max-width:62ch;margin:6px 0 20px}.lede b{color:var(--ink);font-weight:650}
.legend{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;padding:14px 16px;background:var(--card);border:1px solid var(--line);border-radius:var(--r);margin-bottom:30px}
.legend .li{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--mute)}.dot{width:9px;height:9px;border-radius:50%}
.grp{margin:34px 0}.ghead{margin:0 0 14px}
.ghead h2{margin:0;font-size:12px;font-weight:750;letter-spacing:.09em;text-transform:uppercase;color:var(--accent)}
.ghead p{margin:5px 0 0;font-size:13px;color:var(--mute);line-height:1.55;max-width:70ch}
.cards{display:grid;gap:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:16px 16px 18px}
.chead{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--line)}
.chl{display:flex;align-items:center;gap:10px;min-width:0}
.cid{font-family:var(--mono);font-size:12px;color:var(--ink);background:var(--chip);padding:3px 8px;border-radius:6px;white-space:nowrap}
.badge{font-size:10.5px;font-weight:650;letter-spacing:.02em;padding:3px 9px;border-radius:100px;white-space:nowrap}
.badge.cat{background:var(--accent-weak);color:var(--accent)}.badge.ok{background:var(--ok-weak);color:var(--ok)}.badge.mut{background:var(--chip);color:var(--faint)}
.devs{display:grid;grid-template-columns:repeat(auto-fit,minmax(224px,1fr));gap:14px}
.col{display:flex;flex-direction:column;gap:8px}
.clab{font-size:10px;font-weight:750;letter-spacing:.1em;text-transform:uppercase}
.push-l{color:var(--faint)}.viber-l{color:var(--viber)}.wa-l{color:var(--wa)}.im-l{color:var(--im)}
.dev{font-size:13px;line-height:1.42}
.push{display:flex;gap:10px;background:var(--card2);border:1px solid var(--line);border-radius:16px;padding:10px 11px;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.ico{flex:none;width:26px;height:26px;border-radius:7px;background:var(--accent);color:#fff;font-weight:800;font-size:14px;display:flex;align-items:center;justify-content:center}
.pmeta{min-width:0;flex:1}.prow{display:flex;justify-content:space-between;align-items:center;gap:8px}
.pname{font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--faint)}.ptime{font-size:10px;color:var(--faint)}
.ptitle{font-weight:700;font-size:13px;margin-top:2px;color:var(--ink)}.pbody{font-size:12.5px;color:var(--mute);margin-top:1px}
.bub{position:relative;border-radius:15px;padding:10px 12px 8px;max-width:100%}
.bub.viber{background:color-mix(in srgb,var(--viber) 9%,var(--card));border:1px solid color-mix(in srgb,var(--viber) 26%,var(--line))}
.bub.wa{background:color-mix(in srgb,var(--wa) 9%,var(--card));border:1px solid color-mix(in srgb,var(--wa) 26%,var(--line))}
.bub.im{background:var(--chip);border:1px solid var(--line)}
.bhead{margin-bottom:3px}.watag{font-size:9.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--wa)}
.btitle{font-weight:700;font-size:13px;color:var(--ink)}.bbody{font-size:12.5px;color:var(--mute);margin-top:2px}
.btime{font-size:10px;color:var(--faint);text-align:right;margin-top:5px;font-variant-numeric:tabular-nums}
.lnk{display:inline-block;margin-top:8px;font-size:12px;font-weight:650;text-decoration:none;padding:5px 11px;border-radius:100px}
.viberlnk{background:var(--viber);color:#fff}.walnk{color:var(--wa);padding-left:0}.imlnk{color:var(--im);padding-left:0}
.preview{display:flex;align-items:center;gap:10px;margin-top:8px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px 10px;text-decoration:none}
.pv-ico{flex:none;width:30px;height:30px;border-radius:7px;background:var(--accent);color:#fff;font-weight:800;font-size:15px;display:flex;align-items:center;justify-content:center}
.pv-tx{display:flex;flex-direction:column;min-width:0}.pv-tx b{font-size:12px;color:var(--ink);font-weight:650}.pv-tx small{font-size:11px;color:var(--faint)}
.foot{margin-top:40px;padding-top:18px;border-top:1px solid var(--line);font-size:12px;color:var(--faint);line-height:1.7}.foot b{color:var(--mute);font-weight:650}
@media (max-width:560px){.wrap{padding:26px 14px 56px}}
</style>`

const html = `${CSS}
<div class="wrap"><div class="inner">
  <div class="top"><div class="logo">P</div><div class="brand">Property OS</div><div class="count">${cards} μηνύματα · 4 κανάλια</div></div>
  <p class="lede">Ό,τι λέει το app <b>εκτός email</b>: σύντομες, glanceable εκδοχές για Viber, WhatsApp, iMessage και push. Ο κανόνας που τα κρατά μη-spam: <b>ένα μήνυμα, ένα κανάλι</b>, και τα ημερήσια όρια μετρούν όλα τα κανάλια μαζί. Ποτέ <b>ποσό ή όνομα</b> στην οθόνη κλειδώματος.</p>
  <div class="legend">
    <span class="li"><span class="dot" style="background:var(--viber)"></span>Viber</span>
    <span class="li"><span class="dot" style="background:var(--wa)"></span>WhatsApp Business</span>
    <span class="li"><span class="dot" style="background:var(--im)"></span>iMessage</span>
    <span class="li"><span class="dot" style="background:var(--faint)"></span>Push</span>
    <span class="li" style="margin-left:auto"><span class="badge ok" style="padding:2px 8px">Τηλέφωνο, αν επιλεγεί</span>= glanceable</span>
  </div>
  ${sections}
  <p class="foot"><b>Πηγή:</b> αποδίδονται απευθείας από τον κώδικα (<code>supabase/functions/_shared/messaging.ts</code>). <b>Δρομολόγηση:</b> με opt-in σε ένα κανάλι, το <code>pickChannel</code> επιλέγει ΕΝΑ (Viber → WhatsApp → iMessage → push). Χωρίς opt-in ή για μη-glanceable, όλα πάνε email. <b>Go-live:</b> χρειάζονται κλειδιά παρόχων (VIBER_TOKEN, WHATSAPP_TOKEN/PHONE_ID, IMESSAGE_API_URL/TOKEN, FCM). Μέχρι τότε, όλα φεύγουν ως email.</p>
</div></div>`

// Run from the repo root (see header): writes next to this script.
writeFileSync('docs/marketing/console/messages-preview.html', html)
console.log('wrote docs/marketing/console/messages-preview.html ·', cards, 'cards')
