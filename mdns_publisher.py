#!/usr/bin/env python3
"""
Simple mDNS publisher for Balança GFIG
Registers gfig.local HTTP service
"""

import os
import sys
import socket
import time
import logging
from zeroconf import ServiceInfo, Zeroconf

# Configure logging to see all messages
logging.basicConfig(
    level=logging.INFO,
    format='[mDNS] %(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def get_local_ip():
    """Get the local IP address"""
    try:
        # Connect to a non-routable address to determine local IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ip = s.getsockname()[0]
        s.close()
        logger.info(f"Local IP detected: {ip}")
        return ip
    except Exception as e:
        logger.error(f"Error detecting IP: {e}, using 127.0.0.1")
        return "127.0.0.1"

def publish_mdns_service():
    """Publish the Balança GFIG service via mDNS"""
    
    # Get local IP
    ip_address = get_local_ip()
    port = 80
    hostname = "gfig"
    service_name = "Balança GFIG"
    
    logger.info(f"Initializing mDNS publisher...")
    logger.info(f"Service: {service_name}")
    logger.info(f"Hostname: {hostname}.local")
    logger.info(f"IP Address: {ip_address}")
    logger.info(f"Port: {port}")
    
    try:
        # Create service info
        service_info = ServiceInfo(
            "_http._tcp.local.",
            f"{service_name}._http._tcp.local.",
            addresses=[socket.inet_aton(ip_address)],
            port=port,
            properties={
                "path": "/",
                "version": "1.0",
                "description": "Balanca GFIG - Force Measurement System"
            },
            server=f"{hostname}.local.",
            ttl=4500
        )
        
        # Create Zeroconf instance and register service
        zeroconf = Zeroconf()
        zeroconf.register_service(service_info)
        
        logger.info(f"✅ Service published successfully!")
        logger.info(f"Access at: http://{hostname}.local or http://{ip_address}")
        logger.info(f"mDNS is running and broadcasting...")
        
        # Keep running
        try:
            while True:
                time.sleep(60)
                # Re-announce periodically
                logger.debug(f"Periodic announcement: {hostname}.local -> {ip_address}")
        except KeyboardInterrupt:
            logger.info("Shutting down mDNS publisher...")
            zeroconf.unregister_service(service_info)
            zeroconf.close()
            logger.info("mDNS publisher stopped")
            sys.exit(0)
            
    except Exception as e:
        logger.error(f"Error publishing service: {e}")
        sys.exit(1)

if __name__ == "__main__":
    publish_mdns_service()
