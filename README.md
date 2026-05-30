# 📋 Analista Aduaneiro — Conferência Documental com IA

Sistema de conferência documental aduaneira com inteligência artificial, capaz de analisar e cruzar automaticamente Commercial Invoices, Packing Lists e Bills of Lading.

---

## 🚀 Deploy no GitHub Pages

1. Crie um repositório público no GitHub
2. Faça upload dos 3 arquivos: `index.html`, `style.css`, `app.js`
3. **Settings → Pages → Branch: main → Save**
4. Acesse o link gerado em ~2 minutos

---

## 📂 Padrão de Nomenclatura dos Arquivos

O sistema agrupa documentos pelo número de lote no nome do arquivo.

| Padrão | Tipo | Lote | Seq |
|---|---|---|---|
| `inv-1-1.pdf` | Invoice | 1 | 1 |
| `inv-1-2.pdf` | Invoice | 1 | 2 |
| `pack-1-1.pdf` | Packing List | 1 | 1 |
| `hbl-1.pdf` | Bill of Lading | 1 | — |
| `inv-2-1.pdf` | Invoice | 2 | 1 |
| `pack-2-1.pdf` | Packing List | 2 | 1 |
| `hbl-2.pdf` | Bill of Lading | 2 | — |

**Regra de cruzamento:** documentos com o mesmo número de lote são cruzados entre si.

---

## 📊 Análises Realizadas

### Invoice (sempre)
- Exportador, fabricante, importador — nome e endereço
- País de origem, aquisição, procedência
- Incoterm e local do Incoterm
- Condição de pagamento
- Frete e seguro informados
- ✅ Cálculo: `Qty × Preço Unit = Total` por item
- ✅ Soma dos itens vs valor total declarado
- ✅ Soma pesos líquidos vs total declarado
- ✅ Soma pesos brutos vs total declarado
- NCM / HS Code presente nos itens

### Invoice × Packing List
- Exportador (nome + endereço)
- Peso líquido total
- Peso bruto total

### Invoice × HBL
- Exportador (Invoice) vs Shipper (HBL)
- Peso bruto
- NCM / HS Code (4 primeiros dígitos)
- Descrição da mercadoria (cruzamento semântico)

---

## 🗂️ Relatórios

### Por Lote
- Dados extraídos da Invoice
- Tabela de itens com flag de divergência de cálculo
- Validações individuais e cruzamentos

### Relatório de Exceções
- Apenas divergências encontradas
- Campo, valor declarado, valor esperado, observação

### Relatório Completo
- Todas as validações de todos os lotes

### Export Excel
- Aba por lote: Resumo, Itens, Validações, Exceções

---

## 🔑 Chave API

Obtenha em [console.anthropic.com](https://console.anthropic.com).
Insira no campo do topo. Fica apenas na sessão do navegador (não é salva em servidor).

---

## 📁 Estrutura

```
analista-aduaneiro/
├── index.html
├── style.css
├── app.js
└── README.md
```
