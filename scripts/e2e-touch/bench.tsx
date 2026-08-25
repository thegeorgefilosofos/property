// ═══════════════════════════════════════════════════════════════════════════
// Ο ΠΑΓΚΟΣ ΤΟΥ ΔΑΧΤΥΛΟΥ: ΣΕΡΝΕΤΑΙ ΟΝΤΩΣ Η ΝΟΑ ΣΕ ΟΘΟΝΗ ΑΦΗΣ;
// ─────────────────────────────────────────────────────────────────────────
// Το πλωτό κουμπί του βοηθού σέρνεται με pointer events. Με ΠΟΝΤΙΚΙ δουλεύει.
// Με ΔΑΧΤΥΛΟ ο περιηγητής κρίνει μόνος του, στην πρώτη κίνηση, αν η χειρονομία
// ανήκει στη σελίδα (κύλιση) ή στο στοιχείο. Οταν την πάρει η σελίδα, στέλνει
// `pointercancel` και ΣΤΑΜΑΤΑ να στέλνει `pointermove`: το κουμπί μένει
// κολλημένο και ο χρήστης νομίζει ότι δεν σέρνεται.
//
// Ο πάγκος αποδίδει τον ΑΛΗΘΙΝΟ βοηθό με ολόκληρο το globals.css· ο έλεγχος
// στέλνει ΑΛΗΘΙΝΑ συμβάντα αφής μέσω CDP (Input.dispatchTouchEvent),
// όχι συνθετικά PointerEvent από JavaScript: μόνο τα πρώτα περνούν από τους
// κανόνες `touch-action` του περιηγητή, δηλαδή μόνο αυτά μετρούν κάτι.
import { createRoot } from 'react-dom/client';
import PropertyAssistant from '@/app/dashboard/components/PropertyAssistant';

// Η σελίδα κάτω από τον βοηθό είναι ΨΗΛΗ επίτηδες: χωρίς περιεχόμενο να
// κυλήσει, ο περιηγητής δεν έχει λόγο να διεκδικήσει τη χειρονομία και ο
// πάγκος θα περνούσε πράσινος ενώ η αληθινή οθόνη κολλάει.
function Bench() {
  return (
    <div className="app-shell"><main className="app-main"><div className="app-content" style={{ padding: 16 }}>
      <h1 style={{ margin: 0 }}>Πάγκος αφής</h1>
      <div style={{ height: '400vh' }} data-tall />
      <PropertyAssistant
        propertyId="p1" userId="u1"
        propContext={{ name: 'Δοκιμή' }}
        onNavigate={() => { }} onScan={() => { }}
      />
    </div></main></div>
  );
}

const host = document.createElement('div');
document.body.appendChild(host);
createRoot(host).render(<Bench />);
