# AGRO CERTA

Gestão para laticínios, queijarias e pequenos produtores de Minas Gerais. Do campo à mesa, com origem, controle e clareza.

Este commit entrega **a base da primeira etapa**, não todos os módulos do produto. A [especificação integral](docs/ESPECIFICACAO-ORIGINAL.txt) foi preservada, e o [mapa de evolução](docs/ROADMAP.md) registra os fluxos que ainda serão construídos.

## Estado da entrega

Há código para monorepo, banco relacional, seed, autenticação, permissões, painel, consultas e layout administrativo. **A validação integrada da etapa ainda está bloqueada** no ambiente desta tarefa: o proxy retorna HTTP 403 para `binaries.prisma.sh`, necessário para os engines oficiais do Prisma.

O domínio já foi acrescentado ao rascunho das configurações do ambiente. É necessário salvar a liberação nas configurações; publicar o ambiente é uma ação posterior. Não foi desativada nenhuma verificação de TLS ou checksum. Depois da liberação, executar `npm run setup`, `npm test` e os testes de navegador autenticados. Até isso passar, **não considerar login com senha, seed e painel autenticado como funcionalidades validadas**.

## Stack e decisões

- Node **20.20.0**, npm workspaces, TypeScript estrito.
- API: Fastify 5, Prisma 6, Zod 4, bcrypt, JWT e Swagger/OpenAPI local.
- Web: React **18**, Vite 6, Tailwind 3, componentes no padrão shadcn/ui com Radix UI, React Router, TanStack Query, React Hook Form, Zod, Recharts e lucide-react.
- **PostgreSQL 16** é o banco padrão, conforme o pedido mais recente e o README inicial. Isso substitui a opção SQLite do documento original. As migrações deste projeto são PostgreSQL; não basta mudar a URL para usar SQLite.
- Aplicação de uma única empresa. Multiempresa não faz parte desta etapa.
- Valores monetários em `Decimal`; quantidades com precisão de até cinco casas conforme o uso. Datas e períodos do painel em `America/Sao_Paulo`.
- Fontes Inter e Plus Jakarta Sans empacotadas localmente; a interface não depende de Google Fonts/CDN.
- Swagger usa assets oficiais locais de `swagger-ui-dist`. Evita-se um servidor genérico de arquivos para a documentação.
- `@fastify/cookie` e `light-my-request` têm versões específicas compatíveis com Node 20. O lockfile deve ser respeitado.

## Instalar e executar

Pré-requisitos: Node 20 (`nvm use`), npm e Docker com Compose v2. As portas padrão são PostgreSQL 5432, API 3333 e web 5173.

```sh
npm run setup
npm run dev
```

`setup` instala com `npm ci` quando existe lockfile, cria `.env` local com chave JWT aleatória se ele ainda não existir, inicia o PostgreSQL, gera o cliente Prisma, aplica as migrações e carrega a demonstração. Não substitui um `.env` existente. Em ambientes com saída restrita, permitir `registry.npmjs.org`, `binaries.prisma.sh` e os domínios do registro de imagens Docker usados pelo ambiente.

Acesse a web pela porta 5173. A documentação fica em `/docs` e o OpenAPI em `/docs/json`; o Vite encaminha essas rotas e `/api` para a API. O endpoint `/api/health` verifica uma consulta real no banco e só responde `ok` se ela funcionar.

Para banco já existente, sem Docker:

```sh
cp .env.example .env
# Configure DATABASE_URL e gere JWT_SECRET, sem usar o texto de exemplo.
# Exemplo de geração de chave: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
SKIP_DOCKER=1 npm run setup
```

Variáveis podem ser fornecidas pelo processo, com precedência sobre `.env`. O PostgreSQL do Compose fica exposto apenas em loopback, com credenciais **locais de desenvolvimento**, sem uso em produção. `docker compose down` preserva o volume; não use `down -v` se quiser preservar os dados.

