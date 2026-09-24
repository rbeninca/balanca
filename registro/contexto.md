# Contexto — BalançaGFIG

O mínimo para entender o projeto sem ler o repositório inteiro. As versões
completas estão em [ARQUITETURA.MD](../ARQUITETURA.MD), [IDEIA.MD](../IDEIA.MD) e
[README.md](../README.md); o que mudou em cada versão, em
[2026-09-01--modificacoes.md](2026-09-01--modificacoes.md).

## O que é

Balança de empuxo do GFIG/IFSC: célula de carga lida por um ESP8266, interface
web para operar, gravar sessões de medição e exportar resultados. Hoje roda num
TVBox Android (o "Cenário A"), que substituiu os contêineres Docker do mesmo
sistema; o Cenário C (PC com WebSerial) continua no repositório. São cinco
TVBoxes — três Amlogic TX9 e dois Rockchip MXQ; ver
[inventario.md](inventario.md).

## Componentes

- **`firmware/`** — ESP8266 (C++/PlatformIO, `src/main.cpp`): protocolo binário
  v2, leitura HX711, EEPROM, 921600 baud. `firmware/versao.json` diz a versão
  vigente (V18); o `.bin` compilado entra na release e nos assets do APK.
- **`android/`** — o app (`br.edu.ifsc.balancagfig`, Kotlin) é o servidor de
  verdade: frontend, API REST, WebSocket, hotspot, atualizador e check-in no
  painel. O frontend não mora aqui — vem de `pacotes/aplicacao/dist-web`,
  copiado para os assets do APK na compilação, junto com o `.bin` do firmware.
- **`pacotes/`** — o mesmo sistema em TypeScript, compartilhado pelos dois
  cenários: `protocolo` (codec binário + CRC16), `processamento` (aquisição),
  `analise` (pós-teste, classificação NAR), `relatorio` (exportações),
  `gateway` (serial → WebSocket), `api` (REST + SQLite), `aplicacao` (o
  frontend, Vite/TypeScript) e `atualizador`.
- **`pacotes/painel`** — painel remoto (Cloudflare Worker + D1): recebe as
  batidas dos boxes e guarda o alvo de atualização. Ver "Painel remoto".
- **`launcherbox/`** — app separado (`com.ifsc.laucherbox`), a tela inicial do
  box: logo, atalhos e, ao lado, rede, disco e hotspot. Existe para quem está no
  local não precisar de ADB para saber o IP do box.
- **`ponta-a-ponta/`** — testes E2E (Playwright).
- **`scripts/`** — `compilar-firmware.sh` e `publicar-imagens.sh`. Os scripts de
  bancada ficam em `android/scripts/` (`box.sh`, `ciclo-teste.sh`,
  `montar-kit.sh`); `android/scripts/kit/` é o que vai para o local, no Windows.
- **`docker/`** — o Cenário A antigo (contêineres), hoje fora de uso.
- **`registro/`** — esta documentação: inventário dos boxes,
  [comandos-tvbox.md](comandos-tvbox.md), [roteiro-uso.md](roteiro-uso.md),
  etiquetas e o log mensal.

## Como funciona

### Rede e endereços

- Servindo o próprio hotspot `balancaGFIG-<4 últimos do serial>`, senha padrão
  `12345678`: o box é `192.168.43.1`.
- Na LAN da bancada, o box recebe IP por DHCP (ex.: `192.168.1.105`).
- Frontend `http://<ip>` (porta 80) · API `:3000` · WebSocket `:8765`.
- Serial CH340 a 921600 baud.

### Atualização do app

- Releases no GitHub (`rbeninca/balanca`): tag `vX.Y.Z` → CI compila o APK
  assinado e publica junto um `manifest.json` com versão, versionCode, nome do
  APK, `sha256`, tamanho, firmware e `estavel`.
