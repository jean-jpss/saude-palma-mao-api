-- =====================================================================
-- Seed de dados ficticios - 1a entrega
-- Projeto Integrador "Saude na Palma da Mao"
--
-- EXECUTAR APENAS EM AMBIENTE DE DESENVOLVIMENTO OU DEMONSTRACAO.
--
-- Senha de todos os usuarios de teste: senha123456
-- O hash abaixo foi gerado com bcrypt, custo 10. E o mesmo para todos,
-- de proposito, para facilitar a demonstracao.
--
-- AVISO SOBRE OS NOMES DAS CLINICAS
-- Os nomes dos hospitais sao reais e foram usados apenas para dar
-- realismo a demonstracao academica. Nao existe qualquer parceria,
-- autorizacao ou vinculo com essas instituicoes. CNPJ, telefone,
-- e-mail e numero de endereco sao ficticios. Nenhum dado real de
-- paciente, profissional ou empresa foi utilizado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ESPECIALIDADES
-- A descricao usa linguagem cotidiana, nao termo clinico, porque e
-- exibida ao paciente antes da escolha. Decisao derivada da pesquisa
-- com usuarios, em que "palavras dificeis" apareceu como barreira.
-- ---------------------------------------------------------------------
INSERT INTO especialidade (nome, descricao) VALUES
  ('Clinica Geral',  'Primeira avaliacao para qualquer problema de saude. Se precisar, encaminha para outro especialista.'),
  ('Cardiologia',    'Cuida do coracao e da pressao alta.'),
  ('Ortopedia',      'Cuida de ossos, juntas e musculos. Dores nas costas, joelho, ombro e fraturas.'),
  ('Dermatologia',   'Cuida da pele, do cabelo e das unhas. Manchas, coceira e feridas que nao saram.'),
  ('Oftalmologia',   'Cuida dos olhos e da visao. Consulta para oculos, catarata e vista cansada.'),
  ('Ginecologia',    'Cuida da saude da mulher.'),
  ('Endocrinologia', 'Cuida de diabetes, tireoide e questoes de hormonio.'),
  ('Geriatria',      'Cuida da saude da pessoa idosa de forma geral.');

-- ---------------------------------------------------------------------
-- 2. CLINICAS
-- CNPJ, telefone, e-mail e numero sao ficticios.
-- ---------------------------------------------------------------------
INSERT INTO clinica (nome, cnpj, telefone, email, logradouro, numero, bairro, cidade, uf, cep, horario_funcionamento) VALUES
  ('Hospital Portugues',       '11111111000111', '8130000001', 'contato@exemplo-portugues.test', 'Avenida Portugal',      '100', 'Paissandu',    'Recife', 'PE', '52010010', 'Segunda a sexta, 7h as 19h'),
  ('Hospital Esperanca Recife','22222222000122', '8130000002', 'contato@exemplo-esperanca.test', 'Rua Antonio Gomes',     '200', 'Ilha do Leite','Recife', 'PE', '50070520', 'Segunda a sexta, 7h as 18h'),
  ('Hospital Unimed Recife',   '33333333000133', '8130000003', 'contato@exemplo-unimed.test',    'Avenida Engenheiro Sul','300', 'Derby',        'Recife', 'PE', '52011000', 'Segunda a sabado, 7h as 17h');

-- ---------------------------------------------------------------------
-- 3. CLINICA_ESPECIALIDADE
-- Quais especialidades cada clinica atende.
-- ---------------------------------------------------------------------
INSERT INTO clinica_especialidade (id_clinica, id_especialidade)
SELECT c.id_clinica, e.id_especialidade
  FROM clinica c
  CROSS JOIN especialidade e
 WHERE (c.nome = 'Hospital Portugues'        AND e.nome IN ('Clinica Geral','Cardiologia','Ortopedia','Geriatria'))
    OR (c.nome = 'Hospital Esperanca Recife' AND e.nome IN ('Clinica Geral','Dermatologia','Oftalmologia','Ginecologia'))
    OR (c.nome = 'Hospital Unimed Recife'    AND e.nome IN ('Clinica Geral','Endocrinologia','Ortopedia','Geriatria'));

