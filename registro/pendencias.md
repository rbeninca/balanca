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

- **`.105` e `.112` ainda vão fazer a cadeia longa uma vez.** A 2.8.2 saltou
  direto para a última versão, mas quem calcula o plano é o app instalado no
  box — um aparelho na 2.7.3 vai montar os oito degraus e baixar ~750 MB. Como
  resolver, em ordem de preferência:
  1. instalar a 2.8.2 neles direto (`adb install -r` do APK de release, ou
     baixar do GitHub) — um minuto cada, não mexe em nada público;
  2. marcar as releases de 2.7.4 a 2.8.1 como **pré-lançamento** no GitHub: o
     app filtra `prerelease` da lista (`Release.analisarLista`), então os boxes
     antigos passariam a ver só a 2.8.2 e pularam sozinhos. Reversível e não
     apaga nada, mas rotula como pré-lançamento o que foi lançamento.

- **Push das tags novas**: `v2.4.0` (além das listadas acima).

- **Ruído nos testes do WebSerial.** `FonteWebSerial.teste.ts` emite uma
  "unhandled rejection" no mock do laço de leitura (pré-existente; os testes
  passam). Limpar quando sobrar tempo.

- **Verificar com um celular no hotspot** (com e sem cabo) que o WiFi fica
  como rede padrão e o WebSocket conecta — a correção do redirect :80 foi
  validada pela LAN e por testes, mas não com um celular real.

## Resolvidas nesta rodada

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

- Instalação do APK (~20 MB) leva menos de um minuto pela rede. Até a 2.7.9
  eram ~132 MB: o GeckoView embutido era 108 MB disso.
- O IP do box muda conforme a rede (LAN por DHCP vs. hotspot `192.168.43.1`).
