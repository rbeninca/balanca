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
import struct
import time
from typing import Optional

"""
Revised server:
- Reads BINARY frames from Serial using packet format <HBBIfH> (16 bytes)
- Validates CRC16-CCITT (0xFFFF, poly 0x1021) on bytes 0..13
- Broadcasts **JSON text** over WebSocket to preserve compatibility with existing apps
- Gracefully handles legacy JSON lines from Serial (auto-converts to normalized JSON)
- Optional static HTTP server to serve a test page if desired

Env vars:
  SERIAL_PORT=/dev/ttyUSB0 (or COM3)
  SERIAL_BAUD=921600
  HTTP_PORT=8080
  WS_PORT=8765
"""

# ================== Config ==================
SERIAL_BAUD = int(os.environ.get("SERIAL_BAUD", "921600"))
SERIAL_PORT = os.environ.get("SERIAL_PORT", "/dev/ttyUSB0")
HTTP_PORT   = int(os.environ.get("HTTP_PORT", "8080"))
WS_PORT     = int(os.environ.get("WS_PORT", "81"))

# Packet (little-endian) <HBBIfH>
PKT_FMT  = "<HBBIfH"  # magic, ver, status, t_ms, forca_N, crc16
PKT_SIZE = struct.calcsize(PKT_FMT)  # 16
MAGIC    = 0xA1B2

logging.basicConfig(level=logging.INFO, format='[%(levelname)s] %(message)s')

CONNECTED_CLIENTS = set()
serial_connection: Optional[serial.Serial] = None
serial_lock = threading.Lock()  # Lock para acesso thread-safe à serial

# ================== HTTP estático (opcional) ==================
class SilentHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        return

