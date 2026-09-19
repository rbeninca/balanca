import { flagsDoFiltroPrincipal, type EstadoPipeline, type PipelinePatch, type TipoFiltroPrincipal } from '@balancagfig/processamento';

// Markup do painel "Processamento de Sinal" (controles dos filtros da medição).
// Extraído como string pura para ser testável — os passos (step) dos campos
// numéricos vivem aqui. O limiar da Zona Morta usa passo de 0.001 N (a célula
// tem resolução fina; um passo grande atrapalhava o ajuste).
// Os suavizadores (média móvel, EMA, Savitzky-Golay, Kalman) são um grupo de
// radio `filtro-principal`: só um ativo por vez (Fase 2 do
// PLANEJAMENTO-PROCESSAMENTO.MD). A reorganização em 3 blocos é a Fase 9.

/** ids dos radios do filtro principal → valor enviado ao pipeline. */
export const RADIOS_FILTRO_PRINCIPAL: ReadonlyArray<{ id: string; valor: TipoFiltroPrincipal }> = [
  { id: 'rd-fp-nenhum',      valor: 'nenhum' },
  { id: 'rd-fp-media-movel', valor: 'mediaMovel' },
  { id: 'rd-fp-ema',         valor: 'ema' },
  { id: 'rd-fp-butterworth', valor: 'butterworth' },
  { id: 'rd-fp-sg',          valor: 'savitzkyGolay' },
  { id: 'rd-fp-kalman',      valor: 'kalman' },
];

/** Filtro principal de um estado do pipeline, inclusive de gateways antigos que só mandam as flags. */
export function filtroPrincipalDe(cfg: Partial<EstadoPipeline>): TipoFiltroPrincipal {
  if (cfg.filtroPrincipal) return cfg.filtroPrincipal;
  if (cfg.ativoKalman) return 'kalman';
  if (cfg.ativoSG) return 'savitzkyGolay';
  if (cfg.ativoEMA) return 'ema';
  if (cfg.ativoMediaMovel) return 'mediaMovel';
  return 'nenhum';
}

/**
 * Patch enviado ao pipeline para o filtro escolhido: o campo novo e as quatro
 * flags exclusivas, para funcionar também com um gateway anterior à Fase 2.
 */
export function patchFiltroPrincipal(tipo: TipoFiltroPrincipal): Pick<PipelinePatch, 'filtroPrincipal' | 'ativoMediaMovel' | 'ativoEMA' | 'ativoSG' | 'ativoKalman'> {
  return { filtroPrincipal: tipo, ...flagsDoFiltroPrincipal(tipo) };
}

