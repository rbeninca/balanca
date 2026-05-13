# BalançaGFIG — Visão Executiva do Plano

> Tabela consolidada de todas as tarefas, testes e etapas do projeto.
> Companion ao documento detalhado `balancaGFIG-plano-implementacao.md`.

---

## 1. Objetivo Geral do Projeto

Reescrever o sistema BalançaGFIG eliminando a dependência do servidor Python,
mantendo o firmware ESP32 inalterado, organizando o código em monorepo
TypeScript com 7 pacotes independentes e testáveis.

**Três cenários de operação suportados:**

| Cenário | Hardware | Onde processa | Onde armazena |
|---------|----------|---------------|---------------|
| **A** | ESP32 → TVBox (Armbian) | Gateway Node.js | SQLite ou MariaDB via API |
| **B** | ESP32 → TVBox + Android | Gateway Node.js | SQLite ou MariaDB via API |
| **C** | ESP32 → PC direto | WebWorker no browser | IndexedDB local |

**Resultado esperado:** sistema mais robusto, manutenível, com análise científica
completa do motor (RMS, σ, CV, perfil de queima, anomalias, classificação NAR
"B1.7", exportação RASP `.eng` para OpenRocket).

---

## 2. Tabela Mestre — Todas as 37 Tarefas

### Legenda
- **UT** = testes unitários · **IT** = testes de integração · **E2E** = ponta-a-ponta
- **Crit?** = tarefa no caminho crítico (bloqueia outras fases)

### Fase 1 — `pacotes/protocolo` (Codec CRC16-CCITT)

| ID | Tarefa | Entregável | UT | IT | E2E | Crit? | Dep. |
|----|--------|-----------|----|----|-----|-------|------|
| T-1.1 | Tipos do protocolo | `tipos.ts` (PacoteDados, Configuracao, Comando, Status) | 0 | — | — | ✓ | — |
| T-1.2 | CRC16-CCITT | `crc16.ts` (polinômio 0x1021, seed 0xFFFF) | 5 | — | — | ✓ | T-1.1 |
| T-1.3 | Codificador objeto→bytes | `codificador.ts` (encode) | 6 | — | — | ✓ | T-1.2 |
| T-1.4 | Decodificador bytes→objeto | `codificador.ts` (decode + CRC check) | 8 | — | — | ✓ | T-1.3 |
| **Subtotal Fase 1** | | | **19** | **0** | **0** | | |

### Fase 2 — `pacotes/processamento` (Pipeline de tempo real)

| ID | Tarefa | Entregável | UT | IT | E2E | Crit? | Dep. |
|----|--------|-----------|----|----|-----|-------|------|
| T-2.1 | Tipos do processamento | `tipos.ts` (LeituraProcessada, ConfiguracaoPipeline) | 0 | — | — | ✓ | T-1.1 |
| T-2.2 | Calibrador | `Calibrador.ts` (forçaBruta→Newtons) | 5 | — | — | ✓ | T-2.1 |
| T-2.3 | ZonaMorta | `ZonaMorta.ts` (filtro de ruído) | 6 | — | — | ✓ | T-2.1 |
| T-2.4 | MediaMovel | `MediaMovel.ts` (janela deslizante) | 5 | — | — | ✓ | T-2.1 |
| T-2.5 | DetectorQueima | `DetectorQueima.ts` (FSM com histerese) | 6 | — | — | ✓ | T-2.1 |
| T-2.6 | CalculadorImpulso | `CalculadorImpulso.ts` (integração trapezoidal) | 6 | — | — | ✓ | T-2.1 |
| T-2.7 | PipelineProcessamento | `PipelineProcessamento.ts` (orquestra T-2.2 a T-2.6) | 8 | — | — | ✓ | T-2.2 a T-2.6 |
| **Subtotal Fase 2** | | | **36** | **0** | **0** | | |

### Fase 3 — `pacotes/analise` (Análise pós-sessão)

