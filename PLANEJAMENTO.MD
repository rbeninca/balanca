# BalançaGFIG — Plano de Implementação

> Especificação detalhada de todas as tarefas, testes unitários e testes de
> integração para a reescrita modular do sistema.

---

## Convenções

### Identificadores de tarefa

```
T-F.N   — Tarefa (Fase F, número N)
UT-F.N  — Teste unitário (fase F, tarefa N)
IT-F.N  — Teste de integração
E2E-N   — Teste ponta-a-ponta (Playwright)
```

### Critério de "done" para cada tarefa

Uma tarefa está concluída quando:
- Código compilado sem erros TypeScript em modo estrito
- Todos os testes unitários da tarefa passando
- Cobertura ≥ 90% das linhas da tarefa
- Sem `any` explícito no código novo
- Função/classe exportada e usável pelos pacotes dependentes

### Ferramentas de teste

| Tipo | Ferramenta | Comando |
|------|-----------|---------|
| Unitário | Vitest | `npm test` |
| Integração | Vitest + Supertest | `npm run testar:integracao` |
| Ponta-a-ponta | Playwright | `npm run testar:e2e` |
| Cobertura | Vitest coverage | `npm run testar:cobertura` |
| Lint | ESLint + Prettier | `npm run verificar` |

### Estrutura padrão de teste unitário

```typescript
// pacotes/PACOTE/testes/MODULO.teste.ts
import { describe, it, expect, beforeEach } from 'vitest';

describe('NomeDoModulo', () => {
  // Cenários positivos
  describe('comportamento esperado', () => {
    it('deve [ação] quando [condição]', () => { /* ... */ });
  });

  // Cenários de borda
  describe('casos extremos', () => {
    it('deve [tratar] quando [limite]', () => { /* ... */ });
  });

  // Cenários de erro
  describe('tratamento de erros', () => {
    it('deve lançar [erro] quando [entrada inválida]', () => { /* ... */ });
  });
});
```

---

## Fase 1 — `pacotes/protocolo`

**Objetivo:** codec TypeScript puro para o protocolo binário CRC16-CCITT
compartilhado entre gateway e navegador.

**Dependências de entrada:** nenhuma
**Dependências de saída:** processamento, gateway, aplicacao

---

### T-1.1 — Tipos do protocolo

**O que fazer:**
Criar `src/tipos.ts` com todas as interfaces do protocolo. Os tipos devem
refletir exatamente a estrutura de bytes do firmware.

**Arquivos a criar:**
- `pacotes/protocolo/src/tipos.ts`

**Especificação:**

```typescript
// Identificadores de tipo de pacote (1 byte)
export const TIPO_DADOS         = 0x01;
export const TIPO_CONFIGURACAO  = 0x02;
export const TIPO_COMANDO       = 0x03;
export const TIPO_STATUS        = 0x04;

// Identificadores de comando (1 byte)
export const CMD_TARAR          = 0x01;
export const CMD_INICIAR        = 0x02;
export const CMD_PARAR          = 0x03;
export const CMD_DEFINIR_CONFIG = 0x04;
export const CMD_OBTER_CONFIG   = 0x05;

export interface PacoteDados {
  tipo:           'DADOS';
  marcaTemporal:  number;   // uint32 — ms desde boot
  forcaBruta:     number;   // int32  — valor ADC (com sinal)
  temperatura:    number;   // int16  — °C × 100
  sequencia:      number;   // uint16 — anti-duplicata
}

export interface PacoteConfiguracao {
  tipo:              'CONFIGURACAO';
  taxaAmostragemHz:  number;   // uint16
  deslocamentoTara:  number;   // int32
  fatorCalibracao:   number;   // float32 (IEEE 754)
}

export interface PacoteComando {
  tipo:    'COMANDO';
  comando: 'TARAR' | 'INICIAR' | 'PARAR' | 'DEFINIR_CONFIG' | 'OBTER_CONFIG';
  carga?:  Partial<PacoteConfiguracao>;
}

export interface PacoteStatus {
  tipo:        'STATUS';
  conectado:   boolean;
  tensaoBat_V: number;   // float32
  erros:       number;   // uint8 — bitmask
}

export type Pacote = PacoteDados | PacoteConfiguracao | PacoteComando | PacoteStatus;
```

**Critério de aceite:**
- Arquivo compila sem erros em `--strict`
- `Pacote` é um discriminated union válido

**Testes unitários:** nenhum (apenas tipos — testados indiretamente pelo codificador)

---

### T-1.2 — CRC16-CCITT

**O que fazer:**
Implementar o algoritmo CRC16-CCITT (polinômio 0x1021, seed 0xFFFF) igual ao
usado no firmware do ESP32.

**Arquivos a criar:**
- `pacotes/protocolo/src/crc16.ts`

**Especificação:**

```typescript
// Tabela pré-computada para performance
const TABELA_CRC16: Uint16Array = (function () { /* gera 256 entradas */ })();

export function calcularCRC16(buffer: Uint8Array): number {
  let crc = 0xffff;
  for (const byte of buffer) {
    crc = ((crc << 8) ^ TABELA_CRC16[((crc >> 8) ^ byte) & 0xff]) & 0xffff;
  }
  return crc;
}
```

**Testes unitários — `testes/crc16.teste.ts`:**

| ID | Cenário | Entrada | Esperado |
|----|---------|---------|---------|
| UT-1.2.1 | Vetor de teste padrão ASCII "123456789" | `[0x31..0x39]` | `0x29B1` |
| UT-1.2.2 | Buffer vazio | `[]` | `0xFFFF` (seed) |
| UT-1.2.3 | Um único byte 0x00 | `[0x00]` | valor calculado manualmente |
| UT-1.2.4 | Resultado consistente em chamadas múltiplas | mesmo buffer × 2 | mesmo CRC |
| UT-1.2.5 | Buffer com todos os bytes 0xFF | `[0xFF, 0xFF, ...]` | valor calculado |

---

### T-1.3 — Codificador (objeto → bytes)

**O que fazer:**
Serializar qualquer `Pacote` em `Buffer` com estrutura definida + CRC16 no final.

**Estrutura do frame:**
```
[1 byte tipo] [N bytes payload] [2 bytes CRC16] [2 bytes marcador 0xAA 0x55]
```

**Arquivos a criar:**
- `pacotes/protocolo/src/codificador.ts`

**Testes unitários — `testes/codificador.teste.ts`:**

| ID | Cenário | Entrada | Esperado |
|----|---------|---------|---------|
| UT-1.3.1 | PacoteDados completo | objeto válido | Buffer com tipo 0x01 no byte 0 |
| UT-1.3.2 | Marcador de fim presente | qualquer pacote | últimos 2 bytes = [0xAA, 0x55] |
| UT-1.3.3 | CRC nos bytes penúltimos | qualquer pacote | bytes -4 e -3 = CRC calculado |
| UT-1.3.4 | PacoteComando sem carga | `{ tipo:'COMANDO', comando:'TARAR' }` | payload mínimo |
| UT-1.3.5 | PacoteConfiguracao com float | `fatorCalibracao: 2.123456` | IEEE 754 correto |
| UT-1.3.6 | Temperatura negativa | `temperatura: -25.5` | int16 com sinal correto |

