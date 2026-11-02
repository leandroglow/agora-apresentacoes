/* Ágora Galpão 017 — leituras e diagnósticos reais. */
(()=>{
  'use strict';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=s=>{if(s==null||typeof s==='boolean'||String(s).trim()==='')return null;const n=Number(s);return Number.isFinite(n)?n:null;};
  const convert=(value,unit,metric)=>{const n=num(value);if(n===null)return null;const u=String(unit||'').trim().toLowerCase();return metric==='power'&&u==='kw'?n*1000:metric==='energy'&&u==='wh'?n/1000:n;};
  const unitFor=(u,m)=>m==='power'&&String(u).toLowerCase()==='kw'?'W':m==='energy'&&String(u).toLowerCase()==='wh'?'kWh':u;
  const M={voltage:['Tensão','V'],current:['Corrente','A'],power:['Potência ativa','W'],energy:['Energia acumulada','kWh'],frequency:['Frequência','Hz'],power_factor:['Fator de potência',''],apparent_power:['Potência aparente','kVA'],reactive_power:['Potência reativa','kvar']};
  const number=v=>v==null?'—':v.toLocaleString('pt-BR',{maximumFractionDigits:2});
  const stamp=t=>{const d=new Date(t);return Number.isFinite(+d)?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(d):'—';};
  const state=s=>({on:'Ligado',off:'Desligado',unavailable:'Indisponível',unknown:'Sem leitura'})[s]||'Sem leitura';
  const css=`:host{display:block;color:#f4efe5;font:14px system-ui,-apple-system,"Segoe UI",sans-serif;--gold:#d8bd83;--muted:#aea99f;--line:#ffffff1a}*{box-sizing:border-box}.wrap{background:linear-gradient(130deg,#292825,#161615);border:1px solid var(--line);border-radius:24px;padding:30px;box-shadow:0 16px 50px #0003}.head{display:flex;justify-content:space-between;gap:18px;align-items:start;margin-bottom:24px}.eyebrow{font-size:10px;letter-spacing:.2em;color:var(--gold);text-transform:uppercase;margin-bottom:9px}h1,h2{font:400 34px Georgia,serif;margin:0}h2{font-size:23px}.sub{color:var(--muted);font-size:12px;line-height:1.6}.head .sub{text-align:right}.devices{display:grid;grid-template-columns:1.25fr 1fr;gap:18px}.device{border:1px solid var(--line);border-radius:18px;background:#ffffff04;overflow:hidden}.device-head{padding:20px;display:flex;justify-content:space-between;gap:12px;align-items:center;border-bottom:1px solid var(--line)}.device h2{font-size:25px}.pill{font-size:11px;border:1px solid var(--line);border-radius:30px;padding:6px 10px;color:var(--muted);white-space:nowrap}.pill.on{color:var(--gold);border-color:#d8bd8366}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));padding:22px 20px;gap:22px 14px}.metric span{display:block;color:var(--muted);font-size:11px;margin-bottom:7px}.metric strong{font-size:21px;letter-spacing:-.03em;font-weight:500;white-space:nowrap}.metric small{color:var(--muted);font-size:11px;margin-left:4px}.details{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:18px 20px;border-top:1px solid var(--line)}.detail span{display:block;font-size:10px;color:var(--muted);margin-bottom:5px}.detail b{font-weight:500;font-size:13px}.note{padding:18px 20px;color:var(--muted);line-height:1.7;font-size:12px;margin:0}.alarm{padding:12px 20px;background:#d8bd830a;font-size:12px;color:#dfcfaa;border-top:1px solid var(--line)}.chart{margin-top:26px;border-top:1px solid var(--line);padding-top:25px}.chart-head{display:flex;justify-content:space-between;gap:14px;align-items:center;margin-bottom:17px}.controls{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}.controls button{font:12px system-ui;border:1px solid var(--line);background:transparent;color:var(--muted);border-radius:30px;padding:8px 13px;cursor:pointer}.controls button[aria-pressed=true]{background:var(--gold);border-color:var(--gold);color:#191816}.controls button:focus-visible{outline:2px solid #fff;outline-offset:3px}.chart-body{min-height:220px}svg{width:100%;height:240px;display:block;overflow:visible}.grid{stroke:#ffffff12;stroke-width:1}.axis{fill:#aaa69e;font:11px system-ui}.legend{display:flex;gap:18px;font-size:11px;color:var(--muted);flex-wrap:wrap}.key{display:inline-block;width:16px;border-top:2px solid var(--gold);margin-right:5px;vertical-align:middle}.foot{display:flex;justify-content:space-between;gap:16px;color:var(--muted);font-size:11px;margin-top:18px;line-height:1.7}.empty{padding:50px 15px;text-align:center;color:var(--muted);line-height:1.8}@media(max-width:1000px){.devices{grid-template-columns:1fr}}@media(max-width:600px){.wrap{padding:18px;border-radius:18px}.head{display:block}.head .sub{text-align:left;margin-top:12px}h1{font-size:28px}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.chart-head{display:block}.foot{display:block}.metric strong{font-size:25px}.device-head,.details{padding:17px}}`;
  class AgoraEnergyCard extends HTMLElement{
    constructor(){super();this.attachShadow({mode:'open'});this.config={devices:[]};this._range=24;this._metric='power';this._hass=null;this._request=0;this._lastFetch=0;this._history={};this._end=Date.now();this._historyStatus='aguardando dados';}
    setConfig(c){this.config={...c,devices:Array.isArray(c?.devices)?c.devices:[]};this._render();}
    set hass(v){this._hass=v;this._render();if(v&&!this._loading&&Date.now()-this._lastFetch>60000)this._loadHistory();}
    get hass(){return this._hass;}
    getCardSize(){return 9;}
    disconnectedCallback(){this._request++;this._hass=null;this._loading=false;this._history={};this._lastFetch=0;}
    _state(id){return this._hass?.states?.[id];}
    _device(d){
      const e=d.entities||{},metrics=Object.keys(M).filter(k=>e[k]);
      const available=Object.values(e).some(id=>{const s=this._state(id)?.state;return s!==undefined&&!['unknown','unavailable'].includes(s);});
      const relay=this._state(e.switch)?.state,details=[...(d.details||[])];
      if(e.child_lock&&!details.some(x=>x.label==='Bloqueio de teclas'))details.push({label:'Bloqueio de teclas',value:state(this._state(e.child_lock)?.state)});
      return `<article class="device"><div class="device-head"><div><div class="eyebrow">${esc(d.model||'Medição e diagnóstico')}</div><h2>${esc(d.name)}</h2></div><span class="pill ${relay==='on'?'on':''}">${available?esc(state(relay)):'Indisponível'}</span></div>${metrics.length?`<div class="metrics">${metrics.map(k=>{const s=this._state(e[k]),u=s?.attributes?.unit_of_measurement??M[k][1];return `<div class="metric"><span>${esc(M[k][0])}</span><strong>${number(convert(s?.state,u,k))}</strong><small>${esc(unitFor(u,k))}</small></div>`;}).join('')}</div>`:`<p class="note">Estado do aparelho e diagnósticos disponíveis.<br>Este modelo não fornece medições elétricas pela integração atual.</p>`}${details.length?`<div class="details">${details.map(x=>`<div class="detail"><span>${esc(x.label)}</span><b>${esc(x.value)}</b></div>`).join('')}</div>`:''}${d.alarm?`<div class="alarm">${esc(d.alarm)}</div>`:''}</article>`;
    }
    _render(){
      const times=this.config.devices.flatMap(d=>Object.values(d.entities||{}).map(id=>this._state(id)?.last_updated)).filter(t=>t&&Number.isFinite(Date.parse(t))).sort();
      this.shadowRoot.innerHTML=`<style>${css}</style><section class="wrap" aria-label="Monitoramento elétrico Galpão 017"><header class="head"><div><div class="eyebrow">Galpão 017 / Energia</div><h1>Monitoramento elétrico</h1></div><div class="sub">Dados do Home Assistant<br>Última atualização de estado: ${stamp(times.at(-1))}</div></header><div class="devices">${this.config.devices.map(d=>this._device(d)).join('')}</div><section class="chart"><div class="chart-head"><h2>Histórico elétrico</h2><div class="controls" role="group" aria-label="Período">${[1,24,168].map(h=>`<button data-range="${h}" aria-pressed="${h===this._range}">${h===168?'7 dias':h+' h'}</button>`).join('')}</div></div><div class="controls" role="group" aria-label="Métrica">${['power','voltage','current','energy'].map(k=>`<button data-metric="${k}" aria-pressed="${k===this._metric}">${esc(M[k][0])}</button>`).join('')}</div><div class="chart-body" data-chart aria-live="polite"></div></section><footer class="foot"><span>Histórico: ${esc(this._historyStatus)}. Lacunas indicam ausência de leitura.<br>Energia acumulada é o contador do aparelho, não o consumo do período selecionado.</span><span>Consulta de dados e diagnósticos.<br>Os ajustes permanecem no Smart Life.</span></footer></section>`;
      this.shadowRoot.querySelectorAll('[data-metric]').forEach(b=>b.onclick=()=>{this._metric=b.dataset.metric;this._render();});
      this.shadowRoot.querySelectorAll('[data-range]').forEach(b=>b.onclick=()=>{this._range=Number(b.dataset.range);this._history={};this._loadHistory();});
      this._draw();
    }
    async _loadHistory(){
      const ids=this.config.devices.flatMap(d=>Object.entries(d.entities||{}).filter(([k])=>Object.hasOwn(M,k)).map(([,id])=>id));
      if(!this._hass||!ids.length)return;
      const ticket=++this._request;this._loading=true;this._historyStatus='carregando';this._render();const end=Date.now(),start=end-this._range*3600000;
      try{
        let out;
        if(this._hass.agoraEnergyHistory)out=await this._hass.agoraEnergyHistory(this._range);
        else if(this._hass.callApi)out=await this._hass.callApi('GET',`history/period/${new Date(start).toISOString()}?end_time=${encodeURIComponent(new Date(end).toISOString())}&filter_entity_id=${encodeURIComponent(ids.join(','))}&minimal_response&no_attributes`);
        if(ticket!==this._request)return;
        this._history=out?.series||this._parseHa(out,ids);this._end=Date.parse(out?.checkedAt)||end;this._lastFetch=Date.now();this._historyStatus='consultado em '+stamp(this._end);
      }catch{if(ticket!==this._request)return;this._history={};this._lastFetch=Date.now();this._historyStatus='temporariamente indisponível';}
      finally{if(ticket===this._request){this._loading=false;this._render();}}
    }
    _parseHa(out,ids){const result={};for(const row of Array.isArray(out)?out:[]){const id=row?.[0]?.entity_id;if(!ids.includes(id))continue;result[id]=row.map(p=>({t:p.last_changed||p.last_updated,v:num(p.state)}));}return result;}
    _draw(){
      const box=this.shadowRoot.querySelector('[data-chart]');if(!box)return;
      const end=this._end,start=end-this._range*3600000,metric=this._metric;
      const series=this.config.devices.filter(d=>d.entities?.[metric]).map(d=>{
        const id=d.entities[metric],unit=this._state(id)?.attributes?.unit_of_measurement??M[metric][1];
        const points=(this._history[id]||[]).map(p=>({t:Date.parse(p.t),v:convert(p.v,unit,metric)})).filter(p=>Number.isFinite(p.t)&&p.t<=end).sort((a,b)=>a.t-b.t);
        let previous=null;const within=[];for(const p of points){if(p.t<start)previous=p;else within.push(p);}if(previous)within.unshift({...previous,t:start});if(within.length&&within.at(-1).t<end)within.push({...within.at(-1),t:end});return {name:d.name,unit:unitFor(unit,metric),points:within};
      });
      const values=series.flatMap(s=>s.points.map(p=>p.v).filter(v=>v!==null));
      if(!values.length){box.innerHTML=`<div class="empty">${this._loading?'Carregando histórico…':'Ainda não há leituras disponíveis neste período.'}<br>O histórico começa quando o aparelho passa a registrar no Home Assistant.</div>`;return;}
      let lo=Math.min(...values),hi=Math.max(...values);const delta=hi-lo;if(delta===0){const pad=Math.max(Math.abs(hi)*.025,.5);lo-=pad;hi+=pad;}else{lo-=delta*.08;hi+=delta*.08;}if(['current','power','energy'].includes(metric))lo=Math.max(0,lo);
      const x=t=>70+(t-start)/(end-start)*710,y=v=>180-(v-lo)/(hi-lo)*160,palette=['#d8bd83','#b6c4d0'];
      const paths=series.map((s,i)=>{let pen=false,path='';for(const p of s.points){if(p.v===null){pen=false;continue;}path+=pen?`H${x(p.t).toFixed(2)}V${y(p.v).toFixed(2)}`:`M${x(p.t).toFixed(2)},${y(p.v).toFixed(2)}`;pen=true;}return `<path d="${path}" fill="none" stroke="${palette[i%2]}" stroke-width="2" vector-effect="non-scaling-stroke"/>`;}).join('');
      const ticks=[0,.5,1].map(r=>{const val=lo+(hi-lo)*r,yy=y(val);return `<path class="grid" d="M70 ${yy}H780"/><text class="axis" x="60" y="${yy+4}" text-anchor="end">${number(val)}</text>`;}).join('');
      const time=new Intl.DateTimeFormat('pt-BR',this._range>24?{day:'2-digit',month:'2-digit',hour:'2-digit',timeZone:'America/Sao_Paulo'}:{hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'});
      box.innerHTML=`<svg viewBox="0 0 800 220" role="img" aria-label="${esc(M[metric][0])} em ${esc(series[0]?.unit)}, últimas ${this._range} horas"><text class="axis" x="12" y="12">${esc(series[0]?.unit)}</text>${ticks}${paths}${[0,.5,1].map(r=>`<text class="axis" x="${70+r*710}" y="208" text-anchor="${r===0?'start':r===1?'end':'middle'}">${time.format(new Date(start+r*(end-start)))}</text>`).join('')}</svg><div class="legend">${series.filter(s=>s.points.some(p=>p.v!==null)).map((s,i)=>`<span><i class="key" style="border-color:${palette[i%2]}"></i>${esc(s.name)}</span>`).join('')}<span>Mín. ${number(Math.min(...values))} ${esc(series[0]?.unit)} · Máx. ${number(Math.max(...values))} ${esc(series[0]?.unit)}</span></div>`;
    }
  }
  if(!customElements.get('agora-energy-card'))customElements.define('agora-energy-card',AgoraEnergyCard);
  if(typeof module!=='undefined')module.exports={num,convert,unitFor,AgoraEnergyCard};
})();
