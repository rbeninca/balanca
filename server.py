import asyncio
import websockets
import serial
import serial.tools.list_ports
import threading
import http.server
import socket
import socketserver
import os
import json
import logging
import struct
import time
from typing import Optional, Dict, Any
import pymysql.cursors
from datetime import datetime

"""
Binary Protocol Server - Balança GFIG (IPv4 + IPv6)
- Supports multiple binary packet types
- Converts binary → JSON for WebSocket clients
- Converts JSON commands → binary for ESP32
- HTTP and WebSocket servers listen on IPv6 (::) with dual-stack when available
"""

# ================== Config ==================
SERIAL_BAUD = int(os.environ.get("SERIAL_BAUD", "921600"))
SERIAL_PORT = os.environ.get("SERIAL_PORT", "/dev/ttyUSB0")
HTTP_PORT   = int(os.environ.get("HTTP_PORT", "80"))
WS_PORT     = int(os.environ.get("WS_PORT", "81"))
BIND_HOST   = os.environ.get("BIND_HOST", "0.0.0.0")
V6ONLY_ENV  = os.environ.get("IPV6_V6ONLY", "0")

# MySQL Config
MYSQL_HOST = os.environ.get("MYSQL_HOST", "db")
MYSQL_USER = os.environ.get("MYSQL_USER", "balanca_user")
MYSQL_PASSWORD = os.environ.get("MYSQL_PASSWORD", "balanca_password")
MYSQL_DB = os.environ.get("MYSQL_DB", "balanca_gfig")
MYSQL_ROOT_PASSWORD = os.environ.get("MYSQL_ROOT_PASSWORD", "Hilquias")

# Binary Protocol Constants
MAGIC = 0xA1B2
VERSION = 0x01

# Packet Types
TYPE_DATA        = 0x01
TYPE_CONFIG      = 0x02
TYPE_STATUS      = 0x03
CMD_TARA         = 0x10
CMD_CALIBRATE    = 0x11
CMD_GET_CONFIG   = 0x12
CMD_SET_PARAM    = 0x13

# Packet sizes
SIZE_DATA       = 16
SIZE_CONFIG     = 64
SIZE_STATUS     = 14
SIZE_CMD_TARA   = 8
SIZE_CMD_CALIB  = 10
SIZE_CMD_GETCONF = 8
SIZE_CMD_SETPAR = 18

logging.basicConfig(level=logging.INFO, format='[%(levelname)s] %(message)s')
logging.info(f"Configuração de BIND_HOST: {BIND_HOST}")
logging.info(f"Configuração de IPV6_V6ONLY: {V6ONLY_ENV}")
logging.info(f"MySQL DB: {MYSQL_DB}")
logging.info(f"MYSQL_DB from env: {os.environ.get('MYSQL_DB')}")

CONNECTED_CLIENTS = set()
serial_connection: Optional[serial.Serial] = None
serial_lock = threading.Lock()
mysql_connection = None
mysql_connected = False

# ================== MySQL Utils ==================
def connect_to_mysql():
    global mysql_connection, mysql_connected
    if mysql_connection and mysql_connection.open:
        return mysql_connection

    try:
        mysql_connection = pymysql.connect(
            host=MYSQL_HOST,
            user=MYSQL_USER,
            password=MYSQL_PASSWORD,
            database=MYSQL_DB,
            cursorclass=pymysql.cursors.DictCursor,
            connect_timeout=5
        )
        logging.info("Conectado ao MySQL com sucesso!")
        mysql_connected = True
        return mysql_connection
    except pymysql.Error as e:
        logging.error(f"Erro ao conectar ao MySQL: {e}")
        mysql_connected = False
        return None

