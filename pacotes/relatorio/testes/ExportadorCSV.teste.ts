import { describe, it, expect } from 'vitest';
import { exportarCSV } from '../src/exportadores/ExportadorCSV.js';
import type { LeituraProcessada } from '@balancagfig/processamento/tipos';

function makeLeituras(n: number): LeituraProcessada[] {
  return Array.from({ length: n }, (_, i) => ({
    marcaTemporal: i * 10,
    forcaNewton: 1.5 + i * 0.01,
    temperatura: 25,
    emQueima: i > 5 && i < n - 5,
    impulsoAcumuladoNs: i * 0.015,
  }));
}

const leiturasBasico: LeituraProcessada[] = [
  { marcaTemporal: 0, forcaNewton: 2.0, temperatura: 25, emQueima: false, impulsoAcumuladoNs: 0 },
  { marcaTemporal: 100, forcaNewton: 5.0, temperatura: 26, emQueima: true, impulsoAcumuladoNs: 0.35 },
];

describe('ExportadorCSV', () => {
  // UT-4.1.1
  it('primeira linha começa com #', () => {
    const csv = exportarCSV(leiturasBasico, undefined, { nomeSessao: 'Teste' });
    expect(csv.split('\n')[0]).toMatch(/^#/);
  });

  // UT-4.1.2
  it('separador padrão é ;', () => {
    const csv = exportarCSV(leiturasBasico);
    const linhaData = csv.split('\n').find(l => !l.startsWith('#'))!;
    expect(linhaData).toContain(';');
    expect(linhaData).not.toContain(',');
  });

  // UT-4.1.3
  it('separador customizável para ,', () => {
    const csv = exportarCSV(leiturasBasico, undefined, undefined, { separador: ',' });
    const linhaData = csv.split('\n').find(l => !l.startsWith('#'))!;
    expect(linhaData).toContain(',');
  });

  // UT-4.1.4
  it('colunas obrigatórias presentes no cabeçalho', () => {
    const csv = exportarCSV(leiturasBasico);
    const cabecalho = csv.split('\n').find(l => !l.startsWith('#'))!;
    expect(cabecalho).toContain('marcaTemporal_ms');
    expect(cabecalho).toContain('forcaNewton_N');
    expect(cabecalho).toContain('forcaGf');
    expect(cabecalho).toContain('forcaKgf');
    expect(cabecalho).toContain('temperatura_C');
    expect(cabecalho).toContain('emQueima');
    expect(cabecalho).toContain('impulsoAcumulado_Ns');
  });

  // UT-4.1.5
  it('155 leituras → 155 linhas de dados', () => {
    const ls = makeLeituras(155);
    const csv = exportarCSV(ls);
    const linhasDados = csv.split('\n').filter(l => !l.startsWith('#') && l.trim().length > 0 && !l.startsWith('marca'));
    expect(linhasDados).toHaveLength(155);
  });

  // UT-4.1.6
  it('forcaGf = forcaNewton × 101.972 com 2 casas decimais', () => {
    const ls: LeituraProcessada[] = [{ marcaTemporal: 0, forcaNewton: 2.0, temperatura: 0, emQueima: false, impulsoAcumuladoNs: 0 }];
    const csv = exportarCSV(ls);
    const linhaData = csv.split('\n').filter(l => !l.startsWith('#') && !l.startsWith('marca') && l.trim())[0]!;
    const campos = linhaData.split(';');
    expect(campos[2]).toBe((2.0 * 101.972).toFixed(2));
  });

  // UT-4.1.7
  it('emQueima como 0/1', () => {
    const csv = exportarCSV(leiturasBasico);
    const linhas = csv.split('\n').filter(l => !l.startsWith('#') && !l.startsWith('marca') && l.trim());
    const l1 = linhas[0]!.split(';');
    const l2 = linhas[1]!.split(';');
    expect(l1[5]).toBe('0');  // emQueima=false
    expect(l2[5]).toBe('1');  // emQueima=true
  });

  // UT-4.1.8
  it('sessão sem metadados mostra --- nas linhas de cabeçalho', () => {
    const csv = exportarCSV(leiturasBasico);
    const headerLines = csv.split('\n').filter(l => l.startsWith('#'));
    const temDash = headerLines.some(l => l.includes('---'));
    expect(temDash).toBe(true);
  });

  // UT-4.1.9
  it('Isp no cabeçalho quando disponível', () => {
    const csv = exportarCSV(leiturasBasico, { impulsoEspecifico_s: 9.97 } as any, undefined);
    const ispLinha = csv.split('\n').find(l => l.includes('Isp'));
    expect(ispLinha).toBeDefined();
    expect(ispLinha).toContain('9.97');
  });
});
