import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PORTA_HTTP          = Number(process.env['PORTA_HTTP']          ?? 8767);
const PORTA_SERIAL        = process.env['PORTA_SERIAL']               ?? '/dev/ttyUSB0';
const PORTA_GATEWAY_HTTP  = process.env['PORTA_GATEWAY_HTTP']         ?? 'http://gateway:8766';
const CAMINHO_FIRMWARE    = process.env['CAMINHO_FIRMWARE']           ?? '/firmware/balanca.bin';
const CAMINHO_VERSAO      = process.env['CAMINHO_VERSAO']             ?? '/firmware/versao.json';

let gravando = false;

async function chamarGateway(rota: string): Promise<void> {
  const url = `${PORTA_GATEWAY_HTTP}${rota}`;
  const res = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Gateway respondeu ${res.status} em ${rota}`);
}

function cabecalhosCors(res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function rotaGravar(res: ServerResponse): Promise<void> {
  if (gravando) {
    res.writeHead(409, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Gravação já em andamento\n');
    return;
  }

  gravando = true;
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Transfer-Encoding': 'chunked',
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });

  const linha = (txt: string) => { res.write(txt + '\n'); };

  try {
    linha('Pausando gateway...');
    await chamarGateway('/pausar');
    linha('Gateway pausado. Iniciando gravação...');

    await new Promise<void>((resolve, reject) => {
      const args = [
        '--port', PORTA_SERIAL,
        '--baud', '921600',
        'write_flash',
        '--flash_mode', 'dio',
        '--flash_size', 'detect',
        '0x0', CAMINHO_FIRMWARE,
      ];

      const proc = spawn('esptool.py', args, { stdio: ['ignore', 'pipe', 'pipe'] });

      proc.stdout.on('data', (d: Buffer) => {
        d.toString().split('\n').filter(Boolean).forEach(l => linha(l));
      });
      proc.stderr.on('data', (d: Buffer) => {
        d.toString().split('\n').filter(Boolean).forEach(l => linha(l));
      });

      proc.on('error', (e) => reject(new Error(`Falha ao iniciar esptool.py: ${e.message}`)));
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`esptool.py encerrou com código ${code}`));
      });
    });

    linha('Firmware gravado. Aguardando ESP reiniciar (5s)...');
    await new Promise(r => setTimeout(r, 5000));
    linha('CONCLUIDO');

  } catch (err) {
    linha(`ERRO: ${String(err)}`);
  } finally {
    gravando = false;
    try {
      linha('Retomando gateway...');
      await chamarGateway('/retomar');
      linha('Gateway retomado.');
    } catch (e) {
      linha(`Aviso: falha ao retomar gateway: ${String(e)}`);
    }
    res.end();
  }
}

const http = createServer((req: IncomingMessage, res: ServerResponse) => {
  cabecalhosCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/saude') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', gravando }));
    return;
  }

  if (req.method === 'GET' && req.url === '/firmware/versao') {
    try {
      const meta = readFileSync(CAMINHO_VERSAO, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(meta);
    } catch {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ versao: 'desconhecida' }));
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/firmware/gravar') {
    void rotaGravar(res);
    return;
  }

  res.writeHead(404);
  res.end();
});

http.listen(PORTA_HTTP, () => {
  console.log(`Atualizador iniciado — serial: ${PORTA_SERIAL}  http::${PORTA_HTTP}`);
});
