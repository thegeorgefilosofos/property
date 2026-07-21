import * as C from '../../../supabase/functions/_shared/emailCopy.ts'
import { type Personal, type CopyFn } from '../../../supabase/functions/_shared/emailTemplates.ts'
import { policyFor, SLOT_TIME } from '../../../supabase/functions/_shared/emailPolicy.ts'
import { writeFileSync } from 'node:fs'

const PRIO_LABEL: Record<number, string> = { 1: 'Συναλλακτικό', 2: 'Υποχρέωση', 3: 'Ευκαιρία', 4: 'Ενημέρωση', 5: 'Προαιρετικό' }
const WINDOW_LABEL = (slot: string): string => {
  if (slot === 'immediate') return 'Άμεσα με το συμβάν'
  const t = (SLOT_TIME as Record<string, string>)[slot]
  const name: Record<string, string> = { morning: 'Πρωί', midday: 'Μεσημέρι', evening: 'Απόγευμα', late: 'Βράδυ' }
  return `${name[slot] || ''} (~${t})`
}

const ctx: Personal = {
  name: 'Μαρία Παπαδοπούλου', appUrl: 'https://propertyos.gr', unsubUrl: 'x',
  plan: 'professional', properties: 3, propertyName: 'Διαμέρισμα Κολωνάκι', period: 'Ιούλιος 2026',
  collected: 4200, expected: 5000, outstanding: 800, net: 3100, amount: 650, tenantName: 'Γιώργος',
  daysOverdue: 12, deadlineDate: '31/08', portfolioValue: 480000, occupancy: 82, days: 14,
  assistantName: 'Νόα', discountPct: 40, trialDaysLeft: 3, invoiceAmount: 19.9, invoiceNumber: 'PO-2026-0042',
  referralCode: 'MARIA-2026', rewardLabel: 'έναν μήνα δωρεάν', friendName: 'Ελένη',
  device: 'Chrome σε Windows', location: 'Αθήνα', headline: 'Νέος συντελεστής στις βραχυχρόνιες',
  summaryText: 'Πιο γρήγορη αναζήτηση, νέο φίλτρο ανά ακίνητο και εξυπνότερος βοηθός.',
  leaseEndDate: '30/09', insurerName: 'Interlife', policyEndDate: '15/08',
  certificateName: 'ΠΕΑ', certificateEndDate: '01/10', appointmentTitle: 'Επίσκεψη ακινήτου',
  appointmentDate: '25/07', appointmentTime: '18:00', maintenanceTitle: 'Συντήρηση καυστήρα',
  maintenanceDate: '28/07', contractorName: 'Τεχνική ΑΕ', billType: 'Ρεύμα', billDueDate: '20/07',
  guestName: 'John Smith', checkinDate: '22/07', checkoutDate: '26/07', cleaningDate: '26/07',
  gapNights: 3, gapFrom: '01/08', gapTo: '04/08', reviewsCount: 18, rating: 4.9,
  featureName: 'Αυτόματη αντιστοίχιση τραπέζης', featureBenefit: 'Ανέβασε την κίνηση και το Property OS τη διαβάζει και την αντιστοιχίζει μόνη της.',
  assistantSkill: 'υπολογισμός απόδοσης ανά ακίνητο', anniversaryYears: 2, hoursSaved: 6,
  cardLast4: '4242', marketRent: 720, sharePct: 50,
}

const clean = (s: string) => s.replace(/<(?!\/?b\b)[^>]*>/g, '').trim()

