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
  return {relayOutput,simpleRelay,visibleOutputs,outputLabel};
});
