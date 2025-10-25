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
# Optional overrides
BIND_HOST   = os.environ.get("BIND_HOST", "::")  # "::" for IPv6 (dual-stack when available); use "0.0.0.0" for IPv4-only
V6ONLY_ENV  = os.environ.get("IPV6_V6ONLY", "0") # "0" tries dual-stack, "1" forces IPv6-only

# Binary Protocol Constants
MAGIC = 0xA1B2
VERSION = 0x01

# Packet Types
TYPE_DATA        = 0x01  # Força reading (ESP→Host)
TYPE_CONFIG      = 0x02  # Configuration (ESP→Host)
TYPE_STATUS      = 0x03  # Status/Info/Error (ESP→Host)
CMD_TARA         = 0x10  # Tara command (Host→ESP)
CMD_CALIBRATE    = 0x11  # Calibration command (Host→ESP)
CMD_GET_CONFIG   = 0x12  # Request config (Host→ESP)
CMD_SET_PARAM    = 0x13  # Set parameter (Host→ESP)

# Packet sizes
SIZE_DATA       = 16
SIZE_CONFIG     = 64
SIZE_STATUS     = 14
SIZE_CMD_TARA   = 8
SIZE_CMD_CALIB  = 10
SIZE_CMD_GETCONF = 8
SIZE_CMD_SETPAR = 18

logging.basicConfig(level=logging.INFO, format='[%(levelname)s] %(message)s')

CONNECTED_CLIENTS = set()
serial_connection: Optional[serial.Serial] = None
serial_lock = threading.Lock()

# ================== HTTP Server ==================
class SilentHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        return

class DualStackTCPServer(socketserver.TCPServer):
    # Prefer IPv6; attempt dual-stack by disabling IPV6_V6ONLY when possible
    address_family = socket.AF_INET6
    allow_reuse_address = True

    def server_bind(self):
        if self.address_family == socket.AF_INET6:
            try:
                v6only = 1 if str(V6ONLY_ENV).strip() == "1" else 0
                self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, v6only)
                logging.info(f"HTTP IPv6 socket: IPV6_V6ONLY={v6only}")
            except OSError as e:
                logging.warning(f"Não foi possível ajustar IPV6_V6ONLY: {e}")
        super().server_bind()


def start_http_server():
    try:
        logging.info("Tentando iniciar o servidor HTTP (IPv6/dual-stack)...")
        httpd = DualStackTCPServer((BIND_HOST, HTTP_PORT, 0, 0), SilentHandler)
        logging.info(f"Servidor HTTP criado. Endereço: {httpd.server_address}")
        t = threading.Thread(target=httpd.serve_forever, daemon=True)
        t.start()
        logging.info(f"Servidor HTTP iniciado em background na porta {HTTP_PORT} (host={BIND_HOST})")
        return httpd
    except OSError as e:
        logging.error(f"Falha ao iniciar HTTP IPv6/dual-stack: {e}")
        # Fallback: IPv4
        try:
            logging.info("Fallback para IPv4 somente (0.0.0.0)...")
            httpd = socketserver.TCPServer(("0.0.0.0", HTTP_PORT), SilentHandler)
            t = threading.Thread(target=httpd.serve_forever, daemon=True)
            t.start()
            logging.info(f"HTTP IPv4 ativo em 0.0.0.0:{HTTP_PORT}")
            return httpd
        except Exception as e2:
            logging.error(f"Falha catastrófica ao iniciar servidor HTTP: {e2}", exc_info=True)
            return None

# ================== WebSocket ==================
async def ws_handler(websocket):
    CONNECTED_CLIENTS.add(websocket)
    try:
        async for message in websocket:
            # Recebe comando JSON do cliente e converte para binário
            try:
                cmd = json.loads(message)
                binary_packet = json_to_binary_command(cmd)

                if binary_packet:
                    with serial_lock:
                        if serial_connection and serial_connection.is_open:
                            serial_connection.write(binary_packet)
                            serial_connection.flush()
                            logging.info(f"Comando binário enviado: type={cmd.get('cmd')}")
                        else:
                            logging.warning("Serial não disponível")
                else:
                    logging.warning(f"Comando desconhecido: {cmd}")

            except json.JSONDecodeError:
                logging.error(f"Mensagem WS inválida: {message}")
            except Exception as e:
                logging.error(f"Erro ao processar comando: {e}")
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        CONNECTED_CLIENTS.remove(websocket)

