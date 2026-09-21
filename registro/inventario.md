# Inventário dos TVBox

Levantado em **20/09/2026**, com os boxes já na 2.7.3 (a versão que introduziu o
serial). O `192.168.1.118` e o `192.168.1.103` entraram depois, ao longo de
**21/09/2026**. É o retrato do parque nessas datas — o IP muda por
DHCP, o serial não, e a versão do app anda sozinha pelo atualizador, então a
coluna "App" envelhece: vale para o dia do levantamento.

## Como levantar de novo

```bash
cd android
bash scripts/box.sh inventario 192.168.1.0/24
```

É tudo HTTP na porta 3000, **sem ADB**: não precisa de depuração ligada em cada
box, e a varredura é da faixa inteira, não de uma lista de IPs conhecidos. Um box
recém-formatado, que ainda não tem o app, simplesmente não aparece — o que ele
não vê, não inventaria.

Para a ficha completa de um box (plataforma, root, MACs, hotspot, disco):

```bash
bash scripts/box.sh estado 192.168.1.105
```

## O parque

| Serial | IP | Modelo | Placa | App | Root |
|---|---|---|---|---|---|
| `GFIG-TX9-58EB81E3618A` | 192.168.1.103 | TX9 | Amlogic `gxl` | 2.8.1 | Koush (Superuser) |
| `GFIG-TX9-58EB81E3618C` | 192.168.1.105 | TX9 | Amlogic `gxl` | 2.7.3 | Koush (Superuser) |
| `GFIG-MXQ-A82003AC10E7` | 192.168.1.110 | MXQ | Rockchip `rk322x` | 2.7.3 | Chainfire (SuperSU) |
| `GFIG-MXQ-A82003AC10D4` | 192.168.1.112 | MXQ | Rockchip `rk322x` | 2.7.3 | `su` em `/system/xbin/su`, sem app gerenciador |
| `GFIG-TX9-58EB81E36158` | 192.168.1.118 | TX9 | Amlogic `gxl` | 2.8.2 | Koush (Superuser) |

Todos rodam **API 25 (Android 7.1.2)** e o app `br.edu.ifsc.balancagfig`.

O `192.168.1.118` é TX9 do mesmo lote do `.105` — o MAC começa igual,
`58:eb:81:e3:` — e o que os separa é o sufixo: `61:58` contra `61:8c`.

## Ficha de cada box

### `GFIG-TX9-58EB81E3618C` — TX9 · 192.168.1.105

| | |
|---|---|
| Plataforma | Amlogic `gxl`, API 25 |
| Root | Koush (`com.thirdparty.superuser`) |
| eth0 | `58:eb:81:e3:61:8c` — 192.168.1.105/24 |
| wlan0 | `84:ea:97:6b:1f:16` — 192.168.43.1/24 |
| Hotspot | `balancaGFIG-618C` |
| Balança | **conectada, 87 Hz** |
| Launcher | `com.ifsc.laucherbox` + `com.txari.launcher` |

### `GFIG-MXQ-A82003AC10E7` — MXQ · 192.168.1.110

| | |
|---|---|
| Plataforma | Rockchip `rk322x`, API 25 |
| Root | Chainfire (`eu.chainfire.supersu`) |
| eth0 | `a8:20:03:ac:10:e7` — 192.168.1.110/24 |
| wlan0 | `84:ea:97:b9:f0:d6` — 192.168.43.1/24 |
| Hotspot | `balancaGFIG-10E7` |
| Balança | **sem_dispositivo, 0 Hz** — porta aberta, mas o ESP não está enviando |
| Launcher | `com.ifsc.laucherbox` |

### `GFIG-MXQ-A82003AC10D4` — MXQ · 192.168.1.112

| | |
|---|---|
| Plataforma | Rockchip `rk322x`, API 25 |
| Root | `su` em `/system/xbin/su`, **sem app gerenciador** que o `box.sh` reconheça |
| eth0 | `a8:20:03:ac:10:d4` — 192.168.1.112/24 |
| wlan0 | `84:ea:97:b9:74:a4` — 192.168.43.1/24 |
| Hotspot | `balancaGFIG-10D4` |
| Balança | **conectada, 96 Hz** |

O `box.sh` reporta `root: nenhum` neste box, mas é falso negativo: o `su` existe,
responde `uid=0(root)` e foi por ele que a atualização para 2.7.3 instalou. O que
falta ali é só o **app** gerenciador (Koush/SuperSU), não o root.

