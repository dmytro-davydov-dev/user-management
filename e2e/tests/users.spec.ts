import { expect, type Page, test } from '@playwright/test';
import {
  createUsers,
  fullName,
  isE2eEmail,
  listUsers,
  newUser,
  registerUser,
  signUp,
} from './support';

const PAGE_SIZE = 6;

const usersTable = (page: Page) => page.getByRole('table', { name: 'Users' });
const bodyRows = (page: Page) => usersTable(page).locator('tbody tr');
const summary = (page: Page) => page.getByText(/^\d+–\d+ of \d+ users?$/);

test('create, edit and delete a user (E3)', async ({ page }) => {
  await signUp(page);
  const user = newUser('Created');

  // Create
  await page.getByRole('button', { name: 'New user' }).click();
  const create = page.getByRole('dialog', { name: 'New user' });
  await create.getByLabel('First name').fill(user.firstName);
  await create.getByLabel('Last name').fill(user.lastName);
  await create.getByLabel('Email').fill(user.email);
  await create.getByLabel('Password').fill(user.password);
  await create.getByRole('button', { name: 'Create user' }).click();
  await expect(create).toBeHidden();
  await expect(page.getByText(`Created ${fullName(user)}`)).toBeVisible();
  const row = bodyRows(page).filter({ hasText: user.email });
  await expect(row).toContainText(fullName(user));
  await expect(row).toContainText('Active');

  // Edit: rename
  const renamed = { ...user, firstName: 'Renamed' };
  await page.getByRole('button', { name: `Edit ${fullName(user)}` }).click();
  const edit = page.getByRole('dialog', { name: 'Edit user' });
  await expect(edit.getByLabel('Email')).toHaveValue(user.email);
  await expect(edit.getByLabel('Email')).not.toBeEditable();
  await edit.getByLabel('First name').fill(renamed.firstName);
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(edit).toBeHidden();
  await expect(page.getByText(`Saved ${fullName(renamed)}`)).toBeVisible();
  await expect(row).toContainText(fullName(renamed));

  // Edit: deactivate. Names lock as soon as Inactive is picked.
  await page.getByRole('button', { name: `Edit ${fullName(renamed)}` }).click();
  await edit.getByLabel('Status').click();
  await page.getByRole('option', { name: 'Inactive' }).click();
  await expect(edit.getByLabel('First name')).toBeDisabled();
  await expect(edit.getByLabel('Last name')).toBeDisabled();
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(edit).toBeHidden();
  await expect(row).toContainText('Inactive');

  // An inactive user's names stay locked when the dialog reopens.
  await page.getByRole('button', { name: `Edit ${fullName(renamed)}` }).click();
  await expect(edit.getByLabel('First name')).toBeDisabled();
  await edit.getByRole('button', { name: 'Cancel' }).click();

  // Delete, with confirmation
  await page.getByRole('button', { name: `Delete ${fullName(renamed)}` }).click();
  const confirm = page.getByRole('dialog', { name: `Delete ${fullName(renamed)}?` });
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(row).toBeVisible();

  await page.getByRole('button', { name: `Delete ${fullName(renamed)}` }).click();
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText(`Deleted ${fullName(renamed)}`)).toBeVisible();
  await expect(row).toHaveCount(0);
});

test('a duplicate email is reported on the field', async ({ page }) => {
  const admin = await signUp(page);
  await page.getByRole('button', { name: 'New user' }).click();
  const create = page.getByRole('dialog', { name: 'New user' });
  await create.getByLabel('First name').fill('Copy');
  await create.getByLabel('Last name').fill('Cat');
  await create.getByLabel('Email').fill(admin.email);
  await create.getByLabel('Password').fill(admin.password);
  await create.getByRole('button', { name: 'Create user' }).click();
  await expect(create.getByText('An account with this email already exists.')).toBeVisible();
  await expect(create).toBeVisible();
});

test('six users per page; page 2 holds the rest (E4)', async ({ page }) => {
  await signUp(page);
  const { total: existing } = (await listUsers(page.request)).pagination;
  if (existing < PAGE_SIZE + 1) await createUsers(page.request, PAGE_SIZE + 1 - existing);
  const { total, totalPages } = (await listUsers(page.request)).pagination;

  await page.reload();
  await expect(bodyRows(page)).toHaveCount(PAGE_SIZE);
  await expect(summary(page)).toHaveText(`1–6 of ${total} users`);

  await page.getByRole('button', { name: 'Go to page 2', exact: true }).click();
  await expect(page).toHaveURL('/dashboard?page=2');
  const onPage2 = Math.min(PAGE_SIZE, total - PAGE_SIZE);
  await expect(bodyRows(page)).toHaveCount(onPage2);
  await expect(summary(page)).toHaveText(`7–${6 + onPage2} of ${total} users`);

  // Deep links and Back work.
  await page.goto(`/dashboard?page=${totalPages}`);
  await expect(
    page.getByRole('button', { name: `page ${totalPages}`, exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: 'Go to page 1', exact: true }).click();
  await expect(page).toHaveURL('/dashboard');
  await page.goBack();
  await expect(page).toHaveURL(`/dashboard?page=${totalPages}`);
});

test('deleting the only row on the last page moves back one page (T7.6)', async ({
  page,
  request,
}) => {
  // On an empty database this account is the oldest, so the admin below never is.
  await registerUser(request, newUser('Oldest'));
  await signUp(page);
  const { total: existing } = (await listUsers(page.request)).pagination;
  // Smallest total >= 7 that leaves exactly one user on the last page.
  let target = Math.max(existing, PAGE_SIZE + 1);
  while (target % PAGE_SIZE !== 1) target += 1;
  await createUsers(page.request, target - existing);
  const { total, totalPages } = (await listUsers(page.request)).pagination;
  expect(total).toBe(target);

  // Newest first, so the last page holds the oldest user. Only delete it if the suite made it.
  const [oldest] = (await listUsers(page.request, totalPages)).data;
  test.skip(
    !oldest || !isE2eEmail(oldest.email),
    'The oldest user was not created by the E2E suite; run against a database it owns.',
  );

  await page.goto(`/dashboard?page=${totalPages}`);
  await expect(bodyRows(page)).toHaveCount(1);
  await page
    .getByRole('button', { name: `Delete ${oldest!.firstName} ${oldest!.lastName}` })
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();

  await expect(page).toHaveURL(
    totalPages - 1 === 1 ? '/dashboard' : `/dashboard?page=${totalPages - 1}`,
  );
  await expect(bodyRows(page)).toHaveCount(PAGE_SIZE);
});

test('phones get cards instead of the table (E6) @mobile', async ({ page }) => {
  await signUp(page);
  const { total } = (await listUsers(page.request)).pagination;
  if (total < PAGE_SIZE + 1) await createUsers(page.request, PAGE_SIZE + 1 - total);
  await page.reload();

  const cards = page.getByRole('list', { name: 'Users' }).getByRole('listitem');
  await expect(cards).toHaveCount(PAGE_SIZE);
  await expect(usersTable(page)).toBeHidden();
  await expect(page.getByRole('navigation', { name: 'pagination navigation' })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  // The dialogs work on a small screen too.
  await page.getByRole('button', { name: 'New user' }).click();
  await expect(page.getByRole('dialog', { name: 'New user' })).toBeVisible();
});
