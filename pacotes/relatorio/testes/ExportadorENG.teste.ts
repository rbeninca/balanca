import { describe, it, expect } from 'vitest';
import { exportarENG } from '../src/exportadores/ExportadorENG.js';
import type { LeituraProcessada } from '@balancagfig/processamento/tipos';
import type { ResultadoAnalise } from '@balancagfig/analise';

const analise: ResultadoAnalise = {
  impulsoTotal_Ns: 2.94,
  forcaPico_N: 3.0,
  forcaMedia_N: 1.73,
  forcaRms_N: 1.8,
  coefVariacao: 0.104,
  duracaoQueima_s: 1.7,
  t10_s: 0.07,
  t90_s: 0.35,
  tempoSubida_s: 0.28,
  impulsoEspecifico_s: 9.97,
  letraMotor: 'B',
  nomeComum: 'B1.7',
  perfilQueima: 'neutro-plato',
  anomalias: [],
};

function makeLeituras(n: number): LeituraProcessada[] {
  return Array.from({ length: n }, (_, i) => ({
    marcaTemporal: 1000 + i * 60,
    forcaNewton: 1.5 + Math.sin(Math.PI * i / n) * 1.5,
    temperatura: 0,
    emQueima: true,
    impulsoAcumuladoNs: i * 0.1,
  }));
}

const leituras = makeLeituras(5);

describe('ExportadorENG', () => {
  // UT-4.3.1
  it('linhas de comentário iniciam com ;', () => {
    const saida = exportarENG(leituras, analise);
    const comentarios = saida.split('\n').filter(l => l.startsWith(';'));
    expect(comentarios.length).toBeGreaterThan(0);
  });

  // UT-4.3.2
  it('linha de cabeçalho do motor tem 7 campos', () => {
    const saida = exportarENG(leituras, analise);
    const linhaMotor = saida.split('\n').find(l => !l.startsWith(';') && !l.startsWith(' ') && l.trim().length > 0)!;
    expect(linhaMotor.trim().split(/\s+/).length).toBe(7);
  });

  // UT-4.3.3
  it('nome do motor na posição 0', () => {
    const saida = exportarENG(leituras, analise);
    const linhaMotor = saida.split('\n').find(l => !l.startsWith(';') && !l.startsWith(' ') && l.trim())!;
    expect(linhaMotor.trim().split(/\s+/)[0]).toBe('B1.7');
  });

  // UT-4.3.4
  it('fabricante GFIG na posição 6', () => {
    const saida = exportarENG(leituras, analise);
    const linhaMotor = saida.split('\n').find(l => !l.startsWith(';') && !l.startsWith(' ') && l.trim())!;
    const partes = linhaMotor.trim().split(/\s+/);
    expect(partes[6]).toBe('GFIG');
  });

  // UT-4.3.5
  it('ponto final com força zero', () => {
    const saida = exportarENG(leituras, analise);
    const linhasDados = saida.split('\n').filter(l => l.startsWith('   '));
    const ultima = linhasDados[linhasDados.length - 1]!;
    expect(ultima.trim().split(/\s+/)[1]).toBe('0.000');
  });

  // UT-4.3.6
  it('primeiro ponto tem tempo > 0 (RASP nao aceita t=0)', () => {
    const saida = exportarENG(leituras, analise);
    const linhasDados = saida.split('\n').filter(l => l.startsWith('   '));
    const t0 = parseFloat(linhasDados[0]!.trim().split(/\s+/)[0]!);
    expect(t0).toBeGreaterThan(0);
    expect(t0).toBeLessThan(0.01);
  });

  // OpenRocket: diametro, comprimento e massas devem ser > 0
  it('cabecalho tem diametro, comprimento e massas positivos mesmo sem metadados', () => {
    const saida = exportarENG(leituras, analise);
    const h = saida.split('\n').find(l => !l.startsWith(';') && !l.startsWith(' ') && l.trim())!.trim().split(/\s+/);
    const [, diam, comp, delays, mProp, mTot] = h;
    expect(parseFloat(diam!)).toBeGreaterThan(0);
    expect(parseFloat(comp!)).toBeGreaterThan(0);
    expect(delays).toBe('P');
    expect(parseFloat(mProp!)).toBeGreaterThan(0);
    expect(parseFloat(mTot!)).toBeGreaterThan(parseFloat(mProp!));
  });

  it('respeita os metadados informados', () => {
    const saida = exportarENG(leituras, analise, { diametroMm: 24, comprimentoMm: 70, massaPropelente_g: 12, massaTotal_g: 30, fabricante: 'GFIG' });
    const h = saida.split('\n').find(l => !l.startsWith(';') && !l.startsWith(' ') && l.trim())!.trim().split(/\s+/);
    expect(h[1]).toBe('24');
    expect(h[2]).toBe('70');
    expect(parseFloat(h[4]!)).toBeCloseTo(0.012, 4);
    expect(parseFloat(h[5]!)).toBeCloseTo(0.030, 4);
  });

  // UT-4.3.7
  it('pontos em ordem crescente de tempo', () => {
    const saida = exportarENG(leituras, analise);
    const linhasDados = saida.split('\n').filter(l => l.startsWith('   '));
    const tempos = linhasDados.map(l => parseFloat(l.trim().split(/\s+/)[0]!));
    for (let i = 1; i < tempos.length; i++) {
      expect(tempos[i]).toBeGreaterThan(tempos[i - 1]!);
    }
  });

  // UT-4.3.8
  it('linha final é ;', () => {
    const saida = exportarENG(leituras, analise);
    expect(saida.trim()).toMatch(/;$/);
  });

  // UT-4.3.9
  it('comentário sobre Isp com texto de massa ausente quando sem Isp', () => {
    const semIsp: ResultadoAnalise = { ...analise, impulsoEspecifico_s: undefined };
    const saida = exportarENG(leituras, semIsp);
    const ispLinha = saida.split('\n').find(l => l.includes('Isp'));
    expect(ispLinha).toBeDefined();
    expect(ispLinha).toContain('massa');
  });

  // UT-4.3.10
  it('com Isp disponível, linha mostra o valor numérico', () => {
    const saida = exportarENG(leituras, analise);
    const ispLinha = saida.split('\n').find(l => l.includes('Isp'));
    expect(ispLinha).toContain('9.97');
  });
});
