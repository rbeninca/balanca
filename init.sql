-- Arquivo de inicialização do banco de dados
-- Será executado automaticamente pelo MariaDB

CREATE TABLE IF NOT EXISTS sessoes (
    id BIGINT PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    data_inicio DATETIME NOT NULL,
    data_fim DATETIME,
    data_modificacao DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    motor_name VARCHAR(255),
    motor_diameter FLOAT,
    motor_length FLOAT,
    motor_delay FLOAT,
    motor_propweight FLOAT,
    motor_totalweight FLOAT,
    motor_manufacturer VARCHAR(255),
    motor_description TEXT,
    motor_observations TEXT
);

CREATE TABLE IF NOT EXISTS leituras (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sessao_id BIGINT NOT NULL,
    tempo FLOAT,
    forca FLOAT,
    ema FLOAT,
    massaKg FLOAT,
    timestamp DATETIME(3),
    FOREIGN KEY (sessao_id) REFERENCES sessoes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS configuracoes (
    id INT PRIMARY KEY DEFAULT 1,
    conversionFactor FLOAT DEFAULT 1.0,
    gravity FLOAT DEFAULT 9.80665,
    tareOffset INT DEFAULT 0,
    leiturasEstaveis INT DEFAULT 5,
    toleranciaEstabilidade FLOAT DEFAULT 0.05,
    mode INT DEFAULT 0,
    usarEMA INT DEFAULT 1,
    numAmostrasMedia INT DEFAULT 10,
    timeoutCalibracao INT DEFAULT 30000,
    capacidadeMaximaGramas FLOAT DEFAULT 5000.0,
    percentualAcuracia FLOAT DEFAULT 0.05,
    data_modificacao DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY single_row (id)
);

INSERT IGNORE INTO configuracoes (id) VALUES (1);

