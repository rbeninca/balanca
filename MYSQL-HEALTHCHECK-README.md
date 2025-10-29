# Sistema de Monitoramento e Recuperação Automática do MySQL

## Problema Resolvido

O MySQL estava parando ocasionalmente devido a:
- Memória limitada no TVBox (945MB total)
- Falta de limites de memória configurados no container
- Ausência de sistema de recuperação automática

## Solução Implementada

### 1. Limites de Memória no Docker Compose

O arquivo `docker-compose.yml` foi atualizado com:
- **mem_limit: 256m** - Limite máximo de memória para o MySQL
- **mem_reservation: 128m** - Memória mínima reservada
- **healthcheck** aprimorado com intervalos mais adequados

### 2. Script de Monitoramento Automático

Arquivo: `/home/rbeninca/balancaGFIG/mysql-healthcheck.sh`

**Funcionalidades:**
- Verifica saúde do MySQL a cada 30 segundos
- Detecta quando o MySQL para de responder
- Tentativas progressivas de recuperação:
  1. Restart suave do container
  2. Restart via docker compose
  3. Rebuild completo (último recurso)
- Logging detalhado em `/var/log/mysql-healthcheck.log`
- Rotação automática de logs (limite 10MB)

### 3. Serviço Systemd

Arquivo: `/etc/systemd/system/mysql-healthcheck.service`

- Inicia automaticamente com o sistema
- Reinicia automaticamente se falhar
- Roda continuamente em background

## Como Usar

### Verificar Status Manual

Execute o script de verificação:
```bash
/home/rbeninca/balancaGFIG/check-mysql.sh
```

Mostra:
- Status dos containers
- Teste de conexão do MySQL
- Uso de recursos (CPU/memória)
- Últimos logs do healthcheck
- Status do serviço de monitoramento

### Ver Logs do Monitoramento

```bash
# Ver logs completos
cat /var/log/mysql-healthcheck.log

# Acompanhar logs em tempo real
tail -f /var/log/mysql-healthcheck.log

# Ver últimas 50 linhas
tail -50 /var/log/mysql-healthcheck.log
```

### Gerenciar o Serviço de Monitoramento

```bash
# Ver status
systemctl status mysql-healthcheck.service

# Parar monitoramento
systemctl stop mysql-healthcheck.service

# Iniciar monitoramento
systemctl start mysql-healthcheck.service

# Reiniciar monitoramento
systemctl restart mysql-healthcheck.service

# Desabilitar inicialização automática
systemctl disable mysql-healthcheck.service

# Habilitar inicialização automática
systemctl enable mysql-healthcheck.service

# Ver logs do systemd
journalctl -u mysql-healthcheck.service -f
```

### Operações Manuais no MySQL

```bash
# Reiniciar apenas o MySQL
docker restart balanca_mysql

# Ver logs do MySQL
docker logs balanca_mysql --tail 100

# Entrar no container MySQL
docker exec -it balanca_mysql bash

# Testar conexão
docker exec balanca_mysql sh -c 'mariadb -u balanca_user -pbalanca_password -e "SELECT 1"'
```

## Logs e Alertas

### O que o sistema registra:

- ✓ **MySQL funcionando normalmente** - A cada 5 minutos quando tudo está OK
- ⚠️ **ALERTA: MySQL não está respondendo** - Quando detecta problema
- **Tentando restart suave** - Primeira tentativa de recuperação
- **Tentando restart via docker-compose** - Segunda tentativa
- **ÚLTIMA TENTATIVA: Rebuild completo** - Último recurso
- ✓ **MySQL recuperado com sucesso** - Quando a recuperação funciona
- ❌ **FALHA CRÍTICA** - Se todas as tentativas falharem

### Exemplo de log de recuperação bem-sucedida:

```
[2025-10-29 15:43:15] ⚠️  ALERTA: MySQL não está respondendo! Tentativa de recuperação 1/3
[2025-10-29 15:43:15] Tentando restart suave do container...
[2025-10-29 15:43:50] ✓ MySQL recuperado com sucesso após restart!
```

## Configurações

### Ajustar intervalos de verificação

Edite `/home/rbeninca/balancaGFIG/mysql-healthcheck.sh`:

```bash
CHECK_INTERVAL=30  # Segundos entre verificações (padrão: 30s)
MAX_RESTART_ATTEMPTS=3  # Tentativas antes do rebuild (padrão: 3)
RESTART_COOLDOWN=300  # Cooldown entre restarts (padrão: 5min)
```

Após modificar, reinicie o serviço:
```bash
systemctl restart mysql-healthcheck.service
```

## Arquivos Importantes

- `/home/rbeninca/balancaGFIG/docker-compose.yml` - Configuração do Docker
- `/home/rbeninca/balancaGFIG/mysql-healthcheck.sh` - Script de monitoramento
- `/home/rbeninca/balancaGFIG/check-mysql.sh` - Script de verificação manual
- `/etc/systemd/system/mysql-healthcheck.service` - Serviço systemd
- `/var/log/mysql-healthcheck.log` - Logs do monitoramento
- `/home/rbeninca/balancaGFIG/docker-compose.yml.backup` - Backup da configuração anterior

## Troubleshooting

### O serviço não está rodando

```bash
systemctl start mysql-healthcheck.service
systemctl status mysql-healthcheck.service
```

### MySQL continua parando

1. Verifique uso de memória: `free -h`
2. Verifique logs: `tail -100 /var/log/mysql-healthcheck.log`
3. Verifique logs do MySQL: `docker logs balanca_mysql`
4. Considere reduzir mais o limite de memória ou aumentar RAM

### Falha crítica persistente

Se o sistema não conseguir recuperar o MySQL automaticamente:

1. Verifique se há espaço em disco: `df -h`
2. Verifique se o volume de dados está corrompido
3. Considere backup e recriação do volume MySQL
4. Verifique mensagens do kernel: `dmesg | tail -50`

## Manutenção

### Backup periódico do banco

Recomenda-se fazer backup do banco regularmente:

```bash
docker exec balanca_mysql sh -c 'mysqldump -u root -pHilquias balanca_gfig' > backup.sql
```

### Limpeza de logs antigos

Os logs rotacionam automaticamente, mas você pode limpar manualmente:

```bash
rm /var/log/mysql-healthcheck.log.old
```

## Informações Técnicas

- **Sistema:** TVBox com 945MB RAM
- **MySQL:** MariaDB 11.8.3
- **Limite de memória MySQL:** 256MB (máx) / 128MB (reservado)
- **Intervalo de monitoramento:** 30 segundos
- **Timeout de healthcheck:** 5 segundos
- **Container balanca:** Limite de 512MB

---

Sistema implementado em: 29/10/2025
Versão: 1.0
