#!/bin/bash

# Script para configurar ethernet como DHCP cliente
# Remover qualquer IP fixo e usar DHCP dinâmico

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_success() {
    echo -e "${CYAN}[SUCCESS]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "Este script precisa ser executado como root"
        echo "Use: sudo $0"
        exit 1
    fi
}

# ============================================================
# Detectar interface ethernet
# ============================================================
detect_ethernet() {
    log_step "Detectando interface ethernet..."
    
    # Procurar por interface ethernet (não WiFi, não loopback)
    ETH_IFACE=$(ip -o link show | \
        awk -F': ' '$2 !~ /^(lo|wlan|wlan0-1|docker|br|veth|p2p)/ {print $2}' | \
        head -n 1)
    
    if [ -z "$ETH_IFACE" ]; then
        log_error "Nenhuma interface ethernet encontrada!"
        log_info "Interfaces encontradas:"
        ip link show | grep -E '^\d+:' | awk -F': ' '{print "  - " $2}'
        exit 1
    fi
    
    log_success "Interface ethernet detectada: $ETH_IFACE"
}

# ============================================================
# Configurar DHCP via NetworkManager
# ============================================================
configure_dhcp_nmcli() {
    log_step "Configurando DHCP via NetworkManager..."
    
    # Listar conexões disponíveis
    log_info "Conexões NetworkManager disponíveis:"
    nmcli -t -f NAME,TYPE connection show | grep -E ':802-3-ethernet'
    
    # Procurar por conexão ethernet existente
    ETH_CONNECTION=$(nmcli -t -f NAME,DEVICE connection show | grep ":$ETH_IFACE$" | cut -d':' -f1)
    
    if [ -z "$ETH_CONNECTION" ]; then
        # Se não existir, procurar por qualquer conexão ethernet
        ETH_CONNECTION=$(nmcli -t -f NAME,TYPE connection show | grep ':802-3-ethernet' | cut -d':' -f1 | head -n 1)
    fi
    
    if [ -z "$ETH_CONNECTION" ]; then
        log_warn "Nenhuma conexão ethernet encontrada, criando nova..."
        ETH_CONNECTION="Ethernet-DHCP"
        
        log_info "Criando conexão: $ETH_CONNECTION"
        nmcli connection add type ethernet \
            ifname "$ETH_IFACE" \
            con-name "$ETH_CONNECTION" \
            ipv4.method auto \
            autoconnect yes \
            autoconnect-priority 0
        
        log_success "Conexão criada"
    else
        log_info "Conexão ethernet encontrada: $ETH_CONNECTION"
        log_info "Configurando DHCP..."
        
        # Modificar para usar DHCP
        nmcli connection modify "$ETH_CONNECTION" ipv4.method auto
        nmcli connection modify "$ETH_CONNECTION" ipv4.addresses ""
        nmcli connection modify "$ETH_CONNECTION" ipv4.gateway ""
        nmcli connection modify "$ETH_CONNECTION" ipv4.dns ""
        nmcli connection modify "$ETH_CONNECTION" autoconnect yes
        nmcli connection modify "$ETH_CONNECTION" autoconnect-priority 0
        
        log_success "Conexão modificada para DHCP"
    fi
    
    # Reativar conexão
    log_info "Reativando conexão..."
    nmcli connection down "$ETH_CONNECTION" 2>/dev/null || true
    sleep 2
    
    if nmcli connection up "$ETH_CONNECTION"; then
        log_success "Conexão ativada!"
        sleep 3
        
        # Mostrar IP obtido
        IP=$(ip -4 addr show dev "$ETH_IFACE" | grep -oP '(?<=inet\s)\d+(\.\d+){3}(?=/)')
        if [ -n "$IP" ]; then
            log_success "IP obtido via DHCP: $IP"
        else
            log_warn "Aguardando DHCP..."
        fi
    else
        log_error "Falha ao ativar conexão"
        return 1
    fi
}

# ============================================================
# Configurar DHCP via systemd-networkd (fallback)
# ============================================================
configure_dhcp_systemd() {
    log_step "Configurando DHCP via systemd-networkd..."
    
    log_info "Criando arquivo de configuração para $ETH_IFACE..."
    
    # Parar NetworkManager se estiver gerenciando a interface
    if systemctl is-active --quiet NetworkManager; then
        log_info "Deixando NetworkManager de lado para $ETH_IFACE..."
        mkdir -p /etc/NetworkManager/conf.d
        cat > "/etc/NetworkManager/conf.d/unmanaged-${ETH_IFACE}.conf" <<EOF
[keyfile]
unmanaged-devices=interface-name:${ETH_IFACE}
EOF
        systemctl reload NetworkManager
        sleep 2
    fi
    
    # Configurar systemd-networkd
    mkdir -p /etc/systemd/network
    
    cat > "/etc/systemd/network/20-${ETH_IFACE}-dhcp.network" <<EOF
[Match]
Name=$ETH_IFACE

[Network]
DHCP=yes
DHCP6=yes
IgnoreCarrier=no

[DHCP]
RouteMetric=100
UseDomains=yes
UseDomainName=yes
EOF
    
    log_success "Arquivo de configuração criado"
    
    # Habilitar e iniciar systemd-networkd
    log_info "Habilitando systemd-networkd..."
    systemctl enable systemd-networkd
    systemctl restart systemd-networkd
    
    log_success "systemd-networkd configurado e iniciado"
}

