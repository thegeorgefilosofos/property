// Σελίδα που ανοίγει με κρυπτογραφικό σύνδεσμο: εκτός ευρετηρίου, πάντα.
// Ο λόγος και η μία δήλωση ζουν στο lib/seo/noindex.ts.
export { NOINDEX as metadata } from '@/lib/seo/noindex';

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
