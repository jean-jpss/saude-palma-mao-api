// =====================================================================
// ROUTES: agenda do profissional
// =====================================================================
import { Router } from 'express';
import * as controller from '../controllers/agendaController.js';
import { autenticar, exigePerfil } from '../middlewares/autenticacao.js';

const rotas = Router();

rotas.get('/', autenticar, exigePerfil('PROFISSIONAL', 'ADMINISTRADOR'), controller.listar);

export default rotas;
