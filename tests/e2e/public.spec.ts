import { test, expect } from '@playwright/test';
test('@public login acessível, responsivo e com validação local', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sua gestão começa aqui.' })).toBeVisible();
  await page.getByRole('button', { name: 'Gestor', exact: true }).click();
  await expect(page.getByLabel('E-mail', { exact: true })).toHaveValue('dono@agrocerta.com');
  await page.getByRole('button', { name: 'Mostrar senha' }).click();
  await expect(page.getByLabel('Senha', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Ocultar senha' }).click();
  await page.getByLabel('E-mail', { exact: true }).fill('email-invalido');
  await page.getByLabel('E-mail', { exact: true }).blur();
  await expect(page.getByText('Informe um e-mail válido.')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await page.screenshot({
    path: `test-results/login-${testInfo.project.name}.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
