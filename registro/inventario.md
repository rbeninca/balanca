# Inventário dos TVBox

Levantado em **20/09/2026**, com os boxes já na 2.7.3 (a versão que introduziu o
serial); o `192.168.1.118` e o `192.168.1.103` entraram depois, ao longo de
**21/09/2026**. O IP muda por DHCP e o serial não; a versão do app muda sem
passar por aqui, então a coluna `App` vale para o dia do levantamento.

**Os boxes saíram da rede local em 22/09/2026** e não voltam: daqui não há ADB
nem `box.sh` (que é HTTP na porta 3000, na mesma rede). Tudo o que depende dos
dois — instalar, inventariar, ler `/saude` — passou a exigir alguém no local,
com um notebook na rede de lá. **No local a instalação é `adb install -r`
direto**, com o APK da release; o botão "Atualizar" do painel só serviria se
aquele box alcançasse o GitHub, e o app só instala quando alguém o aperta. O
procedimento da ida está em `pendencias.md`.

**A coluna `App` desta tabela vale para o dia do levantamento e não se atualiza
sozinha.** Da **2.8.501** em diante quem responde isso é o painel remoto
(`pacotes/painel`): cada box manda uma batida a cada 10 min com a versão em que
está e quando a instalou, e a página mostra a frota inteira. Enquanto um box
estiver abaixo da 2.8.501 ele não aparece lá — para esses, esta coluna segue
sendo o que se sabe, e a atualização continua sendo a ida ao local. A tabela
continua sendo a fonte da verdade sobre os aparelhos (serial, modelo, MAC,
SSID): o painel diz o que está rodando, não quem são.

**Desde 22/09/2026 o painel tem duas páginas.** O `/painel` é a frota em
operação — só quem bate. O `/inventario` é o registro do aparelho: onde ele
está, de quem é e para que serve, em campos que o box não tem como informar e
que alguém preenche ali mesmo. Lá cabem também aparelhos que **não** são boxes
da balança (um Armbian, um Android de outro uso), que nunca vão bater e por isso
nunca apareceriam no `/painel`. Os dois lados se encontram pelo **serial**: é ele
que liga a linha desta tabela à ficha do painel.

## O parque

**Esta tabela é a fonte da verdade sobre os boxes.** O gerador de etiquetas
(`etiquetas/gerador_etiqueta.html`) lê os dados dela — é por isso que ela tem
colunas de nome fixo e uma linha por box. Mexeu num aparelho? Mexa aqui, e só
aqui: não existe lista de boxes repetida em outro lugar. Trocar o modelo, o MAC
ou o SSID é mexer **nesta** tabela; dizer onde o aparelho está e de quem ele é,
na página de inventário do painel — cada campo tem um dono, e nenhum campo tem
dois.

<!-- Tabela lida pelo gerador de etiquetas. Não renomeie as colunas: ele
     procura por Serial, Modelo, MAC eth0 e SSID. -->

| Serial | Modelo | MAC eth0 | SSID | IP | Placa | App | Navegador | Root |
|---|---|---|---|---|---|---|---|---|
| `GFIG-TX9-58EB81E3618A` | TX9 | `58:EB:81:E3:61:8A` | `balancaGFIG-618A` | 192.168.1.16 | Amlogic `gxl` | 2.8.5 | Chrome 101 | Koush (Superuser) |
| `GFIG-TX9-58EB81E3618C` | TX9 | `58:EB:81:E3:61:8C` | `balancaGFIG-618C` | 192.168.1.105 | Amlogic `gxl` | 2.7.3 | a conferir | Koush (Superuser) |
| `GFIG-MXQ-A82003AC10E7` | MXQ | `A8:20:03:AC:10:E7` | `balancaGFIG-10E7` | 192.168.1.17 | Rockchip `rk322x` | 2.8.4 | a conferir | Chainfire (SuperSU) |
| `GFIG-MXQ-A82003AC10D4` | MXQ | `A8:20:03:AC:10:D4` | `balancaGFIG-10D4` | 192.168.1.112 | Rockchip `rk322x` | 2.7.3 | a conferir | `su` sem gerenciador |
| `GFIG-TX9-58EB81E36158` | TX9 | `58:EB:81:E3:61:58` | `balancaGFIG-6158` | 192.168.1.118 | Amlogic `gxl` | 2.8.2 | **nenhum** | Koush (Superuser) |

