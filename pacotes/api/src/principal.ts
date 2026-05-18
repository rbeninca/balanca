import Fastify from 'fastify';
import cors from '@fastify/cors';
import { ProvedorSQLite } from './bancoDados/ProvedorSQLite.js';
import { criarVerificadorChaveAPI } from './autenticacao/ChaveAPI.js';
import { rotasSessoes } from './rotas/sessoes.js';
import { rotasLeituras } from './rotas/leituras.js';
import { rotasMetadados } from './rotas/metadados.js';

export interface OpcoesCriarApp {
  caminhoBanco: string;
  chaveAPI?: string;
}

export function criarApp(opcoes: OpcoesCriarApp) {
  const app = Fastify({ logger: false, bodyLimit: 10 * 1024 * 1024 }); // 10 MB
  const db = new ProvedorSQLite(opcoes.caminhoBanco);
  const verificarChave = criarVerificadorChaveAPI(opcoes.chaveAPI);

  app.register(cors, { origin: true });

  app.get('/saude', async (_req, rep) => {
    return rep.send({ status: 'ok', modo: db.obterModo() });
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contexto: any = { db, verificarChave };
  app.register(rotasSessoes, contexto);
  app.register(rotasLeituras, contexto);
  app.register(rotasMetadados, contexto);

  app.addHook('onClose', () => { db.fechar(); });

  return app;
}

if (process.env['NODE_ENV'] !== 'test') {
  const caminhoBanco = process.env['CAMINHO_BANCO'] ?? '/dados/balanca.db';
  const servidor = criarApp({ caminhoBanco });

  servidor.listen({ port: Number(process.env['PORTA_API'] ?? 3000), host: '0.0.0.0' }, (err, address) => {
    if (err) { process.exit(1); }
    console.log(`API iniciada em ${address}`);
  });

  process.on('SIGTERM', async () => {
    await servidor.close();
    process.exit(0);
  });
}
