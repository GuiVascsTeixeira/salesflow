-- =====================================================================
-- SalesFlow - Script de criação do banco de dados (MySQL 8.0.16+)
-- =====================================================================
-- ATENÇÃO: este script APAGA e recria o banco "salesflow".
-- Use apenas em desenvolvimento. Nunca rode em um banco com dados reais.
--
-- Como executar (no terminal, dentro da pasta do projeto):
--   mysql -u root -p --default-character-set=utf8mb4 < database/schema.sql
--
-- Convenções:
--   * Dinheiro:  DECIMAL(10,2)  (nunca FLOAT/DOUBLE: eles têm erro de centavos)
--   * Datas:     DATETIME gravado em UTC. A conversão para o horário de
--                Fortaleza (UTC-3) é feita na hora de exibir/agrupar.
--   * Tenant:    quase toda tabela tem empresa_id. Chaves estrangeiras
--                COMPOSTAS (id, empresa_id) impedem, no próprio banco, que
--                uma linha de uma empresa aponte para dados de outra.
--   * Nada é apagado: não usamos ON DELETE CASCADE. O padrão (RESTRICT)
--                bloqueia exclusões que quebrariam o histórico.
-- =====================================================================

DROP DATABASE IF EXISTS salesflow;
CREATE DATABASE salesflow
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;   -- ignora maiúsculas/acentos em buscas e UNIQUE
USE salesflow;

