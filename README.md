# AGRO CERTA

Painel operacional para laticínios e queijarias, com origem do leite, produção, lotes, estoque, pedidos, entregas e financeiro em PostgreSQL. A [especificação integral](docs/ESPECIFICACAO-ORIGINAL.txt) e a [prioridade operacional](docs/PRIORIDADE-OPERACIONAL.md) estão preservadas. Esta entrega implementa e testa o núcleo operacional; os complementos pendentes estão no [roadmap](docs/ROADMAP.md).

## Executar

Pré-requisitos: Node **20.20.0**, npm e Docker Compose v2. Na raiz:

```sh
npm run setup
npm run dev
```

`setup` usa `npm ci`, cria `.env` com JWT aleatório somente se não existir, inicia PostgreSQL 16, gera o cliente, aplica migrações e carrega a demonstração. Preserva dados existentes. Web na porta 5173, API na 3333, banco local na 5432. O Vite encaminha `/api` e `/docs`; `/api/health` verifica uma consulta real no banco. Swagger disponível em `/docs`.

Para PostgreSQL externo, configure `DATABASE_URL` e `JWT_SECRET` e execute `SKIP_DOCKER=1 npm run setup`. Variáveis do processo prevalecem sobre `.env`. Não usar seed/reset em dados reais. O banco local é exposto somente em loopback e usa credenciais exclusivas de desenvolvimento.

### Demonstração

Todos os acessos usam a senha **agro123**:

| Papel        | E-mail                                                                         |
| ------------ | ------------------------------------------------------------------------------ |
| Gestor       | dono@agrocerta.com                                                             |
| Produção     | producao@agrocerta.com                                                         |
| Comercial    | comercial@agrocerta.com                                                        |
| Entregadores | entregador@agrocerta.com, entregador2@agrocerta.com, entregador3@agrocerta.com |

Para abrir diretamente o painel local, configure `LOCAL_DEMO_ACCESS=1` em `.env`. Esse modo cria uma sessão real e auditada de gestor; só é aceito em `NODE_ENV=development`, API em loopback e origem web local. A rota `/login` continua disponível para testar outros papéis. Em produção o modo demo é recusado. O padrão do arquivo de exemplo é `0`.

O seed inclui seis usuários, dez produtores, onze produtos com receitas, 25 insumos, 900 recebimentos de leite, 120 lotes, 35 clientes, 600 pedidos, oito recorrências, três rotas/veículos e históricos financeiros. As datas acompanham a data local da primeira carga. Se já existe empresa, o seed preserva os dados. Os testes de navegador acrescentam operações identificadas à demonstração.

## Operações implementadas

- **Produtores e leite:** cadastro/edição/inativação, qualidade configurável, aprovação, preço histórico, contas a pagar, histórico e extrato PDF. Recebimentos consumidos ou pagos têm alterações protegidas.
- **Produtos e produção:** receitas editáveis, seleção de origens aprovadas, consumo de leite e lotes de insumos, custo decimal, rateio mensal por kg equivalente, rendimento, lote, validade e maturação/liberação/bloqueio.
- **Rastreabilidade:** origem do leite e insumos, produção, movimentos, pedidos/clientes afetados, filtros, QR, etiqueta e relatório PDF. Página pública limitada aos dados de origem. Recall bloqueia o lote e prepara comunicação, sem enviar mensagens automaticamente.
- **Estoque:** saldo físico, reservado e disponível, PVPS, compras, inventário com motivo, perdas e alertas. Produção, reserva, cancelamento e entrega movimentam saldos em transações.
- **Comercial:** clientes, preços próprios, limite de crédito, pedidos com múltiplos itens, alocação real de lotes, edição, confirmação, separação, cancelamento e histórico. Recorrências com dias da semana, pausa, exceções e geração idempotente para sete dias.
- **Entregas:** rota, veículo, capacidade, motorista, ocorrência, confirmação com nome do recebedor, romaneio e comprovante PDF. Motorista acessa apenas entregas próprias do dia.
- **Financeiro:** pagar/receber, baixas parciais/totais com histórico, custos fixos, custo por lote, simulador, caixa e DRE gerencial. O cadastro de custo fixo rateia produção; não cria uma conta a pagar automaticamente.
- **WhatsApp:** caixa demonstrativa persistida, interpretação simples de itens, proposta de pedido com confirmação, modelos editáveis e links `wa.me`. Webhook oficial preparado com desafio, assinatura HMAC, identificação do número e deduplicação; integração externa não ativada.
- **Gestão:** mural editável, dashboard com dados reais e períodos, alertas, relatórios filtrados com paginação, CSV/PDF, parâmetros de empresa/qualidade e rotas/veículos. Layout responsivo, tema, busca e notificações.