| ID | Tarefa | Entregável | UT | IT | E2E | Crit? | Dep. |
|----|--------|-----------|----|----|-----|-------|------|
| T-3.1 | ClassificadorNAR | `ClassificadorNAR.ts` (letra A–O, nome "B1.7") | 8 | — | — | ✓ | T-2.1 |
| T-3.2 | ClassificadorPerfil | `ClassificadorPerfil.ts` (progressivo/regressivo/neutro/platô) | 7 | — | — | | T-2.1 |
| T-3.3 | DetectorAnomalias | `DetectorAnomalias.ts` (oscilação, CV, ignição) | 8 | — | — | | T-2.1 |
| T-3.4 | AnalisadorMotor | `AnalisadorMotor.ts` (RMS, σ, CV, t₁₀, t₉₀, Isp, Ct) | 11 | — | — | ✓ | T-3.1, T-3.2, T-3.3 |
| T-3.5 | ComparadorSessoes | `ComparadorSessoes.ts` (sobreposição de múltiplos testes) | 4 | — | — | | T-3.4 |
| **Subtotal Fase 3** | | | **38** | **0** | **0** | | |

### Fase 4 — `pacotes/relatorio` (PDF + exportações)

| ID | Tarefa | Entregável | UT | IT | E2E | Crit? | Dep. |
|----|--------|-----------|----|----|-----|-------|------|
| T-4.1 | ExportadorCSV | `ExportadorCSV.ts` (com `;` para Excel BR/PT) | 9 | — | — | | T-3.4 |
| T-4.2 | ExportadorJSON | `ExportadorJSON.ts` (versionado, formato estável) | 8 | — | — | | T-3.4 |
| T-4.3 | ExportadorENG | `ExportadorENG.ts` (RASP para OpenRocket) | 10 | — | — | ✓ | T-3.4 |
| T-4.4 | GeradorPDF | `GeradorPDF.ts` + 6 seções + 4 gráficos | 8 | — | — | ✓ | T-3.4 |
| **Subtotal Fase 4** | | | **35** | **0** | **0** | | |

### Fase 5 — `pacotes/gateway` (Bridge serial↔WebSocket)

| ID | Tarefa | Entregável | UT | IT | E2E | Crit? | Dep. |
|----|--------|-----------|----|----|-----|-------|------|
| T-5.1 | PortaSerial | `PortaSerial.ts` (com reconexão automática + backoff) | 7 | — | — | ✓ | T-1.4 |
| T-5.2 | ServidorWebSocket bidirecional | `ServidorWebSocket.ts` (DADOS→pipeline, CONFIG/STATUS direto) | 9 | 3 | — | ✓ | T-2.7, T-5.1 |
| T-5.3 | Principal + healthcheck | `principal.ts` + endpoint `/saude` | 3 | — | — | | T-5.2 |
| **Subtotal Fase 5** | | | **19** | **3** | **0** | | |

### Fase 6 — `pacotes/api` (Persistência)

| ID | Tarefa | Entregável | UT | IT | E2E | Crit? | Dep. |
|----|--------|-----------|----|----|-----|-------|------|
| T-6.1 | ProvedorSQLite | `ProvedorSQLite.ts` (WAL, foreign_keys) | 6 | — | — | ✓ | — |
| T-6.2 | ChaveAPI middleware | `ChaveAPI.ts` + `gerarChave.ts` | 5 | — | — | ✓ | — |
| T-6.3 | Rotas de sessões | `rotas/sessoes.ts` (GET/POST/DELETE) | 0 | 6 | — | ✓ | T-6.1, T-6.2 |
| T-6.4 | Rotas leituras + metadados | `rotas/leituras.ts`, `rotas/metadados.ts` | 0 | 6 | — | ✓ | T-6.3 |
| **Subtotal Fase 6** | | | **11** | **12** | **0** | | |

### Fase 7 — `pacotes/aplicacao` (WebApp SPA)

| ID | Tarefa | Entregável | UT | IT | E2E | Crit? | Dep. |
|----|--------|-----------|----|----|-----|-------|------|
| T-7.1 | TrabalhadorSerial WebWorker | `TrabalhadorSerial.worker.ts` (off-thread) | 7 | — | — | ✓ | T-2.7 |
| T-7.2 | FonteWebSocket | `FonteWebSocket.ts` (Cenário A/B) | 7 | — | — | ✓ | T-5.2 |
| T-7.3 | FonteWebSerial | `FonteWebSerial.ts` (Cenário C) | 7 | — | — | ✓ | T-7.1 |
| T-7.4 | ArmazenamentoLocal | `ArmazenamentoLocal.ts` (IndexedDB) | 8 | — | — | ✓ | T-2.1 |
| T-7.5 | DetectorAmbiente | `DetectorAmbiente.ts` (escolhe cenário) | 8 | — | — | ✓ | T-7.2, T-7.3 |
| T-7.6 | GerenciadorSessao | `GerenciadorSessao.ts` (buffer + flush) | 6 | — | — | ✓ | T-7.4 |
| **Subtotal Fase 7** | | | **43** | **0** | **0** | | |

