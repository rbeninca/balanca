# ⚡ MARTELO DO THOR - Modo Jogo de Força

**Versão:** 1.0  
**Branch:** marteloThor  
**Data:** 31 de Outubro de 2025  

---

## 🎮 Visão Geral

"Martelo do Thor" é um **modo jogo divertido** integrado à interface da balança que transforma medições de força em um **jogo competitivo e divertido**. É perfeito para ambientes escolares, academias ou qualquer lugar onde se queira testar força de forma lúdica!

### Características Principais

✅ **Ranking Global** - TOP 10 com emojis de medalhas  
✅ **Histórico Pessoal** - Todas as suas tentativas salvas  
✅ **Estatísticas** - Melhor, Média, Total de Testes  
✅ **Animações Épicas** - Barra de força com cores gradientes  
✅ **Efeitos Sonoros** - Som ao iniciar e finalizar  
✅ **LocalStorage** - Tudo salvo no navegador, sem MySQL  
✅ **Multi-unidades** - Compatível com N, gf e kgf  

---

## 🎯 Como Usar

### 1. Acessar o Modo

1. Abra a aplicação da balança
2. Clique na aba **"⚡ Martelo do Thor"**

### 2. Fazer um Teste

```
1. Digite seu nome (2-20 caracteres)
2. Clique no botão "🎯 APERTE AGORA!"
3. Aperte a célula de carga com FORÇA durante 5 segundos
4. Veja seu resultado e posição no ranking!
```

### 3. Visualizar Resultados

**Abas Disponíveis:**
- 🏆 **Ranking** - Ver os 10 mais fortes (com medalhas!)
- 📊 **Minhas Tentativas** - Seu histórico completo
- 📈 **Estatísticas** - Seus números (melhor, média, posição)

### 4. Limpar Dados

```
Clique em "🗑️ Limpar Tudo" para resetar completamente
(Pedirá confirmação para evitar acidentes)
```

---

## 🎨 Interface e Animações

### Elemento Principal

```
┌─────────────────────────────────────────────────┐
│         ⚡ MARTELO DO THOR ⚡                  │
│          Quem tem mais FORÇA?                   │
│                                                 │
│  ┌──────────────────────────────────────┐      │
│  │ [Digite seu nome aqui...]            │      │
│  └──────────────────────────────────────┘      │
│                                                 │
│           3500.5 N                              │
│                                                 │
│  ┌──────────────────────────────────────┐      │
│  │████████████████░░░░░░░░░░░░░░  70%   │      │
│  └──────────────────────────────────────┘      │
│                                                 │
│      [🎯 APERTE AGORA!]                       │
│      Status: Teste em andamento...             │
└─────────────────────────────────────────────────┘
```

### Cores do Gradiente

A barra de força usa cores dinâmicas:
- 🔴 **Vermelho** (0-33%) - Força baixa
- 🟡 **Amarelo** (33-66%) - Força média
- 🟢 **Verde** (66-100%) - Força alta

### Animação de Vibração

Quando a força passa de **80%** da capacidade, a barra vibra para alertar!

---

## 🏆 Sistema de Ranking

### Cores das Medalhas

```
🥇 1º Lugar  → Ouro (#ffd700)
🥈 2º Lugar  → Prata (#c0c0c0)
🥉 3º Lugar  → Bronze (#cd7f32)
#4+ →        → Cinza (#ecf0f1)
```

### Exemplo de Ranking

```
🥇 João Silva         1200 N (3 tentativas)
🥈 Maria Santos       1050 N (2 tentativas)
🥉 Pedro Costa         950 N (5 tentativas)
#4 Ana Lima            900 N (1 tentativa)
...
```

---

## 📊 Estatísticas Exibidas

Para cada jogador, o sistema calcula:

1. **Meu Melhor** - A força máxima já registrada
2. **Média** - Média de todas as tentativas
3. **Total de Testes** - Quantidade de vezes que jogou
4. **Ranking Global** - Sua posição entre todos (ex: "5º lugar")

