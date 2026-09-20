# BalançaGFIG — Host Android (TVBox TX9)

App Android que roda o **Cenário A** (gateway fixo) inteiro dentro de um TVBox,
substituindo os quatro serviços Docker por um único APK. A célula de carga
(ESP8266 + HX711) fica na USB do box; o app lê a serial, processa os dados,
serve a interface web e persiste as sessões. Qualquer celular, tablet ou
notebook na mesma rede — ou no hotspot que o próprio app cria — acessa tudo
pelo navegador.

```
ESP8266 + HX711
   │ USB 921600 (protocolo binário + CRC16)
   ▼
┌──────────────────────────────────────────────┐
│ ServicoBalanca (Foreground Service)          │
│                                              │
│  PortaSerialUsb ─► Pipeline ─► ServidorWs    │  :8765  leituras (WebSocket)
│  (usb-serial-for-android)      ServidorSaude │  :8766  /saude
│                                ServidorHttp  │  :8080  frontend (dist-web)
│                                ServidorApi   │  :3000  sessões (SQLite)
│                                ServidorAtual.│  :8767  gravar firmware
│                                              │
│  HotspotManager · PainelFrontalTx9           │
└──────────────────────────────────────────────┘
   ▲ Activity: painel de status (WebView entra quando a WebView do box for atualizada)
```

## Por que um app em vez do Docker

O TX9 já roda Android (7.1.2 / API 25, mesmo anunciando "10"). Um APK dispensa
Docker e Linux no box, reaproveita o hotspot e o display frontal do próprio
aparelho, e sobe sozinho no boot. Instalar em dezenas de aparelhos vira um
`adb install`.

## Correspondência com os containers do Cenário A

| Container Docker | Peça no app | Porta |
|---|---|---|
| `gateway`      | `serial/` + `processamento/` + `servidor/ServidorWs` | 8765 / 8766 |
| `webapp` (nginx) | `servidor/ServidorHttp` (serve `dist-web` embutido) | 8080 |
| `api` (Fastify) | `servidor/ServidorApi` + `armazenamento/BancoDados` | 3000 |
| `atualizador` (esptool) | `firmware/GravadorEsp8266` + `servidor/ServidorAtualizador` | 8767 |

O protocolo, o pipeline de filtros e o esquema do banco são portes fiéis dos
pacotes TypeScript (`pacotes/protocolo`, `pacotes/processamento`, `pacotes/api`);
os testes em `app/src/test` conferem paridade com os testes originais. O
frontend servido é o mesmo `pacotes/aplicacao/dist-web`, então o app não
precisa reimplementar nenhuma tela.

## Estrutura

```
android/app/src/main/java/br/edu/ifsc/balancagfig/
├── protocolo/       Crc16, Codificador, Enquadrador, tipos (porte de pacotes/protocolo)
├── serial/          PortaSerialUsb, LeitorUsb, AutorizacaoUsb (CH340 via USB Host)
├── processamento/   PipelineProcessamento + filtros (porte de pacotes/processamento)
├── servidor/        ServidorHttp, ServidorWs, ServidorApi, ServidorAtualizador, Mensagens
├── armazenamento/   BancoDados (SQLite; usa pacotes/api/.../esquema.sql)
├── firmware/        GravadorEsp8266 (grava o ESP pela porta, à la esptool)
├── sistema/         HotspotManager, PainelFrontalTx9, EnderecosRede, Root (copiados do IFRede)
├── ServicoBalanca   orquestra tudo em um Foreground Service
├── EstadoHost       estado observável para a UI
├── ReceptorBoot     sobe no BOOT_COMPLETED
└── MainActivity     painel de status
```

Assets embutidos pelo Gradle (não versionados — ver `.gitignore`):
`assets/web/` (dist-web + `firmware.bin` + `firmware-versao.json`),
`assets/esquema.sql`. O stub do gravador (`assets/firmware/stub_esp8266.json`,
do esptool-js, Apache-2.0) é versionado.