def start_http_server():
    httpd = socketserver.TCPServer(("", HTTP_PORT), SilentHandler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    logging.info(f"HTTP estático em :{HTTP_PORT}")
    return httpd

# ================== WebSocket ==================
async def ws_handler(websocket):
    CONNECTED_CLIENTS.add(websocket)
    try:
        async for message in websocket:
            # Recebe comando do cliente e envia para Serial como JSON
            try:
                cmd = json.loads(message)
                with serial_lock:
                    if serial_connection and serial_connection.is_open:
                        json_str = json.dumps(cmd, separators=(",", ":"))
                        serial_connection.write((json_str + "\n").encode('utf-8'))
                        serial_connection.flush()
                        logging.info(f"Comando enviado para Serial: {json_str}")
                    else:
                        logging.warning("Serial não disponível para enviar comando")
            except json.JSONDecodeError:
                logging.error(f"Mensagem WS inválida: {message}")
            except Exception as e:
                logging.error(f"Erro ao enviar para Serial: {e}")
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        CONNECTED_CLIENTS.remove(websocket)

async def ws_server_main():
    async with websockets.serve(ws_handler, "", WS_PORT, max_size=None):
        logging.info(f"WebSocket em :{WS_PORT}")
        await asyncio.Future()  # run forever

async def broadcast_json(obj: dict):
    if not CONNECTED_CLIENTS:
        return
    data = json.dumps(obj, separators=(",", ":"))
    await asyncio.gather(*[ws.send(data) for ws in list(CONNECTED_CLIENTS)], return_exceptions=True)

# ================== Utils ==================
def find_serial_port() -> Optional[str]:
    global SERIAL_PORT
    # If explicitly provided and exists (POSIX), use it
    if os.name != "nt" and os.path.exists(SERIAL_PORT):
        return SERIAL_PORT
    # On Windows, accept COMx without existence check here
    if os.name == "nt" and SERIAL_PORT.upper().startswith("COM"):
        return SERIAL_PORT
    # Auto-discover
    ports = list(serial.tools.list_ports.comports())
    for p in ports:
        if any(k in p.device for k in ("USB", "ACM", "COM")):
            SERIAL_PORT = p.device
            return SERIAL_PORT
    return None

def crc16_ccitt(data: bytes) -> int:
    crc = 0xFFFF
    for b in data:
        crc ^= b << 8
        for _ in range(8):
            if crc & 0x8000:
                crc = ((crc << 1) ^ 0x1021) & 0xFFFF
            else:
                crc = (crc << 1) & 0xFFFF
    return crc

# ================== Serial Reader Thread ==================
def serial_reader(loop: asyncio.AbstractEventLoop):
    """Reads from serial, extracts binary packets or legacy JSON lines.
       Emits normalized JSON over WS (through the asyncio loop)."""
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

                # Try to parse as many items as possible
                while True:
                    # Check what comes first: JSON or binary packet
                    json_start = buf.find(b'{')
                    magic_start = buf.find(struct.pack("<H", MAGIC))
                    
                    # Decide priority: JSON before MAGIC, or MAGIC if no JSON
                    process_json_first = (json_start >= 0 and 
                                         (magic_start < 0 or json_start < magic_start))
                    
                    # 1) Process JSON if it comes first
                    if process_json_first:
                        # look for newline after the '{'
                        nl = buf.find(b'\n', json_start)
                        if nl == -1:
                            # If we have a '{' but no newline yet, check if buffer is too full
                            if len(buf) > 1024:
                                # Discard data before '{' to make room
                                del buf[:json_start]
                            break  # need more bytes
                        
                        # Extract JSON line
                        line = bytes(buf[json_start:nl]).decode('utf-8', errors='ignore')
                        del buf[:nl+1]
                        
                        try:
                            obj = json.loads(line)
                            # Encaminhar qualquer JSON válido para os clientes
                            asyncio.run_coroutine_threadsafe(broadcast_json(obj), loop)
                            msg_type = obj.get("type", "unknown")
                            logging.info(f"JSON recebido: type={msg_type}")
                            continue
                        except Exception as e:
                            logging.warning(f"JSON inválido: {e}")
                            logging.warning(f"Linha problemática: {line[:200]}")
                            continue
                    
                    # 2) Try to find a binary packet by MAGIC
                    if len(buf) >= PKT_SIZE and magic_start >= 0:
                        idx = magic_start
                        if len(buf) - idx >= PKT_SIZE:
                            pkt = bytes(buf[idx:idx+PKT_SIZE])
                            # tentative unpack
                            try:
                                magic, ver, status, t_ms, forca_N, crc_rx = struct.unpack(PKT_FMT, pkt)
                            except struct.error:
                                # not a proper packet, drop the magic bytes and continue
                                del buf[:idx+2]
                                continue

                            if magic == MAGIC and ver == 1:
                                crc_calc = crc16_ccitt(pkt[:-2])
                                if crc_calc == crc_rx:
                                    # Valid packet: consume and broadcast JSON
                                    del buf[:idx+PKT_SIZE]
                                    out = {
                                        "type": "data",
                                        "tempo": t_ms / 1000.0,
                                        "forca": float(forca_N),
                                        "status": int(status)
                                    }
                                    asyncio.run_coroutine_threadsafe(broadcast_json(out), loop)
                                    # Continue inner loop to look for more packets
                                    continue
                                else:
                                    # Bad CRC: drop magic and move on
                                    del buf[:idx+2]
                                    continue
                            else:
                                # Wrong ver/magic, skip this occurrence
                                del buf[:idx+2]
                                continue
                        else:
                            # Found magic but not enough bytes yet
                            break

                    # 3) If neither packet nor JSON line was parsed, trim buffer to avoid growth
                    #    but keep a small tail to catch partial headers.
                    if len(buf) > 4 * PKT_SIZE:
                        # Keep last 3*PKT_SIZE bytes as safety window
                        del buf[:-3*PKT_SIZE]
                    break  # need more bytes
        except Exception as e:
            logging.error(f"Erro de leitura serial: {e}")
        finally:
            try:
                serial_connection.close()
            except Exception:
                pass
            serial_connection = None
            time.sleep(1)

# ================== Main ==================
async def main():
    httpd = start_http_server()
    loop = asyncio.get_running_loop()
    t = threading.Thread(target=serial_reader, args=(loop,), daemon=True)
    t.start()
    try:
        await ws_server_main()
    finally:
        try:
            httpd.shutdown()
        except Exception:
            pass

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logging.info("Encerrado pelo usuário")