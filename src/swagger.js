// =====================================================================
// CONFIGURACAO DO SWAGGER / OpenAPI 3.0
//
// A especificacao e montada a partir de duas fontes:
//   1. este arquivo, com as informacoes gerais e os schemas reutilizaveis
//   2. as anotacoes JSDoc nos arquivos de src/routes
//
// Manter as anotacoes ao lado das rotas reduz a chance de a
// documentacao divergir do codigo: quem altera a rota ve a anotacao
// logo acima dela.
//
// Documentacao oficial do OpenAPI: https://spec.openapis.org/oas/v3.0.3
// =====================================================================
import swaggerJsdoc from 'swagger-jsdoc';

const definicao = {
    openapi: '3.0.3',
    info: {
        title: 'API Saude na Palma da Mao',
        version: '1.0.0',
        description: `
API de pre-triagem e agendamento de consultas medicas.

Projeto Integrador do curso de Analise e Desenvolvimento de Sistemas,
Faculdade SENAC Pernambuco. 1a entrega.

## Autenticacao

Exceto o cadastro e o login, todas as rotas exigem um token JWT no
cabecalho:

\`\`\`
Authorization: Bearer SEU_TOKEN
\`\`\`

Para obter um token, use POST /autenticacao/login. O token vale 2 horas.

Na interface do Swagger, clique em **Authorize**, no topo da pagina, e
cole apenas o token, sem a palavra Bearer.

## Perfis

- **PACIENTE** marca, consulta e cancela as proprias consultas
- **PROFISSIONAL** administra a propria agenda e confirma atendimentos
- **ADMINISTRADOR** mantem os cadastros de clinicas, profissionais e especialidades

## Fuso horario

A API trabalha em UTC. Os campos de data e hora chegam e saem no
formato ISO 8601. A conversao para America/Recife, que e UTC menos 3,
acontece na interface. Um horario que aparece como 11:00:00.000Z
corresponde a 8 horas da manha em Recife.

## Formato de erro

Toda falha segue o mesmo formato:

\`\`\`json
{ "erro": { "codigo": "HORARIO_INDISPONIVEL", "mensagem": "texto" } }
\`\`\`

O campo codigo serve para o front decidir o que fazer. O campo
mensagem ja vem em portugues.

## Dados de teste

| Perfil | Identificador | Senha |
| --- | --- | --- |
| Paciente | 52998224725 | senhaSegura123 |
| Profissional | carlos.lima@exemplo.test | senha123456 |
| Administrador | admin@exemplo.test | senha123456 |
        `,
        contact: {
            name: 'Projeto Integrador Saude na Palma da Mao'
        }
    },
    servers: [
        { url: 'http://localhost:3000', description: 'Desenvolvimento local' },
        { url: 'https://saude-palma-mao-api.onrender.com', description: 'Ambiente publicado' }
    ],
    tags: [
        { name: 'Autenticacao', description: 'Cadastro de paciente, login e perfil do usuario logado' },
        { name: 'Especialidades', description: 'Consulta publica e manutencao administrativa' },
        { name: 'Clinicas', description: 'Consulta publica e manutencao administrativa' },
        { name: 'Profissionais', description: 'Busca pelo paciente e manutencao administrativa' },
        { name: 'Disponibilidade', description: 'Horarios livres e janelas de atendimento' },
        { name: 'Agendamentos', description: 'Marcar, consultar e cancelar consultas' },
        { name: 'Agenda', description: 'Atendimentos do profissional' }
    ],
    components: {
        securitySchemes: {
            bearerAuth: {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT',
                description: 'Token obtido em POST /autenticacao/login'
            }
        },
        schemas: {
            Erro: {
                type: 'object',
                properties: {
                    erro: {
                        type: 'object',
                        properties: {
                            codigo: { type: 'string', example: 'DADOS_INVALIDOS' },
                            mensagem: { type: 'string', example: 'O CPF informado nao e valido.' }
                        }
                    }
                }
            },
            UsuarioLogado: {
                type: 'object',
                properties: {
                    idUsuario: { type: 'integer', example: 2 },
                    nome: { type: 'string', example: 'Maria da Silva' },
                    email: { type: 'string', example: 'maria.silva@exemplo.com' },
                    tipoUsuario: {
                        type: 'string',
                        enum: ['PACIENTE', 'PROFISSIONAL', 'ADMINISTRADOR'],
                        example: 'PACIENTE'
                    },
                    idPaciente: { type: 'integer', nullable: true, example: 1 },
                    idProfissional: { type: 'integer', nullable: true, example: null }
                }
            },
            RespostaAutenticacao: {
                type: 'object',
                properties: {
                    usuario: { $ref: '#/components/schemas/UsuarioLogado' },
                    token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' }
                }
            },
            Especialidade: {
                type: 'object',
                properties: {
                    idEspecialidade: { type: 'integer', example: 3 },
                    nome: { type: 'string', example: 'Ortopedia' },
                    descricao: {
                        type: 'string',
                        example: 'Cuida de ossos, juntas e musculos. Dores nas costas, joelho, ombro e fraturas.'
                    },
                    ativo: { type: 'boolean', example: true }
                }
            },
            Endereco: {
                type: 'object',
                properties: {
                    logradouro: { type: 'string', example: 'Avenida Portugal' },
                    numero: { type: 'string', example: '100' },
                    bairro: { type: 'string', example: 'Paissandu' },
                    cidade: { type: 'string', example: 'Recife' },
                    uf: { type: 'string', example: 'PE' },
                    cep: { type: 'string', example: '52010010' },
                    completo: {
                        type: 'string',
                        description: 'Linha unica pronta para exibir',
                        example: 'Avenida Portugal, 100, Paissandu, Recife PE'
                    }
                }
            },
            Clinica: {
                type: 'object',
                properties: {
                    idClinica: { type: 'integer', example: 1 },
                    nome: { type: 'string', example: 'Hospital Portugues' },
                    telefone: { type: 'string', nullable: true, example: '8130000001' },
                    email: { type: 'string', nullable: true, example: 'contato@exemplo.test' },
                    horarioFuncionamento: { type: 'string', nullable: true, example: 'Segunda a sexta, 7h as 19h' },
                    ativo: { type: 'boolean', example: true },
                    endereco: { $ref: '#/components/schemas/Endereco' },
                    especialidades: {
                        type: 'array',
                        items: { type: 'string' },
                        example: ['Cardiologia', 'Clinica Geral', 'Geriatria', 'Ortopedia']
                    }
                }
            },
            VinculoProfissionalClinica: {
                type: 'object',
                description: 'Resultado da busca do paciente. O recorte e o VINCULO entre profissional e clinica, porque e o vinculo que possui agenda.',
                properties: {
                    idProfissionalClinica: {
                        type: 'integer',
                        description: 'Identificador do vinculo. E este valor, e nao o idProfissional, que as demais rotas usam.',
                        example: 3
                    },
                    idProfissional: { type: 'integer', example: 2 },
                    nome: { type: 'string', example: 'Carlos Henrique Lima' },
                    registro: { type: 'string', example: 'CRM-PE 10002' },
                    especialidades: { type: 'array', items: { type: 'string' }, example: ['Ortopedia'] },
                    clinica: {
                        type: 'object',
                        properties: {
                            idClinica: { type: 'integer', example: 1 },
                            nome: { type: 'string', example: 'Hospital Portugues' },
                            endereco: { type: 'string', example: 'Avenida Portugal, 100, Paissandu, Recife PE' }
                        }
                    }
                }
            },
            Profissional: {
                type: 'object',
                description: 'Visao administrativa, centrada na pessoa e com todos os seus vinculos reunidos.',
                properties: {
                    idProfissional: { type: 'integer', example: 2 },
                    idUsuario: { type: 'integer', example: 4 },
                    nome: { type: 'string', example: 'Carlos Henrique Lima' },
                    email: { type: 'string', example: 'carlos.lima@exemplo.test' },
                    telefone: { type: 'string', nullable: true, example: '81988880002' },
                    cpf: { type: 'string', example: '15350946056' },
                    conselho: { type: 'string', example: 'CRM' },
                    registroProfissional: { type: 'string', example: '10002' },
                    ufRegistro: { type: 'string', example: 'PE' },
                    registro: { type: 'string', example: 'CRM-PE 10002' },
                    ativo: { type: 'boolean', example: true },
                    especialidades: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                idEspecialidade: { type: 'integer', example: 3 },
                                nome: { type: 'string', example: 'Ortopedia' }
                            }
                        }
                    },
                    clinicas: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                idProfissionalClinica: { type: 'integer', example: 3 },
                                idClinica: { type: 'integer', example: 1 },
                                nome: { type: 'string', example: 'Hospital Portugues' },
                                ativo: { type: 'boolean', example: true }
                            }
                        }
                    }
                }
            },
            HorariosDisponiveis: {
                type: 'object',
                properties: {
                    idProfissionalClinica: { type: 'integer', example: 3 },
                    data: { type: 'string', format: 'date', example: '2026-10-22' },
                    horarios: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                idDisponibilidade: { type: 'integer', example: 133 },
                                dataHora: {
                                    type: 'string',
                                    format: 'date-time',
                                    description: 'UTC. 11:00Z corresponde a 8h em Recife.',
                                    example: '2026-10-22T11:00:00.000Z'
                                }
                            }
                        }
                    }
                }
            },
            Janela: {
                type: 'object',
                description: 'Janela de atendimento cadastrada. Os horarios individuais nao sao armazenados, sao calculados a partir dela.',
                properties: {
                    idDisponibilidade: { type: 'integer', example: 133 },
                    idProfissionalClinica: { type: 'integer', example: 3 },
                    dataAtendimento: { type: 'string', format: 'date', example: '2026-10-22' },
                    horaInicio: { type: 'string', example: '08:00' },
                    horaFim: { type: 'string', example: '12:00' },
                    duracaoMinutos: { type: 'integer', example: 30 },
                    ativo: { type: 'boolean', example: true },
                    profissional: { type: 'string', example: 'Carlos Henrique Lima' },
                    clinica: { type: 'string', example: 'Hospital Portugues' },
                    agendamentosAtivos: {
                        type: 'integer',
                        description: 'Consultas marcadas dentro desta janela. Maior que zero impede a desativacao.',
                        example: 0
                    }
                }
            },
            Agendamento: {
                type: 'object',
                properties: {
                    idAgendamento: { type: 'integer', example: 4 },
                    dataHora: { type: 'string', format: 'date-time', example: '2026-10-22T11:00:00.000Z' },
                    status: {
                        type: 'string',
                        enum: ['AGENDADO', 'CONFIRMADO', 'CANCELADO', 'REALIZADO'],
                        example: 'AGENDADO'
                    },
                    observacao: { type: 'string', nullable: true, example: 'Dor no joelho ha duas semanas' },
                    canceladoEm: { type: 'string', format: 'date-time', nullable: true, example: null },
                    motivoCancelamento: { type: 'string', nullable: true, example: null },
                    criadoEm: { type: 'string', format: 'date-time', example: '2026-10-06T01:50:47.423Z' },
                    paciente: {
                        type: 'object',
                        properties: {
                            idPaciente: { type: 'integer', example: 1 },
                            nome: { type: 'string', example: 'Maria da Silva' }
                        }
                    },
                    especialidade: {
                        type: 'object',
                        properties: {
                            idEspecialidade: { type: 'integer', example: 3 },
                            nome: { type: 'string', example: 'Ortopedia' }
                        }
                    },
                    profissional: {
                        type: 'object',
                        properties: {
                            idProfissionalClinica: { type: 'integer', example: 3 },
                            nome: { type: 'string', example: 'Carlos Henrique Lima' },
                            registro: { type: 'string', example: 'CRM-PE 10002' }
                        }
                    },
                    clinica: {
                        type: 'object',
                        properties: {
                            idClinica: { type: 'integer', example: 1 },
                            nome: { type: 'string', example: 'Hospital Portugues' },
                            endereco: { type: 'string', example: 'Avenida Portugal, 100, Paissandu, Recife PE' }
                        }
                    }
                }
            },
            ItemAgenda: {
                allOf: [
                    { $ref: '#/components/schemas/Agendamento' },
                    {
                        type: 'object',
                        description: 'Na agenda do profissional, o paciente traz telefone e data de nascimento, uteis no atendimento.',
                        properties: {
                            paciente: {
                                type: 'object',
                                properties: {
                                    idPaciente: { type: 'integer', example: 1 },
                                    nome: { type: 'string', example: 'Maria da Silva' },
                                    telefone: { type: 'string', nullable: true, example: '81999998888' },
                                    dataNascimento: { type: 'string', format: 'date', example: '1955-03-14' }
                                }
                            }
                        }
                    }
                ]
            }
        },
        responses: {
            NaoAutenticado: {
                description: 'Token ausente, invalido ou expirado',
                content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } }
            },
            SemPermissao: {
                description: 'O perfil do usuario nao tem acesso a esta operacao',
                content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } }
            },
            DadosInvalidos: {
                description: 'Erro de validacao da entrada',
                content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } }
            },
            NaoEncontrado: {
                description: 'Registro inexistente ou pertencente a outro usuario',
                content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } }
            },
            Conflito: {
                description: 'A operacao viola uma regra de negocio ou uma restricao de unicidade',
                content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } }
            }
        }
    },
    // Aplica a autenticacao a todas as rotas por padrao. As que nao
    // exigem token declaram "security: []" na propria anotacao.
    security: [{ bearerAuth: [] }]
};

export const especificacaoSwagger = swaggerJsdoc({
    definition: definicao,
    // Caminho relativo ao diretorio de onde o processo e iniciado, que
    // e a raiz do projeto tanto no desenvolvimento quanto no Render.
    apis: ['./src/routes/*.js']
});