### Fase 8 — Docker + Testes E2E (Integração Final)

| ID | Tarefa | Entregável | UT | IT | E2E | Crit? | Dep. |
|----|--------|-----------|----|----|-----|-------|------|
| T-8.1 | docker-compose.yml | `docker/*.yml` (SQLite default + override MariaDB) | 0 | 5 | — | ✓ | T-5.3, T-6.4 |
| T-8.2 | E2E Tela de Conexão | `ponta-a-ponta/telaConexao.spec.ts` | 0 | — | 4 | | T-7.5 |
| T-8.3 | E2E Medição | `ponta-a-ponta/medicao.spec.ts` | 0 | — | 3 | | T-7.6 |
| T-8.4 | E2E Relatório | `ponta-a-ponta/relatorio.spec.ts` | 0 | — | 6 | ✓ | T-4.4 |
| **Subtotal Fase 8** | | | **0** | **5** | **13** | | |

### Totais Gerais

| Fase | UT | IT | E2E | Total |
|------|----|----|-----|-------|
| 1 — protocolo | 19 | 0 | 0 | 19 |
| 2 — processamento | 36 | 0 | 0 | 36 |
| 3 — analise | 38 | 0 | 0 | 38 |
| 4 — relatorio | 35 | 0 | 0 | 35 |
| 5 — gateway | 19 | 3 | 0 | 22 |
| 6 — api | 11 | 12 | 0 | 23 |
| 7 — aplicacao | 43 | 0 | 0 | 43 |
| 8 — docker + E2E | 0 | 5 | 13 | 18 |
| **TOTAL** | **201** | **20** | **13** | **234** |

---

## 3. Etapas de Implementação (Marcos do Projeto)

### Marco M1 — Fundação (Fases 1 + 2)
**O que entrega:** codec do protocolo + pipeline de processamento testados.
Núcleo TypeScript puro, sem dependências de Node ou browser.

**Critério de aceite do marco:**
- `npm test --workspace=pacotes/protocolo` → 19/19 testes verdes
- `npm test --workspace=pacotes/processamento` → 36/36 testes verdes
- Cobertura ≥ 90% nos dois pacotes

**Tarefas:** T-1.1, T-1.2, T-1.3, T-1.4, T-2.1, T-2.2, T-2.3, T-2.4, T-2.5, T-2.6, T-2.7
**Total de testes:** 55

### Marco M2 — Análise Científica (Fase 3)
**O que entrega:** análise pós-sessão completa — todas as métricas que o
relatório atual não tem (RMS, σ, CV, perfil de queima, anomalias, "B1.7").

**Critério de aceite do marco:**
- `npm test --workspace=pacotes/analise` → 38/38 testes verdes
- Teste com dados reais da sessão "Fernanda 1.11" produz `letraMotor='B'`,
  `nomeComum='B1.7'`, `perfilQueima='neutro-plato'`
- Cobertura ≥ 90%

**Tarefas:** T-3.1, T-3.2, T-3.3, T-3.4, T-3.5
**Total de testes:** 38

### Marco M3 — Documentos (Fase 4)
**O que entrega:** geração de PDF, CSV, JSON e RASP `.eng`. Funciona
exclusivamente no browser (sem dependências de servidor).

**Critério de aceite do marco:**
- `npm test --workspace=pacotes/relatorio` → 35/35 testes verdes
- Arquivo `.eng` gerado importa corretamente no OpenRocket (teste manual)
- PDF gerado abre sem erros em Chrome/Firefox/Edge
- Cobertura ≥ 90%

**Tarefas:** T-4.1, T-4.2, T-4.3, T-4.4
**Total de testes:** 35

