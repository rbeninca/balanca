# Etiquetas dos boxes

`gerador_etiqueta.html` — uma página HTML solta que monta a folha de etiquetas
dos boxes para imprimir. Não faz parte do build do app: é só abrir no navegador.

```bash
xdg-open android/etiquetas/gerador_etiqueta.html
```

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

A **versão do app saiu da etiqueta**. Ela já foi impressa ("App 2.7.4"), mas é um
adesivo colado no aparelho e o atualizador muda a versão sozinho: a etiqueta
envelhecia sem ninguém tocar nela. O que fica impresso é o que não muda —
modelo, serial, MAC e SSID. Para saber a versão de um box, o `/saude` ou
`bash scripts/box.sh inventario`.

O QR do Wi-Fi usa o formato que Android e iPhone reconhecem nativamente: quem
aponta a câmera entra na rede sem digitar `12345678`.

## Onde mexer

Tudo que muda está no topo do script, em constantes:

| Constante | Para quê |
|---|---|
| `boxes` | array com os dados de cada box — **adicione um objeto para cada box novo** |
| `senhaWifi` | senha do hotspot que vai dentro do QR (`12345678`) |
| `enderecoPainel` | `http://192.168.43.1` — o endereço do box na própria rede dele |
| `enderecoManual` | link do manual impresso no rodapé |

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

O `serial` tem de ser **exatamente** o que o box publica no `/saude`, senão a
etiqueta deixa de casar com o inventário. Para conferir o que os boxes estão
dizendo agora:

```bash
cd android
bash scripts/box.sh inventario 192.168.1.0/24
```

A referência do parque está em [`../../registro/inventario.md`](../../registro/inventario.md).

## Imprimir

Botão **Imprimir etiquetas** na página (chama `window.print()`). Confira na
pré-visualização que a escala está em 100% — "ajustar à página" encolhe a
etiqueta e o QR pode ficar pequeno demais para o leitor.

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
