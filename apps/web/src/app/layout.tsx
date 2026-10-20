import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: { default: 'User Management', template: '%s · User Management' },
  description: 'Back-office user management',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers initialMode="light">{children}</Providers>
      </body>
    </html>
  );
}
