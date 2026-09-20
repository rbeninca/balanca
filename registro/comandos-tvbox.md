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
bash scripts/box.sh <ip>              # ciclo: desfaz e reinstala
bash scripts/box.sh instalar <ip>
bash scripts/box.sh desfazer <ip>     # pede confirmação; --sim pula
bash scripts/box.sh estado <ip>       # só confere
```

As tarefas do Gradle são atalhos para o mesmo script:
`./gradlew instalarNoTx9 -Ptx9.device=<ip>:5555`, `desfazerNoTx9`, `estadoNoBox`.

### O que o `instalar` faz, e por quê

| Comando | Porquê |
|---|---|
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

```bash
adb -s <dev> shell "am force-stop br.edu.ifsc.balancagfig"
adb -s <dev> shell "am start -n br.edu.ifsc.balancagfig/.MainActivity"
```

Observado depois de várias reenumerações de USB seguidas (unbind/bind da
controladora): a porta reabre mas o ESP fica mudo. Vale saber em campo — se o
painel mostrar 0 Hz com a balança plugada, é isto.

> Diagnóstico da porta 80 (add → `curl` → remove) foi feito de forma reversível,
> deixando o `nat` como estava; a regra definitiva é aplicada pelo próprio app.
