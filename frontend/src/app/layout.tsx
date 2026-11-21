import type { Metadata } from 'next';
import { Zilla_Slab, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import CustomCursor from '@/components/CustomCursor';
import ErrorBoundary from '@/components/ErrorBoundary';

const zillaSlab = Zilla_Slab({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['500', '600', '700'],
});

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['400', '500', '600', '700'],
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: 'PlantGuard — Field Diagnostic Index',
  description: 'Upload a clear leaf photo and get an AI-powered plant health check across 38 disease and healthy classes from 14 supported plants.',
  keywords: ['plant disease', 'AI', 'agriculture', 'machine learning', 'crop health', 'deep learning'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${zillaSlab.variable} ${plexSans.variable} ${plexMono.variable} font-sans`}>
        <CustomCursor />
        <ErrorBoundary>{children}</ErrorBoundary>
      </body>
    </html>
  );
}
