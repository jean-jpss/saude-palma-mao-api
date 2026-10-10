// =====================================================================
// ROUTES: profissional, visao administrativa
// =====================================================================
import { Router } from 'express';
import * as controller from '../controllers/profissionalController.js';
import { autenticar, exigePerfil } from '../middlewares/autenticacao.js';

const rotas = Router();

const somenteAdmin = [autenticar, exigePerfil('ADMINISTRADOR')];

/**
 * @openapi
 * /profissionais:
 *   get:
 *     tags: [Profissionais]
 *     summary: Lista profissionais, visao administrativa
 *     description: |
 *       Diferente de GET /profissionais-clinicas, que e a busca do
 *       paciente: la o recorte e o vinculo com a clinica, aqui e a
 *       pessoa, com todos os seus vinculos reunidos.
 *     parameters:
 *       - in: query
 *         name: busca
 *         schema: { type: string }
 *         description: Procura no nome e no numero de registro
 *       - in: query
 *         name: incluirInativos
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: Lista de profissionais
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Profissional' }
 *       403:
 *         $ref: '#/components/responses/SemPermissao'
 *   post:
 *     tags: [Profissionais]
 *     summary: Cadastra um profissional
 *     description: |
 *       Requisito 2 da 1a entrega.
 *
 *       Uma requisicao cria tres coisas em transacao: o usuario de
 *       acesso com senha, o registro profissional com conselho e
 *       numero, e os vinculos com clinicas e especialidades. Se
 *       qualquer parte falhar, nada e gravado.
 *
 *       A senha inicial e definida pelo administrador e informada ao
 *       profissional por fora do sistema. Convite por e-mail exigiria
 *       servico de envio e ficou fora do escopo desta entrega.
 *
 *       O conselho usa lista fechada: campo livre permitiria "crm",
 *       "C.R.M." e "Crm" como valores diferentes, quebrando a
 *       unicidade do registro profissional.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nome, email, cpf, conselho, registroProfissional, ufRegistro, senha]
 *             properties:
 *               nome: { type: string, example: Patricia Nunes Moreira }
 *               email: { type: string, example: patricia.moreira@exemplo.test }
 *               telefone: { type: string, example: "81988889999" }
 *               cpf: { type: string, example: "02654235114" }
 *               conselho:
 *                 type: string
 *                 enum: [CRM, CRO, CRP, COREN, CREFITO, CRN, CRF, CREFONO]
 *               registroProfissional: { type: string, example: "10007" }
 *               ufRegistro: { type: string, example: PE }
 *               senha: { type: string, minLength: 8, example: senhaInicial123 }
 *               idsEspecialidades:
 *                 type: array
 *                 items: { type: integer }
 *                 example: [1, 2]
 *               idsClinicas:
 *                 type: array
 *                 items: { type: integer }
 *                 example: [1]
 *     responses:
 *       201:
 *         description: Profissional criado, ja com os vinculos
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Profissional' }
 *       400:
 *         description: DADOS_INVALIDOS ou VINCULO_INVALIDO
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 *       403:
 *         $ref: '#/components/responses/SemPermissao'
 *       409:
 *         description: EMAIL_JA_CADASTRADO, CPF_JA_CADASTRADO ou REGISTRO_JA_CADASTRADO
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 */
rotas.get('/', somenteAdmin, controller.listar);
rotas.post('/', somenteAdmin, controller.criar);

