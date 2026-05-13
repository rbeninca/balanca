# BalançaGFIG — Arquitetura Revisada

> Documento de design para a reescrita modular do sistema de medição de força
> para testes de motores foguete do GFIG.

---

## 1. Visão Geral e Cenários de Uso

O sistema deve operar em **três cenários** sem modificação no firmware do ESP32:

| Cenário | Hardware | Processamento de dados | Gateway | Frontend | Banco de Dados |
|---------|----------|------------------------|---------|---------|----------------|
| **A — TVBox Completo** | ESP32 → USB → TVBox | **No gateway** (Node.js, server-side) | Node.js container (serial→WS) | WebApp via Nginx (Docker) | SQLite ou MariaDB via API REST |
| **B — TVBox + Android** | ESP32 → USB → TVBox | **No gateway** (Node.js, server-side) | Node.js container (serial→BLE) | App Android nativo | SQLite ou MariaDB via API REST |
| **C — Direto no PC** | ESP32 → USB → PC | **No navegador** (WebWorker, client-side) | Nenhum — WebSerial nativo | WebApp local/CDN/GitHub Pages | IndexedDB no navegador |

**Princípio central:** o firmware do ESP32 não muda. A aplicação web detecta
automaticamente o ambiente e apresenta ao usuário o resultado — que pode aceitar
ou ajustar manualmente. Em qualquer cenário, a interface gráfica **sempre recebe
dados já processados** — nunca lida com bytes brutos nem com força não calibrada.

---

## 2. Responsabilidades por Camada

### 2.1 O que o servidor Python fazia (e onde vai cada responsabilidade)

| Responsabilidade anterior (Python) | Novo responsável | Pacote |
|------------------------------------|-----------------|--------|
| Ler bytes da porta serial | Gateway | `pacotes/gateway` |
| Decodificar protocolo binário + CRC16 | Gateway / TrabalhadorSerial | `pacotes/protocolo` |
| Aplicar zona morta e arredondamento | **Pipeline de processamento** | `pacotes/processamento` |
| Calibrar força bruta → Newtons | **Pipeline de processamento** | `pacotes/processamento` |
| Detectar início e fim da queima | **Pipeline de processamento** | `pacotes/processamento` |
| Calcular impulso total (integração) | **Pipeline de processamento** | `pacotes/processamento` |
| Servir arquivos estáticos da interface | Nginx (container) | `pacotes/aplicacao` |
| Salvar leituras em arquivo/banco | API REST | `pacotes/api` |

### 2.2 Por que eliminar o Python?

O servidor Python atual mistura as responsabilidades acima num único processo.
Problemas identificados:

- Difícil de testar isoladamente — falha serial derruba tudo
- Lógica de processamento acoplada ao transporte serial
- Dependências pesadas para um TVBox com pouca RAM

### 2.3 Pilha tecnológica

| Camada | Tecnologia | Justificativa |
|--------|-----------|---------------|
| Firmware | ESP32 Arduino/IDF | Mantido — protocolo binário CRC16 já funcional |
| Protocolo | **TypeScript puro** | Compartilhado entre gateway e navegador |
| **Processamento** | **TypeScript puro** | Sem deps de Node nem de browser — roda em ambos |
| Gateway Serial→WS | **Node.js 20 LTS + `serialport`** | Roda em ARM/Linux, Alpine ~60 MB |
| API REST | **Node.js + Fastify** | Mesma runtime do gateway, TypeScript nativo |
| Banco de Dados | **SQLite** (padrão) ou **MariaDB** (opcional) | Configurável via variável de ambiente |
| WebApp | **TypeScript + Vite** | Bundle leve, sem framework externo, testa com Vitest |
| WebWorkers | **Worker API nativa** | Processamento off-thread no Cenário C |
| Testes | **Vitest + Supertest + Playwright** | Cobertura unitária/integração/ponta-a-ponta |
| Containerização | **Docker + Docker Compose** | Portável entre TVBox Armbian e qualquer Linux |

---

## 3. Estrutura de Diretórios