export function htmlPainelFiltros(): string {
  const info = (chave: string) => `<button class="filtro-info-btn" data-filtro="${chave}" type="button" title="Saiba mais">ℹ</button>`;
  const radio = (id: string, valor: string, rotulo: string, checked = false) =>
    `<label class="filtro-chk"><input type="radio" name="filtro-principal" id="${id}" value="${valor}"${checked ? ' checked' : ''}>${rotulo}</label>`;
  return `
        <div class="filtros-painel" id="filtros-painel">
          <button class="filtros-header" id="filtros-toggle">
            <span class="filtros-titulo">Processamento de Sinal</span>
            <span class="filtros-badge" id="filtros-badge">3 ativos</span>
            <span class="filtros-origem" id="filtros-origem"></span>
            <span class="filtros-seta" id="filtros-seta">▼</span>
          </button>
          <div class="filtros-corpo hidden" id="filtros-corpo">

            <div class="filtros-bloco" data-etapa="1">
              <div class="filtros-bloco-titulo"><b>1. Limpeza</b><span>remove interferências e amostras anômalas — combináveis, nesta ordem</span></div>
              <div class="filtros-bloco-linhas">
                <div class="filtro-linha">
                  <label class="filtro-chk" title="Remove amostras anômalas (spikes) antes dos outros filtros"><input type="checkbox" id="ck-hampel">Hampel</label>
                  ${info('hampel')}
                  <div class="filtro-params">
                    <input type="number" id="in-hampel-jan" class="filtro-num" value="7" min="3" max="21" step="2" title="Janela (amostras, ímpar)"><span>am</span>
                    <input type="number" id="in-hampel-k" class="filtro-num" value="3" min="1" max="10" step="0.5" title="Limiar K (múltiplos de σ)"><span>σ</span>
                  </div>
                </div>
                <div class="filtro-linha">
                  <label class="filtro-chk" title="Remove spikes: cada amostra vira a mediana da janela"><input type="checkbox" id="ck-mediana">Mediana</label>
                  ${info('mediana')}
                  <div class="filtro-params">
                    <input type="number" id="in-mediana-jan" class="filtro-num" value="5" min="1" max="21" step="2" title="Janela (amostras)"><span>am</span>
                  </div>
                </div>
                <div class="filtro-linha">
                  <label class="filtro-chk" title="Rejeita uma frequência (rede elétrica)"><input type="checkbox" id="ck-notch">Notch</label>
                  ${info('notch')}
                  <div class="filtro-params">
                    <input type="number" id="in-notch-freq" class="filtro-num" value="60" min="1" max="500" step="1" title="Frequência a rejeitar (Hz)"><span>Hz</span>
                    <span id="fs-estimada" class="filtro-fs" title="Taxa de amostragem medida pelas marcas de tempo — usada pelo Notch e pelo Butterworth">Fs —</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="filtros-bloco" data-etapa="2">
              <div class="filtros-bloco-titulo"><b>2. Filtro principal</b><span>suavização — só um por vez</span><span id="fp-atraso" class="filtro-fs" title="Atraso introduzido pelo filtro escolhido"></span></div>
              <div class="filtros-bloco-linhas">
                <div class="filtro-linha filtro-principal-nenhum">${radio('rd-fp-nenhum', 'nenhum', 'Sem suavização', true)}</div>
                <div class="filtro-linha">
                  ${radio('rd-fp-media-movel', 'mediaMovel', 'Média Móvel')}
                  ${info('media-movel')}
                  <div class="filtro-params">
                    <input type="number" id="in-media-movel" class="filtro-num" value="5" min="1" max="50" step="1" title="Janela (amostras)"><span>am</span>
                  </div>
                </div>
                <div class="filtro-linha">
                  ${radio('rd-fp-ema', 'ema', 'EMA')}
                  ${info('ema')}
                  <div class="filtro-params">
                    <input type="number" id="in-ema-alpha" class="filtro-num" value="0.20" min="0.01" max="1" step="0.01" title="Fator α (0–1): menor = mais suave, maior = mais rápido"><span>α</span>
                  </div>
                </div>
                <div class="filtro-linha">
                  ${radio('rd-fp-butterworth', 'butterworth', 'Butterworth')}
                  ${info('butterworth')}
                  <div class="filtro-params">
                    <input type="number" id="in-bw-corte" class="filtro-num" value="10" min="0.1" max="500" step="0.5" title="Frequência de corte (Hz) — deve ser menor que Fs/2"><span>Hz</span>
                    <span id="bw-nyquist" class="filtro-fs" title="Metade da taxa de amostragem: o corte precisa ficar abaixo">Nyquist —</span>
                    <span id="bw-aviso" class="filtro-aviso hidden">corte ≥ Nyquist: filtro ignorado</span>
                  </div>
                </div>
                <div class="filtro-linha">
                  ${radio('rd-fp-sg', 'savitzkyGolay', 'Sav-Golay')}
                  ${info('sg')}
                  <div class="filtro-params">
                    <input type="number" id="in-sg-jan" class="filtro-num" value="7" min="5" max="11" step="2" title="Janela (amostras, 5-11), grau 2"><span>am</span>
                  </div>
                </div>
                <div class="filtro-linha">
                  ${radio('rd-fp-kalman', 'kalman', 'Kalman')}
                  ${info('kalman')}
                  <div class="filtro-params">
                    <span title="Q: ruído de processo">Q</span>
                    <input type="number" id="in-kalman-q" class="filtro-num" value="0.01" min="0.0001" max="100" step="0.001" title="Ruído de processo (Q)">
                    <span title="R: ruído de medição">R</span>
                    <input type="number" id="in-kalman-r" class="filtro-num" value="1.0" min="0.01" max="1000" step="0.1" title="Ruído de medição (R)">
                  </div>
                </div>
              </div>
            </div>

            <div class="filtros-bloco" data-etapa="3">
              <div class="filtros-bloco-titulo"><b>3. Tratamento</b><span>correção e interpretação do sinal</span></div>
              <div class="filtros-bloco-linhas">
                <div class="filtro-linha">
                  <label class="filtro-chk" title="Compensa a deriva lenta do zero quando a balança está comprovadamente em repouso"><input type="checkbox" id="ck-zero-tracking">Zero tracking</label>
                  ${info('zero-tracking')}
                  <div class="filtro-params">
                    <input type="number" id="in-zt-limiar" class="filtro-num" value="0.05" min="0" step="0.001" title="Zona de repouso (N)"><span>N</span>
                    <input type="number" id="in-zt-tempo" class="filtro-num" value="3000" min="0" step="100" title="Tempo em repouso antes de corrigir (ms)"><span>ms</span>
                    <input type="number" id="in-zt-alpha" class="filtro-num" value="0.01" min="0.0001" max="1" step="0.001" title="Passo da correção por amostra (α)"><span>α</span>
                    <span id="zt-offset" class="filtro-fs" title="Offset atual aplicado pelo zero tracking">offset 0 N</span>
                  </div>
                </div>
                <div class="filtro-linha">
                  <label class="filtro-chk"><input type="checkbox" id="ck-zona-morta">Zona Morta</label>
                  ${info('zona-morta')}
                  <div class="filtro-params">
                    <input type="number" id="in-zona-morta" class="filtro-num" value="0.05" min="0" step="0.001" title="Limiar (N)"><span>N</span>
                    <button type="button" id="btn-sugerir-zm" class="filtro-sugerir" title="Sugerir zona morta e limiares do detector a partir da capacidade e acurácia gravadas na ESP">sugerir</button>
                  </div>
                </div>
                <div class="filtro-linha">
                  <label class="filtro-chk" title="Marca início e fim do evento (queima) com limiares e tempos próprios"><input type="checkbox" id="ck-det-queima">Detector de evento</label>
                  ${info('det-queima')}
                  <div class="filtro-params filtro-params-detector">
                    <span title="Início: força acima deste valor pelo tempo indicado">início</span>
                    <input type="number" id="in-det-entrada" class="filtro-num" value="0.2" min="0" step="0.01" title="Força de início (N)"><span>N</span>
                    <input type="number" id="in-det-t-entrada" class="filtro-num" value="30" min="0" step="10" title="Tempo de início (ms) — 0 = imediato"><span>ms</span>
                    <span title="Fim: força abaixo deste valor pelo tempo indicado">fim</span>
                    <input type="number" id="in-det-saida" class="filtro-num" value="0.1" min="0" step="0.01" title="Força de fim (N) — deve ser menor que a de início"><span>N</span>
                    <input type="number" id="in-det-hister" class="filtro-num" value="100" min="0" step="10" title="Tempo de fim (ms)"><span>ms</span>
                  </div>
                </div>
                <div class="filtro-linha filtro-linha-fixa">
                  <label class="filtro-chk" for="sel-impulso" title="Etapa 3 → análise: qual sinal alimenta a integral do impulso">Impulso de</label>
                  ${info('impulso')}
                  <div class="filtro-params">
                    <select id="sel-impulso" class="filtro-sel" title="Sinal integrado no impulso acumulado">
                      <option value="final">sinal final (após zona morta)</option>
                      <option value="filtrado">filtrado (antes da zona morta)</option>
                      <option value="limpo">limpo (só etapa 1)</option>
                      <option value="bruto">bruto (como veio da ESP)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div class="filtros-pipeline" id="pipeline-atual" title="Ordem em que o sinal passa pelos filtros ativos"></div>
          </div>
        </div>`;
}

