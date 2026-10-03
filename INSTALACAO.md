# Bloco 4: agendamentos

## 1. Copiar o arquivo

`agendamentos.js` vai para `src/rotas/`.

## 2. Registrar no servidor.js

Junto dos outros imports:

```javascript
import rotasAgendamentos from './rotas/agendamentos.js';
```

E na secao de rotas de dominio, junto das outras quatro:

```javascript
app.use('/agendamentos', rotasAgendamentos);
```

Confirme que ficou uma ocorrencia so:

```powershell
Select-String -Path src\servidor.js -Pattern "app.use\('/agendamentos'"
```

## 3. Preparar o terminal

```powershell
$login = @{ identificador = "52998224725"; senha = "senhaSegura123" } | ConvertTo-Json
$r = Invoke-RestMethod -Uri http://localhost:3000/autenticacao/login -Method Post -Body $login -ContentType "application/json"
$cab = @{ Authorization = "Bearer $($r.token)" }
```

## 4. Testes

### 4.1 Marcar uma consulta

Pegue um horario livre primeiro:

```powershell
$h = (Invoke-RestMethod -Uri "http://localhost:3000/disponibilidades?idProfissionalClinica=3&data=2026-10-13" -Headers $cab).horarios
$h[0].dataHora
```

Carlos Henrique Lima (idProfissionalClinica 3) atende Ortopedia, que e
a especialidade de id 3.

```powershell
$novo = @{
  idProfissionalClinica = 3
  idEspecialidade = 3
  dataHora = $h[0].dataHora
  observacao = "Dor no joelho ha duas semanas"
} | ConvertTo-Json

Invoke-RestMethod -Uri http://localhost:3000/agendamentos -Method Post -Body $novo -ContentType "application/json" -Headers $cab | ConvertTo-Json -Depth 3
```

Esperado: HTTP 201 com o agendamento completo, status AGENDADO.

### 4.2 O horario sai da listagem

```powershell
(Invoke-RestMethod -Uri "http://localhost:3000/disponibilidades?idProfissionalClinica=3&data=2026-10-13" -Headers $cab).horarios.Count
```

Esperado: 13, um a menos que os 14 anteriores.

### 4.3 Mesmo horario de novo

Repita o comando do item 4.1 sem alterar nada.

Esperado: `PACIENTE_JA_AGENDADO`, HTTP 409. O paciente ja tem consulta
nesse instante, e o indice unico do banco barra.

### 4.4 Especialidade que o profissional nao atende

```powershell
$errado = @{
  idProfissionalClinica = 3
  idEspecialidade = 2
  dataHora = $h[1].dataHora
} | ConvertTo-Json

Invoke-RestMethod -Uri http://localhost:3000/agendamentos -Method Post -Body $errado -ContentType "application/json" -Headers $cab
```

Carlos atende Ortopedia, nao Cardiologia.
Esperado: `ESPECIALIDADE_NAO_ATENDIDA`, HTTP 400.

### 4.5 Horario fora da grade

```powershell
$fora = @{
  idProfissionalClinica = 3
  idEspecialidade = 3
  dataHora = "2026-10-13T08:17:00-03:00"
} | ConvertTo-Json

Invoke-RestMethod -Uri http://localhost:3000/agendamentos -Method Post -Body $fora -ContentType "application/json" -Headers $cab
```

08:17 esta dentro da janela das 08:00 as 12:00 e mesmo assim e
invalido, porque nao e inicio de slot. Item 1.2 do documento.
Esperado: `HORARIO_INVALIDO`, HTTP 400.

### 4.6 Antecedencia insuficiente

```powershell
$amanha = (Get-Date).AddHours(5).ToString("yyyy-MM-ddTHH:00:00-03:00")
$cedo = @{ idProfissionalClinica = 3; idEspecialidade = 3; dataHora = $amanha } | ConvertTo-Json

Invoke-RestMethod -Uri http://localhost:3000/agendamentos -Method Post -Body $cedo -ContentType "application/json" -Headers $cab
```

Esperado: `ANTECEDENCIA_INSUFICIENTE`, HTTP 400.

### 4.7 Horario no passado

```powershell
$ontem = (Get-Date).AddDays(-1).ToString("yyyy-MM-ddT09:00:00-03:00")
$passado = @{ idProfissionalClinica = 3; idEspecialidade = 3; dataHora = $ontem } | ConvertTo-Json

Invoke-RestMethod -Uri http://localhost:3000/agendamentos -Method Post -Body $passado -ContentType "application/json" -Headers $cab
```

