#!/bin/bash
#
# setup_wifi.sh - Script híbrido para criar Access Point WiFi
# Combina a simplicidade do NetworkManager com robustez e controle avançado
#
# Este script:
# - Usa NetworkManager (nmcli) como método principal (mais simples e confiável)
# - Detecta automaticamente interfaces de rede
# - Suporta IPv4 e IPv6 (quando disponível)
# - Faz backup de configurações
# - Oferece fallback para hostapd+dnsmasq se NetworkManager falhar
# - É portável para diferentes dispositivos Linux
#
# Data: 2025-10-29
#

set -e  # Sair em caso de erro crítico

# ============================================================
# CORES PARA OUTPUT
# ============================================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ============================================================
# FUNÇÕES DE LOG
# ============================================================
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

# ============================================================
# BANNER
# ============================================================
show_banner() {
    echo -e "${CYAN}"
    echo "╔════════════════════════════════════════════════════════╗"
    echo "║     WiFi Access Point Setup                          ║"
    echo "║  Hybrid NetworkManager + hostapd/dnsmasq Solution    ║"
    echo "╚════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# ============================================================
# VERIFICAÇÃO DE PERMISSÕES
# ============================================================
check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "Este script precisa ser executado como root"
        echo "Use: sudo $0"
        exit 1
    fi
}

# ============================================================
# CONFIGURAÇÕES DO ACCESS POINT
# ============================================================
# Estas variáveis podem ser alteradas conforme necessário
AP_SSID="${AP_SSID:-rbeninca}"
AP_PASSWORD="${AP_PASSWORD:-aabbccddee}"
AP_CONNECTION_NAME="${AP_CONNECTION_NAME:-${AP_SSID}-Hotspot}"
AP_CHANNEL="${AP_CHANNEL:-6}"
AP_IPV4_SUBNET="10.1.1"
AP_IPV4_ADDRESS="${AP_IPV4_SUBNET}.1"

# Modo de operação: "auto", "nmcli", "hostapd"
OPERATION_MODE="${OPERATION_MODE:-auto}"

# ============================================================
# DETECÇÃO DE AMBIENTE
# ============================================================
detect_environment() {
    log_step "Detectando ambiente do sistema..."

    # Verificar se NetworkManager está disponível e ativo
    HAS_NMCLI=false
    if command -v nmcli &> /dev/null; then
        if systemctl is-active --quiet NetworkManager; then
            HAS_NMCLI=true
            NMCLI_VERSION=$(nmcli --version | head -1)
            log_info "NetworkManager detectado: $NMCLI_VERSION"
        else
            log_warn "nmcli instalado mas NetworkManager não está ativo"
        fi
    else
        log_warn "NetworkManager não encontrado"
    fi

    # Verificar se hostapd e dnsmasq estão disponíveis
    HAS_HOSTAPD=false
    HAS_DNSMASQ=false

    if command -v hostapd &> /dev/null; then
        HAS_HOSTAPD=true
        HOSTAPD_VERSION=$(hostapd -v 2>&1 | head -1)
        log_info "hostapd detectado: $HOSTAPD_VERSION"
    fi

    if command -v dnsmasq &> /dev/null; then
        HAS_DNSMASQ=true
        DNSMASQ_VERSION=$(dnsmasq --version 2>&1 | head -1)
        log_info "dnsmasq detectado: $DNSMASQ_VERSION"
    fi

    # Decidir modo de operação
    if [ "$OPERATION_MODE" = "auto" ]; then
        if [ "$HAS_NMCLI" = true ]; then
            OPERATION_MODE="nmcli"
            log_success "Modo selecionado: NetworkManager (recomendado)"
        elif [ "$HAS_HOSTAPD" = true ] && [ "$HAS_DNSMASQ" = true ]; then
            OPERATION_MODE="hostapd"
            log_success "Modo selecionado: hostapd + dnsmasq (fallback)"
        else
            log_error "Nenhum método disponível para criar hotspot"
            log_error "Instale NetworkManager ou hostapd+dnsmasq"
            exit 1
        fi
    fi

    echo ""
}