As mutações operacionais usam `Idempotency-Key` UUID, auditoria e transação com bloqueio para evitar disputa por saldo. Reutilizar chave com conteúdo diferente retorna conflito. Autorização é validada no servidor: gestor administra; produção acessa origem/produção/estoque; comercial acessa clientes/pedidos/WhatsApp/recorrências; motorista acessa suas entregas. Dados financeiros e custos têm restrições próprias.

## Stack e banco

Monorepo npm: `/apps/web` (React 18, Vite, TypeScript, Tailwind, Radix, TanStack Query, Recharts) e `/apps/api` (Node 20, Fastify 5, Prisma 6.19.2, PostgreSQL 16, Zod). Fontes e assets do Swagger são locais. Quarenta modelos relacionais, chaves estrangeiras, índices e restrições SQL preservam saldos, reservas e pagamentos.

O runtime usa o **compilador WASM oficial do Prisma** (`engineType="client"`) e `@prisma/adapter-pg`. A geração usa os pacotes npm oficiais versionados, sem binários nativos baixados de `binaries.prisma.sh`. Esse domínio foi bloqueado pelo proxy durante a preparação; a execução atual não depende dele. TLS e checksums não foram desativados.

`npm run db:migrate` usa **o executor SQL do projeto**, não o comando nativo `prisma migrate deploy`: aplica as migrações versionadas, em transação e com lock, registra SHA-256 em `_agro_migrations` e rejeita alteração de migração já aplicada. Após mudar o schema, criar uma nova migração SQL revisada (incluindo constraints), gerar o cliente e testar em banco separado. Não executar comandos nativos de migração sobre esse histórico como se o ledger fosse `_prisma_migrations`.

Custos usam Decimal e kg equivalentes (`kgPerUnit` para produtos líquidos); leite e insumos têm custos históricos registrados. O rateio recalcula os lotes do mês quando produção/custos fixos mudam. Ainda não há fechamento contábil imutável. DRE é gerencial, pelo faturamento entregue e custo proporcional, com perdas e variação de inventário; caixa usa baixas reais. Relatório de estoque mostra a posição atual, sem reconstrução de posição passada.

## Scripts e verificações

```sh
npm run db:up             # iniciar banco
npm run db:generate       # gerar cliente Prisma WASM
npm run db:migrate        # aplicar SQL versionado
npm run seed             # carregar somente se não há empresa
npm run typecheck
npm run lint
npm run format:check
npm test                 # testes unitários e PostgreSQL real
npm run build
CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e
```

Os testes de API criam schemas isolados e removem somente seus próprios dados; `TEST_DATABASE_URL` pode apontar para banco separado. O usuário precisa poder criar schemas. Playwright usa a demonstração, cria operações reais e inicia API/web quando necessário. Pode usar Chromium instalado via `npx playwright install chromium` ou `CHROMIUM_PATH`.

`npm run reset -- --yes` **apaga o schema configurado** e recria a demonstração. Exige confirmação explícita na linha de comando e recusa produção. `docker compose down` preserva o volume; não usar `down -v` para parar o ambiente habitual.

Autenticação usa bcrypt, cookies httpOnly, JWT curto, refresh opaco com hash e rotação, verificação de Origin, limitação de tentativas e sessões consultadas no servidor. Segredos não vão para o frontend. `.env` é ignorado pelo Git.

## Integrações e publicação

O webhook oficial requer `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID`, sem valores versionados. GET/POST `/api/integrations/whatsapp/webhook` valida desafio/assinatura e aceita mensagens de remetente cadastrado sem ambiguidade. Não foi feita homologação com a Meta nem implementado envio automático; o modo demo não envia mensagens.

O cron prepara recorrências às 05h em `America/Sao_Paulo` e verifica vencimentos de hora em hora. A função de geração foi testada manualmente e por integração; não se observou um ciclo real agendado às 05h nesta sessão. Jobs exigem processo API persistente, não apenas frontend estático.

Para Vercel: build web `npm run build -w @agrocerta/web`, saída `apps/web/dist`, fallback de SPA e proxy de mesma origem `/api` e `/docs` para API persistente de homologação. API: `npm start -w @agrocerta/api`, PostgreSQL persistente, `NODE_ENV=production`, `LOCAL_DEMO_ACCESS=0`, `API_HOST` adequado ao host, `WEB_ORIGIN` HTTPS exato, JWT próprio e cookies Secure. Não transportar contas demo para produção. O proxy de desenvolvimento não configura a hospedagem.

**Nenhuma URL pública foi publicada nesta tarefa:** não havia projeto/credenciais Vercel nem API de homologação configurados. Build local e testes não equivalem a implantação. Veja [evidências de validação](docs/VALIDACAO.md) e [próximas entregas](docs/ROADMAP.md).
