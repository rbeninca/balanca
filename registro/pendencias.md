# Pendências

## Abertas

- **Boxes presos na 2.8.2: root quebrado, atualização travada.** A 2.8.2 chamou
  `Process.waitFor(long, TimeUnit)` (API 26) e os boxes são API 25 (Android
  7.1.2): o `NoSuchMethodError` foi engolido pelo `catch (Throwable)` do `Root`,
  que passou a responder "não" a *todo* comando. Como quem instala a atualização
  é o próprio app, via `su`, um box na 2.8.2 **não sai de lá sozinho** — nem
  para instalar a versão que conserta. O caso inteiro está em
  `log-modificacoes.md` (v2.8.5).
  - A correção é a **2.8.5**. Cada box preso precisa de **uma instalação por
    ADB**: `cd android && bash scripts/box.sh instalar <ip>`. O `adb install -r`
    do script não usa root no box — é justamente o que funciona em quem está
    preso.
  - Presos, conferido em 22/09/2026: **`.16`** = `GFIG-TX9-58EB81E3618A`
    (versionCode 20, 2.8.2) e **`.118`** = `GFIG-TX9-58EB81E36158` (2.8.2 pela
    tabela; estava fora do ar na conferência).
  - Na mesma passada, os passos do script que dependem de `su` — pré-aprovar o
    root, `WRITE_SETTINGS`, permissão USB — falham calados, porque o root do box
    ainda está quebrado quando eles rodam. Rodar `instalar` uma segunda vez
    depois da 2.8.5, com o root de volta, aplica o resto.

- **`.105` e `.112` não podem andar sozinhos pela cadeia — ela passa pela 2.8.2.**
  Os dois estão na 2.7.3, e quem monta o plano de atualização é o app
  *instalado* neles, que ainda é o planejador antigo (um degrau por vez). A
  cadeia até a 2.8.5 inclui a 2.8.2 — um box que andar sozinho chega nela e
  **para ali**, como o `.16`. Saída, em ordem de preferência:
  1. instalar a 2.8.5 à mão nos dois (`bash scripts/box.sh instalar <ip>`,
     ~17 MB, um minuto cada) em vez de esperar a cadeia;
  2. se algum estiver fora do alcance do ADB, marcar as releases **2.8.2 e
     2.8.4** como pré-lançamento no GitHub: o app filtra `prerelease`
     (`Release.analisarLista`) e a cadeia pula direto para a 2.8.5. Reversível e
     não apaga nada, mas rotula como pré-lançamento o que foi lançamento — e as
     versões 2.7.4 a 2.8.1 continuam na cadeia, ~120 MB cada (eram da era do
     GeckoView). A 2.8.3 não entra na lista porque não existe: nem tag nem
     release (conferido em 22/09/2026).
     Vale mais do que parece: a release da 2.8.4 está **quebrada** (tem os
     `waitFor` da API 26) e **sem `manifest.json`** — um cliente até a 2.8.4 que
     a pegasse como degrau a instalaria **sem conferência nenhuma** e pararia
     ali. A 2.8.2 idem. Um cliente da 2.8.5 em diante já pula as duas sozinho (o
     portão de estabilidade recusa release sem `estavel`), mas não é o caso
     destes dois boxes, que estão na 2.7.3.

- **Boxes com a chave antiga.** Só o `.105` foi reinstalado com a chave fixa;
  os demais precisam de `./gradlew :app:instalarNoTx9` uma vez (uid muda).

- **Ruído nos testes do WebSerial.** `FonteWebSerial.teste.ts` emite uma
  "unhandled rejection" no mock do laço de leitura (pré-existente; os testes
  passam). Limpar quando sobrar tempo.

- **Verificar com um celular no hotspot** (com e sem cabo) que o WiFi fica
  como rede padrão e o WebSocket conecta — a correção do redirect :80 foi
  validada pela LAN e por testes, mas não com um celular real.

## Resolvidas nesta rodada

