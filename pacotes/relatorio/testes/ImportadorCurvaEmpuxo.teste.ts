import { describe, it, expect } from 'vitest';
import { importarCurvaEmpuxo } from '../src/importadores/ImportadorCurvaEmpuxo.js';
import { exportarCurvaEmpuxo } from '../src/exportadores/ExportadorCurvaEmpuxo.js';
import type { LeituraProcessada } from '@balancagfig/processamento/tipos';

function leitura(marcaTemporal: number, forcaNewton: number): LeituraProcessada {
  return { marcaTemporal, forcaNewton, temperatura: 0, emQueima: false, impulsoAcumuladoNs: 0 };
}

/**
 * Trecho real, copiado de uma exportação da tela de análise — é o arquivo que
 * o professor devolve depois de passar pelo programa dele.
 */
const AMOSTRA_REAL = `#  Saída do balancaGFIG no formato CURVA EMPUXO 2.2
#  Caso   = Sessão 20/09/2026 23:38:55
#  Título = D0.3, 21/09/2026
#  t [s]       F [N]
   0.0000000   2.365083E-01
   0.0120000   2.417445E-01
   0.0230000   2.470495E-01
   0.0350000   2.441824E-01`;

describe('importarCurvaEmpuxo — o essencial é tempo e força', () => {
  // O que o usuário pediu: o cabeçalho é opcional. Um arquivo só com números
  // tem de entrar do mesmo jeito.
  it('arquivo só com números, sem cabeçalho nenhum', () => {
    const r = importarCurvaEmpuxo('0.000 1.5\n0.012 2.5\n0.024 3.5');
    expect(r.leituras).toHaveLength(3);
    expect(r.leituras.map(l => l.marcaTemporal)).toEqual([0, 12, 24]);
    expect(r.leituras.map(l => l.forcaNewton)).toEqual([1.5, 2.5, 3.5]);
    expect(r.nome).toBeUndefined();
    expect(r.titulo).toBeUndefined();
    expect(r.avisos).toEqual([]);
  });

  it('lê Caso e Título do cabeçalho quando existem', () => {
    const r = importarCurvaEmpuxo(AMOSTRA_REAL);
    expect(r.nome).toBe('Sessão 20/09/2026 23:38:55');
    expect(r.titulo).toBe('D0.3, 21/09/2026');
  });

  it('converte o trecho real preservando tempo e empuxo', () => {
    const r = importarCurvaEmpuxo(AMOSTRA_REAL);
    expect(r.leituras.map(l => l.marcaTemporal)).toEqual([0, 12, 23, 35]);
    expect(r.leituras[0]!.forcaNewton).toBeCloseTo(0.2365083, 9);
    expect(r.leituras[2]!.forcaNewton).toBeCloseTo(0.2470495, 9);
  });

  // O exportador escreve `---` no lugar do metadado que não existe; isso não
  // pode voltar como se fosse um nome.
  it('o --- do cabeçalho não vira nome nem título', () => {
    const txt = '#  Caso   = ---\n#  Título = ---\n0.000 1\n0.012 2';
    const r = importarCurvaEmpuxo(txt);
    expect(r.nome).toBeUndefined();
    expect(r.titulo).toBeUndefined();
  });

  it('linhas de comentário desconhecidas são ignoradas sem reclamar', () => {
    const txt = '#  Saída do balancaGFIG no formato CURVA EMPUXO 2.2\n# t [s]  F [N]\n0.000 1\n0.012 2';
    expect(importarCurvaEmpuxo(txt).avisos).toEqual([]);
  });

  it('o Título é achado mesmo escrito sem acento', () => {
    expect(importarCurvaEmpuxo('# Titulo = Motor X\n0 1\n0.01 2').titulo).toBe('Motor X');
  });
});

