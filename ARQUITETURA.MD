# BalançaGFIG — Arquitetura Revisada

> Documento de design para a reescrita modular do sistema de medição de força
> para testes de motores foguete do GFIG.

---

## Índice

1. [Visão Geral e Cenários](#1-visão-geral-e-cenários-de-uso)
2. [Responsabilidades por Camada](#2-responsabilidades-por-camada)
3. [Estrutura de Diretórios](#3-estrutura-de-diretórios)
4. [WebWorkers — Processamento Off-Thread](#4-webworkers--processamento-off-thread-cenário-c)
5. [Tela de Conexão e DetectorAmbiente](#5-tela-de-conexão-e-detectorambiente)
6. [Segurança da API](#6-segurança-da-api-api-key)
7. [Sistema de Análise de Motor](#7-sistema-de-análise-de-motor)
8. [Sistema de Relatórios e Exportação](#8-sistema-de-relatórios-e-exportação)
9. [O Pipeline de Processamento](#9-o-pipeline-de-processamento)
10. [Banco de Dados — SQLite ou MariaDB](#10-banco-de-dados--sqlite-padrão-ou-mariadb-opcional)
11. [Interfaces Centrais](#11-interfaces-centrais-typescript)
12. [Gateway Serial → WebSocket](#12-gateway-serial--websocket)
13. [Docker Compose](#13-docker-compose)
14. [Esquema do Banco de Dados](#14-esquema-do-banco-de-dados)
15. [Estratégia de Testes](#15-estratégia-de-testes)
16. [Roteiro de Migração](#16-roteiro-de-migração)
17. [Variáveis de Ambiente](#17-variáveis-de-ambiente)
18. [Diagramas de Fluxo](#18-diagrama-de-fluxo-por-cenário)
19. [Comandos de Desenvolvimento](#19-comandos-de-desenvolvimento)

---

## 1. Visão Geral e Cenários de Uso

| Cenário | Hardware | Processamento | Gateway | Frontend | Banco |
|---------|----------|---------------|---------|---------|-------|
| **A — TVBox Completo** | ESP32→USB→TVBox | No gateway (Node.js) | Node.js container | WebApp via Nginx | SQLite/MariaDB via API REST |
| **B — TVBox + Android** | ESP32→USB→TVBox | No gateway (Node.js) | Node.js container | App Android | SQLite/MariaDB via API REST |
| **C — Direto no PC** | ESP32→USB→PC | No WebWorker (browser) | Nenhum — WebSerial | WebApp local/GitHub Pages | IndexedDB |

**Princípio central:** firmware do ESP32 inalterado. Interface sempre recebe
`LeituraProcessada` — nunca bytes brutos. O módulo de análise e relatório opera
sobre sessões já gravadas, independente do cenário de coleta.

---

## 2. Responsabilidades por Camada

| Responsabilidade anterior (Python) | Novo responsável | Pacote |
|------------------------------------|-----------------|--------|
| Ler bytes da porta serial | Gateway | `pacotes/gateway` |
| Decodificar protocolo binário + CRC16 | Gateway / TrabalhadorSerial | `pacotes/protocolo` |
| Aplicar zona morta e arredondamento | Pipeline de processamento | `pacotes/processamento` |
| Calibrar força bruta → Newtons | Pipeline de processamento | `pacotes/processamento` |
| Detectar início/fim da queima | Pipeline de processamento | `pacotes/processamento` |
| Calcular impulso total | Pipeline de processamento | `pacotes/processamento` |
| **Classificar motor (letra + nome padronizado)** | **Analisador** | **`pacotes/analise`** |
| **Calcular RMS, desvio padrão, CV, t₁₀/t₉₀** | **Analisador** | **`pacotes/analise`** |
| **Classificar perfil de queima** | **ClassificadorPerfil** | **`pacotes/analise`** |
| **Detectar anomalias (CATO risk)** | **DetectorAnomalias** | **`pacotes/analise`** |
| **Gerar PDF, .eng, CSV, JSON** | **Gerador de relatório** | **`pacotes/relatorio`** |
| Servir arquivos estáticos | Nginx (container) | `pacotes/aplicacao` |
| Salvar leituras | API REST | `pacotes/api` |

---

## 3. Estrutura de Diretórios

```
balancaGFIG/
│
├── firmware/
│   ├── src/
│   │   ├── principal.cpp
│   │   ├── protocolo.h
│   │   └── sensores.h
│   └── platformio.ini
│
├── pacotes/
│   │
│   ├── protocolo/                       # Camada 1 — transporte de bytes
│   │   ├── src/
│   │   │   ├── tipos.ts
│   │   │   ├── codificador.ts
│   │   │   └── crc16.ts
│   │   ├── testes/
│   │   └── package.json
│   │
│   ├── processamento/                   # Camada 2 — aquisição em tempo real
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
│   │   └── package.json
│   │
│   ├── analise/                         # ★ Camada 3 — análise pós-teste
│   │   │                                # TypeScript puro — roda em browser ou Node
│   │   ├── src/
│   │   │   ├── tipos.ts                 # ResultadoAnalise, MetadadosMotor, Anomalia
│   │   │   ├── AnalisadorMotor.ts       # Métricas completas + classificação NAR
│   │   │   ├── ClassificadorNAR.ts      # Letra A–O + nome padronizado "B1.7"
│   │   │   ├── ClassificadorPerfil.ts   # ★ Progressiva/Regressiva/Neutra/Platô
│   │   │   ├── DetectorAnomalias.ts     # Oscilação, queima irregular, CATO risk
│   │   │   └── ComparadorSessoes.ts     # Sobreposição de múltiplos testes
│   │   ├── testes/
│   │   │   ├── AnalisadorMotor.teste.ts
│   │   │   ├── ClassificadorNAR.teste.ts
│   │   │   ├── ClassificadorPerfil.teste.ts
│   │   │   └── DetectorAnomalias.teste.ts
│   │   └── package.json
│   │
│   ├── relatorio/                       # ★ Camada 4 — documentos
│   │   ├── src/
│   │   │   ├── tipos.ts
│   │   │   ├── GeradorPDF.ts
│   │   │   ├── secoes/
│   │   │   │   ├── SecaoCapa.ts
│   │   │   │   ├── SecaoResumo.ts       # KPIs em destaque + nome "B1.7"
│   │   │   │   ├── SecaoGraficos.ts     # Curva + zoom + dF/dt + temperatura
│   │   │   │   ├── SecaoMetricas.ts     # Tabela completa incl. RMS, σ, CV, perfil
│   │   │   │   ├── SecaoDados.ts        # Tabela de leituras (opcional)
│   │   │   │   └── SecaoMetadados.ts    # Condições ambientais + teoria
│   │   │   ├── exportadores/
│   │   │   │   ├── ExportadorCSV.ts
│   │   │   │   ├── ExportadorJSON.ts
│   │   │   │   └── ExportadorENG.ts     # RASP .eng — OpenRocket/RASAero
│   │   │   └── graficos/
│   │   │       ├── GraficoCurvaEmpuxo.ts    # Curva completa
│   │   │       ├── GraficoZoomQueima.ts     # Zoom com t₁₀/t₉₀ marcados
│   │   │       ├── GraficoDerivedaForca.ts  # dF/dt — instabilidades
│   │   │       ├── GraficoTemperatura.ts
│   │   │       └── GraficoComparacao.ts
│   │   ├── testes/
│   │   └── package.json
│   │
│   ├── gateway/                         # Camada 5 — bridge serial→rede
│   │   ├── src/
│   │   │   ├── principal.ts
│   │   │   ├── PortaSerial.ts
│   │   │   ├── ServidorWebSocket.ts
│   │   │   └── ServidorBluetooth.ts
│   │   ├── testes/
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── api/                             # Camada 6 — persistência
│   │   ├── src/
│   │   │   ├── principal.ts
│   │   │   ├── autenticacao/
│   │   │   │   ├── ChaveAPI.ts
│   │   │   │   └── gerarChave.ts
│   │   │   ├── rotas/
│   │   │   │   ├── sessoes.ts
│   │   │   │   ├── leituras.ts
│   │   │   │   ├── metadados.ts
│   │   │   │   └── serial.ts
│   │   │   ├── bancoDados/
│   │   │   │   ├── esquema.sql
│   │   │   │   ├── BancoDados.ts
│   │   │   │   ├── ProvedorSQLite.ts
│   │   │   │   └── ProvedorMariaDB.ts
│   │   │   └── intermediarios/
│   │   │       └── cors.ts
│   │   ├── testes/
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   └── aplicacao/                       # Camada 7 — interface
│       ├── src/
│       │   ├── adaptadores/
│       │   │   ├── IFonteDados.ts
│       │   │   ├── FonteWebSocket.ts
│       │   │   ├── FonteWebSerial.ts
│       │   │   └── FonteBluetooth.ts
│       │   ├── trabalhadores/
│       │   │   ├── TrabalhadorSerial.ts
│       │   │   └── TrabalhadorSerial.worker.ts
│       │   ├── armazenamento/
│       │   │   ├── IArmazenamento.ts
│       │   │   ├── ArmazenamentoRemoto.ts
│       │   │   └── ArmazenamentoLocal.ts
│       │   ├── nucleo/
│       │   │   ├── BarramentoDados.ts
│       │   │   ├── GerenciadorSessao.ts
│       │   │   └── DetectorAmbiente.ts
│       │   ├── telas/
│       │   │   ├── TelaConexao.ts
│       │   │   ├── TelaMedicao.ts
│       │   │   ├── TelaSessoes.ts
│       │   │   └── TelaRelatorio.ts     # ★ análise + gráficos + exports
│       │   ├── interface/
│       │   │   ├── MedidorForca.ts
│       │   │   ├── GraficoEmpuxo.ts
│       │   │   ├── StatusConexao.ts
│       │   │   ├── PainelSessao.ts
│       │   │   └── PainelAnalise.ts
│       │   ├── principal.ts
│       │   └── index.html
│       ├── testes/
│       ├── ponta-a-ponta/
│       │   ├── telaConexao.spec.ts
│       │   ├── medicao.spec.ts
│       │   └── relatorio.spec.ts
│       ├── vite.config.ts
│       └── package.json
│
├── docker/
│   ├── docker-compose.yml
│   ├── docker-compose.mariadb.yml
│   ├── docker-compose.dev.yml
│   └── docker-compose.bt.yml
│
├── scripts/
│   ├── configurar-tvbox.sh
│   └── gravar-firmware.sh
│
├── package.json
└── LEIAME.md
```

---

## 4. WebWorkers — Processamento Off-Thread (Cenário C)

A 100 Hz a thread principal travaria visivelmente. O `TrabalhadorSerial` move
decodificação + pipeline para uma thread separada via transferência zero-cópia.

```typescript
// pacotes/aplicacao/src/trabalhadores/TrabalhadorSerial.worker.ts

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

---

## 5. Tela de Conexão e DetectorAmbiente

```
┌─────────────────────────────────────────────────────────┐
│  BalançaGFIG — Configurar Conexão                       │
│  Detecção automática...  ████████████░░  (em andamento) │
│                                                         │
│  ✅  TVBox detectado em 192.168.1.42                    │
│       ws://192.168.1.42:8765  ·  http://192.168.1.42:3000│
│                                                         │
│  ── ou escolha manualmente ──────────────────────────── │
│  ○  TVBox / Servidor remoto                             │
│     IP:  [192.168.1.42   ]  Porta: [8765]               │
│     Chave de API: [••••••••••••••]                      │
│  ○  ESP32 via WebSerial (ESP ligado neste PC)           │
│     Porta: [ /dev/ttyUSB0 — CP210x UART Bridge  ▼ ]    │
│  ○  Bluetooth (ESP via BLE)                             │
│              [ Conectar ]                               │
└─────────────────────────────────────────────────────────┘
```

A configuração é salva em `localStorage`. Quando acessado pelo GitHub Pages,
o usuário pode digitar o IP do TVBox para acessar a API remotamente.

---

## 6. Segurança da API (API Key)

Rotas de leitura são públicas; rotas de escrita/deleção exigem `x-chave-api`.
A chave é gerada uma vez no setup do TVBox e salva em `/dados/.chave-api`.

```typescript
// Registro das rotas com proteção seletiva
app.get('/sessoes',           listarSessoes);          // público
app.post('/sessoes',          { preHandler: verificarChaveAPI }, criarSessao);
app.delete('/sessoes/:id',    { preHandler: verificarChaveAPI }, excluirSessao);
app.post('/leituras',         { preHandler: verificarChaveAPI }, salvarLeituras);
```

---

## 7. Sistema de Análise de Motor

### 7.1 Diagnóstico do relatório atual — lacunas identificadas

O relatório HTML existente foi analisado e apresenta as seguintes lacunas em
relação ao que uma análise completa de motor foguete exige:

| Métrica | Relatório atual | Proposta |
|---------|----------------|---------|
| Força de pico (N) | ✅ 2.09 N | Manter |
| Impulso total (N·s) | ✅ 2.94 N·s | Manter |
| Tempo de queima (s) | ✅ 1.701 s | Manter |
| Força média durante queima | ✅ 1.73 N | Manter |
| Classificação NAR (letra) | ✅ B | Manter |
| **Nome padronizado "B1.7"** | ❌ Mostra só "B" | Adicionar (classe + força média arredondada) |
| **Perfil de queima** | ❌ Ausente | Adicionar: Progressivo/Regressivo/Neutro/Platô |
| **Força RMS durante queima** | ❌ Ausente | Adicionar |
| **Desvio padrão da força** | ❌ Ausente | Adicionar |
| **Coeficiente de variação (CV%)** | ❌ Ausente | Adicionar — uniformidade da queima |
| **t₁₀ / t₉₀** | ❌ Ausente | Adicionar — marcadores no gráfico |
| **Tempo de subida / descida** | ❌ Ausente | Adicionar |
| Isp | ⚠️ N/A (massa não informada) | Mostrar "aguardando massa" com instrução |
| **Detecção de anomalias** | ❌ Ausente | Adicionar alertas |
| **dF/dt (derivada)** | ❌ Ausente | Adicionar gráfico — instabilidades |
| **Exportação RASP .eng** | ❌ Ausente | Essencial para OpenRocket |
| Metadados (dimensões, massas) | ⚠️ Todos `---` | Formulário antes/após teste |

### 7.2 Tipos do sistema de análise

```typescript
// pacotes/analise/src/tipos.ts

import { LeituraProcessada } from '@balancagfig/processamento';

// Perfil de queima segundo comportamento da curva empuxo × tempo
export type PerfilQueima =
  | 'progressivo'    // força crescente durante a queima
  | 'regressivo'     // força decrescente durante a queima
  | 'neutro'         // força aproximadamente constante
  | 'neutro-plato'   // subida rápida → platô → queda rápida (mais comum)
  | 'complexo';      // múltiplos picos ou perfil não classificável

export interface MetadadosMotor {
  nomePropelente?:        string;  // ex: "KNSB", "KNSU", "APCP"
  massaPropelente_kg?:    number;  // para Isp — OBRIGATÓRIO para nome completo
  massaTotal_kg?:         number;
  diametroCarcaca_mm?:    number;  // para .eng e Ct
  comprimentoCarcaca_mm?: number;
  diametroGarganta_mm?:   number;  // para Ct
  temperaturaAmbiente_C?: number;
  umidadeRelativa_pct?:   number;
  pressaoAtm_kPa?:        number;
  operador?:              string;
  observacoes?:           string;
}

export interface ResultadoAnalise {
  metadados:             MetadadosMotor;

  // Janela de queima
  inicioQueima_ms:       number;
  fimQueima_ms:          number;
  tempoQueima_s:         number;

  // Métricas padronizadas de tempo (% da força máxima)
  t10_s:                 number;   // instante em que força atinge 10% do pico
  t90_s:                 number;   // instante em que força atinge 90% do pico
  tempoSubida_s:         number;   // t10 → t90
  tempoDescida_s:        number;   // t90 → t10 (fase final)

  // Métricas de força
  forcaPico_N:           number;
  forcaMedia_N:          number;   // média aritmética durante queima
  forcaRMS_N:            number;   // √(Σ F²/n) — raiz quadrática média
  desvioPadrao_N:        number;   // σ amostral durante queima
  coeficienteVariacao:   number;   // CV = σ/média — uniformidade (0..1)

  // Impulso
  impulsoTotal_Ns:       number;
  impulsoEspecifico_s?:  number;   // Isp — disponível se massaPropelente informada

  // Classificação NAR
  letraMotor:            string;   // 'A'–'O'
  nomeComum:             string;   // "B1.7" — letra + força média em N arredondada

  // Perfil de queima
  perfilQueima:          PerfilQueima;
  descricaoPerfil:       string;   // texto legível para o relatório

  // Coeficiente de empuxo (requer diâmetro da garganta)
  coeficienteEmpuxo?:    number;

  // Anomalias
  anomalias:             Anomalia[];
}

export interface Anomalia {
  tipo:        'OSCILACAO' | 'PICO_PRESSAO' | 'QUEIMA_IRREGULAR' | 'FALHA_IGNICAO';
  gravidade:   'AVISO' | 'CRITICO';
  instante_ms: number;
  descricao:   string;
}
```

### 7.3 ClassificadorNAR — letra e nome padronizado

```typescript
// pacotes/analise/src/ClassificadorNAR.ts

const FAIXAS_NAR = [
  { letra: '1/8A', minNs: 0.000,  maxNs: 0.3125 },
  { letra: '1/4A', minNs: 0.313,  maxNs: 0.625  },
  { letra: '1/2A', minNs: 0.626,  maxNs: 1.25   },
  { letra: 'A',    minNs: 1.251,  maxNs: 2.50   },
  { letra: 'B',    minNs: 2.501,  maxNs: 5.00   },
  { letra: 'C',    minNs: 5.001,  maxNs: 10.0   },
  { letra: 'D',    minNs: 10.01,  maxNs: 20.0   },
  { letra: 'E',    minNs: 20.01,  maxNs: 40.0   },
  { letra: 'F',    minNs: 40.01,  maxNs: 80.0   },
  { letra: 'G',    minNs: 80.01,  maxNs: 160.0  },
  { letra: 'H',    minNs: 160.1,  maxNs: 320.0  },
  { letra: 'I',    minNs: 320.1,  maxNs: 640.0  },
  { letra: 'J',    minNs: 640.1,  maxNs: 1280.0 },
  { letra: 'K',    minNs: 1280.,  maxNs: 2560.0 },
  { letra: 'L',    minNs: 2560.,  maxNs: 5120.0 },
  { letra: 'M',    minNs: 5120.,  maxNs: 10240. },
  { letra: 'N',    minNs: 10240,  maxNs: 20480. },
  { letra: 'O',    minNs: 20480,  maxNs: 40960. },
];

export function classificarMotor(impulsoTotal_Ns: number, forcaMedia_N: number): {
  letra:     string;
  nomeComum: string;
} {
  const faixa = FAIXAS_NAR.find(
    (f) => impulsoTotal_Ns >= f.minNs && impulsoTotal_Ns <= f.maxNs,
  ) ?? { letra: '?', minNs: 0, maxNs: 0 };

  // Convenção NAR: nome = letra + força média em N com 1 casa decimal
  // Ex: B1.7 → classe B, força média 1.7 N
  // Não arredonda para decena como nos motores comerciais grandes — para
  // motores experimentais pequenos a casa decimal é informativa.
  const forcaArredondada = Math.round(forcaMedia_N * 10) / 10;
  const nomeComum = `${faixa.letra}${forcaArredondada}`;

  return { letra: faixa.letra, nomeComum };
}
```

### 7.4 ClassificadorPerfil — perfil de queima

```typescript
// pacotes/analise/src/ClassificadorPerfil.ts

import { LeituraProcessada } from '@balancagfig/processamento';
import { PerfilQueima }       from './tipos';

export class ClassificadorPerfil {
  /**
   * Classifica o perfil de queima com base na tendência da curva empuxo × tempo.
   *
   * Método: divide a janela de queima em 3 terços (início, meio, fim).
   * Compara a força média de cada terço para determinar a tendência.
   */
  classificar(emQueima: LeituraProcessada[]): {
    perfil:    PerfilQueima;
    descricao: string;
  } {
    if (emQueima.length < 9) return { perfil: 'complexo', descricao: 'Amostra insuficiente' };

    const n       = emQueima.length;
    const terco   = Math.floor(n / 3);
    const inicio  = this.media(emQueima.slice(0, terco));
    const meio    = this.media(emQueima.slice(terco, 2 * terco));
    const fim     = this.media(emQueima.slice(2 * terco));
    const media   = this.media(emQueima);
    const LIMIAR  = 0.10;   // 10% de variação relativa

    const subeInicio = (meio - inicio) / media > LIMIAR;
    const desceFim   = (meio - fim)   / media > LIMIAR;
    const sobe       = (fim  - inicio) / media > LIMIAR;
    const desce      = (inicio - fim)  / media > LIMIAR;

    if (subeInicio && desceFim) return {
      perfil: 'neutro-plato',
      descricao: 'Subida rápida, platô central, queda abrupta — perfil típico KNSB/KNSU',
    };
    if (sobe) return {
      perfil: 'progressivo',
      descricao: 'Empuxo crescente — propelente com maior área de queima no final',
    };
    if (desce) return {
      perfil: 'regressivo',
      descricao: 'Empuxo decrescente — propelente com maior área de queima no início',
    };

    return {
      perfil: 'neutro',
      descricao: 'Empuxo aproximadamente constante — queima uniforme',
    };
  }

  private media(leituras: LeituraProcessada[]): number {
    return leituras.reduce((s, l) => s + l.forcaNewton, 0) / leituras.length;
  }
}
```

### 7.5 AnalisadorMotor — métricas completas

```typescript
// pacotes/analise/src/AnalisadorMotor.ts

import { LeituraProcessada }  from '@balancagfig/processamento';
import { MetadadosMotor, ResultadoAnalise } from './tipos';
import { classificarMotor }   from './ClassificadorNAR';
import { ClassificadorPerfil } from './ClassificadorPerfil';
import { DetectorAnomalias }  from './DetectorAnomalias';

const G0 = 9.80665;

export class AnalisadorMotor {
  private classificadorPerfil = new ClassificadorPerfil();

  analisar(leituras: LeituraProcessada[], metadados: MetadadosMotor = {}): ResultadoAnalise {
    const emQueima = leituras.filter((l) => l.emQueima);
    if (emQueima.length === 0) throw new Error('Nenhuma leitura de queima encontrada');

    const inicioQueima_ms = emQueima[0].marcaTemporal;
    const fimQueima_ms    = emQueima[emQueima.length - 1].marcaTemporal;
    const tempoQueima_s   = (fimQueima_ms - inicioQueima_ms) / 1000;

    const forcas    = emQueima.map((l) => l.forcaNewton);
    const forcaPico = Math.max(...forcas);
    const n         = forcas.length;

    // Métricas de força
    const forcaMedia_N    = forcas.reduce((s, f) => s + f, 0) / n;
    const forcaRMS_N      = Math.sqrt(forcas.reduce((s, f) => s + f * f, 0) / n);
    const desvioPadrao_N  = Math.sqrt(
      forcas.reduce((s, f) => s + (f - forcaMedia_N) ** 2, 0) / (n - 1),
    );
    const coeficienteVariacao = desvioPadrao_N / forcaMedia_N;

    // t₁₀ / t₉₀
    const t10_s       = this.tempoNoLimiar(emQueima, forcaPico * 0.10, 'subida');
    const t90_s       = this.tempoNoLimiar(emQueima, forcaPico * 0.90, 'subida');
    const t90fim_s    = this.tempoNoLimiar(emQueima, forcaPico * 0.90, 'descida');
    const t10fim_s    = this.tempoNoLimiar(emQueima, forcaPico * 0.10, 'descida');
    const tempoSubida_s  = t90_s - t10_s;
    const tempoDescida_s = t10fim_s - t90fim_s;

    // Impulso e Isp
    const impulsoTotal_Ns     = emQueima[n - 1].impulsoAcumuladoNs;
    const impulsoEspecifico_s = metadados.massaPropelente_kg
      ? impulsoTotal_Ns / (metadados.massaPropelente_kg * G0)
      : undefined;

    // Coeficiente de empuxo
    const coeficienteEmpuxo = metadados.diametroGarganta_mm
      ? this.calcularCt(forcaMedia_N, metadados.diametroGarganta_mm)
      : undefined;

    // Classificação NAR — nome "B1.7" (letra + força média com 1 decimal)
    const { letra: letraMotor, nomeComum } = classificarMotor(impulsoTotal_Ns, forcaMedia_N);

    // Perfil de queima
    const { perfil: perfilQueima, descricao: descricaoPerfil } =
      this.classificadorPerfil.classificar(emQueima);

    // Anomalias
    const anomalias = new DetectorAnomalias().detectar(leituras, forcaPico);

    return {
      metadados, inicioQueima_ms, fimQueima_ms, tempoQueima_s,
      t10_s, t90_s, tempoSubida_s, tempoDescida_s,
      forcaPico_N: forcaPico, forcaMedia_N, forcaRMS_N,
      desvioPadrao_N, coeficienteVariacao,
      impulsoTotal_Ns, impulsoEspecifico_s, coeficienteEmpuxo,
      letraMotor, nomeComum,
      perfilQueima, descricaoPerfil,
      anomalias,
    };
  }

  private tempoNoLimiar(l: LeituraProcessada[], limiar: number, dir: 'subida'|'descida') {
    const lista = dir === 'descida' ? [...l].reverse() : l;
    return (lista.find((r) => r.forcaNewton >= limiar)?.marcaTemporal ?? 0) / 1000;
  }

  private calcularCt(forcaMedia_N: number, diametro_mm: number): number {
    const r = (diametro_mm / 1000) / 2;
    const A = Math.PI * r ** 2;
    return forcaMedia_N / (3_500_000 * A);   // ~3.5 MPa pressão típica KNSB
  }
}
```

### 7.6 DetectorAnomalias

```typescript
// pacotes/analise/src/DetectorAnomalias.ts

export class DetectorAnomalias {
  detectar(leituras: LeituraProcessada[], forcaPico_N: number): Anomalia[] {
    const anomalias: Anomalia[] = [];
    const emQueima  = leituras.filter((l) => l.emQueima);
    const forcaMedia = emQueima.reduce((s, l) => s + l.forcaNewton, 0) / (emQueima.length || 1);

    // Oscilação abrupta (> 30% da média em amostras consecutivas)
    for (let i = 1; i < emQueima.length - 1; i++) {
      const delta = Math.abs(emQueima[i].forcaNewton - emQueima[i - 1].forcaNewton);
      if (delta > forcaMedia * 0.30) {
        anomalias.push({
          tipo: 'OSCILACAO',
          gravidade: delta > forcaMedia * 0.60 ? 'CRITICO' : 'AVISO',
          instante_ms: emQueima[i].marcaTemporal,
          descricao: `Variação de ${delta.toFixed(1)} N (${((delta/forcaMedia)*100).toFixed(0)}% da média)`,
        });
      }
    }

    // Queima irregular (CV > 20%)
    const sigma = Math.sqrt(
      emQueima.reduce((s, l) => s + (l.forcaNewton - forcaMedia) ** 2, 0) / (emQueima.length || 1)
    );
    const cv = sigma / forcaMedia;
    if (cv > 0.20) anomalias.push({
      tipo: 'QUEIMA_IRREGULAR',
      gravidade: 'AVISO',
      instante_ms: emQueima[0]?.marcaTemporal ?? 0,
      descricao: `CV = ${(cv * 100).toFixed(1)}% — queima instável (limite: 20%)`,
    });

    // Ignição tardia (> 2 s desde o início da sessão)
    const primeira = leituras[0];
    const ignicao  = leituras.find((l) => l.emQueima);
    if (primeira && ignicao) {
      const atraso = ignicao.marcaTemporal - primeira.marcaTemporal;
      if (atraso > 2000) anomalias.push({
        tipo: 'FALHA_IGNICAO',
        gravidade: 'AVISO',
        instante_ms: primeira.marcaTemporal,
        descricao: `Ignição com ${(atraso / 1000).toFixed(1)} s de atraso`,
      });
    }

    return anomalias;
  }
}
```

---

## 8. Sistema de Relatórios e Exportação

### 8.1 Estrutura do PDF — melhorada em relação ao atual

O relatório atual é HTML/print. A reescrita mantém essa abordagem (sem dependência
de servidor) com estrutura mais clara e as métricas faltantes adicionadas.

```
┌─────────────────────────────────────────────────────────┐
│  PÁG 1 — CAPA                                           │
│  Logo GFIG · IFSC · Fernanda 1.11 · 11/05/2025         │
│  Número do teste: GFIG-2025-001                         │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│  PÁG 2 — RESUMO EXECUTIVO                               │
│                                                         │
│  ┌──────┐  ┌────────┐  ┌────────┐  ┌──────────────┐   │
│  │ B1.7 │  │2.94 Ns │  │ 1.70 s │  │ 2.09 N pico  │   │
│  │CLASSE│  │IMPULSO │  │QUEIMA  │  │  FORÇA       │   │
│  └──────┘  └────────┘  └────────┘  └──────────────┘   │
│                                                         │
│  Força média: 1.73 N  ·  RMS: 1.74 N                   │
│  Desvio padrão: 0.18 N  ·  CV: 10.4% — queima uniforme │
│  Perfil: Neutro-platô (típico KNSB/KNSU)               │
│  t₁₀→t₉₀: 0.07 s  ·  t₉₀→t₁₀: 0.21 s                 │
│  Isp: aguardando massa do propelente                    │
│                                                         │
│  ✅ Sem anomalias detectadas                            │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│  PÁG 3 — GRÁFICOS                                       │
│  [Gráfico 1] Curva empuxo × tempo (sessão completa)     │
│              região de queima destacada                  │
│  [Gráfico 2] Zoom na janela de queima                   │
│              com t₁₀ e t₉₀ marcados                     │
│  [Gráfico 3] dF/dt × tempo — instabilidades             │
│  [Gráfico 4] Temperatura × tempo                        │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│  PÁG 4 — MÉTRICAS COMPLETAS                             │
│  Tabela com todas as métricas + incertezas              │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│  PÁG 5 — DADOS BRUTOS (opcional)                        │
│  Tabela de leituras com t(s), F(N), F(gf), F(kgf)       │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│  PÁG 6 — METADADOS, CONDIÇÕES E FUNDAMENTAÇÃO          │
│  Dimensões motor · Propelente · Condições ambientais    │
│  Método dos trapézios · Incertezas · Refs bibliográficas│
└─────────────────────────────────────────────────────────┘
```

### 8.2 Tabela de métricas completa (SecaoMetricas)

A tabela de métricas da página 4 deve incluir TODOS os campos — inclusive
os que o relatório atual omite:

```typescript
// pacotes/relatorio/src/secoes/SecaoMetricas.ts  (trecho)

const linhasMetricas = [
  // Identificação
  ['Nome do motor (NAR)',    analise.nomeComum,          '—',   'Letra + F̄ em N'],
  ['Classe NAR/TRA',         analise.letraMotor,          '—',   'Progressão log₂'],
  ['Perfil de queima',       analise.descricaoPerfil,     '—',   analise.perfilQueima],

  // Impulso
  ['Impulso total',          fmt(analise.impulsoTotal_Ns),  'N·s', 'Método dos trapézios'],
  ['Impulso específico (Isp)', analise.impulsoEspecifico_s
    ? fmt(analise.impulsoEspecifico_s)
    : 'Aguardando massa do propelente',                  's',   'I/(m_prop × g₀)'],

  // Força
  ['Força máxima',           fmt(analise.forcaPico_N),     'N',   'max{F(t)}'],
  ['Força média (queima)',    fmt(analise.forcaMedia_N),    'N',   'Ī = I/Δt'],
  ['Força RMS (queima)',      fmt(analise.forcaRMS_N),      'N',   '√(ΣF²/n)'],
  ['Desvio padrão (queima)', fmt(analise.desvioPadrao_N),  'N',   'σ amostral'],
  ['Coef. de variação',      pct(analise.coeficienteVariacao), '%', 'CV = σ/F̄'],

  // Tempo
  ['Tempo de queima',        fmt(analise.tempoQueima_s),   's',   'burnout − ignição'],
  ['Tempo de subida (t₁₀→t₉₀)', fmt(analise.tempoSubida_s), 's', '10%→90% do pico'],
  ['Tempo de descida (t₉₀→t₁₀)', fmt(analise.tempoDescida_s), 's', '90%→10% do pico'],
];
```

### 8.3 Exportador RASP .eng — OpenRocket / RASAero

```typescript
// pacotes/relatorio/src/exportadores/ExportadorENG.ts

export class ExportadorENG {
  exportar(sessao: SessaoTeste, leituras: LeituraProcessada[], analise: ResultadoAnalise): string {
    const meta  = analise.metadados;
    const nome  = analise.nomeComum.replace(/\s/g, '');
    const diam  = meta.diametroCarcaca_mm  ?? 0;
    const comp  = meta.comprimentoCarcaca_mm ?? 0;
    const mProp = meta.massaPropelente_kg ?? 0;
    const mTot  = meta.massaTotal_kg ?? 0;

    const linhasComentario = [
      `; ${sessao.nome} — ${analise.nomeComum}`,
      `; Gerado por BalancaGFIG — GFIG/IFSC Campus Gaspar`,
      `; Data: ${sessao.criadoEm}`,
      `; Impulso total: ${analise.impulsoTotal_Ns.toFixed(3)} N·s`,
      `; Tempo de queima: ${analise.tempoQueima_s.toFixed(3)} s`,
      `; Força máxima: ${analise.forcaPico_N.toFixed(2)} N`,
      `; Força média: ${analise.forcaMedia_N.toFixed(2)} N`,
      `; Perfil: ${analise.perfilQueima}`,
      ...(analise.impulsoEspecifico_s
        ? [`; Isp: ${analise.impulsoEspecifico_s.toFixed(1)} s`]
        : ['; Isp: massa do propelente não informada']),
      ...(meta.nomePropelente ? [`; Propelente: ${meta.nomePropelente}`] : []),
      ...(analise.anomalias.length > 0
        ? [`; ATENÇÃO: ${analise.anomalias.length} anomalia(s) detectada(s)`]
        : []),
      '',
      `${nome} ${diam} ${comp} P ${mProp.toFixed(4)} ${mTot.toFixed(4)} GFIG`,
    ];

    // Pontos da janela de queima normalizados para t=0
    const emQueima = leituras.filter((l) => l.emQueima);
    const t0       = emQueima[0]?.marcaTemporal ?? 0;
    const pontos   = emQueima.map((l) => {
      const t = ((l.marcaTemporal - t0) / 1000).toFixed(4).padStart(8);
      const f = l.forcaNewton.toFixed(3).padStart(10);
      return `${t} ${f}`;
    });

    const tFinal   = ((analise.fimQueima_ms - t0) / 1000 + 0.001).toFixed(4).padStart(8);
    const pontoFinal = `${tFinal}      0.000`;

    return [...linhasComentario, ...pontos, pontoFinal, ';'].join('\n');
  }
}
```

**Exemplo de saída para o teste "Fernanda 1.11":**
```
; Fernanda 1.11 — B1.7
; Gerado por BalancaGFIG — GFIG/IFSC Campus Gaspar
; Data: 2026-05-11T17:59:39
; Impulso total: 2.940 N·s
; Tempo de queima: 1.701 s
; Força máxima: 2.09 N
; Força média: 1.73 N
; Perfil: neutro-plato
; Isp: massa do propelente não informada

B1.7 0 0 P 0.0000 0.0000 GFIG
  0.0000      0.314
  0.0100      0.367
  ...
  1.7010      0.527
  1.7020      0.000
;
```

### 8.4 ExportadorCSV — melhorado

Mantém compatibilidade com o existente mas adiciona as novas colunas e
usa ponto-e-vírgula como separador padrão (compatibilidade com Excel BR/PT).

```typescript
exportar(sessao, leituras, analise, separador = ';'): string {
  const cab = [
    `# BalançaGFIG — GFIG/IFSC Campus Gaspar`,
    `# Sessão${separador}${sessao.nome}`,
    `# Motor${separador}${analise.nomeComum}`,
    `# Perfil${separador}${analise.perfilQueima}`,
    `# Impulso Total (N·s)${separador}${analise.impulsoTotal_Ns.toFixed(3)}`,
    `# Força Máxima (N)${separador}${analise.forcaPico_N.toFixed(3)}`,
    `# Força Média (N)${separador}${analise.forcaMedia_N.toFixed(3)}`,
    `# Força RMS (N)${separador}${analise.forcaRMS_N.toFixed(3)}`,
    `# Desvio Padrão (N)${separador}${analise.desvioPadrao_N.toFixed(3)}`,
    `# CV (%)${separador}${(analise.coeficienteVariacao * 100).toFixed(1)}`,
    `# Tempo Queima (s)${separador}${analise.tempoQueima_s.toFixed(4)}`,
    `#`,
    ['marcaTemporal_ms', 'forcaNewton_N', 'forcaGf', 'forcaKgf',
     'temperatura_C', 'emQueima', 'impulsoAcumulado_Ns'].join(separador),
  ];
  const linhas = leituras.map((l) => [
    l.marcaTemporal,
    l.forcaNewton.toFixed(4),
    (l.forcaNewton * 101.972).toFixed(3),   // gf
    (l.forcaNewton * 0.101972).toFixed(5),  // kgf
    l.temperatura.toFixed(2),
    l.emQueima ? '1' : '0',
    l.impulsoAcumuladoNs.toFixed(4),
  ].join(separador));
  return [...cab, ...linhas].join('\n');
}
```

### 8.5 Formulário de metadados — resolver o problema dos `---`

O relatório atual mostra todos os metadados como `---`. Isso precisa ser
resolvido com um formulário que aparece antes de gravar a sessão.

```
┌─────────────────────────────────────────────────────────┐
│  Metadados do Teste (opcional, melhora o relatório)     │
├─────────────────────────────────────────────────────────┤
│  Nome do propelente: [KNSB          ]                   │
│  Massa propelente:   [____] g  ← preencha para Isp      │
│  Massa total:        [____] g                           │
│  Diâmetro carcaça:   [____] mm  ← preencha para .eng    │
│  Comp. carcaça:      [____] mm                          │
│  Diâm. garganta:     [____] mm  ← preencha para Ct      │
│  ─────────────────────────────────────────────────────  │
│  Temperatura:        [____] °C                          │
│  Umidade relativa:   [____] %                           │
│  Pressão atm.:       [____] kPa                         │
│  Operador:           [____________________]             │
│                                                         │
│  ℹ️  Sem esses dados, Isp e exportação .eng são parciais │
│                    [ Salvar ]  [ Pular ]                 │
└─────────────────────────────────────────────────────────┘
```

### 8.6 Fluxo completo da TelaRelatorio

```
Usuário abre TelaSessoes → seleciona sessão → clica "Analisar"

TelaRelatorio:
  1. Busca leituras do armazenamento
  2. AnalisadorMotor.analisar(leituras, metadados)
     → forcaPico, forcaMedia, forcaRMS, desvioPadrao, CV
     → letraMotor, nomeComum ("B1.7")
     → perfilQueima, descricaoPerfil
     → t₁₀, t₉₀, tempoSubida, tempoDescida
     → impulsoTotal, impulsoEspecifico (se massa disponível)
     → anomalias
  3. Exibe PainelAnalise com métricas + alertas
  4. Exibe gráficos interativos (Chart.js)

Botões de exportação:
  [ Gerar PDF ]      → GeradorPDF.gerar() → download .pdf
  [ Exportar CSV ]   → ExportadorCSV.exportar() → download .csv
  [ Exportar JSON ]  → ExportadorJSON.exportar() → download .json
  [ Exportar .eng ]  → ExportadorENG.exportar() → download .eng
  [ Comparar ]       → seletor de sessões → GraficoComparacao
```

---

## 9. O Pipeline de Processamento

```typescript
// pacotes/processamento/src/pipeline/PipelineProcessamento.ts

export class PipelineProcessamento {
  processar(pacote: PacoteDados): LeituraProcessada {
    let forca = this.calibrador.aplicar(pacote.forcaBruta);
    forca     = this.zonaMorta.aplicar(forca);
    forca     = this.mediaMovel.aplicar(forca);
    return {
      marcaTemporal:      pacote.marcaTemporal,
      forcaNewton:        forca,
      temperatura:        pacote.temperatura,
      emQueima:           this.detector.atualizar(forca, pacote.marcaTemporal),
      impulsoAcumuladoNs: this.calculador.integrar(forca, pacote.marcaTemporal),
    };
  }
  reiniciar() { /* ... */ }
}
```

**Cenários A/B — no gateway** antes do WebSocket.
**Cenário C — no WebWorker** no browser.

---

## 10. Banco de Dados — SQLite (padrão) ou MariaDB (opcional)

```typescript
// ProvedorSQLite — configurações de resiliência
this.db.pragma('journal_mode = WAL');    // escritas atômicas → sobrevive a quedas de energia
this.db.pragma('foreign_keys = ON');
this.db.pragma('synchronous = NORMAL'); // equilíbrio desempenho/segurança com WAL
```

Troca para MariaDB: apenas `PROVEDOR_BANCO=mariadb` + `docker-compose.mariadb.yml`.

---

## 11. Interfaces Centrais (TypeScript)

```typescript
// IFonteDados — todas as fontes emitem LeituraProcessada, nunca PacoteDados
export interface IFonteDados extends EventTarget {
  conectar(opcoes?: unknown): Promise<void>;
  desconectar(): Promise<void>;
  enviarComando(cmd: PacoteComando): Promise<void>;
  obterStatus(): StatusConexao;
  // 'dados'  → CustomEvent<LeituraProcessada>
  // 'status' → CustomEvent<StatusConexao>
  // 'erro'   → CustomEvent<Error>
}

// IArmazenamento — recebe e devolve LeituraProcessada
export interface IArmazenamento {
  criarSessao(s: Omit<SessaoTeste, 'id'>): Promise<SessaoTeste>;
  listarSessoes(): Promise<SessaoTeste[]>;
  excluirSessao(id: string): Promise<void>;
  salvarMetadados(idSessao: string, meta: MetadadosMotor): Promise<void>;
  obterMetadados(idSessao: string): Promise<MetadadosMotor | null>;
  adicionarLeituras(idSessao: string, l: LeituraProcessada[]): Promise<void>;
  obterLeituras(idSessao: string): Promise<LeituraProcessada[]>;
  exportarCSV(idSessao: string): Promise<string>;
}
```

---

## 12. Gateway Serial → WebSocket

```typescript
// pacotes/gateway/src/ServidorWebSocket.ts

this.pipeline = new PipelineProcessamento({
  limiarZonaMortaN: Number(process.env.LIMIAR_ZONA_MORTA  ?? 0.5),
  janelaMediaMovel: Number(process.env.JANELA_MEDIA_MOVEL ?? 5),
  fatorCalibracao:  Number(process.env.FATOR_CALIBRACAO   ?? 1.0),
  deslocamentoTara: Number(process.env.DESLOCAMENTO_TARA  ?? 0),
});

this.porta.on('pacote', (pacote: PacoteDados) => {
  const leitura = this.pipeline.processar(pacote);
  this.difundir(leitura);   // cliente recebe LeituraProcessada
});
```

---

## 13. Docker Compose

### 13.1 Cenário A — SQLite (padrão)

```yaml
name: balanca-gfig

services:
  gateway:
    build: { context: ../pacotes/gateway }
    restart: unless-stopped
    devices: [/dev/ttyUSB0:/dev/ttyUSB0]
    environment:
      PORTA_SERIAL: /dev/ttyUSB0
      BAUD_SERIAL: 115200
      PORTA_WEBSOCKET: 8765
      LIMIAR_ZONA_MORTA: 0.5
      JANELA_MEDIA_MOVEL: 5
      FATOR_CALIBRACAO: 1.0
      DESLOCAMENTO_TARA: 0
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
      PROVEDOR_BANCO: sqlite
      CAMINHO_BANCO: /dados/balanca.db
      CAMINHO_CHAVE_API: /dados/.chave-api
      PORTA_HTTP: 3000
      ORIGEM_CORS: "*"
    volumes: [dados_banco:/dados]
    ports: ["3000:3000"]
    networks: [rede-gfig]
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/saude"]
      interval: 10s
      retries: 5

  aplicacao:
    build: { context: ../pacotes/aplicacao }
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

### 13.2 Cenário A — MariaDB (override)

```yaml
# docker compose -f docker-compose.yml -f docker-compose.mariadb.yml up

services:
  mariadb:
    image: mariadb:11-jammy
    environment:
      MARIADB_ROOT_PASSWORD: ${SENHA_ROOT_DB}
      MARIADB_DATABASE: balanca_gfig
      MARIADB_USER: balanca
      MARIADB_PASSWORD: ${SENHA_DB}
    volumes: [dados_mariadb:/var/lib/mysql]
    networks: [rede-gfig]
    healthcheck:
      test: ["CMD", "healthcheck.sh", "--connect"]
      interval: 10s
      retries: 10

  api:
    environment:
      PROVEDOR_BANCO: mariadb
      DB_HOST: mariadb
      DB_USUARIO: balanca
      DB_SENHA: ${SENHA_DB}
      DB_NOME: balanca_gfig
    depends_on:
      mariadb: { condition: service_healthy }

volumes:
  dados_mariadb:
```

---

## 14. Esquema do Banco de Dados

```sql
CREATE TABLE IF NOT EXISTS sessoes (
  id                TEXT PRIMARY KEY,
  nome              TEXT NOT NULL,
  id_motor          TEXT,
  criado_em         TEXT NOT NULL DEFAULT (datetime('now')),
  duracao_ms        INTEGER NOT NULL DEFAULT 0,
  forca_maxima_n    REAL    NOT NULL DEFAULT 0,
  impulso_total_ns  REAL    NOT NULL DEFAULT 0,
  observacoes       TEXT
);

-- Metadados do motor (preenchidos pelo operador)
CREATE TABLE IF NOT EXISTS metadados_motor (
  id_sessao               TEXT PRIMARY KEY REFERENCES sessoes(id) ON DELETE CASCADE,
  nome_propelente         TEXT,
  massa_propelente_kg     REAL,
  massa_total_kg          REAL,
  diametro_carcaca_mm     REAL,
  comprimento_carcaca_mm  REAL,
  diametro_garganta_mm    REAL,
  temperatura_ambiente_c  REAL,
  umidade_relativa_pct    REAL,
  pressao_atm_kpa         REAL,
  operador                TEXT,
  observacoes             TEXT
);

-- Leituras já processadas (forca_newton, não forca_bruta)
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

## 15. Estratégia de Testes

### 15.1 Pirâmide

```
  ┌──────────────────────────────────┐
  │   Ponta-a-ponta (Playwright)      │  5%
  ├──────────────────────────────────┤
  │         Integração                │  25%
  ├──────────────────────────────────┤
  │          Unitários                │  70%
  └──────────────────────────────────┘
```

### 15.2 Exemplos — foco nas métricas novas

**Unitário — ClassificadorPerfil:**
```typescript
it('identifica perfil neutro-platô (típico KNSB)', () => {
  // leituras simulando subida rápida → platô → queda
  const emQueima = [
    ...Array.from({ length: 10 }, (_, i) => leitura(i * 0.07 * 2.09)),  // subida
    ...Array.from({ length: 50 }, () => leitura(2.05)),                  // platô
    ...Array.from({ length: 10 }, (_, i) => leitura(2.09 - i * 0.2)),   // queda
  ];
  const resultado = new ClassificadorPerfil().classificar(emQueima);
  expect(resultado.perfil).toBe('neutro-plato');
});
```

**Unitário — AnalisadorMotor métricas novas:**
```typescript
it('calcula RMS, desvio padrão e CV corretamente', () => {
  const analise = analisador.analisar(leiturasFernanda1_11, {});
  // CV = σ/média — para queima uniforme deve ser < 20%
  expect(analise.coeficienteVariacao).toBeLessThan(0.20);
  expect(analise.forcaRMS_N).toBeGreaterThanOrEqual(analise.forcaMedia_N);
  expect(analise.nomeComum).toMatch(/^B\d+\.\d$/);  // "B1.7" format
});

it('nome padronizado segue convenção letra + 1 decimal', () => {
  const { nomeComum } = classificarMotor(2.94, 1.73);
  expect(nomeComum).toBe('B1.7');
});
```

**Unitário — ExportadorENG:**
```typescript
it('gera .eng válido para OpenRocket com cabeçalho correto', () => {
  const saida = exportador.exportar(sessao, leituras, analise);
  const cabecalhoMotor = saida.split('\n').find((l) => !l.startsWith(';') && l.trim());
  const partes = cabecalhoMotor!.split(/\s+/);
  expect(partes[0]).toBe('B1.7');   // nome
  expect(saida).toMatch(/\s+0\.000$/m);  // ponto final com força zero
  expect(saida).toContain('GFIG');  // fabricante
});
```

**Ponta-a-ponta — relatório:**
```typescript
test('exibe nome padronizado B1.7 no resumo executivo', async ({ page }) => {
  await page.goto(`/sessoes/${sessaoFixtura.id}`);
  await expect(page.getByTestId('nome-motor')).toHaveText(/^B\d+\.\d$/);
  await expect(page.getByTestId('perfil-queima')).not.toBeEmpty();
});

test('download .eng contém cabeçalho RASP válido', async ({ page }) => {
  await page.goto(`/sessoes/${sessaoFixtura.id}`);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /\.eng/i }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.eng$/);
});
```

---

## 16. Roteiro de Migração

| Fase | O que fazer | Impacto |
|------|-------------|---------|
| **1** | Extrair `pacotes/protocolo` — codec CRC16 | Nenhum |
| **2** | Extrair `pacotes/processamento` — filtros + calibração do Python | Nenhum |
| **3** | Criar `pacotes/analise` — AnalisadorMotor com RMS/σ/CV/perfil/t₁₀/t₉₀ | Nenhum |
| **4** | Criar `pacotes/relatorio` — PDF + .eng + CSV + JSON | Nenhum |
| **5** | Reescrever gateway Node.js + pipeline | Substitui Python serial |
| **6** | Criar `pacotes/api` SQLite+WAL + metadados + auth | Substitui Python HTTP |
| **7** | Portar WebApp: TelaConexao + TelaMedicao + FonteWebSocket | UI migrada |
| **8** | Integrar TelaRelatorio com todos os exportadores | Funcionalidade completa |
| **9** | Formulário de metadados (resolver problema dos `---`) | Habilita Isp e .eng |
| **10** | Implementar TrabalhadorSerial + FonteWebSerial | Habilita Cenário C |
| **11** | Implementar FonteBluetooth + gateway BLE | Habilita Cenário B |
| **12** | Testes ponta-a-ponta (conexão, medição, relatório, exportação) | Valida tudo |

---

## 17. Variáveis de Ambiente

| Serviço | Variável | Padrão | Descrição |
|---------|---------|--------|-----------|
| gateway | `PORTA_SERIAL` | `/dev/ttyUSB0` | Porta serial do ESP32 |
| gateway | `BAUD_SERIAL` | `115200` | Velocidade serial |
| gateway | `PORTA_WEBSOCKET` | `8765` | Porta TCP do WebSocket |
| gateway | `LIMIAR_ZONA_MORTA` | `0.5` | Limiar zona morta em N |
| gateway | `JANELA_MEDIA_MOVEL` | `5` | Amostras para suavização |
| gateway | `FATOR_CALIBRACAO` | `1.0` | Fator ADC → Newtons |
| gateway | `DESLOCAMENTO_TARA` | `0` | Offset de tara |
| api | `PROVEDOR_BANCO` | `sqlite` | `sqlite` ou `mariadb` |
| api | `CAMINHO_BANCO` | `/dados/balanca.db` | Caminho SQLite |
| api | `CAMINHO_CHAVE_API` | `/dados/.chave-api` | Arquivo da API Key |
| api | `DB_HOST` | `mariadb` | Host MariaDB |
| api | `DB_PORTA` | `3306` | Porta MariaDB |
| api | `DB_USUARIO` | `balanca` | Usuário MariaDB |
| api | `DB_SENHA` | — | Senha MariaDB |
| api | `DB_NOME` | `balanca_gfig` | Nome do banco |
| api | `PORTA_HTTP` | `3000` | Porta HTTP da API |
| api | `ORIGEM_CORS` | `*` | Origem CORS permitida |

---

## 18. Diagrama de Fluxo por Cenário

```
CENÁRIO A — TVBox Completo
────────────────────────────────────────────────────────────────────
                   ┌──────────────────────────┐
ESP32 ─USB─► Porta │  PipelineProcessamento   │  (gateway/Node.js)
             bytes │  Calibrador+ZonaMorta    │
                   │  MediaMovel+DetectorQ.   │
                   └───────────┬──────────────┘
                               │ LeituraProcessada
                               ▼
                   ServidorWebSocket :8765
                               │
                   Navegador ──HTTP :3000──► API REST
                               │              SQLite(WAL) ou MariaDB
                               ▼
                   TelaRelatorio
                     AnalisadorMotor
                       forcaRMS, σ, CV, t₁₀/t₉₀
                       perfilQueima ("neutro-plato")
                       nomeComum ("B1.7")
                       anomalias
                     GeradorPDF      ──► .pdf
                     ExportadorENG   ──► .eng  (OpenRocket)
                     ExportadorCSV   ──► .csv
                     ExportadorJSON  ──► .json


CENÁRIO C — Direto no PC
────────────────────────────────────────────────────────────────────
            ┌─────────────────────────────────────────────┐
ESP32 ─USB─►│ TrabalhadorSerial.worker (thread separada)  │
            │  decodificar() + PipelineProcessamento       │
            └───────────────────┬─────────────────────────┘
                                │ LeituraProcessada
                                ▼
                    TelaMedicao → sessão gravada
                                │
                    TelaRelatorio (mesma análise do Cenário A)
                                │
                          IndexedDB
```

---

## 19. Comandos de Desenvolvimento

```bash
# Instalar todas as dependências
npm install

# Todos os testes unitários
npm test

# Apenas análise e relatório
npm test --workspace=pacotes/analise
npm test --workspace=pacotes/relatorio

# Cenário A com SQLite
docker compose -f docker/docker-compose.yml up

# Cenário A com MariaDB
docker compose -f docker/docker-compose.yml \
               -f docker/docker-compose.mariadb.yml up

# Deploy no TVBox via SSH
rsync -avz --exclude node_modules . armbian@tvbox.local:/opt/balanca-gfig/
ssh armbian@tvbox.local "cd /opt/balanca-gfig && docker compose up -d"

# Cenário C — apenas a WebApp (WebSerial no PC)
cd pacotes/aplicacao && npm run desenvolver
```

---

*Documento de arquitetura — BalançaGFIG · GFIG / IFSC Campus Gaspar*