async def ws_server_main():
    # Tenta abrir em IPv6/dual-stack (host "::"); se falhar, faz fallback para IPv4
    try:
        logging.info("Iniciando WebSocket em IPv6/dual-stack (::)...")
        async with websockets.serve(ws_handler, BIND_HOST, WS_PORT, max_size=None):
            logging.info(f"WebSocket ativo em {BIND_HOST}:{WS_PORT}")
            await asyncio.Future()
    except OSError as e:
        logging.error(f"Falha ao abrir WS em {BIND_HOST}:{WS_PORT}: {e}")
        logging.info("Fallback para WebSocket IPv4 (0.0.0.0)...")
        async with websockets.serve(ws_handler, "0.0.0.0", WS_PORT, max_size=None):
            logging.info(f"WebSocket IPv4 ativo em 0.0.0.0:{WS_PORT}")
            await asyncio.Future()

async def broadcast_json(obj: Dict[str, Any]):
    if not CONNECTED_CLIENTS:
        return
    data = json.dumps(obj, separators=(",", ":"))
    await asyncio.gather(*[ws.send(data) for ws in list(CONNECTED_CLIENTS)], return_exceptions=True)

# ================== Binary Protocol Utilities ==================
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


def parse_data_packet(data: bytes) -> Optional[Dict[str, Any]]:
    """Parse TYPE_DATA packet (16 bytes)"""
    if len(data) != SIZE_DATA:
        return None

    try:
        # Format: magic, ver, type, t_ms, forca_N, status, crc (padding is skipped by 'x')
        magic, ver, pkt_type, t_ms, forca_N, status, crc_rx = struct.unpack("<HBBIfBxH", data)

        if magic != MAGIC or ver != VERSION or pkt_type != TYPE_DATA:
            return None

        # Verify CRC
        crc_calc = crc16_ccitt(data[:-2])
        if crc_calc != crc_rx:
            logging.warning(f"CRC mismatch in DATA packet: calc={crc_calc:04X}, rx={crc_rx:04X}")
            return None

        return {
            "type": "data",
            "tempo": t_ms / 1000.0,
            "forca": float(forca_N),
            "status": status
        }
    except struct.error as e:
        logging.error(f"Error unpacking DATA packet: {e}")
        return None


