# Modificações — setembro de 2026

Um arquivo por mês, nomeado pelo primeiro dia. Ordem cronológica inversa (mais
recente primeiro): cada item traz o commit, o que mudou e o motivo. As
pendências ficam no fim e são atualizadas a cada versão; no mês que vira, o
arquivo novo nasce levando as que continuam abertas. O contexto do projeto está
em [contexto.md](contexto.md).

## Correção do PUT /calibracao vira release: 2.8.506 (2026-09-30, `4c16e66`)

A correção do `be99256` foi publicada: tag `v2.8.506` (versionCode 29) → CI
verde → release com APK, firmware V19 e `manifest.json` íntegros (sha256 e
tamanho conferidos contra o APK, `estavel: true`). A subida do alvo do painel
para 2.8.506 foi autorizada pelo usuário mas ficou bloqueada na hora de
disparar — o update no box fica por conta do usuário (botão na TV), depois que
o alvo for liberado.

## Calibração não aparecia nas Configurações: PUT bloqueado pelo CORS (2026-09-29, `be99256`)

No equipamento de teste (`.6`), depois de gravar a V19 e calibrar com massa e
texto, o card da célula em Configurações ficava em branco. A ESP tinha tudo
(massa 60 g, descrição "MSSV50A" no CONFIG — o caminho WebSocket funcionou);
o registro do host estava todo nulo.

A causa: o preflight CORS do servidor do box respondia
`Access-Control-Allow-Methods` **sem PUT**. O navegador, que manda OPTIONS
antes do `fetch(method: 'PUT')` com cabeçalho, descartava o PUT /calibracao
sem aviso; o `salvarCalibracao` do SPA caía no catch e gravava só no
localStorage. O wizard mostrava "concluída" mesmo assim (a promessa é
ignorada), e o card — que só lia o registro do host — ficava vazio. O teste
REST 8/8 não pegou porque era curl, sem preflight.

- **PUT entra na lista do CORS** (`FinalizadorResposta`), com teste de
  regressão dedicado. O espelho Node já permitia (`@fastify/cors` padrão).
- **O card pré-preenche também do CONFIG da ESP** (fonte primária desde a
  V19): massa, descrição e capacidade chegam do firmware quando o registro
  do host está vazio (ex.: calibração feita por outro navegador), sem
  sobrescrever o que o usuário digitou. Salvar no card segue sincronizando
  os dois lados.
- Registro do host no `.6` curado com os valores da ESP (60 g / MSSV50A /
  50000 g / 9,80665) e a V19 confirmada na EEPROM após o reboot do box —
  ver pendências.

## Calibração passa a seguir a célula: massa e descrição na ESP (2026-09-29, `1a967b6`)

A capacidade já vivia na EEPROM da ESP, mas massa de calibração e descrição da
célula só existiam no registro do host — a calibração seguia o box, não a
célula. Agora a ESP guarda os três (firmware V19) e o host os usa como fonte
primária, mantendo o registro antigo de fallback para ESP ainda na V18.

- **Firmware V19 (`4c571f7`).** O `Config` ganhou `massaCalibracaoG` (float) e
  `descricaoCelula` (16 bytes, NUL garantido — 15 caracteres úteis, UTF-8),
  anexados ao fim da struct: o blob antigo da EEPROM continua válido, os campos
  novos nascem 0/vazio e o `loadConfig` limpa o que vier sujo (0xFF). No pacote
  CONFIG de 64 bytes os dois ocupam os 23 bytes antes reservados (massa @39,
  descrição @43, 3 sobrando) — o tamanho do pacote não muda. Massa entra por
  `CMD_DEFINIR_PARAM` com o param 0x0C; a descrição ganhou um comando próprio,
  `CMD_SET_STRING` (0x14, 23 bytes: campo_id + 16 de texto + CRC). Comando
  desconhecido continua sendo descartado sem travar: V18 e V19 convivem.
- **Espelhos do protocolo (Kotlin e TS).** Decodificam os dois campos com
  validação defensiva — massa fora de 0 < x < 1e7 e descrição com byte de
  controle, 0xFF ou sem NUL viram ausente (o V18 manda zeros ali, mas a
  validação cobre EEPROM antiga). Na ida, o texto trunca a 15 bytes sem cortar
  um caractere no meio. Testes espelhados dos dois lados, byte a byte.
