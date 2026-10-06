// =====================================================================
// APRESENTADORES
//
// Convertem a linha do banco (snake_case) no objeto da API (camelCase).
//
// Ficam separados porque a mesma conversao e usada por mais de um
// controller, e porque isolar a traducao em um lugar so garante que a
// API responda sempre no mesmo formato.
// =====================================================================

export const apresentarEspecialidade = (e) => ({
    idEspecialidade: Number(e.id_especialidade),
    nome: e.nome,
    descricao: e.descricao,
    ativo: e.ativo
});

export const apresentarClinica = (r) => ({
    idClinica: Number(r.id_clinica),
    nome: r.nome,
    telefone: r.telefone,
    email: r.email,
    horarioFuncionamento: r.horario_funcionamento,
    ativo: r.ativo,
    endereco: {
        logradouro: r.logradouro,
        numero: r.numero,
        bairro: r.bairro,
        cidade: r.cidade,
        uf: r.uf,
        cep: r.cep,
        // Linha unica pronta para exibir, para o front nao precisar
        // concatenar campo por campo em cada tela.
        completo: `${r.logradouro}, ${r.numero}, ${r.bairro}, ${r.cidade} ${r.uf}`
    },
    especialidades: r.especialidades ?? []
});

export const apresentarProfissional = (r) => ({
    idProfissional: Number(r.id_profissional),
    idUsuario: Number(r.id_usuario),
    nome: r.nome,
    email: r.email,
    telefone: r.telefone,
    cpf: r.cpf,
    conselho: r.conselho,
    registroProfissional: r.registro_profissional,
    ufRegistro: r.uf_registro,
    registro: `${r.conselho}-${r.uf_registro} ${r.registro_profissional}`,
    ativo: r.ativo,
    especialidades: (r.especialidades ?? []).map((e) => ({
        idEspecialidade: Number(e.id),
        nome: e.nome
    })),
    clinicas: (r.clinicas ?? []).map((c) => ({
        idProfissionalClinica: Number(c.id_pc),
        idClinica: Number(c.id_clinica),
        nome: c.nome,
        ativo: c.ativo
    }))
});

export const apresentarVinculoBusca = (r) => ({
    idProfissionalClinica: Number(r.id_profissional_clinica),
    idProfissional: Number(r.id_profissional),
    nome: r.nome_profissional,
    registro: `${r.conselho}-${r.uf_registro} ${r.registro_profissional}`,
    especialidades: r.especialidades,
    clinica: {
        idClinica: Number(r.id_clinica),
        nome: r.nome_clinica,
        endereco: `${r.logradouro}, ${r.numero}, ${r.bairro}, ${r.cidade} ${r.uf}`
    }
});

export const apresentarJanela = (r) => ({
    idDisponibilidade: Number(r.id_disponibilidade),
    idProfissionalClinica: Number(r.id_profissional_clinica),
    dataAtendimento: r.data_atendimento,
    horaInicio: r.hora_inicio,
    horaFim: r.hora_fim,
    duracaoMinutos: r.duracao_minutos,
    ativo: r.ativo,
    profissional: r.nome_profissional,
    clinica: r.nome_clinica,
    // Util na tela: o botao de desativar fica desabilitado quando este
    // numero for maior que zero.
    agendamentosAtivos: Number(r.agendamentos_ativos)
});

export const apresentarAgendamento = (r) => ({
    idAgendamento: Number(r.id_agendamento),
    dataHora: r.data_hora,
    status: r.status,
    observacao: r.observacao,
    canceladoEm: r.cancelado_em,
    motivoCancelamento: r.motivo_cancelamento,
    criadoEm: r.criado_em,
    paciente: {
        idPaciente: Number(r.id_paciente),
        nome: r.nome_paciente
    },
    especialidade: {
        idEspecialidade: Number(r.id_especialidade),
        nome: r.nome_especialidade
    },
    profissional: {
        idProfissionalClinica: Number(r.id_profissional_clinica),
        nome: r.nome_profissional,
        registro: `${r.conselho}-${r.uf_registro} ${r.registro_profissional}`
    },
    clinica: {
        idClinica: Number(r.id_clinica),
        nome: r.nome_clinica,
        endereco: `${r.logradouro}, ${r.numero}, ${r.bairro}, ${r.cidade} ${r.uf}`
    }
});

export const apresentarAgendaItem = (r) => ({
    ...apresentarAgendamento(r),
    paciente: {
        idPaciente: Number(r.id_paciente),
        nome: r.nome_paciente,
        telefone: r.telefone_paciente,
        dataNascimento: r.data_nascimento_paciente
    }
});
