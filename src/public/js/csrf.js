// Protege contra CSRF: acrescenta o cabeçalho X-CSRF-Token em toda requisição
// que altera dados (POST, PUT, PATCH, DELETE) feita para o próprio site.
// Carregado ANTES dos outros scripts, para valer para todos eles.
(() => {
  const fetchOriginal = window.fetch.bind(window);
  let token = null;

  async function obterToken(forcar = false) {
    if (!token || forcar) {
      const resposta = await fetchOriginal('/api/csrf-token', { credentials: 'same-origin' });
      token = (await resposta.json()).token;
    }
    return token;
  }

  window.fetch = async (url, opcoes = {}) => {
    const metodo = (opcoes.method || 'GET').toUpperCase();
    const proprioSite = typeof url === 'string' && url.startsWith('/');
    if (!proprioSite || ['GET', 'HEAD', 'OPTIONS'].includes(metodo)) {
      return fetchOriginal(url, opcoes);
    }

    const enviar = async (forcar) => fetchOriginal(url, {
      ...opcoes,
      headers: { ...(opcoes.headers || {}), 'X-CSRF-Token': await obterToken(forcar) },
    });

    let resposta = await enviar(false);
    // Login/logout trocam a sessão (e o token). Se o token ficou velho, busca outro e repete uma vez.
    if (resposta.status === 403) {
      const corpo = await resposta.clone().json().catch(() => null);
      if (corpo?.erro?.codigo === 'CSRF_INVALIDO') resposta = await enviar(true);
    }
    if (/^\/api\/auth\/(login|logout)/.test(url)) token = null;
    return resposta;
  };
})();
