import { test, expect, type Page } from '@playwright/test';
async function enter(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Pular tour', exact: true }).click();
}
test('módulos operacionais navegam sem overflow em desktop, tablet e celular', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await enter(page);
  for (const [path, title] of [
    ['/stock', 'Estoque por lote'],
    ['/batches', 'Produção e lotes'],
    ['/traceability', 'Rastreabilidade'],
    ['/recurring', 'Pedidos fixos'],
    ['/whatsapp', 'Central WhatsApp'],
    ['/finance', 'Contas a receber'],
    ['/reports', 'Relatórios'],
    ['/settings', 'Configurações operacionais'],
  ]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: title, exact: true, level: 1 })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), {
        message: `Sem overflow em ${path}`,
      })
      .toBe(true);
  }
  await page.goto('/receipts');
  await page.getByRole('button', { name: 'Receber leite', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await page.screenshot({
    path: `test-results/recebimento-${info.project.name}.png`,
    fullPage: true,
  });
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});
test('WhatsApp demo, recorrência, relatórios e parâmetros operam pela interface', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'desktop',
    'Navegação e formulários têm verificação nos três tamanhos.',
  );
  test.setTimeout(120000);
  await enter(page);
  await page.goto('/whatsapp');
  await page.getByLabel('Cliente da conversa').selectOption('customer-0');
  await page.getByLabel('Mensagem recebida / colada').fill('1 kg de minas frescal e 1 requeijão');
  await page.getByRole('button', { name: 'Registrar e sugerir pedido' }).click();
  await expect(page.getByRole('heading', { name: 'Pedido sugerido', exact: true })).toBeVisible();
  const orderResponse = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/orders' && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Confirmar pedido sugerido' }).click();
  const order = (await (await orderResponse).json()) as { id: string; code: string };
  await expect(page.getByText(`Pedido ${order.code} confirmado.`)).toBeVisible();
  await page
    .getByLabel('Texto para o cliente')
    .fill('Mensagem de homologação: confira o pedido no painel.');
  await page.getByRole('button', { name: 'Preparar envio', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Abrir no WhatsApp', exact: true })).toHaveAttribute(
    'href',
    /^https:\/\/wa.me\//,
  );
  await page.goto(`/orders?search=${order.code}`);
  await page
    .getByRole('row')
    .filter({ hasText: order.code })
    .getByRole('button', { name: 'Cancelar', exact: true })
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar operação' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/recurring');
  await page.getByRole('button', { name: 'Novo pedido fixo' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Cliente do pedido fixo').selectOption('customer-0');
  await dialog.getByLabel('Produto', { exact: true }).selectOption('product-0');
  await dialog.getByLabel('Quantidade', { exact: true }).fill('1');
  const planResponse = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/recurring' && r.request().method() === 'POST',
  );
  await dialog.getByRole('button', { name: 'Salvar pedido fixo' }).click();
  const plan = (await (await planResponse).json()) as { id: string };
  await expect(dialog).toHaveCount(0);
  const card = page.getByTestId(`recurring-${plan.id}`);
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Pausar', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Retomar', exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Retomar', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
  const generated = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === '/api/recurring/generate' && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Gerar próximos 7 dias' }).click();
  expect((await generated).status()).toBe(200);
  await expect(card.getByRole('link').first()).toBeVisible();
  const next = (await (await page.request.get('/api/recurring')).json()) as {
    rows: { id: string; orders: { deliveryDate: string }[] }[];
  };
  const occurrence = next.rows.find((p) => p.id === plan.id)!.orders[0];
  await card.getByRole('button', { name: 'Pular uma data' }).click();
  await page
    .getByRole('dialog')
    .getByLabel('Data a pular')
    .fill(occurrence.deliveryDate.slice(0, 10));
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar data pulada' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await card.getByRole('button', { name: 'Pausar', exact: true }).click();
  await page.goto('/reports');
  await page.getByLabel('Relatório', { exact: true }).selectOption('finance');
  await expect(page.getByText('Resultado gerencial', { exact: true })).toBeVisible();
  const csv = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV', exact: true }).click();
  expect((await csv).suggestedFilename()).toContain('.csv');
  const pdf = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PDF', exact: true }).click();
  expect((await pdf).suggestedFilename()).toContain('.pdf');
  await page.goto('/settings');
  const expiry = page.getByLabel('Alerta de validade (dias)', { exact: true });
  const original = await expiry.inputValue();
  await expiry.fill(original === '8' ? '9' : '8');
  const saved = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/settings' && r.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Salvar parâmetros' }).click();
  expect((await saved).status()).toBe(200);
  await expect(page.getByText('Configuração salva.', { exact: true })).toBeVisible();
  await expiry.fill(original);
  await page.getByRole('button', { name: 'Salvar parâmetros' }).click();
});
