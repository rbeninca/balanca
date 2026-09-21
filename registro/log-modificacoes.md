# Log de modificações

Ordem cronológica inversa (mais recente primeiro). Cada item traz o commit e o
motivo.

## v2.8.2 (2026-09-21)

- **A atualização vai direto para a versão mais nova, sem passar pelas
  intermediárias.** O plano era uma cadeia — uma versão por vez, para que cada
  uma rodasse as próprias migrações antes da seguinte — e a precaução não
  protegia nada: as migrações do banco são idempotentes e cumulativas
  (`BancoDados.migrar` confere `PRAGMA table_info` antes de cada `ALTER`, e o
  esquema inteiro é reaplicado a cada abertura), então qualquer versão aplica
  todas. Só multiplicava o download.
  - O sintoma que trouxe isso: um MXQ na 2.7.4 parecia **travar** ao atualizar
    pela web. Não travava — tinha **sete** degraus até a 2.8.1, e seis desses
    APKs são da era do GeckoView, ~122 MB cada. Eram ~750 MB de download a
    1,9 MB/s e uns 40 minutos de TV parada entre download, instalação e
    dex2oat, um degrau por vez.
  - Conferido no box, não só em teste: saltar da 2.7.5 direto para a 2.8.1
    deixou as 1709 leituras da sessão **byte a byte iguais** (mesmo sha256).
  - O `.parte` do download interrompido e o APK do degrau anterior agora são
    apagados **antes** de cada passo. O `apk.delete()` do fim nunca chegava a
    rodar: quem instala com sucesso mata o processo. Sem isso, cada degrau
    deixava o APK inteiro para trás.
- **`Root` ganhou teto de tempo.** Um `su` que não responde — pedido de
  permissão esperando um toque que ninguém dá, numa TV sem tela sensível —
  deixava a chamada presa para sempre, sem erro e sem saída a não ser
  reiniciar. A leitura da saída foi para outra thread, porque `readText()`
  bloqueia mesmo depois do `waitFor` estourar. O teto do `pm install` é de 15
  minutos; se estourar, não é fatal — o Android instala assim mesmo e o
  atualizador confere a versão ao voltar.

## v2.8.1 (2026-09-21)

- **Importar sessões no formato CURVA EMPUXO 2.2** (Prof. Marchi) — o caminho de
  volta do arquivo que vai ao programa dele e volta. `ImportadorCurvaEmpuxo` no
  pacote `relatorio`, ao lado do exportador, com o inverso das mesmas regras.
  - **O cabeçalho é opcional**: o que o formato tem de essencial é o par tempo e
    força. Arquivo salvo de novo por uma planilha perde `Caso` e `Título` e
    continua válido. Do cabeçalho se aproveita o que existir — `Caso` vira o
    nome da sessão (sem ele, o nome do arquivo) e `Título` vira a descrição.
  - O botão da tela de sessões virou **⬆ Importar** e aceita os dois formatos,
    decidindo pelo **conteúdo**: JSON começa com `{`, o resto é curva. BOM do
    Windows não atrapalha.
  - Impulso recalculado por trapézio (o formato não o carrega); tempo relativo
    ao primeiro ponto; ponto com tempo fora de ordem é descartado com aviso.
  - Números entram como a planilha escreve: `1.234,5` e `1,234.5` são o mesmo
    número — com os dois separadores, o último é o decimal.
  - Ida e volta conferida contra uma sessão real do box (4513 pontos): erro de
    tempo 0 ms, de força 5e-8 N — só o arredondamento da notação de 7 dígitos.
- **CSV com 7 casas decimais no tempo**, a mesma largura do CURVA EMPUXO.
- **O tempo dos outros dois CSV passou a ser relativo ao início**, como o da
  tela. Eram três cópias escritas à mão do mesmo arquivo, e duas delas ficaram
  para trás, ainda no `millis()` cru do ESP:
  - o **backup em pendrive** (`armazenamento/Exportacao.kt`): a coluna virou
    `tempo_relativo_s` — chamar de `marca_temporal` um tempo relativo seria
    mentira —, com 7 casas e ponto decimal (o separador de campo é a vírgula);
  - a rota **`GET /sessoes/:id/exportar.csv`**, nas **duas** implementações
    (app Android e API Node), que mantêm o mesmo contrato de propósito. No
    Android a rota agora **delega em `Exportacao.csv`** em vez de reescrever o
    laço: era a terceira cópia, e o jeito de ela não divergir de novo é não
    existir. Conferido no box: a rota devolve `0.0000000` a `52.8790000`, os
    52879 ms de duração da sessão.

## v2.8.0 (2026-09-21)

