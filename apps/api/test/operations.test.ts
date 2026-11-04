import { beforeAll, afterAll, it, expect } from 'vitest';
import { config as dotenv } from 'dotenv';
import { execFileSync } from 'node:child_process';
import { randomUUID, randomBytes, createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
dotenv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });
const schema = `agro_ops_${randomBytes(6).toString('hex')}`;
const url = new URL(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!);
url.searchParams.set('schema', schema);
process.env.DATABASE_URL = url.toString();
process.env.NODE_ENV = 'test';
process.env.LOCAL_DEMO_ACCESS = '0';
process.env.WHATSAPP_APP_SECRET = 'test-only-meta-secret-1234567890';
process.env.WHATSAPP_PHONE_NUMBER_ID = '123456789012345';
process.env.WHATSAPP_VERIFY_TOKEN = 'test-only-verify-token-1234567890';
const origin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
let app: FastifyInstance;
let db: PrismaClient;
let cookie = '';
beforeAll(async () => {
  const cwd = fileURLToPath(new URL('..', import.meta.url));
  execFileSync(process.execPath, ['../../scripts/prisma.mjs', 'migrate', 'deploy'], {
    cwd,
    stdio: 'pipe',
    env: process.env,
  });
  execFileSync(process.execPath, ['../../node_modules/tsx/dist/cli.mjs', 'prisma/seed.ts'], {
    cwd,
    stdio: 'pipe',
    env: process.env,
  });
  db = (await import('../src/db.js')).db;
  app = await (await import('../src/app.js')).buildApp();
  await app.ready();
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { origin },
    payload: { email: 'dono@agrocerta.com', password: 'agro123' },
  });
  expect(login.statusCode).toBe(200);
  cookie = login.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
});
afterAll(async () => {
  if (app) await app.close();
  if (db) {
    await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await db.$disconnect();
  }
});
const get = (path: string) => app.inject({ url: `/api${path}`, headers: { cookie } });
const write = (
  path: string,
  payload: Record<string, unknown>,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'POST',
  key = randomUUID(),
) =>
  app.inject({
    method,
    url: `/api${path}`,
    headers: { origin, cookie, 'idempotency-key': key },
    payload,
  });
