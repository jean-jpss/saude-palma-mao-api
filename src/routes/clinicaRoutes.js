// =====================================================================
// ROUTES: clinica
// =====================================================================
import { Router } from 'express';
import * as controller from '../controllers/clinicaController.js';
import { autenticar, exigePerfil } from '../middlewares/autenticacao.js';

const rotas = Router();

/**
 * @openapi
 * /clinicas:
 *   get:
 *     tags: [Clinicas]
 *     summary: Lista e pesquisa clinicas
 *     description: |
 *       Requisito 7 da 1a entrega.
 *
 *       A busca por texto procura no nome e tambem no bairro, ignorando
 *       maiusculas. Para o publico idoso, buscar pelo bairro conhecido
 *       costuma ser mais natural que lembrar o nome exato.
 *
 *       O CNPJ nao e devolvido: e dado cadastral da empresa, sem
 *       utilidade para o paciente escolher onde se consultar.
 *     parameters:
 *       - in: query
 *         name: idEspecialidade
 *         schema: { type: integer }
 *         description: Somente clinicas que atendem esta especialidade
 *       - in: query
 *         name: busca
 *         schema: { type: string }
 *         description: Texto livre, procura no nome e no bairro
 *         example: derby
 *       - in: query
 *         name: incluirInativas
 *         schema: { type: boolean }
 *         description: Somente para administrador
 *     responses:
 *       200:
 *         description: Lista de clinicas. Lista vazia nao e erro.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Clinica' }
 *       401:
 *         $ref: '#/components/responses/NaoAutenticado'
 *   post:
 *     tags: [Clinicas]
 *     summary: Cadastra uma clinica
 *     description: |
 *       Requisito 1 da 1a entrega. Perfil administrador.
 *
 *       O CNPJ e validado com digito verificador: catorze numeros nao
 *       bastam. Se `idsEspecialidades` for enviado, a clinica e os
 *       vinculos sao criados na mesma transacao.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nome, cnpj, logradouro]
 *             properties:
 *               nome: { type: string, example: Clinica Boa Viagem }
 *               cnpj: { type: string, example: "11222333000181" }
 *               telefone: { type: string, example: "8130000004" }
 *               email: { type: string, example: contato@exemplo.test }
 *               logradouro: { type: string, example: Avenida Boa Viagem }
 *               numero: { type: string, example: "1500" }
 *               bairro: { type: string, example: Boa Viagem }
 *               cidade: { type: string, default: Recife }
 *               uf: { type: string, default: PE }
 *               cep: { type: string, example: "51020000" }
 *               horarioFuncionamento: { type: string, example: Segunda a sexta, 8h as 18h }
 *               idsEspecialidades:
 *                 type: array
 *                 items: { type: integer }
 *                 example: [1, 2, 8]
 *     responses:
 *       201:
 *         description: Clinica criada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Clinica' }
 *       400:
 *         $ref: '#/components/responses/DadosInvalidos'
 *       403:
 *         $ref: '#/components/responses/SemPermissao'
 *       409:
 *         description: CNPJ_JA_CADASTRADO
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 */
rotas.get('/', autenticar, controller.listar);
rotas.post('/', autenticar, exigePerfil('ADMINISTRADOR'), controller.criar);

/**
 * @openapi
 * /clinicas/{id}:
 *   get:
 *     tags: [Clinicas]
 *     summary: Detalhe de uma clinica
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Dados da clinica
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Clinica' }
 *       404:
 *         $ref: '#/components/responses/NaoEncontrado'
 *   patch:
 *     tags: [Clinicas]
 *     summary: Altera uma clinica
 *     description: |
 *       Atualizacao parcial. Para reativar uma clinica desativada,
 *       envie o campo ativo com valor verdadeiro. Nao existe rota
 *       separada para reativacao.
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
 *               cnpj: { type: string }
 *               telefone: { type: string }
 *               email: { type: string }
 *               logradouro: { type: string }
 *               numero: { type: string }
 *               bairro: { type: string }
 *               cidade: { type: string }
 *               uf: { type: string }
 *               cep: { type: string }
 *               horarioFuncionamento: { type: string }
 *               ativo: { type: boolean }
 *     responses:
 *       200:
 *         description: Clinica alterada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Clinica' }
 *       403:
 *         $ref: '#/components/responses/SemPermissao'
 *       404:
 *         $ref: '#/components/responses/NaoEncontrado'
 *   delete:
 *     tags: [Clinicas]
 *     summary: Desativa uma clinica
 *     description: |
 *       Desativacao logica. Bloqueada quando existirem consultas
 *       futuras marcadas em qualquer profissional desta clinica.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204:
 *         description: Desativada
 *       403:
 *         $ref: '#/components/responses/SemPermissao'
 *       404:
 *         $ref: '#/components/responses/NaoEncontrado'
 *       409:
 *         description: CLINICA_COM_AGENDAMENTOS
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 */
rotas.get('/:id', autenticar, controller.detalhar);
rotas.patch('/:id', autenticar, exigePerfil('ADMINISTRADOR'), controller.atualizar);
rotas.delete('/:id', autenticar, exigePerfil('ADMINISTRADOR'), controller.desativar);

/**
 * @openapi
 * /clinicas/{id}/especialidades:
 *   put:
 *     tags: [Clinicas]
 *     summary: Substitui as especialidades da clinica
 *     description: |
 *       PUT, e nao PATCH, porque o corpo representa o estado final
 *       desejado: o que nao estiver na lista e removido.
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
 *                 example: [1, 3, 5]
 *     responses:
 *       200:
 *         description: Lista substituida
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Clinica' }
 *       400:
 *         description: ESPECIALIDADE_NAO_ENCONTRADA
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Erro' }
 *       403:
 *         $ref: '#/components/responses/SemPermissao'
 *       404:
 *         $ref: '#/components/responses/NaoEncontrado'
 */
rotas.put('/:id/especialidades', autenticar, exigePerfil('ADMINISTRADOR'), controller.substituirEspecialidades);

export default rotas;