### Exemplo

```
┌─────────────────────────────────────┐
│ Meu Melhor    │ 1200 N              │
├─────────────────────────────────────┤
│ Média         │ 950 N               │
├─────────────────────────────────────┤
│ Total Testes  │ 8                   │
├─────────────────────────────────────┤
│ Ranking       │ 1º lugar! 🏆        │
└─────────────────────────────────────┘
```

---

## 🎮 Fluxo de Jogo

### Fase 1: Entrada do Jogador

```
Entrada de Texto: Digite seu nome
↓
Validação: 2-20 caracteres
↓
Botão: 🎯 APERTE AGORA! (ativado)
```

### Fase 2: Teste (5 segundos)

```
Botão desabilitado: Não pode clicar novamente
Entrada desabilitada: Nome fica bloqueado
Display ao Vivo: Mostra força em tempo real
Contador: Exibe tempo restante (5s, 4.9s, 4.8s...)
Máximo: Rastreia o maior valor durante os 5s
```

### Fase 3: Resultado

```
Força Final: Exibida com 1 casa decimal
Mensagem: Feedback baseado no resultado
Ranking: Mostra sua posição
Delay: 3 segundos antes de resetar para novo teste
```

### Fase 4: Mensagens Motivacionais

Baseadas na força máxima:

```
< 100 N    → 😅 Precisa treinar mais!
100-500 N  → 💪 Bom esforço!
500-1000 N → 🔥 Muito bom!
1000-2000 N→ ⚡ Increível!
> 2000 N   → 🏆 LENDA VIVA!
```

---

## 💾 Armazenamento (LocalStorage)

### Estrutura de Dados

```javascript
{
  "martelo_do_thor_data": {
    "jogadores": {
      "João Silva": {
        "tentativas": [
          {
            "forca": 1200,
            "data": "31/10/2025 10:30:45",
            "timestamp": 1725107445000
          },
          ...
        ],
        "melhor": 1200,
        "media": 1100
      },
      "Maria Santos": { ... }
    },
    "tempoUltimoTeste": 1725107445000
  },
  "martelo_nome_jogador": "João Silva"
}
```

### Limite de Armazenamento

- **Navegador**: ~5-10 MB (depende do navegador)
- **Por Jogador**: ~200 bytes por tentativa
- **Capacidade**: ~25.000 tentativas antes de encher

---

## 🔧 Integração Técnica

### Arquivo Principal

**`data/martelo-do-thor.js`** (694 linhas)

### Dependências

- ✅ `script.js` - Para eventos de força e unidades
- ✅ `estilo.css` - Para styling
- ❌ MySQL - Não é necessário! Tudo é local

### Eventos Customizados

O jogo usa eventos para sincronizar com o sistema de força:

```javascript
// Evento disparado a cada leitura
document.addEventListener('forca-atualizada', (e) => {
  if (marteloEstado.testando) {
    atualizarForcaMarelo(e.detail.forcaN);
  }
});

// Evento quando unidade muda
document.addEventListener('unidade-alterada', (e) => {
  marteloEstado.unidadeAtual = e.detail.unidade;
});
```

### HTML

Nova aba adicionada ao `index.html`:

```html
<button class="tablink" onclick="abrirAba(this, 'abaMartelo')">
  ⚡ Martelo do Thor
</button>
```

---

## 🎨 Estilos Inclusos

### Gradientes

```css
/* Fundo da interface */
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);

/* Barra de força */
background: linear-gradient(90deg, #ff6b6b, #ffd93d, #6bcf7f);
```

### Animações CSS

```css
@keyframes slideIn {
  from { opacity: 0; transform: translateX(-20px); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes vibrar {
  0%, 100% { transform: scaleX(1); }
  50% { transform: scaleX(1.02); }
}
```

