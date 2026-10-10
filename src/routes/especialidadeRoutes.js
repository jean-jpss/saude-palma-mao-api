// =====================================================================
// ROUTES: especialidade
// =====================================================================
import { Router } from 'express';
import * as controller from '../controllers/especialidadeController.js';
import { autenticar, exigePerfil } from '../middlewares/autenticacao.js';

const rotas = Router();

/**
 * @openapi
 * /especialidades:
 *   get:
 *     tags: [Especialidades]
 *     summary: Lista as especialidades
 *     description: |
 *       Devolve apenas as ativas, em ordem alfabetica.
 *
 *       Exiba sempre a descricao junto do nome: ela foi escrita em
 *       linguagem simples para o paciente entender o que cada
 *       especialidade cuida, sem precisar saber o termo medico.
 *     parameters:
 *       - in: query
 *         name: incluirInativas
 *         schema: { type: boolean }
 *         description: Somente para administrador. Inclui as desativadas.
 *     responses:
 *       200:
 *         description: Lista de especialidades
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Especialidade' }
 *       401:
 *         $ref: '#/components/responses/NaoAutenticado'
 *   post:
 *     tags: [Especialidades]
 *     summary: Cadastra uma especialidade
 *     description: Requisito 3 da 1a entrega. Perfil administrador.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nome]
 *             properties:
 *               nome: { type: string, example: Pneumologia }
 *               descricao: { type: string, example: Cuida dos pulmoes e da respiracao. }
 *     responses:
 *       201:
 *         description: Especialidade criada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Especialidade' }
 *       400:
 *         $ref: '#/components/responses/DadosInvalidos'
 *       403:
 *         $ref: '#/components/responses/SemPermissao'
 *       409:
 *         description: ESPECIALIDADE_JA_EXISTE
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 */
rotas.get('/', autenticar, controller.listar);
rotas.post('/', autenticar, exigePerfil('ADMINISTRADOR'), controller.criar);

/**
 * @openapi
 * /especialidades/{id}:
 *   patch:
 *     tags: [Especialidades]
 *     summary: Altera uma especialidade
 *     description: |
 *       Atualizacao parcial: apenas os campos enviados sao alterados.
 *       Para reativar uma especialidade desativada, envie `ativo: true`.
 *       Nao existe rota separada para reativacao.
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
 *               descricao: { type: string }
 *               ativo: { type: boolean }
 *     responses:
 *       200:
 *         description: Especialidade alterada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Especialidade' }
 *       400:
 *         $ref: '#/components/responses/DadosInvalidos'
 *       403:
 *         $ref: '#/components/responses/SemPermissao'
 *       404:
 *         $ref: '#/components/responses/NaoEncontrado'
 *   delete:
 *     tags: [Especialidades]
 *     summary: Desativa uma especialidade
 *     description: |
 *       Desativacao logica, nunca remocao fisica: agendamentos passados
 *       referenciam a especialidade, e apagar a linha quebraria o
 *       historico.
 *
 *       Bloqueada quando existirem consultas futuras marcadas nesta
 *       especialidade.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204:
 *         description: Desativada, sem corpo na resposta
 *       403:
 *         $ref: '#/components/responses/SemPermissao'
 *       404:
 *         $ref: '#/components/responses/NaoEncontrado'
 *       409:
 *         description: ESPECIALIDADE_COM_AGENDAMENTOS ou TRANSICAO_STATUS_INVALIDA
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 */
rotas.patch('/:id', autenticar, exigePerfil('ADMINISTRADOR'), controller.atualizar);
rotas.delete('/:id', autenticar, exigePerfil('ADMINISTRADOR'), controller.desativar);

export default rotas;