- **Root "indisponível" nos boxes, e o cache de 30 s que escondia isso.** A
  causa não era o `su` nem a reenumeração USB: era o `Root` quebrado desde a
  2.8.2 (`waitFor` da API 26). O cache de `Root.disponivel()` saiu junto — ele
  guardava a resposta falsa por 30 s. Conferido no runtime do box, com um dex
  rodado por `app_process`. Ver `log-modificacoes.md` (v2.8.5).
- **Push.** `main` e todas as tags até a `v2.8.4` estão no `origin` — conferido
  em 22/09/2026 (`git ls-remote`), com `main` local igualzinho ao remoto.
- **Secrets do CI.** O `release.yml` tem credencial e chave de assinatura: o run
  da v2.8.4 passou por "Restaurar a chave de assinatura", "Compilar APK
  assinado" e "Montar artefatos" — só falhou em "Publicar a release", porque
  alguém já havia criado a release v2.8.4 à mão enquanto o CI compilava. O
  backup do keystore continua sendo devido (ver "Notas de operação").
- **ESP parando de enviar dados após ~15 min** — watchdog de inatividade. O app
  reconecta automaticamente se a ESP não enviar nada por 15 segundos; o log registra
  `"inatividade detectada"` quando dispara. Antes era preciso reiniciar o app
  manualmente.
- **APK de 122 MB para 20 MB**: o GeckoView saiu. A aba Balança abre o painel
  no Chrome do box (Custom Tab), que já o renderiza sem ajuste. De quebra
  resolveu o GeckoView reconectando o `127.0.0.1` no WebSocket, e o "voltar" na
  TV deixou de ser consumido pela engine embutida.
- Instalação em box novo testada (TX9 `.103`): `instalarNoTx9` em 2 min 12 s
  sem toque na TV; `desfazerNoTx9` devolve o estado original (conferido).
  Boxes com a chave antiga: `desfazerNoTx9` antes.
- "Portal cativo" no hotspot e WebSocket que não conectava pelo celular —
  redirect :80 restrito aos IPs do box + probes respondidos sem upstream.
- Reorganização dos filtros em 3 etapas — 12 fases mergeadas em `main` (v2.4.0).
- Firmware V18 (marcas de tempo sem quantização, display sem gaps) — gravado.
- Tag `v2.3.0` e `versionName 2.3.0` alinhados; log em `log-modificacoes.md`.
- Lista de sessões lenta (dezenas de segundos) — resumo gravado no banco.
- Cada cliente gravava por conta própria — gravação compartilhada no gateway.
- Gráfico parado após perder WiFi — watchdog + reconexão.
- Atualização do app sem git/PC — GitHub Releases + atualizador no app.

- "Failed to fetch" na importação de JSON — corrigido (`2c699b4`).
- Frontend acessível sem `:8080` (porta 80) — implantado e verificado
  (`ddc1c54`).
- Auto-abrir a Balança com a célula conectada — implantado (`ceec260`).

## Notas de operação

- Instalação do APK (~17 MB) leva menos de um minuto pela rede. Até a 2.7.9
  eram ~132 MB: o GeckoView embutido era 108 MB disso.
- O IP do box muda conforme a rede (LAN por DHCP vs. hotspot `192.168.43.1`).
- **O keystore é a peça mais insubstituível do projeto.** Os boxes só aceitam
  `pm install -r` de um APK assinado com a *mesma* chave; perdida a chave, cada
  box precisa ser reinstalado à mão, com `desfazer` antes (o que apaga as
  sessões gravadas nele). Está em `android/chaves/` e nos secrets do CI —
  guardar uma cópia fora da máquina.
- **Release não se cria à mão.** A v2.8.4 foi criada à mão enquanto o CI
  compilava a mesma tag, e o CI quebrou atrás
  (`a release with the same tag name already exists: v2.8.4`): o parque ficou
  com dois APKs diferentes respondendo por "2.8.4". O caminho é tag → CI, e só.