def parse_config_packet(data: bytes) -> Optional[Dict[str, Any]]:
    """Parse TYPE_CONFIG packet (64 bytes)"""
    if len(data) != SIZE_CONFIG:
        logging.warning(f"CONFIG packet size mismatch: expected {SIZE_CONFIG}, got {len(data)}")
        return None

    try:
        # Unpack header (4 bytes)
        magic, ver, pkt_type = struct.unpack_from("<HBB", data, 0)

        if magic != MAGIC or ver != VERSION or pkt_type != TYPE_CONFIG:
            logging.warning(f"CONFIG packet header invalid: magic={magic:04X}, ver={ver}, type={pkt_type:02X}")
            return None

        # Verify CRC BEFORE unpacking (more efficient)
        crc_rx = struct.unpack_from("<H", data, SIZE_CONFIG - 2)[0]
        crc_calc = crc16_ccitt(data[:-2])

        if crc_calc != crc_rx:
            logging.warning(f"CRC mismatch in CONFIG packet: calc={crc_calc:04X}, rx={crc_rx:04X}")
            logging.warning(f"First 20 bytes: {' '.join(f'{b:02X}' for b in data[:20])}")
            # Tenta fazer o parse mesmo com CRC inválido para depuração
            try:
                fmt = "<ffHfHHBBHiffB23x"
                offset = 4
                fields = struct.unpack_from(fmt, data, offset)
                logging.warning(f"DEBUG (unpacked with error): {fields}")
            except Exception as e:
                logging.error(f"DEBUG: Falha ao desempacotar mesmo para depuração: {e}")
            return None

        # Unpack config fields (offset 4, 58 bytes total)
        fmt = "<ffHfHHBBHiffB23x"  # 23x = skip 23 reserved bytes
        offset = 4
        fields = struct.unpack_from(fmt, data, offset)

        return {
            "type": "config",
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
    except struct.error as e:
        logging.error(f"Error unpacking CONFIG: {e}")
        logging.error(f"Data length: {len(data)}")
        return None


def parse_status_packet(data: bytes) -> Optional[Dict[str, Any]]:
    """Parse TYPE_STATUS packet (12 bytes)"""
    if len(data) != SIZE_STATUS:
        return None

    try:
        magic, ver, pkt_type, status_type, code, value, timestamp, crc_rx = struct.unpack("<HBBBBHIH", data)

        if magic != MAGIC or ver != VERSION or pkt_type != TYPE_STATUS:
            return None

        crc_calc = crc16_ccitt(data[:-2])
        if crc_calc != crc_rx:
            logging.warning(f"CRC mismatch in STATUS packet")
            return None

        # Map status_type to JSON type
        type_map = {0: "info", 1: "success", 2: "warning", 3: "error"}
        msg_type = type_map.get(status_type, "info")

        # Decode message from code
        messages = {
            0x00: "Info genérica",
            0x01: "Comando recebido",
            0x10: "Tara concluída",
            0x11: "Calibração concluída",
            0x12: "Calibração falhou",
            0x20: "Configuração atualizada",
            0xF0: "Erro genérico",
            0xF1: "Buffer overflow"
        }

        message = messages.get(code, f"Status code: {code:02X}")

        return {
            "type": msg_type,
            "message": message,
            "code": code,
            "value": value,
            "timestamp": timestamp / 1000.0
        }
    except struct.error:
        return None


def json_to_binary_command(cmd: Dict[str, Any]) -> Optional[bytes]:
    """Convert JSON command to binary packet"""
    cmd_type = cmd.get("cmd", "").lower()

    # CMD_TARA (0x10)
    if cmd_type == "t" or cmd_type == "tara":
        data = struct.pack("<HBBH", MAGIC, VERSION, CMD_TARA, 0)
        crc = crc16_ccitt(data)
        return data + struct.pack("<H", crc)

    # CMD_CALIBRATE (0x11)
    elif cmd_type == "c" or cmd_type == "calibrate":
        massa_g = float(cmd.get("massa_g", 0))
        if massa_g <= 0:
            return None
        data = struct.pack("<HBBf", MAGIC, VERSION, CMD_CALIBRATE, massa_g)
        crc = crc16_ccitt(data)
        return data + struct.pack("<H", crc)

    # CMD_GET_CONFIG (0x12)
    elif cmd_type == "get_config":
        data = struct.pack("<HBBH", MAGIC, VERSION, CMD_GET_CONFIG, 0)
        crc = crc16_ccitt(data)
        return data + struct.pack("<H", crc)

    # CMD_SET_PARAM (0x13)
    elif cmd_type == "set" or cmd_type == "set_param":
        param_name = cmd.get("param", "")
        value = cmd.get("value", 0)

        # Map param names to IDs
        param_map = {
            "gravity": (0x01, "f"),
            "conversionFactor": (0x02, "f"),
            "leiturasEstaveis": (0x03, "I"),
            "toleranciaEstabilidade": (0x04, "f"),
            "mode": (0x05, "B"),
            "usarEMA": (0x06, "B"),
            "numAmostrasMedia": (0x07, "I"),
            "tareOffset": (0x08, "I"),
            "timeoutCalibracao": (0x09, "I"),
            "capacidadeMaximaGramas": (0x0A, "f"),
            "percentualAcuracia": (0x0B, "f")
        }

        if param_name not in param_map:
            logging.warning(f"Unknown parameter: {param_name}")
            return None

        param_id, value_type = param_map[param_name]

        # Pack based on type
        value_f = 0.0
        value_i = 0
        if value_type == "f":
            value_f = float(value)
        else:
            value_i = int(value)

        # Correct format for CmdSetParam struct:
        # <H:magic, B:ver, B:type, B:param_id, 3x:reserved, f:value_f, I:value_i>
        data = struct.pack("<HBBB3xfI", MAGIC, VERSION, CMD_SET_PARAM, param_id, value_f, value_i)
        crc = crc16_ccitt(data)
        return data + struct.pack("<H", crc)

    return None

# ================== Serial Port Utils ==================
def find_serial_port() -> Optional[str]:
    global SERIAL_PORT
    if os.name != "nt" and os.path.exists(SERIAL_PORT):
        return SERIAL_PORT
    if os.name == "nt" and SERIAL_PORT.upper().startswith("COM"):
        return SERIAL_PORT

    ports = list(serial.tools.list_ports.comports())
    for p in ports:
        if any(k in p.device for k in ("USB", "ACM", "COM")):
            SERIAL_PORT = p.device
            return SERIAL_PORT
    return None

# ================== Serial Reader Thread ==================
def serial_reader(loop: asyncio.AbstractEventLoop):
    """Reads binary packets from serial and broadcasts as JSON"""
    global serial_connection

    while True:
        port = find_serial_port()
        if not port:
            logging.warning("Sem porta serial. Tentando novamente em 3s...")
            time.sleep(3)
            continue

        try:
            logging.info(f"Abrindo serial {port} @ {SERIAL_BAUD}...")
            serial_connection = serial.Serial(port, SERIAL_BAUD, timeout=1.0)
        except Exception as e:
            logging.error(f"Falha ao abrir serial: {e}")
            time.sleep(3)
            continue

        buf = bytearray()

        try:
            while True:
                with serial_lock:
                    chunk = serial_connection.read(256)

                if not chunk:
                    continue

                buf.extend(chunk)
                logging.info(f"Serial buffer received: {chunk.hex()}")

                # Try to parse packets
                while len(buf) >= 8:  # Minimum packet size
                    # Find MAGIC
                    magic_idx = -1
                    for i in range(len(buf) - 1):
                        if buf[i] == (MAGIC & 0xFF) and buf[i+1] == ((MAGIC >> 8) & 0xFF):
                            magic_idx = i
                            break

                    if magic_idx == -1:
                        # No magic found, keep last byte
                        if len(buf) > 1:
                            buf = buf[-1:]
                        break

                    # Remove and LOG data before magic
                    if magic_idx > 0:
                        discarded_data = bytes(buf[:magic_idx])
                        try:
                            logging.info(f"Dados não-binários recebidos: {discarded_data.decode('utf-8').strip()}")
                        except UnicodeDecodeError:
                            logging.warning(f"Dados não-binários (não-UTF8) descartados: {discarded_data}")
                        del buf[:magic_idx]

                    # Check if we have enough bytes for header
                    if len(buf) < 4:
                        break

                    # Read packet type
                    pkt_type = buf[3]

                    # Determine packet size
                    size_map = {
                        TYPE_DATA: SIZE_DATA,
                        TYPE_CONFIG: SIZE_CONFIG,
                        TYPE_STATUS: SIZE_STATUS
                    }

                    expected_size = size_map.get(pkt_type)
                    if not expected_size:
                        # Unknown type, skip this magic
                        del buf[:2]
                        continue

                    # Wait for complete packet
                    if len(buf) < expected_size:
                        break

                    # Extract packet
                    packet = bytes(buf[:expected_size])
                    del buf[:expected_size]

                    # Parse packet
                    json_obj = None
                    if pkt_type == TYPE_DATA:
                        json_obj = parse_data_packet(packet)
                    elif pkt_type == TYPE_CONFIG:
                        json_obj = parse_config_packet(packet)
                        if json_obj:
                            logging.info("CONFIG packet recebido")
                    elif pkt_type == TYPE_STATUS:
                        json_obj = parse_status_packet(packet)

                    # Broadcast as JSON
                    if json_obj:
                        asyncio.run_coroutine_threadsafe(broadcast_json(json_obj), loop)
                    else:
                        logging.warning(f"Failed to parse packet type {pkt_type:02X}")

                # Prevent buffer overflow
                if len(buf) > 1024:
                    logging.warning("Buffer muito grande, limpando...")
                    buf = buf[-256:]

        except Exception as e:
            logging.error(f"Erro de leitura serial: {e}")
        finally:
            try:
                serial_connection.close()
            except:
                pass
            serial_connection = None
            time.sleep(1)

# ================== Main ==================
async def main():
    httpd = None
    try:
        httpd = start_http_server()
        loop = asyncio.get_running_loop()
        t = threading.Thread(target=serial_reader, args=(loop,), daemon=True)
        t.start()
        await ws_server_main()
    except OSError as e:
        if e.errno == 98:
            logging.error(f"Porta {HTTP_PORT} ou {WS_PORT} já está em uso. Encerrando.")
        else:
            raise
    finally:
        if httpd:
            httpd.shutdown()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logging.info("Encerrado pelo usuário")