describe('importarCurvaEmpuxo — tempo e impulso', () => {
  it('o tempo é relativo ao primeiro ponto, não ao relógio de origem', () => {
    const r = importarCurvaEmpuxo('10.000 1\n10.012 2\n10.024 3');
    expect(r.leituras.map(l => l.marcaTemporal)).toEqual([0, 12, 24]);
  });

  it('o impulso acumulado é refeito por trapézio', () => {
    // (1+2)/2*0.012 = 0.018 ; (2+3)/2*0.012 = 0.03 → 0.048
    const r = importarCurvaEmpuxo('0.000 1\n0.012 2\n0.024 3');
    const impulsos = r.leituras.map(l => l.impulsoAcumuladoNs);
    expect(impulsos[0]).toBe(0);
    expect(impulsos[1]).toBeCloseTo(0.018, 12);
    expect(impulsos[2]).toBeCloseTo(0.048, 12);
  });

  it('o impulso não regride nem quando o empuxo é negativo', () => {
    const r = importarCurvaEmpuxo('0.000 0\n0.010 -1\n0.020 0');
    const impulsos = r.leituras.map(l => l.impulsoAcumuladoNs);
    expect(impulsos[1]).toBeCloseTo(-0.005, 12);
    expect(impulsos[2]).toBeCloseTo(-0.010, 12);
  });

  // Dois pontos no mesmo milissegundo acontecem numa gravação real; o segundo
  // não pode ser descartado por isso.
  it('tempo repetido passa e soma zero ao impulso', () => {
    const r = importarCurvaEmpuxo('0.000 1\n0.012 2\n0.012 3\n0.024 4');
    expect(r.leituras).toHaveLength(4);
    expect(r.leituras.map(l => l.marcaTemporal)).toEqual([0, 12, 12, 24]);
    expect(r.leituras[2]!.impulsoAcumuladoNs).toBe(r.leituras[1]!.impulsoAcumuladoNs);
    expect(r.avisos).toEqual([]);
  });

  // Para trás quebraria o trapézio e a escala dos gráficos.
  it('tempo fora de ordem é ignorado, com aviso', () => {
    const r = importarCurvaEmpuxo('0.000 1\n0.024 3\n0.012 2\n0.036 4');
    expect(r.leituras.map(l => l.marcaTemporal)).toEqual([0, 24, 36]);
    expect(r.avisos.join(' ')).toContain('fora de ordem');
  });

  it('a leitura sai no formato que o resto do programa espera', () => {
    const l = importarCurvaEmpuxo(AMOSTRA_REAL).leituras[0]!;
    expect(Number.isInteger(l.marcaTemporal)).toBe(true);
    expect(typeof l.emQueima).toBe('boolean');
    expect(l.temperatura).toBe(0);
  });
});

describe('importarCurvaEmpuxo — números como a planilha escreve', () => {
  it('aceita notação científica e decimal simples na mesma coluna', () => {
    const r = importarCurvaEmpuxo('0.000 2.5E-01\n0.012 0.3\n0.024 -5.000000E-02');
    expect(r.leituras.map(l => l.forcaNewton)).toEqual([0.25, 0.3, -0.05]);
  });

  // A planilha pt-BR troca o ponto decimal por vírgula.
  it('aceita vírgula como separador decimal', () => {
    const r = importarCurvaEmpuxo('0,000 2,5\n0,012 3,25');
    expect(r.leituras.map(l => l.marcaTemporal)).toEqual([0, 12]);
    expect(r.leituras.map(l => l.forcaNewton)).toEqual([2.5, 3.25]);
  });

  // Com os dois separadores, o último é o decimal e o outro é milhar.
  it('1.234,5 e 1,234.5 são o mesmo número', () => {
    const ptBr = importarCurvaEmpuxo('0 1.234,5\n0.01 2');
    const en   = importarCurvaEmpuxo('0 1,234.5\n0.01 2');
    expect(ptBr.leituras[0]!.forcaNewton).toBe(1234.5);
    expect(en.leituras[0]!.forcaNewton).toBe(1234.5);
  });
});

describe('importarCurvaEmpuxo — o que não serve', () => {
  it('arquivo sem nenhum par tempo/força é recusado', () => {
    expect(() => importarCurvaEmpuxo('')).toThrow(/CURVA EMPUXO/);
    expect(() => importarCurvaEmpuxo('# só cabeçalho\n')).toThrow(/CURVA EMPUXO/);
  });

  it('um único ponto não forma curva', () => {
    expect(() => importarCurvaEmpuxo('0.000 1.5')).toThrow(/CURVA EMPUXO/);
  });

  it('linhas válidas sobrevivem às inválidas, com aviso', () => {
    const r = importarCurvaEmpuxo('0.000 1\nlixo\n0.012 2\n--- ---\n0.024 3');
    expect(r.leituras).toHaveLength(3);
    expect(r.avisos.join(' ')).toContain('2 linha(s)');
  });
});

describe('importarCurvaEmpuxo — ida e volta com o exportador', () => {
  it('exportar e importar devolve a mesma curva', () => {
    const original = [
      leitura(7_200_000, 0.2101074),
      leitura(7_200_012, 0.24),
      leitura(7_200_023, -0.05),
      leitura(7_200_035, 12.5),
    ];
    const txt = exportarCurvaEmpuxo(original, { nomeSessao: 'D0.3', nomeMotor: 'D0.3', data: '21/09/2026' });

    const r = importarCurvaEmpuxo(txt);
    expect(r.nome).toBe('D0.3');
    expect(r.titulo).toBe('D0.3, 21/09/2026');
    expect(r.leituras.map(l => l.marcaTemporal)).toEqual([0, 12, 23, 35]);
    // 7 dígitos significativos é o que a notação científica do arquivo carrega
    for (const [i, l] of r.leituras.entries()) {
      expect(l.forcaNewton).toBeCloseTo(original[i]!.forcaNewton, 7);
    }
    expect(r.avisos).toEqual([]);
  });
});
