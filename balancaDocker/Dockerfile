# Imagem multi-arquitetura (amd64, arm64, arm/v7) – funciona em TV box ARM
FROM python:3.11-slim

# Instalações básicas
RUN apt-get update && apt-get install -y --no-install-recommends \
    git ca-certificates tzdata \
    && rm -rf /var/lib/apt/lists/*

# Diretório da aplicação
WORKDIR /app

# Requisitos Python
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copiamos o servidor Python fornecido
# Ele serve arquivos estáticos a partir de ./data (configurável por env)
COPY entrypoint.sh /app/entrypoint.sh
COPY server.py /app/server.py

# Permissões
RUN chmod +x /app/entrypoint.sh

# Porta HTTP e WS (informativas)
EXPOSE 8080 81

# Entrypoint que clona/atualiza o repo em /app/data e inicia o server
ENTRYPOINT ["/app/entrypoint.sh"]
