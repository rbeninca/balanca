/**
 * Esquema do D1. Fica em código, e não num .sql solto, porque quem o aplica é o
 * próprio Worker (ver `garantirEsquema`): assim não existe a chance de o banco
 * publicado ficar com um esquema diferente do que o código espera — e um deploy
 * feito fora de ordem se conserta sozinho na primeira requisição.
 *
 * Tudo é `IF NOT EXISTS`: aplicar de novo não faz nada.
 */
export const ESQUEMA = [
  `CREATE TABLE IF NOT EXISTS boxes (
     serial TEXT PRIMARY KEY,
     versao TEXT NOT NULL,
     version_code INTEGER,
     modelo TEXT,
     placa TEXT,
     ip TEXT,
     root INTEGER,
     -- Momento em que o APK foi instalado, segundo o próprio Android
     -- (PackageInfo.lastUpdateTime). É a resposta para "quando atualizou".
     instalado_em INTEGER,
     -- Zero nas duas colunas quer dizer "nunca bateu": é o estado de um box que
     -- alguém cadastrou à mão no painel e que ainda não apareceu. Não dá para
     -- usar NULL porque as colunas nasceram NOT NULL, e trocar isso exigiria
     -- reconstruir a tabela — que é justamente o que o 'IF NOT EXISTS' evita.
     primeira_batida_em INTEGER NOT NULL,
     ultima_batida_em INTEGER NOT NULL,
     -- Ficha do inventário: o que o box não sabe dizer de si. Ver FICHA.
     local TEXT,
     responsavel TEXT,
     finalidade TEXT
   )`,

  // Histórico: permite ver quando um box trocou de versão, e serve de
  // estimativa de "atualizou em" para quem instalou antes de o painel existir.
  `CREATE TABLE IF NOT EXISTS batidas (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     serial TEXT NOT NULL,
     versao TEXT NOT NULL,
     version_code INTEGER,
     ip TEXT,
     em INTEGER NOT NULL
   )`,

  `CREATE INDEX IF NOT EXISTS idx_batidas_serial_versao ON batidas(serial, versao, em)`,

  // Configuração do painel: hoje só `alvo`, a versão-teto que os boxes leem.
  `CREATE TABLE IF NOT EXISTS config (
     chave TEXT PRIMARY KEY,
     valor TEXT
   )`,
];

/**
 * Colunas que a tabela `boxes` ganhou depois de já estar em produção, na ordem
 * em que foram acrescentadas.
 *
 * `CREATE TABLE IF NOT EXISTS` não muda tabela que já existe, então um banco
 * criado antes desta lista ficaria sem as colunas e o `SELECT` do painel
 * quebraria. O `ADD COLUMN` de cada uma é aplicado por `garantirEsquema`, e um
 * `ADD COLUMN` repetido é recusado pelo SQLite — é assim, sem `PRAGMA` e sem
 * tabela de versão, que a migração se reconhece como já feita.
 */
export const COLUNAS_NOVAS = ['local TEXT', 'responsavel TEXT', 'finalidade TEXT'];
