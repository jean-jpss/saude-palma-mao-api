# P3: cadastro de disponibilidade

Requisito 10 da 1a entrega: "permitir que sejam cadastrados os dias e
horarios disponiveis para atendimento de cada profissional".

## 1. Substituir o arquivo

`disponibilidades.js` **substitui** o que ja existe em `src/rotas/`.
O arquivo cresceu de 4,6 KB para cerca de 15 KB. A rota GET que ja
funcionava continua igual, com duas rotas novas e uma de listagem de
janelas adicionadas.

Nenhuma alteracao no `servidor.js`: o `app.use('/disponibilidades', ...)`
ja esta registrado.

## 2. Rotas do arquivo

| Metodo e rota | Perfil | O que faz |
| --- | --- | --- |
| `GET /disponibilidades` | autenticado | horarios livres de um profissional em uma data |
| `GET /disponibilidades/janelas` | profissional, admin | janelas cadastradas, com contagem de agendamentos |
| `POST /disponibilidades` | profissional, admin | cadastra uma janela |
| `DELETE /disponibilidades/:id` | profissional, admin | desativa uma janela |

A ordem no arquivo importa: `/janelas` vem antes de `/:id` para nao
ser capturada como se fosse um identificador.

## 3. Testes

```powershell
$api = "http://localhost:3000"

$login = @{ identificador = "carlos.lima@exemplo.test"; senha = "senha123456" } | ConvertTo-Json
$rp = Invoke-RestMethod -Uri "$api/autenticacao/login" -Method Post -Body $login -ContentType "application/json"
$prof = @{ Authorization = "Bearer $($rp.token)" }
```

### 3.1 Listar as janelas ja cadastradas

```powershell
Invoke-RestMethod -Uri "$api/disponibilidades/janelas?de=2026-10-13&ate=2026-10-15" -Headers $prof | ConvertTo-Json -Depth 3
```

Esperado: as janelas do seed, duas por dia util, com `horaInicio`
"08:00" e "14:00". O campo `agendamentosAtivos` mostra quantas
consultas existem dentro de cada janela.

### 3.2 Cadastrar uma janela nova

O Carlos vai atender tambem no fim da tarde:

```powershell
$janela = @{
  idProfissionalClinica = 3
  dataAtendimento = "2026-10-20"
  horaInicio = "17:00"
  horaFim = "19:00"
  duracaoMinutos = 30
} | ConvertTo-Json

Invoke-RestMethod -Uri "$api/disponibilidades" -Method Post -Body $janela -ContentType "application/json" -Headers $prof | ConvertTo-Json
```

Esperado: HTTP 201, com `horariosGerados: 4` (17:00, 17:30, 18:00, 18:30).

### 3.3 Os horarios aparecem na busca do paciente

```powershell
$loginPac = @{ identificador = "52998224725"; senha = "senhaSegura123" } | ConvertTo-Json
$r = Invoke-RestMethod -Uri "$api/autenticacao/login" -Method Post -Body $loginPac -ContentType "application/json"
$cab = @{ Authorization = "Bearer $($r.token)" }

(Invoke-RestMethod -Uri "$api/disponibilidades?idProfissionalClinica=3&data=2026-10-20" -Headers $cab).horarios.Count
```

Esperado: 18. Catorze das duas janelas do seed mais quatro da janela
nova. Isso prova o ciclo completo: o profissional cadastra, o paciente
enxerga.

### 3.4 Sobreposicao e barrada

```powershell
$conflito = @{
  idProfissionalClinica = 3
  dataAtendimento = "2026-10-20"
  horaInicio = "18:00"
  horaFim = "20:00"
} | ConvertTo-Json

Invoke-RestMethod -Uri "$api/disponibilidades" -Method Post -Body $conflito -ContentType "application/json" -Headers $prof
```

A janela das 18:00 as 20:00 cruza com a das 17:00 as 19:00.
Esperado: `JANELA_SOBREPOSTA`, HTTP 409.

Sem essa validacao, o mesmo horario seria gerado duas vezes na
listagem do paciente.

### 3.5 Data no passado

```powershell
$ontem = (Get-Date).AddDays(-1).ToString("yyyy-MM-dd")
$velha = @{ idProfissionalClinica = 3; dataAtendimento = $ontem; horaInicio = "08:00"; horaFim = "12:00" } | ConvertTo-Json

Invoke-RestMethod -Uri "$api/disponibilidades" -Method Post -Body $velha -ContentType "application/json" -Headers $prof
```

Esperado: `DATA_NO_PASSADO`, HTTP 400.

### 3.6 Hora final antes da inicial

```powershell
$invertida = @{ idProfissionalClinica = 3; dataAtendimento = "2026-10-21"; horaInicio = "14:00"; horaFim = "10:00" } | ConvertTo-Json

Invoke-RestMethod -Uri "$api/disponibilidades" -Method Post -Body $invertida -ContentType "application/json" -Headers $prof
```

Esperado: `DADOS_INVALIDOS`, HTTP 400.

### 3.7 Janela menor que a consulta

