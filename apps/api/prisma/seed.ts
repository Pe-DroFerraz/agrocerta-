import '../src/config.js';
import { Prisma, RoleKey, BatchStatus, OrderStatus, MovementType } from '@prisma/client';
import bcrypt from 'bcrypt';
import { createDb } from '../src/db.js';
import { calculateCost } from '../src/calculations.js';
const db = createDb();
const money = (v: number) => Number(v.toFixed(2));
const decimal = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const dateAt = (days: number) => {
  const key = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const d = new Date(`${key}T12:00:00-03:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
};
let state = 20261104;
const random = () => {
  state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  return state / 4294967296;
};
async function seed() {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Seed de demonstração proibido em produção.');
  if (await db.company.count()) {
    console.log(
      'Demonstração já existente; nenhum dado alterado. Para recriar: npm run reset -- --yes',
    );
    return;
  }
  const passwordHash = await bcrypt.hash('agro123', 12);
  await db.$transaction(
    async (tx) => {
      await tx.company.create({
        data: {
          id: 'demo-company',
          name: 'Agro Certa',
          document: 'DEMO-EMPRESA',
          city: 'São João del-Rei / MG',
          address: 'Estrada do Campo, 120 — Zona Rural',
          qualityParameters: { maxTemperature: 7, minAcidity: 14, maxAcidity: 18, maxScc: 500000 },
        },
      });
      await tx.role.createMany({
        data: [
          { id: 'role-owner', key: RoleKey.OWNER, name: 'Dono / Gestor' },
          { id: 'role-production', key: RoleKey.PRODUCTION, name: 'Produção' },
          { id: 'role-sales', key: RoleKey.SALES, name: 'Comercial' },
          { id: 'role-driver', key: RoleKey.DRIVER, name: 'Entregador' },
        ],
      });
      await tx.user.createMany({
        data: [
          {
            id: 'owner',
            name: 'Pedro Oliveira',
            email: 'dono@agrocerta.com',
            roleId: 'role-owner',
          },
          {
            id: 'production',
            name: 'Ana Souza',
            email: 'producao@agrocerta.com',
            roleId: 'role-production',
          },
          {
            id: 'sales',
            name: 'Marina Costa',
            email: 'comercial@agrocerta.com',
            roleId: 'role-sales',
          },
          ...['João Mendes', 'Carlos Lima', 'Paulo Alves'].map((name, i) => ({
            id: `driver-${i}`,
            name,
            email: i === 0 ? 'entregador@agrocerta.com' : `entregador${i + 1}@agrocerta.com`,
            roleId: 'role-driver',
          })),
        ].map((u) => ({ ...u, passwordHash })),
      });
      const cities = [
        'São João del-Rei',
        'Tiradentes',
        'Prados',
        'Barbacena',
        'Lavras',
        'Serro',
        'São Roque de Minas',
        'Carrancas',
        'Resende Costa',
        'Lagoa Dourada',
      ];
      const names = [
        'José Almeida',
        'Maria Ferreira',
        'Antônio Silva',
        'Rosa Carvalho',
        'Francisco Santos',
        'Lúcia Ribeiro',
        'Pedro Nascimento',
        'Helena Gomes',
        'João Batista',
        'Celina Andrade',
      ];
      const producers = names.map((name, i) => ({
        id: `producer-${i}`,
        name,
        farm: [
          'Boa Esperança',
          'Santa Clara',
          'Bela Vista',
          'São José',
          'Água Limpa',
          'Dois Irmãos',
          'Canastra',
          'Sol Nascente',
          'Campo Verde',
          'Primavera',
        ][i],
        city: cities[i],
        phone: `553299900${String(i).padStart(4, '0')}`,
        document: `DEMO-P-${i}`,
        pricePerLiter: money(2.1 + i * 0.05),
        qualityBonus: i === 9 ? 0 : 0.05,
      }));
      await tx.producer.createMany({ data: producers });
      const receipts: Prisma.MilkReceiptCreateManyInput[] = [];
      for (let day = -89; day <= 0; day++)
        for (let i = 0; i < 10; i++) {
          const approved = !(i === 9 && day % 4 === 0);
          receipts.push({
            id: `receipt-${day + 89}-${i}`,
            date: dateAt(day),
            producerId: `producer-${i}`,
            liters: money(155 + 55 * random() + 12 * Math.sin(day / 9)),
            temperature: approved ? money(3 + random() * 3) : 9.2,
            acidity: approved ? money(15 + random() * 2) : 20,
            fat: money(3.5 + random() * 0.6),
            protein: money(3.1 + random() * 0.4),
            scc: approved ? Math.round(150000 + random() * 180000) : 720000,
            approved,
            pricePerLiter: money(
              Number(producers[i].pricePerLiter) + Number(producers[i].qualityBonus),
            ),
            responsibleId: 'production',
          });
        }
      await tx.milkReceipt.createMany({ data: receipts });
      const definitions: [string, string, number, number, number, string][] = [
        ['QMF', 'Queijo minas frescal', 10, 12, 45, 'Queijos frescos'],
        ['QMP', 'Queijo minas padrão', 11, 40, 59, 'Queijos maturados'],
        ['QMC', 'Queijo meia cura', 13, 60, 68, 'Queijos maturados'],
        ['QAR', 'Queijo do Serro / Canastra', 12, 60, 76, 'Artesanais'],
        ['RIC', 'Ricota fresca', 7, 7, 32, 'Queijos frescos'],
        ['MUC', 'Muçarela', 10, 30, 48, 'Queijos'],
        ['REQ', 'Requeijão', 8, 20, 42, 'Cremosos'],
        ['DDL', 'Doce de leite', 2.5, 90, 28, 'Doces'],
        ['IOG', 'Iogurte natural', 1.1, 15, 12, 'Bebidas'],
        ['MAN', 'Manteiga', 20, 45, 65, 'Cremosos'],
        ['LPA', 'Leite pasteurizado', 1, 4, 6, 'Bebidas'],
      ];
      const products = definitions.map(
        ([code, name, expectedLitersPerUnit, shelfLifeDays, salePrice, category], i) => ({
          id: `product-${i}`,
          code,
          name,
          expectedLitersPerUnit,
          shelfLifeDays,
          salePrice,
          category,
          minimumStock: 15,
          kgPerUnit: i === 8 || i === 10 ? 1.03 : 1,
          unit: i === 8 || i === 10 ? 'L' : 'kg',
        }),
      );
      await tx.product.createMany({ data: products });
      const supplyNames = [
        'Coalho líquido',
        'Sal refinado',
        'Fermento lácteo',
        'Embalagem 1 kg',
        'Açúcar cristal',
        'Cultura para iogurte',
        'Ácido cítrico',
        'Pote 500 g',
        'Garrafa 1 L',
        'Selo de segurança',
        'Filme termoencolhível',
        'Caixa de transporte',
        'Saco para queijo',
        'Rótulo frescal',
        'Rótulo meia cura',
        'Rótulo padrão',
        'Rótulo muçarela',
        'Rótulo requeijão',
        'Rótulo doce',
        'Rótulo iogurte',
        'Rótulo manteiga',
        'Rótulo leite',
        'Etiqueta de lote',
        'Lacre',
        'Papel alimentício',
      ];
      const rawUnits = ['L', 'kg', 'g', 'un', 'kg', 'g', 'kg'];
      const rawCosts = [38, 2.8, 0.85, 0.65, 3.7, 0.9, 30];
      const rawStock = [25, 300, 1000, 10000, 1000, 800, 25];
      const supplies = supplyNames.map((name, i) => ({
        id: `supply-${i}`,
        name,
        unit: rawUnits[i] ?? 'un',
        unitCost: rawCosts[i] ?? money(0.55 + i * 0.03),
        stock: rawStock[i] ?? 10000,
        minimumStock: i === 0 || i === 6 ? 5 : i <= 6 ? 50 : 100,
      }));
      const supplyUsed = new Map<string, number>();
      const purchases = supplies.map((s, i) => ({
        id: `purchase-${i}`,
        supplyId: s.id,
        lotCode: `INS-2026-${String(i + 1).padStart(3, '0')}`,
        date: dateAt(-90),
        expiresAt: dateAt(180),
        quantity: s.stock,
        unitCost: s.unitCost,
        supplier: 'Cooperativa de Insumos Mineiros',
      }));
      const recipeDefinition = (i: number): [number, number][] =>
        i === 4
          ? [
              [6, 0.004],
              [1, 0.005],
              [3, 1],
            ]
          : i < 6
            ? [
                [0, 0.003],
                [1, 0.02],
                [2, 0.1],
                [3, 1],
              ]
            : i === 6
              ? [
                  [1, 0.015],
                  [2, 0.1],
                  [7, 2],
                ]
              : i === 7
                ? [
                    [4, 0.6],
                    [7, 2],
                  ]
                : i === 8
                  ? [
                      [5, 0.1],
                      [8, 1],
                    ]
                  : i === 9
                    ? [
                        [1, 0.01],
                        [24, 1],
                      ]
                    : [
                        [8, 1],
                        [23, 1],
                      ];
      const recipes = products.flatMap((p, i) =>
        recipeDefinition(i).map(([s, q]) => ({
          productId: p.id,
          supplyId: `supply-${s}`,
          quantityPerUnit: q,
        })),
      );
      const productionPlans = Array.from({ length: 120 }, (_, i) => {
        const p = products[i % 11];
        const day = -89 + Math.floor((i * 89) / 119);
        const quantity = money(24 + random() * 12);
        return {
          i,
          p,
          day,
          date: dateAt(day),
          quantity,
          liters: money(quantity * p.expectedLitersPerUnit * (0.93 + random() * 0.16)),
        };
      });
      const monthly = new Map<string, number>();
      for (const p of productionPlans) {
        const key = p.date.toISOString().slice(0, 7);
        monthly.set(key, (monthly.get(key) ?? 0) + p.quantity * p.p.kgPerUnit);
      }
      for (const [month] of monthly) {
        await tx.fixedCost.createMany({
          data: [
            { month, category: 'Energia', amount: 450 },
            { month, category: 'Água', amount: 150 },
            { month, category: 'Mão de obra (parcela demonstrativa)', amount: 600 },
          ],
        });
        await tx.payable.create({
          data: {
            description: `Custos fixos ${month}`,
            category: 'FIXED',
            amount: 1200,
            paidAmount: month === dateAt(0).toISOString().slice(0, 7) ? 0 : 1200,
            dueDate: new Date(`${month}-28T15:00:00Z`),
          },
        });
      }
      const productions: Prisma.ProductionOrderCreateManyInput[] = [];
      const sources: Prisma.ProductionMilkSourceCreateManyInput[] = [];
      const uses: Prisma.ProductionSupplyUseCreateManyInput[] = [];
      const batches: Prisma.BatchCreateManyInput[] = [];
      const movements: Prisma.StockMovementCreateManyInput[] = [];
      const consumedMilk = new Map<string, number>();
      for (const plan of productionPlans) {
        const { i, p, date, quantity, liters } = plan;
        let remaining = liters;
        const allocations: { liters: number; price: number }[] = [];
        for (const r of receipts.filter(
          (r) => new Date(r.date).getTime() === date.getTime() && r.approved,
        )) {
          const available = Number(r.liters) - (consumedMilk.get(r.id!) ?? 0);
          const take = money(Math.min(remaining, available));
          if (take <= 0) continue;
          consumedMilk.set(r.id!, money((consumedMilk.get(r.id!) ?? 0) + take));
          remaining = money(remaining - take);
          allocations.push({ liters: take, price: Number(r.pricePerLiter) });
          sources.push({ productionId: `production-${i}`, receiptId: r.id!, liters: take });
          if (remaining <= 0) break;
        }
        if (remaining > 0.01) throw new Error('Leite insuficiente na demonstração.');
        const ingredients = recipeDefinition(i % 11).map(([id, perUnit]) => ({
          id,
          quantity: quantity * perUnit,
        }));
        for (const ingredient of ingredients) {
          const s = supplies[ingredient.id];
          supplyUsed.set(s.id, (supplyUsed.get(s.id) ?? 0) + ingredient.quantity);
          uses.push({
            productionId: `production-${i}`,
            supplyId: s.id,
            purchaseId: `purchase-${ingredient.id}`,
            quantity: ingredient.quantity,
            unitCost: s.unitCost,
          });
          movements.push({
            supplyId: s.id,
            type: MovementType.PRODUCTION,
            quantity: -ingredient.quantity,
            reason: 'Consumo na produção',
            reference: `production-${i}`,
            date,
          });
        }
        const cost = calculateCost({
          milk: allocations,
          supplies: ingredients.map((v) => ({
            quantity: v.quantity,
            unitCost: supplies[v.id].unitCost,
          })),
          monthlyFixed: 1200,
          monthlyProduction: monthly.get(date.toISOString().slice(0, 7))!,
          quantity,
          allocationWeightKg: quantity * p.kgPerUnit,
          liters,
          losses: 0,
          salePrice: p.salePrice,
        });
        productions.push({
          id: `production-${i}`,
          productId: p.id,
          date,
          litersUsed: liters,
          quantityProduced: quantity,
          milkCost: cost.milk,
          supplyCost: cost.supplies,
          overheadCost: cost.overhead,
          lossCost: 0,
          totalCost: cost.total,
          responsibleId: 'production',
          notes: 'Produção de demonstração com origem rastreável.',
        });
        const expiry = new Date(date.getTime() + p.shelfLifeDays * 86400000);
        const status =
          i === 116 || i === 117
            ? BatchStatus.BLOCKED
            : i === 118
              ? BatchStatus.MATURING
              : expiry < dateAt(0)
                ? BatchStatus.EXPIRED
                : BatchStatus.RELEASED;
        batches.push({
          id: `batch-${i}`,
          code: `${p.code}-${date.toISOString().slice(0, 10).replaceAll('-', '')}-${String(i + 1).padStart(3, '0')}`,
          productId: p.id,
          productionId: `production-${i}`,
          manufacturedAt: date,
          expiresAt: expiry,
          status,
          initialQuantity: quantity,
          availableQuantity: quantity,
          reservedQuantity: 0,
          unitCost: cost.perUnit,
        });
        movements.push({
          batchId: `batch-${i}`,
          type: MovementType.PRODUCTION,
          quantity,
          reason: 'Entrada de produção',
          reference: `production-${i}`,
          date,
        });
      }
      await tx.supply.createMany({
        data: supplies.map((s) => ({
          ...s,
          stock: Number((s.stock - (supplyUsed.get(s.id) ?? 0)).toFixed(5)),
        })),
      });
      await tx.supplyPurchase.createMany({ data: purchases });
      await tx.recipeItem.createMany({ data: recipes });
      movements.push(
        ...purchases.map((p) => ({
          supplyId: p.supplyId,
          type: MovementType.PURCHASE,
          quantity: p.quantity,
          reason: 'Compra inicial',
          reference: p.id,
          date: p.date,
        })),
      );
      await tx.productionOrder.createMany({ data: productions });
      await tx.productionMilkSource.createMany({ data: sources });
      await tx.productionSupplyUse.createMany({ data: uses });
      const routes = ['Campo das Vertentes', 'Serra e Sabores', 'Circuito das Fazendas'].map(
        (name, i) => ({ id: `route-${i}`, name, city: cities[i] }),
      );
      await tx.route.createMany({ data: routes });
      await tx.vehicle.createMany({
        data: Array.from({ length: 3 }, (_, i) => ({
          id: `vehicle-${i}`,
          name: ['Fiorino refrigerada', 'Van refrigerada', 'Utilitário leve'][i],
          plate: `DEM${i}A2${i}0`,
          capacityKg: 500 + i * 200,
        })),
      });
      const customers = Array.from({ length: 35 }, (_, i) => ({
        id: `customer-${i}`,
        name: `${['Mercado', 'Padaria', 'Restaurante', 'Empório', 'Mercearia'][i % 5]} ${['da Praça', 'Sabor de Minas', 'Boa Mesa', 'do Campo', 'Santa Rita', 'Central', 'das Vertentes'][Math.floor(i / 5)]}`,
        type: ['MARKET', 'BAKERY', 'RESTAURANT', 'EMPORIUM', 'MARKET'][i % 5],
        document: `DEMO-C-${i}`,
        address: `Rua das Flores, ${20 + i * 7}`,
        neighborhood: 'Centro',
        city: cities[i % 10],
        contact: `Contato ${i + 1}`,
        phone: `553298800${String(i).padStart(4, '0')}`,
        creditLimit: 2500,
        paymentTermDays: 14,
        routeId: `route-${i % 3}`,
      }));
      await tx.customer.createMany({ data: customers });
      await tx.customerPrice.createMany({
        data: customers.flatMap((c, i) =>
          products.map((p) => ({
            customerId: c.id,
            productId: p.id,
            price: money(p.salePrice * (i % 3 === 0 ? 0.95 : 1)),
          })),
        ),
      });
      await tx.recurringOrder.createMany({
        data: customers.slice(0, 8).map((c, i) => ({
          id: `recurring-${i}`,
          customerId: c.id,
          weekdays: [1, 4],
          paymentMethod: 'PIX',
        })),
      });
      await tx.recurringOrderItem.createMany({
        data: customers.slice(0, 8).map((_, i) => ({
          recurringOrderId: `recurring-${i}`,
          productId: `product-${i % 11}`,
          quantity: 5,
        })),
      });
      const orders: Prisma.OrderCreateManyInput[] = [];
      const items: Prisma.OrderItemCreateManyInput[] = [];
      const history: Prisma.OrderStatusEventCreateManyInput[] = [];
      const deliveries: Prisma.DeliveryCreateManyInput[] = [];
      const receivables: Prisma.ReceivableCreateManyInput[] = [];
      const payments: Prisma.ReceivablePaymentCreateManyInput[] = [];
      const events: Prisma.DeliveryEventCreateManyInput[] = [];
      const losses: Prisma.LossRecordCreateManyInput[] = [];
      for (let i = 0; i < 600; i++) {
        const b = batches[Math.floor(i / 5)];
        const p = products[Math.floor(i / 5) % 11];
        const c = customers[i % 35];
        const manufacture = b.manufacturedAt as Date;
        const deliveryDate = new Date(manufacture.getTime() + 86400000);
        const blocked = b.status === BatchStatus.BLOCKED || b.status === BatchStatus.MATURING;
        const recent = deliveryDate >= dateAt(-3);
        const status = blocked
          ? OrderStatus.CANCELLED
          : recent
            ? [
                OrderStatus.NEW,
                OrderStatus.CONFIRMED,
                OrderStatus.READY,
                OrderStatus.IN_ROUTE,
                OrderStatus.DELIVERED,
              ][i % 5]
            : i % 19 === 0
              ? OrderStatus.CANCELLED
              : OrderStatus.DELIVERED;
        const allocated = status !== OrderStatus.NEW && status !== OrderStatus.CANCELLED;
        const qty = money(1.5 + (i % 4) * 0.5);
        const price = money(p.salePrice * ((i % 35) % 3 === 0 ? 0.95 : 1));
        const total = money(qty * price);
        orders.push({
          id: `order-${i}`,
          code: `PED-${String(i + 1).padStart(5, '0')}`,
          customerId: c.id,
          createdAt: manufacture,
          deliveryDate,
          status,
          paymentMethod: i % 2 ? 'PIX' : 'BOLETO',
          total,
        });
        items.push({
          orderId: `order-${i}`,
          productId: p.id,
          batchId: allocated ? b.id : null,
          quantity: qty,
          unitPrice: price,
          discount: 0,
        });
        history.push({
          orderId: `order-${i}`,
          status,
          date: deliveryDate,
          actorName: 'Demonstração',
        });
        if (allocated) {
          deliveries.push({
            id: `delivery-${i}`,
            orderId: `order-${i}`,
            routeId: c.routeId,
            driverId: `driver-${i % 3}`,
            vehicleId: `vehicle-${i % 3}`,
            scheduledAt: deliveryDate,
            deliveredAt: status === OrderStatus.DELIVERED ? deliveryDate : null,
            stopNumber: (i % 8) + 1,
          });
          if (status === OrderStatus.DELIVERED) {
            b.availableQuantity = decimal(String(b.availableQuantity)).minus(qty);
            movements.push({
              batchId: b.id,
              type: MovementType.SALE,
              quantity: -qty,
              reason: 'Pedido entregue',
              reference: `order-${i}`,
              date: deliveryDate,
            });
            const paid = i % 7 === 0 ? 0 : i % 11 === 0 ? money(total / 2) : total;
            receivables.push({
              id: `receivable-${i}`,
              orderId: `order-${i}`,
              amount: total,
              paidAmount: paid,
              dueDate: new Date(deliveryDate.getTime() + 14 * 86400000),
            });
            if (paid > 0)
              payments.push({
                receivableId: `receivable-${i}`,
                amount: paid,
                date: deliveryDate,
                method: i % 2 ? 'PIX' : 'BOLETO',
              });
            events.push({
              deliveryId: `delivery-${i}`,
              date: deliveryDate,
              type: 'DELIVERED',
              description: 'Entrega recebida pelo cliente (demonstração).',
            });
          } else b.reservedQuantity = decimal(String(b.reservedQuantity ?? 0)).plus(qty);
        }
      }
      for (let i = 0; i < 120; i += 13) {
        const b = batches[i];
        const qty = 0.5;
        b.availableQuantity = decimal(String(b.availableQuantity)).minus(qty);
        const cost = decimal(String(b.unitCost)).mul(qty).toDecimalPlaces(2);
        losses.push({
          batchId: b.id!,
          quantity: qty,
          cost,
          reason: 'Avaria de embalagem',
          date: new Date((b.manufacturedAt as Date).getTime() + 2 * 86400000),
        });
        movements.push({
          batchId: b.id,
          type: MovementType.LOSS,
          quantity: -qty,
          reason: 'Avaria de embalagem',
          date: new Date((b.manufacturedAt as Date).getTime() + 2 * 86400000),
        });
      }
      await tx.batch.createMany({ data: batches });
      await tx.stockMovement.createMany({ data: movements });
      await tx.lossRecord.createMany({ data: losses });
      await tx.order.createMany({ data: orders });
      await tx.orderItem.createMany({ data: items });
      await tx.orderStatusEvent.createMany({ data: history });
      await tx.delivery.createMany({ data: deliveries });
      await tx.deliveryEvent.createMany({ data: events });
      await tx.receivable.createMany({ data: receivables });
      await tx.receivablePayment.createMany({ data: payments });
      await tx.payable.createMany({
        data: receipts
          .filter((r) => r.approved)
          .map((r) => ({
            description: `Leite — ${producers.find((p) => p.id === r.producerId)!.name}`,
            category: 'MILK',
            amount: money(Number(r.liters) * Number(r.pricePerLiter)),
            paidAmount: 0,
            dueDate: new Date(+new Date(r.date) + 30 * 86400000),
            reference: r.id,
          })),
      });
      await tx.payable.createMany({
        data: purchases.map((p) => ({
          description: `Compra — ${supplies.find((s) => s.id === p.supplyId)!.name}`,
          category: 'SUPPLIES',
          amount: money(Number(p.quantity) * Number(p.unitCost)),
          paidAmount: money(Number(p.quantity) * Number(p.unitCost)),
          dueDate: p.date,
          reference: p.id,
        })),
      });
      const paidPayables = await tx.payable.findMany({ where: { paidAmount: { gt: 0 } } });
      await tx.payablePayment.createMany({
        data: paidPayables.map((p) => ({
          id: `seed-opening-${p.id}`,
          payableId: p.id,
          amount: p.paidAmount,
          date: p.dueDate,
          method: 'DEMO_OPENING',
        })),
      });
      await tx.announcement.createMany({
        data: [
          {
            title: 'Qualidade começa na origem',
            content:
              'Confiram temperatura e acidez em todo recebimento. Leite reprovado não pode ser utilizado na produção.',
            authorId: 'owner',
            createdAt: dateAt(-1),
          },
          {
            title: 'Nossa rotina de entregas',
            content: 'Confirmem os pedidos e revisem os romaneios antes de sair para a rota.',
            authorId: 'sales',
            createdAt: dateAt(-2),
          },
        ],
      });
      await tx.messageTemplate.createMany({
        data: [
          {
            key: 'CONFIRMATION',
            name: 'Confirmação de pedido',
            content:
              'Olá, {cliente}! Confirmamos seu pedido: {itens}. Total {total}. Entrega em {data}.',
          },
          {
            key: 'DELIVERY',
            name: 'Saiu para entrega',
            content: 'Olá, {cliente}! Seu pedido saiu para entrega hoje, {data}.',
          },
          {
            key: 'RECALL',
            name: 'Aviso sobre lote',
            content:
              'Olá, {cliente}. Precisamos falar sobre o lote {lote}. Por favor, separe o produto e entre em contato.',
          },
        ],
      });
      await tx.whatsAppMessage.createMany({
        data: customers.slice(0, 6).map((c) => ({
          customerId: c.id,
          direction: 'INBOUND',
          content: 'Bom dia! Gostaria de 10 kg de minas frescal e 5 kg de requeijão.',
          createdAt: dateAt(0),
        })),
      });
      await tx.notification.createMany({
        data: [
          {
            userId: 'owner',
            title: 'Dois lotes bloqueados',
            content: 'Aguardam avaliação da equipe de qualidade.',
          },
          {
            userId: 'owner',
            title: 'Bem-vindo à Agro Certa',
            content: 'Os dados deste ambiente são de demonstração.',
          },
          {
            userId: 'production',
            title: 'Revise os lotes em maturação',
            content: 'Confirme a qualidade antes de liberar para venda.',
          },
          {
            userId: 'sales',
            title: 'Confira os pedidos da semana',
            content: 'Revise as datas de entrega com seus clientes.',
          },
        ],
      });
      await tx.auditLog.create({
        data: {
          actorId: 'owner',
          action: 'DEMO_SEEDED',
          entity: 'Company',
          entityId: 'demo-company',
          metadata: { anchor: dateAt(0).toISOString(), receipts: 900, batches: 120, orders: 600 },
        },
      });
    },
    { timeout: 180000 },
  );
  console.log(
    'Demonstração criada: 900 recebimentos, 120 lotes, 600 pedidos. Senha dos usuários de demo: agro123.',
  );
}
seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
