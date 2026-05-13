import { calcularCRC16 } from './crc16.js';
import {
  MAGIC, VERSAO_PROTO,
  TIPO_DADOS, TIPO_CONFIGURACAO, TIPO_STATUS,
  CMD_TARAR, CMD_CALIBRAR, CMD_OBTER_CONFIG, CMD_DEFINIR_PARAM,
  type PacoteESP32, type ComandoHost,
  type PacoteDados, type PacoteConfiguracao, type PacoteStatus,
  type ComandoTarar, type ComandoCalibar, type ComandoObterConfig, type ComandoDefinirParam,
} from './tipos.js';

// Tamanhos fixos dos pacotes (bytes)
const TAM_DADOS    = 20;
const TAM_CONFIG   = 64;
const TAM_STATUS   = 14;
const TAM_CMD_TARA  = 8;
const TAM_CMD_CALIB = 10;
const TAM_CMD_GET   = 8;
const TAM_CMD_SET   = 18;

function view(size: number): [DataView, Uint8Array] {
  const buf = new ArrayBuffer(size);
  return [new DataView(buf), new Uint8Array(buf)];
}

function assinarCRC(bytes: Uint8Array): void {
  const crc = calcularCRC16(bytes.subarray(0, bytes.length - 2));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  view.setUint16(bytes.length - 2, crc, true); // little-endian
}

function verificarCRC(bytes: Uint8Array): void {
  const crcRecebido = new DataView(bytes.buffer, bytes.byteOffset).getUint16(bytes.length - 2, true);
  const crcCalculado = calcularCRC16(bytes.subarray(0, bytes.length - 2));
  if (crcCalculado !== crcRecebido) {
    throw new Error(`CRC inválido: recebido=0x${crcRecebido.toString(16)} calculado=0x${crcCalculado.toString(16)}`);
  }
}

// ─── Codificadores (objeto → bytes) ─────────────────────────────────────────

function codificarComandoTarar(_cmd: ComandoTarar): Uint8Array {
  const [dv, bytes] = view(TAM_CMD_TARA);
  dv.setUint16(0, MAGIC, true);
  dv.setUint8(2, VERSAO_PROTO);
  dv.setUint8(3, CMD_TARAR);
  dv.setUint16(4, 0, true);
  assinarCRC(bytes);
  return bytes;
}

function codificarComandoCalibar(cmd: ComandoCalibar): Uint8Array {
  const [dv, bytes] = view(TAM_CMD_CALIB);
  dv.setUint16(0, MAGIC, true);
  dv.setUint8(2, VERSAO_PROTO);
  dv.setUint8(3, CMD_CALIBRAR);
  dv.setFloat32(4, cmd.massaG, true);
  assinarCRC(bytes);
  return bytes;
}

function codificarComandoObterConfig(_cmd: ComandoObterConfig): Uint8Array {
  const [dv, bytes] = view(TAM_CMD_GET);
  dv.setUint16(0, MAGIC, true);
  dv.setUint8(2, VERSAO_PROTO);
  dv.setUint8(3, CMD_OBTER_CONFIG);
  dv.setUint16(4, 0, true);
  assinarCRC(bytes);
  return bytes;
}

function codificarComandoDefinirParam(cmd: ComandoDefinirParam): Uint8Array {
  const [dv, bytes] = view(TAM_CMD_SET);
  dv.setUint16(0, MAGIC, true);
  dv.setUint8(2, VERSAO_PROTO);
  dv.setUint8(3, CMD_DEFINIR_PARAM);
  dv.setUint8(4, cmd.paramId);
  // bytes 5,6,7 = reserved (zero)
  dv.setFloat32(8, cmd.valorF, true);
  dv.setUint32(12, cmd.valorI >>> 0, true);
  assinarCRC(bytes);
  return bytes;
}

/**
 * Codifica um ComandoHost em bytes prontos para enviar ao ESP32.
 */
