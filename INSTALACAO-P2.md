# P2: agenda do profissional

## 1. Copiar o arquivo

`agenda.js` vai para `src/rotas/`.

## 2. Registrar no servidor.js

Junto dos outros imports, no topo:

```javascript
import rotasAgenda from './rotas/agenda.js';
```

E na secao de rotas de dominio, junto das outras cinco:

```javascript
app.use('/agenda', rotasAgenda);
```

Conferir que ficou uma ocorrencia so:

```powershell
Select-String -Path src\servidor.js -Pattern "rotasAgenda"
```

Esperado: duas linhas, o import e o app.use.

## 3. Testes

Entre como o Carlos, que atende Ortopedia no Hospital Portugues.
Senha de todos os profissionais do seed: senha123456

```powershell
$api = "http://localhost:3000"

$login = @{ identificador = "carlos.lima@exemplo.test"; senha = "senha123456" } | ConvertTo-Json
$rp = Invoke-RestMethod -Uri "$api/autenticacao/login" -Method Post -Body $login -ContentType "application/json"
$prof = @{ Authorization = "Bearer $($rp.token)" }
```

### 3.1 Agenda completa

```powershell
Invoke-RestMethod -Uri "$api/agenda" -Headers $prof | ConvertTo-Json -Depth 3
```

Esperado: os agendamentos do Carlos, em ordem cronologica. Se voce
cancelou todos nos testes de ontem, aparecem com status CANCELADO.

Se vier lista vazia, marque um agendamento primeiro, entrando como
paciente, e repita.

### 3.2 Filtrar por dia

```powershell
Invoke-RestMethod -Uri "$api/agenda?data=2026-10-13" -Headers $prof | ConvertTo-Json -Depth 3
```

O filtro usa o dia em horario de Recife, nao em UTC. Um atendimento as
8h de 13 de outubro aparece na consulta do dia 13, embora esteja
gravado como 11:00Z.

### 3.3 Filtrar por status

```powershell
Invoke-RestMethod -Uri "$api/agenda?status=AGENDADO" -Headers $prof | ConvertTo-Json -Depth 3
```

### 3.4 Status invalido

```powershell
Invoke-RestMethod -Uri "$api/agenda?status=QUALQUERCOISA" -Headers $prof
```

Esperado: DADOS_INVALIDOS, HTTP 400, listando os valores aceitos.

### 3.5 Paciente nao acessa a agenda

```powershell
$login = @{ identificador = "52998224725"; senha = "senhaSegura123" } | ConvertTo-Json
$r = Invoke-RestMethod -Uri "$api/autenticacao/login" -Method Post -Body $login -ContentType "application/json"
$cab = @{ Authorization = "Bearer $($r.token)" }

Invoke-RestMethod -Uri "$api/agenda" -Headers $cab
```

Esperado: SEM_PERMISSAO, HTTP 403.

### 3.6 Um profissional nao ve a agenda do outro

```powershell
$loginOutro = @{ identificador = "rafael.alves@exemplo.test"; senha = "senha123456" } | ConvertTo-Json
$ro = Invoke-RestMethod -Uri "$api/autenticacao/login" -Method Post -Body $loginOutro -ContentType "application/json"
$outro = @{ Authorization = "Bearer $($ro.token)" }

Invoke-RestMethod -Uri "$api/agenda" -Headers $outro | ConvertTo-Json -Depth 2
```

O Rafael e oftalmologista no Hospital Esperanca. A agenda dele nao
pode conter os agendamentos do Carlos.

### 3.7 Administrador ve tudo

```powershell
$loginAdm = @{ identificador = "admin@exemplo.test"; senha = "senha123456" } | ConvertTo-Json
$ra = Invoke-RestMethod -Uri "$api/autenticacao/login" -Method Post -Body $loginAdm -ContentType "application/json"
$adm = @{ Authorization = "Bearer $($ra.token)" }

Invoke-RestMethod -Uri "$api/agenda" -Headers $adm | ConvertTo-Json -Depth 2
```

Esperado: os agendamentos de todos os profissionais.

### 3.8 Ciclo completo de confirmacao

Este e o teste que importa, porque e o que estava impossivel antes.

```powershell
# Pegar um agendamento ativo da agenda do Carlos
$idAtivo = (Invoke-RestMethod -Uri "$api/agenda?status=AGENDADO" -Headers $prof)[0].idAgendamento

# Confirmar
Invoke-RestMethod -Uri "$api/agendamentos/$idAtivo/confirmacao" -Method Patch -Headers $prof | ConvertTo-Json -Depth 2

# Conferir na agenda
Invoke-RestMethod -Uri "$api/agenda?status=CONFIRMADO" -Headers $prof | ConvertTo-Json -Depth 2

# Marcar como realizada
Invoke-RestMethod -Uri "$api/agendamentos/$idAtivo/realizacao" -Method Patch -Headers $prof | ConvertTo-Json -Depth 2
```

Se os tres passarem, o fluxo do profissional esta completo.

## 4. Depois

Commit e, se quiser, push. O Render refaz o deploy sozinho a cada push
no branch main, entao a rota fica publicada em alguns minutos.
