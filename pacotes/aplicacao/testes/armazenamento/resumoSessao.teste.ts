import { describe, it, expect } from 'vitest';
import { resumoDaListagem, resumoDeLeituras } from '../../src/armazenamento/resumoSessao.js';
import { analisarMotor } from '@balancagfig/analise';
import type { LeituraProcessada } from '@balancagfig/processamento/tipos';

function curva(pico = 20): LeituraProcessada[] {
  const leituras: LeituraProcessada[] = [];
  let impulso = 0;
  for (let i = 0; i < 300; i++) {
    const f = i >= 50 && i < 250 ? pico : 0;
    impulso += f * 0.0125;
    leituras.push({
      marcaTemporal: i * 12.5, forcaNewton: f, emQueima: f > 0, impulsoAcumuladoNs: impulso,
    } as LeituraProcessada);
  }
  return leituras;
}

describe('resumoDaListagem', () => {
  it('sem total_leituras (gateway antigo) devolve undefined', () => {
    expect(resumoDaListagem({})).toBeUndefined();
    expect(resumoDaListagem({ total_leituras: null })).toBeUndefined();
  });

  it('sessão vazia: só a contagem', () => {
    expect(resumoDaListagem({ total_leituras: 0, forca_media_queima_n: null, impulso_queima_ns: null }))
      .toEqual({ totalLeituras: 0 });
  });

  it('classifica pela NAR com impulso e força média da queima', () => {
    const r = resumoDaListagem({ total_leituras: 4000, forca_media_queima_n: 20, impulso_queima_ns: 50 });
    expect(r).toEqual({ totalLeituras: 4000, letraMotor: 'F', nomeMotor: 'F20.0' });
  });

  it('ignora valores não finitos', () => {
    expect(resumoDaListagem({ total_leituras: 10, forca_media_queima_n: NaN, impulso_queima_ns: 50 }))
      .toEqual({ totalLeituras: 10 });
  });
});

describe('resumoDeLeituras', () => {
  it('lista vazia: só a contagem', () => {
    expect(resumoDeLeituras([])).toEqual({ totalLeituras: 0 });
  });

  it('bate com analisarMotor', () => {
    const leituras = curva(20);
    const esperado = analisarMotor(leituras, {});
    expect(resumoDeLeituras(leituras)).toEqual({
      totalLeituras: leituras.length,
      letraMotor: esperado.letraMotor,
      nomeMotor: esperado.nomeComum,
    });
  });

  it('sem força significativa: só a contagem', () => {
    const silencio = curva(0);
    expect(resumoDeLeituras(silencio)).toEqual({ totalLeituras: silencio.length });
  });

  it('dá o mesmo resultado que resumoDaListagem para a mesma sessão', () => {
    const leituras = curva(60);
    const a = analisarMotor(leituras, {});
    expect(resumoDaListagem({
      total_leituras: leituras.length, forca_media_queima_n: a.forcaMedia_N, impulso_queima_ns: a.impulsoTotal_Ns,
    })).toEqual(resumoDeLeituras(leituras));
  });
});
