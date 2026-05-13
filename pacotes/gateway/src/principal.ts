import { createServer } from 'node:http';
import { PortaSerial }        from './PortaSerial.js';
import { ServidorWebSocket }  from './ServidorWebSocket.js';
import type { ConfiguracaoPipeline } from '@balancagfig/processamento';

const PORTA_SERIAL        = process.env['PORTA_SERIAL']        ?? '/dev/ttyUSB0';
const BAUD_SERIAL         = Number(process.env['BAUD_SERIAL']  ?? 921600);
const PORTA_WEBSOCKET     = Number(process.env['PORTA_WEBSOCKET']  ?? 8765);
const PORTA_HTTP          = Number(process.env['PORTA_HTTP']   ?? 8766);

const config: ConfiguracaoPipeline = {
  limiarZonaMortaN:  Number(process.env['LIMIAR_ZONA_MORTA']  ?? 0.5),
  janelaMediaMovel:  Number(process.env['JANELA_MEDIA_MOVEL'] ?? 5),
  fatorCalibracao:   Number(process.env['FATOR_CALIBRACAO']   ?? 1.0),
  deslocamentoTara:  Number(process.env['DESLOCAMENTO_TARA']  ?? 0),
  tempoMinFimMs:     Number(process.env['TEMPO_MIN_FIM_MS']   ?? 100),
};

const porta  = new PortaSerial({ caminho: PORTA_SERIAL, baud: BAUD_SERIAL });
const servidor = new ServidorWebSocket(porta, config, PORTA_WEBSOCKET);

porta.iniciar();

// Health-check HTTP simples + endpoints de coordenação para atualização de firmware
const http = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/saude') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status:   'ok',
      serial:   porta.estaConectado(),
      clientes: servidor.obterNumClientes(),
    }));
  } else if (req.method === 'POST' && req.url === '/pausar') {
    porta.pausar().then(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    }).catch(() => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false }));
    });
  } else if (req.method === 'POST' && req.url === '/retomar') {
    porta.retomar();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

http.listen(PORTA_HTTP, () => {
  console.log(`Gateway iniciado — serial: ${PORTA_SERIAL} ws::${PORTA_WEBSOCKET} http::${PORTA_HTTP}`);
});

// Graceful shutdown
function encerrar() {
  Promise.all([porta.fechar(), servidor.fechar()])
    .then(() => { http.close(); process.exit(0); })
    .catch(() => process.exit(1));
}

process.on('SIGTERM', encerrar);
process.on('SIGINT',  encerrar);
