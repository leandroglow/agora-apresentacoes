'use strict';
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.TuyaCapabilities=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const names={switch:'Liga/desliga',switch_led:'Iluminação',switch_fan:'Ventilador',fan_speed:'Velocidade',fan_speed_enum:'Velocidade',fan_mode:'Modo do ventilador',mode:'Modo',work_mode:'Modo de funcionamento',fan_direction:'Sentido de rotação',fan_horizontal:'Oscilação horizontal',fan_vertical:'Oscilação vertical',countdown_fan:'Temporizador do ventilador',countdown:'Temporizador',relay_status:'Ao voltar a energia',backlight_switch:'Luz do interruptor',switch_backlight:'Luz do interruptor',child_lock:'Bloqueio infantil',bright_value:'Brilho',bright_value_v2:'Brilho',temp_value:'Temperatura de cor',temp_value_v2:'Temperatura de cor',temp_set:'Temperatura desejada',temp_current:'Temperatura atual',humidity_current:'Umidade',cur_power:'Potência',cur_voltage:'Tensão',cur_current:'Corrente',add_ele:'Consumo acumulado',fault:'Diagnóstico',battery_percentage:'Bateria'};
  const types={boolean:'Boolean',bool:'Boolean',integer:'Integer',value:'Integer',enum:'Enum',string:'String',json:'Json',raw:'Raw',bitmap:'Bitmap'};
  const choices={off:'Desligado',on:'Ligado',memory:'Último estado',normal:'Normal',natural:'Natural',sleep:'Sono',auto:'Automático',manual:'Manual',low:'Baixa',middle:'Média',medium:'Média',high:'Alta',forward:'Direto',reverse:'Reverso',white:'Luz branca',colour:'Cor',color:'Cor',scene:'Cena'};
  function parse(values){if(values&&typeof values==='object'&&!Array.isArray(values))return values;try{const p=JSON.parse(values||'{}');return p&&typeof p==='object'&&!Array.isArray(p)?p:{};}catch{return {};}}
  function title(code,name){if(names[code])return names[code];if(/^switch_\d+$/.test(code))return 'Saída '+code.split('_')[1];if(/^countdown_\d+$/.test(code))return 'Temporizador '+code.split('_')[1];if(typeof name==='string'&&name.trim()&&!/[\u3400-\u9fff]/.test(name))return name.slice(0,80);return code.replace(/_/g,' ');}
  function supported(cap){
    if(cap.type==='Boolean')return true;
    const s=cap.schema||{};
    if(cap.type==='Integer')return Number.isSafeInteger(s.min)&&Number.isSafeInteger(s.max)&&s.max>=s.min&&Number.isSafeInteger(s.step)&&s.step>0&&Number.isInteger(s.scale)&&s.scale>=0&&s.scale<=9;
    if(cap.type==='Enum')return Array.isArray(s.range)&&s.range.length>0&&s.range.every(v=>typeof v==='string');
    return cap.type==='String'&&Number.isInteger(s.maxlen)&&s.maxlen>0;
  }
  function normalize(functions,properties=[]){
    const entries=new Map();
    function append(item,writable){
      if(!item||typeof item.code!=='string'||!/^[a-zA-Z0-9_]{1,100}$/.test(item.code))return;
      if(entries.has(item.code))return;
      const type=types[String(item.type).toLowerCase()]||String(item.type||'Unknown').slice(0,30),raw=parse(item.values);
      const schema={};
      if(type==='Integer'){
        for(const key of ['min','max','step','scale'])if(raw[key]!==undefined)schema[key]=Number(raw[key]);
        if(schema.scale===undefined)schema.scale=0;
        if(schema.step===undefined)schema.step=1;
        schema.unit=String(raw.unit||'').slice(0,20);
      }else if(type==='Enum')schema.range=Array.isArray(raw.range)?[...new Set(raw.range.filter(v=>typeof v==='string'))].slice(0,512):[];
      else if(type==='String')schema.maxlen=Math.min(Number(raw.maxlen||raw.max_length||255),2048);
      else if(type!=='Boolean')Object.assign(schema,raw);
      const cap={code:item.code,label:title(item.code,item.name),type,schema,writable,available:true};
      cap.supported=supported(cap);entries.set(item.code,cap);
    }
    (Array.isArray(functions)?functions:[]).forEach(f=>append(f,true));
    (Array.isArray(properties)?properties:[]).forEach(f=>append(f,false));
    return [...entries.values()].sort((a,b)=>Number(isSetting(a))-Number(isSetting(b))||a.code.localeCompare(b.code,undefined,{numeric:true}));
  }
  // The standard API can omit a manufacturer's custom data points.
  // Preserve standard schemas: their values may be translated by Tuya.
  function mergeModel(standard,result,category){
    const model=typeof result?.model==='string'?JSON.parse(result.model):result?.model;
    if(!model||!Array.isArray(model.services)||model.services.some(s=>!Array.isArray(s.properties)))throw new Error('Modelo do dispositivo incompleto.');
    const existing=new Set(standard.map(c=>c.code)),properties=new Map();
    for(const service of model.services){
      // Named services require a separate service-aware control implementation.
      if(service.code)continue;
      for(const property of service.properties){
        if(!property||typeof property.code!=='string'||properties.has(property.code))continue;
        properties.set(property.code,property);
      }
    }
    const custom=[];
    for(const property of properties.values()){
      if(existing.has(property.code))continue;
      // fskg exposes this same backlight under a translated standard code.
      if(category==='fskg'&&property.code==='switch_backlight'&&existing.has('backlight_switch'))continue;
      const writable=['rw','wr'].includes(property.accessMode);
      if(!writable&&property.accessMode!=='ro')continue;
      const item={code:property.code,name:property.name,type:property.typeSpec?.type,values:property.typeSpec};
      const cap=normalize(writable?[item]:[],writable?[]:[item])[0];
      if(!cap)continue;
      if(category==='fskg'&&cap.code==='switch_led')cap.label='Lâmpada do ventilador';
      custom.push({...cap,commandApi:'thing'});
    }
    return [...standard.map(c=>({...c,commandApi:'standard'})),...custom];
  }
  function isSetting(cap){return /^(countdown|relay_status|backlight|child_lock|power_on|poweron|light_mode|indicator|led_type|switch_backlight)/.test(cap.code);}
  function isPower(cap){return (cap.type||'Boolean')==='Boolean'&&/^switch(?:_|$)/.test(cap.code)&&!isSetting(cap)&&cap.available!==false&&cap.writable!==false;}
  function choice(cap,value){if(cap.code==='relay_status')return ({off:'Permanecer desligado',on:'Ligar ao voltar',memory:'Restaurar último estado'})[value]||String(value);return choices[value]||String(value);}
  function format(cap,value){
    if(value===null||value===undefined)return 'Estado não confirmado';
    if((cap.type||'Boolean')==='Boolean')return value===true?'Ligado':value===false?'Desligado':'Estado não confirmado';
    if(cap.type==='Integer'){const factor=10**(cap.schema?.scale||0);return (Number(value)/factor).toLocaleString('pt-BR',{maximumFractionDigits:9})+(cap.schema?.unit?' '+cap.schema.unit:'');}
    if(cap.type==='Enum')return choice(cap,value);
    return (typeof value==='object'?JSON.stringify(value):String(value)).slice(0,400);
  }
  function validate(cap,value){
    if(cap.writable===false||cap.available===false)throw new Error('Este recurso é apenas para consulta ou não está disponível.');
    const type=cap.type||'Boolean',s=cap.schema||{};
    if(!supported({...cap,type}))throw new Error('Este recurso precisa de um controle específico antes de enviar comandos.');
    if(type==='Boolean'&&typeof value!=='boolean')throw new Error('Escolha ligar ou desligar.');
    if(type==='Integer'&&(!Number.isSafeInteger(value)||value<s.min||value>s.max||(value-s.min)%s.step!==0))throw new Error('Escolha um valor dentro da faixa e dos passos permitidos pelo dispositivo.');
    if(type==='Enum'&&(typeof value!=='string'||!s.range.includes(value)))throw new Error('Escolha uma das opções informadas pelo dispositivo.');
    if(type==='String'&&(typeof value!=='string'||value.length>s.maxlen))throw new Error('Confira o texto e o limite de caracteres deste recurso.');
    return value;
  }
  return {normalize,mergeModel,supported,title,isSetting,isPower,choice,format,validate};
});

