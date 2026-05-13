type Estado = 'REPOUSO' | 'EM_QUEIMA';

export class DetectorQueima {
  private estado: Estado = 'REPOUSO';
  private tsBaixoMs: number | null = null;

  constructor(
    private limiar: number,
    private tempoMinFimMs: number = 100,
  ) {}

  atualizar(forca: number, marcaTemporal: number): boolean {
    if (this.estado === 'REPOUSO') {
      if (forca > this.limiar) {
        this.estado = 'EM_QUEIMA';
        this.tsBaixoMs = null;
      }
    } else {
      if (forca <= this.limiar) {
        if (this.tsBaixoMs === null) {
          this.tsBaixoMs = marcaTemporal;
        } else if (marcaTemporal - this.tsBaixoMs >= this.tempoMinFimMs) {
          this.estado = 'REPOUSO';
          this.tsBaixoMs = null;
        }
      } else {
        this.tsBaixoMs = null;
      }
    }
    return this.estado === 'EM_QUEIMA';
  }

  reiniciar(): void {
    this.estado = 'REPOUSO';
    this.tsBaixoMs = null;
  }
}
