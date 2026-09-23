# Pendências

## Abertas

- **A atualização dos boxes no local é `adb install -r` direto.** Não há caminho
  à distância: o botão do painel depende de o box alcançar o GitHub, e lá quem
  instala é alguém com um notebook. Antes de sair, com internet, levar o APK:

  ```bash
  gh release download v2.8.5 -R rbeninca/balanca -p balancagfig-2.8.5.apk
  ```

  Lá, com `adb connect <ip>:5555` feito, um `adb -s <ip>:5555 install -r
  balancagfig-2.8.5.apk` por box. **O APK da release serve em qualquer um
  deles**, inclusive nos que foram instalados pelo `box.sh`: `debug` e `release`
  são assinados com a mesma chave (`bc7d4ae8…`), então é um `install -r` comum —
  sem `desfazer` e sem apagar as sessões gravadas. Quem levar o repositório no
  notebook pode trocar por `bash scripts/box.sh instalar <ip>`, que compila,
  instala, faz os passos de `su` (pré-aprovar o root, `WRITE_SETTINGS`,
  permissão USB) e confere hotspot, serial e frontend.

  O que essa ida resolve: o **`.17`** sai da 2.8.4, o **`.105`** e o **`.112`**
  saem da 2.7.3 (17 MB, um minuto cada, em vez dos 12 downloads da cadeia), e o
  **`.118`** sai da 2.8.2 — esse é o que **só** sai assim: com o root quebrado,
  o app não instala nem se alguém apertar o botão.

- **O `.118` ainda pode estar preso na 2.8.2.** A 2.8.2 chamou
  `Process.waitFor(long, TimeUnit)` (API 26) e os boxes são API 25 (Android
  7.1.2): o `NoSuchMethodError` foi engolido pelo `catch (Throwable)` do `Root`,
  que passou a responder "não" a *todo* comando. Como quem instala a atualização
  é o próprio app, via `su`, um box na 2.8.2 **não sai de lá sozinho** — nem
  para instalar a versão que conserta. O caso inteiro está em
  `log-modificacoes.md` (v2.8.5).
  - O **`.16`** estava nesse estado e foi **resgatado em 22/09/2026**
    (`cd android && bash scripts/box.sh instalar 192.168.1.16`): está na 2.8.5,
    com hotspot, serial a 4 Hz e frontend conferidos pelo script.
  - Falta o **`.118`** = `GFIG-TX9-58EB81E36158`: 2.8.2 pela tabela, não
    respondeu em 22/09/2026 (nem ping). **Não dá mais para resgatar daqui** — os
    boxes saíram da rede local em 22/09/2026 (ver `inventario.md`): precisa de
    alguém no local, com um notebook na rede de lá. Lá, o mesmo comando —
    o `adb install -r` do script não usa root *no box*, que é justamente o que
    funciona em quem está preso. Os passos de `su` dele vão por `adb shell su`, e
    não pelo `Root` do app: no `.16` eles aplicaram numa passada só (root
    pré-aprovado, `WRITE_SETTINGS`, permissão USB), ao contrário do que esta
    pendência supunha.

- **`.105` e `.112` seguem na 2.7.3** (desligados desde antes da conferência de
  22/09, e fora da rede local desde então). Duas saídas, em ordem de preferência:
  1. instalar a 2.8.5 à mão nos dois numa ida ao local
     (`bash scripts/box.sh instalar <ip>`, ~17 MB, um minuto cada) em vez de
     deixar a cadeia andar;
  2. deixar que andem sozinhos — já é seguro desde 22/09/2026 (ver o item
     abaixo), mas são **12 degraus**, e seis desses APKs são da era do GeckoView,
     ~120 MB cada.

- **A cadeia de quem está antes da 2.8.2 não passa mais por ela.** As releases
  **2.8.2 e 2.8.4** ficaram como **pré-lançamento** no GitHub em 22/09/2026 (a
  2.8.3 não existe: nem tag nem release — conferido). O app filtra `prerelease`
  desde o primeiro atualizador (`Release.analisarLista`, conferido na tag
  `v2.7.3`), então a cadeia de um box na 2.7.3 pula as duas e segue para a 2.8.5.
  Reversível (`gh release edit vX.Y.Z --prerelease=false`) e o rótulo é honesto:
  as duas são quebradas, e a 2.8.4 está no ar **sem `manifest.json`** — um
  cliente até a 2.8.4 que a pegasse instalaria **sem conferência nenhuma**.
  Clientes da 2.8.5 em diante não dependem da flag: o portão de estabilidade
  recusa release sem `estavel`.

- **Boxes com a chave antiga.** Só o `.105` foi reinstalado com a chave fixa;
  os demais precisam de `./gradlew :app:instalarNoTx9` uma vez (uid muda).

- **Ruído nos testes do WebSerial.** `FonteWebSerial.teste.ts` emite uma
  "unhandled rejection" no mock do laço de leitura (pré-existente; os testes
  passam). Limpar quando sobrar tempo.

- **Verificar com um celular no hotspot** (com e sem cabo) que o WiFi fica
  como rede padrão e o WebSocket conecta — a correção do redirect :80 foi
  validada pela LAN e por testes, mas não com um celular real.

## Resolvidas nesta rodada

- **A 2.8.5 no ar, pelo caminho normal.** Tag `v2.8.5` → CI (testes, lint e APK
  assinado) → release publicada pelo `github-actions[bot]`, sem nada criado à
  mão. Conferido depois, baixando os assets: `estavel: true` e versionCode 23 no
  manifest, sha256 e tamanho batendo com o APK, e o APK com a mesma chave dos
  boxes (`bc7d4ae8…`) e sem o `waitFor(long, TimeUnit)` no dex. O `.16`, que
  estava preso, foi resgatado por ADB no mesmo dia e está nela.
- **Root "indisponível" nos boxes, e o cache de 30 s que escondia isso.** A
  causa não era o `su` nem a reenumeração USB: era o `Root` quebrado desde a
  2.8.2 (`waitFor` da API 26). O cache de `Root.disponivel()` saiu junto — ele
  guardava a resposta falsa por 30 s. Conferido no runtime do `.16`, com um dex
  rodado por `app_process` que chama o `Root` **do APK instalado**: `disponivel()`
  e `executar("id")` devolvem `true` (`uid=0(root)`), `executarLendo` devolve saída
  de verdade e `executar("false")` devolve `false`. Ver `log-modificacoes.md`
  (v2.8.5).
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
