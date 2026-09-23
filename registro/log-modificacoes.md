# Log de modificações

Ordem cronológica inversa (mais recente primeiro). Cada item traz o commit e o
motivo.

## v2.8.502 (2026-09-23)

Build de teste do caminho de atualização: sobe só a versão, para o box ter o que
baixar e instalar por cima. Nenhuma linha de código muda — o que se quer conferir
é o percurso inteiro, da release publicada pelo CI (`estavel: true`, manifest e
sha256) até o `pm install -r` no box, passando pela leitura do alvo no painel.
Serve para validar esse caminho antes de a próxima versão de verdade sair.

- `versionCode` 25, `versionName` 2.8.502.
- Sem alteração de código.

## v2.8.501 (2026-09-22)

Primeira versão com três dígitos no último campo. O esquema foi adotado depois
da 2.8.5 justamente por causa dos boxes fora da rede local: agora que a
atualização depende de alguém ir até o local, uma versão publicada errada custa
muito mais caro do que custava — então os dígitos extras marcam releases menores
e mais frequentes, e só o que tem `estavel: true` no manifest chega aos boxes.

- **Os boxes passaram a se apresentar sozinhos: um painel remoto (Cloudflare
  Worker + D1) que diz qual versão cada um está e quando atualizou.** Eles saíram
  da rede local em 22/09/2026 e não há mais como perguntar nada a eles daqui —
  nem ADB, nem `box.sh`. O app manda uma **batida a cada 10 min** (e ~30 s depois
  de subir) com serial, versão, `versionCode`, **quando o APK foi instalado
  segundo o próprio Android** (`PackageInfo.lastUpdateTime`), modelo, placa,
  IPs e se tem root; a página junta tudo numa tabela.
  - É o `lastUpdateTime` que responde "quando atualizou": ele é gravado pelo
    sistema no momento da instalação, e não depende de nenhum relógio nosso nem
    de o app ter estado vivo naquele instante. Onde ele falta — box que
    instalou antes de o painel existir —, a página mostra a primeira batida
    daquela versão, marcada com `~`.
- **O painel também passou a dizer até onde cada box pode atualizar.** Uma linha
  de configuração (`alvo`) que o app lê antes de escolher a release; as
  candidatas acima do alvo são descartadas e o box **pula direto** para a versão
  liberada, sem andar degrau por degrau. As releases continuam no GitHub — o
  banco só diz qual delas vale.
  - O alvo **restringe, nunca amplia**: o portão de manifest estável e de
    sha256 continua sendo conferido no cliente, e um alvo apontando para release
    instável faz o box cair para a estável anterior *dentro* do alvo.
  - Sem painel configurado, sem rede ou sem alvo, tudo volta ao comportamento de
    sempre (a mais nova estável). Não existe estado de erro novo.
- **A chave é única e simples** (decisão de projeto): `X-Chave` nos POSTs,
  `?chave=` na página e no `/boxes`. O `GET /alvo` é público de propósito — é o
  app que o lê, e quem souber o alvo não ganha nada com isso. Ela vai embutida
  no APK: **desencoraja, não é segredo forte**, e está escrito assim no
  `pacotes/painel/LEIA-ME.md`.
  - Um Worker publicado sem o secret não vira painel aberto: sem `CHAVE` no
    ambiente, tudo o que é protegido responde 401.
- **A 2.8.501 é o primeiro APK com a URL e a chave do painel embutidas**, vindas
  dos secrets `PAINEL_URL`/`PAINEL_CHAVE` no CI (e de `painelUrl`/`painelChave`
  em `chaves.properties` no build local). Sem eles o APK sai com os campos
  vazios e o check-in fica desligado: o app se comporta como antes desta versão
  existir — é o caso do build de quem clona o repositório.
  - Consequência a ter em mente na ida ao local: **os boxes só aparecem no
    painel depois de receberem este APK**, e o APK certo é o do CI (o compilado
    à mão, sem `chaves.properties`, sai sem painel).
- **O painel é o primeiro pacote JS do repositório com testes que rodam no CI**
  (`testes-painel.yml`, novo). Os testes chamam o Worker de verdade — um
  `Request`, uma `Response` — sobre um SQLite de verdade atrás da mesma
  interface que o D1 expõe, então o SQL conferido é o SQL que roda em produção.
  O que não dá para cobrir assim (limites do D1, réplicas, o binding) só se
  verifica publicando — está dito no LEIA-ME.
- **Nada disto pode atrapalhar o que já funcionava.** Falha de batida (sem rede,
  401, timeout) vira uma linha no registro local e mais nada; `su` pendurado não
  segura a corrotina (teto de 2 s no `getprop` e no `disponivel`); e a
  verificação de atualização segue o mesmo laço de 6 em 6 horas de antes.

## v2.8.5 (2026-09-22)

