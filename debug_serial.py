
import serial
import time
import os

SERIAL_PORT = os.environ.get("SERIAL_PORT", "/dev/ttyUSB0")
SERIAL_BAUD = int(os.environ.get("SERIAL_BAUD", "921600"))

print(f"Listening to {SERIAL_PORT} at {SERIAL_BAUD} baud...")

try:
    ser = serial.Serial(SERIAL_PORT, SERIAL_BAUD, timeout=1)
    print("Serial port opened successfully.")
    
    start_time = time.time()
    while time.time() - start_time < 20: # Run for 20 seconds
        try:
            chunk = ser.read(128) # Read up to 128 bytes at a time
            if chunk:
                hex_str = ' '.join(f'{b:02X}' for b in chunk)
                print(f"[{time.time():.2f}] RX ({len(chunk)} bytes): {hex_str}")
        except Exception as e:
            print(f"An error occurred: {e}")
            break

except serial.SerialException as e:
    print(f"Error opening or reading from serial port: {e}")
finally:
    if 'ser' in locals() and ser.is_open:
        ser.close()
        print("Serial port closed.")
