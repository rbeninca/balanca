# LauncherBox — a tela inicial dos boxes

App **separado** do BalançaGFIG (`../android/`), que substitui o launcher de
fábrica dos TV boxes. É o que aparece quando o box liga: a logo do projeto, a
lista de tudo que abre tela, e — do lado direito — a rede, o disco e o hotspot.

Existe porque o launcher de fábrica abre numa vitrine de apps de terceiros e não
diz nada sobre o equipamento. Quem está no local precisava de um PC com ADB para
saber o IP do box, se o hotspot subiu, ou quanto espaço resta.

| | |
|---|---|
| Pacote | `com.ifsc.laucherbox` (grafia do usuário; a pasta é `launcherbox`) |
| Rótulo | `Painel GFIG` — diferente de "BalançaGFIG" de propósito, os dois convivem no box |
| Alvo | API 24+, compilado contra a 36, `armeabi-v7a` |
| Sem permissões de risco | só `ACCESS_WIFI_STATE` e `ACCESS_SUPERUSER`; o resto passa por `su` |

## Compilar e instalar

```bash
cd launcherbox
./gradlew :app:assembleDebug

# da raiz do repo — o box.sh instala, define como tela inicial e guarda a anterior:
cd ../android
bash scripts/box.sh launcher 192.168.1.110
```

`bash scripts/box.sh launcher-desfazer 192.168.1.110` **devolve a tela inicial
anterior** e deixa o launcher instalado (abrível pela lista de apps). Para
removê-lo de vez: `adb -s <ip>:5555 uninstall com.ifsc.laucherbox`.

> No API 25 o comando é `cmd package set-home-activity` — o `pm` **não** tem
> essa opção nessa versão do Android. É o que o `box.sh` usa.

## A tela

```
        [ logo do projeto ]
APLICATIVOS              REDE
  BalançaGFIG              eth0  192.168.1.110/24  a8:20:03:ac:10:e7
  Settings                 wlan0 192.168.43.1/24   84:ea:97:b9:f0:d6
  mais (12)              ARMAZENAMENTO
                           /data   2.6G livres · 32%
                           pendrive 15G livres · 2%
                         HOTSPOT
                           ligado · rede balancaGFIG-10E7 · senha …
```

A lista abre com **só duas coisas**: o app da balança e as configurações do
Android — o que alguém realmente precisa alcançar num box que existe para pesar.
O resto fica atrás do **"mais (N)"**, que abre e fecha. O estado de expansão
sobrevive às atualizações de 3 em 3 s.

As configurações são reconhecidas por `com.android.settings`,
`com.android.tv.settings` e qualquer pacote terminado em `.settings` — no MXQ
quem abre tela é o `com.android.tv.settings`, não o do AOSP.

Os ícones são decodificados **uma vez por pacote** e guardados em cache: a lista
é remontada a cada 3 s e decodificar 12 ícones toda vez pesaria no rk322x. Trocar
o ícone de um app reinstalado só aparece quando o launcher reiniciar.

## De onde vem cada dado

Tudo que exige privilégio é lido por `su`, com os **mesmos comandos** que o
`bash scripts/box.sh estado <ip>` usa — de propósito, para dar para conferir um
contra o outro:

| Na tela | Fonte |
|---|---|
| Apps que abrem tela | `queryIntentActivities` + `CATEGORY_LAUNCHER` (sem root) |
| Interfaces, MAC, IP | `ip -o link show` e `ip -4 -o addr show` |
| Espaço em disco | `df -h` (fora os `tmpfs`) |
| Hotspot ligado | `WifiManager.getWifiApState` por reflexão (sem root) |
| Nome e senha do hotspot | `/data/misc/wifi/softap.conf`, que é binário e só o root lê |

`lo`, `sit0` e `p2p0` ficam de fora: numa TV são ruído.

### O `softap.conf` é binário

Formato gravado pelo `WifiApConfigStore`, em big-endian:

```
int32   apBand
UTF     SSID        (2 bytes de tamanho + bytes)
...     miolo de tamanho variável por firmware (12 bytes nestes boxes)
UTF     senha
```

O miolo **não tem tamanho garantido**, então o parser não pula um offset fixo:
ele **procura** o ponto em que o tamanho declarado consome exatamente o resto
do arquivo — só o último campo pode satisfazer isso. Se nada casar, cai no
layout conhecido de 12 bytes.

## Decisões que parecem estranhas e não são

- **`/sys/class/net/<if>/address` em vez de `NetworkInterface.getHardwareAddress()`** —
  a partir do Android 6 o método devolve `null` para interfaces que não são do
  app, e MAC vazio não serve.
- **Timeout em todo comando de root.** Um `su` ainda não pré-aprovado fica
  esperando o diálogo na TV; sem prazo, a leitura bloqueia para sempre e a tela
  congela mostrando dado velho sem avisar.
- **stderr drenado em thread separada.** Sem isso um comando que escreve muito
  em stderr enche o pipe de 64 KB e trava.
- **Esperar a thread de leitura terminar (`join`), não dormir um tempo fixo** —
  o processo sair não significa que a leitura acabou; dormir 50 ms devolvia
  `null` em comando com saída grande, e o app tratava sucesso como falha.
- **A tecla VOLTAR é consumida.** Na tela inicial ela fecharia a Activity e o
  box ficaria com a tela preta, sem launcher nenhum.
- **Cada fonte de dado é isolada com `runCatching`.** Uma exceção em qualquer
  ponto derrubava a coleta inteira e a tela ficava com "—" em tudo.
- **Uma chamada de root por ciclo, e só a cada 15 s** (`ColetaRoot`). Ler cada
  dado com o seu próprio `su` eram quatro por ciclo a cada 3 s — e no MXQ isso
  virou ~80 processos `app_process` vivos ao mesmo tempo (cada `su` do SuperSU
  sobe uma VM e leva perto de um minuto para sair), com o load em 25 num box de
  quatro núcleos, ao ponto de uma instalação por adb levar mais de cinco
  minutos. Agora é um `su` com marcações de seção a cada 15 s: load 2,5 e zero
  processos pendurados.
- **Nada de `#` nas marcas de seção do script.** `echo ###LINK` em shell é
  `echo` seguido de comentário: a marca saía vazia e nenhuma seção era
  encontrada — a tela ficou com "—" em tudo até isso aparecer.
