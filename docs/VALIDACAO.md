# Validação da primeira etapa

Verificações realizadas em 04/11/2026, Node 20.20.0, PostgreSQL 16.8 em Docker e Chromium do ambiente.

## Resultados observados

| Verificação                                                            | Resultado                                                                                                        |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Dependências com lockfile (`npm ci`, chamado por setup)                | Instaladas, com Node 20 e sem desativar TLS                                                                      |
| PostgreSQL local                                                       | Container saudável; banco `agrocerta` criado                                                                     |
| Schema Prisma                                                          | 38 modelos validados pela implementação WASM oficial                                                             |
| Migração SQL                                                           | 38 tabelas, índices, FKs e checks criados em schema temporário PostgreSQL; transação revertida                   |
| Tipos Prisma                                                           | Gerados offline pelo gerador oficial, sem engine nativo, apenas para conferir código                             |
| `npm run typecheck`                                                    | API e web passaram                                                                                               |
| `npm run lint`                                                         | Passou                                                                                                           |
| `npm run build`                                                        | API e web passaram; houve avisos de comentários PURE de Zod, sem falha de compilação                             |
| Cálculos, rendimento, datas e matriz de permissões                     | 12 testes passaram                                                                                               |
| API pública                                                            | 5 testes passaram: anônimo/JWT adulterado, origem, rate limit, Swagger e 404                                     |
| Login público em Chromium                                              | 3 testes passaram: 360×800, 768×1024 e 1440×1000; validação, mostrar/ocultar senha e sem overflow horizontal     |
| Auditoria de dependências de execução                                  | Zero vulnerabilidades conhecidas no resultado observado de `npm audit --omit=dev`                                |
| `npm test` completo                                                    | Código de saída 1: 17 testes passaram; suíte integrada falhou no bootstrap e suas 13 verificações não executaram |
| `npm run setup` completo                                               | Instalou dependências e confirmou PostgreSQL; parou em `db:generate` com HTTP 403 no proxy                       |
| Seed e migrações pelo Prisma                                           | Não concluídos                                                                                                   |
| Login por senha, refresh, logout autenticado e RBAC com usuários reais | Código e testes escritos; execução integrada pendente                                                            |
| Dashboard, consultas, exportação e criação de usuários autenticados    | Código e testes escritos; execução integrada pendente                                                            |
| Telas internas nos três tamanhos e modo escuro                         | Não homologadas; build não comprova comportamento                                                                |
| CI do GitHub                                                           | Workflow escrito; não executado no GitHub e não publicado por esta tarefa                                        |

Os testes públicos usam a aplicação real, sem respostas HTTP simuladas. Eles **não demonstram** autenticação por senha nem conexão Prisma ao PostgreSQL. O teste SQL usa o PostgreSQL real, mas **não substitui** `prisma migrate deploy` nem o seed. As verificações da suíte integrada marcadas como skipped são consequência da falha do `beforeAll`, não sucessos nem dispensas dos requisitos.

## Bloqueio externo

O proxy nega a conexão HTTPS a `binaries.prisma.sh`. Foram observados HTTP 403 tanto em consulta direta pelo proxy quanto nos comandos de geração/migração. A política vigente ainda não contém o domínio; a adição foi salva no rascunho das configurações. Nenhum checksum foi ignorado, nenhum engine não verificado foi usado e nenhuma rota alternativa foi usada para contornar a política.

O checkout contém os arquivos e a migração; o banco persistente **ainda não recebeu a demonstração**. A geração offline local serviu para TypeScript/build e não torna a API de dados funcional.

## Retomar quando a rede for liberada

1. Ativar Node 20. No ambiente preparado, o executável está em `/workspace/.agro-tools/node_modules/node/bin`; numa máquina local, `nvm use`.
2. Salvar a liberação de `binaries.prisma.sh` nas configurações do ambiente e confirmar a propagação; não substituir a lista de destinos existentes.
3. Na raiz do repositório, executar `npm run setup`. Deve gerar o cliente com o engine nativo verificado, aplicar a migração e carregar os dados.
4. Executar `npm test` e investigar/corrigir qualquer falha; os testes de integração devem efetivamente executar, incluindo conciliação de estoque, origens e recebíveis.
5. Executar `npm run typecheck && npm run lint && npm run build`.
6. Executar `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e` neste ambiente. A suíte inicia a aplicação se necessário. As verificações autenticadas cobrem filtros, tema, busca, consultas, CSV, saída, restrições por papel e criação/login de novo usuário. Algumas combinações redundantes de viewport são explicitamente dispensadas nos testes, mantendo login/painel em todas as três larguras.
7. Verificar manualmente as telas internas e atualizar este documento com resultados reais.

Somente depois disso considerar a fundação homologada e avançar ao CRUD de produtores/recebimentos. Publicação do ambiente, execução em tarefa nova e implantação da aplicação não foram realizadas nem validadas.