# ============================================================
# DETECÇÃO DE INTERFACES
# ============================================================
detect_interfaces() {
    log_step "Detectando interfaces de rede..."

    # Detectar interface WiFi
    if [ "$OPERATION_MODE" = "nmcli" ]; then
        # Usar nmcli para detectar WiFi (mais confiável com NetworkManager)
        WIFI_IFACE=$(nmcli -t -f DEVICE,TYPE dev | grep ':wifi$' | cut -d':' -f1 | grep -v '^p2p-' | head -n1)
    else
        # Usar iw para detectar WiFi com suporte a AP
        WIFI_IFACE=$(iw dev | awk '$1=="Interface"{print $2}' | grep -v '^p2p-' | head -n1)
    fi

    if [ -z "$WIFI_IFACE" ]; then
        log_error "Nenhuma interface WiFi encontrada!"
        exit 1
    fi
    log_info "Interface WiFi detectada: $WIFI_IFACE"

    # Detectar interface de internet ativa (ethernet/conectada)
    if [ "$OPERATION_MODE" = "nmcli" ]; then
        # Procurar conexão ativa que não seja o próprio hotspot
        INET_IFACE=$(nmcli -t -f DEVICE,STATE,CONNECTION dev | \
                     grep ':connected:' | \
                     grep -v ":--$" | \
                     grep -v "$WIFI_IFACE" | \
                     cut -d':' -f1 | head -n1)
    else
        # Detectar interface ethernet com link up
        INET_IFACE=$(ip -o link show | \
                     awk -F': ' '$2 !~ /^(lo|wlan|ap|p2p|docker|br|veth)/ {print $2}' | \
                     head -n1)
    fi

    if [ -z "$INET_IFACE" ]; then
        log_warn "Nenhuma conexão de internet ativa detectada"
        log_warn "O hotspot será criado mas pode não ter acesso à internet"
        INET_IFACE="none"
    else
        log_info "Interface de internet detectada: $INET_IFACE"
    fi

    # Verificar IPv6
    HAS_IPV6=false
    if [ "$INET_IFACE" != "none" ]; then
        if ip -6 addr show dev "$INET_IFACE" 2>/dev/null | grep -q "scope global"; then
            HAS_IPV6=true
            IPV6_ADDR=$(ip -6 addr show dev "$INET_IFACE" scope global | \
                        grep -oP '(?<=inet6 )[\da-f:]+/\d+' | head -1)
            log_info "IPv6 detectado: $IPV6_ADDR"
        fi
    fi

    echo ""
}

# ============================================================
# BACKUP DE CONFIGURAÇÕES
# ============================================================
create_backup() {
    log_step "Criando backup de configurações..."

    BACKUP_DIR="/root/wifi-ap-backup-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$BACKUP_DIR"

    # Backup de conexões NetworkManager existentes
    if [ "$OPERATION_MODE" = "nmcli" ]; then
        nmcli -t -f NAME,TYPE con show > "$BACKUP_DIR/nmcli-connections.txt" 2>/dev/null || true
    fi

    # Backup de configurações hostapd/dnsmasq se existirem
    [ -f /etc/hostapd/hostapd.conf ] && cp /etc/hostapd/hostapd.conf "$BACKUP_DIR/" 2>/dev/null || true
    [ -f /etc/dnsmasq.conf ] && cp /etc/dnsmasq.conf "$BACKUP_DIR/" 2>/dev/null || true

    # Backup de iptables
    iptables-save > "$BACKUP_DIR/iptables-rules.v4" 2>/dev/null || true
    ip6tables-save > "$BACKUP_DIR/iptables-rules.v6" 2>/dev/null || true

    # Salvar informações do sistema
    ip addr > "$BACKUP_DIR/ip-addr.txt" 2>/dev/null || true
    ip route > "$BACKUP_DIR/ip-route.txt" 2>/dev/null || true

    log_info "Backup salvo em: $BACKUP_DIR"
    echo ""
}

