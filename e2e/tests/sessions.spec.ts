import { expect, test } from '@playwright/test';
import { createUsers, fullName, newUser, signOut, signUp } from './support';

test.describe('sessions (E6)', () => {
  test('a terminated session cookie no longer works', async ({ page, context }) => {
    await signUp(page);
    const cookies = await context.cookies();
    const sid = cookies.find((cookie) => cookie.name === 'sid');
    expect(sid, 'session cookie').toBeDefined();
    expect(sid?.httpOnly).toBe(true);
    expect(sid?.sameSite).toBe('Lax');

    await signOut(page);
    expect((await context.cookies()).some((cookie) => cookie.name === 'sid')).toBe(false);

    // Replay the old session ID: the API has terminated it.
    await context.addCookies([sid!]);
    const response = await page.request.get('/api/users');
    expect(response.status()).toBe(401);

    await context.addCookies([sid!]);
    await page.goto('/dashboard');
    await expect(page).toHaveURL('/sign-in');
  });

  test('an inactive user cannot sign in', async ({ page }) => {
    await signUp(page);
    const [inactive] = await createUsers(page.request, 1, 'Inactive', 'INACTIVE');
    await signOut(page);

    await page.getByLabel('Email').fill(inactive!.email);
    await page.getByLabel('Password').fill(inactive!.password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('form', { name: 'Sign in' }).getByRole('alert')).toHaveText(
      'This account is inactive. Contact an administrator to reactivate it.',
    );
    await expect(page).toHaveURL('/sign-in');
  });

  test('a deleted user’s session is revoked', async ({ browser, page }) => {
    const target = newUser('Doomed');
    const targetContext = await browser.newContext();
    const targetPage = await targetContext.newPage();
    await signUp(targetPage, target);

    await signUp(page);
    await page.getByRole('button', { name: `Delete ${fullName(target)}` }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText(`Deleted ${fullName(target)}`)).toBeVisible();

    await targetPage.reload();
    await expect(targetPage).toHaveURL('/sign-in');
    await targetContext.close();
  });
});
