#!/usr/bin/env python3
"""
Script de Teste Simples - Leitura Direta da Serial
Uso: python3 test_serial.py
"""

import serial
import serial.tools.list_ports
import time
import sys

SERIAL_BAUD = 230400
SERIAL_PORT = '/dev/ttyUSB0'

def find_serial_port():
    """Encontra a porta serial automaticamente."""
    print("\n🔍 Procurando portas seriais...")
    
    ports = list(serial.tools.list_ports.comports())
    
    if not ports:
        print("❌ Nenhuma porta serial encontrada!")
        return None
    
    print(f"\n📋 Portas disponíveis ({len(ports)}):")
    for i, port in enumerate(ports, 1):
        print(f"   {i}. {port.device}")
        print(f"      └─ {port.description}")
    
    # Tenta usar a porta padrão primeiro
    if SERIAL_PORT in [p.device for p in ports]:
        print(f"\n✅ Porta padrão encontrada: {SERIAL_PORT}")
        return SERIAL_PORT
    
    # Procura portas USB
    usb_ports = [p for p in ports if 'USB' in p.device or 'ttyACM' in p.device]
    if usb_ports:
        port = usb_ports[0].device
        print(f"\n✅ Porta USB encontrada: {port}")
        return port
    
    # Usa a primeira porta disponível
    port = ports[0].device
    print(f"\n⚠️ Usando primeira porta disponível: {port}")
    return port

def test_serial_connection():
    """Testa a conexão serial e mostra os dados recebidos."""
    
    print("=" * 70)
    print("🧪 TESTE DE CONEXÃO SERIAL")
    print("=" * 70)
    
    port = find_serial_port()
    
    if not port:
        print("\n❌ Não foi possível encontrar uma porta serial!")
        print("   Verifique se o ESP8266 está conectado via USB.")
        return False
    
    try:
        print(f"\n🔌 Conectando a {port} @ {SERIAL_BAUD} baud...")
        ser = serial.Serial(port, SERIAL_BAUD, timeout=2.0)
        
        # Aguarda ESP inicializar
        print("⏳ Aguardando ESP inicializar (3s)...")
        time.sleep(3)
        
        # Limpa buffer de inicialização
        ser.reset_input_buffer()
        print("✅ Conectado! Buffer limpo.\n")
        
        print("=" * 70)
        print("📡 DADOS RECEBIDOS (Ctrl+C para parar):")
        print("=" * 70)
        print()
        
        message_count = 0
        empty_reads = 0
        json_count = 0
        non_json_count = 0
        
        while True:
            try:
                # Lê uma linha
                line_bytes = ser.readline()
                
                if line_bytes:
                    empty_reads = 0
                    
                    # Decodifica
                    try:
                        line = line_bytes.decode('utf-8', errors='ignore').strip()
                    except:
                        print("⚠️ Erro de decodificação")
                        continue
                    
                    if line:
                        message_count += 1
                        
                        # Verifica se é JSON
                        is_json = line.startswith('[') or line.startswith('{')
                        
                        if is_json:
                            json_count += 1
                            icon = "📊"
                        else:
                            non_json_count += 1
                            icon = "💬"
                        
                        # Mostra a mensagem (truncada se muito grande)
                        if len(line) > 120:
                            display_line = line[:120] + "..."
                        else:
                            display_line = line
                        
                        print(f"{icon} [{message_count:4d}] {display_line}")
                        
                        # Mostra estatísticas a cada 10 mensagens
                        if message_count % 10 == 0:
                            print(f"\n📊 Estatísticas: {json_count} JSON, {non_json_count} não-JSON\n")
                
                else:
                    empty_reads += 1
                    if empty_reads % 50 == 0:
                        print(f"💤 {empty_reads} leituras vazias... (ainda conectado)")
                    time.sleep(0.01)
            
            except KeyboardInterrupt:
                print("\n\n" + "=" * 70)
                print("👋 Teste interrompido pelo usuário")
                print("=" * 70)
                print(f"\n📊 ESTATÍSTICAS FINAIS:")
                print(f"   📨 Total de mensagens: {message_count}")
                print(f"   📊 Mensagens JSON: {json_count}")
                print(f"   💬 Mensagens não-JSON: {non_json_count}")
                print(f"   💤 Leituras vazias: {empty_reads}")
                print()
                break
        
        ser.close()
        print("✅ Conexão serial fechada.\n")
        return True
        
    except serial.SerialException as e:
        print(f"\n❌ ERRO ao conectar na porta serial: {e}")
        print("\n💡 Dicas:")
        print("   1. Verifique se o ESP8266 está conectado")
        print("   2. Verifique se a porta está correta")
        print("   3. Verifique as permissões: sudo usermod -a -G dialout $USER")
        print("   4. Reconecte o cabo USB")
        return False
    
    except Exception as e:
        print(f"\n❌ ERRO inesperado: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("\n")
    success = test_serial_connection()
    
    if success:
        print("✅ Teste concluído com sucesso!")
        print("\n📋 PRÓXIMOS PASSOS:")
        print("   1. Se você viu mensagens JSON, o ESP está funcionando!")
        print("   2. Execute o server.py para testar o gateway completo")
        print("   3. Abra o navegador e teste a interface web")
    else:
        print("❌ Teste falhou!")
        print("\n📋 SOLUÇÃO DE PROBLEMAS:")
        print("   1. Verifique a conexão física do ESP8266")
        print("   2. Verifique se o firmware foi carregado corretamente")
        print("   3. Tente outro cabo USB")
        print("   4. Verifique as permissões da porta serial")
    
    sys.exit(0 if success else 1)