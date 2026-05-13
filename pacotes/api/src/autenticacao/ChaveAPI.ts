import type { FastifyRequest, FastifyReply } from 'fastify';
import { readFileSync } from 'node:fs';

function lerChave(caminho: string): string | null {
  try {
    return readFileSync(caminho, 'utf-8').trim();
  } catch {
    return null;
  }
}

export function criarVerificadorChaveAPI(chaveOuCaminho?: string) {
  // chaveOuCaminho pode ser a chave diretamente (para testes) ou caminho do arquivo
  let chaveValida: string | null = null;

  if (chaveOuCaminho) {
    if (chaveOuCaminho.startsWith('/') || chaveOuCaminho.startsWith('./')) {
      chaveValida = lerChave(chaveOuCaminho);
    } else {
      chaveValida = chaveOuCaminho;
    }
  } else {
    const caminho = process.env['CAMINHO_CHAVE_API'] ?? '/dados/.chave-api';
    chaveValida = lerChave(caminho);
  }

  return async function verificarChaveAPI(req: FastifyRequest, rep: FastifyReply): Promise<void> {
    if (!chaveValida) return; // modo dev — sem autenticação

    const chaveRecebida = req.headers['x-chave-api'] as string | undefined;
    if (!chaveRecebida || chaveRecebida !== chaveValida) {
      return rep.status(401).send({ erro: 'Chave de API inválida ou ausente' });
    }
  };
}
