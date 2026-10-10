// =====================================================================
// ROUTES: agendamento
// =====================================================================
import { Router } from 'express';
import * as controller from '../controllers/agendamentoController.js';
import { autenticar, exigePerfil } from '../middlewares/autenticacao.js';

const rotas = Router();

/**
 * @openapi
 * /agendamentos:
 *   post:
 *     tags: [Agendamentos]
 *     summary: Marca uma consulta
 *     description: |
 *       Requisito 12 da 1a entrega. Perfil paciente.
 *
 *       Use o `dataHora` exatamente como veio de GET /disponibilidades,
 *       sem alterar nada. A especialidade precisa ser uma das que o
 *       profissional atende: monte a escolha a partir do array
 *       `especialidades` da busca de profissionais e o erro nunca
 *       acontece.
 *
 *       **Validacoes, nesta ordem.** A ordem importa porque o paciente
 *       recebe apenas o primeiro erro:
 *
 *       1. horario no passado
 *       2. antecedencia minima de 24 horas
 *       3. profissional ou clinica inativos
 *       4. especialidade nao atendida pelo profissional
 *       5. horario fora da grade de slots
 *       6. limite de 5 consultas futuras ativas
 *
 *       Sobre o item 5: o horario precisa coincidir exatamente com o
 *       inicio de um slot. Em uma janela das 08:00 as 12:00 com 30
 *       minutos, o valor 08:17 esta dentro do intervalo e mesmo assim e
 *       recusado, porque nao e inicio de slot.
 *
 *       As validacoes acima melhoram a mensagem, mas nao protegem
 *       contra requisicoes simultaneas. A garantia real sao dois
 *       indices unicos parciais no banco, que produzem
 *       HORARIO_INDISPONIVEL e PACIENTE_JA_AGENDADO.
 *
 *       A resposta traz tudo que a tela de confirmacao precisa. Nao
 *       faca outra chamada depois do POST.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [idProfissionalClinica, idEspecialidade, dataHora]
 *             properties:
 *               idProfissionalClinica: { type: integer, example: 3 }
 *               idEspecialidade: { type: integer, example: 3 }
 *               dataHora:
 *                 type: string
 *                 format: date-time
 *                 description: ISO 8601. Copie da listagem de horarios.
 *                 example: "2026-10-22T11:00:00.000Z"
 *               observacao: { type: string, example: Dor no joelho ha duas semanas }
 *     responses:
 *       201:
 *         description: Consulta marcada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Agendamento' }
 *       400:
 *         description: HORARIO_NO_PASSADO, ANTECEDENCIA_INSUFICIENTE, PROFISSIONAL_CLINICA_INATIVO, ESPECIALIDADE_NAO_ATENDIDA ou HORARIO_INVALIDO
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 *       403:
 *         $ref: '#/components/responses/SemPermissao'
 *       409:
 *         description: HORARIO_INDISPONIVEL, PACIENTE_JA_AGENDADO ou LIMITE_AGENDAMENTOS_EXCEDIDO
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 *   get:
 *     tags: [Agendamentos]
 *     summary: Lista as consultas do paciente autenticado
 *     description: |
 *       Requisito 13 da 1a entrega.
 *
 *       Devolve todas, inclusive canceladas e realizadas, da mais
 *       recente para a mais antiga. A separacao entre proximas e
 *       anteriores e feita no front, comparando `dataHora` com o
 *       momento atual e filtrando por status.
 *
 *       O filtro por paciente vem do token, nunca de parametro, senao
 *       qualquer paciente poderia ler a agenda de outro.
 *     responses:
 *       200:
 *         description: Consultas do paciente
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Agendamento' }
 *       403:
 *         $ref: '#/components/responses/SemPermissao'
 */
rotas.post('/', autenticar, exigePerfil('PACIENTE'), controller.criar);
rotas.get('/', autenticar, exigePerfil('PACIENTE'), controller.listarDoPaciente);

