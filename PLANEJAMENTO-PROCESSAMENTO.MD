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

- Fase 2 ✔: `filtroPrincipal: 'nenhum' | 'mediaMovel' | 'ema' | 'savitzkyGolay' | 'kalman'`
  exclusivo nos dois lados (`resolverFiltroPrincipal`: campo explícito vence;
  flags antigas — a última na ordem MM → EMA → SG → Kalman — continuam aceitas
  e são devolvidas no `PIPELINE_ESTADO` para clientes antigos). Painel com
  radio + "Sem suavização"; o frontend manda campo novo + flags exclusivas,
  então funciona com gateway anterior. **Mudança de comportamento**: encadear
  dois suavizadores deixou de existir; golden `sg-e-kalman-encadeados` virou
  `flags-sg-e-kalman-vira-kalman`, `tudo-ligado` regravado (principal = Kalman).

- Fase 3 ✔: `EstimadorTaxaAmostragem` (TS e Kotlin): média em janela de 128
  marcas, salto recomeça a janela, valor estável com histerese de **1 %**
  avaliada só com a janela cheia (5 % avançava em degraus e travou em 86,3 Hz
  com Fs real de 83,5 — para um Notch de Q = 30 isso tira o centro da
  frequência; janela de 64 oscilava ±1,5 % pelo jitter de polling da ESP). O
  pipeline usa a Fs estimada quando `taxaAmostragemHz` não foi fixada e
  reconstrói o Notch a cada mudança; `PIPELINE_ESTADO.taxaEstimadaHz`, painel
  mostra "Fs ≈ 83,6 Hz". **Mudança de comportamento**: o Notch deixa de
  assumir 100 Hz — passa a rejeitar a frequência certa. Golden files intactos
  (fixam `taxaAmostragemHz: 80`). No TX9: 83,55 Hz estável (real 83,46).

- Fase 4 ✔: `FiltroHampel` causal (TS e Kotlin), janela ímpar (7), K (3), piso
  em σ (1e-3 N); `aplicarDetalhado` devolve `{valor, outlier}` para o gráfico
  no futuro. Limpeza passa a `Hampel → Mediana → Notch` (spikes antes do
  IIR) — **mudança de comportamento** para quem usa Mediana + Notch juntos;
  golden `mediana-5-notch-60` e `tudo-ligado` regravados, `hampel-7` e
  `hampel-mediana-notch` novos, os demais idênticos. Caso limite documentado
  nos testes e na ajuda: em sinal perfeitamente liso, logo após um pico o
  Hampel com K = 3 pode marcar 1 amostra (K = 3,5 resolve); com ruído real
  ~4 % de falsos positivos em janela 7, inofensivos (viram a mediana).
  Achado no TX9 que corrigiu a Fase 3: as marcas da ESP têm resolução de
  10 ms e um gap de 30–40 ms a cada 500 ms (display) — o `fatorSalto = 3`
  tratava isso como pausa e a Fs oscilava a cada 0,5 s (2 difusões/s de
  PIPELINE_ESTADO). Agora salto = 8 períodos (~100 ms) e janela 256 (~3 s):
  1 difusão em 15 s, 83,33 Hz.

- Fase 5 ✔: `FiltroButterworth` passa-baixa 2ª ordem (biquad, Q = 1/√2) em TS
  e Kotlin, opção `'butterworth'` do filtro principal com `frequenciaCorteHz`
  (padrão 10). Usa a Fs real (fixada ou estimada) e recalcula os coeficientes
  mantendo o estado quando ela muda. `fc ≥ Fs/2` → filtro ignorado (passa
  direto) e `butterworthValido: false` no estado; o painel mostra "Nyquist
  41,7 Hz" e o aviso. Ganhos medidos (fc 10 Hz, Fs 80): 2 Hz > 0,97; 10 Hz
  0,66–0,75; 30 Hz < 0,12 — nos dois lados. Golden `butterworth-10` novo,
  demais idênticos. Clientes antigos (só flags) veem Butterworth como
  'nenhum' no estado — não há flag para ele. O gateway agora loga (debug)
  cada `PIPELINE_CONFIG` com o remetente: foi assim que se viu que uma aba
  antiga do frontend (bundle anterior à Fase 2) reenvia flags e derruba o
  filtro principal para 'nenhum' — basta recarregar a página (o box já serve
  index.html com `Cache-Control: no-cache`).

- Fase 6 ✔: Zona Morta migrou para a etapa 3 (roda sobre o sinal já
  suavizado) e `fonteCalculoImpulso: 'bruto' | 'limpo' | 'filtrado' | 'final'`
  (padrão `final` = comportamento anterior; seletor "Impulso de" no painel,
  com ajuda). **Mudança de comportamento** para quem usa zona morta com
  suavizador (ex.: 0,6, 0,6, 0,2 com limiar 0,5 e média de 3: antes 0,4,
  agora 0 — a decisão é sobre a média, sem tremor perto de zero); golden
  `media-movel-5`, `ema-0.2` e `tudo-ligado` regravados, `impulso-do-filtrado`
  novo, `zona-morta-detector` (sem suavizador) idêntico. O detector continua
  sobre o sinal final; a separação dos limiares é a Fase 7.