## Acessos de demonstração

Todos usam a senha `agro123`. Os botões na tela de login apenas preenchem os campos; é preciso enviar o formulário para autenticar no backend.

| Papel                | E-mail                    |
| -------------------- | ------------------------- |
| Dono / Gestor        | dono@agrocerta.com        |
| Produção             | producao@agrocerta.com    |
| Comercial            | comercial@agrocerta.com   |
| Entregador principal | entregador@agrocerta.com  |
| Segundo entregador   | entregador2@agrocerta.com |
| Terceiro entregador  | entregador3@agrocerta.com |

São seis contas para conciliar os quatro papéis com os três entregadores solicitados. O seed é exclusivo de desenvolvimento/teste e recusa `NODE_ENV=production`. Não publicar esses acessos em uma instalação real.

## O que foi escrito nesta etapa

### Banco e demonstração

38 modelos relacionais, migração SQL versionada, chaves estrangeiras, índices de pesquisa, exclusão lógica nos cadastros centrais e restrições locais de integridade: saldos não negativos, reserva menor ou igual ao saldo, recebimentos positivos, um único alvo por movimentação e pagamentos dentro do valor da conta.

O seed usa gerador pseudoaleatório determinístico e uma âncora na data local da execução. Prepara 90 dias, 900 recebimentos, dez produtores mineiros, onze produtos, receitas por produto, 25 insumos com compras, 120 lotes, 35 clientes, oito recorrências, 600 pedidos, três rotas, três veículos e três entregadores. Há origens de leite e insumos, movimentos, perdas, entregas, recebíveis, pagamentos, contas a pagar, custos fixos, mensagens, modelos, avisos e notificações.

O código concilia a saída de produtos entregues com movimentos de estoque, reservas com pedidos pendentes e recebíveis com pedidos entregues. Recebimentos reprovados não são alocados à produção. Os preços e custos ficam registrados nas operações históricas. A execução e a conciliação completa do seed **ainda precisam passar pelos testes de integração**.

O seed inteiro usa uma transação. Se já existir uma empresa, ele preserva os dados e informa que não os alterou. Para recriar a demonstração deliberadamente:

```sh
npm run seed
npm run reset -- --yes
```

`reset` é destrutivo para o banco configurado. Sem `--yes` não executa; em produção é recusado. Não apontar esses comandos para dados reais.

### Autenticação e permissões

- Hash bcrypt com custo 12. A senha de demonstração é uma exceção conhecida; novos usuários precisam de pelo menos dez caracteres e no máximo 72 bytes.
- Access JWT de 15 minutos em cookie `httpOnly`; refresh opaco de sete dias, com hash SHA-256 no banco e rotação transacional de uso único.
- `SameSite=Strict`; cookies `Secure` em produção. Tokens não são armazenados em localStorage nem retornados em JSON.
- A sessão e a situação do usuário são consultadas no servidor a cada acesso protegido. Logout revoga a sessão; mudanças no papel ou desativação não dependem do vencimento do JWT.
- Verificação exata de `Origin` nas mutações, CORS restrito e limite de dez tentativas por minuto no login.
- Erros padronizados, limite de corpo e entradas validadas com Zod/JSON Schema. Operações de login e criação de usuário geram auditoria.
- O frontend usa as permissões retornadas pelo backend. Esconder o menu não substitui a autorização das rotas.

| Área implementada                                  | Dono                | Produção         | Comercial              | Entregador               |
| -------------------------------------------------- | ------------------- | ---------------- | ---------------------- | ------------------------ |
| Painel                                             | Sim, com financeiro | Sem financeiro   | Indicadores comerciais | Não                      |
| Produtores, recebimentos, produtos, lotes, insumos | Sim                 | Consulta         | Não                    | Não                      |
| Clientes e pedidos                                 | Sim                 | Não              | Consulta               | Não                      |
| Entregas                                           | Consulta            | Não              | Consulta               | Apenas próprias, de hoje |
| Contas a receber                                   | Consulta            | Não              | Não                    | Não                      |
| Mural                                              | Consulta            | Resumo no painel | Consulta               | Não                      |
| Usuários                                           | Lista e criação     | Não              | Não                    | Não                      |

