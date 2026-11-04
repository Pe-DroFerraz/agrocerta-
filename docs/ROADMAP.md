# Evolução do AGRO CERTA

A especificação completa está em [ESPECIFICACAO-ORIGINAL.txt](ESPECIFICACAO-ORIGINAL.txt). Este mapa organiza as entregas; não remove requisitos.

| Etapa                          | Escopo                                                                                                                | Situação                                                |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 1. Fundação                    | Monorepo, PostgreSQL/Prisma, migração, seed, auth/RBAC, login, layout, consultas e painel inicial                     | Código escrito; validação integrada bloqueada pela rede |
| 2. Origem                      | CRUD de produtores, recebimentos, qualidade, histórico, fechamento e extrato mensal                                   | A implementar                                           |
| 3. Catálogo                    | CRUD de produtos, receitas, categorias, unidades, fotos e rendimentos                                                 | A implementar                                           |
| 4. Produção                    | Ordem transacional, consumo de leite/insumos, geração de lote, validade, maturação, bloqueio e etiqueta               | A implementar                                           |
| 5. Rastreabilidade             | Busca para frente/trás, linha do tempo, recall, clientes afetados, página pública, QR e PDF                           | A implementar                                           |
| 6. Estoque                     | PVPS/FIFO, movimentações automáticas, inventário, ajustes com motivo, perdas e alertas                                | A implementar                                           |
| 7. Comercial                   | CRUD de clientes, preços próprios, crédito, histórico, perfil e alertas de inatividade                                | A implementar                                           |
| 8. Pedidos                     | Criação transacional, reserva de lotes, cancelamento, histórico, kanban e lista                                       | A implementar                                           |
| 9. Recorrência/WhatsApp        | Job idempotente semanal, exceções, pausa, parser demo, conversas, modelos, wa.me e webhook oficial                    | A implementar                                           |
| 10. Entregas                   | Planejamento, veículo/capacidade, ordenação de paradas, entrega/devolução, ocorrência, assinatura/foto e romaneio     | A implementar                                           |
| 11. Financeiro                 | Baixas totais/parciais, pagar/receber, custos fixos, fechamento do rateio, custos, simulador, equilíbrio, caixa e DRE | A implementar; fórmulas básicas têm testes unitários    |
| 12. Mural                      | Publicar avisos, segmentar, prévia e histórico de envio                                                               | A implementar; consulta inicial escrita                 |
| 13. Relatórios                 | Vendas, produção, rendimento, perdas, estoque valorizado, inadimplência e recebimento; CSV/PDF                        | A implementar; CSV das consultas iniciais escrito       |
| 14. Administração              | Empresa, edição/desativação de usuários, parâmetros de qualidade/validade, templates, auditoria, backup/exportação    | A implementar; criação de usuário escrita               |
| 15. Complementos e homologação | Todos os gráficos/rankings, todos os filtros, alertas inteligentes/jobs, acessibilidade completa e implantação        | A implementar                                           |

A próxima etapa operacional deve construir formulários, validações e transações sobre as relações já preparadas. Não conectar botões a respostas simuladas nem substituir o banco por números fixos no frontend.

## Critérios finais da especificação

Os critérios abaixo continuam obrigatórios para o produto completo. Não estão sendo declarados atendidos nesta entrega inicial.

- Setup e dev completos com demonstração carregada: pendente de liberação da rede e validação integrada.
- Dashboard completo, com todos os KPIs, gráficos e filtros: parte inicial escrita; execução autenticada pendente.
- Recebimento → produção → lote → estoque → custo: a implementar.
- Pedido → entrega → recebível e baixa do lote correto: a implementar.
- Rastreio nos dois sentidos, recall e QR público: a implementar.
- Pedidos recorrentes gerados automaticamente: a implementar.
- Painel completo de custos e simulador: a implementar; funções básicas de custo/rendimento têm testes.
- Permissões backend/frontend: código da base escrito; matriz pura e proteções anônimas testadas; sessões autenticadas pendentes.
- Visual consistente e responsivo: login verificado em três larguras; demais telas pendentes de validação autenticada.
- README e testes completos: README escrito; suíte integrada ainda bloqueada.