## Instalação

Pré-requisitos: Android SDK, JDK 17+, o box acessível por ADB (rede ou USB) e
o firmware/frontend já compilados na raiz do repo.

```bash
# na raiz do repo, uma vez, para preparar os assets embutidos:
npm run compilar -w pacotes/aplicacao        # gera pacotes/aplicacao/dist-web
(cd firmware && ~/.local/bin/pio run && cp .pio/build/nodemcuv2/firmware.bin .)   # se mexeu no firmware

# tudo se faz por um script só, passando o IP do box:
cd android

bash scripts/box.sh estado   192.168.1.110   # só confere, não mexe em nada
bash scripts/box.sh instalar 192.168.1.110   # instala e pré-aprova root/USB
bash scripts/box.sh desfazer 192.168.1.110   # tira tudo e devolve o box ao original
bash scripts/box.sh 192.168.1.110            # ciclo: desfazer + instalar
bash scripts/box.sh limpar   192.168.1.110   # tira apps que não são do projeto e o lixo
bash scripts/box.sh launcher 192.168.1.110   # instala o Painel GFIG como tela inicial
bash scripts/box.sh launcher-desfazer 192.168.1.110   # devolve a tela inicial anterior
```

As tarefas que **apagam** algo (`desfazer`, `limpar`) perguntam antes. Fora de um
terminal elas se recusam a agir — nesse caso é preciso passar `--sim` de
propósito, para que apagar app ou sessão não aconteça por acidente.

O `estado` é o diagnóstico de campo: confere app, app-op, API, frontend,
WebSocket com a serial e a taxa, hotspot e permissão USB — e lista **interfaces
de rede com MAC/IP/estado**, **espaço em disco** por ponto de montagem e os
**apps instalados** (terceiros e sistema). Se o IP estiver errado, ele varre a
`/24` e mostra os hosts com ADB aberto.

O `box.sh` detecta sozinho o firmware e o gerenciador de root, e faz o que
cada um precisa. Vale para os dois boxes em uso:

| Box | Plataforma | Root | Como o hotspot sobe |
|---|---|---|---|
| **TX9** | Amlogic `gxl` | Superuser Koush | `setWifiApEnabled` funciona direto |
| **MXQ** | Rockchip `rk322x` | SuperSU Chainfire (já libera root por padrão) | o framework recusa o app (bug do firmware); o app liga o AP **pela tela do Settings**, com o Settings rodando como uid 1000 |

### O que o `instalar` faz (~3 min pela rede)

1. **Pré-checagens com mensagem acionável**: ADB acessível (senão explica como
   ligar a depuração pela rede na TV) e `su` funcionando.
2. Instala o APK (assinado com a chave fixa — ver `chaves/LEIA-ME.md`).
3. **Abre o app uma vez.** Um pacote recém-instalado fica no estado *stopped*,
   e nesse estado o Android **não entrega o `BOOT_COMPLETED`** — sem este passo
   o app não subiria no boot seguinte.
4. Pré-aprova o **root** do app (só onde há banco do Koush — no SuperSU do MXQ
   não existe política por app), libera o app-op **WRITE_SETTINGS** (hotspot)
   e, se a balança estiver plugada, pré-grava a **permissão USB**, guardando o
   arquivo original (`.balanca.bak`) ou marcando que não existia
   (`.balanca.ausente`).
5. Reinicia o box e **verifica**: versão instalada, API `:3000`, frontend na
   porta 80, WebSocket com a serial e a taxa, e o hotspot.

### O que o `desfazer` faz

Para o app, remove a chain `balanca_http` do NAT (o redirect da porta 80),
devolve o app-op `WRITE_SETTINGS` ao padrão, apaga a política de root (onde
existe), desinstala — **o que apaga as sessões gravadas**; exporte antes pela
tela Sessões —, restaura o `usb_device_manager.xml` original e reinicia.

### O que o `limpar` faz