# ============================================================
# CORREÇÃO DE NAT DO NETWORKMANAGER
# ============================================================
fix_networkmanager_nat() {
    log_info "Corrigindo regras de firewall do NetworkManager..."

    # Detectar interface do AP (procurar por 10.1.1.1 ou 10.42.0.1)
    local AP_IF=$(ip addr | grep -B 2 -E "10\.1\.1\.1|10\.42\.0\.1" | head -1 | awk '{print $2}' | tr -d ':')
    if [ -z "$AP_IF" ]; then
        AP_IF="$WIFI_IFACE"
    fi

    # Detectar rede do AP
    local AP_NET=$(ip addr show dev "$AP_IF" 2>/dev/null | grep "inet " | awk '{print $2}' | cut -d'/' -f1 | cut -d'.' -f1-3)
    if [ -z "$AP_NET" ]; then
        AP_NET="10.1.1"  # Padrão: 10.1.1
    fi

    log_info "Interface AP: $AP_IF"
    log_info "Rede AP: ${AP_NET}.0/24"
    log_info "Interface Internet: $INET_IFACE"

    # 1. Remover regra DROP problemática do NetworkManager
    log_info "Removendo bloqueio do NetworkManager..."
    iptables -D FORWARD -i "$AP_IF" -j DROP 2>/dev/null && \
        log_success "Regra DROP removida" || \
        log_info "Regra DROP não encontrada (ok)"

    # 2. Adicionar NAT para interface de internet
    if [ "$INET_IFACE" != "none" ]; then
        log_info "Configurando NAT para $INET_IFACE..."

        # Verificar se já existe antes de adicionar
        if ! iptables -t nat -C POSTROUTING -s ${AP_NET}.0/24 -o "$INET_IFACE" -j MASQUERADE 2>/dev/null; then
            iptables -t nat -A POSTROUTING -s ${AP_NET}.0/24 -o "$INET_IFACE" -j MASQUERADE
            log_success "NAT configurado"
        else
            log_success "NAT já configurado"
        fi

        # 3. Permitir FORWARD do AP para Internet
        if ! iptables -C FORWARD -i "$AP_IF" -o "$INET_IFACE" -j ACCEPT 2>/dev/null; then
            iptables -I FORWARD 1 -i "$AP_IF" -o "$INET_IFACE" -j ACCEPT
            log_success "FORWARD (AP→Internet) configurado"
        else
            log_success "FORWARD (AP→Internet) já configurado"
        fi

        # 4. Permitir FORWARD de retorno (Internet para AP)
        if ! iptables -C FORWARD -i "$INET_IFACE" -o "$AP_IF" -m state --state RELATED,ESTABLISHED -j ACCEPT 2>/dev/null; then
            iptables -I FORWARD 1 -i "$INET_IFACE" -o "$AP_IF" -m state --state RELATED,ESTABLISHED -j ACCEPT
            log_success "FORWARD (Internet→AP) configurado"
        else
            log_success "FORWARD (Internet→AP) já configurado"
        fi

        # 5. Instalar iptables-persistent se não estiver instalado
        log_info "Verificando iptables-persistent..."
        if ! dpkg -l | grep -q iptables-persistent; then
            log_info "Instalando iptables-persistent..."
            DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent >/dev/null 2>&1 || \
                log_warn "Não foi possível instalar iptables-persistent"
        fi

        # 6. Salvar regras permanentemente
        log_info "Salvando regras de firewall..."
        mkdir -p /etc/iptables
        iptables-save > /etc/iptables/rules.v4 2>/dev/null || log_warn "Falha ao salvar regras IPv4"
        ip6tables-save > /etc/iptables/rules.v6 2>/dev/null || log_warn "Falha ao salvar regras IPv6"

        log_success "Correções de NAT aplicadas!"
    else
        log_warn "Sem interface de internet detectada - NAT não configurado"
    fi
}

