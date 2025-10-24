import asyncio
import websockets
import serial
import serial.tools.list_ports
import threading
import http.server
import socketserver
import os
import json
import logging
import functools
import time

# --- Configurações ---
              
SERIAL_BAUD = 921600 
SERIAL_PORT = '/dev/ttyUSB0'
WS_PORT = 81
HTTP_PORT = 80
WEB_DIRECTORY = './data/'
# ---------------------

# Configuração do Logging
logging.basicConfig(level=logging.INFO, format='[%(levelname)s] (%(threadName)-10s) %(message)s')

# Gerenciamento de conexões
CONNECTED_CLIENTS = set()
serial_connection = None

def find_serial_port():
    """Tenta encontrar a porta serial automaticamente, se SERIAL_PORT falhar."""
    global SERIAL_PORT
    if os.path.exists(SERIAL_PORT):
        return SERIAL_PORT

    logging.warning(f"Porta {SERIAL_PORT} não encontrada. Procurando automaticamente...")
    ports = [p for p in serial.tools.list_ports.comports() if 'USB' in p.device or 'ttyACM' in p.device]
    if ports:
        port_name = ports[0].device
        logging.debug(f"Porta encontrada: {port_name}")
        SERIAL_PORT = port_name
        return port_name
    else:
        logging.error("Nenhum dispositivo serial USB encontrado.")
        return None

async def broadcast(message):
    """Envia uma mensagem para todos os clientes WebSocket conectados."""
    if CONNECTED_CLIENTS:
        clients_to_send = list(CONNECTED_CLIENTS)
        tasks = [client.send(message) for client in clients_to_send]
        await asyncio.gather(*tasks, return_exceptions=True)

async def register(websocket):
    """Registra um novo cliente WebSocket."""
    logging.info(f"Cliente conectado: {websocket.remote_address}")
    CONNECTED_CLIENTS.add(websocket)

async def unregister(websocket):
    """Remove um cliente WebSocket."""
    logging.info(f"Cliente desconectado: {websocket.remote_address}")
    CONNECTED_CLIENTS.remove(websocket)

async def websocket_handler(websocket, path=None):
    """Lida com conexões WebSocket (recebe comandos do Worker)."""
    await register(websocket)
    try:
        async for message in websocket:
            logging.info(f"Recebido do WS: {message}")
            if serial_connection and serial_connection.is_open:
                try:
                    serial_connection.write(f"{message}\n".encode('utf-8'))
                except serial.SerialException as e:
                    logging.error(f"Erro ao escrever na serial: {e}")
            else:
                logging.warning("Comando recebido, mas a serial não está conectada.")
    except websockets.exceptions.ConnectionClosedError:
        pass
    finally:
        await unregister(websocket)

