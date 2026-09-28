'use strict';

window.AgoraAuth = (() => {
  const config = window.AGORA_CONFIG;
  let clerk;

  function loadScript(url, attributes = {}) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.crossOrigin = 'anonymous';
      Object.entries(attributes).forEach(([key, value]) => script.setAttribute(key, value));
      script.onload = resolve;
      script.onerror = () => reject(new Error('Não foi possível carregar o login. Tente novamente.'));
      document.head.appendChild(script);
    });
  }

  const ready = (async () => {
    if (!config?.clerkPublishableKey?.startsWith('pk_live_')) {
      throw new Error('O login ainda não foi configurado para este endereço.');
    }
    const domain = atob(config.clerkPublishableKey.split('_')[2]).slice(0, -1);
    if (!/^[a-z0-9.-]+$/i.test(domain)) throw new Error('Endereço de login inválido.');
    const base = 'https://' + domain + '/npm/';
    await loadScript(base + '@clerk/ui@1/dist/ui.browser.js');
    await loadScript(base + '@clerk/clerk-js@6/dist/clerk.browser.js', {'data-clerk-publishable-key':config.clerkPublishableKey});
    clerk = window.Clerk;
    await clerk.load({
      ui:{ClerkUI:window.__internal_ClerkUICtor},
      signInForceRedirectUrl:'https://apresentacoes.agoracons.com.br/automacao/',
      localization:{
        locale:'pt-BR',
        backButton:'Voltar',
        formButtonPrimary:'Continuar',
        formFieldLabel__username:'Usuário',
        formFieldInputPlaceholder__username:'Digite seu usuário',
        formFieldLabel__password:'Senha',
        formFieldInputPlaceholder__password:'Digite sua senha',
        signIn:{
          start:{title:'Entrar na ÁGORA Automação',subtitle:'Digite seu usuário para continuar'},
          password:{title:'Digite sua senha',subtitle:'Use a senha da sua conta'}
        }
      }
    });
    clerk.addListener(() => window.dispatchEvent(new Event('agora-auth-changed')));
    return clerk;
  })();

  return {
    ready,
    apiBase:config.apiBase,
    async token() { await ready; return clerk.session?.getToken() || null; },
    async signIn() { await ready; clerk.openSignIn(); },
    async mountSignIn(element) { await ready; clerk.mountSignIn(element); },
    async unmountSignIn(element) { await ready; clerk.unmountSignIn(element); },
    async signOut() { await ready; await clerk.signOut({redirectUrl:'https://apresentacoes.agoracons.com.br/automacao/'}); }
  };
})();




