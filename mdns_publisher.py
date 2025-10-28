#!/usr/bin/env python3
"""
Simple mDNS publisher for Balança GFIG
Registers gfig.local HTTP service
"""

import os
import sys
import socket
from zeroconf import ServiceInfo, Zeroconf

def get_local_ip():
    """Get the local IP address"""
    try:
        # Connect to a non-routable address to determine local IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def publish_mdns_service():
    """Publish the Balança GFIG service via mDNS"""
    
    # Get local IP
    ip_address = get_local_ip()
    port = 80
    hostname = "gfig"
    service_name = "Balança GFIG"
    
    print(f"[mDNS] Local IP: {ip_address}")
    print(f"[mDNS] Publishing {service_name} as {hostname}.local")
    
    # Create service info
    service_info = ServiceInfo(
        "_http._tcp.local.",
        f"{service_name}._http._tcp.local.",
        addresses=[socket.inet_aton(ip_address)],
        port=port,
        properties={
            "path": "/",
            "version": "1.0"
        },
        server=f"{hostname}.local.",
        ttl=4500
    )
    
    # Create Zeroconf instance and register service
    zeroconf = Zeroconf()
    zeroconf.register_service(service_info)
    
    print(f"[mDNS] Service published successfully")
    print(f"[mDNS] Access at: http://{hostname}.local")
    
    # Keep running
    try:
        while True:
            pass
    except KeyboardInterrupt:
        print("[mDNS] Unregistering service...")
        zeroconf.unregister_service(service_info)
        zeroconf.close()
        sys.exit(0)

if __name__ == "__main__":
    publish_mdns_service()