---

### T-1.4 — Decodificador (bytes → objeto)

**O que fazer:**
Desserializar `Buffer` em `Pacote` tipado. Verificar CRC antes de processar.

**Arquivos a criar:**
- Adicionar `decodificar()` em `codificador.ts`

**Testes unitários:**

| ID | Cenário | Entrada | Esperado |
|----|---------|---------|---------|
| UT-1.4.1 | Round-trip PacoteDados | `decodificar(codificar(p))` | `p` (deep equal) |
| UT-1.4.2 | Round-trip PacoteConfiguracao | idem | idem |
| UT-1.4.3 | Round-trip PacoteComando | idem | idem |
| UT-1.4.4 | CRC corrompido (1 bit flip) | `buf[buf.length-3] ^= 0x01` | `throw 'CRC inválido'` |
| UT-1.4.5 | Buffer truncado | buffer com 3 bytes | `throw 'Buffer muito curto'` |
| UT-1.4.6 | Tipo desconhecido | byte tipo = 0xFF | `throw 'Tipo desconhecido'` |
| UT-1.4.7 | marcaTemporal máximo uint32 | `4294967295` | sem overflow |
| UT-1.4.8 | forcaBruta negativa | `-32768` | int32 com sinal preservado |

---

## Fase 2 — `pacotes/processamento`

**Objetivo:** pipeline de processamento TypeScript puro que roda no gateway
(Node.js) e no browser (WebWorker).

**Dependências de entrada:** protocolo
**Dependências de saída:** analise, gateway, aplicacao

---

### T-2.1 — Tipos do processamento

**Arquivos a criar:** `src/tipos.ts`

```typescript
export interface ConfiguracaoPipeline {
  limiarZonaMortaN:   number;
  janelaMediaMovel:   number;
  fatorCalibracao:    number;
  deslocamentoTara:   number;
}

export interface LeituraProcessada {
  marcaTemporal:      number;  // ms
  forcaNewton:        number;  // N calibrada e filtrada
  temperatura:        number;  // °C
  emQueima:           boolean;
  impulsoAcumuladoNs: number;  // N·s (integral)
}
```

---

### T-2.2 — Calibrador

**O que fazer:** aplicar `forca_N = (forcaBruta - deslocamentoTara) × fatorCalibracao`

**Arquivos a criar:** `src/calibracao/Calibrador.ts`

**Testes — `testes/calibracao/Calibrador.teste.ts`:**

| ID | Cenário | Entrada | Esperado |
|----|---------|---------|---------|
| UT-2.2.1 | Calibração simples | bruta=200, tara=100, fator=2.0 | 200.0 N |
| UT-2.2.2 | Tara igual ao bruto | bruta=100, tara=100, fator=1.0 | 0.0 N |
| UT-2.2.3 | Fator negativo | bruta=100, tara=0, fator=-1.0 | -100.0 N |
| UT-2.2.4 | Valor bruto abaixo da tara | bruta=50, tara=100, fator=1.0 | -50.0 N |
| UT-2.2.5 | Fator fracionário | bruta=150, tara=100, fator=0.5 | 25.0 N |

---

### T-2.3 — ZonaMorta

**O que fazer:** se `|forca| < limiar` → retorna 0; caso contrário retorna a força sem alteração.

**Arquivos a criar:** `src/filtros/ZonaMorta.ts`

**Testes:**

| ID | Cenário | Entrada | Esperado |
|----|---------|---------|---------|
| UT-2.3.1 | Exatamente no limiar | forca=0.5, limiar=0.5 | 0 |
| UT-2.3.2 | Abaixo do limiar | forca=0.3, limiar=0.5 | 0 |
| UT-2.3.3 | Acima do limiar | forca=0.6, limiar=0.5 | 0.6 |
| UT-2.3.4 | Negativo abaixo do limiar | forca=-0.3, limiar=0.5 | 0 |
| UT-2.3.5 | Negativo acima do limiar | forca=-0.7, limiar=0.5 | -0.7 |
| UT-2.3.6 | Limiar zero (desabilitado) | forca=0.001, limiar=0 | 0.001 |

---

### T-2.4 — MediaMovel

**O que fazer:** média aritmética das últimas N amostras (janela deslizante).
Estado interno deve ser reiniciável.

**Arquivos a criar:** `src/filtros/MediaMovel.ts`

**Testes:**

| ID | Cenário | Entrada | Esperado |
|----|---------|---------|---------|
| UT-2.4.1 | Janela de 1 | N=1, valores=[10,20,30] | [10, 20, 30] |
| UT-2.4.2 | Janela de 3 (aquecimento) | N=3, valores=[6,6,6] | [6, 6, 6] |
| UT-2.4.3 | Janela de 3 em regime | N=3, valores=[2,4,6,8,10] | [2, 3, 4, 6, 8] |
| UT-2.4.4 | reiniciar() zera janela | após 10 amostras → reiniciar → 1 amostra | retorna a 1 amostra |
| UT-2.4.5 | Janela maior que amostras | N=10, 3 amostras enviadas | média das 3 |

---

### T-2.5 — DetectorQueima

**O que fazer:** máquina de estados com histerese. Entra em `emQueima=true`
quando força supera limiar; volta a `false` quando fica abaixo por `tempoMinFim_ms`.

**Arquivos a criar:** `src/analise/DetectorQueima.ts`

**Especificação de estados:**
```
REPOUSO  → (forca > limiar)              → EM_QUEIMA
EM_QUEIMA → (forca < limiar por ≥ 100ms) → REPOUSO
```

**Testes:**

| ID | Cenário | Sequência de força/tempo | Esperado |
|----|---------|--------------------------|---------|
| UT-2.5.1 | Ignição simples | 0N@0ms, 5N@100ms | false → true |
| UT-2.5.2 | Burnout após histerese | 5N@0ms, 0N@100ms, 0N@200ms | true → true → false |
| UT-2.5.3 | Spike passageiro não ativa burnout | 5N@0ms, 0N@50ms, 5N@60ms | true → true → true |
| UT-2.5.4 | Nunca ultrapassa limiar | 0.1N sempre | false sempre |
| UT-2.5.5 | reiniciar() volta para REPOUSO | após queima → reiniciar | false |
| UT-2.5.6 | Histerese configurável | tempoMinFim=200ms | só muda após 200ms abaixo |

---

### T-2.6 — CalculadorImpulso

**O que fazer:** integração numérica trapezoidal incremental.
`impulso += (F_anterior + F_atual) / 2 × Δt`

**Arquivos a criar:** `src/analise/CalculadorImpulso.ts`

**Testes:**