-- ---------------------------------------------------------------------
-- 4. USUARIOS: 6 profissionais e 1 administrador
-- Senha de todos: senha123456
-- ---------------------------------------------------------------------
INSERT INTO usuario (nome, email, senha_hash, telefone, tipo_usuario) VALUES
  ('Ana Beatriz Carvalho',  'ana.carvalho@exemplo.test',  '$2b$10$Rv7yNEmJXYMga71xsEZWlePwTkz98B7ZOzSMHuE7rPqlszNadfVLK', '81988880001', 'PROFISSIONAL'),
  ('Carlos Henrique Lima',  'carlos.lima@exemplo.test',   '$2b$10$Rv7yNEmJXYMga71xsEZWlePwTkz98B7ZOzSMHuE7rPqlszNadfVLK', '81988880002', 'PROFISSIONAL'),
  ('Fernanda Souza Rego',   'fernanda.rego@exemplo.test', '$2b$10$Rv7yNEmJXYMga71xsEZWlePwTkz98B7ZOzSMHuE7rPqlszNadfVLK', '81988880003', 'PROFISSIONAL'),
  ('Rafael Moreira Alves',  'rafael.alves@exemplo.test',  '$2b$10$Rv7yNEmJXYMga71xsEZWlePwTkz98B7ZOzSMHuE7rPqlszNadfVLK', '81988880004', 'PROFISSIONAL'),
  ('Juliana Pires Tavares', 'juliana.tavares@exemplo.test','$2b$10$Rv7yNEmJXYMga71xsEZWlePwTkz98B7ZOzSMHuE7rPqlszNadfVLK', '81988880005', 'PROFISSIONAL'),
  ('Marcos Vinicius Dantas','marcos.dantas@exemplo.test', '$2b$10$Rv7yNEmJXYMga71xsEZWlePwTkz98B7ZOzSMHuE7rPqlszNadfVLK', '81988880006', 'PROFISSIONAL'),
  ('Administrador do Sistema','admin@exemplo.test',       '$2b$10$Rv7yNEmJXYMga71xsEZWlePwTkz98B7ZOzSMHuE7rPqlszNadfVLK', '81988880000', 'ADMINISTRADOR');

-- ---------------------------------------------------------------------
-- 5. PROFISSIONAIS
-- CPF e registro profissional ficticios. Os CPFs abaixo passam no
-- calculo do digito verificador e nao pertencem a pessoas reais.
-- ---------------------------------------------------------------------
INSERT INTO profissional (id_usuario, cpf, conselho, registro_profissional, uf_registro)
SELECT u.id_usuario, v.cpf, v.conselho, v.registro, 'PE'
  FROM (VALUES
    ('ana.carvalho@exemplo.test',   '52998224725', 'CRM', '10001'),
    ('carlos.lima@exemplo.test',    '15350946056', 'CRM', '10002'),
    ('fernanda.rego@exemplo.test',  '71428793860', 'CRM', '10003'),
    ('rafael.alves@exemplo.test',   '29537995500', 'CRM', '10004'),
    ('juliana.tavares@exemplo.test','40364224836', 'CRM', '10005'),
    ('marcos.dantas@exemplo.test',  '63017285077', 'CRM', '10006')
  ) AS v(email, cpf, conselho, registro)
  JOIN usuario u ON u.email = v.email;

