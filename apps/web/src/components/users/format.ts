import type { User } from '@um/shared';

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** Viewer-locale date and time. Rendered client-side only (data is fetched in the browser). */
export const formatDateTime = (iso: string): string => dateTime.format(new Date(iso));

export const fullName = (user: Pick<User, 'firstName' | 'lastName'>): string =>
  `${user.firstName} ${user.lastName}`;