| ID | Cenário | Entrada | Esperado |
|----|---------|---------|---------|
| UT-2.6.1 | Força constante 10N por 1s | F=10N em t=0,500,1000ms | ≈10 N·s |
| UT-2.6.2 | Triângulo (0→10→0 N em 1s) | F=[0,10,0] em t=[0,500,1000] | ≈5 N·s |
| UT-2.6.3 | Primeira amostra | só 1 ponto | 0 N·s |
| UT-2.6.4 | reiniciar() zera acumulador | após 5 N·s → reiniciar | próxima = 0 |
| UT-2.6.5 | Força zero não acumula | F=0 por 10 s | 0 N·s |
| UT-2.6.6 | Precisão com Δt irregular | intervalos variáveis | erro < 0.1% vs. analítico |

---

### T-2.7 — PipelineProcessamento

**O que fazer:** encadeia Calibrador → ZonaMorta → MediaMovel → DetectorQueima
→ CalculadorImpulso em ordem correta.

**Arquivos a criar:** `src/pipeline/PipelineProcessamento.ts`

**Testes:**

| ID | Cenário | Entrada | Esperado |
|----|---------|---------|---------|
| UT-2.7.1 | Pacote de ruído → zona morta elimina | forcaBruta≈tara | forcaNewton=0, emQueima=false |
| UT-2.7.2 | Sequência completa de queima | rampa 0→10→0 N | emQueima alterna corretamente |
| UT-2.7.3 | forcaNewton usa unidade Newtons | forcaBruta=200, tara=100, fator=2 | 200.0 N |
| UT-2.7.4 | temperatura passada sem alteração | temp=23.5°C no pacote | 23.5 no resultado |
| UT-2.7.5 | marcaTemporal passado sem alteração | t=12345ms | 12345 no resultado |
| UT-2.7.6 | impulsoAcumuladoNs cresce com queima | 10 N por 0.5s | ≈5 N·s |
| UT-2.7.7 | reiniciar() zera estado | após queima → reiniciar | impulso=0, emQueima=false |
| UT-2.7.8 | atualizarCalibracao() funciona em runtime | muda fator durante operação | aplica novo fator imediatamente |

---

## Fase 3 — `pacotes/analise`

**Objetivo:** análise pós-sessão: classificação NAR, perfil de queima, métricas
avançadas, detecção de anomalias.

**Dependências de entrada:** processamento
**Dependências de saída:** relatorio, aplicacao

---

### T-3.1 — ClassificadorNAR

**Arquivos a criar:** `src/ClassificadorNAR.ts`

**Testes:**

| ID | Cenário | Impulso (N·s) | F̄ (N) | Letra | Nome |
|----|---------|--------------|-------|-------|------|
| UT-3.1.1 | Motor do relatório real | 2.94 | 1.73 | B | B1.7 |
| UT-3.1.2 | Limite inferior classe B | 2.51 | 1.0 | B | B1.0 |
| UT-3.1.3 | Limite superior classe B | 5.00 | 2.0 | B | B2.0 |
| UT-3.1.4 | Exatamente na fronteira A/B | 2.50 | — | A | — |
| UT-3.1.5 | Motor K grande | 1500.0 | 240.0 | K | K240.0 |
| UT-3.1.6 | Motor micro 1/8A | 0.15 | 0.5 | 1/8A | 1/8A0.5 |
| UT-3.1.7 | Impulso acima de O | 41000 | 500 | `?` | `?500.0` |
| UT-3.1.8 | Nome com 1 decimal | 1.73N média | — | — | "B1.7" (não "B2") |

---

### T-3.2 — ClassificadorPerfil

**Arquivos a criar:** `src/ClassificadorPerfil.ts`

**Estratégia:** divide a janela de queima em 3 terços; compara médias.

**Testes:**

| ID | Cenário | Perfil das médias (início/meio/fim) | Resultado |
|----|---------|--------------------------------------|---------|
| UT-3.2.1 | Neutro-platô (KNSB típico) | 1.0 / 2.0 / 1.0 N | `neutro-plato` |
| UT-3.2.2 | Progressivo | 0.5 / 1.0 / 2.0 N | `progressivo` |
| UT-3.2.3 | Regressivo | 2.0 / 1.5 / 0.5 N | `regressivo` |
| UT-3.2.4 | Neutro (flat) | 1.7 / 1.7 / 1.7 N | `neutro` |
| UT-3.2.5 | Amostra insuficiente | < 9 leituras | `complexo` |
| UT-3.2.6 | Variação dentro da margem (10%) | 1.7 / 1.8 / 1.75 N | `neutro` |
| UT-3.2.7 | Dados do relatório real | perfil real Fernanda 1.11 | `neutro-plato` |

---

### T-3.3 — DetectorAnomalias

**Arquivos a criar:** `src/DetectorAnomalias.ts`

**Testes:**

| ID | Cenário | Entrada | Resultado |
|----|---------|---------|---------|
| UT-3.3.1 | Queima limpa sem oscilações | variação < 30% da média | `[]` |
| UT-3.3.2 | Oscilação AVISO | delta = 35% da média | 1 anomalia OSCILACAO/AVISO |
| UT-3.3.3 | Oscilação CRITICO | delta = 65% da média | 1 anomalia OSCILACAO/CRITICO |
| UT-3.3.4 | CV > 20% → queima irregular | σ/média = 0.25 | QUEIMA_IRREGULAR/AVISO |
| UT-3.3.5 | Ignição com atraso > 2s | primeiro emQueima=true em t=3s | FALHA_IGNICAO/AVISO |
| UT-3.3.6 | Ignição normal (< 2s) | primeiro emQueima=true em t=1.5s | sem FALHA_IGNICAO |
| UT-3.3.7 | Múltiplas oscilações | 3 picos acima de 30% | 3 anomalias |
| UT-3.3.8 | Sem dados de queima | nenhuma leitura com emQueima=true | `[]` |

---

### T-3.4 — AnalisadorMotor

**Arquivos a criar:** `src/AnalisadorMotor.ts`

**Testes:**

| ID | Cenário | Entrada | Verificação |
|----|---------|---------|------------|
| UT-3.4.1 | Sem queima → exceção | leituras só com emQueima=false | `throw 'Nenhuma leitura...'` |
| UT-3.4.2 | forcaPico = max das leituras em queima | [1,2,3,2,1] N | forcaPico=3.0 |
| UT-3.4.3 | forcaMedia aritmética | [2,2,2,2] N | forcaMedia=2.0 |
| UT-3.4.4 | forcaRMS ≥ forcaMedia | qualquer queima | invariante sempre verdadeiro |
| UT-3.4.5 | CV = σ/média | σ=0.18, média=1.73 | CV≈0.104 |
| UT-3.4.6 | t10 < t90 sempre | qualquer curva | invariante |
| UT-3.4.7 | tempoSubida = t90 - t10 | t10=0.07, t90=0.35 | 0.28s |
| UT-3.4.8 | Isp com massa informada | impulso=2.94, massa=0.030 kg | ≈9.97 s |
| UT-3.4.9 | Isp sem massa → undefined | metadados sem massaPropelente | `undefined` |
| UT-3.4.10 | nomeComum no formato correto | qualquer entrada | `/^[A-Z0-9\/]+\d+\.\d$/` |
| UT-3.4.11 | Dados do relatório real | sessão Fernanda 1.11 | letraMotor='B', impulso≈2.94 |

