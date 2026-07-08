// ═══════════════════════════════════════════════════════════════════════════
// Αντιστοίχιση ελεύθερου κειμένου («υδραυλικός», «ηλεκτρολόγος», «κηπουρός») σε
// έναν έγκυρο ρόλο επαφής, ώστε ο βοηθός να καταχωρεί τεχνικούς/παρόχους στη
// σωστή κατηγορία με μία φράση. Ό,τι δεν αναγνωρίζεται → 'other' (εμφανίζεται
// κανονικά, απλώς χωρίς ομαδοποίηση). Οι τιμές αντιστοιχούν στα role values
// της καρτέλας Επαφές.
// ═══════════════════════════════════════════════════════════════════════════

const RULES: { re: RegExp; role: string }[] = [
  { re: /υδραυλικ/i, role: 'plumber' },
  { re: /ηλεκτρολ/i, role: 'electrician' },
  { re: /ψυκτικ|κλιματισ|κλιματιστ|air ?condition|a\/?c/i, role: 'hvac' },
  { re: /μαραγκ|ξυλουργ|επιπλοποι/i, role: 'carpenter' },
  { re: /ελαιοχρωματ|μπογιατζ|βαφ|χρωματισμ/i, role: 'painter' },
  { re: /πλακ[άα]|μαρμαρ|πλακ[έε]/i, role: 'tiles' },
  { re: /αλουμιν|κουφωμ/i, role: 'aluminum' },
  { re: /κλειδαρ/i, role: 'locksmith' },
  { re: /σιδερ|συγκολλ/i, role: 'welder' },
  { re: /ασανσ[έε]ρ|ανελκυστ/i, role: 'elevator' },
  { re: /ηλιακ|φωτοβολτ/i, role: 'solar' },
  { re: /μον[ώω]σ/i, role: 'insulation' },
  { re: /στ[έε]γ|επιστεγ/i, role: 'roofing' },
  { re: /συναγερμ|cctv|κ[άα]μερ/i, role: 'alarm' },
  { re: /δ[ίι]κτυ|τηλεφων|internet|[ίι]ντερνετ/i, role: 'network' },
  { re: /κηπουρ/i, role: 'gardener' },
  { re: /πισ[ίι]ν/i, role: 'pool' },
  { re: /απεντ[όο]μ|μυοκτον|απολ[ύυ]μανσ/i, role: 'pest' },
  { re: /καθαρι[όσ]|καθαρ[ίι]στ|συνεργε[ίι]ο καθαρ/i, role: 'cleaning' },
  { re: /ασφ[άα]λει|φ[ύυ]λαξ|security/i, role: 'security' },
  { re: /διαχειριστ/i, role: 'manager' },
  { re: /θυρωρ|concierge/i, role: 'concierge' },
  { re: /τεχν[ίι]τ|μ[άα]στορ|μαστ[όο]ρ/i, role: 'general_tech' },
];

export function inferRole(text: string): string {
  const t = (text || '').trim();
  for (const r of RULES) if (r.re.test(t)) return r.role;
  return 'other';
}