A matriz completa de permissões dos módulos futuros está na especificação e será aplicada quando as respectivas operações forem implementadas.

### Interface inicial

Login com identidade verde/creme e ilustração própria, logo folha/gota, favicon, sidebar recolhível, navegação móvel, menu da conta e saída real, tema persistido, tour de quatro passos e notificações por usuário com marcação de leitura.

O painel consulta a API: volumes aprovados, produção em kg, faturamento entregue, margem, custos médios, pedidos e entregas no período, série diária, distribuição de produção, lotes próximos do vencimento e recados. Há hoje, sete dias, 30 dias, mês e intervalo personalizado. Os indicadores financeiros ficam restritos ao gestor. Comparações usam o período anterior de igual duração; base anterior zero é mostrada sem percentual, evitando variações inventadas.

As consultas têm busca, paginação e ordenação no servidor, exportação CSV dos resultados filtrados e apresentação em cards no celular. A exportação protege células que poderiam ser interpretadas como fórmulas de planilha. A busca global consulta somente recursos autorizados. O gestor pode criar usuários por um formulário ligado à API e com auditoria.

**Os módulos operacionais estão em modo de consulta nesta etapa.** Não há botões fictícios de cadastro, entrega, recall ou produção. CRUD operacional, movimentações por ações do usuário e os demais fluxos continuam no roadmap. O painel autenticado e o layout interno ainda não foram verificados com dados reais neste ambiente.

## Estrutura

```text
apps/
  api/
    prisma/             schema, migração e seed
    src/                API, autenticação, autorização, consultas e cálculos
    test/               unidades, API pública e integração PostgreSQL
  web/
    src/components/ui/  componentes base no padrão shadcn/ui
    src/lib/            cliente HTTP, sessão e apresentação
    src/                login, layout, painel e consultas
scripts/                instalação, Prisma e reset
 tests/e2e/             testes Chromium em três tamanhos de tela
 docs/                  especificação original, roadmap e validação
```

## Comandos

| Comando                                   | Finalidade                                       |
| ----------------------------------------- | ------------------------------------------------ |
| `npm run setup`                           | Instalar, iniciar banco, gerar, migrar e popular |
| `npm run dev`                             | API + web, encerradas em conjunto                |
| `npm run db:up` / `npm run db:down`       | Subir/parar o banco local                        |
| `npm run db:generate`                     | Gerar cliente Prisma                             |
| `npm run db:migrate`                      | Aplicar migrações versionadas                    |
| `npm run seed`                            | Carregar demonstração sem sobrescrever dados     |
| `npm run reset -- --yes`                  | Apagar/recriar o banco configurado               |
| `npm run typecheck`                       | Verificar os dois projetos em modo estrito       |
| `npm run lint`                            | ESLint                                           |
| `npm run format` / `npm run format:check` | Formatar/conferir estilo                         |
| `npm test`                                | Unidades, API pública e integração real          |
| `npm run test:unit`                       | Somente cálculos, datas e matriz de permissões   |
| `npm run test:public`                     | Proteções públicas sem consultar o banco         |
| `npm run test:e2e`                        | Fluxos reais no navegador; exige seed concluído  |
| `npm run build`                           | Compilar API e gerar bundle web                  |

Para testes de navegador, instale o Chromium do Playwright com `npx playwright install chromium`, ou configure `CHROMIUM_PATH` para um Chromium instalado. Exemplo neste ambiente: `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e`. `--no-sandbox` é usado somente quando esse caminho explícito está definido, para o container de testes.