---

### T-3.5 — ComparadorSessoes

**Arquivos a criar:** `src/ComparadorSessoes.ts`

**Testes:**

| ID | Cenário | Verificação |
|----|---------|------------|
| UT-3.5.1 | normalizar() alinha t=0 no início da queima | primeira leitura normalizada t=0 |
| UT-3.5.2 | normalizar() com 2 sessões de durações diferentes | pontos independentes por sessão |
| UT-3.5.3 | gerarTabelaComparativa() tem N linhas para N sessões | N=3 → 3 linhas |
| UT-3.5.4 | sessão sem queima → excluída da comparação | throw ou filtrada |

---

## Fase 4 — `pacotes/relatorio`

**Objetivo:** geração de PDF, exportação RASP .eng, CSV e JSON.
Roda exclusivamente no browser (sem Node deps).

**Dependências de entrada:** analise
**Dependências de saída:** aplicacao

---

### T-4.1 — ExportadorCSV

**Arquivos a criar:** `src/exportadores/ExportadorCSV.ts`

**Testes:**

| ID | Cenário | Verificação |
|----|---------|------------|
| UT-4.1.1 | Cabeçalho com metadados da sessão | primeira linha começa com `#` |
| UT-4.1.2 | Separador padrão é `;` | colunas separadas por `;` |
| UT-4.1.3 | Separador customizável | `,` → colunas com `,` |
| UT-4.1.4 | Colunas obrigatórias presentes | marcaTemporal_ms, forcaNewton_N, forcaGf, forcaKgf, temperatura_C, emQueima, impulsoAcumulado_Ns |
| UT-4.1.5 | N leituras → N linhas de dados | 155 leituras → 155 linhas (excl. header) |
| UT-4.1.6 | forcaGf = forcaNewton × 101.972 | verificar 2 casas decimais |
| UT-4.1.7 | emQueima como 0/1 | true→"1", false→"0" |
| UT-4.1.8 | Sessão sem metadados de motor | linhas `#` mostram "---" ou omitidas |
| UT-4.1.9 | Isp no cabeçalho quando disponível | linha `# Isp (s);9.97` |

---

### T-4.2 — ExportadorJSON

**Arquivos a criar:** `src/exportadores/ExportadorJSON.ts`

**Testes:**

| ID | Cenário | Verificação |
|----|---------|------------|
| UT-4.2.1 | JSON válido parseable | `JSON.parse()` sem exceção |
| UT-4.2.2 | Campo `versaoFormato` presente | `"2.0"` |
| UT-4.2.3 | Campo `analise.nomeComum` presente | `"B1.7"` para Fernanda 1.11 |
| UT-4.2.4 | Campo `analise.perfilQueima` presente | `"neutro-plato"` |
| UT-4.2.5 | Leituras compactadas | cada leitura tem campos `t`, `f`, `tc`, `q`, `i` |
| UT-4.2.6 | Isp null quando não calculado | `"impulsoEspecifico_s": null` |
| UT-4.2.7 | Anomalias incluídas | array (vazio ou com objetos) |
| UT-4.2.8 | JSON indentado com 2 espaços | legível como arquivo |

---

### T-4.3 — ExportadorENG (RASP)

**Arquivos a criar:** `src/exportadores/ExportadorENG.ts`

**Testes:**

| ID | Cenário | Verificação |
|----|---------|------------|
| UT-4.3.1 | Linhas de comentário iniciam com `;` | `saida.split('\n').filter(l=>l.startsWith(';')).length > 0` |
| UT-4.3.2 | Linha de cabeçalho do motor tem 7 campos | `cabeçalho.split(/\s+/).length === 7` |
| UT-4.3.3 | Nome do motor na posição 0 | `partes[0] === 'B1.7'` |
| UT-4.3.4 | Fabricante "GFIG" na posição 6 | `partes[6] === 'GFIG'` |
| UT-4.3.5 | Ponto final com força zero | última linha de dados termina em `0.000` |
| UT-4.3.6 | Tempo normalizado começa em 0 | primeiro ponto de dados `t ≈ 0.0000` |
| UT-4.3.7 | Pontos em ordem crescente de tempo | `t[i] < t[i+1]` para todos |
| UT-4.3.8 | Linha final é `;` (separador NAR) | `saida.trim().endsWith(';')` |
| UT-4.3.9 | Comentário sobre Isp ausente quando sem massa | linha `; Isp: massa...` presente |
| UT-4.3.10 | Dados do relatório real | importável no OpenRocket (teste manual) |

---

### T-4.4 — GeradorPDF

**Arquivos a criar:** `src/GeradorPDF.ts` + seções individuais

**Testes:**

| ID | Cenário | Verificação |
|----|---------|------------|
| UT-4.4.1 | Retorna Blob com MIME application/pdf | `blob.type === 'application/pdf'` |
| UT-4.4.2 | Blob não vazio | `blob.size > 0` |
| UT-4.4.3 | Nome do motor no PDF | texto "B1.7" presente no conteúdo |
| UT-4.4.4 | Sem metadados → Isp mostra instrução | texto "Aguardando massa" |
| UT-4.4.5 | Com metadados → Isp calculado | texto "s" após o número |
| UT-4.4.6 | Anomalias críticas marcadas | texto "CRITICO" presente quando há anomalia crítica |
| UT-4.4.7 | Perfil de queima no resumo | texto do perfilQueima presente |
| UT-4.4.8 | Rodapé com "GFIG / IFSC Campus Gaspar" | texto no rodapé |

---

## Fase 5 — `pacotes/gateway`

**Objetivo:** bridge serial↔WebSocket com suporte a comunicação bidirecional,
pipeline de processamento no caminho ESP32→clientes.

**Dependências de entrada:** protocolo, processamento
**Dependências de saída:** nenhuma (serviço final)

---

### T-5.1 — PortaSerial

**Arquivos a criar:** `src/PortaSerial.ts`

**Especificação:**
- Reconexão automática com backoff exponencial (500ms, 1s, 2s, 4s, máx 30s)
- Evento `'pacote'` emitido com `Pacote` decodificado
- Evento `'erro_decodificacao'` emitido com detalhes sem derrubar o processo
- Evento `'conectado'` / `'desconectado'` para telemetria
- `enviar(Buffer)` para comunicação bidirecional

**Testes — `testes/PortaSerial.teste.ts`:**

