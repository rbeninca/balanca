// CRC16-CCITT — polinômio 0x1021, seed 0xFFFF
// Idêntico ao algoritmo do firmware ESP32 (crc16_ccitt em main.cpp)

const TABELA_CRC16 = (() => {
  const t = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i << 8;
    for (let b = 0; b < 8; b++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
    }
    t[i] = crc & 0xffff;
  }
  return t;
})();

/**
 * Calcula CRC16-CCITT sobre o buffer fornecido.
 * Buffer vazio retorna 0xFFFF (valor do seed inicial).
 */
export function calcularCRC16(buf: Uint8Array): number {
  let crc = 0xffff;
  for (const byte of buf) {
    crc = ((crc << 8) ^ (TABELA_CRC16[((crc >> 8) ^ byte) & 0xff] ?? 0)) & 0xffff;
  }
  return crc;
}
