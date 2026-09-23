# Painel dos boxes

Um Worker do Cloudflare com banco D1 (SQLite) que responde duas perguntas:

1. **Qual versão cada box está, e quando atualizou** — cada box manda uma
   batida a cada 10 min (e ~30 s depois de subir), com serial, versão,
   `versionCode`, quando o APK foi instalado segundo o próprio Android, modelo,
   placa, IPs e se tem root. Fica tudo em `/painel`, numa página que se atualiza
   sozinha.
2. **Até onde cada box pode atualizar** — uma linha de configuração (`alvo`) que
   o app lê antes de escolher a release. O app continua baixando do GitHub; o
   banco só diz qual é a versão liberada. Sem alvo, vale a mais nova estável,
   como sempre foi.

## Rotas

| Rota | Método | Proteção | O que faz |
|---|---|---|---|
| `/batida` | POST | `X-Chave` | recebe a batida do box (`{serial, versao, …}`) |
| `/alvo` | GET | pública | devolve `{"alvo": "2.8.501"}` ou `{"alvo": null}` |
| `/alvo` | POST | `X-Chave` | grava o alvo (`{"alvo": "2.8.501"}` ou `{"alvo": null}`) |
| `/boxes` | GET | `?chave=` | JSON com todos os boxes, o alvo e a hora do servidor |
| `/painel` | GET | `?chave=` | a página |
| `/` | GET | — | manda para `/painel`, levando a chave |

O `GET /alvo` é público de propósito: é o app dos boxes que o lê, e a restrição
que ele pode sofrer é a de **não** atualizar — quem souber o alvo não ganha nada
com isso. Tudo o que é escrita, e tudo o que mostra os boxes, exige chave.

## A chave

Mesma chave nos dois lados: `npx wrangler secret put CHAVE` no Worker, e
`painelChave` em `android/chaves/chaves.properties` (ou o secret `PAINEL_CHAVE`
no CI) para o app.

**Ela vai embutida no APK.** Quem tiver o APK na mão consegue extraí-la — serve
para desencorajar, não para proteger de quem tem acesso ao app. O que ela
protege de fato é o painel de olhares casuais na rede e a escrita indevida do
alvo. Para trocar a chave, publique um APK novo (o painel não precisa de nada
além do secret atualizado).

## Publicar (uma vez para criar, depois só `deploy`)

```bash
cd pacotes/painel
npx wrangler login
npx wrangler d1 create balancagfig-painel     # copie o database_id para o wrangler.toml
npx wrangler secret put CHAVE                 # a mesma dos boxes
npx wrangler deploy
```

O esquema do banco **não** precisa ser aplicado à mão: o próprio Worker o aplica
na primeira requisição de cada isolate (tudo é `CREATE TABLE IF NOT EXISTS`, ver
`src/bancoDados/esquema.ts`). Depois do primeiro `deploy`, abra
`https://balancagfig-painel.<conta>.workers.dev/painel?chave=…` e a página já
funciona.

No dia a dia: `npx wrangler deploy`. Para testar sem publicar, `npm run dev`
(usa um D1 local, dentro de `.wrangler/`).

## Como o app conversa com ele

Do lado Android (`br.edu.ifsc.balancagfig.painel`):

- `CheckIn` manda `POST /batida` com a chave. Sem URL ou sem chave configurada,
  o check-in fica desligado — e um build local, que sai sem
  `chaves.properties`, se comporta exatamente como antes desta versão existir.
- `FonteAlvoHttp` lê `GET /alvo` antes de escolher a release. Qualquer problema
  (sem rede, JSON estranho, alvo ausente) devolve `null`, que quer dizer "sem
  teto": o box volta ao comportamento de sempre em vez de travar.

A URL e a chave saem de `BuildConfig.PAINEL_URL`/`PAINEL_CHAVE`, e podem ser
sobrescritas em campo por `filesDir/painel-url.txt` e `filesDir/.chave-painel` —
o mesmo esquema do `atualizacao-url.txt` e do `.chave-api`.

## Testes

```bash
npm test --workspace=pacotes/painel          # ou: npm run testar:cobertura
```

Os testes rodam o Worker de verdade — `rotas.fetch` com um `Request` e uma
`Response` — sobre um SQLite de verdade (`better-sqlite3`, o mesmo que o pacote
`api` usa), atrás da mesma interface que o D1 expõe. O mesmo SQL que roda aqui é
o que roda em produção. O que não dá para cobrir assim é o que é do Cloudflare e
não do SQLite: limites do D1, réplicas e o binding — isso só se verifica
publicando.

## Custo

Cinco boxes batendo a cada 10 min dão ~720 escritas por dia, contra as 100 mil
do plano gratuito do D1. O banco cresce ~30 MB por ano.