def init_mysql_db():
    global mysql_connection, mysql_connected
    # Connect as root to create the database and grant privileges
    try:
        root_conn = pymysql.connect(
            host=MYSQL_HOST, user="root", password=MYSQL_ROOT_PASSWORD,
            cursorclass=pymysql.cursors.DictCursor, connect_timeout=5
        )
        with root_conn.cursor() as cursor:
            cursor.execute(f"CREATE DATABASE IF NOT EXISTS `{MYSQL_DB}`")
            cursor.execute(f"GRANT ALL PRIVILEGES ON `{MYSQL_DB}`.* TO '{MYSQL_USER}'@'%'")
            cursor.execute("FLUSH PRIVILEGES")
        root_conn.close()
        logging.info(f"Database '{MYSQL_DB}' created/verified and privileges granted.")
    except pymysql.Error as e:
        logging.error(f"Não foi possível criar o banco de dados '{MYSQL_DB}' ou conceder privilégios: {e}")
        mysql_connected = False
        return

    # Now connect as balanca_user to the specific database to create tables
    mysql_connection = connect_to_mysql()

    if mysql_connection:
        try:
            with mysql_connection.cursor() as cursor:
                sql_sessoes_create = """
                CREATE TABLE IF NOT EXISTS sessoes (
                    id BIGINT PRIMARY KEY,
                    nome VARCHAR(255) NOT NULL,
                    data_inicio DATETIME NOT NULL,
                    data_fim DATETIME,
                    motor_name VARCHAR(255),
                    motor_diameter FLOAT,
                    motor_length FLOAT,
                    motor_delay FLOAT,
                    motor_propweight FLOAT,
                    motor_totalweight FLOAT,
                    motor_manufacturer VARCHAR(255)
                )
                """
                cursor.execute(sql_sessoes_create)

                # Migrate existing table to add motor metadata columns if they don't exist
                motor_columns = [
                    ('motor_name', 'VARCHAR(255)'),
                    ('motor_diameter', 'FLOAT'),
                    ('motor_length', 'FLOAT'),
                    ('motor_delay', 'FLOAT'),
                    ('motor_propweight', 'FLOAT'),
                    ('motor_totalweight', 'FLOAT'),
                    ('motor_manufacturer', 'VARCHAR(255)')
                ]

                for column_name, column_type in motor_columns:
                    try:
                        cursor.execute(f"ALTER TABLE sessoes ADD COLUMN {column_name} {column_type}")
                        logging.info(f"Coluna '{column_name}' adicionada à tabela 'sessoes'")
                    except pymysql.Error as e:
                        # Column already exists (error 1060), ignore
                        if e.args[0] != 1060:
                            logging.warning(f"Erro ao adicionar coluna '{column_name}': {e}")

                sql_leituras_create = """
                CREATE TABLE IF NOT EXISTS leituras (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    sessao_id BIGINT NOT NULL,
                    tempo FLOAT,
                    forca FLOAT,
                    ema FLOAT,
                    massaKg FLOAT,
                    timestamp DATETIME(3),
                    FOREIGN KEY (sessao_id) REFERENCES sessoes(id) ON DELETE CASCADE
                )
                """
                cursor.execute(sql_leituras_create)

            mysql_connection.commit()
            logging.info(f"Banco de dados '{MYSQL_DB}' e tabelas 'sessoes', 'leituras' verificadas/criadas.")
        except pymysql.Error as e:
            logging.error(f"Erro ao inicializar o banco de dados MySQL: {e}")
            mysql_connected = False
    else:
        logging.warning("Não foi possível inicializar o banco de dados MySQL: conexão não estabelecida.")

