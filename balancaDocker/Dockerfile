FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    git ca-certificates tzdata && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Agora apontamos para o subdir onde estão esses arquivos
COPY balancaDocker/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY balancaDocker/entrypoint.sh /app/entrypoint.sh
COPY server.py /app/server.py   # server.py está na RAIZ do repo

RUN chmod +x /app/entrypoint.sh
EXPOSE 8080 81
ENTRYPOINT ["/app/entrypoint.sh"]
