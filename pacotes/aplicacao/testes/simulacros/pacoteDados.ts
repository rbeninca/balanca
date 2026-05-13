import { calcularCRC16 } from '@balancagfig/protocolo';

// Cria um pacote DADOS binário válido para testes (20 bytes)
export function criarPacoteDadosValido(forca: number = 2.5, t: number = 1000): ArrayBuffer {
  const buf = new ArrayBuffer(20);
  const dv  = new DataView(buf);
  dv.setUint16(0, 0xa1b2, true);   // magic
  dv.setUint8(2, 0x02);            // versão
  dv.setUint8(3, 0x01);            // tipo DADOS
  dv.setUint32(4, t, true);        // marcaTemporal
  dv.setFloat32(8, forca, true);   // forcaNewtons
  dv.setInt32(12, 12345, true);    // forcaBruta
  dv.setUint8(16, 0);              // statusFirmware
  dv.setUint8(17, 0);              // reserved
  const crc = calcularCRC16(new Uint8Array(buf, 0, 18));
  dv.setUint16(18, crc, true);
  return buf;
}

// Cria um buffer com CRC incorreto
export function criarPacoteDadosInvalido(): ArrayBuffer {
  const buf = criarPacoteDadosValido().slice(0);
  const dv  = new DataView(buf);
  dv.setUint16(18, 0xdead, true);  // CRC errado
  return buf;
}
