CREATE TABLE IF NOT EXISTS sessoes (
  id                TEXT    PRIMARY KEY,
  nome              TEXT    NOT NULL,
  id_motor          TEXT,
  criado_em         TEXT    NOT NULL DEFAULT (datetime('now')),
  duracao_ms        INTEGER NOT NULL DEFAULT 0,
  forca_maxima_n    REAL    NOT NULL DEFAULT 0,
  impulso_total_ns  REAL    NOT NULL DEFAULT 0,
  observacoes       TEXT,
  -- resumo para a listagem (ver resumoSessao.ts): NULL = ainda não calculado
  total_leituras       INTEGER,
  forca_media_queima_n REAL,
  impulso_queima_ns    REAL,
  -- configuração vigente ao iniciar a gravação (JSON), para reprodutibilidade
  config_pipeline      TEXT,
  config_esp           TEXT,
  -- célula de carga vigente ao iniciar a gravação (snapshot do registro de calibração)
  massa_calibracao_g   REAL,
  descricao_celula     TEXT,
  capacidade_celula_g  REAL
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

-- Última calibração da célula de carga (registro singleton; id fixo = 1).
-- Alimentado pelo assistente de calibração e pelo card em Configurações;
-- fotografado nas colunas de sessoes ao iniciar uma gravação.
CREATE TABLE IF NOT EXISTS calibracao (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  massa_referencia_g REAL,
  descricao_celula   TEXT,
  capacidade_max_g   REAL,
  gravidade          REAL,
  atualizada_em      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS metadados_sessao (
  id_sessao          TEXT    PRIMARY KEY REFERENCES sessoes(id) ON DELETE CASCADE,
  massa_propelente_g REAL,
  massa_total_g      REAL,
  diametro_mm        REAL,
  comprimento_mm     REAL,
  fabricante         TEXT,
  descricao          TEXT,
  observacoes        TEXT,
  -- remoção de deriva escolhida na análise ('nenhum' | 'media' | 'linear'); não altera as leituras gravadas
  detrend            TEXT
);