- Fase 7 ✔: `DetectorEvento` (TS e Kotlin) com `limiarEntradaN`, `limiarSaidaN`,
  `tempoEntradaMs`, `tempoSaidaMs` — saída presa à entrada (F_ON > F_OFF),
  tempo de início confirma (spike de 1 amostra não dispara). Padrões mantêm o
  acoplamento antigo (entrada = saída = zona morta, tempo de início 0, fim =
  `tempoMinFimMs`): golden intactos, `detector-limiares` novo; teste de
  equivalência com o `DetectorQueima` (que continua exportado). O estado
  expõe `detector` com os valores efetivos. Painel: "Detector de evento" com
  força/tempo de início e de fim ("Histerese (ms)" → tempo de fim); "sugerir"
  preenche também início = 4× e fim = 2× o piso de ruído. O frontend ainda
  manda `tempoMinFimMs` para gateways anteriores. Corrigido de passagem o
  `.filtro-num` perdendo largura para `input[type=number]` em contêineres
  largos (mesmo bug da tela de Configurações).

- Fase 8 ✔: `ZeroTracking` (TS e Kotlin) na etapa 3, **antes** da zona morta
  (sobre zeros não teria o que corrigir): saída = F − offset; corrige
  `offset += α·(F − offset)` só com |F − offset| < limiar por mais de
  `tempoEstavel` e sem variação rápida; **bloqueado durante evento (detector)
  e durante gravação** (o serviço avisa o pipeline pelo `GravadorSessao`; no
  WebSerial, o `ControladorGravacao` avisa a fonte). Liga/desliga e mudança
  real de parâmetro zeram o offset; reenviar os mesmos parâmetros (o painel
  manda tudo a cada mudança) não zera — achado no TX9. Offset visível no
  painel (`zeroTrackingOffsetN`), publicado junto com o batimento quando muda
  ≥ 1 mN. Golden `zero-tracking` novo, demais idênticos.

- Fase 9 ✔ (frontend): painel em três blocos — 1. Limpeza (Hampel, Mediana,
  Notch + Fs), 2. Filtro principal (radio; "atraso ≈ 2 am" / "atraso
  variável"), 3. Tratamento (Zero tracking, Zona morta + sugerir, Detector de
  evento, Impulso de). Linha "Pipeline atual" (`descreverPipeline`) mostra
  os estágios ativos na ordem real: `BRUTO → Hampel 7/3σ → Notch 60 Hz →
  Butterworth 10 Hz → Zona morta 0,050 N → SAÍDA → Detector`, atualizada a
  cada mudança. `atrasoFiltroPrincipal`: (N−1)/2 para média móvel e SG,
  'variável' para os IIR — registrado, sem compensação automática. Mesmos ids
  dos controles (teste garante).

- Fase 10 ✔: colunas `config_pipeline` e `config_esp` (JSON) em `sessoes`,
  com migração nos dois provedores. O `GravadorSessao` fotografa o
  `PIPELINE_ESTADO` e a última CONFIG da ESP ao iniciar; a API (Node e
  Kotlin) aceita `config_pipeline`/`config_esp` no `POST /sessoes` e devolve
  nas listagens; a gravação local (WebSerial/IndexedDB) guarda
  `configPipeline` da fonte. A Análise mostra "Gravada com: BRUTO → … → SAÍDA"
  (e o JSON no *tooltip*); sessões antigas avisam que não há registro.
  Validado no TX9 (Butterworth 12 Hz + Hampel, fator da ESP −1142,4).

- Fase 11 ✔: `pacotes/analise/src/Detrend.ts` — `removerMedia` e
  `removerLinear` (mínimos quadrados) estimados **só nas amostras fora da
  queima** (a queima enviesaria a reta; teste mostra o viés sem a marcação),
  cópia não destrutiva. Na Análise: "Remover deriva: Nenhum | Média | Linear"
  com a reta estimada ("−(0,00204·t + 0,0971) N, 5734 amostras de repouso"),
  aplicado sobre as leituras originais (recortar redefine a base), não marca
  `leiturasMutadas`; a escolha vai para `metadados_sessao.detrend` (coluna
  nova, migração nos dois provedores; Node e Kotlin validam o valor) e é
  reaplicada ao reabrir. Só offline, como decidido.

- Fase 12 ✔ (frontend): perfis **Pesagem** (Hampel, EMA 0,10, zero tracking,
  zona morta), **Teste de motor** (Hampel, SG 5, zona morta, detector),
  **Impacto** (Hampel 5/3,5σ, Butterworth 25 Hz, sem zona morta/zero
  tracking, detector imediato, impulso do filtrado) e **Dados brutos**; só
  Hampel na limpeza (Hampel + Mediana é redundante). São valores iniciais:
  `detectarPerfil` compara apenas as chaves do perfil, e qualquer outra
  mudança volta a "Personalizado"; limiares do detector e da zona morta ficam
  como estão. Biomecânica/vibração da proposta ficaram de fora por falta de
  valores definidos — entram quando houver um caso real.

**Todas as 12 fases concluídas**, e as pendências do caminho resolvidas:
- Firmware **V18** (`7ef0a91`): a quantização de 10/20 ms vinha do laço, que
  só consultava a célula a cada 10 ms (as marcas eram `millis()`); agora
  `is_ready()` a cada volta, marca no instante da amostra, I2C a 400 kHz e
  OLED redesenhado a cada 1 s só quando o texto muda. No TX9: Δt 11/12 ms,
  nenhum gap > 20 ms, taxa real 86,7 Hz (era 83,5 — amostras perdidas).
- `massa_total_g` guardada nos metadados (coluna + migração, Node e Kotlin).
- Merge em `main` e versão 2.4.0: ver `registro/log-modificacoes.md`.

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
