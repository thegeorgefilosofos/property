// Βλ. app/signup/layout.tsx για τον λόγο: η σελίδα σύνδεσης είναι component
// πελάτη και δεν μπορεί να εξάγει μεταδεδομένα η ίδια.
//
// Η ΣΥΝΔΕΣΗ ΔΕΝ ΕΥΡΕΤΗΡΙΑΖΕΤΑΙ. Είναι στον χάρτη με προτεραιότητα 0,5 επειδή
// υπάρχει, όχι επειδή θέλουμε να τη βρίσκει κανείς από αναζήτηση: όποιος
// ψάχνει «Property OS» πρέπει να φτάνει στην αρχική, όχι σε φόρμα εισόδου.
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { siteUrl } from '@/lib/core/site';

export const metadata: Metadata = {
  title: 'Σύνδεση',
  description: 'Σύνδεση στον λογαριασμό σου.',
  alternates: { canonical: siteUrl('/login') },
  robots: { index: false, follow: true },
};

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}