```
balancaGFIG/
│
├── firmware/                            # ESP32 — inalterado
│   ├── src/
│   │   ├── principal.cpp
│   │   ├── protocolo.h
│   │   └── sensores.h
│   └── platformio.ini
│
├── pacotes/                             # Monorepo (workspaces npm)
│   │
│   ├── protocolo/                       # ★ Camada 1 — transporte de bytes
│   │   ├── src/
│   │   │   ├── tipos.ts
│   │   │   ├── codificador.ts
│   │   │   └── crc16.ts
│   │   ├── testes/
│   │   │   └── codificador.teste.ts
│   │   └── package.json
│   │
│   ├── processamento/                   # ★ Camada 2 — lógica de negócio
│   │   │                                #   TypeScript puro: roda no gateway (A/B)
│   │   │                                #   e no WebWorker do navegador (C)
│   │   ├── src/
│   │   │   ├── tipos.ts                 # LeituraProcessada, ConfiguracaoPipeline
│   │   │   ├── filtros/
│   │   │   │   ├── ZonaMorta.ts
│   │   │   │   ├── MediaMovel.ts
│   │   │   │   └── ArredondamentoInt.ts
│   │   │   ├── analise/
│   │   │   │   ├── DetectorQueima.ts
│   │   │   │   ├── CalculadorImpulso.ts
│   │   │   │   └── EstatisticasSessao.ts
│   │   │   ├── calibracao/
│   │   │   │   └── Calibrador.ts
│   │   │   └── pipeline/
│   │   │       └── PipelineProcessamento.ts
│   │   ├── testes/
│   │   │   ├── ZonaMorta.teste.ts
│   │   │   ├── MediaMovel.teste.ts
│   │   │   ├── CalculadorImpulso.teste.ts
│   │   │   ├── DetectorQueima.teste.ts
│   │   │   └── PipelineProcessamento.teste.ts
│   │   └── package.json
│   │
│   ├── gateway/                         # ★ Camada 3 — bridge serial→rede
│   │   ├── src/
│   │   │   ├── principal.ts
│   │   │   ├── PortaSerial.ts
│   │   │   ├── ServidorWebSocket.ts
│   │   │   └── ServidorBluetooth.ts
│   │   ├── testes/
│   │   │   ├── PortaSerial.teste.ts
│   │   │   └── ServidorWebSocket.teste.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── api/                             # ★ Camada 4 — persistência
│   │   ├── src/
│   │   │   ├── principal.ts
│   │   │   ├── autenticacao/
│   │   │   │   ├── ChaveAPI.ts          # Validação de API Key no header
│   │   │   │   └── gerarChave.ts        # Script utilitário para gerar chaves
│   │   │   ├── rotas/
│   │   │   │   ├── sessoes.ts
│   │   │   │   ├── leituras.ts
│   │   │   │   └── serial.ts            # GET /api/serial/status
│   │   │   ├── bancoDados/
│   │   │   │   ├── esquema.sql
│   │   │   │   ├── BancoDados.ts        # Abstração comum (SQLite ou MariaDB)
│   │   │   │   ├── ProvedorSQLite.ts    # Implementação SQLite + WAL
│   │   │   │   └── ProvedorMariaDB.ts   # Implementação MariaDB
│   │   │   └── intermediarios/
│   │   │       └── cors.ts
│   │   ├── testes/
│   │   │   ├── sessoes.teste.ts
│   │   │   └── leituras.teste.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   └── aplicacao/                       # ★ Camada 5 — interface com o usuário
│       ├── src/
│       │   ├── adaptadores/
│       │   │   ├── IFonteDados.ts       # Interface comum (emite LeituraProcessada)
│       │   │   ├── FonteWebSocket.ts    # Cenários A/B — dado já processado
│       │   │   ├── FonteWebSerial.ts    # Cenário C — delega ao TrabalhadorSerial
│       │   │   └── FonteBluetooth.ts    # Cenário B — dado já processado
│       │   ├── trabalhadores/           # WebWorkers
│       │   │   ├── TrabalhadorSerial.ts # Worker: decodifica + processa (Cenário C)
│       │   │   └── TrabalhadorSerial.worker.ts  # Ponto de entrada do worker
│       │   ├── armazenamento/
│       │   │   ├── IArmazenamento.ts
│       │   │   ├── ArmazenamentoRemoto.ts
│       │   │   └── ArmazenamentoLocal.ts
│       │   ├── nucleo/
│       │   │   ├── BarramentoDados.ts
│       │   │   ├── GerenciadorSessao.ts
│       │   │   └── DetectorAmbiente.ts
│       │   ├── telas/
│       │   │   ├── TelaConexao.ts       # ★ Tela inicial: mostra detecção + escolha manual
│       │   │   ├── TelaPrincipal.ts     # Dashboard de medição
│       │   │   └── TelaSessoes.ts       # Histórico de sessões
│       │   ├── interface/
│       │   │   ├── MedidorForca.ts
│       │   │   ├── GraficoEmpuxo.ts
│       │   │   ├── StatusConexao.ts
│       │   │   └── PainelSessao.ts
│       │   ├── principal.ts
│       │   └── index.html
│       ├── testes/
│       │   ├── adaptadores/
│       │   │   ├── FonteWebSocket.teste.ts
│       │   │   └── FonteWebSerial.teste.ts
│       │   ├── trabalhadores/
│       │   │   └── TrabalhadorSerial.teste.ts
│       │   ├── armazenamento/
│       │   │   └── ArmazenamentoLocal.teste.ts
│       │   └── nucleo/
│       │       └── DetectorAmbiente.teste.ts
│       ├── ponta-a-ponta/
│       │   ├── telaConexao.spec.ts
│       │   └── painel.spec.ts
│       ├── vite.config.ts
│       └── package.json
│
├── docker/
│   ├── docker-compose.yml               # Cenário A — SQLite (padrão)
│   ├── docker-compose.mariadb.yml       # Cenário A — MariaDB (opcional)
│   ├── docker-compose.dev.yml           # Desenvolvimento local
│   └── docker-compose.bt.yml            # Cenário B — com ponte BLE
│
├── scripts/
│   ├── configurar-tvbox.sh
│   └── gravar-firmware.sh
│
├── package.json
└── LEIAME.md
```

### Dependências entre pacotes

```
protocolo
    └── processamento
            ├── gateway       (Cenários A/B — pipeline roda no servidor)
            └── aplicacao     (Cenário C  — pipeline roda no WebWorker)

api                           (sem dependência dos outros pacotes internos)
```

---

## 4. WebWorkers — Processamento Off-Thread (Cenário C)

### 4.1 Por que usar WebWorker

No Cenário C, o ESP32 envia dados a até 100 Hz diretamente pelo WebSerial. Sem
um worker, a decodificação binária e o pipeline de processamento rodariam na
thread principal do browser — causando travamentos visíveis na interface durante
testes de motor.

O `TrabalhadorSerial` move toda a carga computacional para uma thread separada.
A thread principal apenas renderiza os dados já prontos.

### 4.2 Arquitetura do worker

```
Thread principal                          Thread do Worker
────────────────                          ─────────────────
FonteWebSerial
  │
  │── porta.readable.pipeTo(writable) ──► TrabalhadorSerial.worker.ts
  │                                           │ decodificar() — protocolo
  │                                           │ PipelineProcessamento
  │                                           │   · Calibrador
  │                                           │   · ZonaMorta
  │                                           │   · MediaMovel
  │                                           │   · DetectorQueima
  │                                           │   · CalculadorImpulso
  │◄── postMessage(LeituraProcessada) ────────┘
  │
  dispatchEvent('dados', LeituraProcessada)
  │
Interface gráfica (MedidorForca, GraficoEmpuxo...)
```

### 4.3 Código do Worker

```typescript
// pacotes/aplicacao/src/trabalhadores/TrabalhadorSerial.worker.ts
// Este arquivo é o ponto de entrada do WebWorker — roda em thread separada

import { decodificar }           from '@balancagfig/protocolo';
import { PipelineProcessamento,
         ConfiguracaoPipeline }  from '@balancagfig/processamento';

let pipeline: PipelineProcessamento | null = null;

self.onmessage = (evento: MessageEvent) => {
  const { tipo, carga } = evento.data;

  switch (tipo) {
    case 'CONFIGURAR':
      pipeline = new PipelineProcessamento(carga as ConfiguracaoPipeline);
      break;

    case 'BYTES':
      if (!pipeline) return;
      try {
        const pacote  = decodificar(Buffer.from(carga as ArrayBuffer));
        if (pacote.tipo !== 'DADOS') return;
        const leitura = pipeline.processar(pacote);
        self.postMessage({ tipo: 'LEITURA', carga: leitura });
      } catch (erro) {
        self.postMessage({ tipo: 'ERRO', carga: (erro as Error).message });
      }
      break;

    case 'REINICIAR':
      pipeline?.reiniciar();
      break;
  }
};
```

```typescript
// pacotes/aplicacao/src/trabalhadores/TrabalhadorSerial.ts
// Wrapper na thread principal que gerencia o worker

import { LeituraProcessada, ConfiguracaoPipeline } from '@balancagfig/processamento';

export class TrabalhadorSerial extends EventTarget {
  private worker: Worker;

  constructor() {
    super();
    this.worker = new Worker(
      new URL('./TrabalhadorSerial.worker.ts', import.meta.url),
      { type: 'module' },
    );

    this.worker.onmessage = (evento: MessageEvent) => {
      const { tipo, carga } = evento.data;
      if (tipo === 'LEITURA') {
        this.dispatchEvent(new CustomEvent('dados', { detail: carga as LeituraProcessada }));
      }
      if (tipo === 'ERRO') {
        this.dispatchEvent(new CustomEvent('erro', { detail: new Error(carga) }));
      }
    };
  }

  configurar(config: ConfiguracaoPipeline) {
    this.worker.postMessage({ tipo: 'CONFIGURAR', carga: config });
  }

  enviarBytes(bytes: ArrayBuffer) {
    // Transferência sem cópia — zero overhead de memória
    this.worker.postMessage({ tipo: 'BYTES', carga: bytes }, [bytes]);
  }

  reiniciar() {
    this.worker.postMessage({ tipo: 'REINICIAR' });
  }

  encerrar() {
    this.worker.terminate();
  }
}
```

