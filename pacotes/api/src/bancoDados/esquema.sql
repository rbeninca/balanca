CREATE TABLE IF NOT EXISTS sessoes (
  id                TEXT    PRIMARY KEY,
  nome              TEXT    NOT NULL,
  id_motor          TEXT,
  criado_em         TEXT    NOT NULL DEFAULT (datetime('now')),
  duracao_ms        INTEGER NOT NULL DEFAULT 0,
  forca_maxima_n    REAL    NOT NULL DEFAULT 0,
  impulso_total_ns  REAL    NOT NULL DEFAULT 0,
  observacoes       TEXT
);

CREATE TABLE IF NOT EXISTS leituras (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  id_sessao            TEXT    NOT NULL REFERENCES sessoes(id) ON DELETE CASCADE,
  marca_temporal       INTEGER NOT NULL,
  forca_crua           REAL    NOT NULL,
  temperatura          REAL,
  em_queima            INTEGER NOT NULL DEFAULT 0,
  impulso_acumulado_ns REAL    NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_leituras_sessao ON leituras(id_sessao);

CREATE TABLE IF NOT EXISTS metadados_sessao (
  id_sessao          TEXT    PRIMARY KEY REFERENCES sessoes(id) ON DELETE CASCADE,
  massa_propelente_g REAL,
  diametro_mm        REAL,
  comprimento_mm     REAL,
  fabricante         TEXT,
  descricao          TEXT,
  observacoes        TEXT
);