---

## 🔊 Efeitos Sonoros

### Ao Iniciar Teste

Som de startup:
- Frequência: 800 Hz
- Duração: 200 ms
- Volume: 0.3

### Ao Finalizar

**Força Baixa/Média:**
- Frequência: 400 Hz
- Duração: 300 ms

**Força Épica (>1000 N):**
- 3 beeps ascendentes (600, 800, 1000 Hz)
- 150 ms entre cada
- Efeito mais dramático!

---

## 🐛 Troubleshooting

### Problema: "Nada é salvo"

**Solução:**
```javascript
// Verificar localStorage
console.log(localStorage.getItem('martelo_do_thor_data'));

// Se vazio, recriar
localStorage.clear(); // e recarregar página
```

### Problema: "Nome não é aceito"

**Requisitos:**
- Mínimo: 2 caracteres
- Máximo: 20 caracteres
- Caracteres especiais: permitidos ✅

Exemplos válidos:
- ✅ "João"
- ✅ "Maria Silva"
- ✅ "João@123"
- ✅ "José_de_Amorim"

Exemplos inválidos:
- ❌ "Jo" (muito curto)
- ❌ "João Silva de Teste Muito Longo" (muito longo)

### Problema: "Som não toca"

**Verificar:**
1. Volume do navegador está ligado?
2. Página está com permissão de áudio?
3. Qual navegador está usando?

**Navegadores com som completo:**
- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+

---

## 📈 Exemplos de Uso

### Cenário 1: Academia

```
Instrutor configura um "Dia da Força"
Alunos participam durante a aula
Ranking é exibido no monitor da academia
Motivação e diversão garantidas! 💪
```

### Cenário 2: Escola / Educação Física

```
Professor leva celular/tablet com a balança
Alunos fazem o teste em pares
Competição amigável entre turmas
Aprendem sobre força de forma lúdica
```

### Cenário 3: Competição

```
Vários jogadores se alternam no mesmo dispositivo
Cada um tenta superar o recorde anterior
Ranking ao vivo atualiza em tempo real
Vencedor é coroado no final! 👑
```

---

## 🚀 Melhorias Futuras (Roadmap)

- [ ] Exportar/Importar dados como JSON
- [ ] Gráfico histórico de força ao longo do tempo
- [ ] Desafios (ex: "Atinja 1500 N")
- [ ] Leaderboard online com API
- [ ] Badges/Conquistas (ex: "Primeiro Teste")
- [ ] Modo Multiplayer em tempo real
- [ ] Temas personalizáveis
- [ ] Suporte a WebGL para gráficos 3D

---

## 📝 Notas de Desenvolvimento

### Branch

```bash
git checkout marteloThor
```

### Commit Principal

```
feat: adicionar modo jogo 'Martelo do Thor' com ranking em local storage
```

### Arquivos Modificados

```
✅ data/index.html               (nova aba abaMartelo)
✅ data/script.js                (eventos customizados)
✅ data/martelo-do-thor.js       (novo arquivo - 694 linhas)
✅ data/estilo.css               (novo styling)
```

### Testes Realizados

- ✅ Teste de força em tempo real
- ✅ Conversão de unidades (N, gf, kgf)
- ✅ Persistência em localStorage
- ✅ Ranking TOP 10
- ✅ Estatísticas por jogador
- ✅ Efeitos sonoros
- ✅ Animações CSS
- ✅ Responsividade móvel

---

## 💡 Conclusão

"Martelo do Thor" transforma a balança em um **instrumento de diversão e competição saudável**, mantendo a precisão técnica do sistema. Perfeito para:

- 🎓 Ambientes educacionais
- 💪 Academias e esportes
- 🎉 Eventos e competições
- 👨‍👩‍👧‍👦 Uso em família

**Bora testar a força?** ⚡🔨

---

**Desenvolvido com ❤️ para diversão e educação**

