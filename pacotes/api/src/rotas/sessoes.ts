import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { ProvedorSQLite } from '../bancoDados/ProvedorSQLite.js';

interface Sessao {
  id: string;
  nome: string;
  id_motor: string | null;
  criado_em: string;
  duracao_ms: number;
  forca_maxima_n: number;
  impulso_total_ns: number;
  observacoes: string | null;
}

export async function rotasSessoes(app: FastifyInstance, { db, verificarChave }: {
  db: ProvedorSQLite;
  verificarChave: (req: Parameters<FastifyInstance['addHook']>[1], rep: Parameters<FastifyInstance['addHook']>[1]) => Promise<void>;
}) {
  // ─── Leitura (sem autenticação) ───────────────────────────────────────────

  app.get('/sessoes', async (_req, rep) => {
    const sessoes = db.consultar<Sessao>('SELECT * FROM sessoes ORDER BY criado_em DESC');
    return rep.send(sessoes);
  });

  app.get<{ Params: { id: string } }>('/sessoes/:id', async (req, rep) => {
    const sessao = db.consultarUm<Sessao>('SELECT * FROM sessoes WHERE id = ?', [req.params.id]);
    if (!sessao) return rep.status(404).send({ erro: 'Sessão não encontrada' });
    return rep.send(sessao);
  });

  // ─── Escrita (com autenticação) ───────────────────────────────────────────

  app.post('/sessoes', { preHandler: verificarChave }, async (req, rep) => {
    const body = req.body as { nome?: string; id_motor?: string; observacoes?: string };
    if (!body.nome) return rep.status(400).send({ erro: 'Campo "nome" é obrigatório' });

    const id = randomUUID();
    db.executar(
      'INSERT INTO sessoes (id, nome, id_motor, observacoes) VALUES (?, ?, ?, ?)',
      [id, body.nome, body.id_motor ?? null, body.observacoes ?? null],
    );
    const sessao = db.consultarUm<Sessao>('SELECT * FROM sessoes WHERE id = ?', [id]);
    return rep.status(201).send(sessao);
  });

  app.delete<{ Params: { id: string } }>('/sessoes/:id', { preHandler: verificarChave }, async (req, rep) => {
    const existente = db.consultarUm<{ id: string }>('SELECT id FROM sessoes WHERE id = ?', [req.params.id]);
    if (!existente) return rep.status(404).send({ erro: 'Sessão não encontrada' });
    db.executar('DELETE FROM sessoes WHERE id = ?', [req.params.id]);
    return rep.status(204).send();
  });
}
