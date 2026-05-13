import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectarAmbiente } from '../../src/nucleo/DetectorAmbiente.js';

function mockFetch(gatewayOk: boolean, apiOk: boolean) {
  return vi.fn().mockImplementation(async (url: string) => {
    if (url.includes('8766')) return { ok: gatewayOk };
    if (url.includes('3000')) return { ok: apiOk };
    return { ok: false };
  });
}

describe('DetectorAmbiente', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  // UT-7.5.1
  it('gateway disponível → Cenário A', async () => {
    vi.stubGlobal('fetch', mockFetch(true, false));
    const r = await detectarAmbiente({ timeoutMs: 100 });
    expect(r.cenario).toBe('A');
  });

  // UT-7.5.2
  it('gateway + API disponíveis → temApi = true', async () => {
    vi.stubGlobal('fetch', mockFetch(true, true));
    const r = await detectarAmbiente({ timeoutMs: 100 });
    expect(r.cenario).toBe('A');
    expect(r.temApi).toBe(true);
  });

  // UT-7.5.3
  it('gateway + sem API → temApi = false, armazenamento local', async () => {
    vi.stubGlobal('fetch', mockFetch(true, false));
    const r = await detectarAmbiente({ timeoutMs: 100 });
    expect(r.temApi).toBe(false);
  });

  // UT-7.5.4
  it('sem gateway + WebSerial → Cenário C', async () => {
    vi.stubGlobal('fetch', mockFetch(false, false));
    Object.defineProperty(navigator, 'serial', { value: {}, configurable: true });
    const r = await detectarAmbiente({ timeoutMs: 100 });
    expect(r.cenario).toBe('C');
  });

  // UT-7.5.5
  it('sem gateway + sem WebSerial + Bluetooth → Cenário B', async () => {
    vi.stubGlobal('fetch', mockFetch(false, false));
    Object.defineProperty(navigator, 'serial', { value: undefined, configurable: true, writable: true });
    Object.defineProperty(navigator, 'bluetooth', { value: {}, configurable: true });
    const r = await detectarAmbiente({ timeoutMs: 100 });
    expect(r.cenario).toBe('B');
  });

  // UT-7.5.6
  it('nada disponível → throw com mensagem clara', async () => {
    vi.stubGlobal('fetch', mockFetch(false, false));
    Object.defineProperty(navigator, 'serial', { value: undefined, configurable: true, writable: true });
    Object.defineProperty(navigator, 'bluetooth', { value: undefined, configurable: true, writable: true });
    await expect(detectarAmbiente({ timeoutMs: 100 })).rejects.toThrow(/Nenhuma forma/);
  });

  // UT-7.5.7
  it('onProgresso chamado pelo menos uma vez durante detecção', async () => {
    vi.stubGlobal('fetch', mockFetch(true, false));
    const chamadas: string[] = [];
    await detectarAmbiente({ timeoutMs: 100, onProgresso: msg => chamadas.push(msg) });
    expect(chamadas.length).toBeGreaterThan(0);
  });

  // UT-7.5.8 — fetch que lança AbortError após timeout → gateway indisponível
  it('fetch que lança AbortError → gateway considerado indisponível', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')));
    Object.defineProperty(navigator, 'serial', { value: undefined, configurable: true, writable: true });
    Object.defineProperty(navigator, 'bluetooth', { value: undefined, configurable: true, writable: true });
    await expect(detectarAmbiente({ timeoutMs: 100 })).rejects.toThrow(/Nenhuma forma/);
  });
});
