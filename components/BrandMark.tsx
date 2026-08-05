// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΣΗΜΑ, ΣΕ ΕΝΑ ΣΗΜΕΙΟ.
// ─────────────────────────────────────────────────────────────────────────
// Το πλακίδιο με το «P» ήταν γραμμένο με το χέρι σε δεκαεννέα αρχεία: αρχική
// σελίδα, πύλη ενοικιαστή, πύλη λογιστή, νομικές σελίδες, δημόσιοι υπολογιστές,
// οθόνη επαλήθευσης, apps ρυθμίσεων. Κάθε αντίγραφο με δικό του μέγεθος (22, 24,
// 28, 34), δική του γωνία και ΤΡΙΑ διαφορετικά χρώματα γράμματος
// (`--on-tone`, `--accent-text`, καρφωτό `#fff`).
//
// Δεν έσπαγε τίποτα — απλώς το ίδιο σήμα δεν ήταν το ίδιο σήμα, και μια αλλαγή
// στο brand σήμαινε δεκαεννέα επεξεργασίες με μία σίγουρη παράλειψη.
//
// ΤΟ ΓΡΑΜΜΑ ΕΙΝΑΙ ΠΙΟ ΣΚΟΥΡΟ ΑΠΟ ΤΟ ΠΛΑΚΙΔΙΟ, όχι λευκό: δεν διαβάζεται, δίνει
// βάθος. Το χρώμα ζει στο `--logo-mark-text` και παράγεται από το ίδιο το accent,
// οπότε ακολουθεί το θέμα χωρίς δεύτερη απόφαση.
// ═══════════════════════════════════════════════════════════════════════════
import { T } from './tokens';

export default function BrandMark({ size = 28, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <div
      aria-hidden
      style={{
        width: size, height: size, flexShrink: 0,
        // Η γωνία κλιμακώνεται με το μέγεθος: σταθερό 8px σε πλακίδιο 22px είναι
        // σχεδόν κύκλος, σε 34px σχεδόν τετράγωνο.
        borderRadius: Math.max(6, Math.round(size * 0.29)),
        background: 'var(--accent)',
        color: 'var(--logo-mark-text)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: T.font.sans,
        fontSize: Math.round(size * 0.52),
        fontWeight: 800,
        lineHeight: 1,
        letterSpacing: '-0.02em',
        ...style,
      }}
    >P</div>
  );
}

/**
 * Το ίδιο σήμα ως ΣΥΜΒΟΛΟΣΕΙΡΑ HTML, για τα σημεία που δεν αποδίδονται από React:
 * εκτυπώσιμες αναφορές και email. Εκεί δεν υπάρχουν CSS variables (αυτόνομο
 * έγγραφο, ή email client που τις αγνοεί), οπότε τα χρώματα είναι κυριολεκτικά —
 * αλλά βγαίνουν από ΕΔΩ, ώστε να αλλάζουν μαζί με το υπόλοιπο σήμα.
 */
export const BRAND_MARK_BG = '#1a6ae8';
// 86% του --accent αναμεμιγμένο με μαύρο, υπολογισμένο: 26·0,86=22 · 106·0,86=91 · 232·0,86=200.
export const BRAND_MARK_INK = '#165bc8';

export const brandMarkHtml = (size = 34) =>
  `<div style="width:${size}px;height:${size}px;border-radius:${Math.max(6, Math.round(size * 0.29))}px;`
  + `background:${BRAND_MARK_BG};color:${BRAND_MARK_INK};display:inline-flex;align-items:center;`
  + `justify-content:center;font-weight:800;font-size:${Math.round(size * 0.52)}px;line-height:1">P</div>`;