| ID | Cenário | Verificação |
|----|---------|------------|
| UT-5.1.1 | Emite 'pacote' para cada frame válido | mock serial → evento 'pacote' |
| UT-5.1.2 | Ignora frame com CRC inválido sem crash | 'erro_decodificacao' emitido, sem throw |
| UT-5.1.3 | Agenda reconexão após erro serial | `setTimeout` chamado após 'error' |
| UT-5.1.4 | Agenda reconexão após 'close' | `setTimeout` chamado após 'close' |
| UT-5.1.5 | Cancela timer ao chamar fechar() | `clearTimeout` chamado |
| UT-5.1.6 | enviar() chama port.write() | mock write verificado |
| UT-5.1.7 | enviar() rejeita se porta fechada | rejeita Promise |

**Simulacro (mock) para testes:**

```typescript
// testes/simulacros/SerialPortSimulacro.ts
export class SerialPortSimulacro extends EventEmitter {
  public dadosEscritos: Buffer[] = [];
  write(dados: Buffer, cb: (e?: Error) => void) {
    this.dadosEscritos.push(dados);
    cb();
  }
  close(cb: () => void) { cb(); }
  // Método auxiliar para injetar dados
  simularRecepcao(buffer: Buffer) { this.emit('data', buffer); }
}
```

---

### T-5.2 — ServidorWebSocket bidirecional

**Arquivos a criar:** `src/ServidorWebSocket.ts`

**Especificação:**
- Recebe `Pacote` JSON do cliente → `codificar()` → `porta.enviar()`
- Recebe `PacoteDados` do ESP32 → `pipeline.processar()` → difunde `LeituraProcessada`
- Recebe `PacoteConfiguracao` do ESP32 → `pipeline.atualizarCalibracao()` → difunde direto
- Recebe `PacoteStatus` do ESP32 → difunde direto
- Difunde eventos de conexão serial para todos os clientes

**Testes:**

| ID | Cenário | Verificação |
|----|---------|------------|
| UT-5.2.1 | PacoteDados → LeituraProcessada difundida | cliente recebe `{tipo:'LEITURA'}` |
| UT-5.2.2 | PacoteConfiguracao → difundido direto | cliente recebe `{tipo:'CONFIG'}` |
| UT-5.2.3 | PacoteStatus → difundido direto | cliente recebe `{tipo:'STATUS'}` |
| UT-5.2.4 | Comando do cliente → porta.enviar() chamado | mock da porta verificado |
| UT-5.2.5 | JSON inválido do cliente → não quebra | conexão mantida, erro logado |
| UT-5.2.6 | PacoteConfiguracao → pipeline atualizado | `pipeline.atualizarCalibracao()` chamado |
| UT-5.2.7 | Cliente desconecta → removido do set | difusão para N-1 clientes |
| UT-5.2.8 | Serial desconecta → `SERIAL_OFF` difundido | todos clientes recebem |
| UT-5.2.9 | Serial reconecta → `SERIAL_OK` difundido | todos clientes recebem |

**Teste de integração — IT-5.1 (gateway + serial mock):**

```typescript
// testes/integracao/GatewayBidirecional.teste.ts
it('ciclo completo: ESP32 → cliente', async () => {
  const { cliente, portaSimulacro } = await criarAmbienteGateway();

  // ESP32 envia dados
  portaSimulacro.simularRecepcao(codificar(pacoteDadosFicticios));

  const msg = await aguardarMensagem(cliente);
  expect(msg.tipo).toBe('LEITURA');
  expect(msg.carga.forcaNewton).toBeCloseTo(/* valor esperado */);
});

it('ciclo completo: cliente → ESP32 (comando TARAR)', async () => {
  const { cliente, portaSimulacro } = await criarAmbienteGateway();

  cliente.send(JSON.stringify({ tipo: 'COMANDO', comando: 'TARAR' }));
  await aguardarEscrita(portaSimulacro);

  const bytesEscritos = portaSimulacro.dadosEscritos[0];
  const pacote = decodificar(bytesEscritos);
  expect(pacote.tipo).toBe('COMANDO');
  expect(pacote.comando).toBe('TARAR');
});

it('OBTER_CONFIG → ESP32 responde → pipeline atualizado → cliente notificado', async () => {
  const { cliente, portaSimulacro, pipeline } = await criarAmbienteGateway();

  // Cliente solicita config
  cliente.send(JSON.stringify({ tipo: 'COMANDO', comando: 'OBTER_CONFIG' }));
  await aguardarEscrita(portaSimulacro);

  // ESP32 responde com a config
  portaSimulacro.simularRecepcao(codificar({
    tipo: 'CONFIGURACAO',
    taxaAmostragemHz: 100,
    deslocamentoTara: 150,
    fatorCalibracao: 2.05,
  }));

  const msg = await aguardarMensagem(cliente);
  expect(msg.tipo).toBe('CONFIG');
  expect(msg.carga.fatorCalibracao).toBeCloseTo(2.05);
  expect(pipeline.obterFatorCalibracao()).toBeCloseTo(2.05);
});
```

---

### T-5.3 — Principal (entry point + health)

**Arquivos a criar:** `src/principal.ts`

**Especificação:**
- Lê variáveis de ambiente (`PORTA_SERIAL`, `BAUD_SERIAL`, etc.)
- Instancia `PortaSerial` e `ServidorWebSocket`
- Endpoint HTTP `GET /saude` retorna `{ status: 'ok', serial: bool, clientes: number }`
- Graceful shutdown em `SIGTERM`

**Testes:**

| ID | Cenário | Verificação |
|----|---------|------------|
| UT-5.3.1 | /saude retorna 200 com campos corretos | status code 200, corpo esperado |
| UT-5.3.2 | /saude reflete estado da serial | serial=false quando desconectada |
| UT-5.3.3 | SIGTERM fecha WebSocket e porta | cleanup chamado |

---

## Fase 6 — `pacotes/api`

**Objetivo:** API REST para persistência. SQLite+WAL por padrão, MariaDB como
alternativa via variável de ambiente.

**Dependências de entrada:** nenhuma
**Dependências de saída:** aplicacao

---

### T-6.1 — ProvedorSQLite

**Arquivos a criar:** `src/bancoDados/ProvedorSQLite.ts`

**Especificação:**
- `journal_mode = WAL` (resiliência a quedas de energia)
- `foreign_keys = ON`
- `synchronous = NORMAL`
- Inicializa esquema na primeira execução

**Testes:**

| ID | Cenário | Verificação |
|----|---------|------------|
| UT-6.1.1 | Cria banco em `:memory:` sem erros | sem exceção |
| UT-6.1.2 | Executa esquema SQL na inicialização | tabelas existem após construtor |
| UT-6.1.3 | WAL habilitado | `PRAGMA journal_mode` retorna `wal` |
| UT-6.1.4 | Foreign keys habilitadas | inserção com FK inválida lança erro |
| UT-6.1.5 | executar() + consultar() round-trip | insere linha, consulta retorna |
| UT-6.1.6 | fechar() não lança em banco aberto | sem exceção |

