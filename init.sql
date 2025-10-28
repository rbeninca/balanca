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