- **A 2.8.2 tirou o root de todos os boxes e travou a atualização.** Ela deu
  teto de tempo ao `Root` com `Process.waitFor(long, TimeUnit)` — um overload
  que **só existe a partir da API 26**, e os boxes são API 25 (Android 7.1.2).
  Lá ele lança `NoSuchMethodError`, que o `catch (Throwable)` das duas funções
  do `Root` engolia: *todo* comando root passou a devolver falha em silêncio,
  como se o `su` não respondesse.
  - O sintoma: `InstaladorRoot.instalar()` começa por `if (!Root.disponivel())`
    e devolvia **"root indisponível (su não respondeu)"** — então o `pm install
    -r` da atualização nunca acontecia. A tela parava no meio e o box não tinha
    como sair dali **nem para instalar a versão que conserta**: quem instala é o
    próprio app, e o app é que estava quebrado. Só ADB resgata esses boxes.
  - De quebra, o serial caía para o derivado (o fixado em `/data/misc/gfig`
    exige root), e hotspot, `iptables` e pendrive ficaram sem a parte que
    dependia de root.
  - **Provado no runtime do box, não por leitura de código.** Um dex com a mesma
    chamada, rodado com `app_process` no `.17`, devolveu `NoSuchMethodError …
    declaration of 'java.lang.Process' appears in /system/framework/core-oj.jar`.
    Vale o registro de como esse caminho engana: o `javap` contra o
    `core-oj.jar` do box *mostra* o método existindo — o `java.lang.Process` não
    está nesse jar, e o `javap` cai no JDK da máquina, onde ele existe há muitas
    versões. Só o dex rodando no aparelho decide.
  - **Agora a espera é `waitFor()` sem argumento** (API 1) numa thread, com
    `Thread.join(teto)`. E o `destroyForcibly()` dos dois caminhos de estouro
    virou `destroy()`: é a mesma armadilha, API 26, no caminho que só roda
    quando o `su` já falhou — ficaria armada para disparar uma vez, meses depois.
  - O KDoc do `Root` diz isso em letras grandes, para o próximo que for dar teto
    de tempo a um processo não repetir a 2.8.2.
- **O `lint` passou a rodar no release** (`:app:lintDebug` no `release.yml`), e é
  o `NewApi` dele que aponta chamada acima da API 25. Conferido rodando o lint
  com o `Root.kt` da 2.8.2 de volta no lugar: o build **aborta** com
  `Root.kt:34: Error: Call requires API level 26 (current min is 24):
  java.lang.Process#waitFor [NewApi]` — quatro erros, os dois `waitFor` e os
  dois `destroyForcibly`. É a rede que faltava: o teto de tempo passou por
  revisão, por teste e por release sem ninguém notar, porque o erro não é de
  compilação nem de teste — só aparece no aparelho.
  - Quatro apontamentos antigos de app de TV e de manifesto
    (`MissingTvBanner`, `ImpliedTouchscreenHardware`, `MissingLeanbackSupport`,
    `ProtectedPermissions`) ficaram como **aviso**, para o lint poder barrar o
    que importa sem travar o release por dívida velha.
- **O cache de 30 s de `Root.disponivel()` saiu** (`PortaSerialUsb`, o que a
  2.8.4 chamou de correção do loop de reenumeração). Ele guardava a resposta
  **falsa** por 30 s — escondia o sintoma, não a causa, e teria virado uma
  mentira permanente agora que `disponivel()` volta a responder de verdade.
- **A `2.8.4` virou três artefatos diferentes com o mesmo nome.** A release foi
  publicada à mão enquanto o CI compilava a tag; o CI quebrou atrás dela
  (`a release with the same tag name already exists: v2.8.4`), e a release da
  2.8.3 foi apagada no meio do caminho. Ficaram três coisas se dizendo "2.8.4",
  conferidas dex a dex:
  - o **APK da release** (sha256 `b7a6202…`) — **quebrado**: leva os dois
    `waitFor(long, TimeUnit)` no `classes.dex`. É o que qualquer box baixaria
    dela;
  - o **APK que o CI compilou** do commit da tag (`7374b87`) — pela mesma
    árvore, também quebrado; não chegou a virar release, ficou como artefato do
    run;
  - o **APK instalado à mão no `.17`** (sha256 `89add282…`) — esse *tem* a
    correção (`Root;.esperar`), mas nunca foi publicado, e ainda levava os dois
    `destroyForcibly` que a 2.8.5 troca por `destroy()`.
  - A release da 2.8.4 ainda **não tem `manifest.json`**, e o `Atualizador` até
    aqui só conferia tamanho e sha256 `if (manifesto != null)`: sem manifest,
    instalava sem conferir nada. Quem a pegasse não teria conferência nenhuma —
    é a mesma armadilha da 2.8.2 com outro número. Na 2.8.5 o manifest passou a
    ser obrigatório (ver o portão de estabilidade, abaixo).
  - A 2.8.5 sai pelo caminho normal, tag → CI, sem release criada à mão.
