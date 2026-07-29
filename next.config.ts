import type { NextConfig } from "next";

// ── Security headers ─────────────────────────────────────────────────────────
// Το Content-Security-Policy ορίζεται πλέον στο proxy.ts (middleware) με
// per-request nonce, ώστε να φύγει το 'unsafe-inline' από το script-src. Εδώ
// μένουν οι υπόλοιπες κεφαλίδες. Σε development παραλείπουμε το HSTS (σπάει το
// http://localhost)· η CSP ούτως ή άλλως δεν στέλνεται σε dev από το middleware.
const isDev = process.env.NODE_ENV !== "production";

const securityHeaders = [
  ...(isDev ? [] : [
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  ]),
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  // Κάμερα (σάρωση) & μικρόφωνο (φωνή) επιτρέπονται μόνο στο ίδιο origin· τα άλλα κλειστά.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), browsing-topics=()" },
];

const nextConfig: NextConfig = {
  // ── ΠΟΙΑ ΕΚΔΟΣΗ ΒΛΕΠΕΙ Ο ΧΡΗΣΤΗΣ ───────────────────────────────────────────
  // Χωρίς αυτό, μια αναφορά σφάλματος δεν λέει ΠΟΤΕ αν το πρόβλημα υπάρχει
  // ακόμη ή αν ο χρήστης κοιτά παλιά έκδοση. Χάθηκαν δύο γύροι διόρθωσης
  // ακριβώς εκεί: το σφάλμα είχε ήδη λυθεί και το preview σέρβιρε το προηγούμενο
  // build. Επτά χαρακτήρες commit στην οθόνη σφάλματος κλείνουν το ερώτημα.
  env: {
    NEXT_PUBLIC_BUILD_SHA:
      (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? "").slice(0, 7) || "dev",
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Ο service worker ΔΕΝ επιτρέπεται να αποθηκευτεί. Αν ο browser κρατήσει
      // παλιό sw.js, κρατά και τη στρατηγική cache που μπορεί να σερβίρει
      // ασύμβατα αρχεία build. Είναι το μοναδικό αρχείο όπου η μηδενική
      // αποθήκευση είναι απαίτηση ορθότητας και όχι προτίμηση.
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
