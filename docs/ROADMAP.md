# Evolução do AGRO CERTA

A [especificação original](ESPECIFICACAO-ORIGINAL.txt) permanece integral, junto à [prioridade operacional](PRIORIDADE-OPERACIONAL.md). Esta entrega cobre o núcleo transacional e as interfaces dos módulos; não declara o produto integralmente concluído.

| Área                 | Entregue nesta etapa                                                                                  | Complementos pendentes                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Fundação             | Monorepo, PostgreSQL, cliente Prisma WASM, SQL versionado, seed, autenticação e RBAC                  | Homologação externa e operação em produção                                                                    |
| Origem               | Produtores, qualidade, recebimentos, aprovação, contas e extrato PDF                                  | Fechamento mensal imutável e tratamentos completos de competência                                             |
| Catálogo/produção    | Produtos, receitas, insumos, compras, origens, produção transacional, custos e lotes                  | Upload/armazenamento de fotos e fechamento de rateio                                                          |
| Rastreabilidade      | Busca nos dois sentidos, origens, clientes, recall, QR público e PDFs                                 | Homologação de comunicação externa de recall                                                                  |
| Estoque              | PVPS, reservas, ajustes, perdas, movimentos e alertas                                                 | Posição histórica reconstruída por data                                                                       |
| Comercial            | Clientes, preços, crédito, pedidos, transições e histórico                                            | Kanban completo e análises avançadas de inatividade                                                           |
| Recorrência/WhatsApp | Planos, pausa, exceções, geração idempotente, parser demo, modelos e wa.me; webhook validado em teste | Homologação Meta, envio automático e acompanhamento de status externos                                        |
| Entregas             | Atribuição, capacidade, confirmação, ocorrência, romaneio e comprovante                               | Devolução parcial com estorno financeiro/estoque, fotos, assinatura desenhada e ordenação avançada de paradas |
| Financeiro           | Baixas parciais/totais, histórico, fixos, simulador, caixa, custo e DRE gerencial                     | Fechamentos contábeis imutáveis e conciliação avançada                                                        |
| Gestão               | Mural CRUD, relatórios reais CSV/PDF, alertas, parâmetros e rotas/veículos                            | Administração completa de usuários existentes, backup/restauração e auditoria com interface avançada          |
| Interface            | Formulários reais, navegação responsiva e painel com dados do banco                                   | Homologação de acessibilidade completa e toda combinação de filtros/papéis                                    |

## Próxima tarefa recomendada

Implementar **devolução parcial e estorno transacional**, vinculando entrega, quantidades retornadas por lote, quarentena/perda ou retorno autorizado, recebível e auditoria. Testar devolução parcial após baixa parcial, repetição idempotente e concorrência, e oferecer formulário ao motorista/gestor conforme permissões. Depois concluir fotos/assinatura e fechamento mensal.

Em paralelo à homologação do produto, configurar um projeto Vercel e API/PostgreSQL de homologação com proxy de mesma origem. A implantação e a integração oficial da Meta exigem recursos externos que não estavam configurados nesta sessão. A ausência deles não impede executar o painel local e seus testes.