async def save_session_to_mysql_db(session_data: Dict[str, Any]):
    global mysql_connection, mysql_connected
    if not mysql_connected or not mysql_connection or not mysql_connection.open:
        logging.warning("Tentando salvar sessão no MySQL, mas a conexão não está ativa. Tentando reconectar...")
        mysql_connection = connect_to_mysql()
        if not mysql_connection or not mysql_connected:
            logging.error("Não foi possível reconectar ao MySQL. Sessão não salva.")
            return False

    try:
        # Validate required fields
        if 'id' not in session_data:
            logging.error("session_data não contém o campo 'id'")
            return False
        if 'nome' not in session_data:
            logging.error("session_data não contém o campo 'nome'")
            return False
        if 'timestamp' not in session_data:
            logging.error("session_data não contém o campo 'timestamp'")
            return False

        logging.info(f"Salvando sessão '{session_data['nome']}' (ID: {session_data['id']}) no MySQL...")

        with mysql_connection.cursor() as cursor:
            dados_tabela = session_data.get('dadosTabela', [])

            # Parse data_inicio
            try:
                data_inicio = datetime.fromisoformat(session_data['timestamp'].replace('Z', '+00:00'))
            except (ValueError, KeyError) as e:
                logging.error(f"Erro ao converter timestamp '{session_data.get('timestamp')}': {e}")
                return False

            data_fim = None
            if dados_tabela:
                try:
                    # Timestamp format from frontend: '27/10/2025 15:13:06.334'
                    data_fim = datetime.strptime(dados_tabela[-1]['timestamp'], '%d/%m/%Y %H:%M:%S.%f')
                except (ValueError, IndexError, KeyError) as e:
                    logging.warning(f"Erro ao converter data_fim, usando data_inicio: {e}")
                    data_fim = data_inicio

            # Extract motor metadata
            metadados = session_data.get('metadadosMotor', {})
            motor_name = metadados.get('name')
            motor_diameter = metadados.get('diameter')
            motor_length = metadados.get('length')
            motor_delay = metadados.get('delay')
            motor_propweight = metadados.get('propweight')
            motor_totalweight = metadados.get('totalweight')
            motor_manufacturer = metadados.get('manufacturer')

            logging.info(f"Metadados do motor: name={motor_name}, diameter={motor_diameter}, length={motor_length}, "
                        f"delay={motor_delay}, propweight={motor_propweight}, totalweight={motor_totalweight}, "
                        f"manufacturer={motor_manufacturer}")

            sql_sessoes = """
            INSERT INTO sessoes (id, nome, data_inicio, data_fim, motor_name, motor_diameter,
                                motor_length, motor_delay, motor_propweight, motor_totalweight, motor_manufacturer)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                nome = VALUES(nome),
                data_inicio = VALUES(data_inicio),
                data_fim = VALUES(data_fim),
                motor_name = VALUES(motor_name),
                motor_diameter = VALUES(motor_diameter),
                motor_length = VALUES(motor_length),
                motor_delay = VALUES(motor_delay),
                motor_propweight = VALUES(motor_propweight),
                motor_totalweight = VALUES(motor_totalweight),
                motor_manufacturer = VALUES(motor_manufacturer)
            """
            cursor.execute(sql_sessoes, (session_data['id'], session_data['nome'], data_inicio, data_fim,
                                        motor_name, motor_diameter, motor_length, motor_delay,
                                        motor_propweight, motor_totalweight, motor_manufacturer))

            cursor.execute("DELETE FROM leituras WHERE sessao_id = %s", (session_data['id'],))

            if dados_tabela:
                sql_leituras = "INSERT INTO leituras (sessao_id, tempo, forca, massaKg, timestamp) VALUES (%s, %s, %s, %s, %s)"
                leituras_to_insert = []
                for i, leitura in enumerate(dados_tabela):
                    try:
                        leitura_timestamp = datetime.strptime(leitura['timestamp'], '%d/%m/%Y %H:%M:%S.%f')
                    except (ValueError, KeyError) as e:
                        logging.warning(f"Erro ao converter timestamp da leitura {i}: {e}")
                        leitura_timestamp = None

                    try:
                        leituras_to_insert.append((
                            session_data['id'],
                            float(leitura.get('tempo_esp', 0)),
                            float(leitura.get('newtons', 0)),
                            float(leitura.get('quilo_forca', 0)),
                            leitura_timestamp
                        ))
                    except (ValueError, KeyError) as e:
                        logging.warning(f"Erro ao processar leitura {i}: {e}, pulando...")
                        continue

                if leituras_to_insert:
                    cursor.executemany(sql_leituras, leituras_to_insert)
                    logging.info(f"Inseridas {len(leituras_to_insert)} leituras para sessão {session_data['id']}")

        mysql_connection.commit()
        logging.info(f"Sessão '{session_data['nome']}' (ID: {session_data['id']}) salva/atualizada no MySQL.")
        return True
    except pymysql.Error as e:
        logging.error(f"Erro de MySQL ao salvar sessão: {type(e).__name__}: {e}")
        if mysql_connection:
            try:
                mysql_connection.rollback()
            except:
                pass
        return False
    except Exception as e:
        logging.error(f"Erro inesperado ao salvar sessão no MySQL: {type(e).__name__}: {e}", exc_info=True)
        if mysql_connection:
            try:
                mysql_connection.rollback()
            except:
                pass
        return False

