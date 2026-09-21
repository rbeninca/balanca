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

/** A linha de colunas: a primeira que não é comentário (#). */
function cabecalhoColunas(csv: string): string {
  return csv.split('\n').find(l => !l.startsWith('#') && l.trim().length > 0) ?? '';
}

/**
 * As linhas de dados, pulando os comentários e o cabeçalho.
 *
 * Antes isto era `!l.startsWith('marca')`, casando com o nome da primeira
 * coluna — que deixou de ser `marcaTemporal_ms`. Depender do nome da coluna
 * para achar o cabeçalho quebra a cada renomeação.
 */
function linhasDados(csv: string): string[] {
  const linhas = csv.split('\n');
  const iCabecalho = linhas.findIndex(l => !l.startsWith('#') && l.trim().length > 0);
  return linhas.slice(iCabecalho + 1).filter(l => l.trim().length > 0);
}

describe('ExportadorCSV', () => {
  // UT-4.1.1
  it('primeira linha começa com #', () => {
    const csv = exportarCSV(leiturasBasico, undefined, { nomeSessao: 'Teste' });
    expect(csv.split('\n')[0]).toMatch(/^#/);
  });

  // UT-4.1.2
  it('separador padrão é ;', () => {
    const csv = exportarCSV(leiturasBasico);
    const linhaData = cabecalhoColunas(csv);
    expect(linhaData).toContain(';');
    expect(linhaData).not.toContain(',');
  });

  // UT-4.1.3
  it('separador customizável para ,', () => {
    const csv = exportarCSV(leiturasBasico, undefined, undefined, { separador: ',' });
    const linhaData = cabecalhoColunas(csv);
    expect(linhaData).toContain(',');
  });

  // UT-4.1.4
  it('colunas obrigatórias presentes no cabeçalho', () => {
    const cabecalho = cabecalhoColunas(exportarCSV(leiturasBasico));
    expect(cabecalho).toContain('tempoRelativo_s');
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
    expect(linhasDados(exportarCSV(ls))).toHaveLength(155);
  });

  // UT-4.1.6
  it('forcaGf = forcaNewton × 101.972 com 2 casas decimais', () => {
    const ls: LeituraProcessada[] = [{ marcaTemporal: 0, forcaNewton: 2.0, temperatura: 0, emQueima: false, impulsoAcumuladoNs: 0 }];
    const campos = linhasDados(exportarCSV(ls))[0]!.split(';');
    expect(campos[2]).toBe((2.0 * 101.972).toFixed(2));
  });

  // UT-4.1.7
  it('emQueima como 0/1', () => {
    const linhas = linhasDados(exportarCSV(leiturasBasico));
    expect(linhas[0]!.split(';')[5]).toBe('0');  // emQueima=false
    expect(linhas[1]!.split(';')[5]).toBe('1');  // emQueima=true
  });

  // UT-4.1.8
  it('sessão sem metadados mostra --- nas linhas de cabeçalho', () => {
    const headerLines = exportarCSV(leiturasBasico).split('\n').filter(l => l.startsWith('#'));
    expect(headerLines.some(l => l.includes('---'))).toBe(true);
  });

  // Nada mede temperatura hoje: o pipeline preenche o campo com 0 como espaço
  // reservado, e sessões antigas têm NULL. Nos dois casos a célula sai vazia —
  // escrever 0 afirmaria uma medição que ninguém fez.
  it('temperatura não medida sai vazia, nunca a palavra undefined', () => {
    const semTemp = [{ marcaTemporal: 0, forcaNewton: 1, emQueima: false, impulsoAcumuladoNs: 0 }] as unknown as LeituraProcessada[];
    const linha = linhasDados(exportarCSV(semTemp))[0]!;
    expect(linha).not.toContain('undefined');
    expect(linha.split(';')[4]).toBe('');
  });

  it('o 0 do pipeline (espaço reservado) também sai vazio', () => {
    const linha = linhasDados(exportarCSV([{ marcaTemporal: 0, forcaNewton: 1, temperatura: 0, emQueima: false, impulsoAcumuladoNs: 0 }]))[0]!;
    expect(linha.split(';')[4]).toBe('');
  });

  it('temperatura de verdade continua sendo escrita', () => {
    const linha = linhasDados(exportarCSV([{ marcaTemporal: 0, forcaNewton: 1, temperatura: 23.5, emQueima: false, impulsoAcumuladoNs: 0 }]))[0]!;
    expect(linha.split(';')[4]).toBe('23.5');
  });

  it('o arquivo explica o que é a coluna de tempo', () => {
    const linhaTempo = exportarCSV(leiturasBasico).split('\n').find(l => l.startsWith('# Tempo'));
    expect(linhaTempo).toBeDefined();
    expect(linhaTempo).toContain('início da gravação');
  });

  // UT-4.1.9
  it('Isp no cabeçalho quando disponível', () => {
    const csv = exportarCSV(leiturasBasico, { impulsoEspecifico_s: 9.97 } as any, undefined);
    const ispLinha = csv.split('\n').find(l => l.includes('Isp'));
    expect(ispLinha).toBeDefined();
    expect(ispLinha).toContain('9.97');
  });

  // O tempo é relativo ao INÍCIO DA GRAVAÇÃO, não ao boot do ESP.
  it('tempo começa em zero mesmo com uptime alto do ESP', () => {
    const ls: LeituraProcessada[] = [
      { marcaTemporal: 7_200_000, forcaNewton: 1, temperatura: 0, emQueima: false, impulsoAcumuladoNs: 0 },
      { marcaTemporal: 7_200_010, forcaNewton: 1, temperatura: 0, emQueima: false, impulsoAcumuladoNs: 0 },
      { marcaTemporal: 7_200_250, forcaNewton: 1, temperatura: 0, emQueima: false, impulsoAcumuladoNs: 0 },
    ];
    const tempos = linhasDados(exportarCSV(ls)).map(l => l.split(';')[0]);
    expect(tempos).toEqual(['0.000', '0.010', '0.250']);
  });

  it('não gera tempo negativo quando as leituras vêm fora de ordem', () => {
    const ls: LeituraProcessada[] = [
      { marcaTemporal: 500, forcaNewton: 1, temperatura: 0, emQueima: false, impulsoAcumuladoNs: 0 },
      { marcaTemporal: 100, forcaNewton: 1, temperatura: 0, emQueima: false, impulsoAcumuladoNs: 0 },
    ];
    const tempos = linhasDados(exportarCSV(ls)).map(l => Number(l.split(';')[0]));
    expect(tempos.every(t => t >= 0)).toBe(true);
    expect(tempos).toContain(0);
  });

  it('sessão vazia não quebra', () => {
    const csv = exportarCSV([]);
    expect(linhasDados(csv)).toHaveLength(0);
    expect(cabecalhoColunas(csv)).toContain('tempoRelativo_s');
  });
});
