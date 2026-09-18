// Markup do painel "Processamento de Sinal" (controles dos filtros da medição).
// Extraído como string pura para ser testável — os passos (step) dos campos
// numéricos vivem aqui. O limiar da Zona Morta usa passo de 0.001 N (a célula
// tem resolução fina; um passo grande atrapalhava o ajuste).
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
            <div class="filtro-linha">
              <label class="filtro-chk">
                <input type="checkbox" id="ck-media-movel">
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
              <label class="filtro-chk">
                <input type="checkbox" id="ck-notch">
                Notch
              </label>
              <button class="filtro-info-btn" data-filtro="notch" type="button" title="Saiba mais">ℹ</button>
              <div class="filtro-params">
                <input type="number" id="in-notch-freq" class="filtro-num" value="60" min="1" max="500" step="1" title="Frequência a rejeitar (Hz)">
                <span>Hz</span>
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
                <input type="checkbox" id="ck-ema">
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
                <input type="checkbox" id="ck-sg">
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
                <input type="checkbox" id="ck-kalman">
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
