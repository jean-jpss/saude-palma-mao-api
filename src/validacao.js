// ---------------------------------------------------------------------
// Validacoes de entrada.
//
// Regra geral: validar na API, nunca confiar apenas no front. O front
// valida para dar resposta rapida ao usuario; a API valida porque
// qualquer pessoa pode chamar o endpoint direto, sem passar pela tela.
// ---------------------------------------------------------------------

export function somenteDigitos(valor) {
    return String(valor ?? '').replace(/\D/g, '');
}

export function textoValido(valor, minimo = 1, maximo = 160) {
    if (typeof valor !== 'string') return false;
    const limpo = valor.trim();
    return limpo.length >= minimo && limpo.length <= maximo;
}

// Formato de e-mail. Deliberadamente simples: validacao de e-mail por
// expressao regular nunca cobre todos os casos do padrao RFC 5321, e
// a confirmacao real so vem pelo envio de uma mensagem.
export function emailValido(valor) {
    if (typeof valor !== 'string') return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valor.trim());
}

// Validacao de CPF com digito verificador.
// Nao basta ter 11 numeros: o calculo abaixo confere os dois ultimos
// digitos a partir dos nove primeiros, que e a regra oficial.
export function cpfValido(valor) {
    const cpf = somenteDigitos(valor);
    if (cpf.length !== 11) return false;

    // Sequencias repetidas (00000000000, 11111111111, ...) passam no
    // calculo matematico, mas nao sao CPFs validos.
    if (/^(\d)\1{10}$/.test(cpf)) return false;

    const calcularDigito = (quantidade) => {
        let soma = 0;
        for (let i = 0; i < quantidade; i += 1) {
            soma += Number(cpf[i]) * (quantidade + 1 - i);
        }
        const resto = (soma * 10) % 11;
        return resto === 10 ? 0 : resto;
    };

    return calcularDigito(9) === Number(cpf[9])
        && calcularDigito(10) === Number(cpf[10]);
}

// Data no formato AAAA-MM-DD, existente e nao futura.
export function dataNascimentoValida(valor) {
    if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;

    const data = new Date(`${valor}T00:00:00Z`);
    if (Number.isNaN(data.getTime())) return false;

    // Confere se a data existe de fato. "2026-02-31" vira 2026-03-03
    // no construtor do Date, entao comparamos o texto de volta.
    if (data.toISOString().slice(0, 10) !== valor) return false;

    return data.getTime() <= Date.now();
}

// Senha. Minimo de 8 caracteres, sem exigir maiuscula ou simbolo.
// A pesquisa com os usuarios apontou dificuldade para lembrar senha,
// e regras de composicao complexas aumentam esquecimento e anotacao
// em papel sem ganho proporcional de seguranca.
export function senhaValida(valor) {
    return typeof valor === 'string' && valor.length >= 8 && valor.length <= 72;
}