/** Atraso (em amostras) que o filtro principal introduz; 'variável' para os IIR (EMA, Butterworth, Kalman). */
export function atrasoFiltroPrincipal(cfg: Partial<EstadoPipeline>): number | 'variável' | null {
  switch (filtroPrincipalDe(cfg)) {
    case 'mediaMovel':    return (Math.max(1, cfg.janelaMediaMovel ?? 5) - 1) / 2;
    case 'savitzkyGolay': return (Math.max(5, cfg.janelaSG ?? 7) - 1) / 2;
    case 'ema': case 'butterworth': case 'kalman': return 'variável';
    default: return null;
  }
}

/** Texto do atraso para o painel ("atraso ≈ 2 am", "atraso variável"). */
export function textoAtraso(cfg: Partial<EstadoPipeline>): string {
  const a = atrasoFiltroPrincipal(cfg);
  if (a === null) return '';
  if (a === 'variável') return 'atraso variável';
  return `atraso ≈ ${a} am`;
}

/**
 * Estágios ativos na ordem real do pipeline, para a representação
 * "BRUTO → Hampel → Notch 60 Hz → Butterworth 10 Hz → Zona morta 0,05 N → SAÍDA".
 */
export function descreverPipeline(cfg: Partial<EstadoPipeline>): string[] {
  const n = (v: number | undefined, fb: number, casas = 0) => (v ?? fb).toFixed(casas);
  const est: string[] = ['BRUTO'];
  if (cfg.ativoHampel) est.push(`Hampel ${n(cfg.janelaHampel, 7)}/${n(cfg.limiarHampelSigma, 3, 1)}σ`);
  if (cfg.ativoMediana) est.push(`Mediana ${n(cfg.janelaMediana, 5)}`);
  if (cfg.ativoNotch) est.push(`Notch ${n(cfg.freqNotchHz, 60)} Hz`);
  switch (filtroPrincipalDe(cfg)) {
    case 'mediaMovel':    est.push(`Média móvel ${n(cfg.janelaMediaMovel, 5)}`); break;
    case 'ema':           est.push(`EMA α=${n(cfg.alphaEMA, 0.2, 2)}`); break;
    case 'butterworth':   est.push(`Butterworth ${n(cfg.frequenciaCorteHz, 10, 1)} Hz${cfg.butterworthValido === false ? ' (ignorado)' : ''}`); break;
    case 'savitzkyGolay': est.push(`Sav-Golay ${n(cfg.janelaSG, 7)}`); break;
    case 'kalman':        est.push(`Kalman Q=${n(cfg.kalmanQ, 0.01, 3)} R=${n(cfg.kalmanR, 1, 2)}`); break;
  }
  if (cfg.ativoZeroTracking) est.push('Zero tracking');
  if (cfg.ativoZonaMorta) est.push(`Zona morta ${n(cfg.limiarZonaMortaN, 0.05, 3)} N`);
  est.push('SAÍDA');
  if (cfg.ativoDetectorQueima) est.push('→ Detector');
  return est;
}

/** Texto do Nyquist e se o corte é válido, a partir do estado do pipeline. */
export function situacaoButterworth(cfg: { taxaAmostragemHz?: number | undefined; taxaEstimadaHz?: number | null; frequenciaCorteHz?: number | undefined; butterworthValido?: boolean }): { nyquist: string; invalido: boolean } {
  const fs = cfg.taxaAmostragemHz ?? cfg.taxaEstimadaHz ?? null;
  const nyquist = fs != null ? `Nyquist ${(fs / 2).toFixed(1)} Hz` : 'Nyquist —';
  const fc = cfg.frequenciaCorteHz ?? 10;
  const invalido = cfg.butterworthValido === false || (fs != null && fc >= fs / 2);
  return { nyquist, invalido };
}
