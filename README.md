# saude-palma-mao-api

API do Projeto Integrador "Saude na Palma da Mao".
Primeira entrega: 14/10/2026.

## Requisitos

- Node.js 24 LTS
- Acesso a um banco PostgreSQL 15 ou superior

## Como rodar localmente

1. `npm install`
2. `cp .env.example .env` e preencha os valores
3. `npm run dev`
4. Abra `http://localhost:3000/saude`

A resposta esperada e um JSON com `status: "ok"` e a hora do servidor de banco.
Se vier `BANCO_INDISPONIVEL`, o problema esta na `DATABASE_URL` ou no TLS.

## Deploy no Render

- Tipo de servico: Web Service
- Build command: `npm install`
- Start command: `npm start`
- Variaveis de ambiente: as mesmas do `.env.example`, exceto `PORTA`,
  que o Render define sozinho
- Health check path: `/saude`

Atencao: no plano gratuito o servico hiberna apos 15 minutos sem uso e a
primeira requisicao seguinte demora cerca de um minuto. Abra a aplicacao
alguns minutos antes de qualquer demonstracao.

## Padrao de resposta de erro

Todo erro da API segue o formato:

```json
{ "erro": { "codigo": "HORARIO_INDISPONIVEL", "mensagem": "..." } }
```

## Convencoes

- Banco em `snake_case`, JSON da API em `camelCase`
- Identificadores, rotas e nomes de coluna sem acento e sem cedilha
- Texto exibido ao usuario com acentuacao normal
- Rotas no plural: `/pacientes`, `/agendamentos`, `/especialidades`
