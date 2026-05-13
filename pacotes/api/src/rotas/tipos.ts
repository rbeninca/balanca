import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ProvedorSQLite } from '../bancoDados/ProvedorSQLite.js';

export interface ContextoRotas {
  db: ProvedorSQLite;
  verificarChave: (req: FastifyRequest, rep: FastifyReply) => Promise<void>;
}