# ================== HTTP Server & API ==================
class APIRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory='/app/data', **kwargs)

    def do_GET(self):
        if self.path == '/api/sessoes':
            self.handle_get_sessoes()
        elif self.path.startswith('/api/sessoes/') and self.path.endswith('/leituras'):
            self.handle_get_leituras()
        elif self.path.startswith('/api/sessoes/'):
            self.handle_get_sessao_by_id()
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == '/api/sessoes':
            self.handle_post_sessao()
        else:
            self.send_error(404, "Not Found")

    def do_DELETE(self):
        if self.path.startswith('/api/sessoes/'):
            self.handle_delete_sessao()
        else:
            self.send_error(404, "Not Found")

    def handle_get_sessoes(self):
        if not mysql_connected:
            self.send_error(503, "MySQL Service Unavailable")
            return
        try:
            with mysql_connection.cursor() as cursor:
                cursor.execute("""
                    SELECT id, nome, data_inicio, data_fim, 
                           motor_name, motor_diameter, motor_length, motor_delay,
                           motor_propweight, motor_totalweight, motor_manufacturer 
                    FROM sessoes ORDER BY data_inicio DESC
                """)
                sessoes = cursor.fetchall()
                # Transform motor fields into metadadosMotor object
                for sessao in sessoes:
                    sessao['metadadosMotor'] = {
                        'name': sessao.pop('motor_name', None),
                        'diameter': sessao.pop('motor_diameter', None),
                        'length': sessao.pop('motor_length', None),
                        'delay': sessao.pop('motor_delay', None),
                        'propweight': sessao.pop('motor_propweight', None),
                        'totalweight': sessao.pop('motor_totalweight', None),
                        'manufacturer': sessao.pop('motor_manufacturer', None)
                    }
                self.send_json_response(200, sessoes)
        except pymysql.Error as e:
            logging.error(f"API Error (get_sessoes): {e}")
            self.send_error(500, "Internal Server Error")

    def handle_get_leituras(self):
        try:
            sessao_id = int(self.path.split('/')[-2])
        except (ValueError, IndexError):
            self.send_error(400, "Invalid Session ID")
            return
        
        if not mysql_connected:
            self.send_error(503, "MySQL Service Unavailable")
            return
        try:
            with mysql_connection.cursor() as cursor:
                cursor.execute("SELECT tempo, forca, ema, massaKg, timestamp FROM leituras WHERE sessao_id = %s ORDER BY tempo ASC", (sessao_id,))
                leituras = cursor.fetchall()
                self.send_json_response(200, leituras)
        except pymysql.Error as e:
            logging.error(f"API Error (get_leituras): {e}")
            self.send_error(500, "Internal Server Error")

    def handle_get_sessao_by_id(self):
        try:
            sessao_id = int(self.path.split('/')[-1])
        except (ValueError, IndexError):
            self.send_error(400, "Invalid Session ID")
            return

        if not mysql_connected:
            self.send_error(503, "MySQL Service Unavailable")
            return
        try:
            with mysql_connection.cursor() as cursor:
                    cursor.execute("""
                        SELECT id, nome, data_inicio, data_fim,
                               motor_name, motor_diameter, motor_length, motor_delay,
                               motor_propweight, motor_totalweight, motor_manufacturer 
                        FROM sessoes WHERE id = %s
                    """, (sessao_id,))
                    sessao = cursor.fetchone()
                    if sessao:
                        # Transform motor fields into metadadosMotor object
                        sessao['metadadosMotor'] = {
                            'name': sessao.pop('motor_name', None),
                            'diameter': sessao.pop('motor_diameter', None),
                            'length': sessao.pop('motor_length', None),
                            'delay': sessao.pop('motor_delay', None),
                            'propweight': sessao.pop('motor_propweight', None),
                            'totalweight': sessao.pop('motor_totalweight', None),
                            'manufacturer': sessao.pop('motor_manufacturer', None)
                        }
                        self.send_json_response(200, sessao)
                    else:
                        self.send_error(404, "Session Not Found")
        except pymysql.Error as e:
            logging.error(f"API Error (get_sessao_by_id): {e}")
            self.send_error(500, "Internal Server Error")

    def handle_post_sessao(self):
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            session_data = json.loads(post_data)
        except (json.JSONDecodeError, TypeError, KeyError):
            self.send_error(400, "Invalid JSON")
            return

        # We need to run the async save function in the main event loop
        # This is a bit tricky from a synchronous handler in a different thread
        # A simpler approach for now is to call it directly if it can be made synchronous,
        # or use a thread-safe call to the loop.
        # For this implementation, let's assume we can create a new loop to run the async task.
        # This is not ideal but works for this isolated case.
        
        # asyncio.run() cannot be called from a running event loop.
        # Since the http server runs in its own thread, we can get/create a loop for this thread.
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:  # 'RuntimeError: There is no current event loop...'
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

        success = loop.run_until_complete(save_session_to_mysql_db(session_data))

        if success:
            self.send_json_response(201, {"message": "Session created/updated successfully"})
        else:
            self.send_error(500, "Failed to save session to database")

    def handle_delete_sessao(self):
        try:
            sessao_id = int(self.path.split('/')[-1])
        except (ValueError, IndexError):
            self.send_error(400, "Invalid Session ID")
            return

        if not mysql_connected:
            self.send_error(503, "MySQL Service Unavailable")
            return
        try:
            with mysql_connection.cursor() as cursor:
                result = cursor.execute("DELETE FROM sessoes WHERE id = %s", (sessao_id,))
                mysql_connection.commit()
                if result > 0:
                    self.send_json_response(200, {"message": f"Sessão {sessao_id} deletada."})
                else:
                    self.send_error(404, "Session Not Found")
        except pymysql.Error as e:
            logging.error(f"API Error (delete_sessao): {e}")
            self.send_error(500, "Internal Server Error")

    def send_json_response(self, status_code, data):
        self.send_response(status_code)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data, default=str).encode('utf-8'))