### Marco M4 — Servidores (Fases 5 + 6) — paralelizável
**O que entrega:** gateway bidirecional + API REST com SQLite/MariaDB.

**Critério de aceite do marco:**
- `npm test --workspace=pacotes/gateway` → 22/22 testes verdes
- `npm test --workspace=pacotes/api` → 23/23 testes verdes
- Teste de integração: ciclo TARAR/OBTER_CONFIG/DEFINIR_CONFIG completo
- API funcional tanto com SQLite quanto com MariaDB

**Tarefas:** T-5.1, T-5.2, T-5.3, T-6.1, T-6.2, T-6.3, T-6.4
**Total de testes:** 45

### Marco M5 — WebApp (Fase 7)
**O que entrega:** SPA funcional para os três cenários, com detecção automática.

**Critério de aceite do marco:**
- `npm test --workspace=pacotes/aplicacao` → 43/43 testes verdes
- Smoke test manual: conexão WebSerial funciona em Chromium
- Smoke test manual: conexão WebSocket com gateway local funciona
- TelaRelatorio exibe nome "B1.7", perfil "neutro-platô", todas as métricas

**Tarefas:** T-7.1, T-7.2, T-7.3, T-7.4, T-7.5, T-7.6
**Total de testes:** 43

### Marco M6 — Implantação Completa (Fase 8)
**O que entrega:** docker-compose pronto para TVBox + suite E2E validando
todos os fluxos críticos do usuário.

**Critério de aceite do marco:**
- `docker compose up` no TVBox → stack saudável em < 30s
- `npm run testar:e2e` → 13/13 testes E2E verdes
- 5 testes de integração de container passando
- Substituição do sistema Python no TVBox sem perda de funcionalidade

**Tarefas:** T-8.1, T-8.2, T-8.3, T-8.4
**Total de testes:** 18

---

## 4. Sequenciamento e Paralelismo

```
                    ┌───────────────────────┐
                    │   M1 — Fundação        │
                    │   Fase 1 + Fase 2      │
                    └────┬────────┬─────────┘
                         │        │
              ┌──────────┘        └──────────┐
              ▼                              ▼
    ┌──────────────────┐          ┌──────────────────┐
    │  M2 — Análise     │          │  M4 — Servidores  │
    │  Fase 3           │          │  Fase 5 + Fase 6  │
    └────────┬─────────┘          └────────┬─────────┘
             ▼                              │
    ┌──────────────────┐                    │
    │  M3 — Documentos  │                    │
    │  Fase 4           │                    │
    └────────┬─────────┘                    │
             │                              │
             └──────────────┬───────────────┘
                            ▼
                  ┌──────────────────┐
                  │  M5 — WebApp      │
                  │  Fase 7           │
                  └────────┬─────────┘
                           ▼
                  ┌──────────────────┐
                  │  M6 — Implantação │
                  │  Fase 8           │
                  └──────────────────┘
```

**Caminho crítico:** M1 → M2 → M3 → M5 → M6
**Branch paralelo:** M4 (servidores) pode ser feito em paralelo a M2+M3+M4
desde que M1 esteja concluído.

**Pontos de sincronização:**
- M4 precisa de M1 (protocolo + processamento)
- M5 precisa de M3 (relatorio) **e** M4 (servidores)
- M6 precisa de M5

---

## 5. Critérios de Done — Resumo Por Nível

### Nível 1 — Tarefa Individual
- Código compila em `tsc --strict`
- Todos os testes unitários da tarefa verdes
- Cobertura ≥ 90% nas linhas da tarefa
- Sem `any` explícito
- Função/classe exportada e tipada

### Nível 2 — Marco (Fase Completa)
- Todos os testes unitários do marco verdes
- Testes de integração do marco verdes
- Cobertura agregada ≥ 90% no pacote
- README do pacote atualizado com exemplo de uso
- Sem warnings do TypeScript ou ESLint

### Nível 3 — Projeto Completo
- Todos os 234 testes (UT+IT+E2E) verdes em CI
- Cobertura agregada do monorepo ≥ 90%
- Docker stack sobe sem erros no TVBox
- Smoke test manual com motor real (KNSB pequeno) bem-sucedido
- Relatório gerado pelo novo sistema é equivalente ou superior ao atual
- Importação do `.eng` no OpenRocket funciona

