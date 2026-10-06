// =====================================================================
// ROUTES: agendamento
// =====================================================================
import { Router } from 'express';
import * as controller from '../controllers/agendamentoController.js';
import { autenticar, exigePerfil } from '../middlewares/autenticacao.js';

const rotas = Router();

rotas.post('/', autenticar, exigePerfil('PACIENTE'), controller.criar);
rotas.get('/', autenticar, exigePerfil('PACIENTE'), controller.listarDoPaciente);
rotas.get('/:id', autenticar, controller.detalhar);
rotas.patch('/:id/cancelamento', autenticar, exigePerfil('PACIENTE', 'ADMINISTRADOR'), controller.cancelar);
rotas.patch('/:id/confirmacao', autenticar, exigePerfil('PROFISSIONAL', 'ADMINISTRADOR'), controller.confirmar);
rotas.patch('/:id/realizacao', autenticar, exigePerfil('PROFISSIONAL', 'ADMINISTRADOR'), controller.marcarRealizada);

export default rotas;