class DualStackTCPServer(socketserver.TCPServer):
    address_family = socket.AF_INET # Force IPv4
    allow_reuse_address = True

def start_http_server():
    try:
        server_address = (BIND_HOST, HTTP_PORT)
        
        httpd = DualStackTCPServer(server_address, APIRequestHandler)
        
        t = threading.Thread(target=httpd.serve_forever, daemon=True)
        t.start()
        logging.info(f"Servidor HTTP/API iniciado em {BIND_HOST}:{HTTP_PORT}")
        return httpd
    except OSError as e:
        logging.error(f"Falha ao iniciar servidor HTTP: {e}", exc_info=True)
        return None

# ================== WebSocket ==================
async def ws_handler(websocket):
    CONNECTED_CLIENTS.add(websocket)
    try:
        # Send initial status on connect
        await websocket.send(json.dumps({"mysql_connected": mysql_connected}))
        
        async for message in websocket:
            try:
                cmd = json.loads(message)
                cmd_type = cmd.get("cmd")

                if cmd_type == "save_session_to_mysql":
                    session_data = cmd.get("payload")
                    if session_data:
                        success = await save_session_to_mysql_db(session_data)
                        response_type = "mysql_save_success" if success else "mysql_save_error"
                        await websocket.send(json.dumps({
                            "type": response_type,
                            "message": session_data.get("nome"),
                            "sessionId": session_data.get("id")
                        }))
                else:
                    binary_packet = json_to_binary_command(cmd)
                    if binary_packet:
                        with serial_lock:
                            if serial_connection and serial_connection.is_open:
                                serial_connection.write(binary_packet)
                                serial_connection.flush()
                    else:
                        logging.warning(f"Comando WS desconhecido: {cmd_type}")

            except json.JSONDecodeError:
                logging.error(f"Mensagem WS inválida: {message}")
            except Exception as e:
                logging.error(f"Erro ao processar comando WS: {e}", exc_info=True)
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        CONNECTED_CLIENTS.remove(websocket)

