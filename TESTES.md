# Como testar a autenticacao

Com o servidor rodando (`npm run dev`), use o PowerShell.

## 1. Cadastro de paciente

```powershell
$corpo = @{
  nome = "Maria da Silva"
  email = "maria.silva@exemplo.com"
  cpf = "529.982.247-25"
  dataNascimento = "1955-03-14"
  telefone = "81999998888"
  senha = "senhaSegura123"
} | ConvertTo-Json

Invoke-RestMethod -Uri http://localhost:3000/autenticacao/cadastro `
  -Method Post -Body $corpo -ContentType "application/json"
```

Esperado: HTTP 201 com o objeto `usuario` e um `token`.

O CPF 529.982.247-25 e um numero valido pelo digito verificador, usado
como exemplo em documentacao. Nao pertence a nenhuma pessoa real.

## 2. Repetir o cadastro

Rode o mesmo comando de novo.

Esperado: erro `EMAIL_JA_CADASTRADO`, HTTP 409. Prova que a constraint
de unicidade esta sendo traduzida corretamente.

## 3. CPF invalido

Troque o CPF por "111.111.111-11" e cadastre com outro e-mail.

Esperado: `DADOS_INVALIDOS`, HTTP 400. Prova que a validacao de digito
verificador funciona, e nao so a contagem de 11 numeros.

## 4. Login por e-mail

```powershell
$login = @{ identificador = "maria.silva@exemplo.com"; senha = "senhaSegura123" } | ConvertTo-Json

$resposta = Invoke-RestMethod -Uri http://localhost:3000/autenticacao/login `
  -Method Post -Body $login -ContentType "application/json"

$token = $resposta.token
$token
```

## 5. Login por CPF

```powershell
$login = @{ identificador = "52998224725"; senha = "senhaSegura123" } | ConvertTo-Json

Invoke-RestMethod -Uri http://localhost:3000/autenticacao/login `
  -Method Post -Body $login -ContentType "application/json"
```

Esperado: funciona igual, com ou sem pontuacao no CPF.

## 6. Senha errada

```powershell
$login = @{ identificador = "maria.silva@exemplo.com"; senha = "errada123" } | ConvertTo-Json

Invoke-RestMethod -Uri http://localhost:3000/autenticacao/login `
  -Method Post -Body $login -ContentType "application/json"
```

Esperado: `CREDENCIAIS_INVALIDAS`, HTTP 401. A mesma mensagem aparece
para usuario inexistente, de proposito.

## 7. Rota protegida com token

```powershell
Invoke-RestMethod -Uri http://localhost:3000/autenticacao/eu `
  -Headers @{ Authorization = "Bearer $token" }
```

Esperado: os dados do usuario logado.

## 8. Rota protegida sem token

```powershell
Invoke-RestMethod -Uri http://localhost:3000/autenticacao/eu
```

Esperado: `NAO_AUTENTICADO`, HTTP 401.

## 9. Conferir no banco

```sql
SELECT u.id_usuario, u.nome, u.email, u.tipo_usuario,
       LEFT(u.senha_hash, 7) AS inicio_hash,
       p.cpf
  FROM usuario u
  LEFT JOIN paciente p ON p.id_usuario = u.id_usuario;
```

O `inicio_hash` deve comecar com `$2a$10$` ou `$2b$10$`. Se aparecer a
senha em texto legivel, algo esta errado e nao pode ir para a entrega.
