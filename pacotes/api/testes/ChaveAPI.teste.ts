import { describe, it, expect } from 'vitest';
import { criarVerificadorChaveAPI } from '../src/autenticacao/ChaveAPI.js';
import type { FastifyRequest, FastifyReply } from 'fastify';

function criarReq(chave?: string): FastifyRequest {
  return {
    headers: chave ? { 'x-chave-api': chave } : {},
  } as unknown as FastifyRequest;
}

function criarRep(): { status: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn>; statusCode: number; sent: boolean } {
  const rep = {
    statusCode: 200,
    sent: false,
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  return rep;
}

describe('criarVerificadorChaveAPI', () => {
  // UT-6.2.1
  it('passa sem autenticação quando nenhuma chave configurada', async () => {
    const verificar = criarVerificadorChaveAPI('');
    const rep = criarRep();
    await verificar(criarReq(), rep as unknown as FastifyReply);
    expect(rep.status).not.toHaveBeenCalled();
  });

  // UT-6.2.2
  it('passa quando chave correta é enviada', async () => {
    const verificar = criarVerificadorChaveAPI('chave-secreta');
    const rep = criarRep();
    await verificar(criarReq('chave-secreta'), rep as unknown as FastifyReply);
    expect(rep.status).not.toHaveBeenCalled();
  });

  // UT-6.2.3
  it('rejeita com 401 quando chave errada', async () => {
    const verificar = criarVerificadorChaveAPI('chave-certa');
    const rep = criarRep();
    await verificar(criarReq('chave-errada'), rep as unknown as FastifyReply);
    expect(rep.status).toHaveBeenCalledWith(401);
    expect(rep.send).toHaveBeenCalledWith(expect.objectContaining({ erro: expect.any(String) }));
  });

  // UT-6.2.4
  it('rejeita com 401 quando cabeçalho ausente', async () => {
    const verificar = criarVerificadorChaveAPI('chave-certa');
    const rep = criarRep();
    await verificar(criarReq(), rep as unknown as FastifyReply);
    expect(rep.status).toHaveBeenCalledWith(401);
  });
});
