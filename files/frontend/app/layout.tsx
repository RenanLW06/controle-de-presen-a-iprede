import type { Metadata } from 'next';
import '@fontsource/familjen-grotesk/latin-500.css';
import '@fontsource/familjen-grotesk/latin-700.css';
import '@fontsource/albert-sans/latin-400.css';
import '@fontsource/albert-sans/latin-600.css';
import './globals.css';
import { PRODUCT_NAME } from '@/lib/config';

export const metadata: Metadata = { title: PRODUCT_NAME, robots: { index: false, follow: false } };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
