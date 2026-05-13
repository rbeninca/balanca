export class ZonaMorta {
  constructor(private limiar: number) {}

  aplicar(forca: number): number {
    return Math.abs(forca) <= this.limiar ? 0 : forca;
  }
}
