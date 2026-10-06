// =====================================================================
// ROUTES: especialidade
// =====================================================================
import { Router } from 'express';
import * as controller from '../controllers/especialidadeController.js';
import { autenticar, exigePerfil } from '../middlewares/autenticacao.js';

const rotas = Router();

rotas.get('/', autenticar, controller.listar);
rotas.post('/', autenticar, exigePerfil('ADMINISTRADOR'), controller.criar);
rotas.patch('/:id', autenticar, exigePerfil('ADMINISTRADOR'), controller.atualizar);
rotas.delete('/:id', autenticar, exigePerfil('ADMINISTRADOR'), controller.desativar);

export default rotas;