-- ---------------------------------------------------------------------
-- 6. PROFISSIONAL_ESPECIALIDADE
-- ---------------------------------------------------------------------
INSERT INTO profissional_especialidade (id_profissional, id_especialidade)
SELECT p.id_profissional, e.id_especialidade
  FROM profissional p
  JOIN usuario u ON u.id_usuario = p.id_usuario
  JOIN especialidade e ON TRUE
 WHERE (u.email = 'ana.carvalho@exemplo.test'    AND e.nome IN ('Cardiologia','Clinica Geral'))
    OR (u.email = 'carlos.lima@exemplo.test'     AND e.nome IN ('Ortopedia'))
    OR (u.email = 'fernanda.rego@exemplo.test'   AND e.nome IN ('Dermatologia','Clinica Geral'))
    OR (u.email = 'rafael.alves@exemplo.test'    AND e.nome IN ('Oftalmologia'))
    OR (u.email = 'juliana.tavares@exemplo.test' AND e.nome IN ('Ginecologia','Clinica Geral'))
    OR (u.email = 'marcos.dantas@exemplo.test'   AND e.nome IN ('Endocrinologia','Geriatria'));

-- ---------------------------------------------------------------------
-- 7. PROFISSIONAL_CLINICA
-- E este vinculo, e nao o profissional isolado, que possui agenda.
-- Ana e Marcos atuam em duas clinicas, para demonstrar o caso.
-- ---------------------------------------------------------------------
INSERT INTO profissional_clinica (id_profissional, id_clinica)
SELECT p.id_profissional, c.id_clinica
  FROM profissional p
  JOIN usuario u ON u.id_usuario = p.id_usuario
  JOIN clinica c ON TRUE
 WHERE (u.email = 'ana.carvalho@exemplo.test'    AND c.nome IN ('Hospital Portugues','Hospital Unimed Recife'))
    OR (u.email = 'carlos.lima@exemplo.test'     AND c.nome IN ('Hospital Portugues'))
    OR (u.email = 'fernanda.rego@exemplo.test'   AND c.nome IN ('Hospital Esperanca Recife'))
    OR (u.email = 'rafael.alves@exemplo.test'    AND c.nome IN ('Hospital Esperanca Recife'))
    OR (u.email = 'juliana.tavares@exemplo.test' AND c.nome IN ('Hospital Esperanca Recife'))
    OR (u.email = 'marcos.dantas@exemplo.test'   AND c.nome IN ('Hospital Unimed Recife','Hospital Portugues'));

-- ---------------------------------------------------------------------
-- 8. DISPONIBILIDADE
-- Janelas geradas a partir de CURRENT_DATE, cobrindo os proximos 30
-- dias uteis. Nao use datas fixas aqui: um seed com datas fixas vence
-- e, na vespera da apresentacao, nao sobra horario nenhum para mostrar.
--
-- Turno da manha das 08:00 as 12:00 e da tarde das 14:00 as 17:00,
-- ambos com consultas de 30 minutos.
-- ---------------------------------------------------------------------
INSERT INTO disponibilidade (id_profissional_clinica, data_atendimento, hora_inicio, hora_fim, duracao_minutos)
SELECT pc.id_profissional_clinica, dias.dia, turnos.inicio, turnos.fim, 30
  FROM profissional_clinica pc
  CROSS JOIN LATERAL (
      -- Gera 45 dias corridos e filtra sabados e domingos, o que
      -- resulta em aproximadamente 30 dias uteis.
      SELECT d::date AS dia
        FROM generate_series(CURRENT_DATE, CURRENT_DATE + INTERVAL '44 days', INTERVAL '1 day') AS d
       WHERE EXTRACT(ISODOW FROM d) BETWEEN 1 AND 5
       LIMIT 30
  ) AS dias
  CROSS JOIN (VALUES (TIME '08:00', TIME '12:00'), (TIME '14:00', TIME '17:00')) AS turnos(inicio, fim)
 WHERE pc.ativo = TRUE;

-- ---------------------------------------------------------------------
-- 9. Conferencia
-- ---------------------------------------------------------------------
SELECT 'especialidade'        AS tabela, COUNT(*) FROM especialidade
UNION ALL SELECT 'clinica',             COUNT(*) FROM clinica
UNION ALL SELECT 'usuario',             COUNT(*) FROM usuario
UNION ALL SELECT 'profissional',        COUNT(*) FROM profissional
UNION ALL SELECT 'profissional_clinica',COUNT(*) FROM profissional_clinica
UNION ALL SELECT 'disponibilidade',     COUNT(*) FROM disponibilidade;
