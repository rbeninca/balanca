# Comandos no TVBox

Tudo que roda no TX9 — comando e porquê. Os comandos `su -c '…'` usam o root do
box (Superuser Koush). O `<dev>` é o alvo adb (ex.: `192.168.1.105:5555`).

## 1. Preparação — uma vez por aparelho (`android/scripts/preparar-tx9.sh`)

| Comando | Porquê |
|---|---|
| `adb connect <dev>` + `adb wait-for-device` | conectar ao box pela rede |
| `adb install -r app-debug.apk` | instalar o app |
| `su -c 'sqlite3 su.sqlite < su_policy.sql'` (INSERT `policy=allow` para o UID do app) | pré-aprovar o **root** do app — sem diálogo na TV |
| `su -c 'appops set <pkg> WRITE_SETTINGS allow'` | deixar o app mexer em configurações (necessário p/ o hotspot) |
| escreve `/data/system/users/0/usb_device_manager.xml` com o VID:PID da balança | pré-aprovar a **permissão USB** — leitura da serial sem toque |
| `adb reboot` | efetivar root + USB; ao voltar, o app sobe sozinho |
| `curl :3000/saude`, `dumpsys package`, WebSocket `SAUDE`, `ip addr wlan0` | verificação automática pós-reboot (versão, API, frontend, serial, hotspot) |

Resultado: após o reboot o app inicia no boot, liga o hotspot `balancaGFIG`,
conecta a balança e serve tudo pela rede — zero-toque. Antes de sobrescrever
o `usb_device_manager.xml` o script guarda o original (`.balanca.bak`) ou marca
que não existia (`.balanca.ausente`).

## 1b. Desfazer — `android/scripts/desfazer-tx9.sh` (`./gradlew desfazerNoTx9`)

| Comando | Porquê |
|---|---|
| `am force-stop <pkg>` + remove a chain `balanca_http` do nat | parar o app e tirar o redirect :80 |
| `appops set <pkg> WRITE_SETTINGS default` | devolver o app-op ao padrão |
| `sqlite3 su.sqlite "DELETE FROM uid_policy WHERE uid=…"` | remover a política de root |
| `adb uninstall <pkg>` | remover o app e os dados (sessões!) |
| restaura `usb_device_manager.xml` do `.bak` ou remove se não existia | permissão USB como era |
| `ndc tether stop` + `adb reboot` | hotspot desligado; tethering não persiste |

## 2. Runtime — o app faz sozinho (via `ServicoBalanca` + root)

| Comando / ação | Porquê |
|---|---|
| sobe HTTP `:8080`, WebSocket `:8765`, `/saude`, API `:3000`, atualizador `:8767` | papéis dos contêineres Docker num só app |
| `su -c 'iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-ports 8080'` | publicar o frontend na **porta 80** (`http://<ip>` sem `:8080`); removida antes de readicionar (idempotente) |
| liga o hotspot `balancaGFIG` (tethering do Android) | rede própria para os celulares acessarem a balança |
| conecta a serial CH340 `@ 921600` | ler a célula de carga (ESP8266 + HX711) |
| `su` para `/mnt/media_rw/<id>` (cp/backup) e `sm unmount <vol>` (ejetar) | backup dos testes em pendrive e remoção segura |

## 3. Deploy e diagnóstico — manual, via adb

| Comando | Porquê |
|---|---|
| `adb connect <dev>` | conectar (o IP muda: LAN por DHCP ou `192.168.43.1` no hotspot) |
| `adb install -r app-debug.apk` | atualizar o app (APK ~132 MB → use timeout longo) |
| `adb shell monkey -p <pkg> -c android.intent.category.LAUNCHER 1` | abrir o app após instalar |
| `curl http://<ip>:80/` | verificar o frontend na porta 80 |
| `su -c 'iptables -t nat -S PREROUTING'` | conferir a regra de redirect (deve haver **uma** com `dport 80`) |
| `su -c 'netstat -tlpn'` | ver o que está escutando (`:8080`, `:3000`, …) |
| `su -c 'cat /proc/sys/net/ipv4/ip_unprivileged_port_start'` | checar se dava p/ bindar `:80` direto — **indisponível** no kernel do TX9 (por isso o redirect) |
| `dumpsys usb` / `logcat` | confirmar a balança na USB e o estado da serial |

> Diagnóstico da porta 80 (add → `curl` → remove) foi feito de forma reversível,
> deixando o `nat` como estava; a regra definitiva é aplicada pelo próprio app.