---

## 6. Estimativa de Esforço (Indicativa)

| Marco | Tarefas | Testes | Esforço relativo |
|-------|---------|--------|------------------|
| M1 — Fundação | 11 | 55 | 20% — base sólida |
| M2 — Análise | 5 | 38 | 15% — código novo (algoritmos) |
| M3 — Documentos | 4 | 35 | 15% — depende de chart libs |
| M4 — Servidores | 7 | 45 | 20% — paralelizável com M2/M3 |
| M5 — WebApp | 6 | 43 | 20% — integração de tudo |
| M6 — Implantação | 4 | 18 | 10% — config + validação |

**Sequência recomendada para um único desenvolvedor:**
M1 → M4 → M2 → M3 → M5 → M6

**Sequência recomendada para dois desenvolvedores:**
Dev A: M1 → M2 → M3 → M5
Dev B: (após M1) M4 → reforça M5 → M6

---

## 7. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| WebSerial não disponível em todos os browsers | Alta | Médio | Detector de ambiente faz fallback automático para Cenário A |
| Firmware ESP32 não responde a OBTER_CONFIG | Alta (firmware atual) | Alto | Adicionar handler no firmware antes do M4 ou usar fatorCalibracao do `.env` |
| Performance do pipeline a 100 Hz no browser | Média | Alto | WebWorker isolado já mitiga; benchmark no T-7.1 |
| Importação `.eng` falhar no OpenRocket | Baixa | Médio | Teste manual no M3 antes de seguir |
| Banco SQLite corromper em queda de energia | Baixa (com WAL) | Alto | WAL + `synchronous=NORMAL` já configurado |
| MariaDB no TVBox consumir muita RAM | Média | Médio | SQLite é padrão; MariaDB só se necessário |

---

## 8. Arquivos Entregáveis do Projeto

```
balancaGFIG/
├── pacotes/                            [37 tarefas]
│   ├── protocolo/        (T-1.1..T-1.4)    →  19 testes
│   ├── processamento/    (T-2.1..T-2.7)    →  36 testes
│   ├── analise/          (T-3.1..T-3.5)    →  38 testes
│   ├── relatorio/        (T-4.1..T-4.4)    →  35 testes
│   ├── gateway/          (T-5.1..T-5.3)    →  22 testes
│   ├── api/              (T-6.1..T-6.4)    →  23 testes
│   └── aplicacao/        (T-7.1..T-7.6)    →  43 testes
├── docker/               (T-8.1)            →   5 testes IT
├── ponta-a-ponta/        (T-8.2..T-8.4)    →  13 testes E2E
└── firmware/             [inalterado]
                                            ───────────
                                            TOTAL: 234 testes
```

---

## 9. Como Acompanhar o Progresso

### Quadro de status por tarefa (sugestão)

| Estado | Significado |
|--------|-------------|
| ⬜ Pendente | Não iniciada |
| 🟨 Em curso | Implementação iniciada, testes não 100% |
| 🟧 Em revisão | Implementação completa, em code review |
| 🟩 Concluída | Testes 100% verdes, cobertura ≥ 90% |

### Métricas de saúde do projeto

```
Cobertura agregada:   ███████░░░  72%    (meta: ≥ 90%)
Testes passando:     189 / 234   (81%)   (meta: 100%)
Tarefas concluídas:   28 / 37    (76%)   (meta: 37/37)
```

Comando para gerar dashboard:
```bash
npm run testar:cobertura -- --reporter=html
# Abre coverage/index.html
```

---

## 10. Próximos Passos Após Concluir o Plano

Depois que o sistema novo estiver em produção:

1. **Migração de dados antigos** — script para importar sessões `.csv`/`.json` do
   sistema Python para o novo banco
2. **Comparação de dois testes** — UI de overlay de curvas (T-3.5 + nova tela)
3. **Análise inversa** — dadas as métricas alvo, sugerir geometria de propelente
4. **Compatibilidade com OpenMotor** — formato de saída adicional além do RASP
5. **Telemetria embarcada** — gravar dados localmente no ESP32 (microSD) como backup

---

*Visão executiva — BalançaGFIG · GFIG / IFSC Campus Gaspar*