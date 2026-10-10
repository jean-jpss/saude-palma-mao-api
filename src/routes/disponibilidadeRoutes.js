// =====================================================================
// ROUTES: disponibilidade
//
// A ordem aqui importa: "/janelas" precisa vir antes de "/:id", senao
// a palavra "janelas" seria capturada como se fosse um identificador.
// =====================================================================
import { Router } from 'express';
import * as controller from '../controllers/disponibilidadeController.js';
import { autenticar, exigePerfil } from '../middlewares/autenticacao.js';

const rotas = Router();

const profissionalOuAdmin = [autenticar, exigePerfil('PROFISSIONAL', 'ADMINISTRADOR')];

/**
 * @openapi
 * /disponibilidades:
 *   get:
 *     tags: [Disponibilidade]
 *     summary: Lista os horarios livres de um profissional em uma data
 *     description: |
 *       Requisito 11 da 1a entrega.
 *
 *       A tabela guarda JANELAS de atendimento, por exemplo das 08:00
 *       as 12:00 com consultas de 30 minutos. Os horarios individuais
 *       sao calculados a partir delas, nao armazenados.
 *
 *       A API devolve apenas o que pode ser marcado. Ela ja remove:
 *       horarios nas proximas 24 horas, horarios alem de 60 dias e
 *       horarios ja ocupados por outro paciente.
 *
 *       Por isso, **consultar o dia de hoje sempre devolve lista
 *       vazia**: as janelas existem, mas todos os horarios caem dentro
 *       das proximas 24 horas. Isso e o comportamento correto, nao um
 *       defeito. No calendario, deixe hoje e amanha desabilitados.
 *
 *       Lista vazia tambem nao e erro: mostre um estado vazio
 *       amigavel, do tipo "nao ha horarios livres neste dia".
 *     parameters:
 *       - in: query
 *         name: idProfissionalClinica
 *         required: true
 *         schema: { type: integer }
 *         example: 3
 *       - in: query
 *         name: data
 *         required: true
 *         schema: { type: string, format: date }
 *         example: "2026-10-22"
 *     responses:
 *       200:
 *         description: Horarios livres, em UTC
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/HorariosDisponiveis' }
 *       400:
 *         $ref: '#/components/responses/DadosInvalidos'
 *       401:
 *         $ref: '#/components/responses/NaoAutenticado'
 *   post:
 *     tags: [Disponibilidade]
 *     summary: Cadastra uma janela de atendimento
 *     description: |
 *       Requisito 10 da 1a entrega. Perfil profissional ou administrador.
 *
 *       Um profissional so cadastra na propria agenda.
 *
 *       Duas janelas do mesmo vinculo no mesmo dia nao podem se cruzar,
 *       senao o mesmo horario seria gerado duas vezes na listagem do
 *       paciente.
 *
 *       A resposta inclui `horariosGerados`, confirmando quantos
 *       horarios a janela produz.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [idProfissionalClinica, dataAtendimento, horaInicio, horaFim]
 *             properties:
 *               idProfissionalClinica: { type: integer, example: 3 }
 *               dataAtendimento: { type: string, format: date, example: "2026-10-22" }
 *               horaInicio: { type: string, example: "17:00" }
 *               horaFim: { type: string, example: "19:00" }
 *               duracaoMinutos: { type: integer, default: 30, minimum: 5, maximum: 240 }
 *     responses:
 *       201:
 *         description: Janela criada
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Janela'
 *                 - type: object
 *                   properties:
 *                     horariosGerados: { type: integer, example: 4 }
 *       400:
 *         description: DADOS_INVALIDOS, DATA_NO_PASSADO ou PROFISSIONAL_CLINICA_INATIVO
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 *       403:
 *         $ref: '#/components/responses/SemPermissao'
 *       409:
 *         description: JANELA_SOBREPOSTA
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 */
rotas.get('/', autenticar, controller.listarHorarios);

/**
 * @openapi
 * /disponibilidades/janelas:
 *   get:
 *     tags: [Disponibilidade]
 *     summary: Lista as janelas cadastradas
 *     description: |
 *       Visao de quem administra a agenda, nao de quem marca consulta.
 *       O profissional precisa ver o que ja cadastrou e obter os
 *       identificadores para desativar.
 *
 *       O campo `agendamentosAtivos` diz quantas consultas existem
 *       dentro de cada janela. Use para desabilitar o botao de
 *       desativar quando for maior que zero.
 *     parameters:
 *       - in: query
 *         name: de
 *         schema: { type: string, format: date }
 *         example: "2026-10-20"
 *       - in: query
 *         name: ate
 *         schema: { type: string, format: date }
 *         example: "2026-10-25"
 *       - in: query
 *         name: idProfissionalClinica
 *         schema: { type: integer }
 *         description: Somente administrador. Profissional ve apenas as proprias.
 *     responses:
 *       200:
 *         description: Janelas cadastradas
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Janela' }
 *       403:
 *         $ref: '#/components/responses/SemPermissao'
 */
rotas.get('/janelas', profissionalOuAdmin, controller.listarJanelas);
rotas.post('/', profissionalOuAdmin, controller.criar);

/**
 * @openapi
 * /disponibilidades/{id}:
 *   delete:
 *     tags: [Disponibilidade]
 *     summary: Desativa uma janela de atendimento
 *     description: |
 *       Desativacao logica. A janela continua no banco com `ativo`
 *       falso, preservando o historico.
 *
 *       Regra 1.3 do documento de regras: a desativacao e bloqueada
 *       enquanto existirem consultas ativas e futuras dentro da janela.
 *       Para desativar, o profissional cancela essas consultas uma a
 *       uma, o que dispara a notificacao normal para cada paciente.
 *       Cancelamento em cascata automatico foi descartado pelo grupo:
 *       removeria o agendamento do paciente sem decisao caso a caso.
 *
 *       O erro informa quantas consultas impedem a operacao. Para ver
 *       quais sao, consulte GET /agenda.
 *
 *       Janela de outro profissional devolve 404, nao 403: dizer
 *       "existe, mas nao e sua" ja entrega informacao alheia.
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
 *         description: DISPONIBILIDADE_COM_AGENDAMENTOS ou TRANSICAO_STATUS_INVALIDA
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 */
rotas.delete('/:id', profissionalOuAdmin, controller.desativar);

export default rotas;