---

### T-6.2 — ChaveAPI (middleware)

**Arquivos a criar:** `src/autenticacao/ChaveAPI.ts`, `src/autenticacao/gerarChave.ts`

**Testes:**

| ID | Cenário | Verificação |
|----|---------|------------|
| UT-6.2.1 | Sem arquivo de chave → modo dev (sem auth) | requisição sem header passa |
| UT-6.2.2 | Com chave correta no header | `x-chave-api: valid` → continua |
| UT-6.2.3 | Com chave incorreta | 401 Unauthorized |
| UT-6.2.4 | Sem header quando chave configurada | 401 Unauthorized |
| UT-6.2.5 | gerarChave() cria arquivo com 64 chars hex | `/[0-9a-f]{64}/.test(chave)` |

---

### T-6.3 — Rotas de sessões

**Arquivos a criar:** `src/rotas/sessoes.ts`

**Testes de integração — IT-6.1:**

```typescript
const app = criarApp({ caminhoBanco: ':memory:', chaveAPI: 'chave-teste' });

// Leituras (sem auth)
it('GET /sessoes retorna array vazio inicialmente', async () => {
  const r = await request(app).get('/sessoes');
  expect(r.status).toBe(200);
  expect(r.body).toEqual([]);
});

// Escritas (com auth)
it('POST /sessoes sem chave retorna 401', async () => {
  const r = await request(app).post('/sessoes').send({ nome: 'Teste' });
  expect(r.status).toBe(401);
});

it('POST /sessoes com chave retorna 201 com id', async () => {
  const r = await request(app)
    .post('/sessoes').set('x-chave-api', 'chave-teste')
    .send({ nome: 'Fernanda 1.11', idMotor: 'B1.7' });
  expect(r.status).toBe(201);
  expect(r.body.id).toBeDefined();
  expect(r.body.nome).toBe('Fernanda 1.11');
});

it('GET /sessoes/:id retorna sessão criada', async () => {
  const criada = await criarSessaoTeste(app);
  const r      = await request(app).get(`/sessoes/${criada.id}`);
  expect(r.status).toBe(200);
  expect(r.body.id).toBe(criada.id);
});

it('DELETE /sessoes/:id com chave retorna 204', async () => {
  const criada = await criarSessaoTeste(app);
  const r      = await request(app)
    .delete(`/sessoes/${criada.id}`).set('x-chave-api', 'chave-teste');
  expect(r.status).toBe(204);
});

it('DELETE em cascata remove leituras associadas', async () => {
  const sessao = await criarSessaoTeste(app);
  await adicionarLeiturasTeste(app, sessao.id);
  await request(app).delete(`/sessoes/${sessao.id}`).set('x-chave-api', 'chave-teste');
  const leituras = await request(app).get(`/sessoes/${sessao.id}/leituras`);
  expect(leituras.status).toBe(404);
});
```

---

### T-6.4 — Rotas de leituras e metadados

**Arquivos a criar:** `src/rotas/leituras.ts`, `src/rotas/metadados.ts`

**Testes de integração — IT-6.2:**

| ID | Cenário | Verificação |
|----|---------|------------|
| IT-6.2.1 | POST /leituras salva batch | 155 leituras → 155 no banco |
| IT-6.2.2 | GET /sessoes/:id/leituras retorna todas | count correto |
| IT-6.2.3 | GET /sessoes/:id/exportar.csv | Content-Type: text/csv |
| IT-6.2.4 | POST /sessoes/:id/metadados salva | fatorCalibracao persiste |
| IT-6.2.5 | GET /sessoes/:id/metadados retorna | fatorCalibracao recuperado |
| IT-6.2.6 | POST metadados sem massa → Isp null no CSV | verificar exportação |

---

## Fase 7 — `pacotes/aplicacao`

**Objetivo:** SPA TypeScript + Vite com os três cenários de conexão.

**Dependências de entrada:** protocolo, processamento, analise, relatorio, api

---

### T-7.1 — TrabalhadorSerial (WebWorker)

**Arquivos a criar:** `src/trabalhadores/TrabalhadorSerial.worker.ts`,
`src/trabalhadores/TrabalhadorSerial.ts`

**Testes — `testes/trabalhadores/TrabalhadorSerial.teste.ts`:**

| ID | Cenário | Verificação |
|----|---------|------------|
| UT-7.1.1 | CONFIGURAR instancia pipeline | BYTES processado corretamente após CONFIGURAR |
| UT-7.1.2 | BYTES → emite evento 'dados' com LeituraProcessada | forcaNewton definido |
| UT-7.1.3 | BYTES sem CONFIGURAR → silencioso | sem evento, sem crash |
| UT-7.1.4 | BYTES com CRC inválido → evento 'erro' | erro emitido sem crash |
| UT-7.1.5 | REINICIAR → zera estado do pipeline | impulso acumulado = 0 após reiniciar |
| UT-7.1.6 | forcaBruta nunca exposta via evento | `(e as any).forcaBruta === undefined` |
| UT-7.1.7 | Transferência zero-cópia de ArrayBuffer | `buffer.byteLength === 0` após envio |

**Simulacro de Worker para testes:**

```typescript
// testes/simulacros/WorkerSimulacro.ts
export class WorkerSimulacro {
  onmessage: ((e: MessageEvent) => void) | null = null;
  mensagensPostadas: object[] = [];

  postMessage(dados: object) {
    this.mensagensPostadas.push(dados);
    // Processa sincronamente no simulacro
    this.onmessage?.({ data: dados } as MessageEvent);
  }
  terminate() {}
}
```

---

### T-7.2 — FonteWebSocket

**Arquivos a criar:** `src/adaptadores/FonteWebSocket.ts`

**Testes:**

| ID | Cenário | Verificação |
|----|---------|------------|
| UT-7.2.1 | Mensagem LEITURA → evento 'dados' | detail é LeituraProcessada |
| UT-7.2.2 | Mensagem CONFIG → evento 'config' | detail é PacoteConfiguracao |
| UT-7.2.3 | Mensagem STATUS → evento 'status' | detail é PacoteStatus |
| UT-7.2.4 | SERIAL_OFF → obterStatus().conectado = false | estado atualizado |
| UT-7.2.5 | enviarComando() → ws.send() com JSON | JSON.parse sem erro |
| UT-7.2.6 | WebSocket fecha → evento 'status' | conectado=false |
| UT-7.2.7 | forcaBruta nunca em evento 'dados' | invariante |

---

### T-7.3 — FonteWebSerial

**Arquivos a criar:** `src/adaptadores/FonteWebSerial.ts`

**Simulacro da Web Serial API:**

```typescript
// testes/simulacros/WebSerialSimulacro.ts
export function instalarMockSerial() {
  const simulacro = {
    requestPort: vi.fn().mockResolvedValue(criarPortaSimulacro()),
    getPorts:    vi.fn().mockResolvedValue([]),
  };
  Object.defineProperty(navigator, 'serial', { value: simulacro, writable: true });
  return simulacro;
}
```