```typescript
// pacotes/aplicacao/src/adaptadores/FonteWebSerial.ts  (trecho relevante)

import { TrabalhadorSerial } from '../trabalhadores/TrabalhadorSerial';

export class FonteWebSerial extends EventTarget implements IFonteDados {
  private trabalhador = new TrabalhadorSerial();

  async conectar(config: ConfiguracaoPipeline) {
    this.trabalhador.configurar(config);

    // Repassa eventos do worker para os ouvintes da fonte
    this.trabalhador.addEventListener('dados', (e) =>
      this.dispatchEvent(new CustomEvent('dados', { detail: (e as CustomEvent).detail })),
    );

    const porta = await navigator.serial.requestPort();
    await porta.open({ baudRate: 115200 });

    const leitor = porta.readable!.getReader();
    // Loop de leitura: envia bytes ao worker via transferência zero-cópia
    (async () => {
      while (true) {
        const { value, done } = await leitor.read();
        if (done) break;
        this.trabalhador.enviarBytes(value.buffer as ArrayBuffer);
      }
    })();
  }

  async desconectar() { this.trabalhador.encerrar(); }

  async enviarComando(cmd: PacoteComando) { /* ... */ }
  obterStatus(): StatusConexao { /* ... */ }
}
```

---

## 5. Tela de Conexão e DetectorAmbiente

### 5.1 Fluxo de detecção e escolha do usuário

A tela de conexão é a primeira coisa que o usuário vê. Ela executa a detecção
automática e apresenta o resultado de forma clara — mas **sempre permite que o
usuário escolha ou ajuste manualmente**. Isso é essencial quando a aplicação é
acessada pelo GitHub Pages: o usuário precisa digitar o IP do TVBox.

```
┌─────────────────────────────────────────────────────────┐
│  BalançaGFIG — Configurar Conexão                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Detecção automática...  ████████████░░░  (em andamento)│
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │ ✅  TVBox detectado em 192.168.1.42              │   │
│  │     Gateway WebSocket: ws://192.168.1.42:8765    │   │
│  │     API REST:          http://192.168.1.42:3000  │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ── ou escolha manualmente ──────────────────────────── │
│                                                         │
│  ○  TVBox / Servidor remoto                             │
│     Endereço IP: [192.168.1.42      ]  Porta: [8765]    │
│     Chave de API: [••••••••••••••••]                    │
│                                                         │
│  ○  ESP32 via WebSerial (ESP ligado neste PC)           │
│     Porta serial: [ Selecionar porta ▼ ]                │
│     ┌──────────────────────────────────────────┐        │
│     │ COM3 — USB Serial Device                 │        │
│     │ /dev/ttyUSB0 — CP210x UART Bridge        │        │
│     └──────────────────────────────────────────┘        │
│                                                         │
│  ○  Bluetooth (ESP via BLE)                             │
│                                                         │
│              [ Conectar ]                               │
└─────────────────────────────────────────────────────────┘
```

### 5.2 Código do DetectorAmbiente

```typescript
// pacotes/aplicacao/src/nucleo/DetectorAmbiente.ts

import { FonteWebSocket }      from '../adaptadores/FonteWebSocket';
import { FonteWebSerial }      from '../adaptadores/FonteWebSerial';
import { FonteBluetooth }      from '../adaptadores/FonteBluetooth';
import { ArmazenamentoRemoto } from '../armazenamento/ArmazenamentoRemoto';
import { ArmazenamentoLocal }  from '../armazenamento/ArmazenamentoLocal';
import { IFonteDados }         from '../adaptadores/IFonteDados';
import { IArmazenamento }      from '../armazenamento/IArmazenamento';

export type CenarioDetectado = 'A' | 'B' | 'C' | 'nenhum';

export interface ResultadoDeteccao {
  cenario:            CenarioDetectado;
  enderecoGateway?:   string;          // ex: ws://192.168.1.42:8765
  enderecoAPI?:       string;          // ex: http://192.168.1.42:3000
  portasSeriais?:     SerialPortInfo[];// lista de portas disponíveis
  bluetoothDisponivel: boolean;
  mensagem:           string;          // texto legível para exibir ao usuário
}

export interface ConfiguracaoConexao {
  cenario:         CenarioDetectado;
  enderecoGateway?: string;
  enderecoAPI?:     string;
  portaSerial?:     SerialPort;
  chaveAPI?:        string;
}

// ─── Funções auxiliares de sondagem ────────────────────────────────────────

async function sondarWebSocket(url: string, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolver) => {
    const ws = new WebSocket(url);
    const tempo = setTimeout(() => { ws.close(); resolver(false); }, timeoutMs);
    ws.onopen  = () => { clearTimeout(tempo); ws.close(); resolver(true); };
    ws.onerror = () => { clearTimeout(tempo); resolver(false); };
  });
}

async function sondarHTTP(url: string, timeoutMs = 1500): Promise<boolean> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return r.ok;
  } catch { return false; }
}

async function listarPortasSeriais(): Promise<SerialPortInfo[]> {
  if (!('serial' in navigator)) return [];
  try {
    const portas = await navigator.serial.getPorts();
    return portas.map((p) => p.getInfo());
  } catch { return []; }
}

// ─── Detecção automática ───────────────────────────────────────────────────

export async function detectarAmbiente(
  onProgresso?: (mensagem: string) => void,
): Promise<ResultadoDeteccao> {
  const progresso = onProgresso ?? (() => {});
  const base      = window.location.hostname;

  // Tenta gateway no mesmo host (TVBox servindo a aplicação — Cenário A)
  progresso('Procurando gateway na rede local...');
  const urlGateway = `ws://${base}:8765`;
  const urlAPI     = `http://${base}:3000`;

  const gatewayDisponivel = await sondarWebSocket(urlGateway);
  if (gatewayDisponivel) {
    const apiDisponivel = await sondarHTTP(`${urlAPI}/saude`);
    return {
      cenario:          'A',
      enderecoGateway:  urlGateway,
      enderecoAPI:      apiDisponivel ? urlAPI : undefined,
      bluetoothDisponivel: false,
      mensagem:         `TVBox detectado em ${base}`,
    };
  }

  // Verifica WebSerial (Cenário C — ESP ligado no PC)
  progresso('Verificando WebSerial...');
  const portasSeriais = await listarPortasSeriais();
  if ('serial' in navigator) {
    return {
      cenario:          'C',
      portasSeriais,
      bluetoothDisponivel: 'bluetooth' in navigator,
      mensagem:         portasSeriais.length > 0
        ? `ESP32 detectado: ${portasSeriais.length} porta(s) serial disponível(is)`
        : 'WebSerial disponível — nenhuma porta autorizada ainda',
    };
  }

  // Verifica Bluetooth (Cenário B)
  progresso('Verificando Bluetooth...');
  if ('bluetooth' in navigator) {
    return {
      cenario: 'B',
      bluetoothDisponivel: true,
      mensagem: 'Bluetooth disponível',
    };
  }

  return {
    cenario: 'nenhum',
    bluetoothDisponivel: false,
    mensagem: 'Nenhum transporte detectado automaticamente',
  };
}

