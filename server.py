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
import time # CORREÇÃO CRÍTICA: Importação do time movida para o topo

# --- Configurações ---
              
SERIAL_BAUD = 921600 
SERIAL_PORT = '/dev/ttyUSB0'
WS_PORT = 81
HTTP_PORT = 8080
WEB_DIRECTORY = './data/'
# ---------------------

# Configuração do Logging
# O nível INFO garante que os payloads da Serial sejam impressos
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
    # Ajuste para grep (Linux)
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

# A assinatura aceita path=None para compatibilidade com o ambiente Python 3.13
async def websocket_handler(websocket, path=None):
    """Lida com conexões WebSocket (recebe comandos do Worker)."""
    await register(websocket)
    try:
        async for message in websocket:
            logging.info(f"Recebido do WS: {message}")
            if serial_connection and serial_connection.is_open:
                try:
                    # O Host envia o comando JSON para o ESP via Serial
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
    """Lê dados da porta serial (em uma thread separada) e os envia para o WebSocket."""
    global serial_connection
    while True:
        if serial_connection is None or not serial_connection.is_open:
            port_name = find_serial_port()
            if port_name:
                try:
                    logging.info(f"Conectando à serial {port_name} a {SERIAL_BAUD} baud...")
                    # Timeout baixo para não travar o loop
                    serial_connection = serial.Serial(port_name, SERIAL_BAUD, timeout=0.5) 
                    logging.info("Conectado à serial.")
                except serial.SerialException as e:
                    logging.error(f"Falha ao conectar na serial: {e}")
                    serial_connection = None
                    time.sleep(3) # Usa time.sleep (síncrono)
                    continue
            else:
                 time.sleep(3) # Usa time.sleep (síncrono)
                 continue
        
        try:
            # Tenta ler UMA linha (pacote JSON) terminada em \n
            line_bytes = serial_connection.readline()
            
            if line_bytes:
                # Decodifica e limpa espaços em branco e nova linha
                line = line_bytes.decode('utf-8').strip()
                
                # Dados da Serial são impressos aqui (Log INFO)
                logging.info(f"Recebido da Serial: {line}") 
                
                if line.startswith('[') or line.startswith('{'):
                    # NOVO: Valida se é JSON completo antes de enviar
                    try:
                        # Tenta fazer parse para validar
                        json.loads(line)
                        
                        # Se passou na validação, envia
                        asyncio.run_coroutine_threadsafe(broadcast(line), loop)
                        
                        # NOVO: Pequeno delay para não sobrecarregar WebSocket
                        # Permite ~100 mensagens/segundo (mais que suficiente)
                        time.sleep(0.005)  # 5ms
                        
                    except json.JSONDecodeError as json_err:
                        # JSON incompleto ou malformado - ignora e registra
                        logging.warning(f"JSON inválido ignorado: {line[:100]}... Erro: {json_err}")
                        continue
                else:
                    # Ignora linhas vazias ou não JSON (como a mensagem de inicialização do ESP)
                    if line:
                        logging.warning(f"Dado serial ignorado (não JSON/Vazio): {line}")
            
            # Se não houver dados, espera um pouco para não esgotar a CPU
            else:
                 time.sleep(0.01) # Usa time.sleep (síncrono)

        
        except serial.SerialException as e:
            logging.error(f"Erro de leitura serial: {e}. Reconectando...")
            if serial_connection:
                serial_connection.close()
            serial_connection = None
        except UnicodeDecodeError:
            logging.warning("Erro de decodificação. Descartando pacote.")
        except Exception as e:
            logging.error(f"Erro inesperado no reader: {e}")

def http_server_thread():
    """Inicia um servidor HTTP simples para servir os arquivos estáticos."""
    try:
        # Usa functools.partial para definir o diretório raiz ANTES de iniciar o servidor
        Handler = functools.partial(
            http.server.SimpleHTTPRequestHandler,
            directory=WEB_DIRECTORY
        )
        
        with socketserver.TCPServer(("", HTTP_PORT), Handler) as httpd:
            logging.info(f"Servidor HTTP iniciado em http://localhost:{HTTP_PORT} (servindo de {WEB_DIRECTORY})")
            httpd.serve_forever()
    except OSError as e:
        if e.errno == 98: # Endereço já em uso
             logging.error(f"Erro no HTTP: A porta {HTTP_PORT} já está em uso.")
        else:
             logging.error(f"Falha ao iniciar servidor HTTP: {e}")
    except Exception as e:
        logging.error(f"Falha ao iniciar servidor HTTP: {e}")

# --- Ponto de Entrada Principal ---

async def main():
    """Função principal assíncrona para iniciar os serviços."""
    logging.info("Iniciando Servidor Gateway (Serial <-> WebSocket)")
    
    loop = asyncio.get_running_loop()

    # 2. Inicia o leitor serial em uma thread separada
    threading.Thread(target=serial_reader_thread, args=(loop,), daemon=True, name="SerialThread").start()

    # 3. Inicia o servidor HTTP em uma thread separada
    threading.Thread(target=http_server_thread, daemon=True, name="HTTPThread").start()

    # 4. Inicia o servidor WebSocket
    logging.info(f"Iniciando Servidor WebSocket na porta {WS_PORT}")
    
    # Inicia o servidor WS e o mantém rodando
    ws_server = await websockets.serve(
        websocket_handler, 
        "0.0.0.0", 
        WS_PORT, 
        subprotocols=None 
    )
    
    try:
        await asyncio.Future() # Mantém o servidor rodando indefinidamente
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