- **O GeckoView saiu do APK: 122 MB → ~20 MB.** Ele era 108 MB dos 122 —
  `libxul.so` sozinho, 93,9 MB, guardado sem compressão. Foi embutido porque o
  WebView do box é o Chromium 52 (2016), que não roda módulos ES nem
  `ResizeObserver`; mas o box já traz o **Chrome 101** em `/data`, que renderiza
  o frontend sem um ajuste sequer.
  - **A aba Balança abre o painel no navegador** (`sistema/NavegadorDoBox.kt`),
    via Custom Tab — uma aba só, sem barra de endereço, em tela cheia. Se o
    Custom Tab não atender, cai no `ACTION_VIEW` comum; sem navegador nenhum, o
    app avisa. `NavegadorDoBox` prefere o Custom Tab justamente pelo visual de
    quiosque na TV.
  - A aba virou uma tela do app: explica que o painel abre fora, traz o botão
    **ABRIR O PAINEL** e os endereços dos celulares da bancada
    (`EnderecosRede.enderecosDeAcesso` — o do hotspot não se repete, porque o
    `wlan0` do AP também aparece em `listarIPv4()`).
  - `<queries>` no manifesto: sem ele o Android (targetSdk 36) esconde o
    navegador do app e tanto o Custom Tab quanto o `ACTION_VIEW` falham como se
    não houvesse navegador instalado.
  - `ehTelaCheia`/`aoVoltar` saíram com o `dispatchKeyEvent`: existiam para o
    "voltar" da TV não ser engolido pela engine embutida. Sem engine, some
    também o `127.0.0.1` entrando e saindo do WebSocket.
  - O auto-abrir (célula conecta → 5 s) virou um contador de pedidos, e só
    dispara com a janela do app em foco — em segundo plano, não arranca a tela
    de quem está noutro app. Contador, e não estado da aba, porque tocar de
    novo em "Balança" já selecionada precisa abrir o navegador outra vez.

## v2.4.0 (tag local, 2026-09-19)

- **Redirect da porta 80 restrito aos IPs do box** (chain `balanca_http`).
  A regra geral sequestrava o probe de conectividade dos celulares → "portal
  cativo" → Android trocava a rede padrão para os dados móveis → o WebSocket
  não conectava pelo hotspot. Sem upstream (cabo desligado) o redirect geral
  volta e o `ServidorHttp` responde aos probes com o sucesso esperado;
  reconciliado a cada 30 s.

Branch `feat/processamento-3-etapas` (12 fases, uma por commit, cada uma com
testes TS + JUnit e validação no TX9; plano e decisões em
`PLANEJAMENTO-PROCESSAMENTO.MD`):

- **Fase 0–1** — golden files do pipeline e equivalência TS ↔ Kotlin (1e-12);
  três etapas sem mudar números.
- **Fase 2** — um só filtro principal (`filtroPrincipal`), radio no painel;
  flags antigas seguem aceitas.
- **Fase 3** — Fs estimada pelas marcas de tempo (média em janela de 256,
  histerese 1 % com janela cheia); Notch deixa de assumir 100 Hz.
- **Fase 4** — Hampel causal com piso em σ; limpeza `Hampel → Mediana → Notch`.
- **Fase 5** — Butterworth 2ª ordem com validação de Nyquist.
- **Fase 6** — zona morta na etapa 3 (após o suavizador); `fonteCalculoImpulso`.
- **Fase 7** — detector de evento com limiares/tempos de início e fim;
  "sugerir" preenche zona morta + limiares.
- **Fase 8** — zero tracking (bloqueado em evento e gravação; offset visível).
- **Fase 9** — painel em três blocos, "Pipeline atual", atraso por filtro.
- **Fase 10** — `config_pipeline`/`config_esp` gravados na sessão; "Gravada
  com: …" na Análise.
- **Fase 11** — detrend offline (média/linear só no repouso), salvo nos
  metadados.
- **Fase 12** — perfis Pesagem / Teste de motor / Impacto / Dados brutos.
- **`7ef0a91` — Firmware V18**: marca de tempo no instante da amostra (Δt
  11/12 ms, sem gaps; 86,7 Hz reais) e OLED sem roubar leituras. Gravado na
  ESP pelo atualizador do box.
- **`9d43d76`** — `massa_total_g` passa a ser guardada nos metadados.

## v2.3.0 (tag local, 2026-09-19)

- **`ce1b11f` — Watchdog de conexão: batimento do gateway e reconexão automática.**
  O gateway envia `SAUDE` a cada 2 s (serial, taxa, uptime, clientes) e, ao
  conectar, o estado completo (pipeline, gravação, última CONFIG da ESP, serial).
  A `FonteWebSocket` reconecta sozinha (1, 2, 4, 8, 15 s, para sempre) em queda
  explícita ou após 3 batimentos perdidos; sem LEITURA mas com SAUDE não é queda.
  Chip verde/amarelo/vermelho na barra e selo "sem dados há N s" no gráfico.

- **`67c8eca` / `842f96e` — Calibração na engrenagem** (sai dos controles do gráfico).

- **`0ac8f22` — Configurações no celular:** cada parâmetro vira um bloco; o
  `.cfg-input { width }` perdia para `input[type=number] { width: 100% }`.

- **`80be52b` — Barra de navegação:** só Conexão/Medição/Sessões; o resto na
  engrenagem (⚙). Chip de status com IP · Hz · 👥 clientes (painel com a lista,
  quem grava marcado). `EstadoGateway` observável.

