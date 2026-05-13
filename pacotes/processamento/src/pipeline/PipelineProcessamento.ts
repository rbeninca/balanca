import type { PacoteDados } from '@balancagfig/protocolo';
import type { ConfiguracaoPipeline, LeituraProcessada } from '../tipos.js';
import { Calibrador }        from '../calibracao/Calibrador.js';
import { ZonaMorta }         from '../filtros/ZonaMorta.js';
import { MediaMovel }        from '../filtros/MediaMovel.js';
import { DetectorQueima }    from '../analise/DetectorQueima.js';
import { CalculadorImpulso } from '../analise/CalculadorImpulso.js';

export class PipelineProcessamento {
  private calibrador:  Calibrador;
  private zonaMorta:   ZonaMorta;
  private mediaMovel:  MediaMovel;
  private detector:    DetectorQueima;
  private calculador:  CalculadorImpulso;

  constructor(private config: ConfiguracaoPipeline) {
    this.calibrador  = new Calibrador(config.fatorCalibracao, config.deslocamentoTara);
    this.zonaMorta   = new ZonaMorta(config.limiarZonaMortaN);
    this.mediaMovel  = new MediaMovel(config.janelaMediaMovel);
    this.detector    = new DetectorQueima(config.limiarZonaMortaN, config.tempoMinFimMs);
    this.calculador  = new CalculadorImpulso();
  }

  processar(pacote: PacoteDados): LeituraProcessada {
    // Usa forcaNewtons calibrado pelo firmware ESP32; forcaBruta disponível via atualizarCalibracao
    let forca = pacote.forcaNewtons;
    forca     = this.zonaMorta.aplicar(forca);
    forca     = this.mediaMovel.aplicar(forca);

    const emQueima           = this.detector.atualizar(forca, pacote.marcaTemporal);
    const impulsoAcumuladoNs = this.calculador.integrar(forca, pacote.marcaTemporal);

    return {
      marcaTemporal:      pacote.marcaTemporal,
      forcaNewton:        forca,
      temperatura:        0,    // firmware v2 não envia temperatura
      emQueima,
      impulsoAcumuladoNs,
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
