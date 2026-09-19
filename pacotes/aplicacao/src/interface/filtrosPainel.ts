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
  return `
        <div class="filtros-painel" id="filtros-painel">
          <button class="filtros-header" id="filtros-toggle">
            <span class="filtros-titulo">Processamento de Sinal</span>
            <span class="filtros-badge" id="filtros-badge">3 ativos</span>
            <span class="filtros-origem" id="filtros-origem"></span>
            <span class="filtros-seta" id="filtros-seta">▼</span>
          </button>
          <div class="filtros-corpo hidden" id="filtros-corpo">
            <div class="filtro-linha">
              <label class="filtro-chk">
                <input type="checkbox" id="ck-zona-morta">
                Zona Morta
              </label>
              <button class="filtro-info-btn" data-filtro="zona-morta" type="button" title="Saiba mais">ℹ</button>
              <div class="filtro-params">
                <input type="number" id="in-zona-morta" class="filtro-num" value="0.05" min="0" step="0.001" title="Limiar (N)">
                <span>N</span>
                <button type="button" id="btn-sugerir-zm" class="filtro-sugerir" title="Sugerir a partir da capacidade e acurácia gravadas na ESP">sugerir</button>
              </div>
            </div>
            <div class="filtro-linha filtro-principal-nenhum">
              <label class="filtro-chk" title="Etapa 2 — filtro principal: só um suavizador por vez">
                <input type="radio" name="filtro-principal" id="rd-fp-nenhum" value="nenhum" checked>
                Sem suavização
              </label>
            </div>
            <div class="filtro-linha">
              <label class="filtro-chk">
                <input type="radio" name="filtro-principal" id="rd-fp-media-movel" value="mediaMovel">
                Média Móvel
              </label>
              <button class="filtro-info-btn" data-filtro="media-movel" type="button" title="Saiba mais">ℹ</button>
              <div class="filtro-params">
                <input type="number" id="in-media-movel" class="filtro-num" value="5" min="1" max="50" step="1" title="Janela (amostras)">
                <span>am</span>
              </div>
            </div>
            <div class="filtro-linha">
              <label class="filtro-chk">
                <input type="checkbox" id="ck-det-queima">
                Det. Queima
              </label>
              <button class="filtro-info-btn" data-filtro="det-queima" type="button" title="Saiba mais">ℹ</button>
              <div class="filtro-params">
                <input type="number" id="in-det-hister" class="filtro-num" value="100" min="0" step="10" title="Histerese (ms)">
                <span>ms</span>
              </div>
            </div>
            <div class="filtro-linha">
              <label class="filtro-chk" title="Etapa 1 — limpeza: remove amostras anômalas (spikes) antes dos outros filtros">
                <input type="checkbox" id="ck-hampel">
                Hampel
              </label>
              <button class="filtro-info-btn" data-filtro="hampel" type="button" title="Saiba mais">ℹ</button>
              <div class="filtro-params">
                <input type="number" id="in-hampel-jan" class="filtro-num" value="7" min="3" max="21" step="2" title="Janela (amostras, ímpar)">
                <span>am</span>
                <input type="number" id="in-hampel-k" class="filtro-num" value="3" min="1" max="10" step="0.5" title="Limiar K (múltiplos de σ)">
                <span>σ</span>
              </div>
            </div>
            <div class="filtro-linha">
              <label class="filtro-chk">
                <input type="checkbox" id="ck-notch">
                Notch
              </label>
              <button class="filtro-info-btn" data-filtro="notch" type="button" title="Saiba mais">ℹ</button>
              <div class="filtro-params">
                <input type="number" id="in-notch-freq" class="filtro-num" value="60" min="1" max="500" step="1" title="Frequência a rejeitar (Hz)">
                <span>Hz</span>
                <span id="fs-estimada" class="filtro-fs" title="Taxa de amostragem medida pelas marcas de tempo — usada pelo Notch">Fs —</span>
              </div>
            </div>
            <div class="filtro-linha">
              <label class="filtro-chk">
                <input type="checkbox" id="ck-mediana">
                Mediana
              </label>
              <button class="filtro-info-btn" data-filtro="mediana" type="button" title="Saiba mais">ℹ</button>
              <div class="filtro-params">
                <input type="number" id="in-mediana-jan" class="filtro-num" value="5" min="1" max="21" step="2" title="Janela (amostras)">
                <span>am</span>
              </div>
            </div>
            <div class="filtro-linha">
              <label class="filtro-chk">
                <input type="radio" name="filtro-principal" id="rd-fp-ema" value="ema">
                EMA
              </label>
              <button class="filtro-info-btn" data-filtro="ema" type="button" title="Saiba mais">ℹ</button>
              <div class="filtro-params">
                <input type="number" id="in-ema-alpha" class="filtro-num" value="0.20" min="0.01" max="1" step="0.01" title="Fator α (0–1)">
                <span>α</span>
              </div>
            </div>
            <div class="filtro-linha">
              <label class="filtro-chk">
                <input type="radio" name="filtro-principal" id="rd-fp-butterworth" value="butterworth">
                Butterworth
              </label>
              <button class="filtro-info-btn" data-filtro="butterworth" type="button" title="Saiba mais">ℹ</button>
              <div class="filtro-params">
                <input type="number" id="in-bw-corte" class="filtro-num" value="10" min="0.1" max="500" step="0.5" title="Frequência de corte (Hz) — deve ser menor que Fs/2">
                <span>Hz</span>
                <span id="bw-nyquist" class="filtro-fs" title="Metade da taxa de amostragem: o corte precisa ficar abaixo">Nyquist —</span>
                <span id="bw-aviso" class="filtro-aviso hidden">corte ≥ Nyquist: filtro ignorado</span>
              </div>
            </div>
            <div class="filtro-linha">
              <label class="filtro-chk">
                <input type="radio" name="filtro-principal" id="rd-fp-sg" value="savitzkyGolay">
                Sav-Golay
              </label>
              <button class="filtro-info-btn" data-filtro="sg" type="button" title="Saiba mais">ℹ</button>
              <div class="filtro-params">
                <input type="number" id="in-sg-jan" class="filtro-num" value="7" min="5" max="11" step="2" title="Janela (amostras, 5-11)">
                <span>am</span>
              </div>
            </div>
            <div class="filtro-linha">
              <label class="filtro-chk">
                <input type="radio" name="filtro-principal" id="rd-fp-kalman" value="kalman">
                Kalman
              </label>
              <button class="filtro-info-btn" data-filtro="kalman" type="button" title="Saiba mais">ℹ</button>
              <div class="filtro-params">
                <span title="Q: ruído de processo">Q</span>
                <input type="number" id="in-kalman-q" class="filtro-num" value="0.01" min="0.0001" max="100" step="0.001" title="Ruído de processo (Q)">
                <span title="R: ruído de medição">R</span>
                <input type="number" id="in-kalman-r" class="filtro-num" value="1.0" min="0.01" max="1000" step="0.1" title="Ruído de medição (R)">
              </div>
            </div>
          </div>
        </div>`;
}

/** Texto do Nyquist e se o corte é válido, a partir do estado do pipeline. */
export function situacaoButterworth(cfg: { taxaAmostragemHz?: number | undefined; taxaEstimadaHz?: number | null; frequenciaCorteHz?: number | undefined; butterworthValido?: boolean }): { nyquist: string; invalido: boolean } {
  const fs = cfg.taxaAmostragemHz ?? cfg.taxaEstimadaHz ?? null;
  const nyquist = fs != null ? `Nyquist ${(fs / 2).toFixed(1)} Hz` : 'Nyquist —';
  const fc = cfg.frequenciaCorteHz ?? 10;
  const invalido = cfg.butterworthValido === false || (fs != null && fc >= fs / 2);
  return { nyquist, invalido };
}
