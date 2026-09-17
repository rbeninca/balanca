import { describe, it, expect } from 'vitest';
import { formatarTamanho, agruparArquivos, type ArquivoPendrive } from '../src/interface/TelaPendrive.js';

describe('formatarTamanho', () => {
  it('formata bytes em B/KB/MB/GB (base 1000)', () => {
    expect(formatarTamanho(0)).toBe('0 B');
    expect(formatarTamanho(512)).toBe('512 B');
    expect(formatarTamanho(40960)).toBe('41.0 KB');
    expect(formatarTamanho(15_747_825_664)).toBe('15.7 GB');
  });
  it('valores inválidos viram travessão', () => {
    expect(formatarTamanho(-1)).toBe('—');
    expect(formatarTamanho(NaN)).toBe('—');
  });
});

describe('agruparArquivos', () => {
  const arqs: ArquivoPendrive[] = [
    { nome: 'balanca-20260917-120057.db', tamanhoBytes: 40960, data: '2026-09-17 12:00', pasta: 'backups' },
    { nome: 'balanca-20260917-122604.db', tamanhoBytes: 40960, data: '2026-09-17 12:26', pasta: 'backups' },
    { nome: 'Teste_B6_ab12.csv', tamanhoBytes: 2485, data: '2026-09-17 12:10', pasta: 'sessoes' },
    { nome: 'Teste_B6_ab12.eng', tamanhoBytes: 1812, data: '2026-09-17 12:10', pasta: 'sessoes' },
  ];
  it('separa backups e sessões', () => {
    const g = agruparArquivos(arqs);
    expect(g.backups).toHaveLength(2);
    expect(g.sessoes).toHaveLength(2);
  });
  it('ordena backups por data decrescente', () => {
    const g = agruparArquivos(arqs);
    expect(g.backups[0]!.nome).toContain('122604'); // mais recente primeiro
    expect(g.backups[1]!.nome).toContain('120057');
  });
});
