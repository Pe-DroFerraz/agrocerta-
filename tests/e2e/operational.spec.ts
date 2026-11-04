import { test, expect, type Page } from '@playwright/test';
const dialog = (page: Page) => page.getByRole('dialog');
async function save(page: Page, path: string, method = 'POST') {
  const response = page.waitForResponse(
    (r) => new URL(r.url()).pathname === `/api${path}` && r.request().method() === method,
  );
  await dialog(page).getByRole('button', { name: 'Confirmar operação', exact: true }).click();
  const result = await response;
  expect(result.status(), await result.text()).toBeLessThan(300);
  await expect(dialog(page)).toHaveCount(0);
  return result.json() as Promise<{ id: string; code: string }>;
}
async function fill(page: Page, label: string, value: string) {
  await dialog(page).getByLabel(label, { exact: true }).fill(value);
}
test('operação real de 500 litros: cadastros, produção, venda, entrega, recebimento e recall', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'desktop',
    'Fluxo transacional em desktop; responsividade do painel coberta nos três tamanhos.',
  );
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const tour = page.getByRole('button', { name: 'Pular tour' });
  await expect(tour).toBeVisible();
  await tour.click();
  const before = (await (await page.request.get('/api/dashboard?period=today')).json()) as {
    kpis: { key: string; value: number }[];
  };
  const suffix = Date.now().toString().slice(-9);
  const producerName = `Produtor Navegador ${suffix}`;
  const productName = `Queijo Navegador ${suffix}`;
  const customerName = `Empório Navegador ${suffix}`;
  await page.goto('/producers');
  await page.getByRole('button', { name: 'Novo produtor', exact: true }).click();
  for (const [label, value] of [
    ['Nome do produtor', producerName],
    ['Propriedade', `Fazenda Browser ${suffix}`],
    ['Município', 'Prados'],
    ['Telefone / WhatsApp', '5532999999999'],
    ['CPF / CNPJ ou identificador demo', `BROWSER-P-${suffix}`],
    ['Preço por litro (R$)', '2.4'],
  ])
    await fill(page, label, value);
  await save(page, '/producers');
  await page.goto('/receipts');
  await page.getByRole('button', { name: 'Receber leite', exact: true }).click();
  await dialog(page).getByLabel('Produtor', { exact: true }).selectOption({ label: producerName });
  await fill(page, 'Volume recebido (L)', '500');
  const receipt = await save(page, '/receipts');
  await page.goto('/products');
  await page.getByRole('button', { name: 'Novo produto', exact: true }).click();
  await fill(page, 'Código (letras maiúsculas)', `EE${suffix}`);
  await fill(page, 'Nome do produto', productName);
  await dialog(page).getByLabel('Unidade', { exact: true }).selectOption('kg');
  await fill(page, 'Categoria', 'Queijos frescos');
  await fill(page, 'Preço de venda (R$)', '45');
  await fill(page, 'Validade em dias', '14');
  await dialog(page).getByLabel('Insumo', { exact: true }).selectOption('supply-1');
  await fill(page, 'Qtd./unidade', '.02');
  await save(page, '/products');
  await page.goto('/customers');
  await page.getByRole('button', { name: 'Novo cliente', exact: true }).click();
  for (const [label, value] of [
    ['Nome do cliente', customerName],
    ['CPF / CNPJ ou identificador demo', `BROWSER-C-${suffix}`],
    ['Endereço completo', 'Rua da Homologação, 10'],
    ['Bairro', 'Centro'],
    ['Município', 'Prados'],
    ['Responsável pelo recebimento', 'Cliente Browser'],
    ['Telefone / WhatsApp', '5532988888888'],
    ['Limite de crédito (R$; zero = sem limite)', '0'],
  ])
    await fill(page, label, value);
  await dialog(page).getByLabel('Segmento', { exact: true }).selectOption('EMPORIUM');
  await save(page, '/customers');
  await page.goto('/batches');
  await page.getByRole('button', { name: 'Nova produção', exact: true }).click();
  await dialog(page).getByLabel('Produto', { exact: true }).selectOption({ label: productName });
  await dialog(page)
    .getByLabel('Origem do leite (opcional)', { exact: true })
    .selectOption(receipt.id);
  await fill(page, 'Leite utilizado (L)', '500');
  await fill(page, 'Quantidade efetivamente produzida', '50');
  await dialog(page)
    .getByLabel('Situação inicial do lote', { exact: true })
    .selectOption('RELEASED');
  const batch = await save(page, '/production');
  await page.goto('/orders');
  await page.getByRole('button', { name: 'Novo pedido', exact: true }).click();
  await dialog(page).getByLabel('Cliente', { exact: true }).selectOption({ label: customerName });
  const productSelect = dialog(page).getByLabel('Produto', { exact: true });
  await productSelect.selectOption({ label: `${productName} (kg)` });
  await fill(page, 'Quantidade', '8');
  const order = await save(page, '/orders');
  await page.getByRole('textbox', { name: 'Buscar registros' }).fill(order.code);
  const orderRow = page.getByRole('row').filter({ hasText: order.code });
  await expect(orderRow).toBeVisible();
  await orderRow.getByRole('button', { name: 'Separar', exact: true }).click();
  await save(page, `/orders/${order.id}/status`, 'PATCH');
  await orderRow.getByRole('button', { name: 'Pronto', exact: true }).click();
  await save(page, `/orders/${order.id}/status`, 'PATCH');
  await orderRow.getByRole('button', { name: 'Despachar', exact: true }).click();
  await dialog(page).getByLabel('Rota', { exact: true }).selectOption('route-0');
  await dialog(page).getByLabel('Entregador', { exact: true }).selectOption('driver-0');
  await dialog(page).getByLabel('Veículo', { exact: true }).selectOption('vehicle-0');
  const delivery = await save(page, `/orders/${order.id}/dispatch`);
  await page.goto('/deliveries');
  await page.getByRole('textbox', { name: 'Buscar registros' }).fill(customerName);
  await page
    .getByRole('row')
    .filter({ hasText: customerName })
    .getByRole('button', { name: 'Concluir', exact: true })
    .click();
  await fill(page, 'Nome de quem recebeu (comprovante)', 'Cliente Browser');
  await save(page, `/deliveries/${delivery.id}/complete`);
  await page.goto('/finance');
  await page.getByRole('textbox', { name: 'Buscar registros' }).fill(customerName);
  await page
    .getByRole('row')
    .filter({ hasText: customerName })
    .getByRole('button', { name: 'Receber', exact: true })
    .click();
  await save(
    page,
    `/receivables/${(await (await page.request.get(`/api/finance?search=${encodeURIComponent(customerName)}`)).json()).rows[0].id}/pay`,
  );
  const stored = (await (await page.request.get(`/api/ops/batches/${batch.id}`)).json()) as {
    availableQuantity: string;
    reservedQuantity: string;
  };
  expect(Number(stored.availableQuantity)).toBe(42);
  expect(Number(stored.reservedQuantity)).toBe(0);
  const after = (await (
    await page.request.get('/api/dashboard?period=today')
  ).json()) as typeof before;
  const metric = (d: typeof before, key: string) => d.kpis.find((k) => k.key === key)!.value;
  expect(metric(after, 'milk') - metric(before, 'milk')).toBeCloseTo(500, 1);
  expect(metric(after, 'revenue') - metric(before, 'revenue')).toBeCloseTo(360, 1);
  await page.goto(`/traceability?code=${batch.code}`);
  await expect(page.getByRole('paragraph').filter({ hasText: producerName })).toBeVisible();
  await expect(page.getByRole('paragraph').filter({ hasText: customerName })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Etiqueta com QR', exact: true }).click();
  expect((await download).suggestedFilename()).toContain('.pdf');
  await page.getByRole('button', { name: 'Simular recall', exact: true }).click();
  await dialog(page).getByLabel('Motivo do recall').fill('Homologação do recall integrado');
  await dialog(page).getByRole('button', { name: 'Confirmar bloqueio e listar clientes' }).click();
  await expect(page.getByText('Lote bloqueado · comunicação de recall')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Abrir aviso no WhatsApp' })).toHaveAttribute(
    'href',
    /^https:\/\/wa.me\//,
  );
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await page.screenshot({ path: 'test-results/operacao-rastreio.png', fullPage: true });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Bom dia|Boa tarde|Boa noite/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/painel-operacional.png', fullPage: true });
  expect(errors).toEqual([]);
});
