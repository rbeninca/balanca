import type { PacoteDados } from '@balancagfig/protocolo';
import type { ConfiguracaoPipeline, LeituraProcessada } from '../tipos.js';
import { Calibrador }        from '../calibracao/Calibrador.js';
import { ZonaMorta }         from '../filtros/ZonaMorta.js';
import { MediaMovel }        from '../filtros/MediaMovel.js';
import { MediaExponencial }  from '../filtros/MediaExponencial.js';
import { FiltroMediana }     from '../filtros/FiltroMediana.js';
import { FiltroKalman }      from '../filtros/FiltroKalman.js';
import { SavitzkyGolay }     from '../filtros/SavitzkyGolay.js';
import { FiltroNotch }       from '../filtros/FiltroNotch.js';
import { DetectorQueima }    from '../analise/DetectorQueima.js';
import { CalculadorImpulso } from '../analise/CalculadorImpulso.js';

export type PipelinePatch = Partial<ConfiguracaoPipeline> & {
  ativoZonaMorta?:      boolean;
  ativoMediaMovel?:     boolean;
  ativoDetectorQueima?: boolean;
  ativoMediana?:        boolean;
  ativoEMA?:            boolean;
  ativoNotch?:          boolean;
  ativoSG?:             boolean;
  ativoKalman?:         boolean;
};

export type EstadoPipeline = ConfiguracaoPipeline & {
  ativoZonaMorta:      boolean;
  ativoMediaMovel:     boolean;
  ativoDetectorQueima: boolean;
  ativoMediana:        boolean;
  ativoEMA:            boolean;
  ativoNotch:          boolean;
  ativoSG:             boolean;
  ativoKalman:         boolean;
};

export class PipelineProcessamento {
  private calibrador:  Calibrador;
  private zonaMorta:   ZonaMorta;
  private mediaMovel:  MediaMovel;
  private mediana:     FiltroMediana;
  private ema:         MediaExponencial;
  private notch:       FiltroNotch;
  private sg:          SavitzkyGolay;
  private kalman:      FiltroKalman;
  private detector:    DetectorQueima;
  private calculador:  CalculadorImpulso;

  private ativoZonaMorta      = true;
  private ativoMediaMovel     = true;
  private ativoDetectorQueima = true;
  private ativoMediana        = false;
  private ativoEMA            = false;
  private ativoNotch          = false;
  private ativoSG             = false;
  private ativoKalman         = false;

  constructor(private config: ConfiguracaoPipeline) {
    this.calibrador = new Calibrador(config.fatorCalibracao, config.deslocamentoTara);
    this.zonaMorta  = new ZonaMorta(config.limiarZonaMortaN);
    this.mediaMovel = new MediaMovel(config.janelaMediaMovel);
    this.mediana    = new FiltroMediana(config.janelaMediana ?? 5);
    this.ema        = new MediaExponencial(config.alphaEMA ?? 0.2);
    this.notch      = new FiltroNotch(config.freqNotchHz ?? 60, config.qNotch ?? 30, config.taxaAmostragemHz ?? 100);
    this.sg         = new SavitzkyGolay(config.janelaSG ?? 7);
    this.kalman     = new FiltroKalman(config.kalmanQ ?? 0.01, config.kalmanR ?? 1.0);
    this.detector   = new DetectorQueima(config.limiarZonaMortaN, config.tempoMinFimMs);
    this.calculador = new CalculadorImpulso();
  }

  private aplicarFiltros(forca: number): { filtrada: number; bruta: number } {
    const bruta = forca;

    // Pré-processamento: remove ruído antes da zona morta
    if (this.ativoNotch)   forca = this.notch.aplicar(forca);
    if (this.ativoMediana) forca = this.mediana.aplicar(forca);

    if (this.ativoZonaMorta) forca = this.zonaMorta.aplicar(forca);

    // Suavização: apenas um dos quatro deve estar ativo ao mesmo tempo,
    // mas o pipeline suporta encadeamento caso o usuário ative mais de um.
    if (this.ativoMediaMovel) forca = this.mediaMovel.aplicar(forca);
    if (this.ativoEMA)        forca = this.ema.aplicar(forca);
    if (this.ativoSG)         forca = this.sg.aplicar(forca);
    if (this.ativoKalman)     forca = this.kalman.aplicar(forca);

    return { filtrada: forca, bruta };
  }

  processar(pacote: PacoteDados): LeituraProcessada {
    const { filtrada, bruta } = this.aplicarFiltros(pacote.forcaNewtons);

    const emQueima           = this.ativoDetectorQueima
      ? this.detector.atualizar(filtrada, pacote.marcaTemporal)
      : false;
    const impulsoAcumuladoNs = this.calculador.integrar(filtrada, pacote.marcaTemporal);

    const algumFiltroNovo = this.ativoNotch || this.ativoMediana || this.ativoEMA || this.ativoSG || this.ativoKalman;

    return {
      marcaTemporal:     pacote.marcaTemporal,
      forcaNewton:       filtrada,
      temperatura:       0,
      emQueima,
      impulsoAcumuladoNs,
      ...(algumFiltroNovo && { forcaNewtonBruta: bruta }),
    };
  }

  processarLeitura(l: LeituraProcessada): LeituraProcessada {
    const { filtrada, bruta } = this.aplicarFiltros(l.forcaNewton);

    const emQueima           = this.ativoDetectorQueima
      ? this.detector.atualizar(filtrada, l.marcaTemporal)
      : l.emQueima;
    const impulsoAcumuladoNs = this.calculador.integrar(filtrada, l.marcaTemporal);

    const algumFiltroNovo = this.ativoNotch || this.ativoMediana || this.ativoEMA || this.ativoSG || this.ativoKalman;

    return {
      ...l,
      forcaNewton:       filtrada,
      emQueima,
      impulsoAcumuladoNs,
      ...(algumFiltroNovo && { forcaNewtonBruta: bruta }),
    };
  }