- **A sessão prefere a ESP.** As três colunas (`massa_calibracao_g`,
  `descricao_celula`, `capacidade_celula_g`) passam a sair do `config_esp`
  recebido no INSERT, campo a campo, e caem no registro do host quando a ESP
  não manda (ou manda inválido). Android e API Node idênticos.
- **SPA grava nos dois lugares.** O wizard finaliza enviando massa (param 0x0C)
  e descrição (CMD_DEFINIR_DESCRICAO) além do que já mandava, e segue gravando
  o registro do host; o card de Configurações faz o mesmo ao salvar (sem
  reenviar a capacidade, que já vive na ESP). O pré-preenchimento do passo 4
  também vem do CONFIG da ESP, sem sobrescrever digitação. O relatório não
  mudou: as colunas da sessão continuam sendo a fonte, e o config_esp vira
  segunda fonte no modo "nova".

Versão **2.8.505** (versionCode 28) publicada em 29/09/2026 com o firmware V19
embutido; o alvo do painel segue em 2.8.503 (rollout é decisão à parte).

## Célula de carga: relatório, sessões e g local (2026-09-29, `8bf5b68`)

Depois do teste estático, o prof. Marchi pediu três coisas: o relatório mostrar
a massa usada na calibração, uma descrição breve da célula (ex.: "CALT 500 kg
2023") e o g da calibração deixar de ser fixo — no local do teste é 9,78769,
0,19% abaixo do 9,80665 que o app usa, diferença maior que a precisão da célula.
Hoje a calibração só grava o fator de conversão no firmware; massa, descrição e
o resto não existem em lugar nenhum.

- **Registro de calibração no host.** Tabela singleton `calibracao` no SQLite
  (box e gateway Node): massa de referência, descrição, capacidade e gravidade,
  com rota própria — `GET /calibracao` livre e `PUT` autenticado, parcial
  (ausente preserva, null apaga), 400 para massa ≤ 0, capacidade ≤ 0 ou g fora
  de 9–10. O assistente grava ao finalizar; um card novo em Configurações
  edita à mão (calibração feita fora do wizard). No WebSerial sem REST, o
  registro vive no navegador (localStorage).
- **A sessão fotografa a célula ao criar.** Três colunas novas em `sessoes` —
  `massa_calibracao_g`, `descricao_celula`, `capacidade_celula_g` — escritas só
  no INSERT. Nenhuma sessão salva é tocada: as antigas ficam com NULL e o
  relatório delas sai como sempre saiu. Gravidade e acurácia não ganharam
  coluna de propósito: já estão no `config_esp` da sessão, que é a fonte certa
  (o g vigente no teste, não o de hoje).
- **Bloco "Célula de Carga" no relatório.** Descrição, massa de calibração,
  capacidade, gravidade e acurácia — e some inteiro nas sessões antigas. A
  acurácia substitui o "±0,05% F.S." fixo das duas seções de incerteza e a
  gravidade substitui o "9,80665" fixo. Os kgf/gf continuam na gravidade
  padrão: a unidade é definida por ela, não pela do local. Vale no PDF da
  análise, no PDF por item e no lote de Sessões; o item da lista mostra
  "Célula: … · massa … g".
- **Assistente de calibração pré-preenchido.** Passo 4 com gravidade local e
  descrição da célula; os campos abrem com o valor atual (config da ESP +
  registro do host), sem sobrescrever o que o usuário já digitou. O "valor
  esperado" do passo 5 usa o g escolhido, e o finalizar envia o g ao firmware
  (param 0x01) e grava o registro.
- **Medição coerente com o g local.** A conversão N → kg/g do display e do
  gráfico usa o g da célula (9,80665 até o CONFIG chegar). No relatório do modo
  "nova" (gravação recém-parada), a célula vem dos valores atuais — os mesmos
  que a sessão vai fotografar ao salvar.

Contrato novo:

    GET  /calibracao → 200 { massa_referencia_g, descricao_celula,
        capacidade_max_g, gravidade, atualizada_em } (nulls quando ausente)
    PUT  /calibracao (autenticado; parcial, null apaga) → mesma linha;
        400 se massa ≤ 0, capacidade ≤ 0 ou g fora de 9–10
    GET  /sessoes (e /sessoes/:id): cada linha ganha massa_calibracao_g,
        descricao_celula e capacidade_celula_g (null em sessões antigas)

## Célula de carga testada no box e ajuste do /calibracao (2026-09-29, `e952941`)

Roteiro completo no box do laboratório (192.168.1.6, GFIG-MXQ-A82003AC10E7),
com a célula ligada no gateway: compilação limpa instalada (`modificada`),
teste REST de ponta a ponta, volta à 2.8.501 guardada e atualização pela web
disparada por `POST /atualizacao/iniciar` — o box baixou do GitHub e subiu
sozinho para a 2.8.503 em ~100 s.

- **REST no box: 8/8.** GET sem registro com os nulls, PUT parcial gravando,
  400 para g fora de 9–10, sessão nova fotografando as 3 colunas e as antigas
  intactas com null, limpeza apagando a sessão e zerando o registro.
- **Uma falha real no meio:** o GET devolvia `{}` e o PUT zerado omitia os
  campos — `JSONObject.put(key, null)` remove a chave no org.json. Corrigido
  com `JSONObject.NULL` (`e952941`), recompilado e re-testado.
- **Gateway conferido por dentro** (WebSocket, `CMD_OBTER_CONFIG`): gravidade
  9,80665 (padrão; o g local só chega lá pelo wizard, param 0x01), capacidade
  50 kg, acurácia 0,003% F.S., fator de conversão calibrado.
- **Sem chave de API no box** — o `.chave-api` é opcional e ninguém o criou:
  a REST fica aberta, como documenta o código. Nenhuma chave existe no git;
  a do painel mora em secrets do GitHub e no `wrangler secret put`.
- O APK guardado (2.8.501) continuou íntegro (sha256 contra o manifest) e o
  update pela web foi o caminho real do botão da TV.

## Ferramentas de bancada: ciclo de teste e kit de instalação (2026-09-24)

Dois scripts para trabalhar no box sem depender de lembrar comando: um faz a ida
e volta entre a versão em teste e a guardada, o outro monta a pasta que alguém
leva para instalar o app no local. A motivação é a quebra do dia anterior — o
box saiu da rede local e não havia outro jeito de chegar nele.

- **`android/scripts/ciclo-teste.sh` (`5c14d9b`, ajuste em `ab69e5c`).** Instala
  a versão em teste e devolve o box à versão guardada, para ele voltar a se
  atualizar pela web sozinho:
  - `... modificada` compila do zero (o `BuildConfig` é inlinado nos pontos de
    uso: build incremental sai sem URL e sem chave, e o box some do painel),
    instala, roda `am start` e espera a batida no painel;
  - `... guardada` confere o sha256 do APK guardado contra o manifest,
    `install -r -d`, espera 20 s (a flag de pacote parado é gravada depois) e
    acompanha a atualização pela web;
  - `... situacao` só lê: versão no box, versão local e a linha do painel.
- **`android/scripts/montar-kit.sh` + `android/scripts/kit/` (`ea63354`).** Monta
  a pasta que vai para o local (Windows 10): o APK da release, o `adb` do
  platform-tools e três arquivos de apoio — `instalar.bat` (dois cliques),
  `LEIA-ME.txt` e `COMANDOS.txt` (os mesmos passos na mão).
  - O APK baixado é conferido contra o sha256 e o tamanho do `manifest.json`
    antes de entrar no kit: é o mesmo arquivo que o box baixaria.
  - O `.bat` assume `192.168.43.1` (hotspot do box) e aceita outro IP como
    argumento. Conecta, espera a autorização na TV, instala, dispara `am start`
    e confere `stopped=false` — pacote recém-instalado fica parado e não sobe
    sozinho no boot seguinte.
  - Os arquivos que vão para o Windows ficam com CRLF (e os `.txt` com BOM),
    fixado no `.gitattributes` da pasta.
  - Conferido sob `wine`, o que rendeu dois achados de cmd: `for %%f in
    ("curinga")` não devolve nada (a descoberta do APK saiu de `dir /b`) e,
    dentro de `for /f`, o caminho do adb vai sem aspas.

## v2.8.503 (2026-09-23)

Build de teste instalado à mão num TVBOX: a 2.8.501 fica guardada para devolver o
box ao caminho normal de atualização depois do teste.

- **A zona morta deixou de esperar o clique em "sugerir".** O campo nascia com o
  valor de partida (0,5 N no gateway, 0,05 N no modo local) e a
  capacidade/acurácia gravada na célula só era usada se o usuário clicasse no
  botão; agora, quando o config da ESP chega, o campo recebe o valor sugerido
  sozinho.
  - Só o valor: não liga a zona morta, não mexe nos limiares do detector e não
    envia nada. Quem aplica continua sendo o usuário — o botão "sugerir" segue
    fazendo o conjunto (liga a zona morta, preenche os limiares e aplica).
  - A sugestão automática só age enquanto o campo está num valor de partida e
    ninguém mexeu nele: digitar no campo, clicar em "sugerir" ou aplicar um
    perfil a desliga pelo resto da sessão. Valor ajustado à mão nunca é
    sobrescrito.
- `versionCode` 26, `versionName` 2.8.503.

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

## Pendências

### Abertas

- **Célula de carga no relatório: falta o roteiro manual na TV.** O lado do
  box está testado (REST 8/8 e gateway conferido no box do laboratório, ver a
  entrada de 2026-09-29). O que o teste remoto não cobre: wizard abrindo
  pré-preenchido, g = 9,78769 no "valor esperado" e no relatório, bloco
  "Célula de Carga" no PDF e nas sessões, e uma sessão antiga saindo sem o
  bloco — conferir na TV, com a célula. Na 2.8.505 entram também: massa e
  descrição pré-preenchidas vindas do CONFIG da ESP, a conferência de que os
  dois chegaram na ESP após o wizard (CMD_OBTER_CONFIG de volta), o card de
  Configurações pré-preenchido do CONFIG e o Salvar do card sincronizando o
  registro do host (o PUT só passou a chegar com o `be99256`).
- **Firmware V19 ainda não foi testado no box.** O teste remoto avançou no
  `.6`: a V19 está gravada, o wizard gravou massa (0x0C) e descrição
  (CMD_DEFINIR_DESCRICAO) na EEPROM (CONFIG devolve 60 g / "MSSV50A") e os
  valores sobreviveram ao reboot do box. Falta: reler o CONFIG depois de um
  flash V19 pelo app (porta 8767) e conferir que a calibração antiga (fator,
  tara, capacidade, g) sobrevive ao flash — o setor de EEPROM não é tocado
  pelo `write_flash 0x0`, mas isso ainda não foi conferido na bancada — e
  gravar uma sessão com a célula para ver as colunas saindo do `config_esp`.
- **Alvo do painel em 2.8.503, com 2.8.504, 2.8.505 e 2.8.506 publicadas.**
  A subida para 2.8.506 foi autorizada pelo usuário em 30/09/2026 e está
  pendente só de disparar; o usuário faz o update no box (botão na TV).
  O `POST /alvo` libera a versão escolhida para todos os boxes de uma
  vez (cada um que consultar o painel baixa e instala) — decisão de rollout,
  a tomar quando for a hora.

- **A atualização dos boxes no local é `adb install -r` direto.** Não há caminho
  à distância: o botão do painel depende de o box alcançar o GitHub, e lá quem
  instala é alguém com um notebook. Antes de sair, com internet, levar o APK:

  ```bash
  gh release download v2.8.501 -R rbeninca/balanca -p balancagfig-2.8.501.apk
  ```

  **Levar o da 2.8.501, e não o da 2.8.5**, por dois motivos: é o APK que tem a
  URL e a chave do painel embutidas (sem elas o box não aparece no painel nem lê
  o alvo) e é o que traz os dígitos extras do versionName. O APK que o CI
  publica é o que serve — um compilado à mão, sem `chaves.properties`, sai sem
  painel.

  Lá, com `adb connect <ip>:5555` feito, um `adb -s <ip>:5555 install -r
  balancagfig-2.8.501.apk` por box. **O APK da release serve em qualquer um
  deles**, inclusive nos que foram instalados pelo `box.sh`: `debug` e `release`
  são assinados com a mesma chave (`bc7d4ae8…`), então é um `install -r` comum —
  sem `desfazer` e sem apagar as sessões gravadas. Quem levar o repositório no
  notebook pode trocar por `bash scripts/box.sh instalar <ip>`, que compila,
  instala, faz os passos de `su` (pré-aprovar o root, `WRITE_SETTINGS`,
  permissão USB) e confere hotspot, serial e frontend.

  O que essa ida resolve: o **`.17`** sai da 2.8.4, o **`.105`** e o **`.112`**
  saem da 2.7.3 (17 MB, um minuto cada, em vez dos 12 downloads da cadeia), e o
  **`.118`** sai da 2.8.2 — esse é o que **só** sai assim: com o root quebrado,
  o app não instala nem se alguém apertar o botão.

  **Depois da 2.8.501 esta pendência deixa de ser o único jeito de saber como
  estão.** Nessa versão o app passou a bater no painel a cada 10 min (ver
  `2026-09-01--modificacoes.md`), e é o painel que passa a responder "qual versão cada
  box está, e quando atualizou" — daqui, sem ninguém ir até lá. Enquanto os
  boxes estiverem abaixo da 2.8.501, porém, **o painel fica vazio**: nada bate
  nele. A ida instala a 2.8.501 e, além dos resgates acima, liga esse canal.
  Publicar o painel (uma vez, na conta Cloudflare) é pré-requisito, e o passo a
  passo está em `pacotes/painel/LEIA-ME.md`.

- **O `.118` ainda pode estar preso na 2.8.2.** A 2.8.2 chamou
  `Process.waitFor(long, TimeUnit)` (API 26) e os boxes são API 25 (Android
  7.1.2): o `NoSuchMethodError` foi engolido pelo `catch (Throwable)` do `Root`,
  que passou a responder "não" a *todo* comando. Como quem instala a atualização
  é o próprio app, via `su`, um box na 2.8.2 **não sai de lá sozinho** — nem
  para instalar a versão que conserta. O caso inteiro está em
  `2026-09-01--modificacoes.md` (v2.8.5).
  - O **`.16`** estava nesse estado e foi **resgatado em 22/09/2026**
    (`cd android && bash scripts/box.sh instalar 192.168.1.16`): está na 2.8.5,
    com hotspot, serial a 4 Hz e frontend conferidos pelo script.
  - Falta o **`.118`** = `GFIG-TX9-58EB81E36158`: 2.8.2 pela tabela, não
    respondeu em 22/09/2026 (nem ping). **Não dá mais para resgatar daqui** — os
    boxes saíram da rede local em 22/09/2026 (ver `inventario.md`): precisa de
    alguém no local, com um notebook na rede de lá. Lá, o mesmo comando —
    o `adb install -r` do script não usa root *no box*, que é justamente o que
    funciona em quem está preso. Os passos de `su` dele vão por `adb shell su`, e
    não pelo `Root` do app: no `.16` eles aplicaram numa passada só (root
    pré-aprovado, `WRITE_SETTINGS`, permissão USB), ao contrário do que esta
    pendência supunha.

- **`.105` e `.112` seguem na 2.7.3** (desligados desde antes da conferência de
  22/09, e fora da rede local desde então). Duas saídas, em ordem de preferência:
  1. instalar a 2.8.501 à mão nos dois numa ida ao local
     (`bash scripts/box.sh instalar <ip>`, ~17 MB, um minuto cada) em vez de
     deixar a cadeia andar;
  2. deixar que andem sozinhos — já é seguro desde 22/09/2026 (ver o item
     abaixo), mas são **12 degraus**, e seis desses APKs são da era do GeckoView,
     ~120 MB cada.

- **A cadeia de quem está antes da 2.8.2 não passa mais por ela.** As releases
  **2.8.2 e 2.8.4** ficaram como **pré-lançamento** no GitHub em 22/09/2026 (a
  2.8.3 não existe: nem tag nem release — conferido). O app filtra `prerelease`
  desde o primeiro atualizador (`Release.analisarLista`, conferido na tag
  `v2.7.3`), então a cadeia de um box na 2.7.3 pula as duas e segue para a 2.8.5.
  Reversível (`gh release edit vX.Y.Z --prerelease=false`) e o rótulo é honesto:
  as duas são quebradas, e a 2.8.4 está no ar **sem `manifest.json`** — um
  cliente até a 2.8.4 que a pegasse instalaria **sem conferência nenhuma**.
  Clientes da 2.8.5 em diante não dependem da flag: o portão de estabilidade
  recusa release sem `estavel`.

- **Boxes com a chave antiga.** Só o `.105` foi reinstalado com a chave fixa;
  os demais precisam de `./gradlew :app:instalarNoTx9` uma vez (uid muda).

- **Ruído nos testes do WebSerial.** `FonteWebSerial.teste.ts` emite uma
  "unhandled rejection" no mock do laço de leitura (pré-existente; os testes
  passam). Limpar quando sobrar tempo.

- **Verificar com um celular no hotspot** (com e sem cabo) que o WiFi fica
  como rede padrão e o WebSocket conecta — a correção do redirect :80 foi
  validada pela LAN e por testes, mas não com um celular real.

### Resolvidas nesta rodada

- **A 2.8.5 no ar, pelo caminho normal.** Tag `v2.8.5` → CI (testes, lint e APK
  assinado) → release publicada pelo `github-actions[bot]`, sem nada criado à
  mão. Conferido depois, baixando os assets: `estavel: true` e versionCode 23 no
  manifest, sha256 e tamanho batendo com o APK, e o APK com a mesma chave dos
  boxes (`bc7d4ae8…`) e sem o `waitFor(long, TimeUnit)` no dex. O `.16`, que
  estava preso, foi resgatado por ADB no mesmo dia e está nela.
- **Root "indisponível" nos boxes, e o cache de 30 s que escondia isso.** A
  causa não era o `su` nem a reenumeração USB: era o `Root` quebrado desde a
  2.8.2 (`waitFor` da API 26). O cache de `Root.disponivel()` saiu junto — ele
  guardava a resposta falsa por 30 s. Conferido no runtime do `.16`, com um dex
  rodado por `app_process` que chama o `Root` **do APK instalado**: `disponivel()`
  e `executar("id")` devolvem `true` (`uid=0(root)`), `executarLendo` devolve saída
  de verdade e `executar("false")` devolve `false`. O APK publicado foi conferido
  por dentro também: `aapt2` dá versionCode 23 / versionName 2.8.5, o sha256 bate
  com o do manifest, e o `dexdump` dos dois dex mostra a única chamada a
  `Process.waitFor` como **`waitFor:()I`** (a sem argumentos, API 1) — a variante
  `(J, TimeUnit)` da 2.8.2 não aparece em dex nenhum. Ver `2026-09-01--modificacoes.md`
  (v2.8.5).
- **Push.** `main` e todas as tags até a `v2.8.4` estão no `origin` — conferido
  em 22/09/2026 (`git ls-remote`), com `main` local igualzinho ao remoto.
- **Secrets do CI.** O `release.yml` tem credencial e chave de assinatura: o run
  da v2.8.4 passou por "Restaurar a chave de assinatura", "Compilar APK
  assinado" e "Montar artefatos" — só falhou em "Publicar a release", porque
  alguém já havia criado a release v2.8.4 à mão enquanto o CI compilava. O
  backup do keystore continua sendo devido (ver "Notas de operação" em
  [contexto.md](contexto.md)).
- **ESP parando de enviar dados após ~15 min** — watchdog de inatividade. O app
  reconecta automaticamente se a ESP não enviar nada por 15 segundos; o log registra
  `"inatividade detectada"` quando dispara. Antes era preciso reiniciar o app
  manualmente.
- **APK de 122 MB para 20 MB**: o GeckoView saiu. A aba Balança abre o painel
  no Chrome do box (Custom Tab), que já o renderiza sem ajuste. De quebra
  resolveu o GeckoView reconectando o `127.0.0.1` no WebSocket, e o "voltar" na
  TV deixou de ser consumido pela engine embutida.
- Instalação em box novo testada (TX9 `.103`): `instalarNoTx9` em 2 min 12 s
  sem toque na TV; `desfazerNoTx9` devolve o estado original (conferido).
  Boxes com a chave antiga: `desfazerNoTx9` antes.
- "Portal cativo" no hotspot e WebSocket que não conectava pelo celular —
  redirect :80 restrito aos IPs do box + probes respondidos sem upstream.
- Reorganização dos filtros em 3 etapas — 12 fases mergeadas em `main` (v2.4.0).
- Firmware V18 (marcas de tempo sem quantização, display sem gaps) — gravado.
- Tag `v2.3.0` e `versionName 2.3.0` alinhados; log em `2026-09-01--modificacoes.md`.
- Lista de sessões lenta (dezenas de segundos) — resumo gravado no banco.
- Cada cliente gravava por conta própria — gravação compartilhada no gateway.
- Gráfico parado após perder WiFi — watchdog + reconexão.
- Atualização do app sem git/PC — GitHub Releases + atualizador no app.

- "Failed to fetch" na importação de JSON — corrigido (`2c699b4`).
- Frontend acessível sem `:8080` (porta 80) — implantado e verificado
  (`ddc1c54`).
- Auto-abrir a Balança com a célula conectada — implantado (`ceec260`).
