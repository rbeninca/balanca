const CLASSES_NAR = [
  { letra: '1/8A', min: 0,     max: 0.3125 },
  { letra: '1/4A', min: 0.3125, max: 0.625 },
  { letra: '1/2A', min: 0.625, max: 1.25   },
  { letra: 'A',    min: 1.25,  max: 2.50   },
  { letra: 'B',    min: 2.50,  max: 5.00   },
  { letra: 'C',    min: 5.00,  max: 10.00  },
  { letra: 'D',    min: 10.00, max: 20.00  },
  { letra: 'E',    min: 20.00, max: 40.00  },
  { letra: 'F',    min: 40.00, max: 80.00  },
  { letra: 'G',    min: 80.00, max: 160.00 },
  { letra: 'H',    min: 160.00, max: 320.00 },
  { letra: 'I',    min: 320.00, max: 640.00 },
  { letra: 'J',    min: 640.00, max: 1280.00 },
  { letra: 'K',    min: 1280.00, max: 2560.00 },
  { letra: 'L',    min: 2560.00, max: 5120.00 },
  { letra: 'M',    min: 5120.00, max: 10240.00 },
  { letra: 'N',    min: 10240.00, max: 20480.00 },
  { letra: 'O',    min: 20480.00, max: 40960.00 },
];

export interface ResultadoNAR {
  letra: string;
  nomeComum: string;
}

export function classificarNAR(impulsoNs: number, forcaMediaN: number): ResultadoNAR {
  const classe = CLASSES_NAR.find(c => impulsoNs > c.min && impulsoNs <= c.max);
  const letra = classe?.letra ?? '?';
  const forca = forcaMediaN.toFixed(1);
  return { letra, nomeComum: `${letra}${forca}` };
}
