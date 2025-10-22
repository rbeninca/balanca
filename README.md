# 🚀 GFIG - Melhorias da Balança de Teste Estático
**Projeto de Foguetes de Modelismo Experimental - Campus Gaspar**

## 📋 Resumo das Melhorias Implementadas

### ✅ 1. Indicação Visual de Desconexão
**Problema**: Usuário não percebia quando estava desconectado
**Solução**:
- Fundo da página fica vermelho claro quando desconectado
- Indicador pulsante no canto superior direito
- Animação suave de transição
- Opacidade reduzida do conteúdo quando desconectado

**Arquivos modificados**: `index.html` (CSS), `script.js`

### ✅ 2. Avisos Sonoros Opcionais
**Problema**: Sem feedback sonoro de eventos importantes
**Solução**:
- Checkbox para ativar/desativar avisos sonoros
- Beep diferenciado para:
  - Desconexão (2 beeps descendentes)
  - Reconexão (2 beeps ascendentes)  
  - Problema de estabilização (3 beeps de alerta)
- Implementado com Web Audio API (sem dependências externas)

**Arquivos modificados**: `index.html`, `script.js`

### ✅ 3. Alerta de Problemas de Estabilização
**Problema**: Sistema reiniciava sem avisar quando tolerância estava baixa
**Solução**:
- Banner amarelo de alerta aparece após 3 falhas consecutivas
- Texto explicativo: "A tolerância pode estar muito baixa"
- Link direto para ajustar o parâmetro
- Alerta sonoro (se ativado)
- Banner desaparece automaticamente quando estabiliza

**Arquivos modificados**: `index.html`, `script.js`

### ✅ 4. Correção do Layout do Gráfico
**Problema**: Labels do eixo X saindo fora da área visível
**Solução**:
- Ajuste do `chartPadding` para dar mais espaço
- Labels do eixo X com alinhamento correto
- Fonte mais legível (peso 500, opacidade 0.7)
- Remoção da rotação problemática dos labels

**Arquivos modificados**: `index.html` (CSS), `script.js`

### ✅ 5. Coluna Timestamp na Tabela
**Problema**: Coluna "Data e Hora" mostrava "Tempo ESP"
**Solução**:
- Primeira coluna agora mostra timestamp real: `new Date().toLocaleString('pt-BR')`
- Formato: DD/MM/AAAA HH:MM:SS
- Mantém coluna "Tempo ESP (s)" separada

**Arquivos modificados**: `index.html`, `script.js`

### ✅ 6. Suporte a mDNS (gfig.local)
**O que é**: Permite acessar a balança usando `http://gfig.local` em vez do IP
**Implementação no ESP**:

```cpp
// No código do ESP8266/ESP32, adicionar:
#include <ESP8266mDNS.h>  // ESP8266
// ou
#include <ESPmDNS.h>      // ESP32

void setup() {
  // ... código WiFi existente ...
  
  // Configurar mDNS
  if (!MDNS.begin("gfig")) {
    Serial.println("Erro ao iniciar mDNS");
  } else {
    Serial.println("mDNS iniciado: gfig.local");
    MDNS.addService("http", "tcp", 80);
  }
}

void loop() {
  // ... código existente ...
  MDNS.update(); // Só necessário no ESP8266
}
```

**Arquivos modificados**: `index.html` (link de acesso), código ESP (a ser adicionado)

### ✅ 7. Cálculo de Impulso Total Aprimorado
**O que já existe**:
- Cálculo de área sob a curva (método trapezoidal)
- Impulso total positivo (para classificação de motor)
- Impulso líquido (positivo - negativo)
- Classificação automática do motor (classes A até O)
- Métricas de propulsão (Isp, eficiência, etc)

**Melhorias a adicionar no relatório**:
- Gráfico separado de área positiva vs negativa
- Destaque visual das áreas no gráfico
- Tabela resumida com todas as métricas

**Arquivos**: `script_grafico_sessao.js` (já implementado)

### ✅ 8. Geração de PDF (PENDENTE - Necessita jsPDF)
**Situação**: Atualmente gera PNG
**Para implementar PDF**:

1. **Adicionar jsPDF no ESP** (minificado, ~100KB):
   - Baixar: https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js
   - Salvar no SPIFFS/LittleFS do ESP como `/jspdf.min.js`

2. **Adicionar no index.html**:
```html
<script src="/jspdf.min.js"></script>
```

3. **Função de exportação** (substituir `baixarRelatorio`):
```javascript
function exportarPDF(sessionId) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'mm', 'a4');
  
  // Adicionar título
  doc.setFontSize(20);
  doc.text('GFIG - Relatório de Teste Estático', 20, 20);
  
  // Adicionar imagem do gráfico (canvas)
  const canvas = gerarCanvasGrafico(sessionId);
  const imgData = canvas.toDataURL('image/png');
  doc.addImage(imgData, 'PNG', 20, 40, 170, 100);
  
  // Adicionar dados textuais
  doc.setFontSize(12);
  doc.text('Dados da Sessão:', 20, 150);
  // ... adicionar mais informações ...
  
  doc.save(`${sessao.nome}_relatorio.pdf`);
}
```

