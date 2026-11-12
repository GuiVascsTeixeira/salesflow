// Menu lateral no celular/tablet: abre como gaveta com o botão ☰.
(() => {
  const botao = document.getElementById('btn-menu');
  const menu = document.getElementById('menu-lateral');
  const fundo = document.getElementById('menu-fundo');
  if (!botao || !menu) return;

  function definir(aberto) {
    menu.classList.toggle('is-open', aberto);
    fundo.hidden = !aberto;
    document.body.classList.toggle('sf-menu-open', aberto);
    botao.setAttribute('aria-expanded', String(aberto));
    botao.setAttribute('aria-label', aberto ? 'Fechar menu' : 'Abrir menu');
  }

  botao.addEventListener('click', () => definir(!menu.classList.contains('is-open')));
  fundo.addEventListener('click', () => definir(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') definir(false); });
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) definir(false); });
})();
