const weekdays={Mon:'seg',Tue:'ter',Wed:'qua',Thu:'qui',Fri:'sex',Sat:'sáb',Sun:'dom'};
const status={enabled:'Ativo',disabled:'Desativado',not_scheduled:'Sem programação',unknown:'Indisponível'};
function element(tag,text){
  const node=document.createElement(tag);
  node.textContent=text;
  return node;
}
export function renderPrograms(root,programs,programEditor){
  root.replaceChildren(element('h3','Programações da rega'));
  const list=document.createElement('div');
  list.className='k21-program-list';
  const rows=Array.isArray(programs)?programs:[];
  const order=p=>p.state==='enabled'?0:1;
  for(const p of [...rows].sort((a,b)=>order(a)-order(b))){
    const row=document.createElement('div');
    row.className='k21-program';
    row.append(element('strong','Programa '+p.letter));
    const days=Object.keys(weekdays).filter(day=>p.days?.includes(day));
    const frequency=days.length===7?'Todos os dias':days.map(d=>weekdays[d]).join(', ');
    const details=[p.start,frequency,p.duration_minutes!=null?p.duration_minutes+' min previstos':null].filter(Boolean);
    row.append(element('span',p.state==='enabled'&&details.length?details.join(' · '):status[p.state]||'Indisponível'));
    list.append(row);
  }
  if(!rows.length)list.append(element('span','Aguardando os dados do controlador.'));
  root.append(list);
  if(typeof programEditor!=='string')return;
  let url;
  try{url=new URL(programEditor);}catch{return;}
  if(url.origin!=='https://iq4.rainbird.com'||url.pathname!=='/'||!/^#\/controllers\/programs\?controllerId=\d+$/.test(url.hash))return;
  const edit=element('a','Editar horários na Rain Bird ↗');
  edit.href=url.href; edit.target='_blank';edit.rel='noopener noreferrer';
  root.append(edit);
}
