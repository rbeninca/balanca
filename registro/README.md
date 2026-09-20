# Registro — BalançaGFIG no TVBox TX9

Documentação operacional do app Android que roda como servidor do projeto no
TVBox TX9 (substitui os contêineres Docker do "Cenário A").

- [log-modificacoes.md](log-modificacoes.md) — o que mudou, por commit.
- [pendencias.md](pendencias.md) — o que falta / decisões em aberto.
- [comandos-tvbox.md](comandos-tvbox.md) — tudo que roda no TVBox: comando e porquê.
- [inventario.md](inventario.md) — os boxes do parque: serial, IP, MAC, hotspot.

## Endereços

- Na LAN da bancada: o box recebe IP por DHCP (ex.: `192.168.1.105`).
- Servindo o próprio hotspot `balancaGFIG`: o box é `192.168.43.1`.
- Frontend: `http://<ip>` (porta 80) · API `:3000` · WebSocket `:8765`.
- Pacote do app: `br.edu.ifsc.balancagfig` · serial CH340 @ 921600.
