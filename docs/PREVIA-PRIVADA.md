# Abrir e testar a prévia privada

O painel é o mesmo React/Vite e a mesma API Fastify do repositório. Não há telas duplicadas nem implantação de produção. O endereço `localhost` de uma execução no Codex pertence ao ambiente remoto, não ao seu computador.

## Situação do ambiente Codex

Nesta sessão, o runtime informou suporte a desktop remoto, mas não ofereceu ferramenta de abertura do desktop nem de criação de URL/encaminhamento privado de portas. Portanto, não foi possível entregar uma URL navegável do Codex. Serviços respondendo internamente não demonstram acesso pelo navegador do usuário. Nenhum túnel público foi criado.

## Abrir pelo GitHub Codespaces

1. Entre no GitHub com sua conta e abra [Pe-DroFerraz/agrocerta-](https://github.com/Pe-DroFerraz/agrocerta-).
2. Na branch **main**, escolha **Code → Codespaces → Create codespace on main**. Se já existir um Codespace anterior a essa configuração, atualize a branch e execute **Codespaces: Rebuild Container** na paleta de comandos. O GitHub pode solicitar escolha de máquina, autorização ou cota; não é necessário instalar nada no computador.
3. Aguarde a criação do container e os comandos **postCreateCommand** e **postStartCommand** terminarem. O primeiro instala dependências, gera Prisma, migra PostgreSQL e carrega o seed existente. O segundo inicia API e web e só informa prontidão após consultar `/api/health` e o frontend.
4. No editor web, abra a aba **PORTS / Portas** do painel inferior. Deve existir somente a porta **5173**, com o rótulo **AGRO CERTA — painel (manter Private)**. Se a aba não aparecer, procure **Ports: Focus on Ports View** na paleta de comandos.
5. Confirme que a coluna **Visibility / Visibilidade** da 5173 está em **Private**. Portas novas do Codespaces são privadas por padrão. Se necessário, clique com o botão direito → **Port Visibility → Private**, antes de abrir. Não selecione Public nem Organization. Não encaminhe as portas 3333 ou 5432; remova encaminhamentos antigos dessas portas, se houver.
6. Na linha da **5173**, use o ícone de globo **Open in Browser**. Use a URL HTTPS gerada pelo próprio GitHub, com formato `https://<nome-do-codespace>-5173.app.github.dev`. Não digite `localhost` no computador. O GitHub exige autenticação e permissão para esse Codespace; o link não é uma publicação pública.
7. Na tela de login do AGRO CERTA, selecione **Gestor** e entre com **dono@agrocerta.com / agro123**. No Codespaces o acesso automático de gestor fica desabilitado. Os botões de papel preenchem os campos; clique em **Entrar na minha conta**.

O Codespace é criado na sua conta e usa sua cota; nenhum Codespace foi criado em seu nome nesta tarefa. A validação do provedor (URL, login GitHub e política de visibilidade da sua organização) só pode ocorrer depois dessa criação. A configuração não transforma uma porta que o usuário tornou pública em privada automaticamente: mantenha a visibilidade Private no GitHub.

## O que fica interno

- **5173:** frontend Vite em `127.0.0.1` no Codespaces, encaminhado privadamente. `/api` e `/docs` passam pelo mesmo endereço e pela mesma autenticação do GitHub; o navegador não acessa uma URL separada de API.
- **3333:** Fastify em `127.0.0.1`, sem encaminhamento. As operações e o seed são os mesmos do sistema existente.
- **5432:** PostgreSQL na rede Docker do devcontainer, sem `ports` publicados no host. Somente o container da aplicação se conecta ao serviço `db`.
- Host permitido do Vite e `WEB_ORIGIN` correspondem ao endereço exato do Codespace. Não se usa `allowedHosts: true`, CORS aberto ou relaxamento de Origin. O segredo JWT aleatório fica em `.env.codespaces`, ignorado pelo Git; `.env` local não é reescrito.

O banco é uma demonstração nova criada **pelo mesmo seed**, não uma cópia do volume privado desta sessão Codex. Não requer edição manual do banco. Os dados persistem no volume Docker do Codespace entre paradas; apagar o Codespace/volume pode removê-los. Não use dados reais nesse ambiente de desenvolvimento.

## Retomar e diagnosticar

No Codespaces, use os scripts `.devcontainer` abaixo em vez de `npm run dev` diretamente: eles definem a origem HTTPS correta, o host permitido e a conexão ao banco interno.

Ao reabrir o Codespace, o postStart inicia os serviços. Para repetir manualmente, no terminal do Codespaces:

```sh
node .devcontainer/start.mjs
```

Se dependências/migrações mudaram, pare o Codespace e reabra/reconstrua o container após atualizar o código. O postCreate pode ser repetido com `node .devcontainer/setup.mjs`, **com os servidores parados**, preservando a empresa e os dados existentes. Não executar `reset` nem apagar volumes para resolver problemas de acesso.

Para verificar o proxy interno, autenticação e consultas de todos os módulos, execute `node .devcontainer/check.mjs` no terminal do Codespaces. Ele faz login demonstrativo, verifica Host/Origin e encerra a sessão. Não substitui a confirmação de visibilidade Private no GitHub.

Logs: `.devcontainer/.logs/dev.log` (ignorado pelo Git). Para conferir o banco/API por dentro do Codespace:

```sh
curl --fail http://127.0.0.1:3333/api/health
```

Resposta esperada: `{"status":"ok","database":"connected"}`. Se houver erro 403 de Origin/Host, confirme que abriu a porta **5173** e que a URL corresponde ao Codespace atual; reinicie o Codespace para recalcular a origem. Não resolva abrindo CORS/hosts ou publicando a API.

Para encerrar, use **Codespaces: Stop Current Codespace**. Isso interrompe os servidores sem publicar o sistema e sem apagar deliberadamente o volume.

## Roteiro para testar os módulos

Use o **Gestor** para percorrer todas as áreas. As alterações são persistidas; use nomes como “Teste manual” para localizar seus registros.

| Área do menu         | O que testar                                                                                                                                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visão geral          | Alterar período, conferir volumes, faturamento, estoque, alertas e atalhos; observar mudanças após as operações abaixo.                                                                                                                |
| Produtores           | Criar, editar, pesquisar, abrir histórico e extrato PDF; inativar um cadastro de teste.                                                                                                                                                |
| Recebimento de leite | Registrar volume, preço e qualidade; conferir aprovação/reprovação e saldo disponível. Leite reprovado não entra na produção.                                                                                                          |
| Produtos e receitas  | Criar produto, unidade, categoria, preço e validade; adicionar insumos e quantidades à receita.                                                                                                                                        |
| Estoque de insumos   | Registrar compra com quantidade, custo e lote; conferir saldo e conta a pagar gerada.                                                                                                                                                  |
| Produção e lotes     | Criar produção, selecionar origem, informar leite e quantidade produzida; conferir lote, custo, rendimento, validade e situação.                                                                                                       |
| Estoque por lote     | Conferir físico/reservado/disponível; abrir movimentos e registrar ajuste/perda com motivo em lote de teste.                                                                                                                           |
| Clientes             | Criar/editar cliente, endereço, crédito e preços específicos; abrir histórico.                                                                                                                                                         |
| Pedidos              | Criar pedido confirmado, conferir reserva; editar/cancelar pedido de teste e conferir liberação. Avançar outro para Separar → Pronto → Despachar.                                                                                      |
| Entregas e rotas     | No despacho selecionar rota, veículo e entregador; conferir capacidade. Registrar ocorrência ou concluir com nome do recebedor; baixar romaneio/comprovante.                                                                           |
| Contas a receber     | Localizar a entrega concluída, registrar baixa parcial e restante; conferir histórico. Em contas a pagar, baixar conta de leite/compra e conferir caixa.                                                                               |
| Rastreabilidade      | Buscar código de lote; conferir leite, insumos e clientes; baixar etiqueta/relatório e abrir a página do consumidor. Recall **bloqueia realmente o lote**: usar lote de teste. Mensagens são preparadas, não enviadas automaticamente. |
| Pedidos fixos        | Criar plano, escolher dias/itens, gerar os próximos sete dias, pausar/retomar e pular uma data. Confirmar o pedido gerado para reservar estoque.                                                                                       |
| Central WhatsApp     | Registrar mensagem demonstrativa, revisar proposta e confirmar pedido; editar modelo e preparar link. Não é envio oficial automático. Abrir `wa.me` pode sair do ambiente privado; não envie mensagens para números da demonstração.   |
| Mural de avisos      | Publicar, editar e excluir aviso próprio, conferindo o painel.                                                                                                                                                                         |
| Relatórios           | Filtrar vendas, produção, leite, estoque e financeiro; comparar agregados e baixar CSV/PDF. Estoque é posição atual.                                                                                                                   |
| Configurações        | Conferir dados da empresa, limites de qualidade, custos fixos, rotas/veículos e lista explícita de funcionalidades pendentes.                                                                                                          |
| Usuários             | Criar usuário de teste e validar o acesso por papel.                                                                                                                                                                                   |

### Fluxo completo sugerido: 500 litros

1. Cadastre **Produtor Teste manual**, com preço por litro **R$ 2,40**.
2. Registre **500 L** desse produtor com qualidade aprovada.
3. Cadastre **Queijo Teste manual**, código único, unidade **kg**, venda **R$ 45/kg**, validade **14 dias**, receita com **0,02 kg de sal por kg**. Confirme que há ao menos 1 kg de sal disponível em insumos.
4. Cadastre **Cliente Teste manual**, endereço e telefone demonstrativos; limite zero significa sem limite de crédito.
5. Em **Nova produção**, selecione esse produto e o recebimento recém-criado em **Origem do leite (opcional)**. Consuma **500 L**, produza **50 kg** e escolha situação inicial **Liberado**.
6. Crie um pedido confirmado de **8 kg** para o cliente. Sem preço próprio, o total será **R$ 360**; o estoque deve mostrar **50 kg físicos, 8 reservados e 42 disponíveis**. O sistema usa PVPS; um produto novo evita selecionar outros lotes antigos.
7. Avance **Separar → Pronto → Despachar**, escolhendo rota, veículo e entregador com capacidade. Em **Entregas**, conclua com o nome de quem recebeu.
8. Confira **42 kg físicos e zero reservado** e recebível de **R$ 360**. Faça baixa parcial e depois restante, verificando saldo e histórico.
9. Confira os indicadores de hoje, relatórios e rastreabilidade do lote até o produtor e cliente. Só então teste recall nesse lote.

Para testar permissões, saia da conta e entre com **producao@agrocerta.com**, **comercial@agrocerta.com** ou **entregador@agrocerta.com**, todos com senha **agro123**. Produção não acessa financeiro; comercial não acessa custos de produção; entregador vê apenas suas entregas do dia. Não é preciso reinstalar ou editar o banco para trocar papéis.

Nem todos os complementos da especificação estão concluídos: devolução parcial/estorno, fotos/assinatura desenhada, kanban, fechamento mensal imutável e backup/restauração continuam no [roadmap](ROADMAP.md). O roteiro acima cobre as funções realmente desenvolvidas.

## Validação desta configuração

Nesta sessão foram executados: PostgreSQL saudável, migrações conferidas e seed preservado; validação de Docker Compose; sintaxe dos scripts; testes das entradas recusadas, persistência do segredo e retomada idempotente. O diagnóstico `check.mjs` passou contra o sistema real via loopback, usando um host `*.app.github.dev` e origem HTTPS simulados: login/cookies, consultas de 19 endpoints, rejeição de Host/Origin desconhecidos, demo automático desativado e logout. Não houve conexão externa para esse host de teste.

A verificação adicional da imagem MCR foi bloqueada por HTTP 403 no proxy do ambiente Codex; não foi contornada a política de rede. A configuração referencia a imagem oficial do devcontainer Node 20.

Durante os testes foi corrigida uma notificação de exportação que cobria o menu da conta no celular. As notificações agora têm botão de fechar e ficam acima da navegação inferior. Os limites do Playwright também foram ajustados para a inicialização do Vite em desenvolvimento (sem remover verificações).

A criação do devcontainer em um Codespace real, a autenticação do gateway GitHub e a visibilidade da porta nessa conta **não foram executadas** nesta sessão. A preparação e os testes internos não são apresentados como uma URL privada já criada. O guia acima indica como concluir essa verificação no provedor.

Após a correção, a execução completa do Playwright terminou com **14 cenários aprovados, sete repetições dispensadas e nenhuma falha**, em desktop, tablet e celular. Passaram também typecheck, lint, formatação e build. O fluxo de 500 L, produção, pedido, entrega, recebível e recall foi exercitado novamente no sistema real.