async def ws_server_main():
    try:
        async with websockets.serve(ws_handler, BIND_HOST, WS_PORT, max_size=None):
            logging.info(f"WebSocket ativo em {BIND_HOST}:{WS_PORT}")
            await asyncio.Future()
    except OSError as e:
        logging.error(f"Falha ao iniciar WebSocket: {e}", exc_info=True)

async def broadcast_json(obj: Dict[str, Any]):
    if not CONNECTED_CLIENTS:
        return
    obj["mysql_connected"] = mysql_connected
    data = json.dumps(obj, separators=(",", ":"))
    await asyncio.gather(*[ws.send(data) for ws in list(CONNECTED_CLIENTS)], return_exceptions=True)

# ================== Binary Protocol & Serial ==================
def crc16_ccitt(data: bytes) -> int:
    crc = 0xFFFF
    for b in data:
        crc ^= b << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) if crc & 0x8000 else (crc << 1)
    return crc & 0xFFFF

def parse_data_packet(data: bytes) -> Optional[Dict[str, Any]]:
    if len(data) != SIZE_DATA: return None
    try:
        magic, ver, pkt_type, t_ms, forca_N, status, crc_rx = struct.unpack("<HBBIfBxH", data)
        if magic != MAGIC or ver != VERSION or pkt_type != TYPE_DATA: return None
        if crc16_ccitt(data[:-2]) != crc_rx:
            logging.warning("CRC mismatch in DATA packet")
            return None
        return {"type": "data", "tempo": t_ms / 1000.0, "forca": float(forca_N), "status": status}
    except struct.error: return None

def parse_config_packet(data: bytes) -> Optional[Dict[str, Any]]:
    if len(data) != SIZE_CONFIG: return None
    try:
        magic, ver, pkt_type = struct.unpack_from("<HBB", data, 0)
        if magic != MAGIC or ver != VERSION or pkt_type != TYPE_CONFIG: return None
        if crc16_ccitt(data[:-2]) != struct.unpack_from("<H", data, SIZE_CONFIG - 2)[0]:
            logging.warning("CRC mismatch in CONFIG packet")
            return None
        fields = struct.unpack_from("<ffHfHHBBHiffB23x", data, 4)
        return {
            "type": "config", "conversionFactor": fields[0], "gravity": fields[1],
            "leiturasEstaveis": fields[2], "toleranciaEstabilidade": fields[3],
            "numAmostrasMedia": fields[4], "numAmostrasCalibracao": fields[5],
            "usarMediaMovel": fields[6], "usarEMA": fields[7], "timeoutCalibracao": fields[8],
            "tareOffset": fields[9], "capacidadeMaximaGramas": fields[10],
            "percentualAcuracia": fields[11], "mode": fields[12]
        }
    except struct.error: return None

def parse_status_packet(data: bytes) -> Optional[Dict[str, Any]]:
    if len(data) != SIZE_STATUS: return None
    try:
        magic, ver, pkt_type, status_type, code, value, timestamp, crc_rx = struct.unpack("<HBBBBHIH", data)
        if magic != MAGIC or ver != VERSION or pkt_type != TYPE_STATUS: return None
        if crc16_ccitt(data[:-2]) != crc_rx:
            logging.warning("CRC mismatch in STATUS packet")
            return None
        type_map = {0: "info", 1: "success", 2: "warning", 3: "error"}
        messages = {0x10: "Tara concluída", 0x11: "Calibração concluída", 0x12: "Calibração falhou"}
        return {
            "type": "status", "status": type_map.get(status_type, "info"),
            "message": messages.get(code, f"Status code: {code:02X}"),
            "code": code, "value": value, "timestamp": timestamp / 1000.0
        }
    except struct.error: return None

