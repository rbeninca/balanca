import type { FastifyInstance } from 'fastify';
import type { ContextoRotas } from './tipos.js';

interface MetadadosSessao {
  id_sessao: string;
  massa_propelente_g: number | null;
  diametro_mm: number | null;
  comprimento_mm: number | null;
  fabricante: string | null;
  descricao: string | null;
  observacoes: string | null;
}

export async function rotasMetadados(app: FastifyInstance, { db, verificarChave }: ContextoRotas) {
  app.get<{ Params: { id: string } }>('/sessoes/:id/metadados', async (req, rep) => {
    const sessao = db.consultarUm<{ id: string }>('SELECT id FROM sessoes WHERE id = ?', [req.params.id]);
    if (!sessao) return rep.status(404).send({ erro: 'Sessão não encontrada' });

    const meta = db.consultarUm<MetadadosSessao>(
      'SELECT * FROM metadados_sessao WHERE id_sessao = ?',
      [req.params.id],
    );
    if (!meta) return rep.status(404).send({ erro: 'Metadados não encontrados' });
    return rep.send(meta);
  });

  app.post<{ Params: { id: string } }>('/sessoes/:id/metadados', { preHandler: verificarChave }, async (req, rep) => {
    const sessao = db.consultarUm<{ id: string }>('SELECT id FROM sessoes WHERE id = ?', [req.params.id]);
    if (!sessao) return rep.status(404).send({ erro: 'Sessão não encontrada' });

    const body = req.body as Partial<Omit<MetadadosSessao, 'id_sessao'>>;

    const existente = db.consultarUm<{ id_sessao: string }>(
      'SELECT id_sessao FROM metadados_sessao WHERE id_sessao = ?',
      [req.params.id],
    );

    if (existente) {
      db.executar(
        `UPDATE metadados_sessao SET
          massa_propelente_g = ?, diametro_mm = ?, comprimento_mm = ?,
          fabricante = ?, descricao = ?, observacoes = ?
         WHERE id_sessao = ?`,
        [
          body.massa_propelente_g ?? null,
          body.diametro_mm ?? null,
          body.comprimento_mm ?? null,
          body.fabricante ?? null,
          body.descricao ?? null,
          body.observacoes ?? null,
          req.params.id,
        ],
      );
    } else {
      db.executar(
        `INSERT INTO metadados_sessao (id_sessao, massa_propelente_g, diametro_mm, comprimento_mm, fabricante, descricao, observacoes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          req.params.id,
          body.massa_propelente_g ?? null,
          body.diametro_mm ?? null,
          body.comprimento_mm ?? null,
          body.fabricante ?? null,
          body.descricao ?? null,
          body.observacoes ?? null,
        ],
      );
    }

    const meta = db.consultarUm<MetadadosSessao>(
      'SELECT * FROM metadados_sessao WHERE id_sessao = ?',
      [req.params.id],
    );
    return rep.status(existente ? 200 : 201).send(meta);
  });
}
