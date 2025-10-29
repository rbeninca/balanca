# Guia de Instalação - Sistema de Monitoramento MySQL

Este guia explica como instalar o sistema completo em um novo ambiente.

## Pré-requisitos

- Docker e Docker Compose instalados
- Sistema operacional Linux com systemd
- Acesso root ao servidor

## Instalação Rápida

### 1. Clone o repositório

```bash
git clone <seu-repositorio>
cd balancaGFIG
```

### 2. Configure as variáveis de ambiente

Certifique-se de que o arquivo `db_root_password.txt` existe:

```bash
echo "Hilquias" > db_root_password.txt
```

### 3. Instale o sistema de monitoramento

Execute o script de instalação como root:

```bash
sudo ./install-monitoring.sh
```

Este script irá:
- Configurar permissões dos scripts
- Criar o serviço systemd
- Habilitar e iniciar o monitoramento automático
- Verificar se tudo está funcionando

### 4. Inicie os containers

```bash
docker compose up -d
```

Aguarde alguns segundos para o MySQL inicializar.

### 5. Verifique o status

```bash
./check-mysql.sh
```

## O Que Foi Instalado

### Dentro do Docker (docker-compose.yml)

✅ **Limites de memória MySQL:**
- Máximo: 256MB
- Reservado: 128MB

✅ **Healthcheck otimizado:**
- Intervalo: 10 segundos
- Timeout: 5 segundos
- Retries: 3
- Start period: 30 segundos

### Fora do Docker (Sistema Operacional)

✅ **Scripts de monitoramento:**
- `mysql-healthcheck.sh` - Monitoramento contínuo
- `check-mysql.sh` - Verificação manual

✅ **Serviço systemd:**
- `/etc/systemd/system/mysql-healthcheck.service`
- Inicia automaticamente com o sistema
- Reinicia automaticamente se falhar

✅ **Logs:**
- `/var/log/mysql-healthcheck.log`

## Instalação Manual (sem o script)

Se preferir instalar manualmente:

### 1. Torne os scripts executáveis

```bash
chmod +x mysql-healthcheck.sh check-mysql.sh
```

### 2. Crie o serviço systemd

Edite o arquivo `/etc/systemd/system/mysql-healthcheck.service`:

```ini
[Unit]
Description=MySQL Healthcheck and Auto-Recovery Service
After=docker.service
Requires=docker.service
StartLimitIntervalSec=0

[Service]
Type=simple
Restart=always
RestartSec=10
User=root
WorkingDirectory=/caminho/para/balancaGFIG
ExecStart=/bin/bash /caminho/para/balancaGFIG/mysql-healthcheck.sh
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

**Importante:** Substitua `/caminho/para/balancaGFIG` pelo caminho real do seu projeto!

### 3. Habilite e inicie o serviço

```bash
sudo systemctl daemon-reload
sudo systemctl enable mysql-healthcheck.service
sudo systemctl start mysql-healthcheck.service
sudo systemctl status mysql-healthcheck.service
```

## Verificação Pós-Instalação

### Verificar containers

```bash
docker ps
```

Deve mostrar:
- `balanca_mysql` - Status: Up (healthy)
- `balanca` - Status: Up

### Verificar monitoramento

```bash
systemctl status mysql-healthcheck.service
```

Deve mostrar: `Active: active (running)`

### Verificar logs

```bash
tail -20 /var/log/mysql-healthcheck.log
```

Deve mostrar: `=== MySQL Healthcheck v2.0 iniciado ===`

### Testar aplicação web

```bash
curl http://localhost/api/sessoes
```

Deve retornar dados JSON sem erro 503.

## Comandos Úteis

### Gerenciar o serviço de monitoramento

```bash
# Ver status
sudo systemctl status mysql-healthcheck.service

# Parar monitoramento
sudo systemctl stop mysql-healthcheck.service

# Iniciar monitoramento
sudo systemctl start mysql-healthcheck.service

# Reiniciar monitoramento
sudo systemctl restart mysql-healthcheck.service

# Ver logs do systemd
sudo journalctl -u mysql-healthcheck.service -f
```

### Verificar status do sistema

```bash
# Status completo
./check-mysql.sh

# Logs do monitoramento
tail -f /var/log/mysql-healthcheck.log

# Logs do MySQL
docker logs balanca_mysql --tail 50

# Logs da aplicação
docker logs balanca --tail 50
```

### Operações com containers

```bash
# Reiniciar apenas MySQL
docker restart balanca_mysql

# Reiniciar apenas aplicação
docker restart balanca

# Reiniciar tudo
docker compose restart

# Ver uso de recursos
docker stats balanca_mysql balanca
```

## Desinstalação

Para remover o sistema de monitoramento:

```bash
# Parar e desabilitar serviço
sudo systemctl stop mysql-healthcheck.service
sudo systemctl disable mysql-healthcheck.service

# Remover serviço
sudo rm /etc/systemd/system/mysql-healthcheck.service
sudo systemctl daemon-reload

# Remover logs
sudo rm /var/log/mysql-healthcheck.log*

# Parar containers
docker compose down
```

## Troubleshooting

### MySQL não inicia

1. Verifique logs: `docker logs balanca_mysql`
2. Verifique espaço em disco: `df -h`
3. Verifique memória: `free -h`

### Monitoramento não funciona

1. Verifique serviço: `systemctl status mysql-healthcheck.service`
2. Verifique permissões: `ls -la mysql-healthcheck.sh`
3. Verifique logs: `journalctl -u mysql-healthcheck.service -n 50`

### Aplicação retorna erro 503

1. Execute: `./check-mysql.sh`
2. Reinicie aplicação: `docker restart balanca`
3. Verifique logs: `docker logs balanca --tail 50`

## Suporte

Para mais detalhes, consulte:
- `MYSQL-HEALTHCHECK-README.md` - Documentação completa do sistema
- Logs em `/var/log/mysql-healthcheck.log`
