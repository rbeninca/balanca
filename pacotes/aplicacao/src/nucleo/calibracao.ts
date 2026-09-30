// Registro de calibração da célula de carga: cliente REST do singleton do host
// (GET/PUT /calibracao) e resolução dos dados que vão ao relatório.
// As funções puras ficam separadas para serem testáveis sem DOM.

export { GRAVIDADE_PADRAO, type DadosCelula } from './sugestaoZonaMorta.js';

/** Registro de calibração como o host guarda (e o wizard edita). */
export interface CalibracaoSalva {
  /** Massa de referência usada na calibração, em gramas. */
  massaReferenciaG?: number;
  /** Texto breve que define a célula (ex.: "CALT 500 kg 2023"). */
  descricaoCelula?: string;
  /** Capacidade nominal da célula, em gramas. */
  capacidadeMaxGramas?: number;
  /** Gravidade local (m/s²). */
  gravidade?: number;
  atualizadaEm?: string;
}

/** Dados da célula prontos para o relatório (fonte: o que a sessão gravou). */
export interface DadosCalibracao {
  massaCalibracaoG?: number;
  descricaoCelula?: string;
  capacidadeMaxGramas?: number;
  gravidade?: number;
  /** Classe de acurácia como fração do fundo de escala (0,03 % → 0,0003). */
  acuracia?: number;
}

const CHAVE_LS = 'balancagfig:calibracao';

/** Host da API: o ip salvo na conexão ou, servido pelo próprio box, quem serviu a SPA. */
export function enderecoApi(): string {
  try {
    const salvo = JSON.parse(localStorage.getItem('balancagfig:conexao') ?? '{}') as { ip?: string };
    if (salvo.ip) return salvo.ip;
  } catch { /* conexão sem ip salvo */ }
  return location.hostname || 'localhost';
}

function chaveApi(): string {
  try {
    const salvo = JSON.parse(localStorage.getItem('balancagfig:conexao') ?? '{}') as { chave?: string };
    return salvo.chave ?? '';
  } catch { return ''; }
}

/** Cópia local (navegador) do registro — sobrevive sem REST (WebSerial/GitHub Pages). */
function lerLocal(): CalibracaoSalva | null {
  try {
    const raw = localStorage.getItem(CHAVE_LS);
    return raw ? JSON.parse(raw) as CalibracaoSalva : null;
  } catch { return null; }
}

function gravarLocal(c: CalibracaoSalva): void {
  try { localStorage.setItem(CHAVE_LS, JSON.stringify(c)); } catch { /* sem storage */ }
}

interface LinhaApi {
  massa_referencia_g?: number | null;
  descricao_celula?: string | null;
  capacidade_max_g?: number | null;
  gravidade?: number | null;
  atualizada_em?: string | null;
}

/** GET /calibracao; sem API (ou falha), cai na cópia local do navegador. */
export async function obterCalibracao(): Promise<CalibracaoSalva | null> {
  try {
    const res = await fetch(`http://${enderecoApi()}:3000/calibracao`);
    if (res.ok) {
      const d = await res.json() as LinhaApi;
      return {
        massaReferenciaG: d.massa_referencia_g ?? undefined,
        descricaoCelula: d.descricao_celula ?? undefined,
        capacidadeMaxGramas: d.capacidade_max_g ?? undefined,
        gravidade: d.gravidade ?? undefined,
        atualizadaEm: d.atualizada_em ?? undefined,
      };
    }
  } catch { /* sem REST — segue para a cópia local */ }
  return lerLocal();
}

/**
 * PUT /calibracao + cópia local. A cópia local é gravada SEMPRE (o wizard não
 * pode depender da rede); devolve false quando o REST não confirmou.
 */
export async function salvarCalibracao(c: CalibracaoSalva): Promise<boolean> {
  gravarLocal(c);
  const chave = chaveApi();
  try {
    const res = await fetch(`http://${enderecoApi()}:3000/calibracao`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(chave ? { 'x-chave-api': chave } : {}) },
      body: JSON.stringify({
        massa_referencia_g: c.massaReferenciaG ?? null,
        descricao_celula: c.descricaoCelula ?? null,
        capacidade_max_g: c.capacidadeMaxGramas ?? null,
        gravidade: c.gravidade ?? null,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Força esperada (N) para uma massa conhecida sob a gravidade local. */
export function valorEsperadoN(massaG: number, g: number): number {
  return (massaG / 1000) * g;
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

interface ConfigEsp {
  gravidade?: number;
  acuracia?: number;
  capacidadeMaxGramas?: number;
  massaCalibracaoG?: number;
  descricaoCelula?: string;
}

function extrairConfig(configEsp: unknown): ConfigEsp {
  if (!configEsp || typeof configEsp !== 'object' || Array.isArray(configEsp)) return {};
  const o = configEsp as Record<string, unknown>;
  const desc = o['descricaoCelula'];
  return {
    gravidade: num(o['gravidade']),
    acuracia: num(o['acuracia']),
    capacidadeMaxGramas: num(o['capacidadeMaxGramas']),
    massaCalibracaoG: num(o['massaCalibracaoG']),
    descricaoCelula: typeof desc === 'string' ? desc : undefined,
  };
}

/**
 * Dados da célula para o relatório, resolvidos nesta ordem:
 * 1. massa/descrição/capacidade das colunas da sessão (o que foi gravado);
 * 2. config_esp da sessão: massa/descrição (seguem a célula) e
 *    gravidade/acurácia/capacidade como segunda fonte;
 * 3. [extra] só preenche o que ficou vazio — usar apenas no modo "nova"
 *    (gravação ainda não salva), nunca ao exportar uma sessão salva.
 * Nunca lança: config ausente ou inválido simplesmente não contribui.
 */
export function montarDadosCalibracao(
  configEsp: unknown,
  sessao?: { massaCalibracaoG?: number | null; descricaoCelula?: string | null; capacidadeCelulaG?: number | null },
  extra?: Partial<CalibracaoSalva> & Partial<DadosCelula> | null,
): DadosCalibracao {
  const cfg = extrairConfig(configEsp);
  const d: DadosCalibracao = {};

  if (sessao?.massaCalibracaoG != null) d.massaCalibracaoG = num(sessao.massaCalibracaoG);
  if (sessao?.descricaoCelula) d.descricaoCelula = sessao.descricaoCelula;
  if (sessao?.capacidadeCelulaG != null) d.capacidadeMaxGramas = num(sessao.capacidadeCelulaG);
  d.massaCalibracaoG ??= cfg.massaCalibracaoG;
  if (!d.descricaoCelula && cfg.descricaoCelula) d.descricaoCelula = cfg.descricaoCelula;
  d.capacidadeMaxGramas ??= cfg.capacidadeMaxGramas;
  d.gravidade = cfg.gravidade;
  d.acuracia = cfg.acuracia;

  if (extra) {
    if (d.massaCalibracaoG == null) d.massaCalibracaoG = num(extra.massaReferenciaG);
    if (!d.descricaoCelula) d.descricaoCelula = extra.descricaoCelula || undefined;
    if (d.capacidadeMaxGramas == null) d.capacidadeMaxGramas = num(extra.capacidadeMaxGramas);
    if (d.gravidade == null) d.gravidade = num(extra.gravidade);
    if (d.acuracia == null) d.acuracia = num(extra.acuracia);
  }
  return d;
}
