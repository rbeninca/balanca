import { describe, it, expect } from 'vitest';
import { bancada, batidaCampos, postar, CHAVE } from './apoio/painel.js';

interface RespostaBoxes {
  boxes: Array<{
    serial: string;
    versao: string;
    nuncaBateu: boolean;
    primeiraBatidaEm: number;
    ultimaBatidaEm: number;
    local?: string | null;
    ficha: { local: string | null; responsavel: string | null; finalidade: string | null };
  }>;
}

const SERIAL = 'GFIG-TX9-58EB81E3618A';

function ficha(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    serial: SERIAL,
    local: 'Laboratório 2, IFSC',
    responsavel: 'Prof. Romulo',
    finalidade: 'bancada de ensaio',
    ...extra,
  };
}

async function caixa(b: ReturnType<typeof bancada>, serial = SERIAL) {
  const { boxes } = await b.json<RespostaBoxes>(`/boxes?chave=${CHAVE}`);
  return boxes.find((x) => x.serial === serial);
}

describe('POST /box — a ficha do inventário', () => {
  it('exige a chave', async () => {
    const b = bancada();
    expect((await b.pedir('/box', { ...postar(ficha()), chave: null })).status).toBe(401);
    expect((await b.pedir('/box', { ...postar(ficha()), chave: 'chute' })).status).toBe(401);
  });

  it('cadastra um box que nunca bateu', async () => {
    const b = bancada();
    const r = await b.pedir('/box', postar(ficha()));

    expect(r.status).toBe(200);
    const box = await caixa(b);
    expect(box?.nuncaBateu).toBe(true);
    expect(box?.ficha).toEqual({
      local: 'Laboratório 2, IFSC',
      responsavel: 'Prof. Romulo',
      finalidade: 'bancada de ensaio',
    });
  });

  it('regrava por cima, sem criar uma segunda linha', async () => {
    const b = bancada();
    await b.pedir('/box', postar(ficha()));
    await b.pedir('/box', postar(ficha({ local: 'Sala 4', responsavel: 'Secretaria' })));

    const { boxes } = await b.json<RespostaBoxes>(`/boxes?chave=${CHAVE}`);
    expect(boxes).toHaveLength(1);
    expect(boxes[0]?.ficha).toEqual({
      local: 'Sala 4',
      responsavel: 'Secretaria',
      finalidade: 'bancada de ensaio',
    });
  });

  it('campo em branco apaga; campo ausente do corpo não é tocado', async () => {
    const b = bancada();
    await b.pedir('/box', postar(ficha()));
    await b.pedir('/box', postar({ serial: SERIAL, local: '   ' }));

    const box = await caixa(b);
    expect(box?.ficha.local).toBeNull();
    // Um corpo que só fala do local não pode apagar o resto: quem manda duas
    // linhas não sabe das outras duas, e apagar seria perder o que já estava.
    expect(box?.ficha.responsavel).toBe('Prof. Romulo');
    expect(box?.ficha.finalidade).toBe('bancada de ensaio');
  });

  it('null também apaga, e um corpo só com o serial cadastra sem ficha', async () => {
    const b = bancada();
    await b.pedir('/box', postar(ficha()));
    await b.pedir('/box', postar({ serial: SERIAL, responsavel: null }));

    expect((await caixa(b))?.ficha.responsavel).toBeNull();

    await b.pedir('/box', postar({ serial: 'GFIG-NOVO-1234' }));
    const novo = await caixa(b, 'GFIG-NOVO-1234');
    expect(novo?.nuncaBateu).toBe(true);
    expect(novo?.ficha).toEqual({ local: null, responsavel: null, finalidade: null });
  });

  it('recusa serial que não parece serial e campo longo demais', async () => {
    const b = bancada();
    expect((await b.pedir('/box', postar(ficha({ serial: 'GFIG TX9 618A' })))).status).toBe(400);
    expect((await b.pedir('/box', postar(ficha({ serial: '' })))).status).toBe(400);
    expect((await b.pedir('/box', postar(ficha({ local: 'x'.repeat(301) })))).status).toBe(400);
    expect((await b.pedir('/box', postar(ficha({ local: 42 })))).status).toBe(400);
  });

  it('a batida não apaga a ficha, e o box registrado à mão deixa de ser novidade', async () => {
    const b = bancada();
    await b.pedir('/box', postar(ficha()));
    await b.pedir('/batida', postar(batidaCampos({ serial: SERIAL })));

    const box = await caixa(b);
    expect(box?.nuncaBateu).toBe(false);
    expect(box?.versao).toBe('2.8.501');
    expect(box?.ficha.local).toBe('Laboratório 2, IFSC');
    // A primeira batida preenche a data: ela estava zerada, não é para ficar.
    expect(box?.primeiraBatidaEm).toBeGreaterThan(0);
    expect(box?.ultimaBatidaEm).toBeGreaterThanOrEqual(box?.primeiraBatidaEm ?? 0);
  });

  it('a ficha pode ser escrita para um box que já bateu', async () => {
    const b = bancada();
    await b.pedir('/batida', postar(batidaCampos({ serial: SERIAL })));
    await b.pedir('/box', postar(ficha({ local: 'Sala 4' })));

    const box = await caixa(b);
    expect(box?.ficha.local).toBe('Sala 4');
    expect(box?.versao).toBe('2.8.501');
  });
});

describe('POST /box/remover', () => {
  it('tira do inventário o box que nunca bateu', async () => {
    const b = bancada();
    await b.pedir('/box', postar(ficha()));

    expect((await b.pedir('/box/remover', postar({ serial: SERIAL }))).status).toBe(200);
    expect(await caixa(b)).toBeUndefined();
  });

  it('não deixa remover um box que já bateu', async () => {
    const b = bancada();
    await b.pedir('/batida', postar(batidaCampos({ serial: SERIAL })));

    expect((await b.pedir('/box/remover', postar({ serial: SERIAL }))).status).toBe(409);
    expect(await caixa(b)).toBeDefined();
  });

  it('404 para serial que não está no painel, 401 sem chave', async () => {
    const b = bancada();
    expect((await b.pedir('/box/remover', postar({ serial: 'GFIG-NAO-EXISTE' }))).status).toBe(404);
    expect((await b.pedir('/box/remover', { ...postar({ serial: SERIAL }), chave: null })).status).toBe(401);
    expect((await b.pedir('/box/remover', postar({}))).status).toBe(400);
  });
});
