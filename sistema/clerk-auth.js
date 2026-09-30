'use strict';

// Public key of the SAME Clerk application used by Ágora Automação.
// No password or secret key belongs in this static page.
window.AgoraSistemaAuth = (() => {
  const publishableKey = 'pk_live_Y2xlcmsuYXByZXNlbnRhY29lcy5hZ29yYWNvbnMuY29tLmJyJA';
  const returnUrl = 'https://apresentacoes.agoracons.com.br/sistema/';
  let clerk;

  function loadScript(url, attributes = {}) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.crossOrigin = 'anonymous';
      Object.entries(attributes).forEach(([key, value]) => script.setAttribute(key, value));
      script.onload = resolve;
      script.onerror = () => reject(new Error('Não foi possível carregar o login da Ágora.'));
      document.head.appendChild(script);
    });
  }

  const ready = (async () => {
    const domain = atob(publishableKey.split('_')[2]).slice(0, -1);
    if (!/^[a-z0-9.-]+$/i.test(domain)) throw new Error('Configuração do Clerk inválida.');
    const base = `https://${domain}/npm/`;
    await loadScript(base + '@clerk/ui@1/dist/ui.browser.js');
    await loadScript(base + '@clerk/clerk-js@6/dist/clerk.browser.js', {
      'data-clerk-publishable-key': publishableKey
    });
    clerk = window.Clerk;
    await clerk.load({
      ui: { ClerkUI: window.__internal_ClerkUICtor },
      signInForceRedirectUrl: returnUrl,
      localization: {
        locale: 'pt-BR',
        backButton: 'Voltar',
        formButtonPrimary: 'Continuar',
        formFieldLabel__username: 'Usuário',
        formFieldInputPlaceholder__username: 'Digite seu usuário',
        formFieldLabel__password: 'Senha',
        formFieldInputPlaceholder__password: 'Digite sua senha',
        signIn: {
          start: { title: 'Entrar', subtitle: 'Use sua conta Ágora' },
          password: { title: 'Digite sua senha', subtitle: 'A mesma senha da Ágora Automação' }
        }
      }
    });
    clerk.addListener(() => window.dispatchEvent(new Event('agora-sistema-auth-changed')));
    return clerk;
  })();

  return {
    ready,
    async user() { await ready; return clerk.user || null; },
    async token() { await ready; return clerk.session?.getToken() || null; },
    async signIn() { await ready; clerk.openSignIn(); },
    async signOut() { await ready; await clerk.signOut({ redirectUrl: returnUrl }); }
  };
})();
