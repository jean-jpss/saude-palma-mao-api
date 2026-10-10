// =====================================================================
// ROUTES: pacientes
//
// Atencao: "/eu" precisa vir antes de qualquer rota com parametro
// de caminho, para o Express nao tratar "eu" como se fosse um id.
// =====================================================================
import { Router } from 'express';
import * as controller from '../controllers/pacienteController.js';
import { autenticar, exigePerfil } from '../middlewares/autenticacao.js';

const rotas = Router();

/**
 * @openapi
 * /pacientes/eu:
 *   get:
 *     tags: [Pacientes]
 *     summary: Dados completos do paciente logado
 *     description: Inclui sexo e observacoes, que nao vem no login. Somente perfil PACIENTE.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Dados do paciente
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Paciente' }
 *       401:
 *         $ref: '#/components/responses/NaoAutenticado'
 *       403:
 *         $ref: '#/components/responses/SemPermissao'
 *   patch:
 *     tags: [Pacientes]
 *     summary: Atualiza os dados do paciente logado
 *     description: |
 *       Atualizacao parcial: envie so os campos que mudam. O id vem do
 *       token, entao o paciente so altera os proprios dados.
 *
 *       O CPF nao pode ser alterado. Para apagar um campo opcional
 *       (telefone, sexo, observacoes), envie `null`.
 *
 *       Erros: `DADOS_INVALIDOS` (400) e `EMAIL_JA_CADASTRADO` (409).
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nome: { type: string, example: Maria da Silva Santos }
 *               email: { type: string, example: maria.santos@exemplo.com }
 *               telefone: { type: string, nullable: true, example: '81999990000' }
 *               dataNascimento: { type: string, format: date, example: '1955-03-14' }
 *               sexo: { type: string, nullable: true, example: Feminino }
 *               observacoes: { type: string, nullable: true, example: 'Hipertensa e usa bengala' }
 *     responses:
 *       200:
 *         description: Dados atualizados
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Paciente' }
 *       400:
 *         $ref: '#/components/responses/DadosInvalidos'
 *       401:
 *         $ref: '#/components/responses/NaoAutenticado'
 *       403:
 *         $ref: '#/components/responses/SemPermissao'
 *       409:
 *         $ref: '#/components/responses/Conflito'
 */
rotas.get('/eu', autenticar, exigePerfil('PACIENTE'), controller.meusDados);
rotas.patch('/eu', autenticar, exigePerfil('PACIENTE'), controller.atualizarMeusDados);

/**
 * @openapi
 * /pacientes:
 *   get:
 *     tags: [Pacientes]
 *     summary: Consulta pacientes cadastrados (administrador)
 *     description: |
 *       Busca por CPF (igual) e/ou nome (contem, sem diferenciar
 *       maiusculas e acentos). Sem filtros, devolve os 50 primeiros por
 *       ordem alfabetica. Somente perfil ADMINISTRADOR.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: cpf
 *         schema: { type: string }
 *         example: '52998224725'
 *       - in: query
 *         name: nome
 *         schema: { type: string }
 *         example: maria
 *     responses:
 *       200:
 *         description: Pacientes encontrados
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Paciente' }
 *       400:
 *         $ref: '#/components/responses/DadosInvalidos'
 *       401:
 *         $ref: '#/components/responses/NaoAutenticado'
 *       403:
 *         $ref: '#/components/responses/SemPermissao'
 */
rotas.get('/', autenticar, exigePerfil('ADMINISTRADOR'), controller.listar);

export default rotas;