Esperado: `HORARIO_NO_PASSADO`, HTTP 400.

### 4.8 Limite de 5

Marque mais quatro consultas em horarios diferentes, usando `$h[1]`,
`$h[2]`, `$h[3]` e `$h[4]`. A sexta deve falhar com
`LIMITE_AGENDAMENTOS_EXCEDIDO`, HTTP 409.

### 4.9 Listar as proprias consultas

```powershell
Invoke-RestMethod -Uri http://localhost:3000/agendamentos -Headers $cab | ConvertTo-Json -Depth 3
```

### 4.10 Cancelar

```powershell
$lista = Invoke-RestMethod -Uri http://localhost:3000/agendamentos -Headers $cab
$id = $lista[0].idAgendamento

$motivo = @{ motivo = "Conflito de horario no trabalho" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/agendamentos/$id/cancelamento" -Method Patch -Body $motivo -ContentType "application/json" -Headers $cab | ConvertTo-Json -Depth 3
```

Esperado: status CANCELADO, com `canceladoEm` preenchido.

### 4.11 O horario volta a ficar livre

```powershell
(Invoke-RestMethod -Uri "http://localhost:3000/disponibilidades?idProfissionalClinica=3&data=2026-10-13" -Headers $cab).horarios.Count
```

Esperado: a contagem sobe de volta. Cancelamento libera o slot.

### 4.12 Cancelar duas vezes

Repita o comando do item 4.10 com o mesmo id.
Esperado: `TRANSICAO_STATUS_INVALIDA`, HTTP 409.

### 4.13 Paciente nao pode confirmar

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/agendamentos/$id/confirmacao" -Method Patch -Headers $cab
```

Esperado: `SEM_PERMISSAO`, HTTP 403.

### 4.14 Profissional confirma

Entre como o Carlos, que e o profissional do agendamento. A senha de
todos os usuarios do seed e `senha123456`.

```powershell
$loginProf = @{ identificador = "carlos.lima@exemplo.test"; senha = "senha123456" } | ConvertTo-Json
$rp = Invoke-RestMethod -Uri http://localhost:3000/autenticacao/login -Method Post -Body $loginProf -ContentType "application/json"
$cabProf = @{ Authorization = "Bearer $($rp.token)" }

$idAtivo = (Invoke-RestMethod -Uri http://localhost:3000/agendamentos -Headers $cab |
  Where-Object { $_.status -eq 'AGENDADO' })[0].idAgendamento

Invoke-RestMethod -Uri "http://localhost:3000/agendamentos/$idAtivo/confirmacao" -Method Patch -Headers $cabProf | ConvertTo-Json -Depth 3
```

Esperado: status CONFIRMADO.

### 4.15 Profissional nao mexe na agenda alheia

```powershell
$loginOutro = @{ identificador = "rafael.alves@exemplo.test"; senha = "senha123456" } | ConvertTo-Json
$ro = Invoke-RestMethod -Uri http://localhost:3000/autenticacao/login -Method Post -Body $loginOutro -ContentType "application/json"
$cabOutro = @{ Authorization = "Bearer $($ro.token)" }

Invoke-RestMethod -Uri "http://localhost:3000/agendamentos/$idAtivo/confirmacao" -Method Patch -Headers $cabOutro
```

Esperado: `AGENDAMENTO_NAO_ENCONTRADO`, HTTP 404. Devolver 404 em vez
de 403 e deliberado: dizer "existe, mas nao e seu" ja entrega
informacao sobre registros alheios.

## 5. Conferir no banco

```sql
SELECT a.id_agendamento, a.data_hora, a.status, a.cancelado_em,
       upa.nome AS paciente, up.nome AS profissional, e.nome AS especialidade
  FROM agendamento a
  JOIN paciente p  ON p.id_paciente = a.id_paciente
  JOIN usuario upa ON upa.id_usuario = p.id_usuario
  JOIN profissional_clinica pc ON pc.id_profissional_clinica = a.id_profissional_clinica
  JOIN profissional pr ON pr.id_profissional = pc.id_profissional
  JOIN usuario up  ON up.id_usuario = pr.id_usuario
  JOIN especialidade e ON e.id_especialidade = a.id_especialidade
 ORDER BY a.data_hora;
```