def json_to_binary_command(cmd: Dict[str, Any]) -> Optional[bytes]:
    cmd_type = cmd.get("cmd", "").lower()
    pkt_type, fmt, values = None, None, None

    if cmd_type in ("t", "tara"):
        pkt_type, fmt, values = CMD_TARA, "<HBBH", (MAGIC, VERSION, CMD_TARA, 0)
    elif cmd_type in ("c", "calibrate"):
        massa_g = float(cmd.get("massa_g", 0))
        if massa_g > 0:
            pkt_type, fmt, values = CMD_CALIBRATE, "<HBBf", (MAGIC, VERSION, CMD_CALIBRATE, massa_g)
    elif cmd_type == "get_config":
        pkt_type, fmt, values = CMD_GET_CONFIG, "<HBBH", (MAGIC, VERSION, CMD_GET_CONFIG, 0)
    elif cmd_type in ("set", "set_param"):
        param_map = {"gravity": (0x01, "f"), "conversionFactor": (0x02, "f"), "leiturasEstaveis": (0x03, "I")}
        param_name = cmd.get("param", "")
        if param_name in param_map:
            param_id, value_type = param_map[param_name]
            value = cmd.get("value", 0)
            value_f = float(value) if value_type == "f" else 0.0
            value_i = int(value) if value_type != "f" else 0
            pkt_type, fmt, values = CMD_SET_PARAM, "<HBBB3xfI", (MAGIC, VERSION, CMD_SET_PARAM, param_id, value_f, value_i)

    if pkt_type and fmt and values:
        data = struct.pack(fmt, *values)
        crc = crc16_ccitt(data)
        return data + struct.pack("<H", crc)
    return None

def find_serial_port() -> Optional[str]:
    if os.path.exists(SERIAL_PORT): return SERIAL_PORT
    ports = [p.device for p in serial.tools.list_ports.comports() if "USB" in p.device or "ACM" in p.device]
    return ports[0] if ports else None

def serial_reader(loop: asyncio.AbstractEventLoop):
    global serial_connection
    while True:
        port = find_serial_port()
        if not port:
            time.sleep(3)
            continue
        try:
            serial_connection = serial.Serial(port, SERIAL_BAUD, timeout=1.0)
            buf = bytearray()
            while True:
                chunk = serial_connection.read(256)
                if not chunk: continue
                buf.extend(chunk)
                while len(buf) >= 8:
                    magic_idx = buf.find(b'')
                    if magic_idx == -1:
                        buf = buf[-1:]
                        break
                    if magic_idx > 0:
                        try:
                            logging.info(f"Dados não-binários: {buf[:magic_idx].decode().strip()}")
                        except UnicodeDecodeError:
                            pass
                        del buf[:magic_idx]
                    
                    if len(buf) < 4: break
                    pkt_type = buf[3]
                    size_map = {TYPE_DATA: SIZE_DATA, TYPE_CONFIG: SIZE_CONFIG, TYPE_STATUS: SIZE_STATUS}
                    expected_size = size_map.get(pkt_type)
                    if not expected_size or len(buf) < expected_size: break

                    packet = bytes(buf[:expected_size])
                    del buf[:expected_size]

                    parsers = {TYPE_DATA: parse_data_packet, TYPE_CONFIG: parse_config_packet, TYPE_STATUS: parse_status_packet}
                    if pkt_type in parsers and (json_obj := parsers[pkt_type](packet)):
                        asyncio.run_coroutine_threadsafe(broadcast_json(json_obj), loop)
        except Exception as e:
            logging.error(f"Erro de leitura serial: {e}")
        finally:
            if serial_connection: serial_connection.close()
            serial_connection = None
            time.sleep(1)

# ================== Main ==================
async def main():
    httpd = None
    try:
        init_mysql_db()
        httpd = start_http_server()
        loop = asyncio.get_running_loop()
        threading.Thread(target=serial_reader, args=(loop,), daemon=True).start()
        await ws_server_main()
    except OSError as e:
        if e.errno == 98: logging.error("Porta já em uso.")
        else: raise
    finally:
        if httpd: httpd.shutdown()
        if mysql_connection and mysql_connection.open:
            mysql_connection.close()
            logging.info("Conexão MySQL fechada.")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logging.info("Encerrado pelo usuário")
