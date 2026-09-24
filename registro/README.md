# Registro — BalançaGFIG nos TVBox

Documentação operacional do app Android que roda como servidor do projeto nos
TVBox (substitui os contêineres Docker do "Cenário A"). Hoje são cinco — três
Amlogic TX9 e dois Rockchip MXQ; ver [inventario.md](inventario.md).

- [contexto.md](contexto.md) — o projeto e cada componente, sucinto e objetivo:
  o mínimo para entender o repositório sem ler tudo. É por onde começar.
- [2026-09-01--modificacoes.md](2026-09-01--modificacoes.md) — o log do mês (ver
  "O log de modificações", abaixo).
- [comandos-tvbox.md](comandos-tvbox.md) — tudo que roda no TVBox: comando e porquê.
- [inventario.md](inventario.md) — os boxes do parque: serial, IP, MAC, hotspot.
  **É a fonte da verdade sobre eles** — é aqui, e só aqui, que se acrescenta um box.
- [gerador_etiqueta.html](gerador_etiqueta.html) — monta a folha de etiquetas
  para imprimir, lendo a tabela do inventário. Como usar: [etiquetas.md](etiquetas.md).
- [roteiro-uso.md](roteiro-uso.md) — o roteiro de uso, para quem opera a bancada.
  A versão publicada (a que as etiquetas apontam) sai de
  [`pacotes/aplicacao/public/manual/`](../pacotes/aplicacao/public/manual/index.html).

## O log de modificações

Um arquivo por mês, nomeado pelo primeiro dia (`AAAA-MM-01--modificacoes.md`).
Ordem cronológica inversa: cada versão ou tarefa traz o que mudou, o motivo e o
commit. As pendências ficam no fim do arquivo, atualizadas a cada versão —
quando algo é resolvido, desce para "Resolvidas nesta rodada".

No mês que vira, o arquivo novo nasce levando as pendências que continuam
abertas.

## Endereços

- Na LAN da bancada: o box recebe IP por DHCP (ex.: `192.168.1.105`).
- Servindo o próprio hotspot `balancaGFIG`: o box é `192.168.43.1`.
- Frontend: `http://<ip>` (porta 80) · API `:3000` · WebSocket `:8765`.
- Pacote do app: `br.edu.ifsc.balancagfig` · serial CH340 @ 921600.