- **A partir da 2.8.501 a última casa da versão tem três dígitos.** A `2.8.5` foi
  a última de um dígito; a seguinte é `2.8.501`, não `2.8.6`. O `Versao.analisar`
  já lia assim (`\d+` convertido para `Int`) e a tag do workflow
  (`v[0-9]+.[0-9]+.[0-9]+`) já aceita três dígitos — o que faltava era escrever a
  regra e travar em teste.
  - Começa na **501**, e não na 001, porque a última casa é **número**: `2.8.001`
    seria *menor* que a `2.8.5` (1 < 5) e nenhum box que já está nela a veria
    como novidade. Com 501 (501 > 5) a primeira do esquema novo é maior que a
    última do antigo.
  - **Nunca publicar versão que normalize para o mesmo número**: `2.8.005` é o
    mesmo número que `2.8.5` — as duas se confundiriam no plano de atualização,
    no `distinctBy` e na tag.
- **O cliente só instala release marcada como estável.** O `manifest.json` ganhou
  `"estavel": true` (o CI escreve em toda release que publica) e o `Manifesto`
  passou a ler o campo. O portão fica em **dois** pontos: na escolha do plano
  (`Atualizador.escolherEstavel` varre as candidatas da mais nova para a mais
  antiga e fica com a primeira que passa) e de novo na hora de instalar
  (`executarPasso`) — o estado é retomável, e um plano herdado de cliente antigo
  chega lá sem ter passado pela escolha.
  - Sem manifest, com manifest sem `sha256`, de outra versão ou sem `estavel`,
    **não instala**: o passo vira `ERRO`, o APK baixado é apagado e o instalador
    nem é chamado.
  - Uma mais nova que não passe no portão **não bloqueia a anterior**: o box cai
    para a estável de baixo em vez de ficar parado. Sem nenhuma estável, o plano
    fica vazio **e sem `erro`** — "não há o que instalar" não é falha a repetir.
  - **Clientes até a 2.8.4 não conhecem o campo** e seguem instalando qualquer
    release mais nova que a deles. Para esses, a proteção é a flag `prerelease`
    do GitHub, que o `Release.analisarLista` já filtrava — é o que a operação
    desta versão usa ao marcar 2.8.2 e 2.8.4 como pré-lançamento.

## v2.8.4 (2026-09-22)

- **Cache de 30 s em `Root.disponivel()`** (`578fb2b`), para o loop de
  reenumeração USB do MXQ que congelava o app. O diagnóstico estava errado: o
  `Root` já estava quebrado desde a 2.8.2 (`waitFor` da API 26) e o cache só
  evitava repetir a chamada que falhava — quem não respondia em 60 s era o
  próprio `Root`, não o `su`. Removido na 2.8.5.

## v2.8.3 (2026-09-22)

- **Um cliente pendurado no WebSocket calava a difusão para todos.** O
  `ServidorWs` difundia numa thread só, para todos os clientes; quando um
  aparelho saía da rede sem fechar o TCP, o `write` para ele enchia o buffer e
  bloqueava — não há timeout de escrita no socket. Dali em diante ninguém mais
  recebia nada: nem LEITURA, nem o SAUDE de batimento.
  - O sintoma que trouxe isso: o painel dizia **"Balança conectada", 86 Hz**,
    e não chegava leitura nenhuma. O estado inicial (SAUDE, SERIAL_OK,
    PIPELINE, CONFIG, GRAVACAO) sai no `onOpen`, fora do difusor — é o que
    fazia o painel parecer saudável com a difusão parada.
  - No `.105`: a thread `ServidorWs-difu` em `sk_stream_wait_memory`, e um
    cliente `FAILED` no ARP havia 765 s ainda na lista. Os clientes vivos
    entravam e saíam a cada ~8 s — o watchdog do frontend (3 batimentos)
    derrubando uma conexão que já não recebia nada.
  - O ping não recolhia o morto: no NanoWSD 2.3.1 o `sendFrame` é
    `synchronized` e o `ping()` passa por ele — quem pingava travava no mesmo
    cliente. E o `onPong` era vazio, sem controle de resposta.
  - **Agora cada cliente tem fila e thread de envio próprias**: o preso trava
    só a si mesmo. Quem não conclui envio há 25 s é dado como morto e fechado
    pelo pingador — e o fechamento não passa pelo `close()` da biblioteca, que
    é o mesmo `sendFrame` preso, e sim pelo stream do handshake, que fecha o
    socket e destrava o `write`.
  - Conferido no `.105`, com um cliente que para de ler de propósito (o mesmo
    que o `.170` fez ao sair do alcance): o engasgado foi para
    `sk_stream_wait_memory` e outro cliente recebeu 22.908 leituras em 270 s
    (85 Hz, nenhuma queda); o travado foi recolhido em ~30 s.
  - O travamento não é imediato: entre sair da rede e o `write` travar, os
    buffers TCP do box e do cliente levam minutos para encher — foi por isso
    que o `.170` ficou pendurado tanto tempo sem que ninguém notasse.
  - A gravação compartilhada nunca foi afetada: `gravador.receber` acontece
    antes do `difundir`, então sessão em andamento continuou sendo gravada
    com o painel congelado.

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
