import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const caminho = process.argv[2] ?? '/dados/.chave-api';
const chave   = randomBytes(32).toString('hex');

writeFileSync(caminho, chave, { mode: 0o600 });
console.log(`Chave gerada: ${chave}`);
console.log(`Salva em: ${caminho}`);
console.log('Guarde esta chave — será solicitada na tela de conexão.');