export function codificarComando(cmd: ComandoHost): Uint8Array {
  switch (cmd.tipo) {
    case 'CMD_TARAR':         return codificarComandoTarar(cmd);
    case 'CMD_CALIBRAR':      return codificarComandoCalibar(cmd);
    case 'CMD_OBTER_CONFIG':  return codificarComandoObterConfig(cmd);
    case 'CMD_DEFINIR_PARAM': return codificarComandoDefinirParam(cmd);
  }
}

// ─── Decodificadores (bytes → objeto) ───────────────────────────────────────

function decodificarDados(bytes: Uint8Array): PacoteDados {
  verificarCRC(bytes);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    tipo:           'DADOS',
    marcaTemporal:  dv.getUint32(4, true),
    forcaNewtons:   dv.getFloat32(8, true),
    forcaBruta:     dv.getInt32(12, true),
    statusFirmware: dv.getUint8(16),
  };
}

function decodificarConfiguracao(bytes: Uint8Array): PacoteConfiguracao {
  verificarCRC(bytes);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 4;
  const fatorConversao      = dv.getFloat32(off, true); off += 4;
  const gravidade           = dv.getFloat32(off, true); off += 4;
  const leiturasEstaveis    = dv.getUint16(off, true);  off += 2;
  const toleranciaEst       = dv.getFloat32(off, true); off += 4;
  const numAmostrasMedia    = dv.getUint16(off, true);  off += 2;
  const numAmostrasCal      = dv.getUint16(off, true);  off += 2;
  const usarMediaMovel      = dv.getUint8(off) !== 0;   off += 1;
  const usarEMA             = dv.getUint8(off) !== 0;   off += 1;
  const timeoutCal          = dv.getUint16(off, true);  off += 2;
  const offsetTara          = dv.getInt32(off, true);   off += 4;
  const capacidadeMaxGramas = dv.getFloat32(off, true); off += 4;
  const acuracia            = dv.getFloat32(off, true); off += 4;
  const modo                = dv.getUint8(off);

  return {
    tipo: 'CONFIGURACAO',
    fatorConversao, gravidade, leiturasEstaveis, toleranciaEst,
    numAmostrasMedia, numAmostrasCal, usarMediaMovel, usarEMA,
    timeoutCal, offsetTara, capacidadeMaxGramas, acuracia, modo,
  };
}

function decodificarStatus(bytes: Uint8Array): PacoteStatus {
  verificarCRC(bytes);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    tipo:          'STATUS',
    tipoStatus:    dv.getUint8(4),
    codigo:        dv.getUint8(5),
    valor:         dv.getUint16(6, true),
    marcaTemporal: dv.getUint32(8, true),
  };
}

/**
 * Decodifica um buffer bruto (do ESP32) em um PacoteESP32 tipado.
 * Lança Error se o buffer for inválido, truncado ou com CRC errado.
 */
export function decodificar(bytes: Uint8Array): PacoteESP32 {
  if (bytes.length < 4) {
    throw new Error('Buffer muito curto');
  }

  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = dv.getUint16(0, true);
  if (magic !== MAGIC) {
    throw new Error(`Magic inválido: 0x${magic.toString(16)}`);
  }

  const tipo = dv.getUint8(3);

  const tamEsperado: Record<number, number> = {
    [TIPO_DADOS]:        TAM_DADOS,
    [TIPO_CONFIGURACAO]: TAM_CONFIG,
    [TIPO_STATUS]:       TAM_STATUS,
  };

  const tam = tamEsperado[tipo];
  if (tam === undefined) {
    throw new Error(`Tipo desconhecido: 0x${tipo.toString(16)}`);
  }
  if (bytes.length < tam) {
    throw new Error(`Buffer muito curto para tipo 0x${tipo.toString(16)}: esperado ${tam}, recebido ${bytes.length}`);
  }

  const pacoteBytes = bytes.subarray(0, tam);

  switch (tipo) {
    case TIPO_DADOS:        return decodificarDados(pacoteBytes);
    case TIPO_CONFIGURACAO: return decodificarConfiguracao(pacoteBytes);
    case TIPO_STATUS:       return decodificarStatus(pacoteBytes);
    default:
      throw new Error(`Tipo desconhecido: 0x${tipo.toString(16)}`);
  }
}

export { calcularCRC16 } from './crc16.js';
export * from './tipos.js';