/**
 * @openapi
 * /profissionais/{id}:
 *   get:
 *     tags: [Profissionais]
 *     summary: Detalhe de um profissional
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Dados do profissional
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Profissional' }
 *       404:
 *         $ref: '#/components/responses/NaoEncontrado'
 *   patch:
 *     tags: [Profissionais]
 *     summary: Altera dados cadastrais
 *     description: |
 *       Nome, e-mail e telefone moram na tabela `usuario`; conselho e
 *       registro moram em `profissional`. A tela e uma so, a gravacao e
 *       em duas tabelas, dentro de uma transacao.
 *
 *       **A senha nao e alterada por esta rota.** Trocar senha de outra
 *       pessoa e operacao distinta, com risco distinto, e nao deve
 *       acontecer por engano numa edicao de cadastro.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nome: { type: string }
 *               email: { type: string }
 *               telefone: { type: string }
 *               conselho: { type: string }
 *               registroProfissional: { type: string }
 *               ufRegistro: { type: string }
 *               ativo: { type: boolean }
 *     responses:
 *       200:
 *         description: Profissional alterado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Profissional' }
 *       400:
 *         $ref: '#/components/responses/DadosInvalidos'
 *       404:
 *         $ref: '#/components/responses/NaoEncontrado'
 *   delete:
 *     tags: [Profissionais]
 *     summary: Desativa um profissional
 *     description: |
 *       Desativa o profissional e tambem o usuario de acesso. Sem isso,
 *       a pessoa continuaria conseguindo fazer login mesmo sem atender.
 *
 *       Bloqueado se houver consultas futuras marcadas.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204:
 *         description: Desativado
 *       404:
 *         $ref: '#/components/responses/NaoEncontrado'
 *       409:
 *         description: PROFISSIONAL_COM_AGENDAMENTOS
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 */
rotas.get('/:id', somenteAdmin, controller.detalhar);
rotas.patch('/:id', somenteAdmin, controller.atualizar);
rotas.delete('/:id', somenteAdmin, controller.desativar);

/**
 * @openapi
 * /profissionais/{id}/especialidades:
 *   put:
 *     tags: [Profissionais]
 *     summary: Substitui as especialidades do profissional
 *     description: |
 *       Bloqueado se houver consultas futuras em uma especialidade que
 *       seria removida: isso deixaria agendamentos apontando para algo
 *       que o profissional deixou de atender.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [idsEspecialidades]
 *             properties:
 *               idsEspecialidades:
 *                 type: array
 *                 items: { type: integer }
 *                 example: [2, 8]
 *     responses:
 *       200:
 *         description: Lista substituida
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Profissional' }
 *       404:
 *         $ref: '#/components/responses/NaoEncontrado'
 *       409:
 *         description: ESPECIALIDADE_COM_AGENDAMENTOS
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 */
rotas.put('/:id/especialidades', somenteAdmin, controller.substituirEspecialidades);

/**
 * @openapi
 * /profissionais/{id}/clinicas:
 *   post:
 *     tags: [Profissionais]
 *     summary: Vincula o profissional a uma clinica
 *     description: |
 *       Acrescenta, nao substitui. Diferente das especialidades, cada
 *       vinculo com clinica tem identificador proprio, referenciado
 *       pela agenda e pelos agendamentos. Apagar e recriar geraria
 *       identificadores novos e orfanaria os registros existentes.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [idClinica]
 *             properties:
 *               idClinica: { type: integer, example: 2 }
 *     responses:
 *       201:
 *         description: Vinculo criado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Profissional' }
 *       400:
 *         description: CLINICA_NAO_ENCONTRADA
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 *       409:
 *         description: VINCULO_JA_EXISTE
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 */
rotas.post('/:id/clinicas', somenteAdmin, controller.vincularClinica);

/**
 * @openapi
 * /profissionais/{id}/clinicas/{idClinica}:
 *   delete:
 *     tags: [Profissionais]
 *     summary: Desativa um vinculo com clinica
 *     description: Preserva agenda e historico. Bloqueado se houver consultas futuras neste vinculo.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: idClinica
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204:
 *         description: Vinculo desativado
 *       404:
 *         description: VINCULO_NAO_ENCONTRADO
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 *       409:
 *         description: VINCULO_COM_AGENDAMENTOS
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 */
rotas.delete('/:id/clinicas/:idClinica', somenteAdmin, controller.desativarVinculo);

export default rotas;
