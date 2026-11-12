// Tabelas "empilháveis" (.sf-stack): copia o texto de cada cabeçalho para um
// data-label em cada célula. No celular o CSS usa esse rótulo para mostrar
// cada linha como um cartão (rótulo à esquerda, valor à direita).
(() => {
  document.querySelectorAll('table.sf-stack').forEach((tabela) => {
    const rotulos = [...tabela.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    tabela.querySelectorAll('tbody tr').forEach((linha) => {
      [...linha.children].forEach((celula, i) => {
        if (celula.colSpan === 1 && rotulos[i]) celula.dataset.label = rotulos[i];
      });
    });
  });
})();
