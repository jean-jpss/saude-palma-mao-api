// =====================================================================
// ROUTES: autenticacao
//
// A camada de rotas so faz uma coisa: ligar um caminho HTTP a um
// controller, declarando os middlewares que rodam antes. Nenhuma
// regra, nenhuma validacao, nenhum SQL.
//
// As anotacoes JSDoc abaixo alimentam a documentacao em /docs.
// =====================================================================
import { Router } from 'express';
import * as controller from '../controllers/autenticacaoController.js';
import { autenticar } from '../middlewares/autenticacao.js';

const rotas = Router();

/**
 * @openapi
 * /autenticacao/cadastro:
 *   post:
 *     tags: [Autenticacao]
 *     summary: Cria uma conta de paciente
 *     description: |
 *       Grava em duas tabelas dentro de uma transacao: `usuario`, com os
 *       dados de acesso, e `paciente`, com CPF e data de nascimento. Se
 *       a segunda falhar, a primeira e desfeita, para nao sobrar um
 *       usuario orfao ocupando o e-mail.
 *
 *       A senha nunca e armazenada: o banco guarda um hash bcrypt.
 *
 *       O token ja vem na resposta, entao o front pode levar o paciente
 *       direto para a tela inicial, sem pedir login.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nome, email, cpf, dataNascimento, senha]
 *             properties:
 *               nome:
 *                 type: string
 *                 minLength: 3
 *                 example: Maria da Silva
 *               email:
 *                 type: string
 *                 format: email
 *                 example: maria.silva@exemplo.com
 *               cpf:
 *                 type: string
 *                 description: Com ou sem pontuacao. O digito verificador e conferido.
 *                 example: "529.982.247-25"
 *               dataNascimento:
 *                 type: string
 *                 format: date
 *                 description: Nao pode ser futura.
 *                 example: "1955-03-14"
 *               telefone:
 *                 type: string
 *                 example: "81999998888"
 *               senha:
 *                 type: string
 *                 minLength: 8
 *                 example: senhaSegura123
 *     responses:
 *       201:
 *         description: Conta criada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/RespostaAutenticacao' }
 *       400:
 *         $ref: '#/components/responses/DadosInvalidos'
 *       409:
 *         description: EMAIL_JA_CADASTRADO ou CPF_JA_CADASTRADO
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 */
rotas.post('/cadastro', controller.cadastrar);

/**
 * @openapi
 * /autenticacao/login:
 *   post:
 *     tags: [Autenticacao]
 *     summary: Autentica e devolve o token
 *     description: |
 *       O campo `identificador` aceita CPF ou e-mail, e a API descobre
 *       qual foi enviado. O CPF e a opcao principal na interface,
 *       porque a pesquisa com usuarios apontou dificuldade em lembrar
 *       e-mail e senha.
 *
 *       Usuario inexistente e senha errada devolvem a mesma mensagem,
 *       de proposito: diferenciar entregaria a informacao de quais
 *       e-mails estao cadastrados.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [identificador, senha]
 *             properties:
 *               identificador:
 *                 type: string
 *                 description: CPF ou e-mail
 *                 example: "52998224725"
 *               senha:
 *                 type: string
 *                 example: senhaSegura123
 *     responses:
 *       200:
 *         description: Autenticado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/RespostaAutenticacao' }
 *       400:
 *         $ref: '#/components/responses/DadosInvalidos'
 *       401:
 *         description: CREDENCIAIS_INVALIDAS
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 *       403:
 *         description: USUARIO_INATIVO
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 */
rotas.post('/login', controller.entrar);

/**
 * @openapi
 * /autenticacao/eu:
 *   get:
 *     tags: [Autenticacao]
 *     summary: Dados do usuario logado
 *     description: |
 *       Use ao recarregar a pagina, para saber se a sessao ainda vale
 *       sem pedir senha de novo. Resposta 401 significa sessao expirada.
 *     responses:
 *       200:
 *         description: Perfil do usuario
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 idUsuario: { type: integer, example: 2 }
 *                 nome: { type: string, example: Maria da Silva }
 *                 email: { type: string, example: maria.silva@exemplo.com }
 *                 telefone: { type: string, nullable: true, example: "81999998888" }
 *                 tipoUsuario: { type: string, example: PACIENTE }
 *                 idPaciente: { type: integer, nullable: true, example: 1 }
 *                 cpf: { type: string, nullable: true, example: "52998224725" }
 *                 dataNascimento:
 *                   type: string
 *                   format: date
 *                   nullable: true
 *                   description: Texto puro, sem fuso. Nao passe por new Date() na exibicao.
 *                   example: "1955-03-14"
 *       401:
 *         $ref: '#/components/responses/NaoAutenticado'
 */
rotas.get('/eu', autenticar, controller.meuPerfil);

export default rotas;
