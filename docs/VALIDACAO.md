# Validação da etapa operacional

Execução em 4 de novembro de 2026, Node 20.20.0, PostgreSQL 16 real via Docker, Chromium instalado no ambiente. Não foram usados repositórios de dados simulados nos testes de integração.

## Evidências

- `npm run setup`: instalação, geração WASM, migrações e seed concluídos. Repetição reconheceu as migrações e informou que a demonstração existente foi preservada. Não foi executado reset do banco de desenvolvimento.
- `npm run typecheck`, `npm run lint` e `npm run build`: passaram para API e web.
- `npm test`: **46 testes passaram em sete arquivos**, sem testes ignorados. Cada suíte integrada usa schema PostgreSQL próprio e remove apenas seu schema.
- Fluxo integrado obrigatório: produtor → recebimento aprovado de **500 L** → produção de **50 kg** → reserva e entrega de **8 kg** → saldo físico **42 kg** → recebível e baixa parcial/total. Asserções verificam origens, insumos, custos, indicadores, histórico e rastreabilidade.
- Consistência: concorrência por estoque, resposta repetida com a mesma chave, conflito de chave com outro corpo, rollback por falta de leite/insumos, reserva por validade antes da fabricação, divisão entre lotes, cancelamento com liberação e bloqueio impedindo expedição.
- Financeiro: baixas reais, saldo de caixa, rateio, simulador sem mutação, perdas e ajuste de inventário no resultado. Relatórios filtrados, agregados, CSV protegido contra fórmula e PDFs verificados.
- Complementos: recorrência sem duplicação, pausa/exceção/edição; WhatsApp demo com preços do cliente; modelos sem variáveis inválidas; webhook com desafio, HMAC, número e deduplicação; mural, parâmetros e comprovantes.
- Proteções: login e sessão reais, rotação e revogação, RBAC, isolamento de motorista, dados públicos limitados, erros de validação e recusa do modo demo em produção/bind público/origem externa.

- `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e`: **14 cenários passaram, sete foram dispensados deliberadamente e nenhum falhou**, em 21 combinações de cenário/resolução. Os sete dispensados evitam repetir fluxos completos já exercitados em desktop; navegação e login/painel passaram nas três resoluções. A matriz de permissões no navegador passou em desktop e celular.
- `npm run format:check`: passou.
- `npm audit --omit=dev`: **zero vulnerabilidades conhecidas** na verificação final. O lockfile fixa `effect` 3.20.0 e `deepmerge-ts` 8.0.2 para corrigir os avisos transitivos encontrados; geração do cliente, build e todas as suítes passaram depois da instalação limpa.
- Inspeção visual dos screenshots reais do dashboard, rastreabilidade/recall e recorrências no celular. Foi corrigida a largura mínima dos cards de recorrência e estabilizada a seleção dos cards visíveis nos testes responsivos.

## Limites da validação

- Os cenários operacionais completos são executados em desktop; navegação dos módulos e login/painel são conferidos também em tablet e celular. Isso não cobre cada formulário em cada combinação de resolução e papel.
- PDFs são gerados e conferidos como downloads/documentos válidos. Não houve homologação de impressão física ou leitura de QR por câmera externa.
- Webhook Meta foi exercitado com requisições assinadas em testes. Não houve comunicação com conta oficial, envio automático ou confirmação externa de mensagens.
- A geração de recorrências foi testada por chamada real da função/endpoint; não se aguardou o cron das 05h. O mesmo vale para a observação do disparo horário de vencimentos.
- Não há implantação pública Vercel/API de homologação nem execução observada do GitHub Actions nesta sessão. Testes locais não comprovam esses ambientes.
- Avisos não fatais de dependências: Rollup remove comentários de anotação de Zod; pg 8 avisa sobre enfileiramento de consultas transacionais. pg está na versão 8 compatível; a migração para pg 9 exige revisão. Há avisos de descontinuação em bibliotecas transitivas e ferramentas; não foram ocultados.
- Devolução parcial/estorno, foto/assinatura desenhada, kanban, fechamento mensal imutável e backup/restauração permanecem pendentes. Veja ROADMAP.md. Não declarar todos os critérios da especificação original concluídos.

## Reproduzir

```sh
npm run setup
npm run format:check
npm run typecheck
npm run lint
npm test
npm run build
CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e
```

Os testes de navegador modificam a demonstração com registros identificados. Executar somente em dados de desenvolvimento. `TEST_DATABASE_URL` separa o banco dos testes de API; o navegador usa a configuração normal da API de desenvolvimento.

## Prévia privada e Codespaces

A configuração de desenvolvimento e as instruções estão em [PREVIA-PRIVADA.md](PREVIA-PRIVADA.md). Foram revalidados PostgreSQL, migrações e seed existente, proxy Vite com host/origem HTTPS de Codespaces simulados via loopback, login/cookies e consultas autenticadas de 19 endpoints. Host/Origin desconhecidos foram recusados; nenhum serviço foi exposto publicamente. A configuração Compose não publica portas e encaminha apenas 5173 pelo devcontainer.

A primeira rodada desta validação encontrou uma espera de carregamento de módulo e uma notificação que interceptava o menu da conta no celular. A sobreposição foi corrigida com reposicionamento e botão de fechar; o Playwright passou a usar limites adequados à inicialização em desenvolvimento. A rodada final completa passou: **14 cenários aprovados, sete repetições dispensadas, nenhuma falha**, incluindo login/logout e navegação no celular. Typecheck, lint, formato e build também passaram.

O Codespace real e sua URL privada não foram criados nesta sessão. O proxy Codex bloqueou a verificação adicional da imagem MCR com HTTP 403. A validação local não comprova autenticação/visibilidade no gateway GitHub; o guia exige conferir 5173 = Private antes de abrir a prévia. Não houve implantação de produção.