### `GFIG-TX9-58EB81E3618A` — TX9 · 192.168.1.103

| | |
|---|---|
| Plataforma | Amlogic `gxl`, API 25 |
| Root | Koush (`com.thirdparty.superuser`) |
| eth0 | `58:eb:81:e3:61:8a` — 192.168.1.103/24 |
| wlan0 | `84:ea:97:6b:22:e0` — 192.168.43.1/24 |
| Hotspot | `balancaGFIG-618A` |
| Balança | **conectada, 87 Hz** |
| Navegador | `com.android.chrome` 101.0.4951.61 |
| Launcher | **o original do firmware** (`com.txari.launcher`) |
| Disco | `/data` 4,2 G, 1,5 G usados |

Duas particularidades:

- **É o único com navegador instalado** — e é o único em que a aba Balança
  funciona desde a 2.8.0, que passou a abrir o painel no navegador do box.
- **Não tem o launcher do projeto.** Os outros rodam `com.ifsc.laucherbox`; aqui
  ficou o `com.txari.launcher` do firmware, então o box liga no ambiente
  original. Instalar o nosso é `bash scripts/box.sh launcher 192.168.1.103` —
  que é um passo **separado** do `instalar`, que não o traz junto.

### `GFIG-TX9-58EB81E36158` — TX9 · 192.168.1.118

| | |
|---|---|
| Plataforma | Amlogic `gxl`, API 25 |
| Root | Koush (`com.thirdparty.superuser`) |
| eth0 | `58:eb:81:e3:61:58` — 192.168.1.118/24 |
| wlan0 | `84:ea:97:6b:17:54` — 192.168.43.1/24 |
| Hotspot | `balancaGFIG-6158` |
| Balança | **conectada, 85 Hz** |
| Launcher | `com.ifsc.laucherbox` |
| Navegador | **nenhum** — só o `com.android.webview` do sistema |
| Disco | `/data` 4,2 G, 790 M usados |

Duas coisas deste box que os outros não têm:

- **Não tem navegador nenhum**, e desde a 2.8.0 a aba **Balança** abre o painel
  no navegador do box (ver [Formatos de importação] e o `NavegadorDoBox.kt`).
  Sem navegador, o botão avisa que não há nenhum instalado. O WebView do sistema
  não serve: é o Chromium 52, de 2016.
- **O `/saude` dele anuncia a versão errada.** Ele está na 2.8.2 (`dumpsys`) mas
  responde `"versao":"2.8.0"`, porque o APK instalado foi compilado com um
  `BuildConfig.VERSION_NAME` velho — manifesto novo, constante de compilação
  antiga. O `/atualizacao` do mesmo box acerta, porque lê do `PackageManager`.
  O `/saude` passou a ler de lá também (`ServicoBalanca.versaoInstalada`), mas
  isso só vale **a partir da próxima versão** — a correção está no código e
  ainda não foi publicada.

> Enquanto isso, **não confie no campo `versao` do `/saude` deste box**: ele
> alimenta o `box.sh inventario`, então a varredura vai listá-lo como 2.8.0.
> Para a versão real, `dumpsys package br.edu.ifsc.balancagfig` ou o
> `/atualizacao`.

### Navegador: o que a 2.8.0 passou a exigir

Até a 2.7.9 o app desenhava o frontend dentro dele (GeckoView, 108 MB do APK).
Da 2.8.0 em diante a aba **Balança** abre o painel no navegador instalado, e o
APK caiu para ~16 MB. O preço é este:

| Box | Navegador |
|---|---|
| `192.168.1.103` | `com.android.chrome` 101.0.4951.61 |
| `192.168.1.118` | **nenhum** |
| `.105`, `.110`, `.112` | a conferir (estavam desligados) |

Para conferir: `bash scripts/box.sh estado <ip>` responde numa linha. Onde faltar,
instalar o Chrome por `adb install` resolve — é a única peça que a 2.8.x passou a
pedir do aparelho.

## O que **não** é do projeto

A varredura da faixa encontra vizinhos que não são boxes. Registrados para não
serem confundidos numa próxima:

| IP | O que é |
|---|---|
| 192.168.1.101 | Amazon Fire TV Stick (`AFTSSS sheldonp`, Android 9) — ADB aberto, sem porta 3000 |
| 192.168.1.102 | Amazon Fire TV Stick (`AFTSSS sheldonp`, Android 9) — idem |
| 192.168.1.113 | **a estação de quem desenvolve**, com a pilha docker do Cenário A no ar |

