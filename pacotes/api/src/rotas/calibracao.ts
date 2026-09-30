import type { FastifyInstance } from 'fastify';
import type { ContextoRotas } from './tipos.js';

/** Registro de calibração da célula de carga (singleton, id = 1). */
interface LinhaCalibracao {
  massa_referencia_g: number | null;
  descricao_celula: string | null;
  capacidade_max_g: number | null;
  gravidade: number | null;
  atualizada_em: string | null;
}

const CAMPOS = ['massa_referencia_g', 'descricao_celula', 'capacidade_max_g', 'gravidade'] as const;

export async function rotasCalibracao(app: FastifyInstance, { db, verificarChave }: ContextoRotas) {
  // Leitura livre, como as demais rotas GET
  app.get('/calibracao', async (_req, rep) => {
    const linha = db.consultarUm<LinhaCalibracao>(
      'SELECT massa_referencia_g, descricao_celula, capacidade_max_g, gravidade, atualizada_em FROM calibracao WHERE id = 1',
    );
    return rep.send(linha ?? {
      massa_referencia_g: null, descricao_celula: null, capacidade_max_g: null, gravidade: null, atualizada_em: null,
    });
  });

  /**
   * Body parcial: campo ausente preserva o valor atual; null apaga.
   * INSERT OR REPLACE, para valer igual no SQLite antigo do app Android.
   */
  app.put('/calibracao', { preHandler: verificarChave }, async (req, rep) => {
    const body = req.body as Partial<Record<typeof CAMPOS[number], unknown>>;
    const atual = db.consultarUm<LinhaCalibracao>('SELECT * FROM calibracao WHERE id = 1');

    const proximo: Record<typeof CAMPOS[number], unknown> = {} as never;
    for (const campo of CAMPOS) {
      proximo[campo] = campo in body ? (body[campo] ?? null) : (atual?.[campo] ?? null);
    }

    const massa = proximo['massa_referencia_g'];
    const capac = proximo['capacidade_max_g'];
    const grav  = proximo['gravidade'];
    if (massa != null && (typeof massa !== 'number' || massa <= 0)) return rep.status(400).send({ erro: 'Massa de referência deve ser maior que zero' });
    if (capac != null && (typeof capac !== 'number' || capac <= 0)) return rep.status(400).send({ erro: 'Capacidade deve ser maior que zero' });
    if (grav != null && (typeof grav !== 'number' || grav < 9 || grav > 10)) return rep.status(400).send({ erro: 'Gravidade fora da faixa esperada (9 a 10 m/s²)' });
    if (proximo['descricao_celula'] != null && typeof proximo['descricao_celula'] !== 'string') return rep.status(400).send({ erro: 'Descrição da célula deve ser texto' });

    db.executar(
      `INSERT OR REPLACE INTO calibracao (id, massa_referencia_g, descricao_celula, capacidade_max_g, gravidade, atualizada_em)
       VALUES (1, ?, ?, ?, ?, datetime('now'))`,
      [massa, proximo['descricao_celula'], capac, grav],
    );

    const linha = db.consultarUm<LinhaCalibracao>(
      'SELECT massa_referencia_g, descricao_celula, capacidade_max_g, gravidade, atualizada_em FROM calibracao WHERE id = 1',
    );
    return rep.send(linha);
  });
}