Todos rodam **API 25 (Android 7.1.2)** e o app `br.edu.ifsc.balancagfig`.

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

## O que a tabela não conta

- **A numeração mudou de esquema na 2.8.501.** A `2.8.5` foi a última versão de
  um dígito na última casa; daí em diante são três (`2.8.501`, `2.8.502`, …). Na
  coluna `App`, versão de três dígitos é o normal a partir de agora — e a ordem
  continua numérica, não alfabética: `2.8.501` é mais nova que `2.8.5`. Detalhes
  em `log-modificacoes.md` (v2.8.5).
- **Conferência de 22/09/2026** (só o que respondia na LAN; o resto estava
  desligado e ficou com a linha da última conferência):
  - **`.16`** é o antigo `.103`: o DHCP trocou o endereço, o serial é o mesmo
    (`…618A`). Estava **preso na 2.8.2** — versionCode 20, com o `Root` quebrado
    pela chamada de API 26 (`Process.waitFor`, ver `log-modificacoes.md` v2.8.5),
    e por isso não conseguia instalar a própria atualização. **Resgatado por ADB
    em 22/09/2026** (`bash scripts/box.sh instalar 192.168.1.16`): está na 2.8.5,
    com o hotspot, a serial (4 Hz) e o frontend conferidos pelo próprio script.
  - **`.17`** é o antigo `.110`: mesmo caso, serial `…10E7`. Está na **2.8.4 de
    build manual** (versionCode 22), com a correção
    dentro. Como o `Root` dele funciona, ele consegue instalar a 2.8.5 — mas
    **não sozinho**: o app só *consulta* o repositório (30 s depois de subir e
    depois a cada 6 h); instalar depende de alguém apertar "Atualizar" no painel
    do box. Ou seja, o `.17` fica na 2.8.4 até alguém apertar o botão — pelo
    painel do próprio box, ou pela rede dele, com a senha — ou até uma
    instalação por ADB numa ida ao local, como a que resgatou o `.16`.
  - **A chave é a mesma em todo mundo** — conferido puxando o APK instalado de
    `.16` e `.17` e comparando com o compilado agora: os três assinam com o
    certificado `bc7d4ae8…`. É o que garante que a instalação por ADB é um
    `install -r` comum, **sem `desfazer` e sem apagar as sessões gravadas**.
  - **`.118`** também estava na 2.8.2 pela última conferência e é o outro
    candidato a box preso — mas **não respondeu** nesta data (`/saude` mudo), e
    sem ADB não há como confirmar. Tratar como preso até prova em contrário.
  - **`.105`** e **`.112`** estavam desligados: seguem na 2.7.3. A cadeia deles
    passa pela 2.8.2, onde eles parariam — mas a 2.8.2 e a 2.8.4 ficaram como
    **pré-lançamento** em 22/09/2026, e o filtro de `prerelease` já existia na
    2.7.3 (conferido na tag): quem andar sozinho pula as duas e vai para a
    2.8.5. Ainda assim, uma instalação por ADB é melhor do que a cadeia — são 12
    downloads (~1 GB, a maioria da era do GeckoView) contra um de 17 MB. Ver
    `pendencias.md`.
- **`.103`** — o **único com navegador instalado**, e por isso o único em que a
  aba Balança funciona desde a 2.8.0. **Não tem o launcher do projeto**: ficou
  com o `com.txari.launcher` do firmware. Instalar o nosso é um passo separado
  (`bash scripts/box.sh launcher 192.168.1.103`) — o `instalar` não o traz junto,
  e é fácil não perceber. (Hoje o IP dele é `.16`; o launcher continua o do
  firmware.)