O `192.168.1.113` é o que mais engana, e não por causa do aparelho: **não é um
box — é a máquina do desenvolvedor**, rodando o `docker/docker-compose.yml` do
próprio projeto (serviço `api` publicado na :3000, `gateway` na :8765). Ele
responde no `/saude`, mas com `{"status":"ok","modo":"wal"}`, sem `serial` e sem
`versao`, porque quem responde é o `pacotes/api` (`src/principal.ts`) e não o
app. Não tem ADB e não responde na 80.

Consequência prática: **não há o que migrar.** Ele não se atualiza pela cadeia de
releases nem vai aparecer com serial porque não é candidato — é a estação de
trabalho. Se aparecer numa varredura, ignore.

> Isto já foi documentado errado aqui: a primeira versão desta seção dizia para
> migrá-lo com `box.sh instalar`, o que não faz sentido nenhum para um notebook.

## Como o serial é formado

`GFIG-<MODELO>-<MAC do eth0>`, gerado em `android/app/src/main/java/br/edu/ifsc/balancagfig/sistema/SerialDoBox.kt`.

O MAC do ethernet é o único identificador estável que estes boxes oferecem: não
gravam `ro.serialno` (vem vazio nos dois modelos) e o `android_id` deriva da
assinatura do app, então muda em reset de fábrica.

O sufixo do serial é o **último octeto duplo do MAC**, e por isso casa com o
nome da rede — dá para ler a etiqueta sem consultar nada:

| Box | MAC do eth0 | Serial | SSID |
|---|---|---|---|
| TX9 | `58:eb:81:e3:`**`61:8a`** | `GFIG-TX9-`**`58EB81E3618A`** | `balancaGFIG-`**`618A`** |
| TX9 | `58:eb:81:e3:`**`61:8c`** | `GFIG-TX9-`**`58EB81E3618C`** | `balancaGFIG-`**`618C`** |
| TX9 | `58:eb:81:e3:`**`61:58`** | `GFIG-TX9-`**`58EB81E36158`** | `balancaGFIG-`**`6158`** |
| MXQ | `a8:20:03:ac:`**`10:e7`** | `GFIG-MXQ-`**`A82003AC10E7`** | `balancaGFIG-`**`10E7`** |
| MXQ | `a8:20:03:ac:`**`10:d4`** | `GFIG-MXQ-`**`A82003AC10D4`** | `balancaGFIG-`**`10D4`** |

### Por que os dois MXQ têm serial fixado

O modelo, por padrão, sai do que o aparelho diz de si (`Build.MODEL`)
normalizado. Só que o MXQ **não se identifica como "MXQ"**: o firmware dele
responde `TV BOX`, e o serial derivado saía `GFIG-TVBOX-…` — um nome que não
diz qual é o aparelho.

Por isso os dois MXQ têm o serial **fixado à mão** em `/data/misc/gfig/serial`,
que tem precedência sobre o derivado:

```
GFIG-MXQ-A82003AC10E7   (192.168.1.110)
GFIG-MXQ-A82003AC10D4   (192.168.1.112)
```

O arquivo exige root para escrever e **sobrevive a desinstalar o app**, de
propósito: inventário não pode se perder num reset. O sufixo do MAC continua
no serial, então a etiqueta segue casando com o nome da rede.

Para trocar o serial de um box:

```bash
adb -s 192.168.1.110:5555 shell "su -c 'mkdir -p /data/misc/gfig'"
adb -s 192.168.1.110:5555 shell "su -c 'echo GFIG-MXQ-A82003AC10E7 > /data/misc/gfig/serial'"
adb -s 192.168.1.110:5555 shell "am force-stop br.edu.ifsc.balancagfig"
adb -s 192.168.1.110:5555 shell "am start -n br.edu.ifsc.balancagfig/.MainActivity"
```

O app lê o serial **uma vez por vida do serviço** (`by lazy`), justamente para
não consultar o root a cada 2 s junto do SAUDE — por isso o reinício acima é
obrigatório depois de escrever o arquivo. Não existe comando no `box.sh` para
isto ainda.

Os três boxes levaram a 2.7.3 sozinhos, pela cadeia de releases do GitHub, em
20/09/2026. O `192.168.1.110` entrou na cadeia com `versao_inicial: 2.7.1` e
percorreu `[2.7.2, 2.7.3]` — o `PlanoAtualizacao` avançando o índice após o
`MY_PACKAGE_REPLACED`, como projetado.
