import {renderPrograms} from './programas.js?v=20261104';
'use strict';
import {mountIrrigation} from './irrigacao.js?v=1';
(()=>{
  const $=id=>document.getElementById(id), config=window.K21_CONFIG;
  let clerk,card,irrigation,timer,generation=0,programKey;
  const section=$('irrigacao'), covers=new Map();
  function dropCover(entity){
    const entry=covers.get(entity);
    if(entry?.url)URL.revokeObjectURL(entry.url);
    entry?.controller.abort();
    covers.delete(entity);
  }
  function loadArt(entity,revision){
    if(covers.get(entity)?.revision===revision)return covers.get(entity).promise;
    dropCover(entity);
    const entry={revision,controller:new AbortController()};
    covers.set(entity,entry);
    entry.promise=(async()=>{
      const token=await clerk.session?.getToken();
      if(!token||entry.controller.signal.aborted)return null;
      const url=new URL(config.api);
      url.search=new URLSearchParams({art:entity,rev:revision}).toString();
      const response=await fetch(url,{headers:{Authorization:'Bearer '+token},cache:'no-store',signal:entry.controller.signal});
      if(!response.ok)return null;
      const blob=await response.blob();
      if(covers.get(entity)!==entry || !blob.type.startsWith('image/'))return null;
      entry.url=URL.createObjectURL(blob);
      return entry.url;
    })().catch(()=>null);
    return entry.promise;
  }
  function reset(message){
    clearTimeout(timer);generation++;irrigation?.destroy();irrigation=null;
    section.hidden=true;document.body.appendChild(section);programKey=null;$('irrigacao-programas').replaceChildren();
    for(const entity of covers.keys())dropCover(entity);
    $('panel').replaceChildren();card=null;$('panel').hidden=true;$('account').hidden=true;
    $('access').hidden=false;$('message').textContent=message;
  }
  function goToIrrigation(){
    if(!card)return;
    card.showIrrigation();section.scrollIntoView({block:'start'});
  }
  $('account').querySelector('.k21-jump').addEventListener('click',goToIrrigation);
  window.addEventListener('hashchange',()=>{if(location.hash==='#irrigacao')goToIrrigation();});
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
      const firstRender=!card;
      if(firstRender){
        card=document.createElement('agora-property-card');card.loadArt=loadArt;card.setConfig(config.card);
        card.appendChild(section);$('panel').replaceChildren(card);
        irrigation=mountIrrigation($('irrigacao-zonas'),{request,refresh});
      }
      for(const [id,entry] of covers)if(result.states?.[id]?.attributes?.art_revision!==entry.revision)dropCover(id);
      card.hass={states:result.states,callService:async(domain,service,data)=>{
        const command={entity_id:data.entity_id,service:domain+'.'+service};
        if(service==='volume_set')command.volume_level=data.volume_level;
        await request(command);
        await refresh();
      }};
      irrigation.setStates(result.states);
      const nextKey=JSON.stringify([result.programs,result.programEditor]);
      if(nextKey!==programKey){renderPrograms($('irrigacao-programas'),result.programs,result.programEditor);programKey=nextKey;}
      $('irrigacao').hidden=false;
      $('account').querySelector('.k21-jump').hidden=false;
      $('panel').hidden=false;$('account').hidden=false;$('access').hidden=true;
      if(firstRender && location.hash==='#irrigacao')goToIrrigation();
      clearTimeout(timer);
      timer=setTimeout(refresh,15000);
    }catch(e){if(current!==generation)return;reset(e.message);$('login').hidden=!!clerk.session;$('account').hidden=!clerk.session;$('account').querySelector('.k21-jump').hidden=true;timer=setTimeout(refresh,30000);}
  }
  async function start(){
    const ui=document.createElement('script');ui.src='https://cdn.jsdelivr.net/npm/@clerk/ui@1/dist/ui.browser.js';ui.crossOrigin='anonymous';
    await new Promise((resolve,reject)=>{ui.onload=resolve;ui.onerror=()=>reject(new Error('Não foi possível carregar a tela de login.'));document.head.append(ui);});
    const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/@clerk/clerk-js@6/dist/clerk.browser.js';script.crossOrigin='anonymous';script.setAttribute('data-clerk-publishable-key',config.clerkPublishableKey);
    await new Promise((resolve,reject)=>{script.onload=resolve;script.onerror=()=>reject(new Error('Não foi possível carregar o login.'));document.head.append(script);});
    clerk=window.Clerk;
    const destination=location.origin+location.pathname+(location.hash==='#irrigacao'?'#irrigacao':'');
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
