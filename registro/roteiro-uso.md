# Roteiro de uso — bancada com TVBox

Para quem vai **operar a balança**, não para quem mexe no box. Do zero até a
primeira leitura na tela do celular.

---

## Antes de começar

Você precisa de três coisas na bancada:

- a **TVBox** ligada numa TV (é ela que serve a página);
- o **ESP8266 com o HX711 e a célula de carga** já montados;
- um **celular** com navegador (Chrome, Edge ou Safari).

> **A rede do box não tem internet.** É uma rede local só para falar com a
> TVBox. Isso é normal e esperado — por isso o passo 3 abaixo.

---

## Passo a passo

### 1. Ligar a TVBox

Ligue a TVBox na tomada e espere. A TV vai mostrar o painel do **BalançaGFIG**.

Espere a tela aparecer de fato. Se você tentar conectar no celular antes de o
painel subir, a rede ainda não vai existir.

### 2. Conectar o ESP

Ligue o **ESP8266 (com o HX711 e a célula de carga)** numa das portas **USB** da
TVBox, com o cabo USB. É por esse cabo que a leitura da célula de carga chega até
a TVBox.

### 3. Desligar os dados móveis do celular

Desligue a **rede móvel (4G/5G)** do celular.

Isso não é frescura: com os dados móveis ligados, o celular tende a mandar o
tráfego pela operadora em vez de pela rede do box, e a página simplesmente não
abre. A rede do box não tem internet — quem tenta sair por ela não chega a lugar
nenhum.

### 4. Conectar na rede do box

No celular, abra as configurações de Wi-Fi e procure a rede que começa com
**`balancaGFIG-`**.

O nome termina com 4 caracteres que mudam de box para box — por exemplo
`balancaGFIG-618C`, `balancaGFIG-10E7` ou `balancaGFIG-10D4`. **Se houver mais de
um box no laboratório, confira qual é o seu** antes de conectar.

Senha:

```
12345678
```

### 5. Abrir a página

No navegador do celular, digite:

```
192.168.43.1
```

Esse é o endereço da TVBox dentro da rede que você acabou de conectar. A página
do **BalançaGFIG** deve abrir.

### 6. Conectar a página ao box

Na tela **Conexão**:

1. Escolha o modo **TVBox / Gateway** (é o Cenário A; o outro card é o WebSerial,
   que serve só quando o ESP está ligado direto no computador).
2. No campo **Endereço IP**, o próprio endereço `192.168.43.1` costuma já aparecer
   sugerido — ele testa sozinho se o box responde.
3. Toque em **Conectar**.

Quando der certo, aparece **"Conectado ao gateway"**.

### 7. Conferir se a balança está viva

Vá para **Medição**. No rodapé do cartão aparece:

- **`Serial conectado`** com uma taxa em **Hz** — é a balança enviando.
- **`Repouso`** ou **`Em queima`** — o estado que o app detecta.

Se aparecer **`Serial conectado` mas com 0 Hz**, atenção: a porta abriu, mas o
ESP não está mandando leitura. Normalmente é cabo mal encaixado, ESP sem
alimentação, ou firmware não gravado. Não é problema do celular.

### 8. Tarar antes de medir

Com a bancada **sem carga**, toque em **Tarar**. Isso zera a leitura.

Só depois disso comece o ensaio.

---

## Durante o ensaio

Os controles ficam na tela **Medição**:

| Botão | O que faz |
|---|---|
| **Pausar** | Congela o gráfico na tela. Não para a gravação nem perde dado. |
| **Limpar** | Limpa o gráfico e zera o impulso mostrado. |
| **Tarar** | Zera a leitura atual (só com a bancada descarregada). |
| **Iniciar** | Começa a gravação da sessão. Enquanto grava, ele vira **Parar**. |

O valor grande no topo é a **força** em newtons. O gráfico abaixo mostra a curva
ao longo do tempo, e **Impulso acumulado** soma a área embaixo dela.

## Depois do ensaio

Toque em **Sessões** na barra de cima para ver o que já foi gravado. De lá dá
para abrir a análise, comparar sessões e exportar (PDF, CSV, JSON, `.eng`).

---

## Se não funcionar

| Sintoma | O que verificar |
|---|---|
| A rede `balancaGFIG-` não aparece | A TVBox ainda está subindo. Espere e procure de novo. |
| A página não abre | Os dados móveis estão desligados? Você conectou na rede certa? |
| "Conectado ao gateway" falha | Confira se digitou `192.168.43.1`. Se houver mais de um box, talvez você esteja na rede de outro. |
| `Serial conectado` com 0 Hz | Cabo USB do ESP, alimentação do ESP, firmware gravado. |
| Leitura travada em zero | Falta **Tarar** (passo 8), ou a célula está descarregada de verdade. |
| A leitura está errada em escala | A calibração precisa ser refeita — veja *Calibração* abaixo. |

## Calibração

Só é preciso quando a célula de carga é trocada ou a leitura sai fora de escala.
Na **barra de navegação de cima**, item **Calibração**:

1. **Tara** — sem carga, zereia a leitura.
2. **Massa conhecida** — informe o peso em gramas para o app calcular o fator de
   conversão.

Os valores ficam salvos na **EEPROM do ESP** e sobrevivem a desligar e religar.
Ou seja: calibra uma vez, e não precisa repetir a cada ensaio.

---

## O que **não** fazer

- **Não** reinicie a TVBox no meio de uma gravação.
- **Não** desligue o Wi-Fi do celular durante o ensaio — você perde a tela no meio
  da queima (a gravação continua no box, mas você fica sem ver).
- **Não** desconecte o ESP da USB com a bancada carregada.
