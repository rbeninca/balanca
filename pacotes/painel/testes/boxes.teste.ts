import { describe, it, expect } from 'vitest';
import { bancada, batidaCampos, postar, CHAVE } from './apoio/painel.js';

const T0 = 1_700_000_000_000;

interface RespostaBoxes {
  agora: number;
  alvo: string | null;
  boxes: Array<{
    serial: string;
    versao: string;
    instaladoEm: number | null;
    atualizouEm: number | null;
    atualizouEmEstimado: boolean;
    primeiraBatidaEm: number;
    ultimaBatidaEm: number;
  }>;
}

describe('GET /boxes', () => {
  it('exige a chave', async () => {
    const b = bancada();
    expect((await b.pedir('/boxes')).status).toBe(401);
    expect((await b.pedir('/boxes?chave=chute')).status).toBe(401);
    expect((await b.pedir(`/boxes?chave=${CHAVE}`, { chave: null })).status).toBe(200);
  });

  it('lista vazio quando nenhum box bateu ainda', async () => {
    const b = bancada();
    const r = await b.json<RespostaBoxes>(`/boxes?chave=${CHAVE}`);

    expect(r.boxes).toEqual([]);
    expect(r.alvo).toBeNull();
    expect(r.agora).toBeGreaterThan(0);
  });

  it('atualizouEm vem do lastUpdateTime que o box informou', async () => {
    const b = bancada();
    await b.pedir('/batida', postar(batidaCampos({ instaladoEm: T0 })));

    const [box] = (await b.json<RespostaBoxes>(`/boxes?chave=${CHAVE}`)).boxes;
    expect(box?.atualizouEm).toBe(T0);
    expect(box?.atualizouEmEstimado).toBe(false);
  });

  it('sem lastUpdateTime, estima pela primeira batida da versão atual', async () => {
    const b = bancada();
    // Chegou na 2.8.501 antes de o painel existir: o Android não informou
    // quando instalou, então a primeira vez que ele apareceu é o mais perto.
    await b.pedir('/batida', postar(batidaCampos({ versao: '2.8.501', instaladoEm: null })));
    await b.pedir('/batida', postar(batidaCampos({ versao: '2.8.501', instaladoEm: null })));

    const [box] = (await b.json<RespostaBoxes>(`/boxes?chave=${CHAVE}`)).boxes;
    expect(box?.instaladoEm).toBeNull();
    expect(box?.atualizouEm).not.toBeNull();
    expect(box?.atualizouEmEstimado).toBe(true);
    // A primeira da versão, e não a última.
    expect(box?.atualizouEm).toBeLessThanOrEqual(box?.ultimaBatidaEm ?? 0);
  });

  it('a estimativa acompanha a troca de versão', async () => {
    const b = bancada();
    await b.pedir('/batida', postar(batidaCampos({ versao: '2.8.500', instaladoEm: null })));
    const antes = (await b.json<RespostaBoxes>(`/boxes?chave=${CHAVE}`)).boxes[0]?.atualizouEm ?? 0;

    await new Promise((r) => setTimeout(r, 10));
    await b.pedir('/batida', postar(batidaCampos({ versao: '2.8.501', instaladoEm: null })));

    const depois = (await b.json<RespostaBoxes>(`/boxes?chave=${CHAVE}`)).boxes[0]?.atualizouEm ?? 0;
    expect(depois).toBeGreaterThan(antes);
  });

  it('o alvo vai junto, para a página saber quem está atrasado', async () => {
    const b = bancada();
    await b.pedir('/alvo', postar({ alvo: '2.8.501' }));

    expect((await b.json<RespostaBoxes>(`/boxes?chave=${CHAVE}`)).alvo).toBe('2.8.501');
  });

  it('um box por serial, mesmo com batidas repetidas', async () => {
    const b = bancada();
    await b.pedir('/batida', postar(batidaCampos()));
    await b.pedir('/batida', postar(batidaCampos({ ip: { eth0: '10.0.0.9' } })));
    await b.pedir('/batida', postar(batidaCampos({ serial: 'GFIG-TVBOX-AABBCCDDEEFF' })));

    const { boxes } = await b.json<RespostaBoxes>(`/boxes?chave=${CHAVE}`);
    expect(boxes.map((x) => x.serial)).toEqual(['GFIG-TVBOX-AABBCCDDEEFF', 'GFIG-TX9-58EB81E3618C']);
    expect(boxes[1]?.ultimaBatidaEm).toBeGreaterThanOrEqual(T0);
    expect(boxes[1]?.ultimaBatidaEm).toBeGreaterThanOrEqual(boxes[1]?.primeiraBatidaEm ?? 0);
  });
});
