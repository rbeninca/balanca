import type { PacoteDados } from '@balancagfig/protocolo';

/**
 * Sinal determinístico que exercita o pipeline inteiro: repouso ruidoso,
 * degrau (queima), spike isolado, senoide de 10 Hz sobreposta, volta ao
 * repouso com deriva lenta. Timestamps em ms inteiros alternando 12/13 ms
 * (≈ 80 Hz), como a ESP realmente manda. Valores passam por Math.fround
 * porque no fio a força é float32 (o Kotlin recebe Float).
 */
export function gerarSinalFixture(n = 400): PacoteDados[] {
  let semente = 12345;
  const rand = () => { semente = (semente * 1103515245 + 12345) & 0x7fffffff; return semente / 0x7fffffff - 0.5; };
  const pacotes: PacoteDados[] = [];
  let t = 1000;
  for (let i = 0; i < n; i++) {
    let f = 0.02 * rand();                                           // ruído de repouso ±0,01 N
    if (i >= 100 && i < 250) f += 20 + 0.5 * Math.sin(2 * Math.PI * 10 * (i / 80));   // "queima" + 10 Hz
    if (i === 180) f += 500;                                         // spike isolado
    if (i >= 250) f += 0.0005 * (i - 250);                           // deriva lenta (zero tracking)
    pacotes.push({ tipo: 'DADOS', marcaTemporal: t, forcaNewtons: Math.fround(f), forcaBruta: 0, statusFirmware: 0 });
    t += i % 2 === 0 ? 12 : 13;
  }
  return pacotes;
}