  atualizarConfig(patch: PipelinePatch): void {
    if (patch.limiarZonaMortaN != null) {
      this.config.limiarZonaMortaN = patch.limiarZonaMortaN;
      this.zonaMorta = new ZonaMorta(patch.limiarZonaMortaN);
      this.detector  = new DetectorQueima(patch.limiarZonaMortaN, this.config.tempoMinFimMs);
    }
    if (patch.janelaMediaMovel != null) {
      this.config.janelaMediaMovel = patch.janelaMediaMovel;
      this.mediaMovel = new MediaMovel(patch.janelaMediaMovel);
    }
    if (patch.tempoMinFimMs != null) {
      this.config.tempoMinFimMs = patch.tempoMinFimMs;
      this.detector = new DetectorQueima(this.config.limiarZonaMortaN, patch.tempoMinFimMs);
    }
    if (patch.fatorCalibracao != null) {
      this.config.fatorCalibracao = patch.fatorCalibracao;
      this.calibrador.atualizar(patch.fatorCalibracao, this.config.deslocamentoTara);
    }
    if (patch.deslocamentoTara != null) {
      this.config.deslocamentoTara = patch.deslocamentoTara;
      this.calibrador.atualizar(this.config.fatorCalibracao, patch.deslocamentoTara);
    }
    if (patch.janelaMediana != null) {
      this.config.janelaMediana = patch.janelaMediana;
      this.mediana = new FiltroMediana(patch.janelaMediana);
    }
    if (patch.alphaEMA != null) {
      this.config.alphaEMA = patch.alphaEMA;
      this.ema = new MediaExponencial(patch.alphaEMA);
    }
    if (patch.freqNotchHz != null || patch.qNotch != null || patch.taxaAmostragemHz != null) {
      this.config.freqNotchHz      = patch.freqNotchHz      ?? this.config.freqNotchHz      ?? 60;
      this.config.qNotch           = patch.qNotch           ?? this.config.qNotch           ?? 30;
      this.config.taxaAmostragemHz = patch.taxaAmostragemHz ?? this.config.taxaAmostragemHz ?? 100;
      this.notch = new FiltroNotch(this.config.freqNotchHz, this.config.qNotch, this.config.taxaAmostragemHz);
    }
    if (patch.janelaSG != null) {
      this.config.janelaSG = patch.janelaSG;
      this.sg = new SavitzkyGolay(patch.janelaSG);
    }
    if (patch.kalmanQ != null || patch.kalmanR != null) {
      this.config.kalmanQ = patch.kalmanQ ?? this.config.kalmanQ ?? 0.01;
      this.config.kalmanR = patch.kalmanR ?? this.config.kalmanR ?? 1.0;
      this.kalman = new FiltroKalman(this.config.kalmanQ, this.config.kalmanR);
    }

    // Flags de ativação
    if (patch.ativoZonaMorta != null)      this.ativoZonaMorta = patch.ativoZonaMorta;
    if (patch.ativoDetectorQueima != null) {
      if (patch.ativoDetectorQueima && !this.ativoDetectorQueima) this.detector.reiniciar();
      this.ativoDetectorQueima = patch.ativoDetectorQueima;
    }
    if (patch.ativoMediaMovel != null) {
      if (patch.ativoMediaMovel && !this.ativoMediaMovel) this.mediaMovel.reiniciar();
      this.ativoMediaMovel = patch.ativoMediaMovel;
    }
    if (patch.ativoMediana != null) {
      if (patch.ativoMediana && !this.ativoMediana) this.mediana.reiniciar();
      this.ativoMediana = patch.ativoMediana;
    }
    if (patch.ativoEMA != null) {
      if (patch.ativoEMA && !this.ativoEMA) this.ema.reiniciar();
      this.ativoEMA = patch.ativoEMA;
    }
    if (patch.ativoNotch != null) {
      if (patch.ativoNotch && !this.ativoNotch) this.notch.reiniciar();
      this.ativoNotch = patch.ativoNotch;
    }
    if (patch.ativoSG != null) {
      if (patch.ativoSG && !this.ativoSG) this.sg.reiniciar();
      this.ativoSG = patch.ativoSG;
    }
    if (patch.ativoKalman != null) {
      if (patch.ativoKalman && !this.ativoKalman) this.kalman.reiniciar();
      this.ativoKalman = patch.ativoKalman;
    }
  }

  obterConfig(): EstadoPipeline {
    return {
      ...this.config,
      ativoZonaMorta:      this.ativoZonaMorta,
      ativoMediaMovel:     this.ativoMediaMovel,
      ativoDetectorQueima: this.ativoDetectorQueima,
      ativoMediana:        this.ativoMediana,
      ativoEMA:            this.ativoEMA,
      ativoNotch:          this.ativoNotch,
      ativoSG:             this.ativoSG,
      ativoKalman:         this.ativoKalman,
    };
  }

  atualizarCalibracao(fator: number, offset: number): void {
    this.calibrador.atualizar(fator, offset);
  }

  obterFatorCalibracao(): number {
    return this.calibrador.obterFator();
  }

  reiniciar(): void {
    this.mediaMovel.reiniciar();
    this.mediana.reiniciar();
    this.ema.reiniciar();
    this.notch.reiniciar();
    this.sg.reiniciar();
    this.kalman.reiniciar();
    this.detector.reiniciar();
    this.calculador.reiniciar();
  }
}
