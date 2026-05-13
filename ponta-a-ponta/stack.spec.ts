/**
 * Testes de smoke do stack completo via docker-compose.
 * Execute com: API_URL=http://localhost:3000 GATEWAY_URL=http://localhost:8766 npm test
 */
import { describe, it, expect } from 'vitest';

const API_URL     = process.env['API_URL']     ?? '';
const GATEWAY_URL = process.env['GATEWAY_URL'] ?? '';
const PULAR       = !API_URL || !GATEWAY_URL;

describe.skipIf(PULAR)('E2E — Stack Completo', () => {
  // IT-8.1.1
  it('API e Gateway respondem simultaneamente', async () => {
    const [apiRes, gwRes] = await Promise.all([
      fetch(`${API_URL}/saude`),
      fetch(`${GATEWAY_URL}/saude`),
    ]);
    expect(apiRes.ok).toBe(true);
    expect(gwRes.ok).toBe(true);
  });

  // IT-8.1.3
  it('ciclo completo: criar sessão via API e listar', async () => {
    const chave = process.env['API_CHAVE'] ?? '';
    const criar = await fetch(`${API_URL}/sessoes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-chave-api': chave },
      body: JSON.stringify({ nome: 'Stack Test' }),
    });
    expect(criar.status).toBe(201);

    const { id } = await criar.json();
    const listar = await fetch(`${API_URL}/sessoes`);
    const sessoes = await listar.json();
    expect(sessoes.some((s: any) => s.id === id)).toBe(true);
  });
});