- **`.105`** — TX9 do mesmo lote do `.103` e do `.118`: o MAC começa igual,
  `58:eb:81:e3:`, e o que os separa é o sufixo. Ficou para trás, desligado
  enquanto os outros subiam.
- **`.110`** — MXQ. Foi o primeiro a subir sozinho: entrou na cadeia de releases
  com `versao_inicial: 2.7.1` e percorreu `[2.7.2, 2.7.3]` em 20/09, com o
  `PlanoAtualizacao` avançando o índice após o `MY_PACKAGE_REPLACED`.
- **`.112`** — MXQ. O `box.sh` reporta `root: nenhum`, e é **falso negativo**: o
  `su` existe em `/system/xbin/su`, responde `uid=0(root)` e foi por ele que a
  atualização para 2.7.3 instalou. O que falta ali é só o **app** gerenciador
  (Koush/SuperSU), não o root.
- **`.118`** — TX9. Sem navegador nenhum, então a aba Balança só mostra o aviso
  de que não há nenhum instalado. E o **`/saude` dele anuncia a versão errada**:
  o pacote instalado é 2.8.2 (`dumpsys`), mas ele responde `"versao":"2.8.0"`,
  porque o APK foi compilado com um `BuildConfig.VERSION_NAME` velho — manifesto
  novo, constante de compilação antiga. O `/atualizacao` do mesmo box acerta,
  porque lê do `PackageManager`; o `/saude` passou a ler de lá também, mas isso
  só vale **a partir da próxima versão publicada**.

> Enquanto isso, **não confie no campo `versao` do `/saude` do `.118`**: é ele
> que alimenta o `box.sh inventario`, então a varredura vai listá-lo como 2.8.0.
> Para a versão real, `dumpsys package br.edu.ifsc.balancagfig` ou o
> `/atualizacao`.

### Por que a coluna `Navegador` importa

Até a 2.7.9 o app desenhava o frontend dentro dele (GeckoView, 108 MB do APK).
Da 2.8.0 em diante a aba **Balança** abre o painel no navegador instalado, e o
APK caiu para ~16 MB — mas o app passou a exigir um navegador do aparelho. O
WebView do sistema não serve: é o Chromium 52, de 2016.

Onde faltar, instalar o Chrome por `adb install` resolve — é a única peça que a
2.8.x passou a pedir do aparelho. Para conferir num box ligado:

```bash
bash scripts/box.sh estado <ip>     # responde numa linha
```

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

`GFIG-<MODELO>-<MAC do eth0>`, gerado em
`android/app/src/main/java/br/edu/ifsc/balancagfig/sistema/SerialDoBox.kt`.

O MAC do ethernet é o único identificador estável que estes boxes oferecem: não
gravam `ro.serialno` (vem vazio nos dois modelos) e o `android_id` deriva da
assinatura do app, então muda em reset de fábrica.

O sufixo do serial são os **dois últimos octetos do MAC**, escritos sem os dois
pontos — por isso serial, MAC e SSID casam entre si numa linha da tabela do
parque, e dá para ler a etiqueta sem consultar nada.

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
propósito: inventário não pode se perder num reset. O sufixo do MAC continua no
serial, então a etiqueta segue casando com o nome da rede.

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

## Etiquetas

O gerador é o [`gerador_etiqueta.html`](gerador_etiqueta.html), **vizinho deste
arquivo**, e lê a tabela do parque daqui — é a única lista de boxes que existe.

Como os dois estão na mesma pasta, basta servir a pasta e abrir:

```bash
python3 -m http.server --directory registro
# abra http://localhost:8000/gerador_etiqueta.html
```

Aberto como arquivo local (`xdg-open registro/gerador_etiqueta.html`), o
navegador bloqueia a leitura e a página pede que você escolha o `inventario.md`
— mesmo resultado, um clique a mais.

Ao editar a tabela, confira na pré-visualização de impressão que as etiquetas
saíram certas. O resto está em [`etiquetas.md`](etiquetas.md).