const requireOk = (
  response: { statusCode: number; body: string; json: () => unknown },
  status = 200,
) => {
  expect(response.statusCode, response.body).toBe(status);
  return response.json() as Record<string, unknown>;
};
it('executa produtor → 500 L → produção → reserva → entrega → recebível → pagamento e atualiza indicadores', async () => {
  const beforeDashboard = requireOk(await get('/dashboard?period=today'));
  const beforeMilk = Number(requireOk(await get('/milk-balance')).availableLiters);
  const producer = requireOk(
    await write('/producers', {
      name: 'Produtor Fluxo Completo',
      farm: 'Fazenda Integração',
      city: 'Prados',
      phone: '5532999999999',
      document: 'TESTE-PRODUTOR',
      pricePerLiter: 2.4,
      qualityBonus: 0,
      active: true,
    }),
    201,
  );
  const receiptKey = randomUUID();
  const receiptInput = {
    producerId: producer.id,
    liters: 500,
    temperature: 4,
    acidity: 16,
    fat: 3.8,
    protein: 3.3,
    scc: 200000,
    approved: true,
  };
  const received = await Promise.all([
    write('/receipts', receiptInput, 'POST', receiptKey),
    write('/receipts', receiptInput, 'POST', receiptKey),
  ]);
  const receipt = requireOk(received[0], 201);
  expect(requireOk(received[1], 201).id).toBe(receipt.id);
  expect(await db.milkReceipt.count({ where: { producerId: String(producer.id) } })).toBe(1);
  expect(Number(requireOk(await get('/milk-balance')).availableLiters)).toBeCloseTo(
    beforeMilk + 500,
    3,
  );
  const supplyBefore = await db.supply.findUniqueOrThrow({ where: { id: 'supply-1' } });
  const product = requireOk(
    await write('/products', {
      code: 'TSTQ',
      name: 'Queijo do fluxo integrado',
      unit: 'kg',
      category: 'Queijos frescos',
      salePrice: 45,
      shelfLifeDays: 14,
      minimumStock: 5,
      expectedLitersPerUnit: 10,
      kgPerUnit: 1,
      recipes: [
        { supplyId: 'supply-1', quantityPerUnit: 0.02 },
        { supplyId: 'supply-3', quantityPerUnit: 1 },
      ],
    }),
    201,
  );
  const productionKey = randomUUID();
  const input = {
    productId: product.id,
    receiptIds: [receipt.id],
    liters: 500,
    quantity: 50,
    status: 'RELEASED',
    notes: 'Fluxo automatizado real PostgreSQL',
  };
  const produced = await Promise.all([
    write('/production', input, 'POST', productionKey),
    write('/production', input, 'POST', productionKey),
  ]);
  const batch = requireOk(produced[0], 201);
  expect(requireOk(produced[1], 201).id).toBe(batch.id);
  expect(Number(batch.availableQuantity)).toBe(50);
  expect(Number(requireOk(await get('/milk-balance')).availableLiters)).toBeCloseTo(beforeMilk, 3);
  expect(
    (await db.supply.findUniqueOrThrow({ where: { id: 'supply-1' } })).stock.toNumber(),
  ).toBeCloseTo(supplyBefore.stock.toNumber() - 1, 5);
  const source = await db.productionMilkSource.findFirstOrThrow({
    where: { productionId: String(batch.productionId) },
  });
  expect(source.receiptId).toBe(receipt.id);
  expect(source.liters.toNumber()).toBe(500);
  expect(
    (
      await db.productionOrder.findUniqueOrThrow({ where: { id: String(batch.productionId) } })
    ).milkCost.toNumber(),
  ).toBe(1200);
  const customer = requireOk(
    await write('/customers', {
      name: 'Empório Integração',
      type: 'EMPORIUM',
      document: 'TESTE-CLIENTE',
      address: 'Rua do Teste, 10',
      neighborhood: 'Centro',
      city: 'Prados',
      contact: 'Cliente Teste',
      phone: '5532988888888',
      paymentTermDays: 14,
      creditLimit: 0,
      status: 'ACTIVE',
      routeId: 'route-0',
      prices: [{ productId: product.id, price: 45 }],
    }),
    201,
  );
  const orderInput = {
    customerId: customer.id,
    deliveryDate: new Date(Date.now() + 3600000).toISOString(),
    paymentMethod: 'PIX',
    status: 'CONFIRMED',
    items: [{ productId: product.id, quantity: 8 }],
  };
  const order = requireOk(await write('/orders', orderInput), 201);
  let stored = await db.batch.findUniqueOrThrow({ where: { id: String(batch.id) } });
  expect(stored.availableQuantity.toNumber()).toBe(50);
  expect(stored.reservedQuantity.toNumber()).toBe(8);
  const compete = await Promise.all([
    write('/orders', { ...orderInput, items: [{ productId: product.id, quantity: 30 }] }),
    write('/orders', { ...orderInput, items: [{ productId: product.id, quantity: 30 }] }),
  ]);
  expect(compete.map((r) => r.statusCode).sort()).toEqual([201, 409]);
  const competing = compete.find((r) => r.statusCode === 201)!.json();
  requireOk(await write(`/orders/${competing.id}/status`, { status: 'CANCELLED' }, 'PATCH'));
  expect((await write(`/orders/${order.id}/status`, { status: 'READY' }, 'PATCH')).statusCode).toBe(
    409,
  );
  requireOk(await write(`/orders/${order.id}/status`, { status: 'PICKING' }, 'PATCH'));
  requireOk(await write(`/orders/${order.id}/status`, { status: 'READY' }, 'PATCH'));
  requireOk(
    await write(
      `/batches/${batch.id}/status`,
      { status: 'BLOCKED', reason: 'Avaliação da qualidade' },
      'PATCH',
    ),
  );
  expect(
    (
      await write(`/orders/${order.id}/dispatch`, {
        routeId: 'route-0',
        driverId: 'driver-0',
        vehicleId: 'vehicle-0',
      })
    ).statusCode,
  ).toBe(409);
  requireOk(
    await write(
      `/batches/${batch.id}/status`,
      { status: 'RELEASED', reason: 'Qualidade verificada' },
      'PATCH',
    ),
  );
  const dispatchKey = randomUUID();
  const dispatched = await Promise.all([
    write(
      `/orders/${order.id}/dispatch`,
      { routeId: 'route-0', driverId: 'driver-0', vehicleId: 'vehicle-0' },
      'POST',
      dispatchKey,
    ),
    write(
      `/orders/${order.id}/dispatch`,
      { routeId: 'route-0', driverId: 'driver-0', vehicleId: 'vehicle-0' },
      'POST',
      dispatchKey,
    ),
  ]);
  const delivery = requireOk(dispatched[0]);
  expect(requireOk(dispatched[1]).id).toBe(delivery.id);
  const completeKey = randomUUID();
  const completed = await Promise.all([
    write(
      `/deliveries/${delivery.id}/complete`,
      { signature: 'Cliente Teste' },
      'POST',
      completeKey,
    ),
    write(
      `/deliveries/${delivery.id}/complete`,
      { signature: 'Cliente Teste' },
      'POST',
      completeKey,
    ),
  ]);
  completed.forEach((r) => requireOk(r));
  expect(
    (await write(`/deliveries/${delivery.id}/complete`, { signature: 'Cliente Teste' })).statusCode,
  ).toBe(409);
  stored = await db.batch.findUniqueOrThrow({ where: { id: String(batch.id) } });
  expect(stored.availableQuantity.toNumber()).toBe(42);
  expect(stored.reservedQuantity.toNumber()).toBe(0);
  expect(await db.stockMovement.count({ where: { batchId: stored.id, type: 'SALE' } })).toBe(1);
  const receivable = await db.receivable.findUniqueOrThrow({
    where: { orderId: String(order.id) },
  });
  expect(receivable.amount.toNumber()).toBe(360);
  requireOk(await write(`/receivables/${receivable.id}/pay`, { amount: 100, method: 'PIX' }));
  expect(
    (await write(`/receivables/${receivable.id}/pay`, { amount: 300, method: 'PIX' })).statusCode,
  ).toBe(409);
  requireOk(await write(`/receivables/${receivable.id}/pay`, { amount: 260, method: 'PIX' }));
  expect(
    (await db.receivable.findUniqueOrThrow({ where: { id: receivable.id } })).paidAmount.toNumber(),
  ).toBe(360);
  const after = requireOk(await get('/dashboard?period=today'));
  const kpi = (data: Record<string, unknown>, key: string) =>
    Number((data.kpis as { key: string; value: number }[]).find((k) => k.key === key)!.value);
  expect(kpi(after, 'milk') - kpi(beforeDashboard, 'milk')).toBeCloseTo(500, 2);
  expect(kpi(after, 'production') - kpi(beforeDashboard, 'production')).toBeCloseTo(50, 2);
  expect(kpi(after, 'revenue') - kpi(beforeDashboard, 'revenue')).toBeCloseTo(360, 2);
  const traced = requireOk(await get(`/traceability?code=${batch.code}`));
  expect((traced.sources as { producerId: string }[])[0].producerId).toBe(producer.id);
  expect((traced.customers as { name: string }[])[0].name).toBe(customer.name);
  expect(String(traced.qrCode)).toMatch(/^data:image\/png;base64,/);
  const publicPage = await app.inject(`/api/public/trace/${batch.code}`);
  expect(publicPage.statusCode).toBe(200);
  expect(publicPage.json()).not.toHaveProperty('customers');
  expect(JSON.stringify(publicPage.json())).not.toContain('phone');
  const label = await get(`/batches/${batch.id}/label.pdf`);
  expect(label.statusCode).toBe(200);
  expect(label.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
  const recall = requireOk(
    await write(`/batches/${batch.id}/recall`, { reason: 'Teste de recall integrado' }),
  );
  expect((recall.affectedCustomers as { name: string }[])[0].name).toBe(customer.name);
  expect((await db.batch.findUniqueOrThrow({ where: { id: String(batch.id) } })).status).toBe(
    'BLOCKED',
  );
  expect(
    (await write('/orders', { ...orderInput, items: [{ productId: product.id, quantity: 1 }] }))
      .statusCode,
  ).toBe(409);
  expect((await app.inject(`/api/public/trace/${batch.code}`)).json().status).toBe('BLOCKED');
});
it('rejeita leite fora dos parâmetros e estoque/consumo inválidos sem gravações parciais', async () => {
  const initial = await db.milkReceipt.count();
  expect(
    (
      await write('/receipts', {
        producerId: 'producer-0',
        liters: 500,
        temperature: 15,
        acidity: 16,
        fat: 3.8,
        protein: 3.3,
        scc: 200000,
        approved: true,
      })
    ).statusCode,
  ).toBe(400);
  expect(await db.milkReceipt.count()).toBe(initial);
  const before = await db.productionOrder.count();
  const milk = Number(requireOk(await get('/milk-balance')).availableLiters);
  expect(
    (
      await write('/production', {
        productId: 'product-0',
        liters: milk + 10000,
        quantity: 50,
        status: 'RELEASED',
      })
    ).statusCode,
  ).toBe(409);
  expect(await db.productionOrder.count()).toBe(before);
  expect(Number(requireOk(await get('/milk-balance')).availableLiters)).toBe(milk);
  const reserved = await db.batch.findFirstOrThrow({ where: { reservedQuantity: { gt: 0 } } });
  expect(
    (
      await write('/stock/adjust', {
        batchId: reserved.id,
        newQuantity: 0,
        reason: 'Teste de inventário',
        loss: false,
      })
    ).statusCode,
  ).toBe(409);
  expect(
    (await db.batch.findUniqueOrThrow({ where: { id: reserved.id } })).availableQuantity.toString(),
  ).toBe(reserved.availableQuantity.toString());
});
it('exige chave de idempotência e recusa reuso com dados diferentes', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/payables',
    headers: { origin, cookie },
    payload: {
      description: 'Conta teste',
      category: 'Energia',
      amount: 10,
      dueDate: new Date().toISOString(),
    },
  });
  expect(response.statusCode).toBe(400);
  const key = randomUUID();
  const input = {
    description: 'Conta teste',
    category: 'Energia',
    amount: 10,
    dueDate: new Date().toISOString(),
  };
  requireOk(await write('/payables', input, 'POST', key), 201);
  expect((await write('/payables', { ...input, amount: 20 }, 'POST', key)).statusCode).toBe(409);
});
it('mantém o acesso direto demo desativado em teste e nenhuma escrita é anônima', async () => {
  expect(
    (await app.inject({ method: 'POST', url: '/api/auth/demo', headers: { origin } })).statusCode,
  ).toBe(404);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/api/production',
        headers: { origin },
        payload: { productId: 'product-0', liters: 500, quantity: 50, status: 'RELEASED' },
      })
    ).statusCode,
  ).toBe(401);
});