def serial_reader_thread(loop):
    """Lê dados da porta serial e os envia para o WebSocket."""
    global serial_connection
    
    # Buffer para acumular dados parciais
    line_buffer = ""
    
    while True:
        if serial_connection is None or not serial_connection.is_open:
            port_name = find_serial_port()
            if port_name:
                try:
                    logging.info(f"Conectando à serial {port_name} a {SERIAL_BAUD} baud...")
                    serial_connection = serial.Serial(
                        port_name, 
                        SERIAL_BAUD, 
                        timeout=1.0,
                        write_timeout=1.0
                    ) 
                    logging.info("Conectado à serial.")
                except serial.SerialException as e:
                    logging.error(f"Falha ao conectar na serial: {e}")
                    serial_connection = None
                    time.sleep(3)
                    continue
            else:
                 time.sleep(3)
                 continue
        
        try:
            # Lê dados disponíveis (pode ser parcial)
            if serial_connection.in_waiting > 0:
                chunk = serial_connection.read(serial_connection.in_waiting).decode('utf-8', errors='ignore')
                line_buffer += chunk
                
                # Processa linhas completas (terminadas em \n)
                while '\n' in line_buffer:
                    line, line_buffer = line_buffer.split('\n', 1)
                    line = line.strip()
                    
                    if not line:
                        continue
                    
                    # Log da linha recebida
                    logging.info(f"Recebido da Serial: {line}")
                    
                    # Verifica se parece JSON
                    if line.startswith('{') or line.startswith('['):
                        # Tenta processar como JSON único primeiro
                        try:
                            json.loads(line)
                            asyncio.run_coroutine_threadsafe(broadcast(line), loop)
                        except json.JSONDecodeError:
                            # Pode ser múltiplos JSONs concatenados
                            # Separa por }{ ou ][
                            line_split = line.replace('}{', '}|{').replace('][', ']|[')
                            parts = line_split.split('|')
                            
                            valid_count = 0
                            for part in parts:
                                part = part.strip()
                                if part and (part.startswith('{') or part.startswith('[')):
                                    try:
                                        json.loads(part)
                                        asyncio.run_coroutine_threadsafe(broadcast(part), loop)
                                        valid_count += 1
                                    except json.JSONDecodeError as e:
                                        logging.warning(f"JSON inválido ignorado: {part[:100]}... Erro: {e}")
                            
                            if valid_count > 0:
                                logging.info(f"Processados {valid_count} JSONs concatenados")
                            else:
                                logging.warning(f"Nenhum JSON válido encontrado em: {line[:100]}...")
                    else:
                        # Não é JSON, apenas loga se for significativo
                        if len(line) > 5:
                            logging.warning(f"Dado serial ignorado (não JSON): {line[:100]}")
                
                # Limita tamanho do buffer para evitar memory leak
                if len(line_buffer) > 10000:
                    logging.warning("Buffer muito grande, limpando...")
                    line_buffer = ""
            
            else:
                # Não há dados, espera um pouco
                time.sleep(0.01)
        
        except serial.SerialException as e:
            logging.error(f"Erro de leitura serial: {e}. Reconectando...")
            if serial_connection:
                serial_connection.close()
            serial_connection = None
            line_buffer = ""  # Limpa buffer ao reconectar
        except UnicodeDecodeError:
            logging.warning("Erro de decodificação. Descartando pacote.")
            line_buffer = ""  # Limpa buffer em erro
        except Exception as e:
            logging.error(f"Erro inesperado no reader: {e}")
            line_buffer = ""  # Limpa buffer em erro

def http_server_thread():
    """Inicia um servidor HTTP simples para servir os arquivos estáticos."""
    try:
        Handler = functools.partial(
            http.server.SimpleHTTPRequestHandler,
            directory=WEB_DIRECTORY
        )
        
        with socketserver.TCPServer(("", HTTP_PORT), Handler) as httpd:
            logging.info(f"Servidor HTTP iniciado em http://localhost:{HTTP_PORT} (servindo de {WEB_DIRECTORY})")
            httpd.serve_forever()
    except OSError as e:
        if e.errno == 98:
             logging.error(f"Erro no HTTP: A porta {HTTP_PORT} já está em uso.")
        else:
             logging.error(f"Falha ao iniciar servidor HTTP: {e}")
    except Exception as e:
        logging.error(f"Falha ao iniciar servidor HTTP: {e}")

async def main():
    """Função principal assíncrona para iniciar os serviços."""
    logging.info("Iniciando Servidor Gateway (Serial <-> WebSocket)")
    
    loop = asyncio.get_running_loop()

    # Inicia o leitor serial em uma thread separada
    threading.Thread(target=serial_reader_thread, args=(loop,), daemon=True, name="SerialThread").start()

    # Inicia o servidor HTTP em uma thread separada
    threading.Thread(target=http_server_thread, daemon=True, name="HTTPThread").start()

    # Inicia o servidor WebSocket
    logging.info(f"Iniciando Servidor WebSocket na porta {WS_PORT}")
    
    ws_server = await websockets.serve(
        websocket_handler, 
        "0.0.0.0", 
        WS_PORT, 
        subprotocols=None 
    )
    
    try:
        await asyncio.Future()
    finally:
        ws_server.close()
        await ws_server.wait_closed()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logging.info("Servidor desligado pelo usuário.")
    except Exception as e:
        logging.error(f"Erro crítico no loop principal: {e}")