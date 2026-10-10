// =====================================================================
// UTILITARIOS compartilhados pelos controllers.
// =====================================================================
import { erroDadosInvalidos } from './erros.js';

export function idValido(valor) {
    const numero = Number(valor);
    return Number.isInteger(numero) && numero > 0 ? numero : null;
}

export function inteiroOpcional(valor, nomeCampo) {
    if (valor === undefined || valor === null || valor === '') return null;
    const numero = Number(valor);
    if (!Number.isInteger(numero) || numero <= 0) {
        throw erroDadosInvalidos(`O parametro ${nomeCampo} precisa ser um numero inteiro.`);
    }
    return numero;
}

export function dataValida(valor) {
    return typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor);
}

// Aceita "08:00" e tambem "08:00:00", normalizando para HH:MM.
export function horaNormalizada(valor) {
    if (typeof valor !== 'string') return null;
    const casa = valor.match(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/);
    return casa ? `${casa[1]}:${casa[2]}` : null;
}

export function minutosDesdeMeiaNoite(hora) {
    const [h, m] = hora.split(':').map(Number);
    return h * 60 + m;
}

export function listaDeIds(valor, nomeCampo) {
    if (valor === undefined) return undefined;
    if (!Array.isArray(valor)) {
        throw erroDadosInvalidos(`O campo ${nomeCampo} precisa ser uma lista de numeros.`);
    }
    if (valor.some((v) => !Number.isInteger(Number(v)) || Number(v) <= 0)) {
        throw erroDadosInvalidos(`A lista ${nomeCampo} deve conter apenas numeros inteiros.`);
    }
    return valor.map(Number);
}

// Concordancia de numero nas mensagens de bloqueio.
export function frasePlural(quantidade) {
    return quantidade === 1
        ? 'Existe 1 consulta marcada'
        : `Existem ${quantidade} consultas marcadas`;
}

// Prepara um texto para busca por trecho de nome: minusculas, sem
// acento, e com os curingas do LIKE (% _ \) neutralizados, para que o
// usuario digitando "%" nao case com tudo.
export function normalizarParaBusca(texto) {
    return String(texto)
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[\\%_]/g, (c) => `\\${c}`);
}
