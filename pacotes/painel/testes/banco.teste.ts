import { describe, it, expect } from 'vitest';
import { criarBancoPronto } from './apoio/bancoSqlite.js';
import { gravarAlvo, lerAlvo, listarBoxes, registrarBatida } from '../src/repositorio.js';

const T0 = 1_700_000_000_000;

function batida(extra: Partial<Parameters<typeof registrarBatida>[1]> = {}) {
  return {
    serial: 'GFIG-TX9-58EB81E3618C',
    versao: '2.8.501',
    versionCode: 24,
    instaladoEm: T0,
    modelo: 'TX9',
    placa: 'gxl',
    ip: { wlan0: '192.168.0.50' },
    root: true,
    ...extra,
  };
}

describe('banco', () => {
  it('o esquema aplicado é idempotente e deixa o banco vazio', async () => {
    const banco = await criarBancoPronto();

    expect(await listarBoxes(banco)).toEqual([]);
  });

  it('a primeira batida cria a linha do box', async () => {
    const banco = await criarBancoPronto();
    await registrarBatida(banco, batida(), T0);

    const [box] = await listarBoxes(banco);
    expect(box).toEqual(
      expect.objectContaining({
        serial: 'GFIG-TX9-58EB81E3618C',
        versao: '2.8.501',
        versionCode: 24,
        modelo: 'TX9',
        placa: 'gxl',
        ip: { wlan0: '192.168.0.50' },
        root: true,
        instaladoEm: T0,
        primeiraBatidaEm: T0,
        ultimaBatidaEm: T0,
      }),
    );
  });

  it('batidas seguintes atualizam a mesma linha, sem duplicar', async () => {
    const banco = await criarBancoPronto();
    await registrarBatida(banco, batida(), T0);
    await registrarBatida(banco, batida({ ip: { wlan0: '192.168.0.51' } }), T0 + 600_000);

    const boxes = await listarBoxes(banco);
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toEqual(
      expect.objectContaining({
        ip: { wlan0: '192.168.0.51' },
        primeiraBatidaEm: T0,
        ultimaBatidaEm: T0 + 600_000,
      }),
    );
  });

  it('o histórico acumula uma linha por batida', async () => {
    const banco = await criarBancoPronto();
    await registrarBatida(banco, batida(), T0);
    await registrarBatida(banco, batida(), T0 + 600_000);
    await registrarBatida(banco, batida(), T0 + 1_200_000);

    const { results } = await banco
      .prepare('SELECT em, versao FROM batidas WHERE serial = ? ORDER BY em')
      .bind('GFIG-TX9-58EB81E3618C')
      .all<{ em: number }>();

    expect(results?.map((r) => r.em)).toEqual([T0, T0 + 600_000, T0 + 1_200_000]);
  });

  it('uma versão nova não apaga o instaladoEm antigo quando o Android não informa', async () => {
    const banco = await criarBancoPronto();
    await registrarBatida(banco, batida(), T0);
    await registrarBatida(banco, batida({ versao: '2.8.502', instaladoEm: null }), T0 + 600_000);

    const [box] = await listarBoxes(banco);
    expect(box?.versao).toBe('2.8.502');
    expect(box?.instaladoEm).toBe(T0);
  });

  it('guarda e lê o alvo, inclusive para limpá-lo', async () => {
    const banco = await criarBancoPronto();
    expect(await lerAlvo(banco)).toBeNull();

    await gravarAlvo(banco, '2.8.501');
    expect(await lerAlvo(banco)).toBe('2.8.501');

    await gravarAlvo(banco, '2.8.502');
    expect(await lerAlvo(banco)).toBe('2.8.502');

    await gravarAlvo(banco, null);
    expect(await lerAlvo(banco)).toBeNull();
  });
});
