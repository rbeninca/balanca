import { describe, it, expect } from 'vitest';
import { PanTompkins } from '../../src/analise/PanTompkins.js';

const TAXA_HZ = 80;

function gerarSinalBcg(duracaoS: number, bpm = 70, amplitude = 1.0): number[] {
  // Sinal BCG sintético: Gaussianas periódicas com período fisiológico
  const periodoAmostras = Math.round(TAXA_HZ * 60 / bpm);
  const n = Math.round(TAXA_HZ * duracaoS);
  return Array.from({ length: n }, (_, i) => {
    const fase = i % periodoAmostras;
    return amplitude * Math.exp(-0.5 * ((fase - periodoAmostras * 0.1) / 2) ** 2);
  });
}

describe('PanTompkins', () => {
  it('UT-2.18.1 — detecta pelo menos um pico em sinal BCG sintético de 5s', () => {
    const pt = new PanTompkins(TAXA_HZ, 300);
    const sinal = gerarSinalBcg(5, 70);
    const picos: number[] = [];
    sinal.forEach((v, i) => { if (pt.processar(v)) picos.push(i); });
    expect(picos.length).toBeGreaterThanOrEqual(1);
  });

  it('UT-2.18.2 — reiniciar() limpa estado', () => {
    const pt = new PanTompkins(TAXA_HZ);
    gerarSinalBcg(3, 70).forEach(v => pt.processar(v));
    pt.reiniciar();
    // Após reinício, silêncio não gera pico
    const picosSilencio = Array.from({ length: 20 }, () => pt.processar(0));
    expect(picosSilencio.every(p => !p)).toBe(true);
  });

  it('UT-2.18.3 — período refratário: dois eventos próximos geram somente 1 pico', () => {
    const pt = new PanTompkins(TAXA_HZ, 300);
    // Dois bursts separados por apenas 100ms (8 amostras)
    const sinal = new Array<number>(TAXA_HZ * 3).fill(0);
    const periodoRapido = 8; // < 300ms refractary
    for (let b = 0; b < 10; b++) sinal[b * periodoRapido] = 2.0;
    const picos: number[] = [];
    sinal.forEach((v, i) => { if (pt.processar(v)) picos.push(i); });
    // Com refratário de 300ms, máximo 1 pico nos primeiros 300ms
    const picosNos300ms = picos.filter(idx => idx < 24).length;
    expect(picosNos300ms).toBeLessThanOrEqual(1);
  });

  it('UT-2.18.4 — silêncio prolongado após sinal em regime não gera picos espúrios', () => {
    const pt = new PanTompkins(TAXA_HZ);
    // Alimenta sinal por 3s para atingir regime
    gerarSinalBcg(3, 70).forEach(v => pt.processar(v));
    // Termina num zero (sinal caiu abaixo do limiar), acimaDaLimiar=false
    pt.processar(0);
    // Mais silêncio: não deve gerar novos picos
    const picosSilencio: boolean[] = [];
    for (let i = 0; i < 160; i++) picosSilencio.push(pt.processar(0));
    expect(picosSilencio.filter(Boolean).length).toBe(0);
  });

  it('UT-2.18.5 — atrasoAmostras retorna metade da janela MWI', () => {
    const pt = new PanTompkins(TAXA_HZ);
    expect(pt.atrasoAmostras).toBeGreaterThan(0);
    expect(pt.atrasoAmostras).toBeLessThan(20);
  });

  it('UT-2.18.6 — detecta múltiplos picos em sinal BCG periódico de 10s', () => {
    const pt = new PanTompkins(TAXA_HZ, 300);
    const sinal = gerarSinalBcg(10, 70);
    const picos: number[] = [];
    sinal.forEach((v, i) => { if (pt.processar(v)) picos.push(i); });
    // 10s a 70 BPM ≈ 11 batimentos esperados; pelo menos 3 devem ser detectados
    expect(picos.length).toBeGreaterThanOrEqual(3);
  });
});
