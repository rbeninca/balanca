export interface ConfiguracaoPipeline {
  limiarZonaMortaN:  number;  // força abaixo disso → zero
  janelaMediaMovel:  number;  // amostras para suavização
  fatorCalibracao:   number;  // multiplicador: forcaBruta → Newtons
  deslocamentoTara:  number;  // offset de tara (raw ADC)
  tempoMinFimMs:     number;  // histerese de fim de queima (ms) — padrão 100
}

export interface LeituraProcessada {
  marcaTemporal:      number;   // ms desde boot
  forcaNewton:        number;   // após calibração, zona morta e suavização
  temperatura:        number;   // °C (0 quando firmware não fornece)
  emQueima:           boolean;  // detector de queima
  impulsoAcumuladoNs: number;   // integral trapezoidal da força (N·s)
}
