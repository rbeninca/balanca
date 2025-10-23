FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git ca-certificates tzdata && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY balancaDocker/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY balancaDocker/entrypoint.sh /app/entrypoint.sh
# server.py está na raiz do repo (balancaGFIG/)
COPY server.py /app/server.py

RUN chmod +x /app/entrypoint.sh

EXPOSE 80 81
ENTRYPOINT ["/app/entrypoint.sh"]