# ============================================================
# CONFIGURAR DNS LOCAL PARA HOTSPOT
# ============================================================
configure_local_dns() {
    log_info "Configurando DNS local para hotspot..."
    
    # Criar diretório de configuração do dnsmasq se não existir
    mkdir -p /etc/NetworkManager/dnsmasq-shared.d
    
    # Criar arquivo de configuração personalizada para o hotspot
    cat > /etc/NetworkManager/dnsmasq-shared.d/hotspot-dns.conf <<EOF
# DNS local para hotspot
# Permite acessar o gateway com nome amigável
address=/tvbox/$AP_IPV4_ADDRESS
address=/gateway.local/$AP_IPV4_ADDRESS
address=/balanca/$AP_IPV4_ADDRESS
address=/gfig.local/$AP_IPV4_ADDRESS

# Comentário: Resolve esses nomes para o IP do hotspot (10.1.1.1)
# Clientes conectados ao hotspot poderão acessar via:
#   - ssh root@tvbox
#   - ssh root@gateway.local
#   - ssh root@balanca
#   - ssh root@gfig.local
EOF
    
    log_success "DNS local configurado:"
    log_info "  - tvbox → $AP_IPV4_ADDRESS"
    log_info "  - gateway.local → $AP_IPV4_ADDRESS"
    log_info "  - balanca → $AP_IPV4_ADDRESS"
    log_info "  - gfig.local → $AP_IPV4_ADDRESS"
}

