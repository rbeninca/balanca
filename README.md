<div align="center">
  <img src="pacotes/aplicacao/public/imgs/logo_gfig.png" alt="GFIG" height="80">
  <img src="pacotes/aplicacao/public/imgs/logo_campusGaspar.png" alt="IFSC Campus Gaspar" height="80">

  <h1>BalançaGFIG</h1>
  <p><strong>Sistema de Teste Estático de Motores Foguete</strong></p>
  <p>Instituto Federal de Santa Catarina — Campus Gaspar</p>

  ![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue?logo=typescript)
  ![Node.js](https://img.shields.io/badge/Node.js-22-green?logo=node.js)
  ![Vite](https://img.shields.io/badge/Vite-6-purple?logo=vite)
  ![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker)
  ![License](https://img.shields.io/badge/Licença-MIT-yellow)
</div>

---

## O que é

O **BalançaGFIG** é um sistema open-source de bancada para testes estáticos de motores de minifoguete experimentais. Ele captura a curva de empuxo em tempo real por meio de uma célula de carga (HX711 + ESP8266), processa os dados no browser e gera relatórios completos com classificação NAR, métricas avançadas e exportação em múltiplos formatos.

**Funcionalidades principais:**
- Leitura de força em tempo real a ~100 Hz via WebSocket ou WebSerial
- Gráficos dinâmicos com detecção automática de início/fim de queima
- Análise pós-teste: força pico, RMS, impulso total, Isp, perfil, coeficiente de variação
- Classificação automática NAR (A–O) com nome padronizado (ex.: "B1.7")
- Exportação em PDF, CSV, JSON, `.eng` (OpenRocket) e CURVA EMPUXO 2.2
- Comparação visual de múltiplas sessões
- Gravação de firmware no ESP diretamente pelo browser

---

## Hardware necessário

| Componente | Observação |
|---|---|
| ESP8266 (NodeMCU v2 / Wemos D1 Mini) | Microcontrolador principal |
| Módulo HX711 | Amplificador para célula de carga |
| Célula de carga | Capacidade adequada ao motor testado |
| Cabo USB | Para alimentação e gravação |
| TVBox com Linux (opcional) | Para o Cenário A (gateway fixo) |

### Esquema Elétrico

<div align="center">
  <img src="pacotes/aplicacao/public/imgs/esquema-eletrico.png" alt="Esquema elétrico — ESP8266 + HX711" width="700">
</div>

---

## Cenários de uso

O sistema suporta dois cenários de operação, dependendo do hardware disponível:

### Cenário A — TVBox / Gateway

O ESP8266 fica conectado permanentemente a um TVBox (ou Raspberry Pi) que roda os serviços Docker. Qualquer dispositivo na rede (celular, tablet, notebook) acessa a interface pelo browser.

<div align="center">
  <img src="pacotes/aplicacao/public/imgs/cenario-A.png" alt="Cenário A — TVBox como gateway" width="680">
</div>

### Cenário C — PC com WebSerial

O ESP8266 é conectado diretamente ao computador via USB. O browser usa a **WebSerial API** (Chrome/Edge) para ler a porta serial sem instalar nenhum software. As sessões ficam salvas no IndexedDB do browser.

<div align="center">
  <img src="pacotes/aplicacao/public/imgs/cenario-C.png" alt="Cenário C — Conexão direta por WebSerial" width="680">
</div>

---

## Arquitetura

O projeto é um **monorepo npm workspace** com 7 pacotes TypeScript organizados em camadas:

```
ESP8266 + HX711
       │ USB 921600 baud (protocolo binário + CRC16)
       ▼
┌──────────────────────────────────────────┐
│  gateway  (Node.js)                      │
│  Lê porta serial → aplica pipeline →     │
│  publica via WebSocket :8765             │
└──────────────┬───────────────────────────┘
               │ WebSocket / WebSerial
               ▼
┌──────────────────────────────────────────┐
│  aplicacao  (Vite + TypeScript)          │
│  Interface web — medição, sessões,       │
│  análise, relatórios, configurações      │
└──────────────┬───────────────────────────┘
               │ REST HTTP :3000
               ▼
┌──────────────────────────────────────────┐
│  api  (Fastify + SQLite)                 │
│  Persiste sessões, leituras e metadados  │
└──────────────────────────────────────────┘
```

### Pacotes

| Pacote | Responsabilidade |
|---|---|
| `protocolo` | Codec binário + CRC16 para o protocolo ESP↔Host |
| `processamento` | Pipeline tempo real: zona morta, média móvel, detector de queima, integrador de impulso |
| `analise` | Métricas pós-teste: pico, RMS, perfil, classificação NAR, anomalias, Isp |
| `relatorio` | Geração de PDF, CSV, JSON, `.eng` (OpenRocket) e CURVA EMPUXO 2.2 |
| `gateway` | Bridge serial → WebSocket (Node.js + serialport) |
| `api` | API REST com Fastify + SQLite/MariaDB |
| `aplicacao` | Frontend Vite + ApexCharts |

---

## Pré-requisitos

- [Node.js](https://nodejs.org) ≥ 20
- [Docker + Docker Compose](https://docs.docker.com/get-docker/) (apenas para Cenário A)
- [PlatformIO](https://platformio.org) (apenas para compilar o firmware)
- Chrome ou Edge (para WebSerial no Cenário C)

---

## Início rápido

### 1. Clonar o repositório

```bash
git clone https://github.com/gfig-ifsc/balancaGFIG2.git
cd balancaGFIG2
npm install
```

### 2. Cenário A — Subir com Docker

```bash
# Conectar o ESP8266 na porta USB do TVBox antes de subir
docker compose -f docker/docker-compose.yml up -d
```

Acesse **`http://<IP-do-TVBox>`** em qualquer navegador da rede.

Para usar MariaDB em vez de SQLite:

```bash
docker compose -f docker/docker-compose.yml \
               -f docker/docker-compose.mariadb.yml up -d
```

### 3. Cenário A no TVBox, com o app Android

O caminho que está em uso nos boxes: em vez de contêineres, um app Android que
faz os mesmos papéis (HTTP, WebSocket, API, frontend na porta 80) e ainda lê a
balança pela USB. Um script só cuida de tudo, passando o IP do box:

```bash
cd android
bash scripts/box.sh estado   192.168.1.110   # só confere
bash scripts/box.sh instalar 192.168.1.110   # instala e pré-aprova root/USB
bash scripts/box.sh desfazer 192.168.1.110   # devolve o box ao original
bash scripts/box.sh limpar   192.168.1.110   # tira apps fora do projeto e lixo
bash scripts/box.sh launcher 192.168.1.110   # Painel GFIG como tela inicial
```

Detalhes em [`android/README.md`](android/README.md), no launcher em
[`launcherbox/README.md`](launcherbox/README.md), e a referência de cada comando
em [`registro/comandos-tvbox.md`](registro/comandos-tvbox.md).

### 4. Cenário C — Desenvolvimento local

```bash
cd pacotes/aplicacao
npm run dev        # Inicia em http://localhost:5173
```

Abra no Chrome ou Edge, selecione **"WebSerial"** na tela de conexão e conecte o ESP8266 pelo USB.

---

## Gravar o firmware no ESP8266

O firmware já compilado está em `firmware/firmware.bin`. Há duas formas de gravá-lo:

### Via browser (sem instalar nada)

1. Acesse a aplicação → menu **Firmware**
2. Clique em **"Gravar via Browser"** (requer Chrome/Edge com o ESP conectado via USB)

<div align="center">
  <img src="pacotes/aplicacao/public/imgs/upload-firmware.png" alt="Tela de upload de firmware" width="640">
</div>

### Via linha de comando (esptool)

```bash
# Na primeira gravação, apague a flash para inicializar a EEPROM corretamente
esptool.py --port /dev/ttyUSB0 erase_flash

# Gravar firmware
esptool.py --port /dev/ttyUSB0 --baud 921600 write_flash 0x0 firmware/firmware.bin
```

### Compilar o firmware (opcional)

```bash
cd firmware
pio run --target upload   # compila e grava
pio run --target upload --upload-port /dev/ttyUSB0
```

---

## Calibração

Após gravar o firmware, acesse **Configurações** na interface web para ajustar os parâmetros da célula de carga. O assistente de calibração guiado fica na **barra de navegação de cima**, no item **Calibração** — não na tela de Medição:

1. **Tara** — sem carga, zereia a leitura
2. **Massa conhecida** — informe o peso em gramas para calcular o fator de conversão
3. Os valores são salvos na EEPROM do ESP e persistem após reinicialização

---

## Formatos de exportação

Na tela de **Análise**, cinco saídas. A unidade do tempo **não é a mesma em
todas**, e é onde é fácil errar:

| Formato | Tempo | Origem do zero | Empuxo |
|---|---|---|---|
| **CSV** | segundos (7 casas) | início da **gravação** | decimal |
| **CURVA EMPUXO 2.2** | segundos (7 casas) | início da **gravação** | `2.101074E-01` |
| **`.eng`** (RASP) | segundos (4 casas) | início da **queima** | decimal, ≥ 0 |
| **JSON** | milissegundos | **absoluto** — desde o boot do ESP | decimal |
| **PDF** | — | — | relatório |

Fora da tela de Análise saem mais dois CSV, com o **mesmo esquema e o mesmo
tempo** do CSV acima (`tempo_relativo_s`, 7 casas): o **backup em pendrive** e a
rota **`GET /sessoes/:id/exportar.csv`**. No app Android os dois saem da mesma
função — a rota delega no exportador do backup —, e a API do Cenário A segue a
mesma regra. Antes eram três cópias escritas à mão do mesmo arquivo, e foi assim
que o tempo acabou saindo de um jeito em cada uma: a da tela em segundos
relativos, as outras duas no `millis()` cru do ESP.

Três coisas que confundem:

- **O `.eng` ancora na queima**, não na gravação. É o que o RASP exige: a
  primeira amostra tem de ser `t > 0`, e a curva começa no acendimento.
- **O `.eng` e o CURVA EMPUXO são incompatíveis entre si**, apesar de
  parecidos: comentário `;` contra `#`, primeira amostra `> 0` contra `= 0`,
  empuxo decimal contra notação científica. Gerar um no lugar do outro produz
  arquivo inválido.
- **Os valores guardados são absolutos** — o `millis()` do ESP, desde o boot
  do microcontrolador. O re-baseio acontece na exportação e na tela; o banco
  guarda o valor cru de propósito, porque é ele que faz a ordenação e a
  duração da sessão funcionarem.

O JSON é exceção deliberada: ele é **formato de re-importação** e mantém o
tempo absoluto, porque volta sem re-baseio — quem reimporta recebe os mesmos
milissegundos que gravou.

## Formatos de importação

A tela de **Sessões** importa dois formatos, e escolhe pelo **conteúdo** do
arquivo, não pela extensão:

| Formato | O que traz | Tempo |
|---|---|---|
| **JSON** do BalançaGFIG | leituras, metadados do motor e janela de queima | absoluto, como saiu |
| **CURVA EMPUXO 2.2** | só o par tempo/força | relativo ao 1º ponto |

O CURVA EMPUXO é o caminho de volta do arquivo que vai ao programa do Prof.
Marchi. O cabeçalho é **opcional**: arquivos salvos de novo por uma planilha
perdem o `Caso` e o `Título`, e nem por isso deixam de ser curvas válidas — o
que o formato tem de essencial é o par tempo e força. Do cabeçalho se aproveita
o que existir: `Caso` vira o nome da sessão (sem ele, vale o nome do arquivo) e
`Título` vira a descrição.

O **impulso acumulado é recalculado** por trapézio, porque o formato não o
carrega, e o empuxo volta com os 7 dígitos significativos que a notação
científica do arquivo guarda. Ponto com tempo fora de ordem é descartado — e o
app avisa quantos foram.

### O CSV pergunta os separadores

Ao clicar em exportar CSV, o app pergunta o formato — porque a mesma tabela
precisa ser lida por dois mundos que falam línguas diferentes:

| Escolha | Campo | Decimal | Para quem |
|---|---|---|---|
| **Planilha** | `;` | `,` | Excel e LibreOffice em português |
| **Dados** | `,` | `.` | Python, R, qualquer parser |

A regra é **nunca repetir o separador**. Parecer óbvio não é: um arquivo com
campo `;` e decimal `.` abre na planilha em português sem erro nenhum — e
mostra `0.012` como **doze**, porque ali o ponto é separador de milhar. O
número fica mil vezes maior, e nada avisa.

Levar isso a sério custou uma sessão de depuração: parecia que o tempo saía em
milissegundos quando sempre esteve em segundos.

---

## Desenvolvimento

### Compilar todos os pacotes

```bash
npm run compilar
```

### Rodar os testes

```bash
npm test                        # todos os pacotes
npm run testar:cobertura        # com relatório de cobertura
```

### Estrutura de pastas

```
balancaGFIG2/
├── firmware/                   # Firmware ESP8266 (C++ / PlatformIO)
│   ├── src/main.cpp            # Protocolo binário, leitura HX711, EEPROM
│   ├── platformio.ini
│   └── versao.json             # Versão atual (V16, protocolo v2)
│
├── pacotes/
│   ├── protocolo/              # Codec binário + CRC16
│   ├── processamento/          # Pipeline de aquisição em tempo real
│   ├── analise/                # Análise pós-teste e classificação NAR
│   ├── relatorio/              # Geração de documentos e exportações
│   ├── gateway/                # Bridge serial → WebSocket
│   ├── api/                    # API REST (Fastify + SQLite)
│   └── aplicacao/              # Interface web (Vite + TypeScript)
│
├── docker/
│   ├── docker-compose.yml
│   ├── docker-compose.mariadb.yml
│   ├── Dockerfile.gateway
│   ├── Dockerfile.api
│   ├── Dockerfile.webapp
│   └── nginx.conf
│
├── ponta-a-ponta/              # Testes E2E (Playwright)
└── package.json                # Workspace raiz
```

---

## Protocolo serial

O ESP8266 envia pacotes binários de 20 bytes a 921600 baud:

| Campo | Tipo | Descrição |
|---|---|---|
| `magic` | uint16 | `0xA1B2` — identificador de pacote |
| `versão` | uint8 | `0x02` |
| `tipo` | uint8 | `0x01` = dados, `0x02` = config, `0x03` = status |
| `t_ms` | uint32 | `millis()` do ESP |
| `forca_N` | float32 | Força em Newtons |
| `raw_value` | int32 | Valor ADC bruto do HX711 |
| `status` | uint8 | 0=pesando, 1=tarar, 2=calibrar, 3=pronta |
| `crc` | uint16 | CRC16-CCITT sobre os campos anteriores |

---

## Demo online

A interface web está disponível em modo de demonstração (sem hardware) no GitHub Pages:

**[rbeninca.github.io/balancaGFIG2](https://rbeninca.github.io/balancaGFIG2)**

> No modo demo, use **"Sessões"** para carregar sessões salvas e explorar a análise, relatórios e comparações sem precisar do hardware.

---

## Créditos

<div align="center">
  <img src="pacotes/aplicacao/public/imgs/logo_campusGaspar.png" alt="IFSC Campus Gaspar" height="60">
  &nbsp;&nbsp;
  <img src="pacotes/aplicacao/public/imgs/logo_gfig.png" alt="GFIG" height="60">
  &nbsp;&nbsp;
  <img src="pacotes/aplicacao/public/imgs/logo_compSteam.png" alt="CompSteam" height="60">
  &nbsp;&nbsp;
  <img src="pacotes/aplicacao/public/imgs/logo-bar.png" alt="BAR" height="60">
</div>

<br>

Desenvolvido pelo **Grupo de Foguetes do Campus Gaspar (GFIG)** com apoio do grupo de pesquisa **CompSteam** e do projeto de ensino **BoxSteam**, no **Instituto Federal de Santa Catarina — Campus Gaspar**.

© 2025 IFSC Campus Gaspar — Licença MIT