// ─── Instancia adaptadores conforme configuração escolhida ─────────────────

export function instanciarAmbiente(config: ConfiguracaoConexao): {
  fonteDados:    IFonteDados;
  armazenamento: IArmazenamento;
} {
  switch (config.cenario) {
    case 'A':
      return {
        fonteDados:    new FonteWebSocket(config.enderecoGateway!, config.chaveAPI),
        armazenamento: config.enderecoAPI
          ? new ArmazenamentoRemoto(config.enderecoAPI, config.chaveAPI)
          : new ArmazenamentoLocal(),
      };

    case 'C':
      return {
        fonteDados:    new FonteWebSerial(config.portaSerial),
        armazenamento: new ArmazenamentoLocal(),
      };

    case 'B':
      return {
        fonteDados:    new FonteBluetooth(),
        armazenamento: new ArmazenamentoLocal(),
      };

    default:
      throw new Error('Cenário inválido ou nenhum transporte disponível.');
  }
}
```

### 5.3 Código da TelaConexao

```typescript
// pacotes/aplicacao/src/telas/TelaConexao.ts

import { detectarAmbiente,
         instanciarAmbiente,
         ResultadoDeteccao,
         ConfiguracaoConexao } from '../nucleo/DetectorAmbiente';

export class TelaConexao {
  private resultado?: ResultadoDeteccao;

  async inicializar(containerEl: HTMLElement) {
    this.renderizarCarregando(containerEl);

    this.resultado = await detectarAmbiente((msg) =>
      this.atualizarProgresso(containerEl, msg),
    );

    this.renderizarResultado(containerEl, this.resultado);
  }

  private renderizarResultado(el: HTMLElement, resultado: ResultadoDeteccao) {
    // Exibe o resultado da detecção automática em destaque
    // e renderiza o formulário de configuração manual abaixo,
    // pré-preenchido com os valores detectados.
    //
    // O usuário pode:
    //   - Aceitar a detecção e clicar em "Conectar"
    //   - Trocar o cenário (radio button)
    //   - Editar o IP do TVBox manualmente
    //   - Selecionar a porta WebSerial na lista
    //   - Inserir a chave de API
  }

  aoConectar(callback: (config: ConfiguracaoConexao) => void) {
    // Lê o formulário e chama instanciarAmbiente()
  }

  // Permite que aplicações hospedadas no GitHub Pages definam
  // um IP externo para acessar um TVBox em outra rede
  private salvarConfiguracao(config: ConfiguracaoConexao) {
    localStorage.setItem('balanca-gfig:config', JSON.stringify(config));
  }

  private carregarConfiguracaoSalva(): ConfiguracaoConexao | null {
    const salvo = localStorage.getItem('balanca-gfig:config');
    return salvo ? JSON.parse(salvo) : null;
  }
}
```

---

## 6. Segurança da API (API Key)

### 6.1 Motivação

Mesmo em rede local, outros dispositivos na mesma rede Wi-Fi conseguem acessar
a API. Uma API Key simples impede deleções acidentais e acesso não autorizado
sem a complexidade de um sistema OAuth/JWT.

### 6.2 Geração da chave

```typescript
// pacotes/api/src/autenticacao/gerarChave.ts
// Executado uma vez no setup do TVBox: node dist/autenticacao/gerarChave.js

import { randomBytes } from 'crypto';
import { writeFileSync } from 'fs';

const chave = randomBytes(32).toString('hex');
writeFileSync('/dados/.chave-api', chave, { mode: 0o600 });
console.log(`Chave gerada: ${chave}`);
console.log('Guarde esta chave — ela será solicitada na tela de conexão.');
```

### 6.3 Validação no intermediário (middleware)

```typescript
// pacotes/api/src/autenticacao/ChaveAPI.ts

import { FastifyRequest, FastifyReply } from 'fastify';
import { readFileSync } from 'fs';

const CAMINHO_CHAVE = process.env.CAMINHO_CHAVE_API ?? '/dados/.chave-api';

// Lê a chave uma vez ao iniciar — sem overhead por requisição
const CHAVE_VALIDA = (() => {
  try {
    return readFileSync(CAMINHO_CHAVE, 'utf-8').trim();
  } catch {
    console.warn('[AVISO] Arquivo de chave não encontrado — API sem autenticação');
    return null;
  }
})();

export async function verificarChaveAPI(
  req: FastifyRequest,
  rep: FastifyReply,
) {
  if (!CHAVE_VALIDA) return;   // sem chave configurada: API pública (modo dev)

  const chaveRecebida = req.headers['x-chave-api'] as string | undefined;

  if (!chaveRecebida || chaveRecebida !== CHAVE_VALIDA) {
    rep.status(401).send({ erro: 'Chave de API inválida ou ausente' });
  }
}
```

```typescript
// pacotes/api/src/rotas/sessoes.ts  (registro da rota com proteção)

import { verificarChaveAPI } from '../autenticacao/ChaveAPI';

export async function rotasSessoes(app: FastifyInstance) {
  // Leitura: sem autenticação — qualquer cliente na rede pode visualizar
  app.get('/sessoes', listarSessoes);
  app.get('/sessoes/:id', obterSessao);
  app.get('/sessoes/:id/leituras', obterLeituras);
  app.get('/sessoes/:id/exportar', exportarCSV);

  // Escrita: exige chave de API
  app.post('/sessoes',       { preHandler: verificarChaveAPI }, criarSessao);
  app.delete('/sessoes/:id', { preHandler: verificarChaveAPI }, excluirSessao);
  app.post('/leituras',      { preHandler: verificarChaveAPI }, salvarLeituras);
}
```

### 6.4 Envio da chave pelo cliente

```typescript
// pacotes/aplicacao/src/armazenamento/ArmazenamentoRemoto.ts  (trecho)

export class ArmazenamentoRemoto implements IArmazenamento {
  constructor(
    private readonly urlBase:  string,
    private readonly chaveAPI?: string,
  ) {}

