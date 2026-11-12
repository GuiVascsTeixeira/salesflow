// Dinheiro em CENTAVOS INTEIROS (decisão 5 do plano).
//
// Por que não usar número com vírgula? Em JavaScript, 0.1 + 0.2 dá
// 0.30000000000000004. Com centavos inteiros (10 + 20 = 30) a conta é exata.
// O banco devolve DECIMAL como texto ("10.06"); aqui convertemos para centavos
// (1006), calculamos e só no final voltamos para texto ("10.06") para gravar.

// "10.06" (ou 10.06) -> 1006
export function paraCentavos(valor) {
  return Math.round(Number(valor) * 100);
}

// 1006 -> "10.06"
export function centavosParaDecimal(centavos) {
  const sinal = centavos < 0 ? '-' : '';
  const absoluto = Math.abs(centavos);
  const reais = Math.floor(absoluto / 100);
  const resto = String(absoluto % 100).padStart(2, '0');
  return `${sinal}${reais}.${resto}`;
}
