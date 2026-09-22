# Comandos no TVBox

Tudo que roda nos boxes — comando e porquê. Há dois firmwares em uso, e o
`android/scripts/box.sh` detecta sozinho qual é:

| Box | Plataforma | Root | Hotspot |
|---|---|---|---|
| **TX9** | Amlogic `gxl`, `p281-userdebug` | Superuser Koush (`com.thirdparty.superuser`) | `setWifiApEnabled` funciona |
| **MXQ** | Rockchip `rk322x`, `akrd2` | SuperSU Chainfire (`eu.chainfire.supersu`), **já libera root por padrão** | o framework recusa o app; o app liga pela tela do Settings |

Em todos os comandos, `<dev>` é o alvo adb (ex.: `192.168.1.110:5555`) e
`<ip>` é só o IP.

## 1. Instalar / desfazer — `android/scripts/box.sh`

```bash
cd android
bash scripts/box.sh estado   <ip>     # só confere, não mexe em nada
bash scripts/box.sh instalar <ip>
bash scripts/box.sh desfazer <ip>     # tira tudo e devolve o original
bash scripts/box.sh <ip>              # ciclo: desfazer + instalar
bash scripts/box.sh limpar   <ip>     # apps fora do projeto + lixo acumulado
bash scripts/box.sh launcher <ip>     # Painel GFIG como tela inicial
bash scripts/box.sh launcher-desfazer <ip>   # devolve a tela inicial anterior
bash scripts/box.sh inventario [faixa]       # varre a rede e lista os boxes
```

`desfazer` e `limpar` apagam coisas e por isso **perguntam antes**; sem terminal
eles se recusam a agir, exigindo `--sim` explícito.

> **`instalar` não põe o launcher.** São tarefas separadas, e nem o `ciclo`
> (desfazer + instalar) as junta: quem quer o Painel GFIG como tela inicial
> precisa rodar `launcher` **depois**. Um box só com `instalar` fica com o app
> da balança rodando e a tela inicial original — foi o que aconteceu num MXQ.

As tarefas do Gradle são atalhos para o mesmo script:
`./gradlew instalarNoTx9 -Ptx9.device=<ip>:5555`, `desfazerNoTx9`, `estadoNoBox`.

### O que o `instalar` faz, e por quê

| Comando | Porquê |
|---|---|
| `./gradlew :app:assembleDebug` | **compila sempre** — não só quando o APK falta. Um APK velho é empurrado calado (ver abaixo) |
| compara o `versionCode` do `build.gradle.kts` com o do box | barrar **rebaixamento** silencioso: pergunta antes, e exige `--sim` sem terminal |
| `adb connect <dev>` + `wait-for-device` | conectar ao box pela rede |
| `adb install -r app-debug.apk` | instalar/atualizar o app |
| `am start -n <pkg>/.MainActivity` | **tirar o pacote do estado *stopped*** — recém-instalado, o Android não entrega `BOOT_COMPLETED`, e o app não subiria no boot |
| `sqlite3 su.sqlite < su_policy.sql` (INSERT `policy=allow` para o UID do app) | pré-aprovar o **root** — só existe no Koush; o SuperSU do MXQ não guarda política por app |
| `appops set <pkg> WRITE_SETTINGS allow` | deixar o app mexer em configurações (hotspot) |
| escreve `usb_device_manager.xml` com o VID:PID da balança | pré-aprovar a **permissão USB** — leitura da serial sem toque |
| `adb reboot` | efetivar root + USB; ao voltar o app sobe sozinho |
| `curl :3000/saude`, `dumpsys package`, WebSocket `SAUDE`, `iw dev wlan0` | verificação automática pós-reboot (versão, API, frontend, serial/taxa, hotspot) |

Antes de sobrescrever o `usb_device_manager.xml` o script guarda o original
(`.balanca.bak`) ou marca que não existia (`.balanca.ausente`).

