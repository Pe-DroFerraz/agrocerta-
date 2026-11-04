# AGRO CERTA — PRIORIDADE ABSOLUTA: PAINEL OPERACIONAL COMPLETO

Quero alterar a prioridade do desenvolvimento do projeto AGRO CERTA.

Nesta etapa, NÃO quero que você concentre esforços em telas de login, cadastro de usuários, gestão de permissões ou criação de um estúdio visual separado.

O objetivo é entregar o **painel administrativo principal do AGRO CERTA completamente funcional, integrado ao backend e ao banco PostgreSQL**, com todas as operações reais.

## 1. Preservar o desenvolvimento existente

Continue a partir dos commits já realizados. Não reinicie o projeto, não descarte código e não destrua as funcionalidades existentes.

Resolva inicialmente os bloqueios do Prisma, execute as migrações, carregue o seed e valide a conexão com o banco.

Preserve a infraestrutura de autenticação já desenvolvida, mas adie o refinamento de login, cadastro de usuários e administração de permissões.

Para facilitar a homologação, permita acesso direto ao painel exclusivamente em ambiente local ou de demonstração protegido. Não publique uma API administrativa desprotegida nem desabilite controles de segurança em produção.

## 2. Desenvolver o painel completo

Quero que o dashboard seja a interface principal do sistema, com identidade visual premium, profissional e específica para o setor de laticínios.

Implemente e integre integralmente:

- Dashboard: KPIs reais, gráficos, filtros de período, alertas e indicadores financeiros.
- Produtores: cadastro, edição, histórico, qualidade do leite e pagamentos.
- Recebimento de leite: lançamentos, aprovação, reprovação e atualização dos saldos disponíveis.
- Produtos e receitas: fichas técnicas, insumos, rendimento e preços.
- Produção: ordens de produção, consumo de leite, cálculo de custos e geração de lotes.
- Lotes: controle de validade, bloqueio, maturação, liberação e QR Code.
- Rastreabilidade: origem do leite, insumos utilizados, clientes atendidos e simulação de recall.
- Estoque: entradas, saídas, reservas, perdas, inventário e alertas.
- Clientes: cadastro, histórico, preços personalizados e análise de compras.
- Pedidos: criação, edição, confirmação, recorrência, separação e acompanhamento.
- WhatsApp: mensagens prontas, integração demonstrativa funcional e preparação para API oficial.
- Entregas: rotas, motoristas, comprovantes, ocorrências e conclusão.
- Financeiro: contas a pagar, contas a receber, custos de produção, margens, fluxo de caixa e DRE.
- Mural de avisos: publicações e comunicação.
- Relatórios: consultas, filtros e exportação em PDF e CSV.
- Configurações operacionais: parâmetros, categorias, dados da empresa e demais ajustes necessários ao funcionamento.

## 3. Integração obrigatória entre os módulos

O painel não pode ser um conjunto de telas independentes.

Exemplo de fluxo obrigatório:

1. Cadastrar um produtor.
2. Registrar o recebimento de 500 litros de leite.
3. Atualizar o saldo de leite aprovado disponível.
4. Criar uma ordem de produção de queijo.
5. Consumir o leite e os insumos utilizados.
6. Gerar o lote com custo, rendimento e validade.
7. Atualizar o estoque de produtos acabados.
8. Criar um pedido utilizando o lote disponível.
9. Reservar e dar baixa no estoque corretamente conforme a evolução do pedido.
10. Registrar a entrega.
11. Gerar o recebível correspondente.
12. Atualizar os indicadores do dashboard e relatórios.
13. Permitir rastrear o lote até o produtor e o cliente.

Todas essas operações devem funcionar com dados persistidos e consistentes no banco.

## 4. Regras de qualidade obrigatórias

- Proibido criar botões sem ação.
- Proibido utilizar dados estáticos no frontend para simular operações reais.
- Proibido declarar módulos concluídos que possuam fluxos quebrados.
- Todas as operações devem utilizar endpoints reais da API.
- Todas as alterações precisam persistir no PostgreSQL.
- Implementar transações para operações críticas.
- Impedir estoque negativo, consumo duplicado e inconsistências financeiras.
- Implementar mensagens claras de erro e sucesso.
- Validar cálculos financeiros e de produção com testes automatizados.
- Garantir que gráficos e indicadores reflitam as operações realizadas.
- Garantir responsividade e navegação intuitiva.

## 5. Experiência visual

Quero um dashboard sofisticado, visualmente agradável, com navegação fluida e recursos operacionais acessíveis.

Não quero aparência de template genérico de inteligência artificial.

Use a identidade visual definida para o AGRO CERTA, aprimorando a hierarquia visual, tipografia, tabelas, formulários e gráficos.

A navegação deve funcionar em desktop, tablet e celular.

## 6. Visualização durante o desenvolvimento

Prepare uma prévia navegável do próprio painel AGRO CERTA, preferencialmente publicada na Vercel com uma API de homologação.

Não crie um estúdio separado nesta fase.

Quero acompanhar o desenvolvimento entrando diretamente no sistema e testando cada módulo.

As telas devem refletir os recursos efetivamente implementados. Recursos ainda incompletos devem ser identificados como pendentes.

## 7. Execução e entrega

Implemente o sistema progressivamente, mas mantenha como objetivo final desta fase o painel operacional completo.

Priorize primeiro os fluxos de recebimento, produção, estoque, vendas, entregas e financeiro, pois são o núcleo do sistema.

Depois conclua rastreabilidade, relatórios, WhatsApp demonstrativo, mural e funcionalidades complementares.

A cada etapa:

1. Implementar frontend e backend.
2. Integrar o banco.
3. Executar testes automatizados.
4. Testar os fluxos principais.
5. Corrigir os problemas encontrados.
6. Registrar as alterações no GitHub.
7. Atualizar o progresso real do projeto.

Não apresente somente planejamento ou documentação como entrega. Escreva, integre, execute e teste o código.

Se uma execução não for suficiente, preserve todo o progresso e indique exatamente o próximo trabalho necessário.

**CRITÉRIO FINAL DE ACEITE:** devo conseguir utilizar o painel completo do AGRO CERTA para gerenciar uma operação demonstrativa de laticínio, realizando cadastros, recebimentos, produções, vendas, entregas e acompanhamento financeiro sem precisar editar o banco manualmente e sem depender de funcionalidades fictícias.
