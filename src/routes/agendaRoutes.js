// =====================================================================
// ROUTES: agenda do profissional
// =====================================================================
import { Router } from 'express';
import * as controller from '../controllers/agendaController.js';
import { autenticar, exigePerfil } from '../middlewares/autenticacao.js';

const rotas = Router();

/**
 * @openapi
 * /agenda:
 *   get:
 *     tags: [Agenda]
 *     summary: Atendimentos do profissional autenticado
 *     description: |
 *       E por aqui que o profissional descobre os identificadores das
 *       proprias consultas, necessarios para confirmar e marcar como
 *       realizada.
 *
 *       Traz telefone e data de nascimento do paciente, que a listagem
 *       do proprio paciente nao precisa: sao dados de contato e
 *       contexto basico, uteis no atendimento.
 *
 *       O filtro por data usa o dia em horario de Recife, nao em UTC.
 *       Um atendimento das 8h do dia 13 aparece em `data=2026-10-13`,
 *       embora esteja gravado como 11:00Z.
 *
 *       O administrador ve todos os profissionais.
 *     parameters:
 *       - in: query
 *         name: data
 *         schema: { type: string, format: date }
 *         example: "2026-10-22"
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [AGENDADO, CONFIRMADO, CANCELADO, REALIZADO]
 *       - in: query
 *         name: idProfissionalClinica
 *         schema: { type: integer }
 *         description: Somente administrador
 *     responses:
 *       200:
 *         description: Atendimentos em ordem cronologica
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/ItemAgenda' }
 *       400:
 *         $ref: '#/components/responses/DadosInvalidos'
 *       403:
 *         $ref: '#/components/responses/SemPermissao'
 */
rotas.get('/', autenticar, exigePerfil('PROFISSIONAL', 'ADMINISTRADOR'), controller.listar);

export default rotas;