Os testes de integração criam um schema PostgreSQL exclusivo, aplicam a migração, executam o seed e removem apenas esse schema ao final. A conexão precisa poder criar schemas. `TEST_DATABASE_URL` permite usar um banco de testes separado. Os testes de navegador usam o banco de desenvolvimento e criam contas identificadas com prefixo `browser-`; rode-os somente em uma demonstração descartável.

## Regras de cálculo

```text
leite       = soma(litros da origem × preço histórico por litro)
insumos     = soma(quantidade consumida × custo histórico unitário)
indiretos   = fixos do mês × peso do lote / peso produzido no mês
custo total = leite + insumos + indiretos + perdas de produção
custo/un    = custo total / quantidade produzida
custo/L     = custo total / litros processados
margem      = (preço médio de venda - custo/un) / preço médio de venda
```

O rateio usa kg equivalentes: produtos em kg têm fator 1; os dois produtos líquidos da demonstração usam `kgPerUnit=1,03`. Esse fator é explícito no produto para não somar litros e kg sem conversão. Custos indiretos de lotes novos exigirão recalcular/fechar o rateio mensal no futuro fluxo de produção. Os exemplos do seed já conhecem a produção total do mês. `monthlyProduction` no cálculo significa o peso mensal equivalente em kg; `allocationWeightKg` informa o peso do lote e, se omitido, equivale à quantidade em kg.

A margem do painel usa faturamento entregue menos custo histórico proporcional das unidades vendidas. É margem bruta; não é lucro líquido/DRE. Quebras posteriores à produção são perdas de estoque em registros próprios, sem duplicação no custo original do lote. Arredondamento ocorre na apresentação/persistência monetária, com cálculos intermediários decimais. Preço zero gera margem indefinida (`null`), não divisão por zero.

## PostgreSQL / Supabase

O provider já é PostgreSQL. Para Supabase ou outro servidor, configurar `DATABASE_URL` com a string fornecida pelo serviço, incluindo SSL verificado. Aplicar `npm run db:generate && npm run db:migrate`. Use conexão direta ou pool em modo sessão para migrações; conexão com pool transacional precisa de configuração específica antes do uso. Nunca usar o seed/reset sobre dados reais. Se o usuário do banco de produção não pode criar schemas, fornecer um banco de testes separado.

Migrações locais de desenvolvimento após alterar o schema:

```sh
node scripts/prisma.mjs migrate dev --name nome_da_mudanca
```

As restrições SQL adicionais de saldo e integridade estão na migração e devem ser preservadas nas próximas migrações.

## Produção e integrações futuras

Esta etapa não está homologada para produção. O build web fica em `apps/web/dist`; a API compilada inicia com `npm start -w @agrocerta/api`. Uma implantação futura pode hospedar o frontend em Vercel/Netlify e a API em Railway/Render, mas precisa de proxy de mesma origem para `/api`, HTTPS, `NODE_ENV=production`, `WEB_ORIGIN` exato, segredo JWT próprio, PostgreSQL persistente, política de backup e provisionamento seguro do primeiro gestor sem contas demo. Cookies `SameSite=Strict` exigem validar cuidadosamente qualquer arranjo entre sites diferentes. O proxy de desenvolvimento do Vite não é configuração de produção.

WhatsApp Cloud API, webhook, verificação de assinatura, jobs, armazenamento de comprovantes, PDFs, backup/exportação e monitoramento ainda **não estão implementados**. Não há variáveis nem instruções de integração alegadamente funcionais nesta etapa. Serão introduzidas com seus módulos, preservando a especificação original.

## Evidências e próxima tarefa

Veja [validação desta etapa](docs/VALIDACAO.md) para distinguir testes passados de verificações bloqueadas. A próxima ação é liberar o domínio do Prisma e concluir setup, seed e testes de integração/navegador. Depois disso, implementar CRUD de produtores e recebimento de leite, seguido de produtos/receitas e do fluxo transacional de produção.