**Testes:**

| ID | Cenário | Verificação |
|----|---------|------------|
| UT-7.3.1 | conectar() chama requestPort() | mock chamado 1× |
| UT-7.3.2 | Bytes válidos → evento 'dados' com LeituraProcessada | forcaNewton definido |
| UT-7.3.3 | Bytes inválidos (CRC ruim) → evento 'erro' | sem crash da aplicação |
| UT-7.3.4 | Pipeline instanciado no Worker | processamento off-thread |
| UT-7.3.5 | desconectar() fecha a porta | `porta.close()` chamado |
| UT-7.3.6 | forcaBruta nunca exposta | invariante |
| UT-7.3.7 | obterStatus() retorna transporte 'webserial' | campo correto |

---

### T-7.4 — ArmazenamentoLocal (IndexedDB)

**Arquivos a criar:** `src/armazenamento/ArmazenamentoLocal.ts`

**Simulacro de IndexedDB:**

```typescript
// usa biblioteca 'fake-indexeddb' no ambiente de testes
import 'fake-indexeddb/auto';
```

**Testes:**

| ID | Cenário | Verificação |
|----|---------|------------|
| UT-7.4.1 | criarSessao() → id gerado automaticamente | `id !== undefined` |
| UT-7.4.2 | listarSessoes() após criar 3 | retorna 3 sessões |
| UT-7.4.3 | excluirSessao() remove da lista | listar retorna N-1 |
| UT-7.4.4 | adicionarLeituras() → obterLeituras() round-trip | count correto |
| UT-7.4.5 | excluirSessao() em cascata remove leituras | obterLeituras retorna [] |
| UT-7.4.6 | exportarCSV() retorna string com cabeçalho | primeira linha começa com `#` |
| UT-7.4.7 | salvarMetadados() + obterMetadados() round-trip | massaPropelente recuperada |
| UT-7.4.8 | obterMetadados() sessão sem metadados → null | retorna null |

---

### T-7.5 — DetectorAmbiente

**Arquivos a criar:** `src/nucleo/DetectorAmbiente.ts`

**Testes:**

| ID | Cenário | Verificação |
|----|---------|------------|
| UT-7.5.1 | Gateway disponível → Cenário A | cenario='A', FonteWebSocket |
| UT-7.5.2 | Gateway disponível + API → ArmazenamentoRemoto | armazenamento correto |
| UT-7.5.3 | Gateway disponível + sem API → ArmazenamentoLocal | fallback correto |
| UT-7.5.4 | Sem gateway + WebSerial → Cenário C | cenario='C', FonteWebSerial |
| UT-7.5.5 | Sem gateway + sem WebSerial + BT → Cenário B | cenario='B', FonteBluetooth |
| UT-7.5.6 | Nada disponível → throw | mensagem de erro clara |
| UT-7.5.7 | onProgresso chamado durante detecção | ao menos 1 chamada |
| UT-7.5.8 | Timeout respeita 1500ms | mock com delay > 1500ms → false |

---

### T-7.6 — GerenciadorSessao

**Arquivos a criar:** `src/nucleo/GerenciadorSessao.ts`

**Especificação:**
- `iniciarGravacao()` → cria sessão no armazenamento, começa a bufferizar leituras
- `adicionarLeitura(leitura)` → adiciona ao buffer em memória
- `pararGravacao()` → flush do buffer para armazenamento, retorna SessaoTeste
- Buffer é salvo em lote a cada N leituras ou a cada T segundos

**Testes:**

| ID | Cenário | Verificação |
|----|---------|------------|
| UT-7.6.1 | iniciarGravacao() → sessão criada no armazenamento | sessão com id |
| UT-7.6.2 | adicionarLeitura() × N → flush automático | leituras salvas em lote |
| UT-7.6.3 | pararGravacao() → retorna sessão com métricas | forcaMaximaN calculada |
| UT-7.6.4 | pararGravacao() sem iniciarGravacao() → throw | mensagem clara |
| UT-7.6.5 | forcaMaximaN = max das leituras gravadas | verificar valor |
| UT-7.6.6 | impulsoTotalNs = último impulsoAcumuladoNs | verificar valor |

---

## Fase 8 — Docker, E2E e Integração Final

---

### T-8.1 — docker-compose.yml completo

**Arquivos a criar:** `docker/docker-compose.yml`, `docker/docker-compose.mariadb.yml`

**Testes de integração — IT-8.1:**

```bash
# Smoke test do stack completo
docker compose -f docker/docker-compose.yml up -d
curl -f http://localhost:8765/saude   # gateway
curl -f http://localhost:3000/saude   # api
curl -f http://localhost:80/          # webapp
docker compose down
```

| ID | Cenário | Verificação |
|----|---------|------------|
| IT-8.1.1 | Stack SQLite sobe sem erros | todos os containers em `healthy` |
| IT-8.1.2 | Stack MariaDB sobe sem erros | idem com mariadb.yml |
| IT-8.1.3 | API cria sessão no SQLite | curl POST /sessoes com chave |
| IT-8.1.4 | API cria sessão no MariaDB | idem via MariaDB |
| IT-8.1.5 | Dados persistem após restart do container api | volume montado corretamente |

---

### T-8.2 — Testes E2E — Tela de Conexão

**Arquivo:** `ponta-a-ponta/telaConexao.spec.ts`

```typescript
test('E2E-1: detecção automática exibe resultado na tela', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('status-deteccao')).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('status-deteccao')).not.toHaveText('');
});

test('E2E-2: permite digitar IP manualmente (GitHub Pages)', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('radio', { name: /tvbox/i }).check();
  await page.getByLabel(/endereço ip/i).fill('192.168.1.100');
  await page.getByLabel(/chave de api/i).fill('minha-chave-teste');
  // Formulário aceitou sem erros de validação
  await expect(page.getByRole('button', { name: /conectar/i })).toBeEnabled();
});

test('E2E-3: lista portas WebSerial quando disponíveis', async ({ page }) => {
  await page.addInitScript({ path: './simulacros/webserial-simulacro.js' });
  await page.goto('/');
  await page.getByRole('radio', { name: /webserial/i }).check();
  await expect(page.getByTestId('lista-portas')).toBeVisible();
});

test('E2E-4: configuração salva em localStorage', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('radio', { name: /tvbox/i }).check();
  await page.getByLabel(/endereço ip/i).fill('10.0.0.1');
  // Recarrega a página
  await page.reload();
  // IP deve estar preenchido
  await expect(page.getByLabel(/endereço ip/i)).toHaveValue('10.0.0.1');
});
```

---

### T-8.3 — Testes E2E — Medição em Tempo Real

**Arquivo:** `ponta-a-ponta/medicao.spec.ts`

