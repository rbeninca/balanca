# 🚀 GFIG - Balança de Teste Estático (Versão 2.0)

**Projeto de Foguetes de Modelismo Experimental - Campus Gaspar - IFC**

Este documento resume as principais funcionalidades e melhorias implementadas na interface web (HTML/JavaScript) da Balança de Teste Estático GFIG.

---

## ✨ Funcionalidades de Análise e Exportação

| Funcionalidade | Descrição |
| :--- | :--- |
| **Importação de Testes Externos** | Permite importar arquivos de log de empuxo externos (formato *tempo [s] força [N]*) diretamente para o `localStorage`, para análise na UI. |
| **Exportação para OpenRocket (.ENG)** | Exporta a curva de empuxo no formato `.ENG` (Tempo/Força), compatível com simuladores como OpenRocket e RASAero. |
| **Metadados por Sessão** | Metadados do motor (Nome, Diâmetro, Pesos, Fabricante) são salvos individualmente com cada sessão, permitindo a edição e exportação correta do `.ENG`. |
| **Edição de Metadados** | Botão **🛠️ Edit Meta** nas gravações para carregar, alterar e salvar os metadados do motor no `localStorage`. |
| **Cálculo de Impulso** | Cálculo robusto do Impulso Total (N⋅s) por método trapezoidal, incluindo: Impulso Positivo, Impulso Líquido e classificação automática do motor (classes A a O). |
| **Relatórios em PDF** | Geração de relatórios de propulsão via impressão do navegador, incluindo gráficos em alta definição e tabela de dados. |

---

## 🛠️ Melhorias de Usabilidade e Diagnóstico

| Melhoria | Detalhe |
| :--- | :--- |
| **Status de Conexão** | Fundo da página fica vermelho claro e o indicador pulsa em caso de desconexão, com opacidade reduzida do conteúdo para alertar. |
| **Alertas Sonoros** | Feedback audível (beeps) para eventos como conexão/desconexão e problemas de estabilidade. |
| **Diagnóstico de Estabilidade** | Banner de alerta aparece após falhas de estabilização, indicando a necessidade de ajustar a **Tolerância de Estabilidade**. |
| **Filtro Anti-Noising** | Sistema de filtro baseado em desvio padrão (σ) para eliminar ruído da balança. |
| **Gráfico Otimizado** | Correção do layout para garantir a visibilidade dos *labels* do eixo X e melhor performance. |
| **Timestamp Real** | A primeira coluna da tabela de dados agora registra o **Timestamp** real (`DD/MM/AAAA HH:MM:SS`), mantendo o Tempo ESP separado. |
| **Acesso mDNS** | Acesso simplificado ao dispositivo usando `http://gfig.local`. |
| **Atalhos de Teclado** | Atalhos como **`Shift`+`T`** (Tara), **`Shift`+`C`** (Calibrar) e **`P`** (Pausar/Retomar gráfico). |

---

## ⚙️ Estrutura de Arquivos

| Arquivo | Conteúdo Principal |
| :--- | :--- |
| `index.html` | UI (HTML/CSS), entradas de metadados, e estrutura de abas. |
| `script.js` | Lógica da UI, conexão, comandos, metadados (Edição/Salvar) e funções de base. |
| `script_grafico_sessao.js` | Cálculos de Propulsão (Impulso, Classe), lógica de Importação de logs, e exportação `.ENG`. |
| `funcoespdf.js` | Funções para geração de relatórios de análise com gráficos detalhados. |
| `dataWorker.js` | Web Worker para processamento em background, WebSocket e cálculo de EMA/RPS. |

---

## 👥 Suporte

Para dúvidas sobre implementação ou uso:

1.  Verificar o código comentado (principalmente em `script.js` e `script_grafico_sessao.js`).
2.  Contatar a equipe GFIG - Campus Gaspar.

**Versão**: 2.0 (Outubro 2024) | **Licença**: Uso Educacional - Projeto GFIG