  private cabecalhos(): HeadersInit {
    return this.chaveAPI
      ? { 'Content-Type': 'application/json', 'x-chave-api': this.chaveAPI }
      : { 'Content-Type': 'application/json' };
  }

  async criarSessao(dados: Omit<SessaoTeste, 'id'>): Promise<SessaoTeste> {
    const resp = await fetch(`${this.urlBase}/sessoes`, {
      method:  'POST',
      headers: this.cabecalhos(),
      body:    JSON.stringify(dados),
    });
    if (!resp.ok) throw new Error(`Erro ao criar sessão: ${resp.status}`);
    return resp.json();
  }
  // ...demais métodos usam this.cabecalhos() igualmente
}
```

---

## 7. O Pipeline de Processamento

### 7.1 Tipos do processamento

```typescript
// pacotes/processamento/src/tipos.ts

export interface ConfiguracaoPipeline {
  limiarZonaMortaN:   number;  // N — leituras abaixo disso viram zero
  janelaMediaMovel:   number;  // quantidade de amostras para suavização
  fatorCalibracao:    number;  // multiplicador ADC → Newtons
  deslocamentoTara:   number;  // offset de tara
}

export interface LeituraProcessada {
  marcaTemporal:      number;  // ms desde início da sessão
  forcaNewton:        number;  // após calibração, zona morta e suavização
  temperatura:        number;  // °C
  emQueima:           boolean; // true enquanto houver empuxo detectado
  impulsoAcumuladoNs: number;  // integral da força até este instante (N·s)
}
```

### 7.2 PipelineProcessamento

```typescript
// pacotes/processamento/src/pipeline/PipelineProcessamento.ts

import { PacoteDados }          from '@balancagfig/protocolo';
import { LeituraProcessada,
         ConfiguracaoPipeline } from '../tipos';
import { Calibrador }           from '../calibracao/Calibrador';
import { ZonaMorta }            from '../filtros/ZonaMorta';
import { MediaMovel }           from '../filtros/MediaMovel';
import { DetectorQueima }       from '../analise/DetectorQueima';
import { CalculadorImpulso }    from '../analise/CalculadorImpulso';

export class PipelineProcessamento {
  private calibrador:  Calibrador;
  private zonaMorta:   ZonaMorta;
  private mediaMovel:  MediaMovel;
  private detector:    DetectorQueima;
  private calculador:  CalculadorImpulso;

  constructor(config: ConfiguracaoPipeline) {
    this.calibrador  = new Calibrador(config.fatorCalibracao, config.deslocamentoTara);
    this.zonaMorta   = new ZonaMorta(config.limiarZonaMortaN);
    this.mediaMovel  = new MediaMovel(config.janelaMediaMovel);
    this.detector    = new DetectorQueima(config.limiarZonaMortaN);
    this.calculador  = new CalculadorImpulso();
  }

  processar(pacote: PacoteDados): LeituraProcessada {
    let forca = this.calibrador.aplicar(pacote.forcaBruta);  // ADC → N
    forca     = this.zonaMorta.aplicar(forca);               // remove ruído
    forca     = this.mediaMovel.aplicar(forca);              // suaviza

    const emQueima           = this.detector.atualizar(forca, pacote.marcaTemporal);
    const impulsoAcumuladoNs = this.calculador.integrar(forca, pacote.marcaTemporal);

    return {
      marcaTemporal:      pacote.marcaTemporal,
      forcaNewton:        forca,
      temperatura:        pacote.temperatura,
      emQueima,
      impulsoAcumuladoNs,
    };
  }

  reiniciar() {
    this.mediaMovel.reiniciar();
    this.detector.reiniciar();
    this.calculador.reiniciar();
  }
}
```

### 7.3 Onde o pipeline é instanciado em cada cenário

**Cenários A e B — no gateway** (thread Node.js, antes do WebSocket/BLE):

```typescript
// pacotes/gateway/src/ServidorWebSocket.ts
this.porta.on('pacote', (pacote: PacoteDados) => {
  const leitura = this.pipeline.processar(pacote);
  this.difundir(leitura);   // cliente recebe LeituraProcessada
});
```

**Cenário C — no WebWorker** (thread separada do browser):

```typescript
// pacotes/aplicacao/src/trabalhadores/TrabalhadorSerial.worker.ts
const leitura = pipeline.processar(decodificar(bytes));
self.postMessage({ tipo: 'LEITURA', carga: leitura });
```

---

## 8. Banco de Dados — SQLite (padrão) ou MariaDB (opcional)

### 8.1 Abstração do provedor

```typescript
// pacotes/api/src/bancoDados/BancoDados.ts

export interface IBancoDados {
  executar(sql: string, params?: unknown[]): void;
  consultar<T>(sql: string, params?: unknown[]): T[];
  fechar(): void;
}

export function criarBancoDados(): IBancoDados {
  const provedor = process.env.PROVEDOR_BANCO ?? 'sqlite';

  if (provedor === 'mariadb') {
    const { ProvedorMariaDB } = require('./ProvedorMariaDB');
    return new ProvedorMariaDB({
      host:     process.env.DB_HOST     ?? 'mariadb',
      porta:    Number(process.env.DB_PORTA ?? 3306),
      usuario:  process.env.DB_USUARIO  ?? 'balanca',
      senha:    process.env.DB_SENHA    ?? '',
      banco:    process.env.DB_NOME     ?? 'balanca_gfig',
    });
  }

  const { ProvedorSQLite } = require('./ProvedorSQLite');
  return new ProvedorSQLite(process.env.CAMINHO_BANCO ?? '/dados/balanca.db');
}
```

### 8.2 SQLite com WAL — resiliência a quedas de energia

O TVBox pode perder energia durante um teste. O modo WAL (Write-Ahead Logging)
protege o banco de corrupção: escritas vão primeiro ao log e são aplicadas
atomicamente. Em caso de queda, o SQLite reconstrói o estado consistente no
próximo acesso.

```typescript
// pacotes/api/src/bancoDados/ProvedorSQLite.ts

import Database from 'better-sqlite3';
import { IBancoDados } from './BancoDados';

export class ProvedorSQLite implements IBancoDados {
  private db: Database.Database;

  constructor(caminho: string) {
    this.db = new Database(caminho);

    // WAL: resiliência a quedas de energia — escritas atômicas
    this.db.pragma('journal_mode = WAL');

    // Integridade referencial
    this.db.pragma('foreign_keys = ON');

    // Sincronização: NORMAL é suficiente com WAL (equilíbrio desempenho/segurança)
    this.db.pragma('synchronous = NORMAL');

    this.inicializarEsquema();
  }

  private inicializarEsquema() {
    const sql = require('fs').readFileSync(
      require('path').join(__dirname, 'esquema.sql'), 'utf-8',
    );
    this.db.exec(sql);
  }

