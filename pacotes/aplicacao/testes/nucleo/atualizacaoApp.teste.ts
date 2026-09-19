import { describe, it, expect } from 'vitest';
import { resumir, falhaEsperada, historico, compararVersao, type EstadoAtualizacaoApp } from '../../src/interface/atualizacaoApp.js';

const r = (versao: string) => ({ versao, tag: `v${versao}`, notas: `notas ${versao}` });

function estado(p: Partial<EstadoAtualizacaoApp> = {}): EstadoAtualizacaoApp {
  return {
    instalada: '2.3.0', fase: 'ociosa', disponiveis: [r('2.3.0'), r('2.4.0'), r('2.5.0')],
    plano: [r('2.4.0'), r('2.5.0')], indice: 0, progresso: 0, erro: null, verificado_em: 1, versao_inicial: null,
    ...p,
  };
}

describe('resumir', () => {
  it('ociosa com plano: mostra de → para e a cadeia', () => {
    const s = resumir(estado());
    expect(s.alvo).toBe('2.5.0');
    expect(s.passos.map(p => p.versao)).toEqual(['2.4.0', '2.5.0']);
    expect(s.haAtualizacao).toBe(true);
    expect(s.podeIniciar).toBe(true);
    expect(s.podeCancelar).toBe(false);
    expect(s.texto).toBe('Atualização disponível: 2.3.0 → 2.5.0');
    expect(s.progressoTotal).toBeNull();
  });

  it('ociosa sem plano: já está na mais recente', () => {
    const s = resumir(estado({ plano: [] }));
    expect(s.haAtualizacao).toBe(false);
    expect(s.podeIniciar).toBe(false);
    expect(s.texto).toContain('mais recente');
  });

  it('erro ao consultar sem execução aparece como texto, sem bloquear', () => {
    const s = resumir(estado({ plano: [], erro: 'Não foi possível consultar o repositório: timeout' }));
    expect(s.texto).toContain('timeout');
    expect(s.emAndamento).toBe(false);
  });

  it('baixando: progresso do passo e do total', () => {
    const s = resumir(estado({ fase: 'baixando', indice: 1, progresso: 50 }));
    expect(s.texto).toBe('Baixando 2.5.0 (2/2) — 50%');
    expect(s.emAndamento).toBe(true);
    expect(s.podeCancelar).toBe(true);
    expect(s.podeIniciar).toBe(false);
    expect(s.progressoTotal).toBe(73);   // 50% do 2º passo (com 90% reservado ao download)
  });

  it('instalando: não pode cancelar', () => {
    const s = resumir(estado({ fase: 'instalando', indice: 0, progresso: 100 }));
    expect(s.podeCancelar).toBe(false);
    expect(s.texto).toContain('Instalando 2.4.0 (1/2)');
  });

  it('concluída: de X para Y, 100%', () => {
    const s = resumir(estado({ fase: 'concluida', instalada: '2.5.0', plano: [r('2.4.0'), r('2.5.0')], indice: 2, versao_inicial: '2.3.0' }));
    expect(s.texto).toBe('Atualizado de 2.3.0 para 2.5.0.');
    expect(s.progressoTotal).toBe(100);
    expect(s.terminou).toBe(true);
    expect(s.podeIniciar).toBe(false);
  });

  it('erro na execução: texto e permite tentar de novo', () => {
    const s = resumir(estado({ fase: 'erro', erro: 'Versão 2.4.0: SHA-256 não confere' }));
    expect(s.texto).toBe('Falhou: Versão 2.4.0: SHA-256 não confere');
    expect(s.podeIniciar).toBe(true);
  });
});

describe('queda da API durante a instalação', () => {
  it('é esperada só quando o último estado era instalando', () => {
    expect(falhaEsperada(estado({ fase: 'instalando' }))).toBe(true);
    expect(falhaEsperada(estado({ fase: 'baixando' }))).toBe(false);
    expect(falhaEsperada(null)).toBe(false);
  });
});

describe('histórico e versões', () => {
  it('ordena numericamente, mais nova primeiro', () => {
    const h = historico(estado({ disponiveis: [r('2.9.0'), r('2.10.0'), r('2.3.0')] }));
    expect(h.map(x => x.versao)).toEqual(['2.10.0', '2.9.0', '2.3.0']);
    expect(compararVersao('v2.3.0', '2.3.0')).toBe(0);
  });
});