- O app consulta 30 s depois de subir e a cada 6 h; escolhe a estável mais nova
  dentro do alvo, baixa e **confere o sha256/tamanho contra o manifest**.
- **A instalação não é automática**: é decisão do usuário (botão na TV ou
  `POST /atualizacao/iniciar` com a chave da API). O app só avisa que há versão.
- Sem rede, no local: o kit (`android/scripts/montar-kit.sh`) leva o APK e o
  `adb` do Windows num `.bat` de dois cliques.
- Release sem `manifest.json` ou com `estavel: false` é recusada — foi assim que
  as releases 2.8.2 e 2.8.4 saíram da cadeia (viraram pré-lançamento).

### Painel remoto

- O app bate no painel a cada 10 min (e ~30 s depois do boot) com serial,
  versão, versionCode, instaladoEm, modelo, placa, IPs e root. É o painel que
  responde "qual versão cada box está e quando atualizou".
- O banco guarda o **alvo**: o app só considera releases até essa versão, e como
  o plano é de um passo, o box pula direto para ela, sem cadeia.
- A chave é embutida no APK pelo CI (secret) e vive no Worker; é
  desencorajamento, não segurança. Build sem `chaves.properties` sai com a chave
  vazia e o check-in desligado — o `GET /alvo` continua funcionando (é público).

### Firmware do ESP

`firmware/versao.json` é a versão vigente; `bash scripts/compilar-firmware.sh`
compila, e o `.bin` sai na release e nos assets do APK. A gravação é feita pela
própria bancada, sem cabo de programação.

## Detalhes que mordem

- **`BuildConfig` é inlinado nos pontos de uso.** Compilação incremental reusa
  classes cacheadas e o APK sai com `PAINEL_URL`/`PAINEL_CHAVE` vazios: o box
  some do painel, sem erro nenhum. Build limpo (`:app:clean`) antes de instalar.
- **`versionCode` manda.** `install -r` recusa versão anterior; só com `-d` o
  rebaixamento passa.
- **Pacote recém-instalado fica `stopped=true`** e o Android não entrega
  `BOOT_COMPLETED` nesse estado: sem um `am start` (ou um toque na TV), o app
  não sobe sozinho no próximo boot. A flag é gravada de forma assíncrona — daí
  a espera antes de reiniciar.
- **Um keystore só, para todos os boxes** (em `android/chaves/` e nos secrets do
  CI). APK assinado com outra chave não instala por cima
  (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`), e remover antes apaga as sessões de
  medição gravadas no box.
- **minSdk 24, boxes na API 25.** Nada de API 26+ no app: a 2.8.2 chamou um
  `Process.waitFor(long, TimeUnit)` e o root dos boxes passou a responder "não"
  a tudo, o que travou a atualização de quem estava nela.

## Notas de operação

- Instalação do APK (~17 MB) leva menos de um minuto pela rede. Até a 2.7.9
  eram ~132 MB: o GeckoView embutido era 108 MB disso.
- O IP do box muda conforme a rede (LAN por DHCP vs. hotspot `192.168.43.1`).
- **O keystore é a peça mais insubstituível do projeto.** Os boxes só aceitam
  `pm install -r` de um APK assinado com a *mesma* chave; perdida a chave, cada
  box precisa ser reinstalado à mão, com `desfazer` antes (o que apaga as
  sessões gravadas nele). Está em `android/chaves/` e nos secrets do CI —
  guardar uma cópia fora da máquina.
- **Release não se cria à mão.** A v2.8.4 foi criada à mão enquanto o CI
  compilava a mesma tag, e o CI quebrou atrás
  (`a release with the same tag name already exists: v2.8.4`): o parque ficou
  com dois APKs diferentes respondendo por "2.8.4". O caminho é tag → CI, e só.

## Pendências

As abertas ficam no fim do log do mês corrente
([2026-09-01--modificacoes.md](2026-09-01--modificacoes.md)), atualizadas a cada
versão.
