import type { ReactNode } from 'react';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Newsreader, Atkinson_Hyperlegible } from 'next/font/google';
import { routing } from '@/i18n/routing';
import '../globals.css';

// --- Fonts -------------------------------------------------------------
// Newsreader: warm, literary serif. Used only for display moments.
// Atkinson Hyperlegible: designed by the Braille Institute for low-vision
// readability. Drives 100% of body / UI copy.

const newsreader = Newsreader({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-newsreader',
  weight: ['400', '500', '600']
});

const atkinson = Atkinson_Hyperlegible({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-atkinson',
  weight: ['400', '700']
});

// --- Metadata ----------------------------------------------------------

export const metadata = {
  title: 'Treatment Companion',
  description:
    'A patient-first companion for adults receiving botulinum toxin treatment for spasticity.'
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

interface LocaleLayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function LocaleLayout({
  children,
  params
}: LocaleLayoutProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${newsreader.variable} ${atkinson.variable}`}
    >
      <body>
        <NextIntlClientProvider messages={messages} locale={locale}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