```powershell
$curta = @{ idProfissionalClinica = 3; dataAtendimento = "2026-10-21"; horaInicio = "08:00"; horaFim = "08:20"; duracaoMinutos = 30 } | ConvertTo-Json

Invoke-RestMethod -Uri "$api/disponibilidades" -Method Post -Body $curta -ContentType "application/json" -Headers $prof
```

Vinte minutos nao comportam uma consulta de trinta. Nenhum horario
seria gerado, entao a janela nao faz sentido.
Esperado: `DADOS_INVALIDOS`, HTTP 400.

### 3.8 Cadastrar na agenda de outro profissional

```powershell
$alheia = @{ idProfissionalClinica = 5; dataAtendimento = "2026-10-21"; horaInicio = "08:00"; horaFim = "12:00" } | ConvertTo-Json

Invoke-RestMethod -Uri "$api/disponibilidades" -Method Post -Body $alheia -ContentType "application/json" -Headers $prof
```

O vinculo 5 e do Rafael, no Hospital Esperanca.
Esperado: `SEM_PERMISSAO`, HTTP 403.

### 3.9 Desativar uma janela vazia

```powershell
$id = (Invoke-RestMethod -Uri "$api/disponibilidades/janelas?de=2026-10-20&ate=2026-10-20" -Headers $prof |
       Where-Object { $_.horaInicio -eq '17:00' }).idDisponibilidade

Invoke-RestMethod -Uri "$api/disponibilidades/$id" -Method Delete -Headers $prof
```

Esperado: HTTP 204, sem corpo. O PowerShell nao imprime nada, o que e
o resultado correto.

Confirme que os horarios sumiram:

```powershell
(Invoke-RestMethod -Uri "$api/disponibilidades?idProfissionalClinica=3&data=2026-10-20" -Headers $cab).horarios.Count
```

Esperado: 14, de volta ao numero das janelas do seed.

### 3.10 Desativar janela com consulta marcada

Primeiro marque uma consulta dentro de uma janela:

```powershell
$h = (Invoke-RestMethod -Uri "$api/disponibilidades?idProfissionalClinica=3&data=2026-10-21" -Headers $cab).horarios
$novo = @{ idProfissionalClinica = 3; idEspecialidade = 3; dataHora = $h[0].dataHora } | ConvertTo-Json
Invoke-RestMethod -Uri "$api/agendamentos" -Method Post -Body $novo -ContentType "application/json" -Headers $cab | Out-Null
```

Agora tente desativar a janela da manha desse dia:

```powershell
$idManha = (Invoke-RestMethod -Uri "$api/disponibilidades/janelas?de=2026-10-21&ate=2026-10-21" -Headers $prof |
            Where-Object { $_.horaInicio -eq '08:00' }).idDisponibilidade

Invoke-RestMethod -Uri "$api/disponibilidades/$idManha" -Method Delete -Headers $prof
```

Esperado: `DISPONIBILIDADE_COM_AGENDAMENTOS`, HTTP 409, com a mensagem
dizendo quantas consultas impedem e orientando a consultar a agenda.

Esta e a regra 1.3 do documento de regras em funcionamento.

### 3.11 Desativar duas vezes

Repita o comando do item 3.9 com o mesmo id.
Esperado: `TRANSICAO_STATUS_INVALIDA`, HTTP 409.

### 3.12 Paciente nao cadastra janela

```powershell
$tentativa = @{ idProfissionalClinica = 3; dataAtendimento = "2026-10-22"; horaInicio = "08:00"; horaFim = "12:00" } | ConvertTo-Json

Invoke-RestMethod -Uri "$api/disponibilidades" -Method Post -Body $tentativa -ContentType "application/json" -Headers $cab
```

Esperado: `SEM_PERMISSAO`, HTTP 403.

## 4. Codigos de erro novos

Tres codigos criados neste bloco, para entrarem na secao 5 do
documento de regras e no guia da API do front-end:

| Codigo | HTTP | Quando ocorre |
| --- | --- | --- |
| `DATA_NO_PASSADO` | 400 | cadastro de janela em data ja passada |
| `JANELA_SOBREPOSTA` | 409 | janela cruza com outra ja cadastrada no mesmo dia |
| `DISPONIBILIDADE_COM_AGENDAMENTOS` | 409 | ja previsto no documento, agora implementado |

Mensagens sugeridas para o front:

- `DATA_NO_PASSADO`: "Essa data ja passou. Escolha uma data futura."
- `JANELA_SOBREPOSTA`: "Voce ja tem atendimento marcado nesse horario neste dia."
- `DISPONIBILIDADE_COM_AGENDAMENTOS`: usar a mensagem que a API devolve, que ja traz a quantidade.

## 5. Alteracao necessaria no documento de regras

A secao 1.3 diz que o erro `DISPONIBILIDADE_COM_AGENDAMENTOS` deve
trazer "a lista dos agendamentos que impedem a operacao no corpo do
erro".

A implementacao informa a quantidade, nao a lista. A decisao do grupo
foi manter o formato de erro estavel em toda a API nesta entrega, ja
que o profissional pode ver quais sao as consultas pela rota
`GET /agenda`.

Registrar na v4:

- ajustar o texto da secao 1.3
- acrescentar "detalhamento dos agendamentos bloqueantes" na secao 8,
  Fora do escopo da 1a entrega
- registrar a mudanca na secao 9, historico de versoes
