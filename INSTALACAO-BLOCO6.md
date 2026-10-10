# Bloco 2 (lacunas de funcionalidade)

Novas rotas:
- GET   /pacientes/eu            dados completos do paciente logado
- PATCH /pacientes/eu            atualiza nome, email, telefone, nascimento, sexo, observacoes (CPF nao muda)
- GET   /pacientes?cpf=&nome=    consulta administrativa (so ADMINISTRADOR)
- GET   /profissionais-clinicas?nome=   novo filtro por nome do profissional

## Arquivos (copiar para a pasta src do projeto, substituindo)
src/servidor.js
src/swagger.js
src/utilitarios.js
src/models/pacienteModel.js
src/models/profissionalModel.js
src/controllers/pacienteController.js        (novo)
src/controllers/profissionalClinicaController.js
src/routes/pacienteRoutes.js                 (novo)
src/routes/profissionalClinicaRoutes.js

Nao ha mudanca no banco e nenhuma dependencia nova.