Tira do box o que não é do projeto, em duas frentes:

1. **Apps de terceiros** (instalados em `/data`), listando antes o que sai. Ficam
   de fora, sempre: o app da balança, o launcher do projeto e os gerenciadores de
   root — sem eles o app perde root e o hotspot morre. Num box de fábrica isso
   costuma tirar YouTube, Netflix, Kodi, Facebook, Skype, loja de apps e afins.
2. **Lixo acumulado**: staging de instalações interrompidas pelo adb
   (`/data/app/vmdl*.tmp`, que costuma ser a maior parte), imagens e sobras de
   apps já removidos, restos de ferramentas de diagnóstico, tombstones, ANR,
   dropbox e o buffer do logcat.

**Nunca toca em app de `/system`** — remover app de sistema é o que deixa box em
bootloop, e nenhum ganho de limpeza justifica o risco. Ao fim informa quanto
liberou em `/data`.

### O launcher do projeto (Painel GFIG)

Um app à parte, em `launcherbox/`, que substitui a tela inicial de fábrica: a
logo do projeto, os apps que abrem tela (com os ícones), as interfaces de rede
com MAC e IP, o espaço em disco e o nome e a senha do hotspot. Tem README
próprio.

```bash
bash scripts/box.sh launcher 192.168.1.110            # instala e define como tela inicial
bash scripts/box.sh launcher-desfazer 192.168.1.110   # devolve a anterior
```

Trocar a tela inicial é reversível: o `launcher` grava a anterior antes de trocar
e o `launcher-desfazer` a devolve — verificado nos dois boxes.

**O `launcher-desfazer` não usa `set-home-activity`.** No API 25 esse comando
responde `Success` mas **não troca de volta**: a preferência continua apontando
para o nosso launcher. O que funciona é **desabilitar** o nosso pacote — aí o
Android resolve a tela inicial para o próximo candidato, que é justamente o que
estava antes. O launcher continua instalado, apenas desabilitado; `launcher`
reabilita e ele volta a ser a tela inicial.

### Duas ressalvas que os testes revelaram

**1. O app precisa ser aberto uma vez depois de instalar.** Um pacote
recém-instalado fica no estado *stopped*, e nesse estado o Android não entrega
o `BOOT_COMPLETED`. O script abre e confere a flag; como essa gravação é
assíncrona, ele também deixa o box assentar antes de reiniciar e, se ainda
assim o app não subir, abre pela rede — nada disso é toque na TV.

**2. O MXQ é apertado de memória.** Ele tem 4 GB e, no pico do boot, fica com
~40 MB livres com os limiares do lowmemorykiller indo até 45 MB. O app chega a
ser iniciado no boot (a task fica criada) mas o processo nem sempre sobrevive.
Por isso a verificação pós-reboot importa: se aparecer `RESULTADO: FALHOU`,
rode `estado` e, se preciso, abra o app pela rede.

### Pré-requisitos do box