> **Por que compilar sempre, e por que barrar rebaixamento.** O script antigo só
> compilava se o APK não existisse — existindo, mesmo de horas antes, era ele
> que ia para o box. Foi assim que um box na 2.7.3 voltou para a 2.7.2. E o
> rebaixamento passou calado porque **os dois lados são depuráveis** —
> `DEBUGGABLE` no box, `application-debuggable` no APK —, caso em que o Android
> aceita instalar uma versão mais antiga; num APK de release ele recusaria com
> `INSTALL_FAILED_VERSION_DOWNGRADE`.
>
> De quebra descobriu-se que o caminho da compilação estava errado desde sempre:
> o `../../..` parava em `app/build`, onde não existe `gradlew`. Aquela
> compilação automática **nunca chegou a rodar** — por isso o APK velho nunca foi
> corrigido por ela. São cinco níveis até a raiz do Gradle, agora resolvidos a
> partir do próprio `$APK`.

### O que o `desfazer` faz

| Comando | Porquê |
|---|---|
| `am force-stop <pkg>` + remove a chain `balanca_http` do nat | parar o app e tirar o redirect :80 |
| `appops set <pkg> WRITE_SETTINGS default` | devolver o app-op ao padrão |
| `sqlite3 su.sqlite "DELETE FROM uid_policy WHERE uid=…"` | remover a política de root (só no Koush) |
| `adb uninstall <pkg>` | remover o app e os dados (**sessões!**) |
| restaura `usb_device_manager.xml` do `.bak` (ou remove, se não existia) | permissão USB como era |
| `ndc tether stop` (TX9) | hotspot desligado — no TX9 o tethering não persiste |
| `adb reboot` | no MXQ o AP também não persiste: sai no reboot |

## 1c. Limpar — `box.sh limpar <ip>`

| Comando | Porquê |
|---|---|
| `pm list packages -3` | lista o que **não** é do projeto; a remoção fica só nesse conjunto |
| `adb uninstall <pkg>` (uma vez por app) | tira o bloat: YouTube, Netflix, Kodi, loja de apps… |
| preserva `br.edu.ifsc.balancagfig`, `com.ifsc.laucherbox` e os gerenciadores de root | sem eles o app perde root e o hotspot morre |
| `rm -rf /data/app/vmdl*.tmp` | staging de instalações interrompidas — costuma ser a maior parte do ganho |
| `rm -f /sdcard/linux.img`, sobras de apps removidos | imagens e pastas que ficaram de apps já desinstalados |
| `rm -rf /data/tombstones/* /data/anr/* /data/system/dropbox/*` | coredumps, traces de ANR e relatórios de falha |
| `logcat -c` | limpa o buffer de log |
| `df /data` antes e depois | informa quanto liberou |

**Nunca toca em `/system`.** É o que evita bootloop — e o ganho de tirar app de
sistema não paga o risco.

## 1d. Launcher próprio — `box.sh launcher | launcher-desfazer <ip>`

| Comando | Porquê |
|---|---|
| `adb install -r launcherbox/…/app-debug.apk` | instala o Painel GFIG (`com.ifsc.laucherbox`) |
| `am start -n com.ifsc.laucherbox/.MainActivity` | tira o pacote do estado *stopped* |
| `INSERT` da linha com `logging=0` no banco do Koush | pré-aprova o root do launcher — o UID é novo, e sem isso ele pediria root na TV |
| `cmd package resolve-activity … HOME` **antes** | registra a tela inicial anterior |
| `cmd package set-home-activity com.ifsc.laucherbox/.MainActivity` | troca a tela inicial |
| `cat /data/local/tmp/launcherbox.home-anterior` | é o que o `launcher-desfazer` lê para voltar |
| `pm disable-user com.ifsc.laucherbox` | **é assim que o desfazer volta atrás** — ver abaixo |
| `pm enable com.ifsc.laucherbox` | o `launcher` reabilita e o sistema volta a resolvê-lo |

> No API 25 o comando para trocar a tela inicial é **`cmd package
> set-home-activity`** — o `pm`, que seria o natural, não tem essa opção nessa
> versão do Android.

> **Para desfazer, `set-home-activity` não serve.** Ele responde `Success` mas não
> troca de volta: a preferência em `package-restrictions.xml` continua apontando
> para o nosso launcher. O que funciona é **desabilitar** o nosso pacote, e o
> Android resolve a tela inicial para o próximo candidato — verificado nos dois
> boxes (TX9 volta ao `com.txari.launcher`, MXQ ao `com.droidlogic.mboxlauncher`).

