# Chave de assinatura do APK

`balancagfig.keystore` assina TODOS os APKs (debug e release, local e CI). O Android só
aceita atualizar um app por cima de outro com a MESMA assinatura — perder este arquivo
significa ter que desinstalar/reinstalar cada box (e refazer `scripts/box.sh desfazer`
seguido de `scripts/box.sh instalar`).

- Este diretório é ignorado pelo git. Faça backup do keystore e do chaves.properties
  em lugar seguro (senha no chaves.properties).
- No GitHub (Settings → Secrets and variables → Actions) o workflow de release espera:
  - `KEYSTORE_BASE64`  → `base64 -w0 chaves/balancagfig.keystore`
  - `KEYSTORE_SENHA`   → storePassword do chaves.properties
  - `CHAVE_ALIAS`      → balancagfig
  - `CHAVE_SENHA`      → keyPassword do chaves.properties
  - `PAINEL_URL`       → https://balancagfig-painel.rbeninca.workers.dev
  - `PAINEL_CHAVE`     → a mesma chave do `wrangler secret put CHAVE` (pacotes/painel)

## Painel (opcional)

`painelUrl` e `painelChave` no `chaves.properties` ligam o check-in no painel
remoto (`pacotes/painel/LEIA-ME.md`): o box passa a contar de 10 em 10 minutos
qual versão está rodando, e a ler do painel até onde pode atualizar. Sem essas
duas linhas — ou num build sem `chaves.properties` — o recurso fica desligado e
o app se comporta como antes. A chave vai embutida no APK: desencoraja, não é
segredo forte.

```properties
painelUrl=https://balancagfig-painel.rbeninca.workers.dev
painelChave=...
```