  executar(sql: string, params: unknown[] = []) {
    this.db.prepare(sql).run(...params);
  }

  consultar<T>(sql: string, params: unknown[] = []): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  fechar() { this.db.close(); }
}
```

### 8.3 MariaDB — para quando SQLite não for suficiente

```typescript
// pacotes/api/src/bancoDados/ProvedorMariaDB.ts

import mariadb from 'mariadb';
import { IBancoDados } from './BancoDados';

interface ConfigMariaDB {
  host: string; porta: number;
  usuario: string; senha: string; banco: string;
}

export class ProvedorMariaDB implements IBancoDados {
  private pool: mariadb.Pool;

  constructor(config: ConfigMariaDB) {
    this.pool = mariadb.createPool({
      host:     config.host,
      port:     config.porta,
      user:     config.usuario,
      password: config.senha,
      database: config.banco,
      connectionLimit: 5,
    });
  }

  async executar(sql: string, params: unknown[] = []) {
    const conn = await this.pool.getConnection();
    try { await conn.query(sql, params); }
    finally { conn.release(); }
  }

  async consultar<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const conn = await this.pool.getConnection();
    try { return await conn.query(sql, params); }
    finally { conn.release(); }
  }

  fechar() { return this.pool.end(); }
}
```

---

## 9. Interfaces Centrais (TypeScript)

### 9.1 Protocolo — bytes do ESP32

```typescript
// pacotes/protocolo/src/tipos.ts

export interface PacoteDados {
  tipo:           'DADOS';
  marcaTemporal:  number;   // ms desde boot
  forcaBruta:     number;   // ADC raw — nunca chega à interface gráfica
  temperatura:    number;   // °C
  sequencia:      number;   // anti-duplicata
}

export interface PacoteConfiguracao {
  tipo:              'CONFIGURACAO';
  taxaAmostragemHz:  number;
  deslocamentoTara:  number;
  fatorCalibracao:   number;
}

export interface PacoteComando {
  tipo:    'COMANDO';
  comando: 'TARAR' | 'INICIAR' | 'PARAR' | 'DEFINIR_CONFIG';
  carga?:  Partial<PacoteConfiguracao>;
}

export type Pacote = PacoteDados | PacoteConfiguracao | PacoteComando;
```

### 9.2 IFonteDados — adaptador de conexão

Todas as fontes emitem `LeituraProcessada`, não `PacoteDados`.

```typescript
// pacotes/aplicacao/src/adaptadores/IFonteDados.ts

import { LeituraProcessada } from '@balancagfig/processamento';
import { PacoteComando }     from '@balancagfig/protocolo';

export interface StatusConexao {
  conectado:    boolean;
  transporte:   'websocket' | 'webserial' | 'bluetooth';
  dispositivo?: string;
  erro?:        string;
}

export interface IFonteDados extends EventTarget {
  conectar(opcoes?: unknown): Promise<void>;
  desconectar(): Promise<void>;
  enviarComando(cmd: PacoteComando): Promise<void>;
  obterStatus(): StatusConexao;
  // Evento 'dados'  → detail: LeituraProcessada
  // Evento 'status' → detail: StatusConexao
  // Evento 'erro'   → detail: Error
}
```

### 9.3 IArmazenamento — adaptador de persistência

```typescript
// pacotes/aplicacao/src/armazenamento/IArmazenamento.ts

import { LeituraProcessada } from '@balancagfig/processamento';

export interface SessaoTeste {
  id: string; nome: string; idMotor?: string; criadoEm: string;
  duracaoMs: number; forcaMaximaN: number;
  impulsoTotalNs: number; observacoes?: string;
}

export interface IArmazenamento {
  criarSessao(sessao: Omit<SessaoTeste, 'id'>): Promise<SessaoTeste>;
  listarSessoes(): Promise<SessaoTeste[]>;
  excluirSessao(id: string): Promise<void>;
  adicionarLeituras(idSessao: string, leituras: LeituraProcessada[]): Promise<void>;
  obterLeituras(idSessao: string): Promise<LeituraProcessada[]>;
  exportarCSV(idSessao: string): Promise<string>;
}
```

---

## 10. Gateway Serial → WebSocket

```typescript
// pacotes/gateway/src/ServidorWebSocket.ts

import { WebSocketServer, WebSocket } from 'ws';
import { PortaSerialESP32 }           from './PortaSerial';
import { PipelineProcessamento }      from '@balancagfig/processamento';
import { PacoteDados }                from '@balancagfig/protocolo';

export class ServidorWebSocket {
  private servidor:  WebSocketServer;
  private clientes   = new Set<WebSocket>();
  private pipeline:  PipelineProcessamento;

  constructor(porta: PortaSerialESP32, portaTCP = 8765) {
    this.pipeline = new PipelineProcessamento({
      limiarZonaMortaN: Number(process.env.LIMIAR_ZONA_MORTA  ?? 0.5),
      janelaMediaMovel: Number(process.env.JANELA_MEDIA_MOVEL ?? 5),
      fatorCalibracao:  Number(process.env.FATOR_CALIBRACAO   ?? 1.0),
      deslocamentoTara: Number(process.env.DESLOCAMENTO_TARA  ?? 0),
    });

    this.servidor = new WebSocketServer({ port: portaTCP });

    this.servidor.on('connection', (cliente) => {
      this.clientes.add(cliente);
      cliente.on('message', async (msg) => await porta.enviar(Buffer.from(msg as ArrayBuffer)));
      cliente.on('close', () => this.clientes.delete(cliente));
    });

    porta.on('pacote', (pacote: PacoteDados) => {
      const leitura = this.pipeline.processar(pacote);
      this.difundir(leitura);
    });
  }

  private difundir(leitura: object) {
    const dados = JSON.stringify(leitura);
    for (const c of this.clientes)
      if (c.readyState === WebSocket.OPEN) c.send(dados);
  }

  reiniciarPipeline() { this.pipeline.reiniciar(); }
  async fechar()      { return new Promise<void>((r) => this.servidor.close(() => r())); }
}
```

---

## 11. Docker Compose

### 11.1 Cenário A — SQLite (padrão)

```yaml
# docker/docker-compose.yml

name: balanca-gfig

services:

  gateway:
    build: { context: ../pacotes/gateway }
    restart: unless-stopped
    devices:
      - /dev/ttyUSB0:/dev/ttyUSB0
    environment:
      PORTA_SERIAL:        /dev/ttyUSB0
      BAUD_SERIAL:         115200
      PORTA_WEBSOCKET:     8765
      LIMIAR_ZONA_MORTA:   0.5
      JANELA_MEDIA_MOVEL:  5
      FATOR_CALIBRACAO:    1.0
      DESLOCAMENTO_TARA:   0
    ports: ["8765:8765"]
    networks: [rede-gfig]
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8765/saude"]
      interval: 10s
      retries: 5

  api:
    build: { context: ../pacotes/api }
    restart: unless-stopped
    environment:
      PROVEDOR_BANCO:   sqlite
      CAMINHO_BANCO:    /dados/balanca.db
      CAMINHO_CHAVE_API: /dados/.chave-api
      PORTA_HTTP:       3000
      ORIGEM_CORS:      "*"
    volumes:
      - dados_banco:/dados
    ports: ["3000:3000"]
    networks: [rede-gfig]
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/saude"]
      interval: 10s
      retries: 5

  aplicacao:
    build: { context: ../pacotes/aplicacao }
    restart: unless-stopped
    ports: ["80:80"]
    networks: [rede-gfig]
    depends_on:
      gateway: { condition: service_healthy }
      api:     { condition: service_healthy }