## 1e. Inventário — `box.sh inventario [faixa]`

```bash
bash scripts/box.sh inventario 192.168.1.0/24
```

Consulta o `/saude` de cada host da faixa e monta a tabela dos boxes — serial,
IP, modelo, versão e endereço do eth0:

```
SERIAL                     IP               MODELO    VERSÃO  ETH0
GFIG-TX9-58EB81E3618C      192.168.1.105    TX9       2.7.4    192.168.1.105
GFIG-MXQ-A82003AC10E7      192.168.1.110    MXQ       2.7.4    192.168.1.110
```

**É tudo HTTP, sem ADB**: não precisa de depuração ligada em cada box, e a
varredura é da faixa inteira, e não de uma lista de IPs conhecidos. Um box
recém-formatado, que ainda não tem o app, simplesmente não aparece.

| Detalhe | Porquê |
|---|---|
| `curl -m 2 http://<ip>:3000/saude`, os 254 hosts em paralelo | o `/saude` é o que todo box publica sem precisar de ADB |
| filtra por `"status":"ok"` | separa box de vizinho que também responde na 3000 |
| modelo por `cut -d- -f2` do serial | o serial já carrega o modelo — `GFIG-<MODELO>-<MAC>` |
| `versao` sai do `BuildConfig.VERSION_NAME` | foi por isso que o build ligou `buildConfig = true` — o AGP 8 não gera por padrão |

Quem responde **sem `serial` e sem `versao` não é o app**: é a pilha docker do
Cenário A (`pacotes/api`), que publica só `status` e `modo`. **Não há o que
migrar** — normalmente é a estação de quem desenvolve, com o
`docker/docker-compose.yml` do próprio projeto no ar, e não um box. Ela não se
atualiza pela cadeia de releases nem vai aparecer com serial porque não é
candidata.

O parque levantado, com a ficha de cada box, está em
[`inventario.md`](inventario.md).

## 2. Runtime — o app faz sozinho (via `ServicoBalanca` + root)

| Comando / ação | Porquê |
|---|---|
| sobe HTTP `:8080`, WebSocket `:8765`, `/saude`, API `:3000`, atualizador `:8767` | papéis dos contêineres Docker num só app |
| `su -c 'iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-ports 8080'` | publicar o frontend na **porta 80** (`http://<ip>` sem `:8080`); removida antes de readicionar (idempotente) |
| liga o hotspot `balancaGFIG` | rede própria para os celulares acessarem a balança |
| conecta a serial CH340 `@ 921600` | ler a célula de carga (ESP8266 + HX711) |
| `su` para `/mnt/media_rw/<id>` (cp/backup) e `sm unmount <vol>` (ejetar) | backup dos testes em pendrive e remoção segura |

### O caminho da permissão USB (difere entre os firmwares)

O Android só libera um dispositivo USB ao app pelo diálogo de permissão ou pelo
evento `USB_DEVICE_ATTACHED` resolvido para o filtro do app. No quiosque não há
quem clique, então forçamos o evento desenumerando o conversor
(`serial/AutorizacaoUsb.kt`):

| Passo | TX9 (Amlogic) | MXQ (Rockchip) |
|---|---|---|
| 1. alterna `authorized` no sysfs | o kernel **derruba e recria** o nó `/dev/bus/usb` → o Android vê o attach | o kernel **só reautoriza no lugar**, o nó não muda → **não** dispara attach |
| 2. confere se o nó sumiu | sumiu → pronto | não sumiu → escala |
| 3. unbind/bind da **controladora** do barramento | não chega a rodar | é o que faz o attach acontecer |

A escalada só roda se o barramento **não tiver outros dispositivos** — derrubar
a controladora com mais gente pendurada levaria junto mouse, teclado ou um WiFi
USB (e a rede por onde corre a instalação).