Root e ADB pela rede. Se o box tiver uma versão do app assinada com outra
chave, a instalação recusa (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`): rode
`desfazer` primeiro.

Se a balança não estava plugada na instalação, plugue depois: o app conecta
sozinho.

## Operação

- Frontend: `http://<ip-do-box>:8080` (ou `http://192.168.43.1:8080` pelo hotspot).
- Gravar/atualizar firmware: tela **Firmware** do frontend → "Gravar via Gateway"
  (grava o `firmware.bin` embutido no APK, pela porta da balança, sem PC).
- O painel na TV mostra força ao vivo, taxa, IPs, hotspot e um registro; a
  WebView com o frontend entra quando a WebView do box (Chromium 52) for
  atualizada.

## Hotspot e celulares (porta 80, probes de conectividade)

O frontend responde em `http://<ip>` porque uma regra de NAT (chain
`balanca_http`, via root) redireciona a porta 80 para a 8080 — **só para os IPs
do box**. Um redirect geral sequestrava o probe de conectividade dos celulares
(`generate_204`): o Android concluía "WiFi sem internet", mostrava um portal
cativo e passava a rede padrão para os dados móveis — a página abria, mas o
WebSocket não conectava.

- **Com cabo (upstream)**: o probe passa pelo NAT até a internet, o WiFi é
  validado e tudo funciona; sites HTTP não são sequestrados.
- **Sem cabo (campo)**: o serviço detecta a falta de upstream (`ip route get
  8.8.8.8`) e adiciona o redirect geral; o `ServidorHttp` responde aos probes
  com o sucesso que cada sistema espera (204, "Success", "Microsoft Connect
  Test"…), o celular mantém o WiFi como padrão sem perguntar nada.
- A regra é reconciliada a cada 30 s (cabo ligado/desligado, IP novo).

## Gravação compartilhada

No gateway a gravação é feita **no próprio box**, alimentada direto pelo
pipeline (`armazenamento/GravadorSessao.kt`): há um único estado, difundido a
todos os clientes pelo WebSocket (`GRAVACAO_ESTADO`, com a lista de clientes
conectados). Qualquer cliente pode iniciar (`GRAVACAO_INICIAR {nome}`) ou parar
(`GRAVACAO_PARAR`); só quem parou abre a análise, os outros recebem o aviso de
sessão salva. A gravação continua mesmo que todos os celulares caiam.

O frontend escolhe sozinho (`nucleo/ControladorGravacao.ts`): se o gateway
anunciou `GRAVACAO_ESTADO`, usa o controle remoto; senão (WebSerial/GitHub
Pages, gateway Node), grava no cliente como sempre.

## Atualização automática pelo repositório

O app se atualiza sozinho a partir de **GitHub Releases** — as equipes não
precisam de git nem de PC:

1. Publicar uma versão: subir `versionCode`/`versionName` em
   `app/build.gradle.kts`, commitar e empurrar uma tag `vX.Y.Z`
   (`git tag -a v2.4.0 -m "..." && git push origin v2.4.0`). O workflow
   `.github/workflows/release.yml` compila o frontend e o APK, assina com a
   chave fixa (secrets — ver `chaves/LEIA-ME.md`), gera o `manifest.json`
   (versão, SHA-256, tamanho) e cria a release com APK + firmware.
2. No box, o serviço consulta as releases ao subir e a cada 6 h
   (`atualizacao/Atualizador.kt`). A tela **Atualização** do frontend (barra
   de navegação) mostra a versão instalada e a cadeia de versões a percorrer.
3. O usuário só decide "Atualizar agora". A partir daí é automático: para cada
   versão mais nova, em ordem, o app baixa o APK, confere o SHA-256 do
   manifest, instala via root (`pm install -r`), reinicia
   (`MY_PACKAGE_REPLACED`) e retoma o plano até a última. Instalar uma a uma
   garante que cada versão rode as próprias migrações.

Rotas: `GET /atualizacao`, `POST /atualizacao/{verificar,iniciar,cancelar}`.
Para testar com releases locais, grave a URL de um `releases.json` (formato da
API do GitHub) em `files/atualizacao-url.txt` do app.

**A chave de assinatura é obrigatória e única**: o Android só instala por cima
do app um APK com a mesma assinatura. `android/chaves/` fica fora do git; sem
o keystore, a atualização dos boxes só é possível reinstalando cada um à mão.

## Testes

```bash
cd android && ./gradlew test        # paridade de protocolo, pipeline e mensagens (JVM)
```

## Notas de hardware (TX9)

- Amlogic GXL, `armeabi-v7a`, API 25 real, kernel 3.14, com `usb.host`.
- A balança usa CH340 (`1a86:7523`); o kernel não traz `ch341`, então a leitura
  é feita pela USB Host API (não há `/dev/ttyUSB0`).
- Firmware do ESP a partir do V17: pacote de configuração enviado em blocos,
  para não estourar a FIFO do CH340 a 921600.