networks:
  rede-gfig: { driver: bridge }

volumes:
  dados_banco:
```

### 11.2 Cenário A — MariaDB (opcional)

```yaml
# docker/docker-compose.mariadb.yml
# Uso: docker compose -f docker-compose.yml -f docker-compose.mariadb.yml up

services:

  mariadb:
    image: mariadb:11-jammy
    restart: unless-stopped
    environment:
      MARIADB_ROOT_PASSWORD: ${SENHA_ROOT_DB}
      MARIADB_DATABASE:      balanca_gfig
      MARIADB_USER:          balanca
      MARIADB_PASSWORD:      ${SENHA_DB}
    volumes:
      - dados_mariadb:/var/lib/mysql
    networks: [rede-gfig]
    healthcheck:
      test: ["CMD", "healthcheck.sh", "--connect"]
      interval: 10s
      retries: 10

  api:
    environment:
      PROVEDOR_BANCO: mariadb
      DB_HOST:        mariadb
      DB_PORTA:       3306
      DB_USUARIO:     balanca
      DB_SENHA:       ${SENHA_DB}
      DB_NOME:        balanca_gfig
    depends_on:
      mariadb: { condition: service_healthy }

volumes:
  dados_mariadb:
```

### 11.3 Dockerfiles

```dockerfile
# pacotes/gateway/Dockerfile
FROM node:20-alpine AS construtor
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run compilar

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache udev
COPY --from=construtor /app/dist         ./dist
COPY --from=construtor /app/node_modules  ./node_modules
EXPOSE 8765
CMD ["node", "dist/principal.js"]
```

```dockerfile
# pacotes/aplicacao/Dockerfile
FROM node:20-alpine AS construtor
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run compilar

FROM nginx:alpine
COPY --from=construtor /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

---

## 12. Esquema do Banco de Dados

```sql
-- pacotes/api/src/bancoDados/esquema.sql

CREATE TABLE IF NOT EXISTS sessoes (
  id                TEXT    PRIMARY KEY,
  nome              TEXT    NOT NULL,
  id_motor          TEXT,
  criado_em         TEXT    NOT NULL DEFAULT (datetime('now')),
  duracao_ms        INTEGER NOT NULL DEFAULT 0,
  forca_maxima_n    REAL    NOT NULL DEFAULT 0,
  impulso_total_ns  REAL    NOT NULL DEFAULT 0,
  observacoes       TEXT
);

-- Leituras já chegam processadas (forca_newton, não forca_bruta)
CREATE TABLE IF NOT EXISTS leituras (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  id_sessao            TEXT    NOT NULL REFERENCES sessoes(id) ON DELETE CASCADE,
  marca_temporal       INTEGER NOT NULL,
  forca_newton         REAL    NOT NULL,
  temperatura          REAL,
  em_queima            INTEGER NOT NULL DEFAULT 0,
  impulso_acumulado_ns REAL    NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_leituras_sessao ON leituras(id_sessao);
```

---

## 13. Estratégia de Testes

### 13.1 Pirâmide de Testes

```
         ┌────────────────────────────┐
         │  Ponta-a-ponta (Playwright) │  ←  5%  — tela de conexão + painel
         ├────────────────────────────┤
         │        Integração           │  ← 25%  — gateway+ws, api+banco, auth
         ├────────────────────────────┤
         │         Unitários           │  ← 70%  — pipeline, worker, armazenamento
         └────────────────────────────┘
```

### 13.2 Exemplos

**Unitário — Pipeline:**
```typescript
// pacotes/processamento/testes/PipelineProcessamento.teste.ts

const config = {
  limiarZonaMortaN: 0.5, janelaMediaMovel: 1,
  fatorCalibracao: 2.0,  deslocamentoTara: 100,
};

it('aplica calibração: (200-100)*2 = 200 N', () => {
  const p = new PipelineProcessamento(config);
  expect(p.processar(pacote(200)).forcaNewton).toBeCloseTo(200);
});

it('zona morta: força no offset exato vira zero', () => {
  const p = new PipelineProcessamento(config);
  const r = p.processar(pacote(100));   // (100-100)*2 = 0
  expect(r.forcaNewton).toBe(0);
  expect(r.emQueima).toBe(false);
});

it('reiniciar() zera impulso acumulado', () => {
  const p = new PipelineProcessamento(config);
  p.processar(pacote(200));
  p.reiniciar();
  expect(p.processar(pacote(200)).impulsoAcumuladoNs).toBeCloseTo(0);
});
```

**Unitário — TrabalhadorSerial:**
```typescript
// pacotes/aplicacao/testes/trabalhadores/TrabalhadorSerial.teste.ts

it('postMessage LEITURA após processar bytes válidos', async () => {
  const worker = new TrabalhadorSerial();
  const recebidas: LeituraProcessada[] = [];

  worker.addEventListener('dados', (e) =>
    recebidas.push((e as CustomEvent).detail),
  );

  worker.configurar(configPadrao);
  worker.enviarBytes(pacoteCodificado.buffer);

  await vi.waitFor(() => expect(recebidas).toHaveLength(1));
  expect(recebidas[0].forcaNewton).toBeDefined();
});
```

**Integração — API com autenticação:**
```typescript
// pacotes/api/testes/sessoes.teste.ts

const app = criarApp({ caminhoBanco: ':memory:', chaveAPI: 'chave-teste' });

it('DELETE /sessoes/:id sem chave retorna 401', async () => {
  const resp = await request(app).delete('/sessoes/qualquer-id');
  expect(resp.status).toBe(401);
});

it('DELETE /sessoes/:id com chave correta retorna 204', async () => {
  const sessao = await criarSessaoTeste(app);
  const resp   = await request(app)
    .delete(`/sessoes/${sessao.id}`)
    .set('x-chave-api', 'chave-teste');
  expect(resp.status).toBe(204);
});
```

