// =====================================================================
// ROUTES: profissional, visao administrativa
// =====================================================================
import { Router } from 'express';
import * as controller from '../controllers/profissionalController.js';
import { autenticar, exigePerfil } from '../middlewares/autenticacao.js';

const rotas = Router();

const somenteAdmin = [autenticar, exigePerfil('ADMINISTRADOR')];

rotas.get('/', somenteAdmin, controller.listar);
rotas.post('/', somenteAdmin, controller.criar);
rotas.get('/:id', somenteAdmin, controller.detalhar);
rotas.patch('/:id', somenteAdmin, controller.atualizar);
rotas.put('/:id/especialidades', somenteAdmin, controller.substituirEspecialidades);
rotas.post('/:id/clinicas', somenteAdmin, controller.vincularClinica);
rotas.delete('/:id/clinicas/:idClinica', somenteAdmin, controller.desativarVinculo);
rotas.delete('/:id', somenteAdmin, controller.desativar);

export default rotas;
