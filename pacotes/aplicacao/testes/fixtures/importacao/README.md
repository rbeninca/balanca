# Fixtures de importação

Base de arquivos reais e sintéticos usados pelos testes automatizados de
importação, para pegar regressões a cada modificação no fluxo de importar
sessões (e, futuramente, restaurar bancos).

## sessoes/

Arquivos JSON aceitos pela tela de sessões. Cobertos por
`testes/nucleo/importacaoSessao.teste.ts`.

| arquivo | formato | origem |
|---|---|---|
| `v1-legado-pequena.json` | v1 legado (`dadosTabela`, 692 leituras) | teste estático real "Fernanda 2.1" |
| `v1-legado-grande.json`  | v1 legado (`dadosTabela`, 3239 leituras) | teste estático real "Fernanda 1.11" |
| `v2-nativa.json`         | v2 nativo (`versao: 2`) | sintético, com janela de queima |
| `invalido-v1-sem-nome.json` | v1 sem `nome` | edge — deve lançar erro |
| `invalido-formato-desconhecido.json` | nem v1 nem v2 | edge — deve lançar erro |

Os arquivos `v1-legado-*` são capturas reais (todos os campos de motor nulos e
sem janela de queima marcada) — justamente o caso que quebrava a geração de PDF
e expunha o erro de importação "Failed to fetch".

## Como adicionar

Copie o arquivo real para `sessoes/` com um nome descritivo, registre-o na
tabela acima e acrescente/ajuste as asserções no teste correspondente. Prefira
manter um arquivo pequeno e um grande de cada formato para cobrir volume.