**Ponta-a-ponta — Tela de conexão:**
```typescript
// pacotes/aplicacao/ponta-a-ponta/telaConexao.spec.ts

test('exibe resultado da detecção automática', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('status-deteccao')).toContainText(/detectado|disponível/i);
});

test('permite definir IP manualmente (uso via GitHub Pages)', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('radio', { name: /tvbox/i }).check();
  await page.getByLabel(/endereço ip/i).fill('192.168.1.100');
  await page.getByLabel(/chave de api/i).fill('minha-chave');
  await page.getByRole('button', { name: /conectar/i }).click();
  await expect(page.getByTestId('indicador-cenario')).toHaveText('TVBox');
});

test('lista portas WebSerial disponíveis', async ({ page }) => {
  await page.addInitScript({ path: './simulacros/webserial-simulacro.js' });
  await page.goto('/');
  await page.getByRole('radio', { name: /webserial/i }).check();
  await expect(page.getByTestId('lista-portas')).toBeVisible();
});
```

---

## 14. Roteiro de Migração

| Fase | O que fazer | Impacto no sistema atual |
|------|-------------|--------------------------|
| **1** | Extrair `pacotes/protocolo` — codec CRC16 + tipos TypeScript | Nenhum |
| **2** | Extrair `pacotes/processamento` — portar filtros e calibração do Python | Nenhum |
| **3** | Reescrever gateway em Node.js usando protocolo + processamento | Substitui servidor Python serial |
| **4** | Criar `pacotes/api` com SQLite+WAL e autenticação por API Key | Substitui HTTP do Python |
| **5** | Portar WebApp: TelaConexao + DetectorAmbiente + FonteWebSocket | UI igual, arquitetura nova |
| **6** | Implementar TrabalhadorSerial + FonteWebSerial | Habilita Cenário C |
| **7** | Implementar FonteBluetooth + gateway BLE | Habilita Cenário B |
| **8** | Testar docker-compose.mariadb.yml no TVBox | Alternativa ao SQLite |
| **9** | Testes ponta-a-ponta (tela de conexão + painel) | Valida os 3 cenários |

---

## 15. Variáveis de Ambiente

| Serviço | Variável | Padrão | Descrição |
|---------|---------|--------|-----------|
| gateway | `PORTA_SERIAL` | `/dev/ttyUSB0` | Porta serial do ESP32 |
| gateway | `BAUD_SERIAL` | `115200` | Velocidade serial |
| gateway | `PORTA_WEBSOCKET` | `8765` | Porta TCP do WebSocket |
| gateway | `LIMIAR_ZONA_MORTA` | `0.5` | Limiar da zona morta em N |
| gateway | `JANELA_MEDIA_MOVEL` | `5` | Amostras para suavização |
| gateway | `FATOR_CALIBRACAO` | `1.0` | Fator ADC → Newtons |
| gateway | `DESLOCAMENTO_TARA` | `0` | Offset de tara |
| api | `PROVEDOR_BANCO` | `sqlite` | `sqlite` ou `mariadb` |
| api | `CAMINHO_BANCO` | `/dados/balanca.db` | Caminho SQLite |
| api | `CAMINHO_CHAVE_API` | `/dados/.chave-api` | Arquivo com a API Key |
| api | `DB_HOST` | `mariadb` | Host MariaDB (se aplicável) |
| api | `DB_PORTA` | `3306` | Porta MariaDB |
| api | `DB_USUARIO` | `balanca` | Usuário MariaDB |
| api | `DB_SENHA` | — | Senha MariaDB |
| api | `DB_NOME` | `balanca_gfig` | Nome do banco MariaDB |
| api | `PORTA_HTTP` | `3000` | Porta HTTP da API |
| api | `ORIGEM_CORS` | `*` | Origem CORS permitida |

---

## 16. Diagrama de Fluxo por Cenário

```
CENÁRIO A — TVBox Completo
──────────────────────────────────────────────────────────────────────────
                         ┌──────────────────────────┐
ESP32 ──USB──► PortaSerial│  PipelineProcessamento   │  (no gateway/Node.js)
              bytes brutos│  Calibrador + ZonaMorta  │
                         │  MediaMovel + DetectorQ.  │
                         │  CalculadorImpulso        │
                         └───────────┬──────────────┘
                                     │ LeituraProcessada (JSON)
                                     ▼
                         ServidorWebSocket :8765
                                     │
                    ┌────────────────┴───────────────────┐
                    ▼                                    ▼
             Navegador cliente               App Android (Cenário B)
             (Wi-Fi/GitHub Pages)                   │
                    │                               │
             x-chave-api ──────────► API REST :3000 ◄─────────────┘
                                          │
                                   SQLite (WAL) ou MariaDB


CENÁRIO C — Direto no PC
──────────────────────────────────────────────────────────────────────────
                  ┌──────────────────────────────────────────────────┐
ESP32 ──USB──►   │  FonteWebSerial                                   │
                  │   Thread principal: lê bytes, envia ao worker     │
                  │                                                   │
                  │   ┌─── TrabalhadorSerial.worker.ts ───────────┐  │
                  │   │  decodificar() — protocolo binário         │  │
                  │   │  PipelineProcessamento                     │  │
                  │   │    Calibrador · ZonaMorta · MediaMovel     │  │
                  │   │    DetectorQueima · CalculadorImpulso      │  │
                  │   └────────────────┬──────────────────────────┘  │
                  │                    │ postMessage(LeituraProcessada)│
                  └────────────────────┼─────────────────────────────┘
                                       │ dispatchEvent('dados')
                                       ▼
                                Interface gráfica
                                       │
                                 IndexedDB (navegador)

─────────────────────────────────────────────────────────────────────────
Em todos os cenários, a interface gráfica recebe apenas LeituraProcessada.
Nunca recebe bytes brutos, ADC raw ou forcaBruta.
─────────────────────────────────────────────────────────────────────────
```

---

## 17. Comandos de Desenvolvimento

```bash
# Instalar todas as dependências (monorepo npm workspaces)
npm install

# Rodar todos os testes unitários
npm test

# Rodar testes com cobertura
npm run testar:cobertura

# Testar somente o pipeline de processamento
npm test --workspace=pacotes/processamento

# Testar somente a API
npm test --workspace=pacotes/api

# Gerar chave de API para o TVBox
node pacotes/api/dist/autenticacao/gerarChave.js

# Subir Cenário A com SQLite (padrão)
docker compose -f docker/docker-compose.yml up

# Subir Cenário A com MariaDB (opcional)
docker compose -f docker/docker-compose.yml \
               -f docker/docker-compose.mariadb.yml up

# Build de produção para TVBox
docker compose -f docker/docker-compose.yml build

# Publicar no TVBox via SSH
rsync -avz --exclude node_modules . armbian@tvbox.local:/opt/balanca-gfig/
ssh armbian@tvbox.local "cd /opt/balanca-gfig && docker compose up -d"

# Rodar apenas a aplicação web sem Docker (Cenário C — WebSerial no PC)
cd pacotes/aplicacao && npm run desenvolver
```

---

*Documento de arquitetura — BalançaGFIG · GFIG / IFSC Campus Gaspar*