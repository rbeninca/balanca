# Log de modificações

Ordem cronológica inversa (mais recente primeiro). Cada item traz o commit e o
motivo.

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
