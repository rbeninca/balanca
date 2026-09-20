# Inventário dos TVBox

Levantado em **20/09/2026**, com os boxes já na 2.7.3 (a versão que introduziu o
serial). É o retrato do parque naquela data — o IP muda por DHCP, o serial não.

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
| `GFIG-TX9-58EB81E3618C` | 192.168.1.105 | TX9 | Amlogic `gxl` | 2.7.3 | Koush (Superuser) |
| `GFIG-TVBOX-A82003AC10E7` | 192.168.1.110 | TV BOX | Rockchip `rk322x` | 2.7.3 | Chainfire (SuperSU) |
| `GFIG-TVBOX-A82003AC10D4` | 192.168.1.112 | TV BOX | Rockchip `rk322x` | 2.7.3 | `su` em `/system/xbin/su`, sem app gerenciador |

Os três rodam **API 25 (Android 7.1.2)** e o app `br.edu.ifsc.balancagfig`.

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

### `GFIG-TVBOX-A82003AC10E7` — TV BOX · 192.168.1.110

| | |
|---|---|
| Plataforma | Rockchip `rk322x`, API 25 |
| Root | Chainfire (`eu.chainfire.supersu`) |
| eth0 | `a8:20:03:ac:10:e7` — 192.168.1.110/24 |
| wlan0 | `84:ea:97:b9:f0:d6` — 192.168.43.1/24 |
| Hotspot | `balancaGFIG-10E7` |
| Balança | **sem_dispositivo, 0 Hz** — porta aberta, mas o ESP não está enviando |
| Launcher | `com.ifsc.laucherbox` |

### `GFIG-TVBOX-A82003AC10D4` — TV BOX · 192.168.1.112

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

## O que **não** é do projeto

A varredura da faixa encontra vizinhos que não são boxes. Registrados para não
serem confundidos numa próxima:

| IP | O que é |
|---|---|
| 192.168.1.101 | Amazon Fire TV Stick (`AFTSSS sheldonp`, Android 9) — ADB aberto, sem porta 3000 |
| 192.168.1.102 | Amazon Fire TV Stick (`AFTSSS sheldonp`, Android 9) — idem |
| 192.168.1.113 | **API Node/Fastify do Cenário A** (docker), não o app Android |

O `192.168.1.113` é o caso que engana. Ele responde no `/saude`, mas com
`{"status":"ok","modo":"wal"}` — sem `serial` e sem `versao`, porque quem responde
é o `pacotes/api` (`src/principal.ts`), não o app. Tem as portas 3000 e 8765
abertas, não responde na 80 e **não tem ADB**. Consequência prática: **não se
atualiza sozinho** pela cadeia de releases e nunca vai aparecer com serial no
inventário. Para migrá-lo, `box.sh instalar`; ou atualizar a imagem docker dele.

## Como o serial é formado

`GFIG-<MODELO>-<MAC do eth0>`, gerado em `android/app/src/main/java/br/edu/ifsc/balancagfig/sistema/SerialDoBox.kt`.

O MAC do ethernet é o único identificador estável que estes boxes oferecem: não
gravam `ro.serialno` (vem vazio nos dois modelos) e o `android_id` deriva da
assinatura do app, então muda em reset de fábrica.

O sufixo do serial é o **último octeto duplo do MAC**, e por isso casa com o
nome da rede — dá para ler a etiqueta sem consultar nada:

| Box | MAC do eth0 | Serial | SSID |
|---|---|---|---|
| TX9 | `58:eb:81:e3:`**`61:8c`** | `GFIG-TX9-`**`58EB81E3618C`** | `balancaGFIG-`**`618C`** |
| TV BOX | `a8:20:03:ac:`**`10:e7`** | `GFIG-TVBOX-`**`A82003AC10E7`** | `balancaGFIG-`**`10E7`** |
| TV BOX | `a8:20:03:ac:`**`10:d4`** | `GFIG-TVBOX-`**`A82003AC10D4`** | `balancaGFIG-`**`10D4`** |

O modelo sai do que o aparelho diz de si (`Build.MODEL`), normalizado. O MXQ se
identifica como `TV BOX` — não como "MXQ" — e vira `TVBOX`. Quando o nome do
firmware não servir, fixe um à mão em `/data/misc/gfig/serial` (exige root, tem
precedência e sobrevive a desinstalar o app).

Os três boxes levaram a 2.7.3 sozinhos, pela cadeia de releases do GitHub, em
20/09/2026. O `192.168.1.110` entrou na cadeia com `versao_inicial: 2.7.1` e
percorreu `[2.7.2, 2.7.3]` — o `PlanoAtualizacao` avançando o índice após o
`MY_PACKAGE_REPLACED`, como projetado.