# ============================================================
# MÉTODO 1: USAR NETWORKMANAGER (PREFERENCIAL)
# ============================================================
setup_with_nmcli() {
    log_step "Configurando hotspot com NetworkManager..."

    # FORÇAR NetworkManager a gerenciar a interface wlan0
    log_info "Forçando NetworkManager a gerenciar $WIFI_IFACE..."
    nmcli dev set "$WIFI_IFACE" managed yes 2>/dev/null || log_warn "Não foi possível forçar gerenciamento"
    sleep 2
    
    # Verificar se o NetworkManager está gerenciando a interface agora
    if nmcli dev status | grep -q "$WIFI_IFACE.*unmanaged"; then
        log_error "Interface $WIFI_IFACE ainda está como 'unmanaged'. Tentando resolver..."
        # Remover configurações que impedem o gerenciamento
        rm -f /etc/NetworkManager/conf.d/*unmanage*.conf 2>/dev/null
        rm -f /etc/NetworkManager/conf.d/*unmanaged*.conf 2>/dev/null
        systemctl reload NetworkManager
        sleep 3
        nmcli dev set "$WIFI_IFACE" managed yes
        sleep 2
    fi
    
    # Última verificação
    if nmcli dev status | grep -q "$WIFI_IFACE.*unmanaged"; then
        log_error "Impossível fazer NetworkManager gerenciar $WIFI_IFACE"
        return 1
    fi
    
    log_success "NetworkManager agora gerencia $WIFI_IFACE"

    # Verificar se já existe uma conexão com este nome
    if nmcli -t -f NAME con show | grep -q "^${AP_CONNECTION_NAME}$"; then
        log_info "Conexão existente '${AP_CONNECTION_NAME}' encontrada"
        read -p "Deseja remover e recriar? (s/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[SsYy]$ ]]; then
            log_info "Removendo conexão antiga..."
            nmcli con delete "${AP_CONNECTION_NAME}" || log_warn "Falha ao remover conexão antiga"
        else
            log_info "Tentando ativar conexão existente..."
            if nmcli con up "${AP_CONNECTION_NAME}"; then
                log_success "Conexão ativada com sucesso!"
                return 0
            else
                log_warn "Falha ao ativar - removendo e recriando..."
                nmcli con delete "${AP_CONNECTION_NAME}" || true
            fi
        fi
    fi

    # IMPORTANTE: Parar dnsmasq do sistema que pode conflitar
    log_info "Verificando conflitos de DHCP..."
    if systemctl is-active --quiet dnsmasq; then
        log_warn "dnsmasq do sistema está rodando - pode causar conflito"
        log_info "Parando dnsmasq do sistema..."
        systemctl stop dnsmasq || log_warn "Não foi possível parar dnsmasq"
        systemctl disable dnsmasq 2>/dev/null || true
        log_success "dnsmasq do sistema desabilitado (NetworkManager gerenciará DHCP)"
    fi

    # Criar hotspot usando nmcli
    log_info "Criando hotspot '${AP_SSID}'..."

    if nmcli dev wifi hotspot \
        ifname "$WIFI_IFACE" \
        con-name "$AP_CONNECTION_NAME" \
        ssid "$AP_SSID" \
        password "$AP_PASSWORD"; then

        log_success "Hotspot criado com sucesso!"

        # Configurações adicionais opcionais
        log_info "Aplicando configurações avançadas..."

        # Definir canal específico (opcional)
        nmcli con modify "$AP_CONNECTION_NAME" 802-11-wireless.channel "$AP_CHANNEL" 2>/dev/null || \
            log_warn "Não foi possível definir canal específico"

        # CONFIGURAR IP MANUALMENTE COM 10.1.1.1
        # NetworkManager hotspot requer IP manual para funcionar corretamente
        log_info "Configurando IP do hotspot como ${AP_IPV4_ADDRESS}/24..."
        
        # Aguardar um pouco para o hotspot estabilizar
        sleep 3
        
        nmcli con down "$AP_CONNECTION_NAME" 2>/dev/null || true
        sleep 2
        
        # Configurar IP manualmente
        nmcli con modify "$AP_CONNECTION_NAME" ipv4.method manual
        nmcli con modify "$AP_CONNECTION_NAME" ipv4.addresses "${AP_IPV4_ADDRESS}/24"
        nmcli con modify "$AP_CONNECTION_NAME" ipv4.gateway "${AP_IPV4_ADDRESS}"
        
        # Configurar o DHCP range para o dnsmasq interno do NetworkManager
        # A sintaxe é: <start-ip>,<end-ip>,<lease-time>
        nmcli con modify "$AP_CONNECTION_NAME" ipv4.dhcp-range-start "${AP_IPV4_SUBNET}.10"
        nmcli con modify "$AP_CONNECTION_NAME" ipv4.dhcp-range-end "${AP_IPV4_SUBNET}.254"
        
        nmcli con modify "$AP_CONNECTION_NAME" ipv4.dns "8.8.8.8,8.8.4.4"
        
        # Recarregar conexão para aplicar mudanças
        log_info "Ativando conexão com IP manual e DHCP..."
        if ! nmcli con up "$AP_CONNECTION_NAME"; then
            log_error "Falha crítica ao ativar conexão com IP manual. Verifique os logs do NetworkManager."
            log_error "journalctl -u NetworkManager"
            return 1
        fi
        
        # Aguardar estabilização
        log_info "Aguardando interface estabilizar (10 segundos)..."
        sleep 10

        # Verificar se o IP foi aplicado corretamente
        CURRENT_IP=$(ip -4 addr show dev "$WIFI_IFACE" | grep -oP '(?<=inet\s)\d+(\.\d+){3}')
        if [ "$CURRENT_IP" != "$AP_IPV4_ADDRESS" ]; then
            log_error "O IP da interface ($CURRENT_IP) não corresponde ao IP esperado ($AP_IPV4_ADDRESS)."
            log_warn "O DHCP pode não funcionar. Tentando forçar a reativação..."
            nmcli con down "$AP_CONNECTION_NAME" && sleep 2 && nmcli con up "$AP_CONNECTION_NAME"
            sleep 5
        else
            log_success "IP $CURRENT_IP aplicado com sucesso em $WIFI_IFACE."
        fi

        log_success "Hotspot configurado com NetworkManager (IP: ${AP_IPV4_ADDRESS})"

        # Habilitar autoconnect para iniciar automaticamente no boot
        log_info "Configurando inicialização automática..."
        nmcli con modify "$AP_CONNECTION_NAME" connection.autoconnect yes 2>/dev/null || \
            log_warn "Não foi possível habilitar autoconnect"

        log_info "Aplicando correções de NAT/Firewall..."
        fix_networkmanager_nat
        
        log_info "Configurando DNS local para hotspot..."
        configure_local_dns

        # Configurar IP forwarding permanente
        log_info "Configurando IP forwarding permanente..."
        if ! grep -q "^net.ipv4.ip_forward=1" /etc/sysctl.conf; then
            echo "" >> /etc/sysctl.conf
            echo "# IP Forwarding para Hotspot WiFi" >> /etc/sysctl.conf
            echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
            echo "net.ipv6.conf.all.forwarding=1" >> /etc/sysctl.conf
            sysctl -p >/dev/null 2>&1 || true
            log_success "IP forwarding configurado permanentemente"
        else
            log_success "IP forwarding já está configurado"
        fi

        return 0
    else
        log_error "Falha ao criar hotspot com NetworkManager"
        return 1
    fi
}

# ============================================================
# MÉTODO 2: USAR HOSTAPD + DNSMASQ (FALLBACK)
# ============================================================
setup_with_hostapd() {
    log_step "Configurando hotspot com hostapd + dnsmasq..."

    # Verificar dependências
    if [ "$HAS_HOSTAPD" != true ] || [ "$HAS_DNSMASQ" != true ]; then
        log_error "hostapd ou dnsmasq não estão instalados"
        log_info "Instale com: apt-get install hostapd dnsmasq"
        return 1
    fi

    # Parar serviços existentes
    systemctl stop hostapd 2>/dev/null || true
    systemctl stop dnsmasq 2>/dev/null || true

    # Configurar NetworkManager para não gerenciar a interface WiFi
    if systemctl is-active --quiet NetworkManager; then
        log_info "Configurando NetworkManager para ignorar $WIFI_IFACE..."
        cat > /etc/NetworkManager/conf.d/unmanage-wifi.conf <<EOF
[keyfile]
unmanaged-devices=interface-name:$WIFI_IFACE
EOF
        systemctl reload NetworkManager || log_warn "Falha ao recarregar NetworkManager"
        sleep 2
    fi

    # Configurar interface WiFi
    log_info "Configurando interface $WIFI_IFACE..."
    ip link set dev "$WIFI_IFACE" up
    ip addr flush dev "$WIFI_IFACE" 2>/dev/null || true
    ip addr add "${AP_IPV4_ADDRESS}/24" broadcast "${AP_IPV4_SUBNET}.255" dev "$WIFI_IFACE"

    # Criar configuração do hostapd
    log_info "Criando configuração do hostapd..."
    cat > /etc/hostapd/hostapd.conf <<EOF
# Interface
interface=$WIFI_IFACE
driver=nl80211

# Configurações do AP
ssid=$AP_SSID
hw_mode=g
channel=$AP_CHANNEL
ieee80211n=1
wmm_enabled=1

# Segurança
auth_algs=1
wpa=2
wpa_key_mgmt=WPA-PSK
rsn_pairwise=CCMP
wpa_passphrase=$AP_PASSWORD

# Outros
beacon_int=100
dtim_period=2
max_num_sta=10
country_code=BR
EOF

    chmod 600 /etc/hostapd/hostapd.conf

    # Atualizar daemon conf
    if [ -f /etc/default/hostapd ]; then
        sed -i 's|^#*DAEMON_CONF=.*|DAEMON_CONF="/etc/hostapd/hostapd.conf"|' /etc/default/hostapd
    fi

    # Criar configuração do dnsmasq
    log_info "Criando configuração do dnsmasq..."
    [ -f /etc/dnsmasq.conf ] && mv /etc/dnsmasq.conf /etc/dnsmasq.conf.backup

    cat > /etc/dnsmasq.conf <<EOF
interface=$WIFI_IFACE
bind-interfaces
dhcp-range=${AP_IPV4_SUBNET}.10,${AP_IPV4_SUBNET}.100,255.255.255.0,12h
dhcp-option=option:router,${AP_IPV4_ADDRESS}
dhcp-option=option:dns-server,${AP_IPV4_ADDRESS}
server=8.8.8.8
server=8.8.4.4
domain-needed
bogus-priv
dhcp-authoritative
EOF

    # Habilitar IP forwarding
    log_info "Habilitando IP forwarding..."
    echo 1 > /proc/sys/net/ipv4/ip_forward
    if ! grep -q "^net.ipv4.ip_forward=1" /etc/sysctl.conf; then
        echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
    fi

    if [ "$HAS_IPV6" = true ]; then
        echo 1 > /proc/sys/net/ipv6/conf/all/forwarding
        if ! grep -q "^net.ipv6.conf.all.forwarding=1" /etc/sysctl.conf; then
            echo "net.ipv6.conf.all.forwarding=1" >> /etc/sysctl.conf
        fi
    fi

    # Configurar NAT
    log_info "Configurando NAT..."

    if [ "$INET_IFACE" != "none" ]; then
        # Limpar regras antigas
        iptables -t nat -D POSTROUTING -o "$INET_IFACE" -j MASQUERADE 2>/dev/null || true
        iptables -D FORWARD -i "$INET_IFACE" -o "$WIFI_IFACE" -m state --state RELATED,ESTABLISHED -j ACCEPT 2>/dev/null || true
        iptables -D FORWARD -i "$WIFI_IFACE" -o "$INET_IFACE" -j ACCEPT 2>/dev/null || true

        # Adicionar regras NAT
        iptables -t nat -A POSTROUTING -o "$INET_IFACE" -j MASQUERADE
        iptables -A FORWARD -i "$INET_IFACE" -o "$WIFI_IFACE" -m state --state RELATED,ESTABLISHED -j ACCEPT
        iptables -A FORWARD -i "$WIFI_IFACE" -o "$INET_IFACE" -j ACCEPT

        # IPv6 forwarding
        if [ "$HAS_IPV6" = true ]; then
            ip6tables -D FORWARD -i "$INET_IFACE" -o "$WIFI_IFACE" -j ACCEPT 2>/dev/null || true
            ip6tables -D FORWARD -i "$WIFI_IFACE" -o "$INET_IFACE" -j ACCEPT 2>/dev/null || true
            ip6tables -A FORWARD -i "$INET_IFACE" -o "$WIFI_IFACE" -j ACCEPT
            ip6tables -A FORWARD -i "$WIFI_IFACE" -o "$INET_IFACE" -j ACCEPT
        fi

        # Salvar regras
        mkdir -p /etc/iptables
        iptables-save > /etc/iptables/rules.v4
        ip6tables-save > /etc/iptables/rules.v6
    fi

    # Iniciar serviços
    log_info "Iniciando hostapd..."
    systemctl unmask hostapd 2>/dev/null || true
    systemctl enable hostapd
    systemctl start hostapd

    if ! systemctl is-active --quiet hostapd; then
        log_error "Falha ao iniciar hostapd"
        log_info "Verifique os logs: journalctl -xeu hostapd"
        return 1
    fi

    sleep 3

    log_info "Iniciando dnsmasq..."
    systemctl enable dnsmasq
    systemctl start dnsmasq

    if ! systemctl is-active --quiet dnsmasq; then
        log_error "Falha ao iniciar dnsmasq"
        log_info "Verifique os logs: journalctl -xeu dnsmasq"
        return 1
    fi

    log_success "Hotspot configurado com hostapd + dnsmasq!"
    return 0
}

# ============================================================
# EXIBIR INFORMAÇÕES DO HOTSPOT
# ============================================================
show_hotspot_info() {
    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║            HOTSPOT CONFIGURADO COM SUCESSO!           ║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${GREEN}Informações do Access Point:${NC}"
    echo "  SSID: $AP_SSID"
    echo "  Senha: $AP_PASSWORD"
    echo "  Interface WiFi: $WIFI_IFACE"
    echo "  Interface Internet: $INET_IFACE"
    echo "  Modo: $OPERATION_MODE"

    if [ "$OPERATION_MODE" = "nmcli" ]; then
        echo "  Nome da Conexão: $AP_CONNECTION_NAME"
    else
        echo "  Endereço IP: $AP_IPV4_ADDRESS"
        echo "  Range DHCP: ${AP_IPV4_SUBNET}.10 - ${AP_IPV4_SUBNET}.100"
    fi

    if [ "$HAS_IPV6" = true ]; then
        echo "  IPv6: Habilitado"
    else
        echo "  IPv6: Não disponível"
    fi

    echo ""
    echo -e "${GREEN}Comandos úteis:${NC}"

    if [ "$OPERATION_MODE" = "nmcli" ]; then
        echo "  Ver status: nmcli con show '$AP_CONNECTION_NAME'"
        echo "  Desligar: nmcli con down '$AP_CONNECTION_NAME'"
        echo "  Ligar: nmcli con up '$AP_CONNECTION_NAME'"
        echo "  Remover: nmcli con delete '$AP_CONNECTION_NAME'"
    else
        echo "  Ver status: systemctl status hostapd dnsmasq"
        echo "  Ver clientes: iw dev $WIFI_IFACE station dump"
        echo "  Ver leases DHCP: cat /var/lib/misc/dnsmasq.leases"
        echo "  Logs hostapd: journalctl -xeu hostapd"
        echo "  Logs dnsmasq: journalctl -xeu dnsmasq"
        echo "  Parar: systemctl stop hostapd dnsmasq"
    fi

    echo ""
    echo -e "${GREEN}Backup salvo em:${NC} $BACKUP_DIR"
    echo ""

    # Tentar mostrar clientes conectados
    if [ "$OPERATION_MODE" = "hostapd" ]; then
        CLIENTS=$(iw dev "$WIFI_IFACE" station dump 2>/dev/null | grep -c "Station" || echo "0")
        if [ "$CLIENTS" -gt 0 ]; then
            echo -e "${GREEN}Clientes conectados: $CLIENTS${NC}"
            iw dev "$WIFI_IFACE" station dump | grep "Station\|signal avg" || true
        fi
    fi
}

# ============================================================
# CRIAR SCRIPT DE REMOÇÃO
# ============================================================
create_removal_script() {
    local script_path="$BACKUP_DIR/remove_hotspot.sh"

    cat > "$script_path" <<'EOFREMOVE'
#!/bin/bash
# Script para remover o hotspot criado

OPERATION_MODE="__OPERATION_MODE__"
AP_CONNECTION_NAME="__AP_CONNECTION_NAME__"
WIFI_IFACE="__WIFI_IFACE__"

if [ "$OPERATION_MODE" = "nmcli" ]; then
    echo "Removendo hotspot NetworkManager..."
    nmcli con down "$AP_CONNECTION_NAME" 2>/dev/null || true
    nmcli con delete "$AP_CONNECTION_NAME" 2>/dev/null || true
    echo "Hotspot removido"
else
    echo "Parando serviços hostapd e dnsmasq..."
    systemctl stop hostapd dnsmasq
    systemctl disable hostapd dnsmasq

    # Limpar interface
    ip addr flush dev "$WIFI_IFACE" 2>/dev/null || true

    # Remover configuração do NetworkManager
    rm -f /etc/NetworkManager/conf.d/unmanage-wifi.conf
    systemctl reload NetworkManager 2>/dev/null || true

    echo "Hotspot removido"
fi
EOFREMOVE

    # Substituir placeholders
    sed -i "s|__OPERATION_MODE__|$OPERATION_MODE|g" "$script_path"
    sed -i "s|__AP_CONNECTION_NAME__|$AP_CONNECTION_NAME|g" "$script_path"
    sed -i "s|__WIFI_IFACE__|$WIFI_IFACE|g" "$script_path"

    chmod +x "$script_path"

    log_info "Script de remoção criado: $script_path"
}

# ============================================================
# MAIN
# ============================================================
main() {
    show_banner
    check_root
    detect_environment
    detect_interfaces
    create_backup

    echo ""
    log_step "Iniciando configuração do hotspot..."
    echo ""

    # Tentar criar hotspot com o método selecionado
    if [ "$OPERATION_MODE" = "nmcli" ]; then
        if ! setup_with_nmcli; then
            log_warn "Falha com NetworkManager, tentando fallback para hostapd..."
            OPERATION_MODE="hostapd"
            if ! setup_with_hostapd; then
                log_error "Falha em todos os métodos!"
                exit 1
            fi
        fi
    elif [ "$OPERATION_MODE" = "hostapd" ]; then
        if ! setup_with_hostapd; then
            log_error "Falha ao configurar hotspot!"
            exit 1
        fi
    fi

    # Criar script de remoção
    create_removal_script

    # Exibir informações
    show_hotspot_info

    log_success "Configuração concluída com sucesso!"
    echo ""
}

# Executar script principal
main "$@"
