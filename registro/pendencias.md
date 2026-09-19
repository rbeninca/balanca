# Pendências

## Abertas

- **Push.** `main` e as tags `v0.1.0`, `v2.0.0`, `v2.1.0`, `v2.2.0`, `v2.3.0`
  estão só locais (a sessão de trabalho não tem credencial do GitHub):
  `git push origin main v0.1.0 v2.0.0 v2.1.0 v2.2.0 v2.3.0`.

- **Secrets do CI** para o `release.yml` (ver `android/chaves/LEIA-ME.md`):
  `KEYSTORE_BASE64`, `KEYSTORE_SENHA`, `CHAVE_ALIAS`, `CHAVE_SENHA`. Sem eles a
  tag `v2.3.0` não gera release. **Backup do keystore** fora da máquina.

- **Boxes com a chave antiga.** Só o `.105` foi reinstalado com a chave fixa;
  os demais precisam de `./gradlew :app:instalarNoTx9` uma vez (uid muda).

- **GeckoView da TV reconectando.** O `127.0.0.1` entra e sai da lista de
  clientes do WebSocket a cada poucos segundos. Investigar com o log do
  gateway agora que há batimento.

- **Reorganização dos filtros em 3 etapas** — plano em
  `PLANEJAMENTO-PROCESSAMENTO.MD`, branch `feat/processamento-3-etapas`.

- **Ruído nos testes do WebSerial.** `FonteWebSerial.teste.ts` emite uma
  "unhandled rejection" no mock do laço de leitura (pré-existente; os testes
  passam). Limpar quando sobrar tempo.

## Resolvidas nesta rodada

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

- Instalação do APK (~132 MB por causa do GeckoView) demora no Wi-Fi; use
  timeout longo no `adb install`.
- O IP do box muda conforme a rede (LAN por DHCP vs. hotspot `192.168.43.1`).