/**
 * @openapi
 * /agendamentos/{id}:
 *   get:
 *     tags: [Agendamentos]
 *     summary: Detalhe de uma consulta
 *     description: |
 *       O paciente so acessa as proprias. Pedir o identificador de
 *       outra pessoa devolve 404, e nao 403: informar que o registro
 *       existe mas pertence a outro ja e vazamento de informacao.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Dados da consulta
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Agendamento' }
 *       404:
 *         $ref: '#/components/responses/NaoEncontrado'
 */
rotas.get('/:id', autenticar, controller.detalhar);

/**
 * @openapi
 * /agendamentos/{id}/cancelamento:
 *   patch:
 *     tags: [Agendamentos]
 *     summary: Cancela uma consulta
 *     description: |
 *       Requisito 14 da 1a entrega.
 *
 *       O paciente cancela com no minimo 8 horas de antecedencia.
 *       Calcule isso no front e desabilite o botao quando faltar menos,
 *       com a explicacao visivel ao lado. Melhor avisar antes do que
 *       deixar o paciente clicar e levar um erro.
 *
 *       O administrador cancela a qualquer momento, porque precisa
 *       lidar com ausencia do profissional e imprevistos da clinica.
 *
 *       Consulta que ja aconteceu nao pode ser cancelada por ninguem.
 *       Consulta cancelada nao volta atras: o paciente marca outra.
 *       Nao existe reagendamento nesta versao.
 *
 *       Cancelar libera o horario, que volta a aparecer em
 *       GET /disponibilidades.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               motivo: { type: string, example: Conflito de horario no trabalho }
 *     responses:
 *       200:
 *         description: Consulta cancelada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Agendamento' }
 *       400:
 *         description: CANCELAMENTO_FORA_DO_PRAZO
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 *       404:
 *         $ref: '#/components/responses/NaoEncontrado'
 *       409:
 *         description: TRANSICAO_STATUS_INVALIDA
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 */
rotas.patch('/:id/cancelamento', autenticar, exigePerfil('PACIENTE', 'ADMINISTRADOR'), controller.cancelar);

/**
 * @openapi
 * /agendamentos/{id}/confirmacao:
 *   patch:
 *     tags: [Agendamentos]
 *     summary: Confirma uma consulta
 *     description: |
 *       Transicao de AGENDADO para CONFIRMADO. Perfil profissional ou
 *       administrador. O profissional so altera os proprios
 *       atendimentos.
 *
 *       Obtenha o identificador em GET /agenda.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Consulta confirmada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Agendamento' }
 *       403:
 *         $ref: '#/components/responses/SemPermissao'
 *       404:
 *         $ref: '#/components/responses/NaoEncontrado'
 *       409:
 *         description: TRANSICAO_STATUS_INVALIDA
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 */
rotas.patch('/:id/confirmacao', autenticar, exigePerfil('PROFISSIONAL', 'ADMINISTRADOR'), controller.confirmar);

/**
 * @openapi
 * /agendamentos/{id}/realizacao:
 *   patch:
 *     tags: [Agendamentos]
 *     summary: Marca a consulta como realizada
 *     description: |
 *       Transicao para REALIZADO, a partir de AGENDADO ou CONFIRMADO.
 *
 *       A confirmacao previa nao e obrigatoria: um atendimento que
 *       aconteceu sem passar por CONFIRMADO pode ser fechado direto.
 *
 *       CANCELADO e REALIZADO sao estados finais.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Consulta marcada como realizada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Agendamento' }
 *       403:
 *         $ref: '#/components/responses/SemPermissao'
 *       404:
 *         $ref: '#/components/responses/NaoEncontrado'
 *       409:
 *         description: TRANSICAO_STATUS_INVALIDA
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 */
rotas.patch('/:id/realizacao', autenticar, exigePerfil('PROFISSIONAL', 'ADMINISTRADOR'), controller.marcarRealizada);

export default rotas;
