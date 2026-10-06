// =====================================================================
// ROUTES: clinica
// =====================================================================
import { Router } from 'express';
import * as controller from '../controllers/clinicaController.js';
import { autenticar, exigePerfil } from '../middlewares/autenticacao.js';

const rotas = Router();

rotas.get('/', autenticar, controller.listar);
rotas.post('/', autenticar, exigePerfil('ADMINISTRADOR'), controller.criar);
rotas.get('/:id', autenticar, controller.detalhar);
rotas.patch('/:id', autenticar, exigePerfil('ADMINISTRADOR'), controller.atualizar);
rotas.put('/:id/especialidades', autenticar, exigePerfil('ADMINISTRADOR'), controller.substituirEspecialidades);
rotas.delete('/:id', autenticar, exigePerfil('ADMINISTRADOR'), controller.desativar);

export default rotas;
