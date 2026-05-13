import type { PacoteDados } from '@balancagfig/protocolo';
import type { ConfiguracaoPipeline, LeituraProcessada } from '../tipos.js';
import { Calibrador }        from '../calibracao/Calibrador.js';
import { ZonaMorta }         from '../filtros/ZonaMorta.js';
import { MediaMovel }        from '../filtros/MediaMovel.js';
import { DetectorQueima }    from '../analise/DetectorQueima.js';
import { CalculadorImpulso } from '../analise/CalculadorImpulso.js';

export type PipelinePatch = Partial<ConfiguracaoPipeline> & {
  ativoZonaMorta?:      boolean;
  ativoMediaMovel?:     boolean;
  ativoDetectorQueima?: boolean;
};

export type EstadoPipeline = ConfiguracaoPipeline & {
  ativoZonaMorta:      boolean;
  ativoMediaMovel:     boolean;
  ativoDetectorQueima: boolean;
};

export class PipelineProcessamento {
  private calibrador:  Calibrador;
  private zonaMorta:   ZonaMorta;
  private mediaMovel:  MediaMovel;
  private detector:    DetectorQueima;
  private calculador:  CalculadorImpulso;

  private ativoZonaMorta      = true;
  private ativoMediaMovel     = true;
  private ativoDetectorQueima = true;

  constructor(private config: ConfiguracaoPipeline) {
    this.calibrador  = new Calibrador(config.fatorCalibracao, config.deslocamentoTara);
    this.zonaMorta   = new ZonaMorta(config.limiarZonaMortaN);
    this.mediaMovel  = new MediaMovel(config.janelaMediaMovel);
    this.detector    = new DetectorQueima(config.limiarZonaMortaN, config.tempoMinFimMs);
    this.calculador  = new CalculadorImpulso();
  }

  processar(pacote: PacoteDados): LeituraProcessada {
    let forca = pacote.forcaNewtons;
    if (this.ativoZonaMorta)  forca = this.zonaMorta.aplicar(forca);
    if (this.ativoMediaMovel) forca = this.mediaMovel.aplicar(forca);

    const emQueima           = this.ativoDetectorQueima
      ? this.detector.atualizar(forca, pacote.marcaTemporal)
      : false;
    const impulsoAcumuladoNs = this.calculador.integrar(forca, pacote.marcaTemporal);

    return {
      marcaTemporal:      pacote.marcaTemporal,
      forcaNewton:        forca,
      temperatura:        0,
      emQueima,
      impulsoAcumuladoNs,
    };
  }

  processarLeitura(l: LeituraProcessada): LeituraProcessada {
    let forca = l.forcaNewton;
    if (this.ativoZonaMorta)  forca = this.zonaMorta.aplicar(forca);
    if (this.ativoMediaMovel) forca = this.mediaMovel.aplicar(forca);

    const emQueima           = this.ativoDetectorQueima
      ? this.detector.atualizar(forca, l.marcaTemporal)
      : l.emQueima;
    const impulsoAcumuladoNs = this.calculador.integrar(forca, l.marcaTemporal);

    return { ...l, forcaNewton: forca, emQueima, impulsoAcumuladoNs };
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
    if (patch.ativoZonaMorta != null) {
      this.ativoZonaMorta = patch.ativoZonaMorta;
    }
    if (patch.ativoMediaMovel != null) {
      if (patch.ativoMediaMovel && !this.ativoMediaMovel) this.mediaMovel.reiniciar();
      this.ativoMediaMovel = patch.ativoMediaMovel;
    }
    if (patch.ativoDetectorQueima != null) {
      if (patch.ativoDetectorQueima && !this.ativoDetectorQueima) this.detector.reiniciar();
      this.ativoDetectorQueima = patch.ativoDetectorQueima;
    }
  }

  obterConfig(): EstadoPipeline {
    return {
      ...this.config,
      ativoZonaMorta:      this.ativoZonaMorta,
      ativoMediaMovel:     this.ativoMediaMovel,
      ativoDetectorQueima: this.ativoDetectorQueima,
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
    this.detector.reiniciar();
    this.calculador.reiniciar();
  }
}