function parse(html: string): { preheader: string; blocks: any[] } {
  const pre = (html.match(/display:none;max-height:0;overflow:hidden;opacity:0;">([\s\S]*?)<\/div>/) || [])[1] || ''
  let card = (html.match(/padding:26px 26px 28px;">([\s\S]*?)<\/div>\s*<p style="text-align:center/) || [])[1] || ''
  const blocks: any[] = []
  const hm = card.match(/<table[^>]*>[\s\S]*?font-size:40px[^"]*">([\s\S]*?)<\/div>\s*<div style="[^"]*">([\s\S]*?)<\/div>[\s\S]*?<\/table>/)
  if (hm) { blocks.push({ t: 'hero', value: clean(hm[1]), label: clean(hm[2]) }); card = card.replace(hm[0], '') }
  const re = /<h1[^>]*>([\s\S]*?)<\/h1>|<table[\s\S]*?<\/table>|<div style="text-align:center[\s\S]*?<a [^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/div>|<p style="([^"]*)">([\s\S]*?)<\/p>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(card))) {
    const whole = m[0]
    if (m[1] !== undefined) blocks.push({ t: 'h', html: clean(m[1]) })
    else if (whole.startsWith('<table')) {
      const items = [...whole.matchAll(/padding:3px 0;">([\s\S]*?)<\/td>/g)].map(x => clean(x[1]))
      blocks.push({ t: 'ul', items })
    }
    else if (m[2] !== undefined) blocks.push({ t: 'btn', label: clean(m[2]).replace(/\s*→\s*$/, '') })
    else if (m[3] !== undefined) {
      const style = m[3], h = clean(m[4])
      if (style.includes('text-transform:uppercase')) blocks.push({ t: 'eyebrow', html: h })
      else if (style.includes('color:#5f6368')) blocks.push({ t: 'note', html: h })
      else blocks.push({ t: 'p', html: h })
    }
  }
  return { preheader: clean(pre), blocks }
}

type Plan = 'free' | 'individual' | 'professional'
const A: Plan[] = ['free', 'individual', 'professional']
const IP: Plan[] = ['individual', 'professional']
const FI: Plan[] = ['free', 'individual']
type Prog = { id: string; title: string; subtitle: string; plans: Plan[]; trigger: string; cadence: string; goal: string; rec: Record<string, CopyFn> }
const PROGRAMS: Prog[] = [
  { id: 'onboarding', title: 'Onboarding', subtitle: 'Ενεργοποίηση νέων χρηστών', plans: A, trigger: 'Εγγραφή & πρώτες μέρες', cadence: 'Ροή', goal: 'Ενεργοποίηση', rec: C.ONBOARDING },
  { id: 'engagement', title: 'Engagement', subtitle: 'Διατήρηση & συνήθεια', plans: A, trigger: 'Περιοδικό & συμβάντα', cadence: 'Μηνιαίο / Εβδομαδιαίο', goal: 'Διατήρηση', rec: C.ENGAGEMENT },
  { id: 'upsell', title: 'Upsell', subtitle: 'Μετατροπή σε συνδρομή', plans: FI, trigger: 'Χρήση & όρια', cadence: 'Κατά συμβάν', goal: 'Μετατροπή', rec: C.UPSELL },
  { id: 'seasonal', title: 'Εποχικά', subtitle: 'Αιχμές πωλήσεων', plans: FI, trigger: 'Ημερολόγιο', cadence: 'Εποχικό', goal: 'Μετατροπή', rec: C.SEASONAL },
  { id: 'referral', title: 'Συστάσεις', subtitle: 'Ανάπτυξη (viral)', plans: IP, trigger: 'Ενεργός χρήστης', cadence: 'Κατά συμβάν', goal: 'Ανάπτυξη', rec: C.REFERRAL },
  { id: 'lifecycle', title: 'Lifecycle', subtitle: 'Νομικά & συναλλαγές', plans: A, trigger: 'Συμβάν λογαριασμού', cadence: 'Κατά συμβάν', goal: 'Εμπιστοσύνη', rec: C.LIFECYCLE },
  { id: 'winback', title: 'Win-back', subtitle: 'Επιστροφή χαμένων', plans: A, trigger: 'Αδράνεια 30/60/90', cadence: 'Ροή', goal: 'Επιστροφή', rec: C.WINBACK },
  { id: 'operations', title: 'Λειτουργικά', subtitle: 'Αξία καθημερινότητας', plans: IP, trigger: 'Δεδομένα ακινήτου', cadence: 'Κατά συμβάν', goal: 'Αξία', rec: C.OPERATIONS },
  { id: 'shortterm', title: 'Βραχυχρόνια', subtitle: 'STR hosts', plans: IP, trigger: 'Κρατήσεις & σεζόν', cadence: 'Κατά συμβάν', goal: 'Αξία', rec: C.SHORTTERM },
  { id: 'product', title: 'Προϊόν & Εξέλιξη', subtitle: 'Αφοσίωση', plans: A, trigger: 'Κυκλοφορίες & ορόσημα', cadence: 'Περιοδικό', goal: 'Αφοσίωση', rec: C.PRODUCT },
  { id: 'conversion', title: 'Μετατροπή', subtitle: 'Αξία με απόδειξη', plans: FI, trigger: 'Ενεργός δωρεάν', cadence: 'Κατά συμβάν', goal: 'Μετατροπή', rec: C.CONVERSION },
  { id: 'compliance', title: 'Συμμόρφωση', subtitle: 'Ελληνικές υποχρεώσεις', plans: IP, trigger: 'Υποχρέωση & προθεσμία', cadence: 'Κατά συμβάν', goal: 'Συμμόρφωση', rec: C.COMPLIANCE },
  { id: 'billing', title: 'Συνδρομή', subtitle: 'Έσοδα χωρίς διαρροές', plans: IP, trigger: 'Κατάσταση συνδρομής', cadence: 'Κατά συμβάν', goal: 'Έσοδα', rec: C.BILLING },
  { id: 'relationship', title: 'Σχέσεις', subtitle: 'Ενοικιαστές & συνιδιοκτήτες', plans: IP, trigger: 'Ενοικιαστής / συνιδιοκτήτης', cadence: 'Κατά συμβάν', goal: 'Σχέση', rec: C.RELATIONSHIP },
  { id: 'value', title: 'Αξία & Εξοικονόμηση', subtitle: 'Χρήματα στην τσέπη', plans: A, trigger: 'Ευκαιρία αξίας', cadence: 'Κατά συμβάν', goal: 'Αξία', rec: C.VALUE },
]
const PLAN_OVERRIDE: Record<string, Plan[]> = {
  welcome_free: ['free'], welcome_individual: ['individual'], welcome_professional: ['professional'],
  upsell_to_individual: ['free'], upsell_to_professional: ['individual'],
  trial_started: FI, trial_ending: FI, limit_reached: ['free'], value_left: ['free'],
  free_month_upgrade: ['free'],
}
const TIMING: Record<string, string> = {
  onboarding: 'Ημέρες 0 έως 14', engagement: '1η του μήνα / εβδομαδιαία', upsell: 'Με το συμβάν (όριο/δοκιμή)',
  seasonal: 'Ημερολόγιο καμπανιών', referral: 'Με ενέργεια σύστασης', lifecycle: 'Άμεσα με το συμβάν',
  winback: 'Ημέρες 30 / 60 / 90', operations: 'Πριν τη λήξη ή ημερομηνία', shortterm: 'Ημέρα άφιξης/αναχώρησης',
  product: 'Με την κυκλοφορία', conversion: 'Όταν υπάρχει αποδεδειγμένη αξία', compliance: 'Πριν την προθεσμία',
  billing: 'Πριν και μετά τη χρέωση', relationship: 'Με το συμβάν', value: 'Όταν εντοπίζεται ευκαιρία',
}
// Ακριβής χρόνος αποστολής ανά email (fallback στο TIMING του προγράμματος).
const SCHEDULE: Record<string, string> = {
  welcome_free: 'Αμέσως με τη δημιουργία λογαριασμού', welcome_individual: 'Αμέσως με την ενεργοποίηση Ιδιώτη',
  welcome_professional: 'Αμέσως με την ενεργοποίηση Επαγγελματία', verify_email: 'Αμέσως με την εγγραφή (T+0)',
  add_first_property: 'Ημέρα 1, αν δεν υπάρχει ακίνητο', first_property_success: 'Αμέσως με την προσθήκη ακινήτου',
  connect_bank: 'Ημέρα 3', connect_calendar: 'Ημέρα 4 (STR)', tip_assistant: 'Ημέρα 5', voice_entry: 'Ημέρα 6',
  tip_reports: 'Ημέρα 7', feedback_week1: 'Ημέρα 8', recap_week2: 'Ημέρα 14',
  monthly_statement: '1η του μήνα, 08:00', market_digest: 'Κάθε Δευτέρα, 09:00', quarterly_review: '1η του τριμήνου',
  year_end: '15 Δεκεμβρίου', rent_pending: '3 ημέρες μετά τη λήξη προθεσμίας', dunning_1: '+1 ημέρα καθυστέρησης',
  dunning_2: '+7 ημέρες καθυστέρησης', dunning_final: '+15 ημέρες καθυστέρησης',
  trial_started: 'Αμέσως με την έναρξη δοκιμής', trial_ending: '2 ημέρες πριν τη λήξη δοκιμής',
  inactive_30: '30 ημέρες αδράνειας', inactive_60: '60 ημέρες αδράνειας', data_retention_notice: '90 ημέρες αδράνειας',
  lease_ending: '30 ημέρες πριν τη λήξη μίσθωσης', insurance_expiring: '30 ημέρες πριν τη λήξη ασφαλιστηρίου',
  certificate_expiring: '30 ημέρες πριν τη λήξη πιστοποιητικού', card_expiring: '14 ημέρες πριν τη λήξη κάρτας',
  anniversary: 'Επέτειος εγγραφής', reply_ack: 'Άμεσα με την απάντηση του χρήστη',
  feedback_lottery: '1η του μήνα, αν λείπει feedback', free_month_upgrade: '1η του μήνα (δωρεάν χρήστες)',
}
const GROUP: Record<string, string> = {
  onboarding: 'Υποδοχή',
  engagement: 'Αφοσίωση', product: 'Αφοσίωση', winback: 'Αφοσίωση',
  upsell: 'Ανάπτυξη', seasonal: 'Ανάπτυξη', conversion: 'Ανάπτυξη', referral: 'Ανάπτυξη',
  operations: 'Καθημερινότητα', shortterm: 'Καθημερινότητα', value: 'Καθημερινότητα',
  lifecycle: 'Εμπιστοσύνη', billing: 'Εμπιστοσύνη', compliance: 'Εμπιστοσύνη', relationship: 'Εμπιστοσύνη',
}
const GROUP_ORDER = ['Υποδοχή', 'Αφοσίωση', 'Ανάπτυξη', 'Καθημερινότητα', 'Εμπιστοσύνη']

let total = 0
const programs = PROGRAMS.map(pr => {
  const emails = Object.keys(pr.rec).map(key => {
    const o = pr.rec[key](ctx)
    total++
    const { preheader, blocks } = parse(o.html)
    const pol = policyFor(key)
    return { key, subject: o.subject, preheader, blocks, plans: PLAN_OVERRIDE[key] || pr.plans, trigger: pr.trigger, cadence: pr.cadence, goal: pr.goal, timing: SCHEDULE[key] || TIMING[pr.id],
      priority: pol.priority, prioLabel: PRIO_LABEL[pol.priority], windowLabel: WINDOW_LABEL(pol.slot) }
  })
  return { id: pr.id, title: pr.title, subtitle: pr.subtitle, group: GROUP[pr.id], plans: pr.plans, trigger: pr.trigger, cadence: pr.cadence, goal: pr.goal, timing: TIMING[pr.id], count: emails.length, emails }
})

writeFileSync('/tmp/claude-0/-home-user-property/fe22d132-56da-5d8b-b87a-58829319f7e4/scratchpad/console-data.json', JSON.stringify({ total, programs, groupOrder: GROUP_ORDER }))
console.log(`generated ${total} emails · ${programs.length} programs`)
