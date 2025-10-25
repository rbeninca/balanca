#!/usr/bin/env python3
"""
Script de teste para verificar o formato do pacote CONFIG
Execute este script no servidor para debug do protocolo binário
"""

import struct

def crc16_ccitt(data: bytes) -> int:
    """Calculate CRC16-CCITT"""
    crc = 0xFFFF
    for b in data:
        crc ^= b << 8
        for _ in range(8):
            if crc & 0x8000:
                crc = ((crc << 1) ^ 0x1021) & 0xFFFF
            else:
                crc = (crc << 1) & 0xFFFF
    return crc

def create_test_config_packet():
    """Cria um pacote CONFIG de teste igual ao que o ESP32 enviaria"""
    
    # Header (4 bytes)
    magic = 0xA1B2
    ver = 0x01
    pkt_type = 0x02
    
    # Config data (56 bytes)
    conversionFactor = 21000.0
    gravity = 9.80665
    leiturasEstaveis = 10
    toleranciaEstabilidade = 100
    numAmostrasMedia = 3
    numAmostrasCalibracao = 10000
    usarMediaMovel = 1
    usarEMA = 0
    timeoutCalibracao = 20  # segundos
    tareOffset = 0
    capacidadeMaximaGramas = 5000
    percentualAcuracia = 0.05
    mode = 0
    
    # Pack config data (56 bytes)
    config_data = struct.pack(
        "<ffHIHHBBHiIfB21x",  # 21x = 21 bytes de padding
        conversionFactor,
        gravity,
        leiturasEstaveis,
        toleranciaEstabilidade,
        numAmostrasMedia,
        numAmostrasCalibracao,
        usarMediaMovel,
        usarEMA,
        timeoutCalibracao,
        tareOffset,
        capacidadeMaximaGramas,
        percentualAcuracia,
        mode
    )
    
    # Pack header + config
    packet_without_crc = struct.pack("<HBB", magic, ver, pkt_type) + config_data
    
    # Calculate CRC
    crc = crc16_ccitt(packet_without_crc)
    
    # Complete packet
    packet = packet_without_crc + struct.pack("<H", crc)
    
    return packet

def parse_config_packet(data: bytes):
    """Parse CONFIG packet - versão de teste com debug"""
    
    print(f"📦 Tamanho do pacote: {len(data)} bytes")
    print(f"📦 Primeiros 20 bytes: {' '.join(f'{b:02X}' for b in data[:20])}")
    print(f"📦 Últimos 4 bytes: {' '.join(f'{b:02X}' for b in data[-4:])}")
    
    if len(data) != 64:
        print(f"❌ ERRO: Tamanho esperado 64 bytes, recebido {len(data)}")
        return None
    
    # Unpack header
    magic, ver, pkt_type = struct.unpack_from("<HBB", data, 0)
    print(f"📋 Header: magic=0x{magic:04X}, ver={ver}, type=0x{pkt_type:02X}")
    
    if magic != 0xA1B2:
        print(f"❌ ERRO: Magic incorreto")
        return None
    if ver != 0x01:
        print(f"❌ ERRO: Versão incorreta")
        return None
    if pkt_type != 0x02:
        print(f"❌ ERRO: Tipo incorreto")
        return None
    
    # Verify CRC
    crc_rx = struct.unpack_from("<H", data, 62)[0]
    crc_calc = crc16_ccitt(data[:-2])
    
    print(f"🔐 CRC: calculado=0x{crc_calc:04X}, recebido=0x{crc_rx:04X}")
    
    if crc_calc != crc_rx:
        print(f"❌ ERRO: CRC mismatch!")
        return None
    
    print(f"✅ CRC válido!")
    
    # Unpack config fields
    fmt = "<ffHIHHBBHiIfB21x"
    fields = struct.unpack_from(fmt, data, 4)
    
    config = {
        "conversionFactor": fields[0],
        "gravity": fields[1],
        "leiturasEstaveis": fields[2],
        "toleranciaEstabilidade": fields[3],
        "numAmostrasMedia": fields[4],
        "numAmostrasCalibracao": fields[5],
        "usarMediaMovel": fields[6],
        "usarEMA": fields[7],
        "timeoutCalibracao": fields[8],
        "tareOffset": fields[9],
        "capacidadeMaximaGramas": fields[10],
        "percentualAcuracia": fields[11],
        "mode": fields[12]
    }
    
    print(f"✅ Config parseado com sucesso!")
    for key, value in config.items():
        print(f"   {key}: {value}")
    
    return config

def main():
    print("=" * 60)
    print("🧪 TESTE DO PROTOCOLO BINÁRIO - CONFIG PACKET")
    print("=" * 60)
    print()
    
    # Criar pacote de teste
    print("1️⃣ Criando pacote de teste...")
    packet = create_test_config_packet()
    print(f"✅ Pacote criado: {len(packet)} bytes")
    print()
    
    # Testar parsing
    print("2️⃣ Testando parsing do pacote...")
    config = parse_config_packet(packet)
    print()
    
    if config:
        print("=" * 60)
        print("✅ TESTE PASSOU! Formato do pacote está correto.")
        print("=" * 60)
    else:
        print("=" * 60)
        print("❌ TESTE FALHOU! Há um problema no formato.")
        print("=" * 60)
    
    # Informações adicionais
    print()
    print("📝 INFORMAÇÕES DO FORMATO:")
    print("   Formato struct: <ffHIHHBBHiIfB21x")
    print("   Header: <HBB (4 bytes)")
    print("   Config: 56 bytes")
    print("   CRC: <H (2 bytes)")
    print("   Total: 64 bytes")
    print()
    
    # Hexdump do pacote
    print("🔍 HEXDUMP DO PACOTE:")
    for i in range(0, len(packet), 16):
        hex_str = ' '.join(f'{b:02X}' for b in packet[i:i+16])
        ascii_str = ''.join(chr(b) if 32 <= b < 127 else '.' for b in packet[i:i+16])
        print(f"   {i:04X}: {hex_str:<48} {ascii_str}")

if __name__ == "__main__":
    main()