import { expect, test } from '@playwright/test';
import { fullName, newUser, signIn, signOut, signUp } from './support';

test.describe('route protection (E1)', () => {
  test('anonymous visitors are sent to the auth pages', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL('/sign-up');
    await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible();

    await page.goto('/dashboard');
    await expect(page).toHaveURL('/sign-in');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test('signed-in users skip the auth pages', async ({ page }) => {
    await signUp(page);

    await page.goto('/');
    await expect(page).toHaveURL('/dashboard');
    await page.goto('/sign-in');
    await expect(page).toHaveURL('/dashboard');
    await page.goto('/sign-up');
    await expect(page).toHaveURL('/dashboard');
  });

  test('the BFF rejects anonymous API calls', async ({ request }) => {
    const response = await request.get('/api/users');
    expect(response.status()).toBe(401);
  });
});

test('sign up → dashboard → sign out → sign in (E2)', async ({ page }) => {
  const user = newUser('Journey');

  await page.goto('/sign-up');
  await page.getByRole('link', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/sign-in');
  await page.getByRole('link', { name: 'Create one' }).click();
  await expect(page).toHaveURL('/sign-up');

  await signUp(page, user);
  await expect(page.getByTestId('greeting')).toHaveText(`Hello, ${user.firstName}`);
  const ownRow = page.getByRole('row', { name: new RegExp(fullName(user)) });
  await expect(ownRow).toContainText('You');
  // Cells after the row header: Email, Status, Logins, … (sign-up counts as the first login).
  await expect(ownRow.getByRole('cell').nth(2)).toHaveText('1');

  await signOut(page);
  await page.goto('/dashboard');
  await expect(page).toHaveURL('/sign-in');

  await signIn(page, user);
  await expect(page.getByTestId('greeting')).toHaveText(`Hello, ${user.firstName}`);
  await expect(ownRow.getByRole('cell').nth(2)).toHaveText('2');
});

test('sign-up checks the password confirmation before calling the API', async ({ page }) => {
  const user = newUser('Mismatch');
  const calls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/auth/sign-up')) calls.push(request.url());
  });

  await page.goto('/sign-up');
  await page.getByLabel('First name').fill(user.firstName);
  await page.getByLabel('Last name').fill(user.lastName);
  await page.getByLabel('Email').fill(user.email);
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(user.password);
  await page.getByLabel('Confirm password').fill(`${user.password}-typo`);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByText('Passwords do not match')).toBeVisible();
  await expect(page).toHaveURL('/sign-up');
  expect(calls).toEqual([]);
});

test('wrong credentials show a generic error', async ({ page }) => {
  const user = newUser('Wrong');
  await signUp(page, user);
  await signOut(page);

  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('form', { name: 'Sign in' }).getByRole('alert')).toHaveText(
    'Invalid email or password.',
  );
  await expect(page).toHaveURL('/sign-in');
});