-- ---------------------------------------------------------------------
-- empresas: o "dono" de todos os dados (tenant)
-- ---------------------------------------------------------------------
CREATE TABLE empresas (
  id               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  nome             VARCHAR(120)  NOT NULL,
  cnpj             CHAR(14)      NULL,                      -- só dígitos; opcional no V1
  desconto_maximo  DECIMAL(5,2)  NOT NULL DEFAULT 10.00,    -- % máximo de desconto por venda
  criado_em        DATETIME      NOT NULL DEFAULT (UTC_TIMESTAMP()),
  PRIMARY KEY (id),
  UNIQUE KEY uq_empresas_cnpj (cnpj),
  CONSTRAINT ck_empresas_cnpj     CHECK (cnpj IS NULL OR cnpj REGEXP '^[0-9]{14}$'),
  CONSTRAINT ck_empresas_desconto CHECK (desconto_maximo BETWEEN 0 AND 100)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- usuarios: quem usa o sistema (cada um pertence a UMA empresa)
-- ---------------------------------------------------------------------
CREATE TABLE usuarios (
  id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  empresa_id  INT UNSIGNED  NOT NULL,
  nome        VARCHAR(100)  NOT NULL,
  email       VARCHAR(150)  NOT NULL,                       -- o login é pelo e-mail: único no sistema todo
  senha_hash  VARCHAR(255)  NOT NULL,                       -- hash do bcrypt, nunca a senha
  ativo       TINYINT(1)    NOT NULL DEFAULT 1,
  criado_em   DATETIME      NOT NULL DEFAULT (UTC_TIMESTAMP()),
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuarios_email (email),
  UNIQUE KEY uq_usuarios_id_empresa (id, empresa_id),       -- alvo das FKs compostas
  CONSTRAINT fk_usuarios_empresa FOREIGN KEY (empresa_id) REFERENCES empresas (id),
  CONSTRAINT ck_usuarios_ativo   CHECK (ativo IN (0, 1))
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- categorias: agrupam os produtos (cada empresa tem as suas)
-- ---------------------------------------------------------------------
CREATE TABLE categorias (
  id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  empresa_id  INT UNSIGNED  NOT NULL,
  nome        VARCHAR(60)   NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categorias_empresa_nome (empresa_id, nome),
  UNIQUE KEY uq_categorias_id_empresa (id, empresa_id),
  CONSTRAINT fk_categorias_empresa FOREIGN KEY (empresa_id) REFERENCES empresas (id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- produtos: catálogo + saldo atual de estoque
-- estoque_atual é o saldo "rápido" usado nas vendas; o histórico completo
-- fica em movimentacoes_estoque (as duas sempre mudam na mesma transação).
-- ---------------------------------------------------------------------
CREATE TABLE produtos (
  id             INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  empresa_id     INT UNSIGNED  NOT NULL,
  categoria_id   INT UNSIGNED  NOT NULL,
  nome           VARCHAR(120)  NOT NULL,
  descricao      VARCHAR(500)  NULL,
  sku            VARCHAR(40)   NOT NULL,
  preco_venda    DECIMAL(10,2) NOT NULL,
  custo          DECIMAL(10,2) NOT NULL,
  estoque_atual  INT           NOT NULL DEFAULT 0,
  estoque_minimo INT           NOT NULL DEFAULT 0,
  ativo          TINYINT(1)    NOT NULL DEFAULT 1,
  criado_em      DATETIME      NOT NULL DEFAULT (UTC_TIMESTAMP()),
  PRIMARY KEY (id),
  UNIQUE KEY uq_produtos_empresa_sku (empresa_id, sku),
  UNIQUE KEY uq_produtos_id_empresa (id, empresa_id),
  KEY idx_produtos_empresa_nome (empresa_id, nome),
  KEY idx_produtos_empresa_ativo (empresa_id, ativo),
  CONSTRAINT fk_produtos_empresa   FOREIGN KEY (empresa_id) REFERENCES empresas (id),
  CONSTRAINT fk_produtos_categoria FOREIGN KEY (categoria_id, empresa_id)
                                   REFERENCES categorias (id, empresa_id),
  CONSTRAINT ck_produtos_preco     CHECK (preco_venda >= 0),
  CONSTRAINT ck_produtos_custo     CHECK (custo >= 0),
  CONSTRAINT ck_produtos_estoque   CHECK (estoque_atual >= 0),      -- última barreira contra estoque negativo
  CONSTRAINT ck_produtos_minimo    CHECK (estoque_minimo >= 0),
  CONSTRAINT ck_produtos_ativo     CHECK (ativo IN (0, 1))
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- clientes: dados mínimos (sem CPF, de propósito)
-- ---------------------------------------------------------------------
CREATE TABLE clientes (
  id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  empresa_id  INT UNSIGNED  NOT NULL,
  nome        VARCHAR(120)  NOT NULL,
  email       VARCHAR(150)  NULL,
  telefone    VARCHAR(20)   NULL,
  ativo       TINYINT(1)    NOT NULL DEFAULT 1,
  criado_em   DATETIME      NOT NULL DEFAULT (UTC_TIMESTAMP()),
  PRIMARY KEY (id),
  UNIQUE KEY uq_clientes_empresa_email (empresa_id, email),         -- vários NULL são permitidos
  UNIQUE KEY uq_clientes_id_empresa (id, empresa_id),
  KEY idx_clientes_empresa_nome (empresa_id, nome),
  CONSTRAINT fk_clientes_empresa FOREIGN KEY (empresa_id) REFERENCES empresas (id),
  CONSTRAINT ck_clientes_ativo   CHECK (ativo IN (0, 1))
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- vendas: cabeçalho da venda
--   cliente_id NULL = "consumidor final"
--   subtotal = soma dos itens | desconto em R$ | total = subtotal - desconto
--   cancelamento: a venda NUNCA é apagada, só muda o status
-- ---------------------------------------------------------------------
CREATE TABLE vendas (
  id                  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  empresa_id          INT UNSIGNED  NOT NULL,
  cliente_id          INT UNSIGNED  NULL,
  usuario_id          INT UNSIGNED  NOT NULL,                       -- quem registrou
  data_venda          DATETIME      NOT NULL DEFAULT (UTC_TIMESTAMP()),
  status              ENUM('confirmada','cancelada') NOT NULL DEFAULT 'confirmada',
  subtotal            DECIMAL(10,2) NOT NULL,
  desconto            DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  total               DECIMAL(10,2) NOT NULL,
  cancelada_em        DATETIME      NULL,
  cancelada_por       INT UNSIGNED  NULL,
  motivo_cancelamento VARCHAR(255)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_vendas_id_empresa (id, empresa_id),
  KEY idx_vendas_empresa_status_data (empresa_id, status, data_venda),  -- acelera o dashboard
  CONSTRAINT fk_vendas_empresa   FOREIGN KEY (empresa_id) REFERENCES empresas (id),
  CONSTRAINT fk_vendas_cliente   FOREIGN KEY (cliente_id, empresa_id)
                                 REFERENCES clientes (id, empresa_id),
  CONSTRAINT fk_vendas_usuario   FOREIGN KEY (usuario_id, empresa_id)
                                 REFERENCES usuarios (id, empresa_id),
  CONSTRAINT fk_vendas_cancelou  FOREIGN KEY (cancelada_por, empresa_id)
                                 REFERENCES usuarios (id, empresa_id),
  CONSTRAINT ck_vendas_valores   CHECK (subtotal > 0 AND desconto >= 0
                                        AND desconto <= subtotal
                                        AND total = subtotal - desconto),
  CONSTRAINT ck_vendas_cancelamento CHECK (
        (status = 'confirmada' AND cancelada_em IS NULL AND cancelada_por IS NULL
                               AND motivo_cancelamento IS NULL)
     OR (status = 'cancelada'  AND cancelada_em IS NOT NULL AND cancelada_por IS NOT NULL
                               AND motivo_cancelamento IS NOT NULL))
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- itens_venda: um produto dentro de uma venda
--   preco_unitario e custo_unitario são CÓPIAS do produto no momento da
--   venda. Mesmo que o produto mude de preço depois, a venda não muda.
--   subtotal é calculado pelo próprio MySQL (coluna gerada).
-- ---------------------------------------------------------------------
CREATE TABLE itens_venda (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  venda_id        INT UNSIGNED  NOT NULL,
  produto_id      INT UNSIGNED  NOT NULL,
  quantidade      INT           NOT NULL,
  preco_unitario  DECIMAL(10,2) NOT NULL,
  custo_unitario  DECIMAL(10,2) NOT NULL,
  subtotal        DECIMAL(12,2) GENERATED ALWAYS AS (quantidade * preco_unitario) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_itens_venda_produto (venda_id, produto_id),         -- 1 linha por produto na venda
  KEY idx_itens_venda_produto (produto_id),
  CONSTRAINT fk_itens_venda      FOREIGN KEY (venda_id)   REFERENCES vendas (id),
  CONSTRAINT fk_itens_produto    FOREIGN KEY (produto_id) REFERENCES produtos (id),
  CONSTRAINT ck_itens_quantidade CHECK (quantidade > 0),
  CONSTRAINT ck_itens_preco      CHECK (preco_unitario >= 0),
  CONSTRAINT ck_itens_custo      CHECK (custo_unitario >= 0)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- pagamentos: como a venda foi paga
--   V1: o sistema grava UM pagamento por venda (valor = total).
--   A tabela já permite dividir o pagamento no futuro (1 venda : N pagamentos).
-- ---------------------------------------------------------------------
CREATE TABLE pagamentos (
  id         INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  venda_id   INT UNSIGNED  NOT NULL,
  forma      ENUM('dinheiro','pix','cartao_credito','cartao_debito') NOT NULL,
  valor      DECIMAL(10,2) NOT NULL,
  criado_em  DATETIME      NOT NULL DEFAULT (UTC_TIMESTAMP()),
  PRIMARY KEY (id),
  KEY idx_pagamentos_venda (venda_id),
  CONSTRAINT fk_pagamentos_venda FOREIGN KEY (venda_id) REFERENCES vendas (id),
  CONSTRAINT ck_pagamentos_valor CHECK (valor > 0)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- movimentacoes_estoque: livro-razão do estoque (só entra linha, nunca sai)
--   quantidade é sempre POSITIVA; o sentido (entra/sai) vem do tipo.
--   saldo_apos guarda o saldo do produto logo depois da movimentação.
-- ---------------------------------------------------------------------
CREATE TABLE movimentacoes_estoque (
  id             INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  empresa_id     INT UNSIGNED  NOT NULL,
  produto_id     INT UNSIGNED  NOT NULL,
  venda_id       INT UNSIGNED  NULL,
  usuario_id     INT UNSIGNED  NOT NULL,
  tipo           ENUM('entrada','saida_venda','estorno_venda',
                      'ajuste_positivo','ajuste_negativo') NOT NULL,
  quantidade     INT           NOT NULL,
  saldo_apos     INT           NOT NULL,
  justificativa  VARCHAR(255)  NULL,
  criado_em      DATETIME      NOT NULL DEFAULT (UTC_TIMESTAMP()),
  PRIMARY KEY (id),
  KEY idx_mov_produto_data (produto_id, criado_em),
  KEY idx_mov_empresa_data (empresa_id, criado_em),
  KEY idx_mov_venda (venda_id),
  CONSTRAINT fk_mov_empresa  FOREIGN KEY (empresa_id) REFERENCES empresas (id),
  CONSTRAINT fk_mov_produto  FOREIGN KEY (produto_id, empresa_id)
                             REFERENCES produtos (id, empresa_id),
  CONSTRAINT fk_mov_venda    FOREIGN KEY (venda_id, empresa_id)
                             REFERENCES vendas (id, empresa_id),
  CONSTRAINT fk_mov_usuario  FOREIGN KEY (usuario_id, empresa_id)
                             REFERENCES usuarios (id, empresa_id),
  CONSTRAINT ck_mov_quantidade CHECK (quantidade > 0),
  CONSTRAINT ck_mov_saldo      CHECK (saldo_apos >= 0),
  -- movimentações de venda exigem venda_id; as manuais não podem ter venda_id
  CONSTRAINT ck_mov_venda CHECK (
        (tipo IN ('saida_venda','estorno_venda') AND venda_id IS NOT NULL)
     OR (tipo NOT IN ('saida_venda','estorno_venda') AND venda_id IS NULL)),
  -- movimentações manuais exigem justificativa não vazia
  CONSTRAINT ck_mov_justificativa CHECK (
        tipo IN ('saida_venda','estorno_venda')
     OR (justificativa IS NOT NULL AND CHAR_LENGTH(TRIM(justificativa)) > 0))
) ENGINE=InnoDB;
