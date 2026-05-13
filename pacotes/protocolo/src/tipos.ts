// Constantes do protocolo binário (firmware Balança GFIG v2)
export const MAGIC          = 0xa1b2 as const;
export const VERSAO_PROTO   = 0x02 as const;

// Tipos de pacotes ESP32 → Host
export const TIPO_DADOS         = 0x01 as const;
export const TIPO_CONFIGURACAO  = 0x02 as const;
export const TIPO_STATUS        = 0x03 as const;

// Tipos de comandos Host → ESP32
export const CMD_TARAR          = 0x10 as const;
export const CMD_CALIBRAR       = 0x11 as const;
export const CMD_OBTER_CONFIG   = 0x12 as const;
export const CMD_DEFINIR_PARAM  = 0x13 as const;

// Códigos de status do firmware
export const STATUS_INFO    = 0x00 as const;
export const STATUS_SUCESSO = 0x01 as const;
export const STATUS_AVISO   = 0x02 as const;
export const STATUS_ERRO    = 0x03 as const;

// Códigos de mensagem
export const MSG_CMD_RECEBIDO   = 0x01 as const;
export const MSG_TARA_OK        = 0x10 as const;
export const MSG_CALIB_OK       = 0x11 as const;
export const MSG_CALIB_FALHOU   = 0x12 as const;
export const MSG_CONFIG_UPDATE  = 0x20 as const;
export const MSG_ERRO_GENERICO  = 0xf0 as const;

// IDs de parâmetros (CMD_DEFINIR_PARAM)
export const PARAM_GRAVIDADE         = 0x01 as const;
export const PARAM_FATOR_CONV        = 0x02 as const;
export const PARAM_LEIT_ESTAVEIS     = 0x03 as const;
export const PARAM_TOLERANCIA        = 0x04 as const;
export const PARAM_MODO              = 0x05 as const;
export const PARAM_USAR_EMA          = 0x06 as const;
export const PARAM_NUM_AMOSTRAS      = 0x07 as const;
export const PARAM_OFFSET_TARA       = 0x08 as const;
export const PARAM_TIMEOUT_CAL       = 0x09 as const;
export const PARAM_CAPACIDADE        = 0x0a as const;
export const PARAM_ACURACIA          = 0x0b as const;

// ─── Estruturas de pacotes ──────────────────────────────────────────────────

/**
 * Pacote de dados enviado pelo ESP32 a cada leitura (~100 Hz).
 * Tamanho: 20 bytes.
 *
 * forcaNewtons: força já calibrada pelo firmware (Newtons)
 * forcaBruta: valor bruto do ADC (HX711) — usado para recalibração no host
 */
export interface PacoteDados {
  tipo:          'DADOS';
  marcaTemporal: number;   // uint32 — ms desde boot
  forcaNewtons:  number;   // float32 — Newtons (calibrado pelo firmware)
  forcaBruta:    number;   // int32 — leitura ADC com sinal
  statusFirmware: number;  // uint8 — 0=Pesando 1=Tarar 2=Calibrar 3=Pronta
}

/**
 * Pacote de configuração enviado pelo ESP32 em resposta a CMD_OBTER_CONFIG.
 * Tamanho: 64 bytes.
 */
export interface PacoteConfiguracao {
  tipo:                'CONFIGURACAO';
  fatorConversao:       number;   // float32 — escala HX711 → gramas
  gravidade:            number;   // float32 — m/s²
  leiturasEstaveis:     number;   // uint16
  toleranciaEst:        number;   // float32
  numAmostrasMedia:     number;   // uint16
  numAmostrasCal:       number;   // uint16
  usarMediaMovel:       boolean;  // uint8
  usarEMA:              boolean;  // uint8
  timeoutCal:           number;   // uint16 — segundos
  offsetTara:           number;   // int32
  capacidadeMaxGramas:  number;   // float32
  acuracia:             number;   // float32
  modo:                 number;   // uint8
}

/**
 * Pacote de status enviado pelo ESP32 como resposta a comandos.
 * Tamanho: 14 bytes.
 */
export interface PacoteStatus {
  tipo:          'STATUS';
  tipoStatus:    number;   // uint8 — 0=info 1=sucesso 2=aviso 3=erro
  codigo:        number;   // uint8 — código específico
  valor:         number;   // uint16
  marcaTemporal: number;   // uint32 — ms
}

// Comandos enviados pelo host para o ESP32

export interface ComandoTarar {
  tipo: 'CMD_TARAR';
}

export interface ComandoCalibar {
  tipo:   'CMD_CALIBRAR';
  massaG: number;   // float32 — massa conhecida em gramas
}

export interface ComandoObterConfig {
  tipo: 'CMD_OBTER_CONFIG';
}

export interface ComandoDefinirParam {
  tipo:     'CMD_DEFINIR_PARAM';
  paramId:  number;   // uint8
  valorF:   number;   // float32
  valorI:   number;   // uint32
}

export type PacoteESP32 = PacoteDados | PacoteConfiguracao | PacoteStatus;
export type ComandoHost = ComandoTarar | ComandoCalibar | ComandoObterConfig | ComandoDefinirParam;
export type Pacote = PacoteESP32 | ComandoHost;