it('exporta relatórios filtrados e mantém DRE e saldo de caixa conciliados', async () => {
  const customer = await db.customer.findUniqueOrThrow({ where: { document: 'TESTE-CLIENTE' } });
  const product = await db.product.findUniqueOrThrow({ where: { code: 'TSTQ' } });
  const sales = requireOk(
    await get(
      `/reports?type=sales&period=today&customerId=${customer.id}&productId=${product.id}&limit=1`,
    ),
  );
  expect(sales.total).toBe(1);
  expect((sales.summary as Record<string, number>)['Faturamento entregue']).toBe(360);
  expect((sales.rows as Record<string, unknown>[])[0].customer).toBe(customer.name);
  const csv = await get(`/reports?type=sales&period=today&customerId=${customer.id}&format=csv`);
  expect(csv.headers['content-type']).toContain('text/csv');
  expect(csv.body).toContain(customer.name);
  const pdf = await get(`/reports?type=production&period=month&productId=${product.id}&format=pdf`);
  expect(pdf.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
  const cash = requireOk(await get('/finance/summary'));
  const incoming = await db.receivablePayment.aggregate({ _sum: { amount: true } });
  const outgoing = await db.payablePayment.aggregate({ _sum: { amount: true } });
  expect(Number(cash.cashIn)).toBeCloseTo(Number(incoming._sum.amount), 2);
  expect(Number(cash.cashOut)).toBeCloseTo(Number(outgoing._sum.amount), 2);
  const dre = requireOk(await get('/reports?type=finance&period=month'));
  const s = dre.summary as Record<string, number>;
  expect(s['Resultado gerencial']).toBeCloseTo(
    s['Receita por competência'] -
      s['Custo dos produtos vendidos'] -
      s['Perdas de estoque'] -
      s['Fixos sem produção (proporcional)'] -
      s['Variação de inventário'],
    2,
  );
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { origin },
    payload: { email: 'comercial@agrocerta.com', password: 'agro123' },
  });
  const salesCookie = login.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const commercial = await app.inject({
    url: '/api/reports?type=sales',
    headers: { cookie: salesCookie },
  });
  expect(commercial.statusCode).toBe(200);
  expect(commercial.json().columns.some((c: { key: string }) => c.key === 'cost')).toBe(false);
  expect(
    (await app.inject({ url: '/api/reports?type=finance', headers: { cookie: salesCookie } }))
      .statusCode,
  ).toBe(403);
});
it('gera recorrências uma única vez, respeita exceção, pausa e edição de itens futuros', async () => {
  const customer = await db.customer.findUniqueOrThrow({ where: { document: 'TESTE-CLIENTE' } });
  const product = await db.product.findUniqueOrThrow({ where: { code: 'TSTQ' } });
  const plan = requireOk(
    await write('/recurring', {
      customerId: customer.id,
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      paymentMethod: 'PIX',
      items: [{ productId: product.id, quantity: 1 }],
    }),
    201,
  );
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const day = tomorrow.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  requireOk(await write(`/recurring/${plan.id}/skip`, { date: day }));
  const first = requireOk(await write('/recurring/generate', {}));
  expect(Number(first.created)).toBeGreaterThanOrEqual(6);
  expect(await db.order.count({ where: { recurringOrderId: String(plan.id) } })).toBe(6);
  expect(await db.order.count({ where: { occurrenceKey: `${plan.id}|${day}` } })).toBe(0);
  const total = await db.order.count();
  const again = requireOk(await write('/recurring/generate', {}));
  expect(again.created).toBe(0);
  expect(await db.order.count()).toBe(total);
  requireOk(await write(`/recurring/${plan.id}/pause`, { paused: true }, 'PATCH'));
  requireOk(
    await write(
      `/recurring/${plan.id}`,
      {
        customerId: customer.id,
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        paused: true,
        paymentMethod: 'PIX',
        items: [{ productId: product.id, quantity: 2 }],
      },
      'PUT',
    ),
  );
  expect(
    (
      await db.recurringOrder.findUniqueOrThrow({
        where: { id: String(plan.id) },
        include: { items: true },
      })
    ).items[0].quantity.toNumber(),
  ).toBe(2);
  expect(
    (
      await db.orderItem.findFirstOrThrow({
        where: { order: { recurringOrderId: String(plan.id) } },
      })
    ).quantity.toNumber(),
  ).toBe(1);
});
it('processa mensagens demonstrativas, preço do cliente, modelos e links sem alegar envio real', async () => {
  const customer = requireOk(
    await write('/customers', {
      name: 'Empório WhatsApp Teste',
      type: 'EMPORIUM',
      document: 'TESTE-WHATSAPP',
      address: 'Rua Teste, 20',
      neighborhood: 'Centro',
      city: 'Prados',
      contact: 'Contato WhatsApp',
      phone: '5511999999876',
      paymentTermDays: 14,
      creditLimit: 0,
      status: 'ACTIVE',
      prices: [{ productId: 'product-0', price: 44.44 }],
    }),
    201,
  );
  const incoming = requireOk(
    await write('/whatsapp/messages', {
      customerId: customer.id,
      content: '10 kg de minas frescal e 5 requeijão',
    }),
  );
  const proposal = incoming.proposal as {
    items: { productId: string; quantity: number; unitPrice: number }[];
    warnings: string[];
  };
  expect(proposal.warnings).toHaveLength(0);
  expect(proposal.items).toHaveLength(2);
  expect(proposal.items[0].quantity).toBe(10);
  expect(proposal.items[0].unitPrice).toBe(44.44);
  const messageCount = await db.whatsAppMessage.count();
  expect(
    (await write('/whatsapp/prepare', { customerId: customer.id, content: 'Olá, {cliente}!' }))
      .statusCode,
  ).toBe(400);
  expect(await db.whatsAppMessage.count()).toBe(messageCount);
  const prepared = requireOk(
    await write('/whatsapp/prepare', {
      customerId: customer.id,
      content: 'Olá! Seu pedido está pronto.',
    }),
  );
  expect(String(prepared.whatsappUrl)).toContain('https://wa.me/5511999999876?text=');
  expect((prepared.message as { direction: string }).direction).toBe('PREPARED_DEMO');
  const template = await db.messageTemplate.findFirstOrThrow();
  expect(
    (
      await write(
        `/whatsapp/templates/${template.id}`,
        { name: 'Modelo inválido', content: 'Olá {segredo}' },
        'PUT',
      )
    ).statusCode,
  ).toBe(400);
  requireOk(
    await write(
      `/whatsapp/templates/${template.id}`,
      {
        name: 'Confirmação testada',
        content: 'Olá, {cliente}! Pedido: {itens}. Total {total}. Entrega {data}.',
      },
      'PUT',
    ),
  );
  const order = requireOk(
    await write('/orders', {
      customerId: customer.id,
      deliveryDate: new Date(Date.now() + 3600000).toISOString(),
      paymentMethod: 'PIX',
      status: 'CONFIRMED',
      items: proposal.items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
      })),
    }),
    201,
  );
  expect(Number(order.total)).toBeCloseTo(10 * 44.44 + 5 * 42, 2);
  requireOk(await write(`/orders/${order.id}/status`, { status: 'CANCELLED' }, 'PATCH'));
});
it('valida HMAC e verificação Meta e não duplica mensagens de webhook repetidas', async () => {
  const customer = await db.customer.findUniqueOrThrow({ where: { document: 'TESTE-WHATSAPP' } });
  const messageId = `wamid.test.${randomUUID()}`;
  const payload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: '123456789012345' },
              messages: [
                {
                  id: messageId,
                  from: customer.phone,
                  type: 'text',
                  text: { body: 'Mensagem oficial assinada de teste' },
                },
              ],
            },
          },
        ],
      },
    ],
  };
  const body = JSON.stringify(payload);
  const signature = `sha256=${createHmac('sha256', process.env.WHATSAPP_APP_SECRET!).update(body).digest('hex')}`;
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/api/whatsapp/webhook',
        headers: { 'content-type': 'application/json' },
        payload: body,
      })
    ).statusCode,
  ).toBe(401);
  for (let i = 0; i < 2; i++) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/whatsapp/webhook',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature },
      payload: body,
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().accepted).toBe(1);
  }
  expect(
    await db.whatsAppMessage.count({
      where: {
        customerId: customer.id,
        direction: 'INBOUND_OFFICIAL',
        content: 'Mensagem oficial assinada de teste',
      },
    }),
  ).toBe(1);
  const challenge = await app.inject(
    `/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${process.env.WHATSAPP_VERIFY_TOKEN}&hub.challenge=12345`,
  );
  expect(challenge.statusCode).toBe(200);
  expect(challenge.body).toBe('12345');
  expect(
    (
      await app.inject(
        '/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=12345',
      )
    ).statusCode,
  ).toBe(403);
});
it('salva parâmetros, recalcula rateio e simula R$ 0,20 por litro sem alterar lotes na simulação', async () => {
  const data = requireOk(await get('/settings'));
  const company = data.company as Record<string, unknown>;
  requireOk(
    await write(
      '/settings',
      {
        name: company.name,
        document: company.document,
        city: company.city,
        address: company.address,
        expiryAlertDays: 10,
        qualityParameters: {
          maxTemperature: 7,
          minAcidity: 14,
          maxAcidity: 18,
          maxScc: 500000,
          minFat: 2.8,
          minProtein: 2.9,
        },
      },
      'PUT',
    ),
  );
  const month = new Date()
    .toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
    .slice(0, 7);
  requireOk(
    await write('/settings/fixed-costs', { month, category: 'Teste de rateio', amount: 100 }),
  );
  const product = await db.product.findUniqueOrThrow({ where: { code: 'TSTQ' } });
  const before = await db.batch.findFirstOrThrow({ where: { productId: product.id } });
  const result = requireOk(
    await write('/finance/simulate', { productId: product.id, month, delta: 0.2 }),
  );
  const row = (
    result.rows as { deltaTotal: number; currentCost: number; simulatedCost: number }[]
  )[0];
  expect(row.deltaTotal).toBe(100);
  expect(row.simulatedCost - row.currentCost).toBeCloseTo(2, 4);
  expect((await db.batch.findUniqueOrThrow({ where: { id: before.id } })).unitCost.toString()).toBe(
    before.unitCost.toString(),
  );
  const route = requireOk(
    await write('/settings/routes', { name: 'Rota de homologação', city: 'Prados' }),
  );
  const vehicle = requireOk(
    await write('/settings/vehicles', {
      name: 'Veículo homologação',
      plate: 'TST1A23',
      capacityKg: 500,
    }),
  );
  requireOk(
    await write(
      `/settings/vehicles/${vehicle.id}`,
      { name: 'Veículo homologação', plate: 'TST1A23', capacityKg: 700 },
      'PUT',
    ),
  );
  expect(
    (
      await db.vehicle.findUniqueOrThrow({ where: { id: String(vehicle.id) } })
    ).capacityKg.toNumber(),
  ).toBe(700);
  requireOk(await write(`/settings/routes/${route.id}`, {}, 'DELETE'));
});
it('registra compra e perda com saldo, financeiro e auditoria consistentes', async () => {
  const supply = requireOk(
    await write('/supplies', {
      name: 'Embalagem teste integrado',
      unit: 'un',
      unitCost: 1.5,
      minimumStock: 10,
    }),
    201,
  );
  const purchase = requireOk(
    await write('/stock/purchase', {
      supplyId: supply.id,
      lotCode: 'TESTE-INS-01',
      quantity: 100,
      unitCost: 1.5,
      supplier: 'Fornecedor Teste',
    }),
    201,
  );
  expect(
    (await db.supply.findUniqueOrThrow({ where: { id: String(supply.id) } })).stock.toNumber(),
  ).toBe(100);
  const payable = await db.payable.findFirstOrThrow({ where: { reference: String(purchase.id) } });
  expect(payable.amount.toNumber()).toBe(150);
  requireOk(await write(`/payables/${payable.id}/pay`, { amount: 50, method: 'PIX' }));
  expect(
    (await db.payable.findUniqueOrThrow({ where: { id: payable.id } })).paidAmount.toNumber(),
  ).toBe(50);
  const batch = await db.batch.findFirstOrThrow({ where: { product: { code: 'TSTQ' } } });
  requireOk(
    await write('/stock/adjust', {
      batchId: batch.id,
      newQuantity: 40,
      reason: 'Descarte por avaria de embalagem',
      loss: true,
    }),
  );
  const loss = await db.lossRecord.findFirstOrThrow({ where: { batchId: batch.id } });
  expect(loss.quantity.toNumber()).toBe(2);
  expect(loss.cost.toNumber()).toBeCloseTo(batch.unitCost.mul(2).toDecimalPlaces(2).toNumber(), 2);
  expect(
    (await db.batch.findUniqueOrThrow({ where: { id: batch.id } })).availableQuantity.toNumber(),
  ).toBe(40);
  expect(await db.auditLog.count({ where: { action: 'STOCK_ADJUST' } })).toBeGreaterThan(0);
});
it('publica, edita e exclui mural e gera extratos e comprovantes PDF reais', async () => {
  const announcement = requireOk(
    await write('/announcements', {
      title: 'Aviso operacional de teste',
      content: 'Recebimento e produção validados no ambiente.',
    }),
    201,
  );
  requireOk(
    await write(
      `/announcements/${announcement.id}`,
      { title: 'Aviso atualizado', content: 'Fluxo operacional concluído e testado.' },
      'PUT',
    ),
  );
  expect(
    (await db.announcement.findUniqueOrThrow({ where: { id: String(announcement.id) } })).title,
  ).toBe('Aviso atualizado');
  requireOk(await write(`/announcements/${announcement.id}`, {}, 'DELETE'));
  expect(await db.announcement.count({ where: { id: String(announcement.id) } })).toBe(0);
  const producer = await db.producer.findUniqueOrThrow({ where: { document: 'TESTE-PRODUTOR' } });
  const receipt = await get(`/producers/${producer.id}/statement.pdf`);
  expect(receipt.statusCode).toBe(200);
  expect(receipt.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
  const delivery = await db.delivery.findFirstOrThrow({
    where: { order: { customer: { document: 'TESTE-CLIENTE' } } },
  });
  const proof = await get(`/deliveries/${delivery.id}/receipt.pdf`);
  expect(proof.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
  const manifest = await get('/deliveries/manifest.pdf');
  expect(manifest.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
});

it('reserva por validade antes da fabricação e divide o pedido entre lotes sem exceder saldo', async () => {
  const producer = await db.producer.findUniqueOrThrow({ where: { document: 'TESTE-PRODUTOR' } });
  const receipt = requireOk(
    await write('/receipts', {
      producerId: producer.id,
      liters: 200,
      temperature: 4,
      acidity: 16,
      fat: 3.8,
      protein: 3.3,
      scc: 200000,
      approved: true,
    }),
    201,
  );
  const definition = {
    code: 'PVPSTEST',
    name: 'Queijo de teste PVPS',
    unit: 'kg',
    category: 'Queijos frescos',
    salePrice: 50,
    shelfLifeDays: 20,
    minimumStock: 0,
    expectedLitersPerUnit: 10,
    kgPerUnit: 1,
    recipes: [{ supplyId: 'supply-1', quantityPerUnit: 0.02 }],
  };
  const product = requireOk(await write('/products', definition), 201);
  const first = requireOk(
    await write('/production', {
      productId: product.id,
      receiptIds: [receipt.id],
      liters: 100,
      quantity: 10,
      status: 'RELEASED',
    }),
    201,
  );
  requireOk(await write(`/products/${product.id}`, { ...definition, shelfLifeDays: 5 }, 'PUT'));
  const second = requireOk(
    await write('/production', {
      productId: product.id,
      receiptIds: [receipt.id],
      liters: 100,
      quantity: 10,
      status: 'RELEASED',
    }),
    201,
  );
  const customer = await db.customer.findUniqueOrThrow({ where: { document: 'TESTE-CLIENTE' } });
  const order = requireOk(
    await write('/orders', {
      customerId: customer.id,
      deliveryDate: new Date(Date.now() + 3600000).toISOString(),
      paymentMethod: 'PIX',
      status: 'CONFIRMED',
      items: [{ productId: product.id, quantity: 15 }],
    }),
    201,
  );
  const items = await db.orderItem.findMany({ where: { orderId: String(order.id) } });
  expect(items).toHaveLength(2);
  expect(items.find((i) => i.batchId === second.id)!.quantity.toNumber()).toBe(10);
  expect(items.find((i) => i.batchId === first.id)!.quantity.toNumber()).toBe(5);
  expect(Number(order.total)).toBe(750);
  requireOk(await write(`/orders/${order.id}/status`, { status: 'CANCELLED' }, 'PATCH'));
  for (const id of [String(first.id), String(second.id)])
    expect((await db.batch.findUniqueOrThrow({ where: { id } })).reservedQuantity.toNumber()).toBe(
      0,
    );
});
it('reflete ganhos e reduções de inventário no saldo e na DRE sem alterar o caixa', async () => {
  const batch = await db.batch.findFirstOrThrow({ where: { product: { code: 'TSTQ' } } });
  const before = requireOk(await get('/finance/summary'));
  requireOk(
    await write('/stock/adjust', {
      batchId: batch.id,
      newQuantity: 41,
      reason: 'Contagem física: unidade recuperada',
      loss: false,
    }),
  );
  const after = requireOk(await get('/finance/summary'));
  expect(Number(after.cashIn)).toBe(Number(before.cashIn));
  expect(Number(after.cashOut)).toBe(Number(before.cashOut));
  const movement = await db.stockMovement.findFirstOrThrow({
    where: { batchId: batch.id, type: 'ADJUSTMENT' },
  });
  expect(movement.quantity.toNumber()).toBe(1);
  const report = requireOk(await get('/reports?type=finance&period=month'));
  const summary = report.summary as Record<string, number>;
  expect(summary['Variação de inventário']).toBeCloseTo(-batch.unitCost.toNumber(), 2);
  expect(summary['Resultado gerencial']).toBeCloseTo(
    summary['Receita por competência'] -
      summary['Custo dos produtos vendidos'] -
      summary['Perdas de estoque'] -
      summary['Fixos sem produção (proporcional)'] -
      summary['Variação de inventário'],
    2,
  );
});
it('protege CSV de conteúdo que seria interpretado como fórmula de planilha', async () => {
  const producer = requireOk(
    await write('/producers', {
      name: '=1+1',
      farm: 'Fazenda CSV',
      city: 'Prados',
      phone: '5532999990000',
      document: 'TESTE-CSV',
      pricePerLiter: 2.4,
      qualityBonus: 0,
      active: true,
    }),
    201,
  );
  requireOk(
    await write('/receipts', {
      producerId: producer.id,
      liters: 10,
      temperature: 4,
      acidity: 16,
      fat: 3.8,
      protein: 3.3,
      scc: 200000,
      approved: false,
    }),
    201,
  );
  const csv = await get(`/reports?type=milk&period=today&producerId=${producer.id}&format=csv`);
  expect(csv.statusCode).toBe(200);
  expect(csv.body).toContain('"\'=1+1"');
});
