(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AgoraControlLayout=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function relayOutput(cap){return cap.type==='Boolean'&&cap.writable!==false&&/^switch(?:_\d+)?$/.test(cap.code);}
  function auxiliary(cap){
    const code=String(cap.code||'').toLowerCase();
    if(/^countdown(?:_\d+)?$/.test(code))return cap.type==='Integer';
    if(/^(relay_status|switch_type)(?:_\d+)?$/.test(code))return cap.type==='Enum';
    if(/^(cycle_time|random_time|switch_inching)$/.test(code))return cap.type==='String';
    if(/^(cycle_timing|random_timing)$/.test(code))return cap.type==='Raw';
    if(/^(indicatorlight|backlight_switch|switch_backlight|child_lock)$/.test(code))return cap.type==='Boolean';
    if(code==='fault')return cap.writable===false&&cap.type==='Bitmap';
    if(code==='test_bit')return cap.writable===false&&cap.type==='Integer';
    return false;
  }
  function simpleRelay(outputs){return outputs.some(relayOutput)&&outputs.every(c=>relayOutput(c)||auxiliary(c));}
  function visibleOutputs(outputs){return simpleRelay(outputs)?outputs.filter(relayOutput):outputs;}
  function outputLabel(cap){return cap.label===cap.code&&/^switch_\d+$/.test(cap.code)?'Saída '+cap.code.slice(7):cap.label;}
  // User-selected EvidenciasK21 registrations; stable across renaming/moving.
  // Presentation only: removing an ID restores its card, never its permissions.
  const hiddenModules=new Set([
    'module_xzmfXOPpOT_f', // Controle RF
    'module_dY5jQbyGe6kv', // Hub Zigbee 1pav
    'module__7L8L21OMLUc', // Hub Zigbee 2pav
    'module_IB1BUXv67KSu'  // Smart IR 7 (Smart IR 6 and curtains stay visible)
  ]);
  function hiddenFromControl(outputs){
    if(outputs.some(c=>hiddenModules.has(c.moduleId)||['wnykq','wg2'].includes(c.category)))return true;
    const codes=new Set(outputs.map(c=>c.code));
    return (codes.size===2&&codes.has('up_channel')&&codes.has('down_channel'))||(codes.size===2&&codes.has('ir_send')&&codes.has('ir_study_code'));
  }
  function controlChannels(channels){
    const groups=new Map();for(const c of channels){if(!groups.has(c.moduleId))groups.set(c.moduleId,[]);groups.get(c.moduleId).push(c);}
    const hidden=new Set([...groups].filter(([,outputs])=>hiddenFromControl(outputs)).map(([id])=>id));
    return channels.filter(c=>!hidden.has(c.moduleId));
  }
  return {relayOutput,simpleRelay,visibleOutputs,outputLabel,hiddenFromControl,controlChannels};
});
