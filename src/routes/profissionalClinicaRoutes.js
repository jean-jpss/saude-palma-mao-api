// =====================================================================
// ROUTES: busca de profissionais pelo paciente
// =====================================================================
import { Router } from 'express';
import * as controller from '../controllers/profissionalClinicaController.js';
import { autenticar } from '../middlewares/autenticacao.js';

const rotas = Router();

/**
 * @openapi
 * /profissionais-clinicas:
 *   get:
 *     tags: [Profissionais]
 *     summary: Busca profissionais disponiveis
 *     description: |
 *       Requisito 8 da 1a entrega. E aqui que o paciente obtem o
 *       **idProfissionalClinica**, que identifica a agenda.
 *
 *       Atencao ao conceito: o recorte desta rota e o VINCULO entre
 *       profissional e clinica, nao a pessoa. O mesmo medico que
 *       atende em dois hospitais aparece duas vezes na lista, com
 *       idProfissionalClinica diferentes e o mesmo idProfissional.
 *       Isso existe porque a agenda pertence ao vinculo: os horarios
 *       no Hospital Portugues sao outros que os do Hospital Unimed.
 *
 *       Todas as rotas seguintes usam o `idProfissionalClinica`, nunca
 *       o `idProfissional`.
 *
 *       Profissionais e clinicas inativos nao aparecem.
 *     parameters:
 *       - in: query
 *         name: idEspecialidade
 *         schema: { type: integer }
 *         example: 3
 *       - in: query
 *         name: idClinica
 *         schema: { type: integer }
 *       - in: query
 *         name: nome
 *         description: Trecho do nome do profissional. Ignora maiusculas e acentos.
 *         schema: { type: string }
 *         example: ana
 *     responses:
 *       200:
 *         description: Lista de vinculos
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/VinculoProfissionalClinica' }
 *       400:
 *         $ref: '#/components/responses/DadosInvalidos'
 *       401:
 *         $ref: '#/components/responses/NaoAutenticado'
 */
rotas.get('/', autenticar, controller.listar);

export default rotas;
