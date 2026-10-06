// =====================================================================
// ROUTES: busca de profissionais pelo paciente
// =====================================================================
import { Router } from 'express';
import * as controller from '../controllers/profissionalClinicaController.js';
import { autenticar } from '../middlewares/autenticacao.js';

const rotas = Router();

rotas.get('/', autenticar, controller.listar);

export default rotas;
