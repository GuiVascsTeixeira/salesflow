# Guia Power BI — SalesFlow

## 1. Preparar o banco
No MySQL Workbench, abra e execute `database/powerbi_views.sql` (só cria views de leitura; não altera dados).

## 2. Conectar
Power BI Desktop → **Obter dados → Banco de dados MySQL** (precisa do *MySQL Connector/NET*). Servidor `localhost`, banco `salesflow`. Importe as 6 views `vw_*`.

## 3. Power Query (Transformar dados)
1. Em cada tabela `vw_fato_*`, filtre `empresa_id` = a empresa que quer analisar (ex.: 1).
2. Em `vw_fato_vendas` e `vw_fato_itens`, deixe `status = "confirmada"` para faturamento (ou mantenha todas e use a medida abaixo).
3. Tipos: `data` → Data; `data_hora` → Data/Hora; colunas de dinheiro → Número decimal fixo.
4. Crie a tabela Calendário (Página Inicial → Nova consulta em branco → Editor avançado):
```m
let
  Inicio = #date(2026,1,1), Fim = #date(2026,12,31),
  Dias = List.Dates(Inicio, Duration.Days(Fim - Inicio) + 1, #duration(1,0,0,0)),
  T = Table.FromList(Dias, Splitter.SplitByNothing(), {"Data"}, null, ExtraValues.Error),
  Tipado = Table.TransformColumnTypes(T, {{"Data", type date}}),
  Ano = Table.AddColumn(Tipado, "Ano", each Date.Year([Data]), Int64.Type),
  Mes = Table.AddColumn(Ano, "Mês nº", each Date.Month([Data]), Int64.Type),
  Nome = Table.AddColumn(Mes, "Mês", each Text.Proper(Date.MonthName([Data], "pt-BR")), type text)
in Nome
```

## 4. Modelo (relacionamentos, 1 → *)
- `Calendario[Data]` → `vw_fato_vendas[data]` e `vw_fato_itens[data]`
- `vw_dim_clientes[cliente_id]` → `vw_fato_vendas[cliente_id]`
- `vw_dim_vendedores[usuario_id]` → `vw_fato_vendas[usuario_id]`
- `vw_dim_produtos[produto_id]` → `vw_fato_itens[produto_id]`
Marque `Calendario` como tabela de datas.

## 5. Medidas DAX
```dax
Faturamento = CALCULATE(SUM(vw_fato_vendas[total]), vw_fato_vendas[status] = "confirmada")
Vendas = CALCULATE(COUNTROWS(vw_fato_vendas), vw_fato_vendas[status] = "confirmada")
Ticket Médio = DIVIDE([Faturamento], [Vendas])
Descontos = CALCULATE(SUM(vw_fato_vendas[desconto]), vw_fato_vendas[status] = "confirmada")
Lucro Bruto = CALCULATE(SUM(vw_fato_itens[lucro_bruto]), vw_fato_itens[status] = "confirmada")
Margem % = DIVIDE([Lucro Bruto], CALCULATE(SUM(vw_fato_itens[receita]), vw_fato_itens[status] = "confirmada"))
Taxa de Cancelamento = DIVIDE(CALCULATE(COUNTROWS(vw_fato_vendas), vw_fato_vendas[status] = "cancelada"), COUNTROWS(vw_fato_vendas))
Faturamento Mês Anterior = CALCULATE([Faturamento], DATEADD(Calendario[Data], -1, MONTH))
Crescimento % = DIVIDE([Faturamento] - [Faturamento Mês Anterior], [Faturamento Mês Anterior])
Produtos Estoque Crítico = CALCULATE(COUNTROWS(vw_dim_produtos), vw_dim_produtos[ativo] = 1, FILTER(vw_dim_produtos, vw_dim_produtos[estoque_atual] <= vw_dim_produtos[estoque_minimo]))
```

## 6. Visuais sugeridos
Cartões (Faturamento, Lucro Bruto, Margem %, Ticket Médio) · Linha: Faturamento por Calendario[Data]/Mês · Rosca: faturamento por `forma_pagamento` · Barras: Top 10 `produto` por Lucro Bruto · Barras: faturamento por `categoria` · Tabela: estoque crítico · Segmentações: Mês, Vendedor, Categoria.

## 7. Conferência
Os números devem bater com a página **Relatórios** do sistema no mesmo período (o sistema usa o mesmo cálculo). Salve o `.pbix` nesta pasta (`powerbi/`).
