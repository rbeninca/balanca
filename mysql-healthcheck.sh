#!/bin/bash
# Script de monitoramento e auto-recuperação do MySQL e Aplicação
# Local: /home/rbeninca/balancaGFIG/mysql-healthcheck.sh
# Versão: 2.0 - Agora também monitora a aplicação

LOG_FILE="/var/log/mysql-healthcheck.log"
MAX_LOG_SIZE=10485760  # 10MB
MYSQL_CONTAINER="balanca_mysql"
APP_CONTAINER="balanca"
COMPOSE_DIR="/home/rbeninca/balancaGFIG"
CHECK_INTERVAL=30
MAX_RESTART_ATTEMPTS=3
RESTART_COOLDOWN=300

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

rotate_log() {
    if [ -f "$LOG_FILE" ] && [ $(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null) -gt $MAX_LOG_SIZE ]; then
        mv "$LOG_FILE" "${LOG_FILE}.old"
        log "Log rotacionado"
    fi
}

is_container_running() {
    docker ps --format '{{.Names}}' | grep -q "^$1$"
}

is_mysql_healthy() {
    docker exec $MYSQL_CONTAINER sh -c 'mariadb -u balanca_user -pbalanca_password -e "SELECT 1" > /dev/null 2>&1'
}

is_app_healthy() {
    # Verifica se a aplicação consegue se conectar ao MySQL
    docker exec $APP_CONTAINER python -c 'import pymysql; pymysql.connect(host="db", user="balanca_user", password="balanca_password", database="balanca_gfig").close()' > /dev/null 2>&1
}

check_docker_health() {
    local health_status=$(docker inspect --format='{{.State.Health.Status}}' $1 2>/dev/null)
    [ "$health_status" = "healthy" ]
}

recover_mysql() {
    local attempt=$1
    log "⚠️  ALERTA: MySQL não está respondendo! Tentativa de recuperação $attempt/$MAX_RESTART_ATTEMPTS"
    
    log "Tentando restart suave do container MySQL..."
    docker restart $MYSQL_CONTAINER
    sleep 30
    
    if is_mysql_healthy; then
        log "✓ MySQL recuperado com sucesso após restart!"
        # Reinicia a aplicação também para reconectar
        log "Reiniciando aplicação para reconectar ao MySQL..."
        docker restart $APP_CONTAINER
        sleep 10
        if is_app_healthy; then
            log "✓ Aplicação reconectou ao MySQL com sucesso!"
        fi
        return 0
    fi
    
    log "Restart suave falhou. Tentando restart via docker compose..."
    cd $COMPOSE_DIR
    docker compose restart db
    sleep 30
    
    if is_mysql_healthy; then
        log "✓ MySQL recuperado via docker compose!"
        docker restart $APP_CONTAINER
        sleep 10
        return 0
    fi
    
    return 1
}

full_rebuild() {
    log "⚠️  ÚLTIMA TENTATIVA: Rebuild completo do container MySQL..."
    cd $COMPOSE_DIR
    
    docker compose stop db
    docker compose up -d db
    sleep 45
    
    if is_mysql_healthy; then
        log "✓ MySQL recuperado após rebuild completo!"
        docker restart $APP_CONTAINER
        sleep 10
        return 0
    fi
    
    log "❌ FALHA CRÍTICA: Não foi possível recuperar o MySQL automaticamente!"
    return 1
}

restart_count=0
last_restart_time=0

log "=== MySQL Healthcheck v2.0 iniciado ==="

while true; do
    rotate_log
    
    # Verifica MySQL
    if ! is_container_running $MYSQL_CONTAINER; then
        log "❌ Container $MYSQL_CONTAINER não está rodando!"
        log "Tentando iniciar o container..."
        cd $COMPOSE_DIR
        docker compose up -d db
        sleep 30
        
        if is_container_running $MYSQL_CONTAINER; then
            log "✓ Container MySQL iniciado com sucesso"
        else
            log "❌ Falha ao iniciar container MySQL"
        fi
    elif ! is_mysql_healthy; then
        current_time=$(date +%s)
        time_since_restart=$((current_time - last_restart_time))
        
        if [ $time_since_restart -gt $RESTART_COOLDOWN ]; then
            restart_count=0
        fi
        
        restart_count=$((restart_count + 1))
        
        if [ $restart_count -le $MAX_RESTART_ATTEMPTS ]; then
            if recover_mysql $restart_count; then
                restart_count=0
                last_restart_time=$(date +%s)
            else
                last_restart_time=$(date +%s)
            fi
        else
            full_rebuild
            restart_count=0
            last_restart_time=$(date +%s)
        fi
    else
        # MySQL está saudável, verifica a aplicação
        if ! is_container_running $APP_CONTAINER; then
            log "⚠️  Container $APP_CONTAINER não está rodando!"
            log "Tentando iniciar aplicação..."
            cd $COMPOSE_DIR
            docker compose up -d balanca
            sleep 10
        elif ! is_app_healthy; then
            log "⚠️  Aplicação não consegue conectar ao MySQL. Reiniciando aplicação..."
            docker restart $APP_CONTAINER
            sleep 10
            if is_app_healthy; then
                log "✓ Aplicação reconectou com sucesso!"
            else
                log "❌ Aplicação ainda não consegue conectar. Problema pode ser mais sério."
            fi
        else
            # Tudo está funcionando
            if [ $(($(date +%s) % 300)) -eq 0 ]; then
                log "✓ MySQL e Aplicação funcionando normalmente"
            fi
        fi
    fi
    
    sleep $CHECK_INTERVAL
done