- **`6144682` — Gravação compartilhada no gateway.** `GravadorSessao` grava no
  box direto do pipeline; `GRAVACAO_INICIAR/PARAR/ESTADO` pelo WebSocket;
  qualquer cliente inicia/para, só quem parou abre a análise. O frontend escolhe
  remoto (gateway anunciou) ou local (WebSerial/GitHub Pages, como antes).

- **`cdee9e3` — Atualização automática pelo repositório.** Chave de assinatura
  fixa (`android/chaves`, fora do git; secrets no CI), workflow `release.yml`
  (tag `vX.Y.Z` → APK + `manifest.json` + firmware em GitHub Releases),
  `atualizacao/Atualizador` percorre a cadeia de versões (download, SHA-256,
  `pm install -r` via root, retoma após `MY_PACKAGE_REPLACED`). Tela
  "Atualização" no frontend. Validado 2.3.0 → 2.4.0 → 2.5.0 no TX9.

- **`282f25c` — versionName 2.3.0 / versionCode 4.**

- **`1ddae0a` — Lista de sessões com resumo gravado no banco.** Colunas
  `total_leituras`, `forca_media_queima_n`, `impulso_queima_ns` em `sessoes`
  (mesma SQL no Node e no Kotlin, teste de paridade); GET /sessoes ~6 s → 69 ms.
  Indicador global "aguarde" não bloqueante.

- **`af21096` — Zona morta sugerida lê capacidade/acurácia direto da ESP.**

## Anteriores

- **`85422af` — Sugerir zona morta pela capacidade e acurácia da célula.**
  Botão "sugerir" no campo Zona Morta: limiar = acurácia (fração do fundo de
  escala) × fundo de escala em N (capacidade × gravidade), com os valores da
  calibração. Cálculo puro em `sugerirZonaMortaN()` com testes.

- **`42a382e` — Zona Morta com passo de 0.001 N.**
  O passo do campo era 0.01 N, grande demais para a resolução da célula.
  Markup do painel extraído para `htmlPainelFiltros()` (testável).

- **`a65b8bf` — Aba Balança em tela cheia (quiosque).**
  Na aba Balança o app esconde a barra de abas e as barras do sistema (imersivo)
  e desenha o GeckoView de borda a borda, para a interface web usar a TV inteira.
  O "voltar" volta para a Status — tratado em `MainActivity.dispatchKeyEvent`
  porque o GeckoView consome a tecla antes do `OnBackPressedDispatcher`. Regras
  puras (`ehTelaCheia`/`aoVoltar`) com teste.

- **`ddc1c54` — Frontend na porta 80 via redirect de NAT.**
  A porta 80 é privilegiada e o processo do app não a abre; o `ServidorHttp`
  segue em 8080 e uma regra `iptables -t nat REDIRECT` (via root) encaminha
  :80 → :8080. Assim os celulares acessam `http://<ip>` sem `:8080`. Regra
  idempotente, reaplicada quando o hotspot liga. Coberto por
  `RedirecionamentoPortaTest`.

- **`ceec260` — Abre a Balança automaticamente quando a célula conecta.**
  Inicia na aba Status; se a célula (serial) estiver conectada, troca para a aba
  Balança após 5 s — uma vez por sessão e só se o usuário não escolheu aba
  manualmente. Decisão pura em `NavegacaoInicial`, coberta por teste.

- **`2c699b4` — Corrige "Failed to fetch" na importação + base de testes.**
  A API passa a enviar `Connection: close` em toda resposta: o NanoHTTPD fechava
  o socket keep-alive ocioso após 5 s e o browser reusava a conexão morta na
  importação (falha "Failed to fetch" mesmo com dados já gravados). Lógica de
  importação extraída para `importacaoSessao.ts` (testável) e base de fixtures
  reais em `pacotes/aplicacao/testes/fixtures/importacao/`. Tag **v2.2.0**.

- **`1e4a730` — Backup em pendrive com debounce.**
  O backup deixou de rodar a cada lote de leituras (checkpoint + cópia + su),
  que saturava o box durante importações; passa a agendar uma sincronização com
  atraso.

- **`5f04cf8` — Corrige mock de WebSocket nos testes** (readyState) quebrado
  pelo Node novo.

- **`41de89c` — `analisarMotor` auto-detecta a queima** quando a sessão não vem
  com leituras marcadas (corrige o PDF "deve haver ao menos uma leitura" em
  sessões restauradas/antigas).

- **`642b437` / `890ad72` — Tela e rotas de pendrive** (status, arquivos,
  backup, restaurar `.db`, ejetar) para o TVBox.

## Base (migração Docker → Android, já consolidada)

App em `android/` (pacote `br.edu.ifsc.balancagfig`) reunindo os papéis dos 4
contêineres: gateway serial→WebSocket, API REST + SQLite, frontend (servido por
NanoHTTPD) e gravador de firmware ESP8266. Instalação zero-toque (root e
permissão USB pré-aprovados), hotspot `balancaGFIG` e WebView via GeckoView.
Correções de firmware (V17, CONFIG em blocos) e do `.eng` para o OpenRocket
(dimensões/massa padrão, decimais com ponto).
