import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { DetectorBCG, CONFIG_BCG_PADRAO } from '../../src/analise/DetectorBCG.js';

const FS = 85;
const DT_MS = 1000 / FS;

/**
 * Captura real do box: célula de carga sobre o peito, ~45 s a ~83 Hz.
 * Referência medida ao mesmo tempo por um relógio de pulso: 56–67 bpm.
 * O período dominante do envelope é 1,03 s (≈58 bpm), conferido por
 * autocorrelação. É o fixture que decide se o detector funciona de verdade.
 */
const FIXTURE = JSON.parse(
  fs.readFileSync(new URL('../fixtures/bcg-captura.json', import.meta.url), 'utf8'),
) as { tMs: number[]; forcaN: number[] };

function rodarFixture(cfg: Partial<ConstructorParameters<typeof DetectorBCG>[1]> = {}) {
  const d = new DetectorBCG(FS, cfg);
  let picos = 0;
  let ultimo = null as ReturnType<DetectorBCG['processar']> | null;
  for (let i = 0; i < FIXTURE.tMs.length; i++) {
    const r = d.processar(FIXTURE.forcaN[i]!, FIXTURE.tMs[i]!);
    if (r.pico) picos++;
    ultimo = r;
  }
  return { detector: d, picos, ultimo: ultimo! };
}

/** Alimenta um sinal sintético e devolve o resultado final e a contagem de picos. */
function rodar(detector: DetectorBCG, pontos: { marcaTemporal: number; forca: number }[]) {
  let ultimo = null as ReturnType<DetectorBCG['processar']> | null;
  let picos = 0;
  for (const p of pontos) {
    ultimo = detector.processar(p.forca, p.marcaTemporal);
    if (ultimo.pico) picos++;
  }
  return { ultimo: ultimo!, picos };
}

describe('DetectorBCG — captura real (referência: 56–67 bpm)', () => {
  it('recupera o BPM medido pelo relógio de pulso', () => {
    const r = rodarFixture();
    expect(r.ultimo.bpm).not.toBeNull();
    expect(r.ultimo.bpm!).toBeGreaterThanOrEqual(52);
    expect(r.ultimo.bpm!).toBeLessThanOrEqual(64);
  });

  it('detecta um batimento por batimento (~1 pico/s)', () => {
    const duracaoS = (FIXTURE.tMs[FIXTURE.tMs.length - 1]! - FIXTURE.tMs[0]!) / 1000;
    const r = rodarFixture();
    // ~58 bpm em 45 s ≈ 43 batimentos; tolerância para os trechos fracos
    expect(r.picos).toBeGreaterThan(duracaoS * 0.75);
    expect(r.picos).toBeLessThan(duracaoS * 1.35);
  });

  it('a qualidade não cai para sem-sinal com o sinal presente', () => {
    const r = rodarFixture();
    expect(r.ultimo.qualidade).not.toBe('sem-sinal');
    expect(r.ultimo.ibiMs).not.toBeNull();
  });
});

describe('DetectorBCG — robustez', () => {
  it('sinal zero: nenhum pico, sem bpm, qualidade sem-sinal', () => {
    const pontos = Array.from({ length: 20 * FS }, (_, i) => ({ marcaTemporal: Math.round(i * DT_MS), forca: 0 }));
    const r = rodar(new DetectorBCG(FS), pontos);
    expect(r.picos).toBe(0);
    expect(r.ultimo.bpm).toBeNull();
    expect(r.ultimo.qualidade).toBe('sem-sinal');
  });

  it('começa mudo e trava quando o sinal aparece', () => {
    const pts: { marcaTemporal: number; forca: number }[] = [];
    // 8 s de silêncio (força zerada), depois a captura real
    for (let i = 0; i < 8 * FS; i++) pts.push({ marcaTemporal: Math.round(i * DT_MS), forca: 0 });
    const desloc = pts.length * DT_MS;
    for (let i = 0; i < FIXTURE.tMs.length; i++) {
      pts.push({ marcaTemporal: desloc + FIXTURE.tMs[i]!, forca: FIXTURE.forcaN[i]! });
    }
    const d = new DetectorBCG(FS);
    let bpmNaTransicao: number | null = null;
    let bpmFinal: number | null = null;
    for (const p of pts) {
      const r = d.processar(p.forca, p.marcaTemporal);
      if (p.marcaTemporal >= desloc) bpmFinal = r.bpm;
      else if (r.bpm !== null) bpmNaTransicao = r.bpm;
    }
    expect(bpmNaTransicao).toBeNull();      // nada no silêncio
    expect(bpmFinal).not.toBeNull();        // trava depois que o sinal chega
    expect(bpmFinal!).toBeGreaterThanOrEqual(52);
    expect(bpmFinal!).toBeLessThanOrEqual(64);
  });

  it('reiniciar zera o estado e volta a detectar', () => {
    const d = new DetectorBCG(FS);
    rodarFixture();
    d.reiniciar();
    const r = rodar(d, FIXTURE.tMs.map((t, i) => ({ marcaTemporal: t, forca: FIXTURE.forcaN[i]! })));
    expect(r.ultimo.bpm).not.toBeNull();
  });

  it('aceita a configuração padrão sem erro', () => {
    const d = new DetectorBCG(FS);
    expect(CONFIG_BCG_PADRAO.bandaInferiorHz).toBe(1.0);
    expect(() => d.processar(0.01, 0)).not.toThrow();
  });
});