# ============================================================
# Configurar DHCP via dhclient (fallback final)
# ============================================================
configure_dhcp_dhclient() {
    log_step "Configurando DHCP via dhclient..."
    
    # Instalar dhclient se não estiver instalado
    if ! command -v dhclient &> /dev/null; then
        log_info "Instalando isc-dhcp-client..."
        apt-get update -qq
        apt-get install -y -qq isc-dhcp-client
    fi
    
    # Configurar interface
    log_info "Configurando interface $ETH_IFACE..."
    ip link set dev "$ETH_IFACE" up
    
    log_info "Obtendo IP via DHCP..."
    if dhclient -v "$ETH_IFACE"; then
        log_success "DHCP configurado com dhclient"
        
        sleep 2
        IP=$(ip -4 addr show dev "$ETH_IFACE" | grep -oP '(?<=inet\s)\d+(\.\d+){3}(?=/)')
        if [ -n "$IP" ]; then
            log_success "IP obtido: $IP"
        fi
    else
        log_error "Falha ao configurar DHCP com dhclient"
        return 1
    fi
}

# ============================================================
# Verificar e testar conexão
# ============================================================
verify_configuration() {
    log_step "Verificando configuração..."
    
    echo ""
    echo -e "${CYAN}Estado da interface ethernet:${NC}"
    ip addr show dev "$ETH_IFACE" || true
    
    echo ""
    echo -e "${CYAN}Rota padrão:${NC}"
    ip route show default || echo "Sem rota padrão"
    
    echo ""
    echo -e "${CYAN}DNS:${NC}"
    cat /etc/resolv.conf | grep nameserver | head -3 || echo "Sem DNS configurado"
    
    echo ""
    echo -e "${CYAN}Teste de conectividade:${NC}"
    
    if ping -c 1 8.8.8.8 &> /dev/null; then
        log_success "✓ Internet disponível!"
    else
        log_warn "✗ Sem acesso à internet no momento (pode estar aguardando DHCP)"
    fi
}

# ============================================================
# Criar script de remoção de IP fixo
# ============================================================
cleanup_static_ip() {
    log_step "Removendo configurações de IP fixo..."
    
    # Remover arquivo de configuração estática do systemd se existir
    if [ -f "/etc/systemd/network/10-${ETH_IFACE}-static.network" ]; then
        log_info "Removendo arquivo estático do systemd..."
        rm -f "/etc/systemd/network/10-${ETH_IFACE}-static.network"
        systemctl restart systemd-networkd || true
        log_success "Arquivo removido"
    fi
    
    # Remover configuração manual do /etc/network/interfaces se existir
    if grep -q "$ETH_IFACE" /etc/network/interfaces 2>/dev/null; then
        log_warn "Encontrada configuração em /etc/network/interfaces"
        log_info "Fazendo backup..."
        cp /etc/network/interfaces "/etc/network/interfaces.backup.$(date +%s)"
        
        # Remover linha da interface específica (básico)
        sed -i "/^iface $ETH_IFACE/d" /etc/network/interfaces
        sed -i "/^auto $ETH_IFACE/d" /etc/network/interfaces
        log_success "Backup criado e configuração removida"
    fi
}

# ============================================================
# Main
# ============================================================
main() {
    echo -e "${CYAN}"
    echo "╔════════════════════════════════════════════════════════╗"
    echo "║   Configurar Ethernet como DHCP Cliente              ║"
    echo "╚════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo ""
    
    check_root
    detect_ethernet
    cleanup_static_ip
    
    echo ""
    
    # Tentar configurar com NetworkManager primeiro
    if command -v nmcli &> /dev/null && systemctl is-active --quiet NetworkManager; then
        if configure_dhcp_nmcli; then
            log_success "✓ Ethernet configurada como DHCP cliente via NetworkManager!"
        else
            log_warn "Tentando fallback..."
            configure_dhcp_systemd || configure_dhcp_dhclient || true
        fi
    elif systemctl is-active --quiet systemd-networkd; then
        configure_dhcp_systemd
        log_success "✓ Ethernet configurada como DHCP cliente via systemd-networkd!"
    else
        configure_dhcp_dhclient
        log_success "✓ Ethernet configurada como DHCP cliente via dhclient!"
    fi
    
    echo ""
    verify_configuration
    
    echo ""
    log_success "Configuração concluída!"
    echo ""
    
    # Mostrar próximos passos
    echo -e "${GREEN}Próximos passos:${NC}"
    echo "1. Aguarde alguns segundos para o DHCP obter um IP"
    echo "2. Verifique o IP com: ip addr show $ETH_IFACE"
    echo "3. Teste a conectividade com: ping -c 3 8.8.8.8"
    echo ""
    
    # Se o hotspot estiver ativo, mostrar informações
    if nmcli -t -f NAME connection show | grep -q -i "hotspot\|access"; then
        echo -e "${YELLOW}⚠️  Aviso: Hotspot WiFi está ativo${NC}"
        echo "Se você quer usar APENAS DHCP na ethernet (sem hotspot):"
        echo "  sudo nmcli connection delete <hotspot-name>"
        echo ""
    fi
}

main "$@"
