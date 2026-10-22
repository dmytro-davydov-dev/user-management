import { randomUUID } from 'node:crypto';
import { type APIRequestContext, expect, type Page } from '@playwright/test';

/**
 * Test data helpers (T9.2). Every account gets a unique email, so the suite can run
 * repeatedly against the same database without a reset endpoint.
 */

export const E2E_EMAIL_DOMAIN = 'e2e.example.com';
export const PASSWORD = 'e2e-password-123';

export interface TestUser {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

const RUN_ID = randomUUID().slice(0, 8);
let sequence = 0;

export function newUser(label: string): TestUser {
  sequence += 1;
  const tag = `${RUN_ID}-${sequence}`;
  return {
    firstName: label,
    lastName: `E2e ${tag}`,
    email: `${label.toLowerCase()}-${tag}@${E2E_EMAIL_DOMAIN}`,
    password: PASSWORD,
  };
}

export const fullName = (user: Pick<TestUser, 'firstName' | 'lastName'>): string =>
  `${user.firstName} ${user.lastName}`;

export const isE2eEmail = (email: string): boolean => email.endsWith(`@${E2E_EMAIL_DOMAIN}`);

/** Signs up through the UI and waits for the dashboard. */
export async function signUp(page: Page, user: TestUser = newUser('Admin')): Promise<TestUser> {
  await page.goto('/sign-up');
  await page.getByLabel('First name').fill(user.firstName);
  await page.getByLabel('Last name').fill(user.lastName);
  await page.getByLabel('Email').fill(user.email);
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(user.password);
  await page.getByLabel('Confirm password').fill(user.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL('/dashboard');
  return user;
}

/** Registers an account through the BFF without touching the page's session. */
export async function registerUser(request: APIRequestContext, user: TestUser): Promise<void> {
  const response = await request.post('/api/auth/sign-up', { data: user });
  expect(response.status(), await response.text()).toBe(201);
}

/** Signs in through the UI and waits for the dashboard. */
export async function signIn(page: Page, user: Pick<TestUser, 'email' | 'password'>) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/dashboard');
}

export async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL('/sign-in');
}

export interface UsersPage {
  data: { id: string; email: string; firstName: string; lastName: string }[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

/** Lists users through the BFF with the context's session cookie. */
export async function listUsers(request: APIRequestContext, page = 1): Promise<UsersPage> {
  const response = await request.get(`/api/users?page=${page}`);
  expect(response.status()).toBe(200);
  return (await response.json()) as UsersPage;
}

/** Creates users through the BFF (faster than the dialog when a test only needs data). */
export async function createUsers(
  request: APIRequestContext,
  count: number,
  label = 'Seed',
  status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE',
): Promise<TestUser[]> {
  const users: TestUser[] = [];
  for (let i = 0; i < count; i += 1) {
    const user = newUser(label);
    const response = await request.post('/api/users', { data: { ...user, status } });
    expect(response.status(), await response.text()).toBe(201);
    users.push(user);
  }
  return users;
}
