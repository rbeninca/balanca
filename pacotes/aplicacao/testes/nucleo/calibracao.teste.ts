import { describe, it, expect } from 'vitest';
import { GRAVIDADE_PADRAO, montarDadosCalibracao, valorEsperadoN } from '../../src/nucleo/calibracao.js';

describe('nucleo/calibracao', () => {
  it('GRAVIDADE_PADRAO é 9.80665', () => {
    expect(GRAVIDADE_PADRAO).toBe(9.80665);
  });

  it('valorEsperadoN converte massa com o g informado', () => {
    expect(valorEsperadoN(100, 9.78769)).toBeCloseTo(0.978769, 6);
    expect(valorEsperadoN(1000, GRAVIDADE_PADRAO)).toBeCloseTo(9.80665, 5);
  });

  it('montarDadosCalibracao lê as colunas da sessão', () => {
    const d = montarDadosCalibracao(undefined, {
      massaCalibracaoG: 100,
      descricaoCelula: 'CALT 500 kg 2023',
      capacidadeCelulaG: 500000,
    });
    expect(d).toEqual({
      massaCalibracaoG: 100,
      descricaoCelula: 'CALT 500 kg 2023',
      capacidadeMaxGramas: 500000,
    });
  });

  it('montarDadosCalibracao tira g e acurácia do config_esp da sessão', () => {
    const d = montarDadosCalibracao({ gravidade: 9.78769, acuracia: 0.0003, capacidadeMaxGramas: 500000 });
    expect(d.gravidade).toBe(9.78769);
    expect(d.acuracia).toBe(0.0003);
    expect(d.capacidadeMaxGramas).toBe(500000);
  });

  it('colunas da sessão têm prioridade sobre o config_esp na capacidade', () => {
    const d = montarDadosCalibracao(
      { capacidadeMaxGramas: 999999 },
      { capacidadeCelulaG: 500000 },
    );
    expect(d.capacidadeMaxGramas).toBe(500000);
  });

  it('config_esp inválido não lança e não contribui', () => {
    expect(() => montarDadosCalibracao(null)).not.toThrow();
    expect(() => montarDadosCalibracao('texto')).not.toThrow();
    expect(() => montarDadosCalibracao([1, 2])).not.toThrow();
    expect(montarDadosCalibracao({ gravidade: 'nove' })).toEqual({});
  });

  it('extra só preenche o que ficou vazio', () => {
    const d = montarDadosCalibracao(
      { gravidade: 9.78769 },
      { massaCalibracaoG: 100 },
      { massaReferenciaG: 200, descricaoCelula: 'CALT', gravidade: 9.81, acuracia: 0.0003 },
    );
    expect(d.massaCalibracaoG).toBe(100);          // a sessão vence o extra
    expect(d.descricaoCelula).toBe('CALT');
    expect(d.gravidade).toBe(9.78769);             // config_esp vence o extra
    expect(d.acuracia).toBe(0.0003);
  });
});
