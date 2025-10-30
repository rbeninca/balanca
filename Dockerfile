# syntax=docker/dockerfile:1.7
FROM python:3.11-slim-bookworm

# Set environment variables for non-interactive apt and Python
ENV DEBIAN_FRONTEND=noninteractive \
    TZ=America/Sao_Paulo \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Update apt and install necessary system packages
# python:3.11-slim-bookworm already has python and pip
# Only install libmariadb-dev, ca-certificates, tzdata
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libmariadb-dev \
        ca-certificates \
        tzdata \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements.txt first to leverage Docker cache
COPY requirements.txt /app/requirements.txt

# Install Python dependencies
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install websockets==12.0 pyserial==3.5 PyMySQL==1.1.0 cryptography

# Copy the rest of the application code
COPY . /app

EXPOSE 80 81
CMD ["python", "/app/server.py"]