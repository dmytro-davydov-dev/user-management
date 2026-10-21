import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ThemeInitScript } from '@/theme/theme-init-script';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: { default: 'User Management', template: '%s · User Management' },
  description: 'Back-office user management',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The color-scheme script adds a class to <html> before hydration.
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeInitScript />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
