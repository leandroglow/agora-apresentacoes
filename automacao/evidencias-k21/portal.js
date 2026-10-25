'use strict';
(()=>{
  const $=id=>document.getElementById(id), config=window.K21_CONFIG;
  let clerk,card,timer,generation=0;
  const reset=message=>{clearTimeout(timer);generation++;$('panel').replaceChildren();card=null;$('panel').hidden=true;$('account').hidden=true;$('access').hidden=false;$('message').textContent=message;};
  async function request(body){
    const token=await clerk.session?.getToken();
    if(!token)throw new Error('Entre com sua conta Ágora.');
    const response=await fetch(config.api,{method:body?'POST':'GET',cache:'no-store',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||'Falha na conexão.');
    return result;
  }
  async function refresh(){
    clearTimeout(timer);const current=generation;
    try{
      const result=await request();if(current!==generation)return;
      if(!card){card=document.createElement('agora-property-card');card.setConfig(config.card);$('panel').replaceChildren(card);}
      card.hass={states:result.states,callService:async(domain,service,data)=>{
        const command={entity_id:data.entity_id,service:domain+'.'+service};
        if(service==='volume_set')command.volume_level=data.volume_level;
        await request(command);
        await refresh();
      }};
      $('panel').hidden=false;$('account').hidden=false;$('access').hidden=true;
      timer=setTimeout(refresh,15000);
    }catch(e){if(current!==generation)return;reset(e.message);$('login').hidden=!!clerk.session;$('account').hidden=!clerk.session;timer=setTimeout(refresh,30000);}
  }
  async function start(){
    const ui=document.createElement('script');ui.src='https://cdn.jsdelivr.net/npm/@clerk/ui@1/dist/ui.browser.js';ui.crossOrigin='anonymous';
    await new Promise((resolve,reject)=>{ui.onload=resolve;ui.onerror=()=>reject(new Error('Não foi possível carregar a tela de login.'));document.head.append(ui);});
    const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/@clerk/clerk-js@6/dist/clerk.browser.js';script.crossOrigin='anonymous';script.setAttribute('data-clerk-publishable-key',config.clerkPublishableKey);
    await new Promise((resolve,reject)=>{script.onload=resolve;script.onerror=()=>reject(new Error('Não foi possível carregar o login.'));document.head.append(script);});
    clerk=window.Clerk;
    const destination=location.origin+location.pathname;
    await clerk.load({ui:{ClerkUI:window.__internal_ClerkUICtor},signInForceRedirectUrl:destination,signUpForceRedirectUrl:destination,appearance:{variables:{colorPrimary:'#b79b64',borderRadius:'16px'}}});
    $('login').onclick=()=>clerk.openSignIn({forceRedirectUrl:destination});
    $('logout').onclick=async()=>{reset('Sessão encerrada.');await clerk.signOut({redirectUrl:destination});};
    let sessionId;
    clerk.addListener(({session})=>{
      if(session?.id===sessionId)return;sessionId=session?.id;
      reset(session?'Consultando Evidências K21…':'Entre para acessar o Evidências K21.');$('login').hidden=!!session;
      if(session)refresh();
    });
    if(clerk.session){sessionId=clerk.session.id;await refresh();}else{reset('Entre para acessar o Evidências K21.');$('login').hidden=false;}
  }
  start().catch(e=>reset(e.message));
})();
