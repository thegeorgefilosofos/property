// ═══════════════════════════════════════════════════════════════════════════
// Ενιαία πολιτική ισχύος κωδικού — μία πηγή αλήθειας για ΟΛΑ τα σημεία που ο
// χρήστης ορίζει κωδικό (εγγραφή, επαναφορά, αλλαγή από τις ρυθμίσεις).
//
// Καθρεφτίζει την server-side πολιτική του Supabase Auth (min 8 + πεζό/κεφαλαίο/
// αριθμό/σύμβολο). Είναι UX layer πάνω στον server, όχι αντικατάστασή του: ο
// server παραμένει η αρχή που επιβάλλει τον κανόνα. Στο Free plan είναι το
// δωρεάν αντίστοιχο της (Pro-only) προστασίας διαρρευσμένων κωδικών του HIBP.
// ═══════════════════════════════════════════════════════════════════════════

// Μικρή λίστα προφανών κωδικών — μπλοκάρει τα «123456789», «password» κ.λπ.
// (Δεν είναι HIBP· είναι μια γρήγορη, τοπική δικλείδα για τους πιο κοινούς.)
const COMMON_PASSWORDS = new Set([
  '12345678', '123456789', '1234567890', 'password', 'password1', 'password123',
  'qwerty123', 'qwertyui', '11111111', '00000000', 'iloveyou', 'admin123',
  'welcome1', 'letmein1', 'abc12345', 'passw0rd', '1q2w3e4r', 'football',
])

export interface PasswordCheck { key: string; label: string; ok: boolean }
export interface PasswordResult {
  checks: PasswordCheck[]
  score: number   // 0–5, πόσες προϋποθέσεις πληρούνται
  ok: boolean     // όλες οι προϋποθέσεις + όχι κοινός
  common: boolean // ταιριάζει με προφανή κωδικό
}

export function checkPassword(pw: string): PasswordResult {
  const common = COMMON_PASSWORDS.has(pw.toLowerCase())
  const checks: PasswordCheck[] = [
    { key: 'len', label: 'Τουλάχιστον 8 χαρακτήρες', ok: pw.length >= 8 },
    { key: 'lower', label: 'Ένα πεζό γράμμα (a–z)', ok: /[a-z]/.test(pw) },
    { key: 'upper', label: 'Ένα κεφαλαίο γράμμα (A–Z)', ok: /[A-Z]/.test(pw) },
    { key: 'digit', label: 'Έναν αριθμό (0–9)', ok: /\d/.test(pw) },
    { key: 'symbol', label: 'Ένα σύμβολο (!@#$…)', ok: /[^A-Za-z0-9]/.test(pw) },
  ]
  const score = checks.filter(c => c.ok).length
  return { checks, score, ok: score === checks.length && !common, common }
}
