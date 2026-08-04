import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { ThemeProvider } from "./ThemeProvider";
import CookieConsent from "./CookieConsent";
import PwaProvider from "./PwaProvider";
import { ToastHost } from "@/components/Toast";
import { ConfirmHost } from "@/components/ConfirmDialog";

export const metadata: Metadata = {
  title: "Property OS",
  description: "Έσοδα, δαπάνες, ενοικιαστές, φόρος και προθεσμίες για τα ακίνητά σου, σε ένα σημείο.",
  applicationName: "Property OS",
  // Εγκαταστάσιμη εφαρμογή: το manifest παράγεται από το app/manifest.ts.
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Property OS",
    // Ημιδιαφανής μπάρα ώστε το περιεχόμενο να φτάνει μέχρι πάνω στο iOS.
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

// Χρώμα μπάρας του browser, και ασφαλείς περιοχές (notch) όταν τρέχει standalone.
//
// ΜΙΑ τιμή, όχι δύο ανά προτίμηση λειτουργικού: η εφαρμογή ξεκινά ΠΑΝΤΑ σκούρα
// (βλ. :root στο globals.css). Όσο εδώ ρωτούσαμε το λειτουργικό, όποιος το έχει
// στο φωτεινό έβλεπε λευκή μπάρα να πλαισιώνει σκούρα εφαρμογή. Η παλιά τιμή
// #0b0f14 δεν ταίριαζε ούτε με το ίδιο μας το φόντο· εδώ είναι το --bg-base του
// σκούρου θέματος, ώστε η μπάρα να συνεχίζει την επιφάνεια αντί να την κόβει.
export const viewport: Viewport = {
  themeColor: "#202124",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Prevent flash of wrong theme, runs before React hydration.
// Πρέπει να διαβάζει ΑΚΡΙΒΩΣ τα ίδια κλειδιά και το ίδιο default με τον
// ThemeProvider (pos_mode για dark/light, pos_theme για την παλέτα, default
// 'dark'/'midnight'), αλλιώς το pre-paint διαφέρει από το post-hydration και
// εμφανίζεται στιγμιαία λάθος θέμα.
const themeInitScript = `
(function() {
  try {
    var mode  = localStorage.getItem('pos_mode')  || 'dark';
    var theme = localStorage.getItem('pos_theme') || 'midnight';
    var el = document.documentElement;
    el.setAttribute('data-mode',  mode === 'light' ? 'light' : 'dark');
    el.setAttribute('data-theme', theme);
  } catch(e) {}
})();
`;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // nonce από το middleware (proxy.ts) για το inline theme-init script υπό CSP.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="el" suppressHydrationWarning>
      <head>
        {/* Κειμενικές γραμματοσειρές: self-hosted (βλ. globals.css @font-face).
            Preload τα δύο βασικά υποσύνολα του Inter ώστε να μη «τρεμοπαίζει» το
            κείμενο στο πρώτο paint (latin για UI, greek για τα ελληνικά). */}
        <link rel="preload" href="/fonts/inter-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/inter-greek.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        {/* Καμία εξωτερική γραμματοσειρά: όλα self-hosted (Inter/Roboto Mono) + inline SVG εικονίδια. */}
        {/* Theme init, must run before paint to prevent flash */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <ThemeProvider>
          {children}
          <ToastHost />
          <ConfirmHost />
          <CookieConsent />
          <PwaProvider />
        </ThemeProvider>
      </body>
    </html>
  );
}