// Pure planning calculation. Data arrives only from the authenticated Master API.
const DAY = 86400000;
const list = x => Array.isArray(x) ? x : [];
const day = x => { const t=/^\d{4}-\d{2}-\d{2}$/.test(x||'')?Date.parse(x+'T00:00:00Z'):NaN; return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===x?t:NaN; };
const iso = x => new Date(x).toISOString().slice(0,10);
const finite = x => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const cents = x => Math.round(x * 100);
export function normalizePix(pix) {
  if (!pix || !['cpf','celular'].includes(pix.type) || typeof pix.key !== 'string' || !/^\d{11}$/.test(pix.key) || typeof pix.payee !== 'string' || !pix.payee.trim()) return undefined;
  return {key:pix.key,type:pix.type,payee:pix.payee.trim()};
}
export function pixTypeLabel(type) { return type === 'cpf' ? 'CPF' : type === 'celular' ? 'Celular' : ''; }
export function nextFridays(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(x=>[x.type,x.value]));
  const today = Date.UTC(+p.year,+p.month-1,+p.day);
  const first = today + ((5-new Date(today).getUTCDay()+7)%7)*DAY;
  return [iso(first),iso(first+7*DAY)];
}
function unique(items, key) {
  const m = new Map();
  for (const x of items) { const k=key(x); if (!m.has(k)) m.set(k,x); else if(JSON.stringify(m.get(k))!==JSON.stringify(x)) throw Error('Registros conflitantes; conferir fonte RH.'); }
  return [...m.values()];
}
export function forecast(raw, now = new Date()) {
  const f = raw || {};
  return nextFridays(now).map(paymentDate => {
    const end=day(paymentDate), start=end-13*DAY;
    const groups=list(f.groups).filter(g=>Number.isFinite(day(g.anchor)) && (end-day(g.anchor))%(14*DAY)===0);
    const card={paymentDate,start:iso(start),end:paymentDate,rows:[],total:null,notices:[],status:'Projeção-base'};
    if(groups.length!==1 || !list(groups[0].people).length) return {...card,status:'Base pendente'};
    card.group=groups[0].label;
    try {
      const people=unique(groups[0].people,p=>p.id);
      const events=unique(list(f.events).filter(e=>e && ['reported','confirmed'].includes(e.status)),e=>e.id || `${e.personId}/${e.date}/${e.type}`);
      const adjustments=unique(list(f.adjustments).filter(a=>a && a.id),a=>a.id);
      card.rows=people.map(p=>{
        let weekdays=0;
        for(let t=start;t<=end;t+=DAY) if(![0,6].includes(new Date(t).getUTCDay())) weekdays++;
        const relevant=events.filter(e=>e.personId===p.id && day(e.date)>=start && day(e.date)<=end);
        const absences=new Set(relevant.filter(e=>e.type==='absence' && ![0,6].includes(new Date(day(e.date)).getUTCDay())).map(e=>e.date));
        // One additional day per person/date. A weekday already in the base is not an extra day.
        const extras=new Set(relevant.filter(e=>e.type==='extra' && e.days===1 && [0,6].includes(new Date(day(e.date)).getUTCDay())).map(e=>e.date));
        const matched=adjustments.filter(a=>a.personId===p.id && a.paymentDate===paymentDate);
        const deductions=matched.filter(a=>a.status==='open' && ['compensation','advance'].includes(a.kind));
        const pending=matched.filter(a=>a.status==='planned');
        const overdue=adjustments.filter(a=>a.personId===p.id && a.status==='open' && day(a.paymentDate)<end);
        const valid=finite(p.dailyLabor)&&finite(p.dailyCar)&&deductions.every(a=>finite(a.amount));
        const normalDays=weekdays-absences.size, extraDays=extras.size;
        const labor=valid?(normalDays+extraDays)*cents(p.dailyLabor):null;
        const car=valid?(normalDays+extraDays)*cents(p.dailyCar):null;
        const discount=valid?deductions.reduce((s,a)=>s+cents(a.amount),0):null;
        const total=valid&&labor+car>=discount?(labor+car-discount)/100:null;
        return {...p,normalDays,extraDays,labor:valid?labor/100:null,car:valid?car/100:null,discount:valid?discount/100:null,total,deductions,pending,overdue,events:relevant};
      });
      card.total=card.rows.every(p=>p.total!==null)?card.rows.reduce((s,p)=>s+cents(p.total),0)/100:null;
      if(card.total===null) card.status='Previsão parcial';
      if(card.rows.some(p=>p.overdue.length)) card.notices.push('Há ajustes de datas anteriores aguardando baixa ou reprogramação. Eles não foram descontados novamente.');
      card.notices.push(...list(f.calendarNotes).filter(n=>day(n.date)>=start&&day(n.date)<=end).map(n=>n.text).filter(Boolean));
    } catch(e) { card.status='Conferir base'; card.total=null; card.rows=[]; card.notices.push(e.message); }
    return card;
  });
}
