import { describe, it, expect } from 'vitest';
import { PERFIS, ORDEM_PERFIS, detectarPerfil, htmlSeletorPerfil } from '../../src/interface/presetsProcessamento.js';
import { flagsDoFiltroPrincipal } from '@balancagfig/processamento';

describe('perfis de processamento (Fase 12)', () => {
  it('cada perfil define um só filtro principal e nunca Hampel + Mediana juntos', () => {
    for (const p of Object.values(PERFIS)) {
      expect(p.patch.filtroPrincipal).toBeDefined();
      expect(p.patch.ativoHampel && p.patch.ativoMediana).toBeFalsy();
    }
  });

  it('aplicar um perfil e detectar devolve o mesmo perfil (ida e volta)', () => {
    for (const chave of ['pesagem', 'motor', 'impacto', 'bruto'] as const) {
      const estado = { ...PERFIS[chave].patch, ...flagsDoFiltroPrincipal(PERFIS[chave].patch.filtroPrincipal!), limiarZonaMortaN: 0.05, taxaEstimadaHz: 83.3 };
      expect(detectarPerfil(estado)).toBe(chave);
    }
  });

  it('qualquer alteração vira Personalizado; parâmetros fora do perfil são livres', () => {
    const motor = { ...PERFIS.motor.patch };
    expect(detectarPerfil({ ...motor, janelaSG: 7 })).toBe('personalizado');
    expect(detectarPerfil({ ...motor, ativoNotch: true })).toBe('personalizado');
    expect(detectarPerfil({ ...motor, limiarEntradaN: 0.9, limiarZonaMortaN: 0.123 })).toBe('motor');   // não fazem parte do perfil
    expect(detectarPerfil({})).toBe('personalizado');
  });

  it('o seletor lista os perfis na ordem, com Personalizado primeiro', () => {
    const html = htmlSeletorPerfil();
    expect(html).toContain('id="sel-perfil"');
    const posicoes = ORDEM_PERFIS.map(p => html.indexOf(`value="${p}"`));
    expect(posicoes.every(x => x > 0)).toBe(true);
    expect([...posicoes].sort((a, b) => a - b)).toEqual(posicoes);
  });

  it('impacto usa corte de 25 Hz (abaixo de Nyquist a 80 Hz) e impulso do filtrado; bruto desliga tudo', () => {
    expect(PERFIS.impacto.patch.frequenciaCorteHz).toBe(25);
    expect(PERFIS.impacto.patch.fonteCalculoImpulso).toBe('filtrado');
    const b = PERFIS.bruto.patch;
    expect([b.ativoHampel, b.ativoMediana, b.ativoNotch, b.ativoZeroTracking, b.ativoZonaMorta, b.ativoDetectorQueima].every(v => v === false)).toBe(true);
    expect(b.filtroPrincipal).toBe('nenhum');
  });
});