```typescript
test('E2E-5: Cenário C — exibe força calibrada em tempo real', async ({ page }) => {
  await page.addInitScript({ path: './simulacros/webserial-simulacro.js' });
  await page.goto('/');
  await page.getByRole('radio', { name: /webserial/i }).check();
  await page.getByRole('button', { name: /conectar/i }).click();

  // Simula chegada de pacote
  await page.evaluate(() => window.__simulacroSerial.enviarPacote({
    tipo: 'DADOS', marcaTemporal: 1000, forcaBruta: 200, temperatura: 25, sequencia: 1,
  }));

  await expect(page.getByTestId('valor-forca')).toContainText('N');
  // Nunca mostra ADC bruto
  const texto = await page.getByTestId('valor-forca').textContent();
  expect(texto).toMatch(/\d+[,\.]\d+ N/);
});

test('E2E-6: iniciar e parar gravação cria sessão', async ({ page }) => {
  // ...setup conexão...
  await page.getByRole('button', { name: /iniciar/i }).click();
  // Envia 10 leituras simuladas
  for (let i = 0; i < 10; i++) {
    await page.evaluate((i) => window.__simulacroSerial.enviarPacote({
      tipo: 'DADOS', marcaTemporal: i * 10, forcaBruta: 150 + i, temperatura: 25, sequencia: i,
    }), i);
  }
  await page.getByRole('button', { name: /parar/i }).click();
  // Sessão aparece na lista
  await page.getByRole('link', { name: /sessões/i }).click();
  await expect(page.getByTestId('lista-sessoes')).toContainText('Sessão');
});

test('E2E-7: botão TARAR envia comando para o ESP32', async ({ page }) => {
  // ...setup conexão Cenário C...
  await page.getByRole('button', { name: /tarar/i }).click();
  const comandoEnviado = await page.evaluate(
    () => window.__simulacroSerial.ultimoComandoRecebido
  );
  expect(comandoEnviado.comando).toBe('TARAR');
});
```

---

### T-8.4 — Testes E2E — Relatório e Exportações

**Arquivo:** `ponta-a-ponta/relatorio.spec.ts`

```typescript
test('E2E-8: nome do motor no formato "B1.7"', async ({ page }) => {
  await page.goto(`/sessoes/${sessaoFixtura.id}`);
  await expect(page.getByTestId('nome-motor')).toHaveText(/^[A-Z0-9\/]+\d+\.\d$/);
});

test('E2E-9: perfil de queima exibido', async ({ page }) => {
  await page.goto(`/sessoes/${sessaoFixtura.id}`);
  await expect(page.getByTestId('perfil-queima')).not.toBeEmpty();
  await expect(page.getByTestId('perfil-queima')).toContainText(/neutro|progressivo|regressivo/i);
});

test('E2E-10: download do PDF gerado', async ({ page }) => {
  await page.goto(`/sessoes/${sessaoFixtura.id}`);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /gerar pdf/i }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  expect(await download.path()).toBeTruthy();
});

test('E2E-11: download do .eng para OpenRocket', async ({ page }) => {
  await page.goto(`/sessoes/${sessaoFixtura.id}`);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /\.eng/i }).click(),
  ]);
  const conteudo = await lerArquivoDownload(download);
  expect(conteudo).toMatch(/^;/m);                    // comentários
  expect(conteudo).toMatch(/^[A-Z][\d.]+\s+\d+/m);   // linha de cabeçalho
  expect(conteudo).toMatch(/\s+0\.000$/m);            // ponto final
});

test('E2E-12: sessão sem metadados → Isp mostra instrução', async ({ page }) => {
  await page.goto(`/sessoes/${sessaoSemMetadados.id}`);
  await expect(page.getByTestId('valor-isp')).toContainText(/aguardando|massa/i);
});

test('E2E-13: formulário de metadados preenche Isp', async ({ page }) => {
  await page.goto(`/sessoes/${sessaoSemMetadados.id}`);
  await page.getByRole('button', { name: /metadados/i }).click();
  await page.getByLabel(/massa propelente/i).fill('30');
  await page.getByRole('button', { name: /salvar/i }).click();
  await expect(page.getByTestId('valor-isp')).toContainText(/\d+[,\.]\d+ s/);
});
```

---

## Matriz de dependências entre fases

```
Fase 1 (protocolo)
  └── Fase 2 (processamento)
        ├── Fase 3 (analise)
        │     └── Fase 4 (relatorio)
        │           └── Fase 7 (aplicacao) ←──────────────┐
        ├── Fase 5 (gateway)                               │
        └── Fase 6 (api) ──────────────────────────────────┘
                                 Fase 8 (docker + E2E)
```

**Paralelismo possível:**
- Fase 3 e Fase 5 podem ser desenvolvidas em paralelo após Fase 2
- Fase 6 é independente e pode começar junto com a Fase 1
- Fase 4 começa apenas após Fase 3

---

## Resumo de testes por fase

| Fase | Unitários | Integração | E2E | Total |
|------|-----------|-----------|-----|-------|
| 1 — protocolo | 22 | — | — | 22 |
| 2 — processamento | 39 | — | — | 39 |
| 3 — analise | 33 | — | — | 33 |
| 4 — relatorio | 32 | — | — | 32 |
| 5 — gateway | 17 | 3 | — | 20 |
| 6 — api | 6 | 12 | — | 18 |
| 7 — aplicacao | 42 | — | — | 42 |
| 8 — docker + E2E | — | 5 | 13 | 18 |
| **Total** | **191** | **20** | **13** | **224** |

---

## Comandos de execução dos testes

```bash
# Rodar todos os testes
npm test

# Por fase/pacote
npm test --workspace=pacotes/protocolo
npm test --workspace=pacotes/processamento
npm test --workspace=pacotes/analise
npm test --workspace=pacotes/relatorio
npm test --workspace=pacotes/gateway
npm test --workspace=pacotes/api
npm test --workspace=pacotes/aplicacao

# Apenas testes de integração
npm run testar:integracao

# Cobertura completa
npm run testar:cobertura

# Ponta-a-ponta (requer app rodando)
npm run testar:e2e

# Watch mode durante desenvolvimento
npm test -- --watch --workspace=pacotes/processamento

# Modo CI (sem watch, com relatório JUnit)
npm run testar:ci
```

---

## Configuração do ambiente de testes (`vitest.config.ts` raiz)

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals:     true,
    environment: 'node',       // browser nos pacotes que precisam
    coverage: {
      provider:   'v8',
      reporter:   ['text', 'html', 'lcov'],
      thresholds: {
        lines:      90,
        functions:  90,
        branches:   85,
        statements: 90,
      },
      exclude: ['**/simulacros/**', '**/ponta-a-ponta/**', '**/*.d.ts'],
    },
  },
});
```

```typescript
// pacotes/aplicacao/vitest.config.ts  (override para browser APIs)
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globals:     true,
    environment: 'jsdom',
    setupFiles:  ['./testes/configuracao.ts'],
  },
});
```

---

*Plano de implementação — BalançaGFIG · GFIG / IFSC Campus Gaspar*