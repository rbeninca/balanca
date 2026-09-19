# Reorganização do processamento de sinal em três etapas

Branch: `feat/processamento-3-etapas`. Base: v2.3.0.

## Objetivo

Dividir o pipeline em **Limpeza → Filtro principal → Tratamento**, com um só
suavizador ativo por vez, novos filtros (Hampel, Butterworth, Zero Tracking,
Detrend offline), estimativa real da taxa de amostragem, sinais intermediários
preservados e configuração reproduzível. Sem remover filtros existentes; TS e
Kotlin sempre equivalentes.

```
Entrada (Newtons da ESP)
  ↓
1. LIMPEZA        Hampel → Mediana → Notch          (checkboxes, combináveis)
  ↓
2. PRINCIPAL      nenhum | média móvel | EMA | Butterworth | Savitzky-Golay | Kalman   (radio)
  ↓
3. TRATAMENTO     Zona morta · Zero tracking · Detector de evento               (checkboxes)
  ↓
Display · Detector · Impulso · Armazenamento
```

## Situação de partida (v2.3.0)

Ordem atual: `Notch → Mediana → Zona morta → suavizadores encadeáveis → Detector → Impulso`.
Acoplamentos que serão desfeitos, cada um em fase própria porque **mudam resultado**:

- A Zona morta roda **antes** do suavizador; passará a rodar depois (etapa 3).
- O detector usa `limiarZonaMortaN` como limiar de queima.
- O impulso ao vivo integra o sinal **após** a zona morta (é isso que evita o
  ruído de repouso acumular). O padrão continua sendo esse (`final`); a fonte
  vira escolha explícita (`fonteCalculoImpulso`).
- O banco guarda `forca_crua` (sem filtros do pipeline) + `em_queima` e
  impulso calculados sobre o filtrado, sem registrar a configuração usada.

## Decisões

1. **Fase 0 primeiro**: *golden files* da saída atual do pipeline para um sinal
   fixo, em várias configurações. É a prova de "comportamento preservado".
2. **Kotlin acompanha cada fase** (o box é o gateway em uso: o painel manda
   `PIPELINE_CONFIG` para ele; campo que o Kotlin não entende vira filtro que
   "está ativo" e não faz nada).
3. **Equivalência TS ↔ Kotlin por fixtures**: o vitest gera
   `pacotes/processamento/testes/fixtures/*.json` (`entrada`, `config`,
   `saida`), o Gradle copia para os recursos de teste e o JUnit reproduz.
   Tolerância 1e-9 (FIR, mediana, Hampel) e 1e-6 (IIR: Notch, Butterworth,
   Kalman).
4. **Fs por média, não mediana**: a `marcaTemporal` da ESP é em ms inteiros
   (Δt alterna 12/13 ms a 80 Hz); `Fs = (n−1)·1000/(t_último − t_primeiro)`
   em janela de 64–128 amostras, histerese de 5 % para reconstruir Notch e
   Butterworth, janelas com salto (> 3× Δt) descartadas.
5. **Hampel causal** (janela das últimas N amostras avaliando a mais recente),
   com piso em σ (`max(1.4826·MAD, ε)`) — MAD = 0 em sinal quantizado tornaria
   qualquer desvio um outlier e engoliria degraus reais para sempre. Um degrau
   é atrasado até (N+1)/2 amostras, documentado.
6. **Zero tracking**: terceiro "zero" do sistema (tara da ESP, `deslocamentoTara`,
   este). Aplica só ao sinal final, offset visível no painel, **pausa durante
   gravação** e durante evento.
7. **Sinais intermediários**: não vão para o banco. O que vai é a
   **configuração do pipeline (e da ESP) nos metadados da sessão** — com
   `forca_crua` + config qualquer intermediário é reproduzível. Ao vivo, o WS
   só manda `limpa`/`suavizada` quando a sobreposição estiver ligada.
8. **Detrend** é offline: fica na análise (`pacotes/analise`), opção não
   destrutiva registrada nos metadados.
9. "Sugerir" passa a sugerir também os limiares do detector (entrada ≈ 4× e
   saída ≈ 2× o piso de ruído).

## Andamento

- Fase 0 ✔ (`408b50d`): 9 golden files; Kotlin coincide com o TS até 1e-12.
- Fase 1 ✔: `aplicarLimpeza` / `aplicarFiltroPrincipal` / `aplicarTratamento`
  nos dois lados, `SinaisPipeline {bruta, limpa, suavizada, filtrada}` interno.
  A zona morta ainda roda entre a limpeza e o principal (legado até a Fase 6)
  e a limpeza mantém `Notch → Mediana`; a ordem `Hampel → Mediana → Notch` da
  proposta é decidida na Fase 4 (trocar Mediana/Notch muda resultado).

## Fases

Cada fase termina compilando, com testes passando (TS, JUnit) e comportamento
anterior preservado salvo onde a fase diz o contrário.

| # | Fase | Alcance |
|---|---|---|
| 0 | Golden tests do pipeline atual | TS + fixtures + JUnit de equivalência |
| 1 | Refatorar em 3 etapas mantendo a ordem atual | TS + Kotlin |
| 2 | `filtroPrincipal` exclusivo, compatível com os booleans | TS + Kotlin + painel (radio) |
| 3 | `EstimadorTaxaAmostragem` + Notch com Fs real | TS + Kotlin |
| 4 | Hampel | TS + Kotlin + painel |
| 5 | Butterworth 2ª ordem (biquad), validação `fc < Fs/2` | TS + Kotlin + painel |
| 6 | Zona morta para a etapa 3 + `fonteCalculoImpulso` | mudança documentada |
| 7 | Detector com `limiarEntrada/Saída` e `tempoEntrada/Saída` + "sugerir" | TS + Kotlin |
| 8 | Zero tracking | TS + Kotlin |
| 9 | Painel em 3 blocos + pipeline visual + `atrasoAmostras` | frontend |
| 10 | Configuração do pipeline nos metadados da sessão | banco + API + Kotlin |
| 11 | Detrend offline na análise | analise + frontend |
| 12 | Presets (pesagem, motor, impacto, bruto…) | frontend |

## Testes mínimos por filtro

Constante · degrau · impulso · ruído gaussiano · spike isolado · senoide.
Filtros de frequência: seno abaixo, no e acima do corte (ganho medido).
Hampel: outlier isolado, mudança sustentada, MAD = 0.
Zero tracking: deriva lenta sem carga, força real constante, evento transitório.
Pipeline: ordem das etapas, `filtroPrincipal` de cada tipo, nunca dois principais.
