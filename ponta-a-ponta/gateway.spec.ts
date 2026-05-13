/**
 * Testes E2E do gateway via HTTP health endpoint.
 * Requerem GATEWAY_URL definida (ex: http://localhost:8766).
 */
import { describe, it, expect } from 'vitest';

const GATEWAY_URL = process.env['GATEWAY_URL'] ?? '';
const PULAR = !GATEWAY_URL;

describe.skipIf(PULAR)('E2E — Gateway', () => {
  it('GET /saude retorna status ok', async () => {
    const res = await fetch(`${GATEWAY_URL}/saude`);
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('GET /saude retorna campo serial (booleano)', async () => {
    const res = await fetch(`${GATEWAY_URL}/saude`);
    const body = await res.json();
    expect(typeof body.serial).toBe('boolean');
  });

  it('GET /saude retorna campo clientes (número)', async () => {
    const res = await fetch(`${GATEWAY_URL}/saude`);
    const body = await res.json();
    expect(typeof body.clientes).toBe('number');
  });
});
