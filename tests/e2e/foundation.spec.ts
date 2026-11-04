import { test, expect, type Page } from '@playwright/test';
async function login(page: Page, role = 'Gestor') {
  await page.goto('/login');
  await page.getByRole('button', { name: role, exact: true }).click();
  await page.getByRole('button', { name: 'Entrar na minha conta' }).click();
  const tour = page.getByRole('button', { name: 'Pular tour' });
  await expect(tour).toBeVisible();
  await tour.click();
}
test('login, painel, filtros, tema, consultas, CSV, busca e logout', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page);
  await expect(page.getByRole('heading', { name: /Bom dia|Boa tarde|Boa noite/ })).toBeVisible();
  await expect(page.getByText('Leite recebido', { exact: true }).first()).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await page.getByRole('button', { name: 'Últimos 7 dias', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Últimos 7 dias', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Ativar modo escuro' }).click();
  await expect(page.locator('html')).toHaveClass('dark');
  await page.reload();
  await expect(page.locator('html')).toHaveClass('dark');
  await page.screenshot({
    path: `test-results/dashboard-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.goto('/producers');
  await expect(page.getByRole('heading', { name: 'Produtores', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Buscar registros' }).fill('Maria');
  await expect(page.getByText('Maria Ferreira', { exact: true }).first()).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar CSV' }).click();
  expect((await download).suggestedFilename()).toBe('agro-certa-producers.csv');
  await page.getByRole('button', { name: 'Buscar no sistema' }).click();
  await page.getByRole('textbox', { name: 'Busca global' }).fill('Canastra');
  await expect(page.getByRole('button', { name: /Queijo da Canastra/ }).first()).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Menu da conta' }).click();
  await page.getByRole('menuitem', { name: 'Sair da conta' }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(errors).toEqual([]);
});
test('produção não acessa financeiro; entregador vê apenas suas entregas', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'tablet', 'Permissões verificadas em desktop e mobile.');
  await login(page, 'Produção');
  await page.goto('/finance');
  await expect(page.getByRole('heading', { name: 'Acesso restrito' })).toBeVisible();
  await expect(
    page
      .getByRole('navigation', { name: 'Navegação principal' })
      .getByRole('link', { name: 'Contas a receber' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Menu da conta' }).click();
  await page.getByRole('menuitem', { name: 'Sair da conta' }).click();
  await login(page, 'Entregador');
  await expect(page.getByRole('heading', { name: 'Seu dia na estrada' })).toBeVisible();
  await expect(page).toHaveURL(/\/deliveries$/);
  await expect(
    page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link'),
  ).toHaveCount(1);
});
test('gestor cadastra usuário e o novo acesso autentica', async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    'Cadastro verificado em desktop; responsividade coberta pela navegação.',
  );
  await login(page);
  await page.goto('/users');
  await page.getByRole('button', { name: 'Novo usuário' }).click();
  const email = `browser-${testInfo.project.name}-${Date.now()}@example.com`;
  await page.getByLabel('Nome completo').fill('Teste de Navegador');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha inicial').fill('Teste-seguro-123');
  await page.getByLabel('Papel na equipe').selectOption('SALES');
  await page.getByRole('button', { name: 'Criar usuário', exact: true }).click();
  await expect(page.getByText('Usuário criado com sucesso.')).toBeVisible();
  await page.getByRole('button', { name: 'Menu da conta' }).click();
  await page.getByRole('menuitem', { name: 'Sair da conta' }).click();
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill('Teste-seguro-123');
  await page.getByRole('button', { name: 'Entrar na minha conta' }).click();
  await page.getByRole('button', { name: 'Pular tour' }).click();
  await expect(
    page
      .getByRole('navigation', { name: 'Navegação principal' })
      .getByRole('link', { name: 'Clientes', exact: true }),
  ).toHaveCount(1);
});
