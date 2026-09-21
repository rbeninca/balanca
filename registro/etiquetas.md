# Etiquetas dos boxes

`gerador_etiqueta.html` — uma página HTML solta que monta a folha de etiquetas
dos boxes para imprimir. Não faz parte do build do app: é só abrir no navegador.

```bash
xdg-open registro/gerador_etiqueta.html
```

**Os dados dos boxes vêm do inventário**, de [`inventario.md`](inventario.md)
— não existe lista de boxes dentro desta página. Para etiquetar um box novo,
acrescente uma linha na tabela do parque; a etiqueta sai na próxima impressão.
Antes havia uma cópia da lista aqui dentro, e ela saiu: dois lugares com o mesmo
serial acabam divergindo, e o que ia para o papel era justamente a cópia que
ninguém lembrava de atualizar.

Servida por HTTP (GitHub Pages, `python3 -m http.server`), a página busca o
inventário sozinha. Aberta como arquivo local, o navegador bloqueia a leitura por
segurança e ela pede que você escolha o `inventario.md` — mesmo resultado, um
clique a mais.

## O que sai na etiqueta

Cada etiqueta é de **100×100 mm**, em grade **2×2 por folha A4**, com linhas de
corte. A grade existe de propósito: `@page { size: 100mm 100mm }` é ignorado por
boa parte das impressoras, que cai em A4 de qualquer jeito, então o desenho não
depende disso funcionar.

Cada uma leva:

| Campo | De onde vem |
|---|---|
| Modelo | `modelo` — `TX9`, `MXQ` |
| Serial | `serial` — o mesmo que o box publica no `/saude` |
| MAC do eth0 | `mac` |
| Rede | `ssid` |
| **QR do Wi-Fi** | `WIFI:T:WPA;S:<ssid>;P:<senha>;;` — escanear conecta o celular direto |
| **QR do painel** | `http://192.168.43.1` — escanear abre a interface |
| **QR do manual** | `enderecoManual` — o mesmo do rodapé, para quem está com o celular na mão |

A **versão do app saiu da etiqueta**. Ela já foi impressa ("App 2.7.4"), mas é um
adesivo colado no aparelho e o atualizador muda a versão sozinho: a etiqueta
envelhecia sem ninguém tocar nela. O que fica impresso é o que não muda —
modelo, serial, MAC e SSID. Para saber a versão de um box, o `/saude` ou
`bash scripts/box.sh inventario`.

O QR do Wi-Fi usa o formato que Android e iPhone reconhecem nativamente: quem
aponta a câmera entra na rede sem digitar `12345678`.

## A etiqueta está cheia

Os 100×100 mm estão ocupados. Quem for acrescentar alguma coisa vai descobrir
que a **coluna dos QR codes é a mais alta das duas**, e que passar dela empurra
o conteúdo por cima do rodapé — calado, porque a etiqueta tem `overflow: hidden`
e não avisa.

Foi o que aconteceu ao crescer o QR do manual: ele só chegou aos 16 mm porque as
legendas dos outros dois saíram. A rede e o endereço do painel continuam
escritos por extenso nos passos 4 e 5; a senha, que não aparecia em lugar nenhum,
ficou. **Para acrescentar algo à etiqueta, tire de outro lugar** — e confira na
renderização, não só no navegador.

Para conferir sem gastar papel, sirva a pasta e abra no navegador:

```bash
python3 -m http.server --directory registro
# abra http://localhost:8000/gerador_etiqueta.html
```

A captura por linha de comando (`firefox --headless --screenshot`) **não serve
mais aqui**: o inventário chega por `fetch`, que é assíncrono, e a foto sai antes
de as etiquetas serem montadas. Para fotografar seria preciso embutir o
inventário na página antes — foi assim que os encaixes foram conferidos enquanto
a etiqueta era ajustada.

## Onde mexer

Os dados dos boxes **não estão aqui**: vêm do inventário. O que sobra nesta
página são as constantes que valem para todos os boxes:

| Constante | Para quê |
|---|---|
| `CAMINHO_INVENTARIO` | onde a página busca a tabela do parque (`inventario.md`) |
| `COLUNAS_DA_ETIQUETA` | quais colunas do inventário viram campo na etiqueta |
| `senhaWifi` | senha do hotspot que vai dentro do QR (`12345678`) |
| `enderecoPainel` | `http://192.168.43.1` — o endereço do box na própria rede dele |
| `enderecoManual` | link do manual, no rodapé e no QR |

A coluna é procurada **pelo nome**, não pela posição: acrescentar uma coluna no
meio da tabela do inventário não troca o serial de lugar com o MAC. Renomear uma
das colunas usadas, sim, quebra — e aí a página diz qual faltou.

## Cores

A identidade é **azul e laranja**, com as **fontes escuras**. A etiqueta é lida
de perto e com pressa, na bancada — por isso o cinza fica só na estrutura
(réguas e molduras) e nunca na fonte.

| Elemento | Cor |
|---|---|
| Texto corrido, subtítulos, rodapé | `#111` |
| Título, modelo, círculos numerados, palavras de destaque | azul `#0d4162` |
| Bloco de identificação (serial e MAC) | fundo azul `#0d4162`, texto branco |
| Caixa do "ANTES DO ENSAIO" | borda `#e77d00`, fundo `#fff4e8`, título `#8f3f00` |

O laranja do título do bloco era `#c45700` e escureceu para `#8f3f00`: é a mesma
família, mas é a primeira coisa que se lê ali, e o tom claro sobre o fundo creme
pedia esforço.

O **rodapé é maior que o resto do miúdo** da etiqueta (2,4 mm contra 1,8 mm) —
ele carrega o link do manual, e quem precisa dele está de pé, com a TV ligada,
digitando no celular. É o único texto com tamanho próprio: se o endereço mudar
por um mais longo, confira na pré-visualização que ele não foi cortado, porque a
linha do rodapé não quebra.

O `serial` na tabela do inventário tem de ser **exatamente** o que o box publica
no `/saude`, senão a etiqueta deixa de casar com o inventário. Para conferir o
que os boxes estão dizendo agora:

```bash
cd android
bash scripts/box.sh inventario 192.168.1.0/24
```

A referência do parque é o [`inventario.md`](inventario.md) — o mesmo
arquivo de onde esta página lê os dados.

## Imprimir

Botão **Imprimir etiquetas** na página (chama `window.print()`). Dois cuidados na
janela de impressão:

- **Escala em 100%.** "Ajustar à página" encolhe a etiqueta, e o QR pode ficar
  pequeno demais para o leitor.
- **Cores ligadas.** A barra azul da identificação e a caixa laranja do "ANTES DO
  ENSAIO" são **fundo**, e o navegador tira fundo ao imprimir por padrão — a
  etiqueta sairia sem as cores. A página pede que ele as mantenha
  (`print-color-adjust: exact`), mas no Chrome e no Edge quem manda é a caixa
  **"Gráficos de plano de fundo"**: sem ela marcada, o pedido é ignorado.

## O QR depende de internet

A biblioteca (`qrcodejs`) vem de `cdnjs.cloudflare.com`. Sem rede, os QR codes
**não são gerados** — o resto da etiqueta sai, mas sem eles.

Para uso offline, baixe o `qrcode.min.js` e troque a linha do `<script>` por um
caminho local (o comentário no próprio arquivo diz onde).

## O manual da etiqueta

O `enderecoManual` aponta para `https://rbeninca.github.io/balanca/manual/`, que
é o roteiro de uso publicado pelo GitHub Pages. A página sai de
`pacotes/aplicacao/public/manual/index.html` — o Vite copia `public/` para a
raiz do `dist-web`, então ela chega em `/manual/` no site.

**Ao mexer no roteiro, mexa nesse arquivo**: é ele que vai para o ar, e é para
ele que o QR e o rodapé da etiqueta mandam quem estiver na bancada.

O endereço já foi outro — `github.com/rbeninca/balanca/manual` — e dava 404 por
dois motivos: aquele formato de URL não serve página, e o Pages do projeto é
outro host. Se for trocar de novo, confira abrindo no navegador antes de
imprimir a folha.