A pré-aprovação no `usb_device_manager.xml` (feita pelo `instalar`) **não
depende desse mecanismo**: ela grava o filtro VID:PID do conversor para o app, e
o Android concede a permissão no attach. Por isso ela é o caminho preferido — o
app só precisa reenumerar quando ninguém gravou o filtro.

> **Cuidado com apps que também escutam `USB_DEVICE_ATTACHED`.** Havia um
> F-Droid instalado num dos boxes com um `UsbDeviceAttachedReceiver`; ele
> aparece no logcat (`UsbDeviceAttachedReceiv`) disputando o mesmo intent. Num
> box de quiosque, remova esses apps (`pm uninstall org.fdroid.fdroid`) ou
> desabilite só o receiver:
> `su -c 'pm disable org.fdroid.fdroid/.nearby.UsbDeviceAttachedReceiver'`.

### O caminho do hotspot (difere entre os firmwares)

No MXQ o `WifiServiceImpl` do firmware tem um bug na linha 609: grava
`Settings.Global.WIFI_AP_ENABLED` com o contexto do system_server (pacote
`"android"`, uid 1000) enquanto o uid da chamada ainda é o do app, e o AppOps
recusa com `Package android does not belong to <uid>`. É checagem de
**identidade**, não de permissão — nenhuma concessão ao app contorna. O próprio
Settings passa porque roda como uid 1000 (`android.uid.system`).

Por isso o app, quando o `setWifiApEnabled` falha, abre a tela
*Tethering & portable hotspot* e aciona o switch: lê `bounds` e `checked` do
`uiautomator dump` (sem coordenada fixa), toca e traz o app de volta à frente.
O SSID vem do `setWifiApConfiguration` (API oculta), que não passa pela linha
bugada; sem ele o AP subiria como `AndroidAP`.

## 3. Diagnóstico — manual, via adb

| Comando | Porquê |
|---|---|
| `bash scripts/box.sh estado <ip>` | diagnóstico completo: app, API, frontend, serial/taxa, hotspot, permissão USB, interfaces de rede (MAC/IP/estado), disco e apps instalados |
| `adb connect <dev>` | conectar (o IP muda: LAN por DHCP ou `192.168.43.1` no hotspot) |
| `su -c 'iptables -t nat -S PREROUTING'` | conferir a regra de redirect (deve haver **uma** com `dport 80`) |
| `su -c 'netstat -tlpn'` | ver o que está escutando (`:8080`, `:3000`, …) |
| `su -c 'cat /proc/sys/net/ipv4/ip_unprivileged_port_start'` | checar se dava p/ bindar `:80` direto — **indisponível** no kernel do TX9 (por isso o redirect) |
| `dumpsys usb` | confirmar a permissão USB (`Device permissions`) e o filtro (`Device preferences`) |
| `logcat -d \| grep -E 'PortaSerialUsb\|AutorizacaoUsb\|HotspotManager'` | ver por onde o app passou na USB e no hotspot |
| `su -c 'dmesg \| grep -i usb'` | no MXQ, conferir se o conversor reenumerou |

### Serial "conectada" mas com 0 Hz

A porta abriu e não chega byte nenhum do ESP — não é problema de USB nem de
permissão (o `SAUDE` diria `sem_dispositivo` nesses casos). Na prática o **ESP
travou**, e o que o destrava é reabrir a porta: o app pulsa DTR/RTS ao conectar,
e isso reseta o NodeMCU.

**A partir de v2.8.2** há um watchdog que faz isto automaticamente: se a ESP não
enviar dados por 15 segundos, o app assume que travou e reconecta. O log mostra
`"inatividade detectada por 15000ms"` quando isso acontece.

Antes era preciso fazer:

```bash
adb -s <dev> shell "am force-stop br.edu.ifsc.balancagfig"
adb -s <dev> shell "am start -n br.edu.ifsc.balancagfig/.MainActivity"
```

Agora o app cuida disso sozinho. Se ainda assim o painel mostrar 0 Hz e os logs
disserem que reconectou, é ESP defeituosa ou USB danificado — não só travamento
passageiro.

> Diagnóstico da porta 80 (add → `curl` → remove) foi feito de forma reversível,
> deixando o `nat` como estava; a regra definitiva é aplicada pelo próprio app.
