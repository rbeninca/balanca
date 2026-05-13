import type { FastifyInstance } from 'fastify';
import type { ProvedorSQLite } from '../bancoDados/ProvedorSQLite.js';

interface LeituraInput {
  marca_temporal: number;
  forca_newton: number;
  temperatura?: number | null;
  em_queima: boolean;
  impulso_acumulado_ns: number;
}

interface Leitura {
  id: number;
  id_sessao: string;
  marca_temporal: number;
  forca_newton: number;
  temperatura: number | null;
  em_queima: number;
  impulso_acumulado_ns: number;
}

interface Sessao {
  id: string;
  nome: string;
  duracao_ms: number;
  forca_maxima_n: number;
  impulso_total_ns: number;
}

function atualizarMetricasSessao(db: ProvedorSQLite, idSessao: string): void {
  const leituras = db.consultar<Pick<Leitura, 'marca_temporal' | 'forca_newton' | 'impulso_acumulado_ns'>>(
    'SELECT marca_temporal, forca_newton, impulso_acumulado_ns FROM leituras WHERE id_sessao = ? ORDER BY marca_temporal',
    [idSessao],
  );
  if (leituras.length === 0) return;

  const forcaMaxima = Math.max(...leituras.map(l => l.forca_newton));
  const ultimoImpulso = leituras[leituras.length - 1]?.impulso_acumulado_ns ?? 0;
  const duracao = (leituras[leituras.length - 1]?.marca_temporal ?? 0) - (leituras[0]?.marca_temporal ?? 0);

  db.executar(
    'UPDATE sessoes SET duracao_ms = ?, forca_maxima_n = ?, impulso_total_ns = ? WHERE id = ?',
    [duracao, forcaMaxima, ultimoImpulso, idSessao],
  );
}

export async function rotasLeituras(app: FastifyInstance, { db, verificarChave }: {
  db: ProvedorSQLite;
  verificarChave: (req: Parameters<FastifyInstance['addHook']>[1], rep: Parameters<FastifyInstance['addHook']>[1]) => Promise<void>;
}) {
  app.get<{ Params: { id: string } }>('/sessoes/:id/leituras', async (req, rep) => {
    const sessao = db.consultarUm<{ id: string }>('SELECT id FROM sessoes WHERE id = ?', [req.params.id]);
    if (!sessao) return rep.status(404).send({ erro: 'Sessão não encontrada' });

    const leituras = db.consultar<Leitura>(
      'SELECT * FROM leituras WHERE id_sessao = ? ORDER BY marca_temporal',
      [req.params.id],
    );
    return rep.send(leituras);
  });

  app.get<{ Params: { id: string } }>('/sessoes/:id/exportar.csv', async (req, rep) => {
    const sessao = db.consultarUm<Sessao>('SELECT * FROM sessoes WHERE id = ?', [req.params.id]);
    if (!sessao) return rep.status(404).send({ erro: 'Sessão não encontrada' });

    const leituras = db.consultar<Leitura>(
      'SELECT * FROM leituras WHERE id_sessao = ? ORDER BY marca_temporal',
      [req.params.id],
    );

    const linhas = ['marca_temporal,forca_newton,temperatura,em_queima,impulso_acumulado_ns'];
    for (const l of leituras) {
      linhas.push(`${l.marca_temporal},${l.forca_newton},${l.temperatura ?? ''},${l.em_queima},${l.impulso_acumulado_ns}`);
    }

    return rep
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="sessao-${req.params.id}.csv"`)
      .send(linhas.join('\n'));
  });

  app.post<{ Params: { id: string }; Body: LeituraInput[] }>(
    '/sessoes/:id/leituras',
    { preHandler: verificarChave },
    async (req, rep) => {
      const sessao = db.consultarUm<{ id: string }>('SELECT id FROM sessoes WHERE id = ?', [req.params.id]);
      if (!sessao) return rep.status(404).send({ erro: 'Sessão não encontrada' });

      const lotes = req.body;
      if (!Array.isArray(lotes) || lotes.length === 0) {
        return rep.status(400).send({ erro: 'Body deve ser um array não vazio de leituras' });
      }

      for (const l of lotes) {
        if (typeof l.marca_temporal !== 'number' || typeof l.forca_newton !== 'number' || typeof l.impulso_acumulado_ns !== 'number') {
          return rep.status(400).send({ erro: 'Campos obrigatórios: marca_temporal, forca_newton, impulso_acumulado_ns' });
        }
        db.executar(
          'INSERT INTO leituras (id_sessao, marca_temporal, forca_newton, temperatura, em_queima, impulso_acumulado_ns) VALUES (?, ?, ?, ?, ?, ?)',
          [req.params.id, l.marca_temporal, l.forca_newton, l.temperatura ?? null, l.em_queima ? 1 : 0, l.impulso_acumulado_ns],
        );
      }

      atualizarMetricasSessao(db, req.params.id);
      return rep.status(201).send({ inseridas: lotes.length });
    },
  );
}
