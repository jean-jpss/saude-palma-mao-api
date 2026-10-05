// ---------------------------------------------------------------------
// Validacao de CNPJ com digito verificador.
//
// Mesma logica da validacao de CPF em validacao.js: nao basta ter 14
// numeros, os dois ultimos digitos sao calculados a partir dos doze
// primeiros. Sem isso, qualquer sequencia de 14 digitos passaria.
// ---------------------------------------------------------------------
export function cnpjValido(valor) {
    const cnpj = String(valor ?? '').replace(/\D/g, '');
    if (cnpj.length !== 14) return false;

    // Sequencias repetidas passam no calculo, mas nao sao CNPJs reais.
    if (/^(\d)\1{13}$/.test(cnpj)) return false;

    const calcular = (tamanho) => {
        const pesos = tamanho === 12
            ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
            : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
        let soma = 0;
        for (let i = 0; i < tamanho; i += 1) {
            soma += Number(cnpj[i]) * pesos[i];
        }
        const resto = soma % 11;
        return resto < 2 ? 0 : 11 - resto;
    };

    return calcular(12) === Number(cnpj[12]) && calcular(13) === Number(cnpj[13]);
}