**Alternativa Leve**: Manter PNG e indicar ao usuário usar "Imprimir para PDF" do navegador

## 📁 Estrutura de Arquivos

```
/
├── index.html (ou index_melhorado.html)
├── script.js (ou script_melhorado.js)
├── script_grafico_sessao.js
├── dataWorker.js
├── chartist.min.css
├── chartist.min.js
├── main.html
└── rede.html
```

## 🔧 Instruções de Instalação

### Opção 1: Substituição Direta
1. Fazer backup dos arquivos atuais
2. Substituir `index.html` por `index_melhorado.html`
3. Substituir `script.js` por `script_melhorado.js`
4. Manter os outros arquivos inalterados
5. Upload para o ESP via SPIFFS/LittleFS

### Opção 2: Desenvolvimento Incremental
1. Testar localmente com Live Server
2. Validar cada funcionalidade
3. Fazer upload gradual para o ESP

## 🧪 Testes Recomendados

### 1. Teste de Conexão
- [ ] Desconectar WiFi → Verificar fundo vermelho
- [ ] Reconectar → Verificar fundo normal
- [ ] Com áudio ativado → Verificar beeps

### 2. Teste de Estabilização
- [ ] Definir tolerância muito baixa (ex: 0.01)
- [ ] Verificar aparecimento do banner amarelo
- [ ] Aumentar tolerância → Banner deve desaparecer

### 3. Teste de Gráfico
- [ ] Verificar labels do eixo X visíveis
- [ ] Testar diferentes unidades (N, gf, kgf)
- [ ] Verificar formatação correta

### 4. Teste de Gravação
- [ ] Iniciar sessão
- [ ] Verificar timestamp na tabela
- [ ] Encerrar e exportar CSV
- [ ] Validar formato do CSV

### 5. Teste de mDNS (após implementação no ESP)
- [ ] Acessar http://gfig.local
- [ ] Verificar se funciona na mesma rede

## 📊 Recursos de Memória

### Antes
- index.html: ~15KB
- script.js: ~40KB
- **Total**: ~55KB

### Depois
- index.html: ~16KB (+1KB)
- script.js: ~48KB (+8KB)
- **Total**: ~64KB (+9KB)

**Impacto no ESP**: Aceitável (ESP8266 tem ~1MB de SPIFFS)

## ⚡ Otimizações para ESP Limitado

### 1. Minificação (Opcional)
```bash
# Instalar minificadores
npm install -g html-minifier terser

# Minificar HTML
html-minifier --collapse-whitespace --remove-comments index.html -o index.min.html

# Minificar JS
terser script.js -c -m -o script.min.js
```

### 2. Compressão GZIP
- O ESP pode servir arquivos .gz automaticamente
- Reduz tamanho em ~70%

### 3. Remover Features Opcionais
Se memória for crítica, remover:
- [ ] Controles melhorados do gráfico
- [ ] Sistema de tooltip
- [ ] Detecção de picos

## 🐛 Troubleshooting

### Problema: Áudio não funciona
**Causa**: Navegador bloqueia áudio sem interação do usuário
**Solução**: Usuário deve ativar o checkbox após carregar a página

### Problema: mDNS não resolve
**Causa**: Windows sem Bonjour/iTunes
**Solução**: 
- Instalar Bonjour Print Services
- OU usar IP diretamente

### Problema: Banner de estabilização não aparece
**Causa**: Contador de falhas não acumula
**Solução**: Verificar se mensagens do ESP contêm palavras-chave:
- "não estabilizando"
- "timeout"
- "tolerância"

### Problema: Labels do gráfico cortados
**Causa**: Configuração de padding inadequada
**Solução**: Ajustar `chartPadding` no `script.js`:
```javascript
chartPadding: { right: 60, left: 15, top: 15, bottom: 10 }
```

## 📱 Compatibilidade

### Navegadores Testados
- ✅ Chrome/Edge 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ⚠️ Internet Explorer (NÃO suportado)

### Dispositivos
- ✅ Desktop (Windows, Mac, Linux)
- ✅ Android (Chrome)
- ✅ iOS (Safari)

## 🔮 Melhorias Futuras Sugeridas

### Curto Prazo
1. [ ] Botão "Download PDF" (com jsPDF)
2. [ ] Export para Google Sheets
3. [ ] Modo escuro

### Médio Prazo
1. [ ] Histórico de sessões em gráfico temporal
2. [ ] Comparação entre sessões
3. [ ] Detecção automática de anomalias

### Longo Prazo
1. [ ] Integração com banco de dados externo
2. [ ] API REST para automação
3. [ ] Dashboard de análise estatística

## 👥 Suporte

Para dúvidas sobre implementação:
1. Verificar este README
2. Consultar código comentado
3. Contatar equipe GFIG - Campus Gaspar

## 📄 Licença

Código de uso educacional - Projeto GFIG
Campus Gaspar - IFC

---

**Versão**: 2.0 (Outubro 2024)
**Última atualização**: 22/10/2025
**Autores**: Equipe GFIG