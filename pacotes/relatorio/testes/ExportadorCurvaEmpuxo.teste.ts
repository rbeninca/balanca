import { describe, it, expect } from 'vitest';
import { exportarCurvaEmpuxo } from '../src/exportadores/ExportadorCurvaEmpuxo.js';
import type { LeituraProcessada } from '@balancagfig/processamento/tipos';

function leitura(marcaTemporal: number, forcaNewton: number): LeituraProcessada {
  return { marcaTemporal, forcaNewton, temperatura: 0, emQueima: false, impulsoAcumuladoNs: 0 };
}

/** As linhas de dados: as que não começam com `#`. */
function linhasDados(txt: string): string[] {
  return txt.split('\n').filter(l => l.trim().length > 0 && !l.startsWith('#'));
}

describe('ExportadorCurvaEmpuxo', () => {
  it('cabeçalho no formato do CURVA EMPUXO', () => {
    const txt = exportarCurvaEmpuxo([leitura(0, 2.1)], { nomeSessao: 'PF-3_TE-2025-03-08' });
    const linhas = txt.split('\n');
    expect(linhas[0]).toContain('CURVA EMPUXO 2.2');
    expect(linhas[1]).toBe('#  Caso   = PF-3_TE-2025-03-08');
    expect(linhas[3]).toBe('#  t [s]       F [N]');
  });

  it('Título junta motor e data', () => {
    const txt = exportarCurvaEmpuxo([leitura(0, 1)], { nomeMotor: 'PF-3', data: '08/03/2025' });
    expect(txt).toContain('#  Título = PF-3, 08/03/2025');
  });

  it('sem metadados, os campos saem como ---', () => {
    const txt = exportarCurvaEmpuxo([leitura(0, 1)]);
    expect(txt).toContain('#  Caso   = ---');
    expect(txt).toContain('#  Título = ---');
  });

  // A primeira amostra em t = 0 é o que distingue este formato do .eng, que a
  // exige em t > 0.
  it('o tempo começa em 0.0000000', () => {
    const txt = exportarCurvaEmpuxo([leitura(500, 1), leitura(512, 2), leitura(524, 3)]);
    expect(linhasDados(txt)[0]).toMatch(/^ {3}0\.0000000 {3}/);
  });

  it('o tempo é relativo ao início da gravação, com 7 casas', () => {
    const txt = exportarCurvaEmpuxo([leitura(7_200_000, 1), leitura(7_200_012, 2)]);
    const tempos = linhasDados(txt).map(l => l.trim().split(/\s+/)[0]);
    expect(tempos).toEqual(['0.0000000', '0.0120000']);
  });

  // O valor de referência do arquivo do professor abre em 2.101074E-01.
  it('empuxo em notação científica, E maiúsculo e expoente de 2 dígitos', () => {
    const txt = exportarCurvaEmpuxo([leitura(0, 0.2101074)]);
    expect(linhasDados(txt)[0]).toContain('2.101074E-01');
  });

  it('expoente positivo também leva sinal e 2 dígitos', () => {
    const txt = exportarCurvaEmpuxo([leitura(0, 1234.5)]);
    expect(linhasDados(txt)[0]).toContain('1.234500E+03');
  });

  it('zero vira 0.000000E+00', () => {
    const txt = exportarCurvaEmpuxo([leitura(0, 0)]);
    expect(linhasDados(txt)[0]).toContain('0.000000E+00');
  });

  // Diferente do .eng, que limita a zero porque o RASP exige: aqui a curva é a
  // medida, e o repouso oscila em torno de zero.
  it('empuxo negativo é preservado, não limitado a zero', () => {
    const txt = exportarCurvaEmpuxo([leitura(0, -0.05)]);
    expect(linhasDados(txt)[0]).toContain('-5.000000E-02');
  });

  it('sai uma linha por leitura, sem recorte de queima', () => {
    const ls = Array.from({ length: 155 }, (_, i) => leitura(i * 12, 1 + i));
    expect(linhasDados(exportarCurvaEmpuxo(ls))).toHaveLength(155);
  });

  it('gravação vazia sai só com o cabeçalho', () => {
    expect(linhasDados(exportarCurvaEmpuxo([]))).toHaveLength(0);
  });
});
