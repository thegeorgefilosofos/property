// Ενδιάμεσος σταθμός προς τον έμπορο, με πακέτο και κύκλο στη διεύθυνση:
// τίποτα να ευρετηριαστεί. Ο λόγος και η μία δήλωση ζουν στο lib/seo/noindex.
export { NOINDEX as metadata } from '@/lib/seo/noindex';

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
