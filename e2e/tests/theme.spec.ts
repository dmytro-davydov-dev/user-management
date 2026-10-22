import { expect, type Page, test } from '@playwright/test';
import { signUp } from './support';

const html = (page: Page) => page.locator('html');
const bodyBackground = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.describe('theme (E5)', () => {
  test('follows the OS until the user chooses', async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: 'dark' });
    const page = await context.newPage();
    await page.goto('/sign-in');
    await expect(html(page)).toHaveClass(/\bdark\b/);
    await context.close();
  });

  test('a chosen theme survives a new browser context', async ({ browser }) => {
    const first = await browser.newContext({ colorScheme: 'light' });
    const page = await first.newPage();
    await signUp(page);
    await expect(html(page)).toHaveClass(/\blight\b/);
    const lightBackground = await bodyBackground(page);

    await page.getByRole('button', { name: 'Toggle theme' }).click();
    await expect(html(page)).toHaveClass(/\bdark\b/);
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('dark');

    // "Close and reopen the app": a fresh context with only the saved storage, OS still light.
    const state = await first.storageState();
    await first.close();
    const reopened = await browser.newContext({ colorScheme: 'light', storageState: state });
    const again = await reopened.newPage();

    // Record <html>'s class when the first visible element of <body> is parsed (Next puts a
    // hidden <div> before the theme script), i.e. before paint or hydration: no light flash.
    await again.addInitScript(() => {
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (
              node instanceof HTMLElement &&
              document.body !== null &&
              node.parentElement === document.body &&
              node.tagName !== 'SCRIPT' &&
              !node.hidden
            ) {
              (window as unknown as { firstPaintClass: string }).firstPaintClass =
                document.documentElement.className;
              observer.disconnect();
              return;
            }
          }
        }
      });
      observer.observe(document, { childList: true, subtree: true });
    });
    await again.goto('/dashboard');
    await expect(html(again)).toHaveClass(/\bdark\b/);
    expect(
      await again.evaluate(
        () => (window as unknown as { firstPaintClass: string }).firstPaintClass,
      ),
    ).toMatch(/\bdark\b/);
    expect(await bodyBackground(again)).not.toBe(lightBackground);

    await again.getByRole('button', { name: 'Toggle theme' }).click();
    await expect(html(again)).toHaveClass(/\blight\b/);
    await reopened.close();
  });
});
