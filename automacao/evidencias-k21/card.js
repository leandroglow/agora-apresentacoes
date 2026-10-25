(()=>{const ROOT='/automacao/galpao-017/assets/';
  const ICONS = {
    sofa: '<path d="M5 12V9a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3M4 12h16a2 2 0 0 1 2 2v5H2v-5a2 2 0 0 1 2-2Zm1 7v2m14-2v2"/>',
    kitchen: '<path d="M4 7h16v14H4zM7 3v4m10-4v4M7 12h10M8 17h.01m4 0h.01"/>',
    door: '<path d="M5 21V3h12v18M5 21h14M14 13h.01"/>',
    bed: '<path d="M3 10V6m18 4V6M3 15h18v5M3 17v3m18-3v3M5 10h14a2 2 0 0 1 2 2v3H3v-3a2 2 0 0 1 2-2Zm1 0V8h5v2m2 0V8h5v2"/>',
    warehouse: '<path d="m2 10 10-7 10 7v11H2V10ZM6 21v-8h12v8M9 13v8m6-8v8"/>',
    grape: '<circle cx="10" cy="8" r="2"/><circle cx="14" cy="8" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="16" r="2"/><circle cx="14" cy="16" r="2"/><circle cx="12" cy="20" r="2"/><path d="M12 6c0-3 2-4 4-4"/>',
    building: '<path d="M4 21V4h16v17M2 21h20M7 8h3m4 0h3M7 12h3m4 0h3M9 21v-5h6v5"/>',
    power: '<path d="M12 2v10m6.3-6.3a9 9 0 1 1-12.6 0"/>',
    up: '<path d="M12 20V4m-6 6 6-6 6 6"/>',
    down: '<path d="M12 4v16m-6-6 6 6 6-6"/>',
    pause: '<path d="M8 4v16m8-16v16"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    cloud: '<path d="M6 18a4 4 0 0 1-.2-8A7 7 0 0 1 19 12a3 3 0 0 1 0 6H6Zm3 2-1 2m5-2-1 2m5-2-1 2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>',
  };
  const svg = (name, className = '') => `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  const formatTime = (value) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(date) : '—';
  };
  const weatherLabels = {
    'clear-night': 'Céu limpo', cloudy: 'Nublado', fog: 'Neblina', hail: 'Granizo',
    lightning: 'Trovoada', 'lightning-rainy': 'Trovoada', partlycloudy: 'Parcialmente nublado',
    pouring: 'Chuva forte', rainy: 'Chuvoso', snowy: 'Neve', 'snowy-rainy': 'Chuva e neve',
    sunny: 'Ensolarado', windy: 'Ventando', 'windy-variant': 'Ventando', exceptional: 'Condição especial',
  };


  const weatherKind=(state,sun)=> {
    if (!state || ['unknown','unavailable'].includes(state)) return 'unknown';
    if (['rainy','pouring','lightning-rainy','snowy-rainy','hail'].includes(state)) return 'rain';
    if (state==='lightning') return 'storm';
    if (state==='clear-night' || (state==='sunny' && sun==='below_horizon')) return 'night';
    if (state==='sunny') return 'sun';
    return 'cloud';
  };
  const weatherIcon=(state)=> {
    if(state==='sunny') return svg('sun');
    if(state==='clear-night') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 15A9 9 0 0 1 9 3a9 9 0 1 0 11 12Z"/></svg>';
    if(['rainy','pouring','lightning-rainy','snowy-rainy','hail'].includes(state)) return svg('cloud');
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 18a4 4 0 0 1-.2-8A7 7 0 0 1 19 12a3 3 0 0 1 0 6H6Z"/></svg>';
  };

  const CSS = `
    :host { display:block; width:100%; --ink:#f5f0e7; --muted:#bebebd; --line:rgba(232,226,211,.12); --gold:#d8c594; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--ink); }
    * { box-sizing:border-box; }
    button { font:inherit; cursor:pointer; }
    button:focus-visible { outline:2px solid #e7d398; outline-offset:3px; }
    button:disabled { cursor:not-allowed; opacity:.48; }
    ha-card { margin:0; padding:0; border:0!important; box-shadow:none!important; border-radius:0!important; background:transparent!important; overflow:hidden; }
    .page { min-height:100vh; padding:26px clamp(20px,3.3vw,58px) 22px; background:linear-gradient(180deg,rgba(15,15,14,.06) 20%,rgba(15,15,14,.28) 60%,rgba(15,15,14,.82) 100%),linear-gradient(90deg,rgba(19,19,18,.82) 0%,rgba(19,19,18,.56) 64%,rgba(19,19,18,.42) 100%),url('${ROOT}casa-ambiente.png') top right/cover no-repeat,#151514; }
    .shell { max-width:1600px; margin:auto; }
    .top { min-height:54px; display:grid; grid-template-columns:1fr auto 1fr; gap:20px; align-items:start; }
    .brand { line-height:.9; align-self:start; width:max-content; }
    .brand-main { display:block; font-family:Georgia,serif; font-size:clamp(28px,3vw,45px); letter-spacing:.09em; font-weight:400; }
    .brand-sub { display:block; font-size:9px; letter-spacing:.68em; text-align:center; margin-top:7px; margin-left:6px; }
    .nav { display:flex; align-items:center; gap:4px; padding:5px; border:1px solid rgba(232,226,211,.14); border-radius:99px; background:linear-gradient(130deg,rgba(123,123,122,.12),rgba(18,18,17,.27)); backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px); box-shadow:inset 0 1px 0 rgba(255,249,228,.06),0 8px 24px rgba(0,0,0,.08); }
    .nav button { border:0; color:#c7c7c6; background:transparent; padding:11px 22px; border-radius:99px; transition:background .2s,color .2s; }
    .nav button[aria-selected="true"] { color:#fff9e9; background:linear-gradient(135deg,rgba(214,194,147,.48),rgba(214,194,147,.18)); box-shadow:0 0 0 1px rgba(234,216,173,.24) inset; }
    .avatar { justify-self:end; width:49px; height:49px; border-radius:50%; background:rgba(35,35,34,.87); border:1px solid var(--gold); color:var(--ink); display:grid; place-items:center; font-size:13px; }
    .hero { padding:25px 0 29px; min-height:130px; }
    .eyebrow { color:#d8d6c8; text-transform:uppercase; letter-spacing:.4em; font-size:10px; font-weight:650; }
    h1,h2,p { margin:0; }
    h1 { font-family:Georgia,serif; font-size:clamp(36px,4.9vw,67px); line-height:1.04; letter-spacing:-.035em; font-weight:400; margin:7px 0 11px; }
    .date { color:#c3c3c2; font-size:15px; }
    .toprow { display:grid; grid-template-columns:minmax(0,1.56fr) minmax(315px,1fr); gap:14px; }
    .bottomrow { display:grid; grid-template-columns:1.02fr 1.05fr .95fr; gap:14px; margin-top:14px; }
    .card { border-radius:22px; border:1px solid var(--line); overflow:hidden; position:relative; background:linear-gradient(135deg,rgba(67,67,66,.34),rgba(19,19,18,.50)); backdrop-filter:blur(22px) saturate(.82); -webkit-backdrop-filter:blur(22px) saturate(.82); box-shadow:inset 0 1px 0 rgba(255,248,225,.07),0 18px 40px rgba(0,0,0,.13); }
    .card h2 { font-family:Georgia,serif; font-weight:400; font-size:clamp(27px,2.5vw,35px); letter-spacing:-.02em; line-height:1.1; }
    .lighting { background:radial-gradient(ellipse at 14% 0%,rgba(255,246,218,.46),transparent 68%),linear-gradient(125deg,rgba(238,233,219,.94),rgba(223,222,209,.85)); color:#1e1e1d; border-color:rgba(255,250,232,.24); padding:23px; min-height:322px; backdrop-filter:blur(30px) saturate(.65); -webkit-backdrop-filter:blur(30px) saturate(.65); box-shadow:inset 0 1px 0 rgba(255,255,248,.4),0 18px 42px rgba(0,0,0,.13); }
    .lighting h2 { margin:0 0 18px; }
    .lightgrid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .device { min-width:0; position:relative; overflow:hidden; border:1px solid rgba(230,230,229,.11); background:radial-gradient(ellipse at 8% 0%,rgba(135,135,134,.12),transparent 70%),linear-gradient(145deg,rgba(39,39,38,.96),rgba(21,21,20,.95)); color:#f7f4ea; border-radius:18px; display:flex; align-items:center; gap:15px; text-align:left; min-height:106px; padding:17px 18px; box-shadow:inset 0 1px 0 rgba(238,238,237,.09),0 5px 12px rgba(31,31,30,.13); transition:transform .18s,background .2s,box-shadow .2s; }
    .device::after { content:""; position:absolute; inset:0; pointer-events:none; background:linear-gradient(118deg,rgba(255,248,220,.035),transparent 38%,rgba(255,248,220,.015) 66%,transparent); }
    .device:hover:not(:disabled),.small-device:hover:not(:disabled),.gate-actions button:hover:not(:disabled) { transform:translateY(-2px); }
    .device.is-on { border-color:rgba(240,222,156,.28); background:radial-gradient(ellipse at 10% 0%,rgba(241,221,153,.38),transparent 70%),linear-gradient(115deg,rgba(146,143,91,.96),rgba(75,75,74,.96)); box-shadow:inset 0 1px 9px rgba(250,231,159,.32),inset 0 0 30px rgba(230,205,139,.15),0 5px 16px rgba(73,68,35,.15); }
    .device.is-unavailable,.small-device.is-unavailable { opacity:.53; }
    .icon-ring { flex:none; width:52px; height:52px; border:1px solid rgba(238,232,210,.22); border-radius:50%; background:radial-gradient(circle at 25% 15%,rgba(240,240,239,.075),transparent 75%); box-shadow:inset 0 1px 0 rgba(255,255,245,.04); display:grid; place-items:center; color:#ececeb; }
    svg { width:24px; height:24px; display:block; }
    .device-copy { min-width:0; flex:1; }
    .device-name { display:block; font-size:17px; font-weight:600; letter-spacing:-.02em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .device-state { display:block; color:#c1c1c0; font-size:13px; margin-top:5px; }
    .toggle { flex:none; width:58px; height:32px; border:1px solid rgba(229,229,228,.16); border-radius:99px; background:linear-gradient(140deg,rgba(175,175,174,.15),rgba(38,38,37,.28)); box-shadow:inset 0 2px 5px rgba(9,9,8,.24),0 1px 0 rgba(255,255,230,.035); display:flex; align-items:center; padding:3px; }
    .toggle::before { content:""; width:24px; height:24px; border-radius:50%; background:#cbcbca; box-shadow:0 2px 5px rgba(0,0,0,.3); transition:transform .2s,background .2s; }
    .is-on .toggle { background:rgba(221,207,151,.5); }
    .is-on .toggle::before { transform:translateX(25px); background:#fff2cf; }
    .weather { min-height:322px; padding:26px 25px; background:radial-gradient(circle at 80% 10%,rgba(202,177,117,.22),transparent 45%),linear-gradient(130deg,#1d1d1c,#323231); display:flex; flex-direction:column; justify-content:space-between; }
    .weather.is-rainy { background:linear-gradient(110deg,rgba(20,20,19,.51),rgba(20,20,19,.29)),url('${ROOT}casa-chuva.png') center center/cover,#1f1f1e; }
    .weather .weather-top { display:flex; align-items:center; gap:18px; }
    .weather-icon { color:#f3f3eb; width:84px; height:84px; filter:drop-shadow(0 5px 12px rgba(221,221,220,.2)); }
    .weather-icon svg { width:84px; height:84px; stroke-width:1; }
    .weather-temp { font-family:Georgia,serif; font-size:clamp(60px,6vw,91px); letter-spacing:-.05em; line-height:1; white-space:nowrap; }
    .weather-label { font-size:20px; margin-top:5px; }
    .weather-humidity { color:#d7d7d6; font-size:14px; margin-top:5px; }
    .day { border-top:1px solid rgba(234,233,221,.14); padding-top:13px; }
    .day-title { font-size:15px; margin-bottom:7px; }
    .arc { width:100%; height:50px; display:block; }
    .arc path { fill:none; stroke:#d6bd80; stroke-width:1.3; }
    .arc circle { fill:#f4e6b5; }
    .day-times { display:grid; grid-template-columns:1fr 1fr 1fr; text-align:center; gap:5px; border-top:1px solid rgba(234,233,221,.2); padding-top:8px; }
    .day-times span { color:#d4d4d3; font-size:12px; }
    .day-times b { display:block; color:#f8f5ec; font-size:13px; font-weight:500; margin-top:2px; }
    .entertainment,.places,.gate { min-height:280px; padding:22px; }
    .entertainment { background:radial-gradient(circle at 15% 85%,rgba(150,117,74,.14),transparent 55%),linear-gradient(145deg,rgba(37,37,36,.53),rgba(20,20,19,.57)); }
    .tv-layout { display:flex; align-items:end; gap:20px; margin-top:20px; }
    .tv-illustration { flex:none; width:min(53%,235px); align-self:center; aspect-ratio:16/10; min-height:0; border:3px solid rgba(23,23,22,.95); border-bottom-width:5px; border-radius:4px; background:linear-gradient(105deg,#060605 10%,#111110 48%,#1e1e1d 83%,#141413 84%,#090908); box-shadow:0 10px 24px rgba(0,0,0,.34),0 0 24px rgba(142,142,141,.07); position:relative; }
    .tv-illustration::after { content:""; position:absolute; width:36%; height:4px; background:#0c0c0b; bottom:-14px; left:32%; border-radius:5px; }
    .tv-control { flex:1; min-width:0; display:flex; flex-direction:column; align-items:start; }
    .power { border:1px solid rgba(236,222,182,.27); width:76px; height:76px; border-radius:50%; color:#e8d4a2; background:linear-gradient(130deg,rgba(164,164,163,.17),rgba(32,32,31,.24)); box-shadow:inset 0 1px 0 rgba(255,247,220,.07),0 8px 20px rgba(0,0,0,.1); display:grid; place-items:center; margin-bottom:13px; }
    .power svg { width:32px; height:32px; }
    .tv-label { font-size:17px; white-space:nowrap; }
    .tv-state { font-size:13px; color:var(--muted); margin-top:4px; }
    .remote-link { border:0; border-top:1px solid var(--line); background:none; color:#cbcbca; width:100%; text-align:left; margin-top:15px; padding:8px 0 0; font-size:12px; }
    .places { background:radial-gradient(ellipse at 80% 0%,rgba(126,126,125,.12),transparent 70%),linear-gradient(145deg,rgba(40,40,39,.50),rgba(21,21,20,.53)); }
    .places-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:17px; }
    .small-device { min-width:0; min-height:51px; display:flex; align-items:center; gap:7px; padding:7px 9px; border:1px solid rgba(222,222,221,.12); border-radius:14px; color:#f6f4ea; background:linear-gradient(125deg,rgba(148,148,147,.055),rgba(21,21,20,.15)); box-shadow:inset 0 1px 0 rgba(247,245,226,.035),0 3px 9px rgba(0,0,0,.055); transition:transform .18s,background .18s; }
    .small-device.is-on { background:rgba(181,170,114,.29); }
    .small-device svg { flex:none; width:20px; height:20px; color:#d1d1d0; }
    .small-device .small-label { flex:1; min-width:0; text-align:left; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:11px; letter-spacing:-.02em; }
    .mini-toggle { flex:none; width:35px; height:21px; border-radius:30px; border:1px solid rgba(232,226,211,.13); background:rgba(133,133,132,.14); box-shadow:inset 0 2px 4px rgba(8,8,7,.2); padding:2px; display:flex; align-items:center; }
    .mini-toggle::before { content:""; display:block; width:15px; height:15px; border-radius:50%; background:#d0d0cf; }
    .is-on .mini-toggle { background:#947e4a; }
    .is-on .mini-toggle::before { transform:translateX(14px); background:#fff0bf; }
    .gate { background:linear-gradient(140deg,rgba(38,38,37,.44),rgba(18,18,17,.61)); }
    .gate-visual { height:142px; margin:0 -22px 7px; background:linear-gradient(90deg,rgba(19,19,18,.20),transparent 25%,transparent 75%,rgba(19,19,18,.20)),url('${ROOT}casa-portao.png') center center/cover; mask-image:linear-gradient(to bottom,transparent 0%,#000 22%,#000 75%,transparent 100%); -webkit-mask-image:linear-gradient(to bottom,transparent 0%,#000 22%,#000 75%,transparent 100%); }
    .gate-actions { display:grid; grid-template-columns:repeat(3,1fr); gap:7px; }
    .gate-actions button { border:1px solid rgba(229,229,228,.18); border-radius:13px; background:linear-gradient(150deg,rgba(221,221,220,.13),rgba(221,221,220,.04)); box-shadow:inset 0 1px 0 rgba(250,250,229,.06),0 4px 12px rgba(0,0,0,.09); color:#fff9e9; padding:10px 4px; display:flex; align-items:center; justify-content:center; gap:5px; font-size:12px; transition:transform .18s; }
    .gate-actions svg { width:16px; height:16px; }
    .gate-note { border-top:1px solid var(--line); text-align:center; color:#b9b9b8; padding-top:10px; font-size:11px; margin-top:11px; }
    .footer { display:flex; justify-content:space-between; align-items:center; gap:20px; margin:15px 0 0; color:#b6b6b5; }
    .locked { min-height:38px; display:flex; align-items:center; gap:10px; padding:0 16px; border:1px solid var(--line); border-radius:99px; font-size:13px; background:rgba(37,37,36,.28); backdrop-filter:blur(16px); -webkit-backdrop-filter:blur(16px); }
    .locked svg { width:18px; height:18px; }
    .footer-note { text-transform:uppercase; letter-spacing:.18em; font-size:10px; opacity:.7; }
    .feedback { position:fixed; z-index:8; bottom:28px; left:50%; transform:translateX(-50%); border:1px solid var(--line); background:#262625; color:#fff; box-shadow:0 14px 35px #0008; border-radius:12px; padding:10px 16px; max-width:90vw; }
    .feedback:empty { display:none; }
    [data-view="ambientes"] .weather,[data-view="ambientes"] .gate,[data-view="rotinas"] .lighting,[data-view="rotinas"] .weather,[data-view="rotinas"] .entertainment,[data-view="rotinas"] .places { display:none; }
    [data-view="ambientes"] .toprow,[data-view="ambientes"] .bottomrow,[data-view="rotinas"] .bottomrow { display:block; }
    [data-view="ambientes"] .lighting,[data-view="ambientes"] .entertainment,[data-view="ambientes"] .places,[data-view="rotinas"] .gate { margin-bottom:14px; min-height:0; }
    [data-view="rotinas"] .gate { max-width:570px; }
    @media (max-width:1100px) { .bottomrow{grid-template-columns:.90fr 1.20fr .85fr}.device { padding:13px; gap:10px; }.icon-ring{width:44px;height:44px}.device-name{font-size:15px}.lighting{padding:20px}.entertainment,.places,.gate{padding:18px}.gate-visual{margin-left:-18px;margin-right:-18px} }
    @media (max-width:940px) { .toprow{grid-template-columns:1fr 1fr}.bottomrow{grid-template-columns:1fr 1fr}.gate{grid-column:1/-1}.gate-visual{height:160px}.weather-temp{font-size:57px}.weather-icon,.weather-icon svg{width:55px;height:55px}.weather .weather-top{gap:8px}.hero{min-height:0}.nav button{padding:10px 12px} }
    @media (max-width:720px) { .page{padding:18px 14px 22px;background-size:auto,auto,auto 850px;background-position:top right}.top{grid-template-columns:1fr auto;row-gap:12px}.brand-main{font-size:28px}.avatar{width:40px;height:40px}.nav{grid-column:1/-1;grid-row:2;justify-self:center}.hero{padding:21px 3px 23px}.hero h1{font-size:42px}.toprow,.bottomrow{display:block}.toprow .card,.bottomrow .card{margin-bottom:12px}.lighting,.weather{min-height:0}.weather{height:280px}.entertainment,.places,.gate{min-height:0}.tv-illustration{min-height:0}.footer-note{display:none} }
    @media (max-width:430px) { .lightgrid{gap:7px}.device{min-height:100px;padding:9px;gap:6px}.icon-ring{width:32px;height:32px}.icon-ring svg{width:18px;height:18px}.device-name{font-size:13px}.device-state{font-size:11px}.toggle{width:35px;height:22px;padding:2px}.toggle::before{width:16px;height:16px}.is-on .toggle::before{transform:translateX(13px)}.lighting{padding:16px}.places-grid{gap:6px}.small-device{padding:6px}.small-device .small-label{font-size:10px}.mini-toggle{width:28px;height:19px}.mini-toggle::before{width:13px;height:13px}.is-on .mini-toggle::before{transform:translateX(9px)} }
    /* Brand: graphite, black, off-white and champagne. No green UI accents. */
    .page {position:relative;isolation:isolate;background:#141414!important;}
    .page::before {content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(90deg,rgba(12,12,12,.9),rgba(18,17,16,.55)),linear-gradient(0deg,#121212 0%,transparent 65%),url('${ROOT}casa-ambiente.png') top right/auto 1050px no-repeat;filter:grayscale(1);pointer-events:none;}
    .page[data-project="galpao_017"]::before {background-image:linear-gradient(90deg,rgba(12,12,12,.88),rgba(18,17,16,.45)),linear-gradient(0deg,#121212,transparent 70%),url('${ROOT}galpao-ambiente.png');filter:grayscale(.6);}
    .lighting {color:#292725;background:linear-gradient(125deg,rgba(245,239,229,.94),rgba(218,211,200,.85));}
    .device {background:radial-gradient(ellipse at 0 0,rgba(180,170,153,.12),transparent 70%),linear-gradient(145deg,rgba(43,41,38,.94),rgba(21,21,21,.93));}
    .device.is-on {background:linear-gradient(130deg,rgba(174,143,83,.95),rgba(89,70,41,.95));}
    .card:not(.lighting):not(.weather) {background:linear-gradient(135deg,rgba(69,64,56,.30),rgba(20,20,20,.58));}
    .weather {isolation:isolate;background:#262422!important;}
    .weather::before {content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(105deg,rgba(0,0,0,.6),rgba(0,0,0,.24)),var(--weather-art,none) center/cover;filter:saturate(.35);}
    .weather[data-weather="rain"] {--weather-art:url('${ROOT}casa-chuva.png');}
    .weather[data-weather="rain"]::before {filter:grayscale(1);}
    .weather[data-weather="sun"] {--weather-art:url('${ROOT}clima-sol.png');}
    .weather[data-weather="cloud"],.weather[data-weather="storm"] {--weather-art:url('${ROOT}clima-nuvens.png');}
    .weather[data-weather="night"] {--weather-art:url('${ROOT}clima-noite.png');}
    .weather[data-weather="storm"]::before {filter:grayscale(1) brightness(.65);}
    .weather[data-weather="unknown"] {--weather-art:none;}
    .gate-visual {filter:saturate(.15);}
    .property .intro-grid {display:grid;grid-template-columns:1.45fr 1fr;gap:16px;}
    .property .welcome {min-height:322px;padding:30px;display:flex;flex-direction:column;justify-content:space-between;}
    .property .welcome p {font-size:16px;line-height:1.7;color:#c7c2b9;max-width:38em;margin:15px 0;}
    .property .metrics {display:flex;gap:38px;margin-top:20px;}
    .property .metrics b {display:block;font:38px Georgia,serif;color:#e1c888;}
    .property .metrics span {font-size:12px;color:#c2bdb5;}
    .property .room-nav {display:flex;gap:8px;overflow:auto;padding:18px 0;scrollbar-width:thin;}
    .property .room-nav button {white-space:nowrap;border:1px solid var(--line);border-radius:40px;padding:10px 17px;background:#ffffff06;color:#ddd6ca;}
    .property .room-nav button.active {background:#c0a15d38;border-color:#c0a15d66;}
    .property .rooms {display:grid;grid-template-columns:repeat(3,minmax(0,1fr));align-items:start;gap:16px;margin-top:16px;}
    .property .room {padding:24px;scroll-margin-top:20px;}
    .property .room h2 {font-size:30px;margin-bottom:18px;}
    .property .room.light-room {background:linear-gradient(125deg,rgba(244,239,228,.94),rgba(218,211,200,.88))!important;color:#262422;}
    .property .room .lightgrid {gap:8px;}
    .property .room .device {min-height:94px;padding:12px;gap:10px;}
    .property .room .icon-ring {width:34px;height:34px;}
    .property .room .icon-ring svg {width:19px;height:19px;}
    .property .room .device-name {font-size:14px;white-space:normal;}
    .property .room .toggle {width:35px;height:22px;padding:2px;}
    .property .room .toggle::before {width:16px;height:16px;}
    .property .room .is-on .toggle::before {transform:translateX(13px);}
    .property .routine-grid {display:grid;grid-template-columns:1fr 1fr;gap:10px;}
    .property .routine-grid button {min-height:60px;border-radius:15px;border:1px solid var(--line);background:linear-gradient(130deg,#d8c59418,#ffffff04);color:#f7f1e6;padding:12px;display:flex;align-items:center;gap:10px;text-align:left;}
    .property .routine-grid svg {color:#d8bd7d;flex:none;}
    .property .media {background:#181818b8;color:#eee8dd;padding:15px;border-radius:16px;border:1px solid #e3d4b522;margin-bottom:12px;}
    .property .media-title {background:none;border:0;color:inherit;text-align:left;padding:0;font-size:14px;font-weight:600;}
    .property .media-status {display:block;font-size:12px;color:#bfb8ad;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:8px 0;}
    .property .playback {display:flex;align-items:center;gap:10px;}
    .property .playback button {border:1px solid #dfc78e22;background:#ffffff07;color:#e1cb98;border-radius:50%;width:34px;height:34px;}
    .property input[type="range"] {min-width:30px;flex:1;accent-color:#c8ad74;width:80px;}
    .property .sensor-line {display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid var(--line);padding:11px 0;font-size:14px;}
    .property .sensor-line b {color:#d8bd7d;font-weight:500;}
    .property .room[hidden],.property .intro-grid[hidden] {display:none!important;}
    .property .art-caption {font-size:11px;color:#b2aca2;margin-top:10px;}
    .property[data-project="galpao_017"] .rooms {grid-template-columns:1.2fr 1fr 1fr;}
    .property[data-project="galpao_017"] .gate-visual {background-image:url('${ROOT}galpao-ambiente.png');height:145px;}
    .property .room .icon-ring {display:none;}
    .property .room .device-name {overflow:visible;text-overflow:clip;line-height:1.25;}
    .property:has(.room-nav button.active:not([data-room="all"])) .rooms {grid-template-columns:minmax(0,900px);}
    .property[data-mode="rotinas"] .room .lightgrid,.property[data-mode="rotinas"] .room .media {display:none;}
    @media(max-width:1450px){.property .rooms{grid-template-columns:repeat(2,minmax(0,1fr))}.property[data-project="galpao_017"] .rooms{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:720px){.property .intro-grid,.property .rooms,.property[data-project="galpao_017"] .rooms{grid-template-columns:1fr}.property .welcome{min-height:230px;padding:24px}.property .room{padding:19px}.property .metrics{gap:24px}}


    .brand-sub {letter-spacing:.34em;}
    .brand-property {display:block;margin-top:10px;font-size:11px;letter-spacing:.12em;color:#cfc1a3;text-align:center;}
    .property .media-title {display:block;}
    .property .room.light-room {background:linear-gradient(125deg,rgba(244,239,228,.87),rgba(218,211,200,.77))!important;backdrop-filter:blur(24px);}
    .property .playback button {flex-shrink:0;cursor:pointer;}
    .property .playback button:disabled {opacity:.35;cursor:not-allowed;}
    @media(max-width:600px){.property .top{gap:16px;flex-wrap:wrap}.property .nav{order:3;width:100%;justify-content:center}.property .avatar{margin-left:auto}.property .room-nav{flex-wrap:nowrap;overflow-x:auto;padding-bottom:12px}.property .room-nav button{flex-shrink:0}.property .hero h1{font-size:36px;}}

    .entertainment:has(.tv-full:not([hidden])) {grid-column:1/-1;}
    .tv-full[hidden] {display:none;}
    .tv-full {margin-top:22px;border-top:1px solid var(--line);padding-top:18px;}
    .tv-connection {font-size:13px;line-height:1.6;color:#cfc5b4;margin-bottom:14px;}
    .tv-remote-grid {display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;}
    .tv-buttons {display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;}
    .tv-buttons button {border:1px solid var(--line);border-radius:12px;background:linear-gradient(135deg,#d8c5941c,#ffffff05);color:#eee7db;min-height:44px;padding:10px;font-size:13px;}
    .tv-group h3 {font-size:14px;color:#ddc791;font-weight:500;margin:0 0 10px;}
    .tv-input {display:block;width:100%;margin:12px 0;accent-color:#c4ad71;background:#292725;color:#eee7db;border:1px solid var(--line);border-radius:8px;padding:8px;}
    @media(max-width:720px){.tv-remote-grid{grid-template-columns:1fr}.tv-buttons button{min-height:48px}}


    .property .routines {padding:30px;min-height:270px;}
    .property .routines h2 {margin-bottom:22px;}
    .property .routines .routine-grid {grid-template-columns:repeat(2,minmax(0,1fr));}
    .property .routines button {width:100%;height:100%;min-height:64px;cursor:pointer;}
    .property .routines button:disabled {opacity:.4;cursor:not-allowed;}
    .property .routines button:not(:disabled):hover {background:#c0a15d25;border-color:#c0a15d66;}
    .property .routines[hidden],.property .weather[hidden],.property [data-routine-group][hidden] {display:none!important;}
    .property .intro-grid.routines-only {grid-template-columns:minmax(0,900px);}
    @media(max-width:600px){.property .routines{padding:24px;min-height:0}.property .routines .routine-grid{grid-template-columns:1fr}}
    @media (prefers-reduced-motion:reduce) { * { transition:none!important; animation:none!important; } }
  `;


  const esc = (s) => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  class AgoraPropertyCard extends HTMLElement {
    constructor(){super();this.attachShadow({mode:'open'});this._tab='geral';this._room='all';}
    setConfig(config){this.config=config;this.items=config.groups.flatMap(g=>g.items);this._render();}
    set hass(hass){this._hass=hass;this._update();}
    getCardSize(){return 15;}
    _render(){
      const c=this.config;
      const renderItem=(e)=>{
        const id=esc(e.id), label=esc(e.label), domain=e.id.split('.')[0];
        if(domain==='media_player') return `<div class="media" data-media="${id}"><div class="media-title">◉ ${label}</div><span class="media-status">—</span><div class="playback"><button data-id="${id}" data-service="media_previous_track" aria-label="${label}: anterior">◀</button><button data-id="${id}" data-service="media_play_pause" aria-label="${label}: reproduzir ou pausar">▶</button><button data-id="${id}" data-service="media_next_track" aria-label="${label}: próxima">▶▏</button><input type="range" min="0" max="100" step="1" data-volume="${id}" aria-label="Volume ${label}"></div></div>`;
        if(domain==='sensor') return `<div class="sensor-line"><span>${label}</span><b data-sensor="${id}">—</b></div>`;
        if(domain==='scene') return `<button data-id="${id}" data-service="turn_on" data-scene="${id}" disabled>${svg('power')}<span>${label}</span></button>`;
        return `<button class="device" data-id="${id}" data-service="toggle" data-switch="${id}" disabled><span class="icon-ring">${svg(c.project==='galpao_017'?'warehouse':'sun')}</span><span class="device-copy"><span class="device-name">${label}</span><span class="device-state">—</span></span><span class="toggle"></span></button>`;
      };
      const renderGroup=(g,i)=>{
        const switches=g.items.filter(e=>e.id.startsWith('switch.')),scenes=g.items.filter(e=>e.id.startsWith('scene.')),others=g.items.filter(e=>!e.id.startsWith('switch.')&&!e.id.startsWith('scene.'));
        if(!switches.length&&!others.length)return '';
        const category=switches.length?'ambientes':scenes.length?'rotinas':g.items.some(e=>e.id.startsWith('media_player.'))?'ambientes':'clima';
        return `<section class="card room ${switches.length?'light-room':''}" data-group="${i}" data-category="${category}"><h2>${esc(g.title)}</h2>${g.title==='Portão'?'<div class="gate-visual"></div>':''}${others.map(renderItem).join('')}<div class="lightgrid">${switches.map(renderItem).join('')}</div>${g.title==='Portão'?'<div class="art-caption">Imagem ilustrativa · sem sensor de posição</div>':''}</section>`;
      };
      this.shadowRoot.innerHTML=`<style>${CSS}</style><ha-card><div class="page property" data-project="${esc(c.project)}"><div class="shell"><div class="top"><div class="brand"><span class="brand-main">ÁGORA</span><span class="brand-sub">AUTOMAÇÃO</span><span class="brand-property">Evidências K21</span></div><div class="nav" role="tablist"><button role="tab" data-tab="geral" aria-selected="true">Visão geral</button><button role="tab" data-tab="ambientes" aria-selected="false">Ambientes</button><button role="tab" data-tab="rotinas" aria-selected="false">Rotinas</button></div><div class="avatar">Á</div></div><header class="hero"><h1>${esc(c.title)}</h1><div class="date" data-field="date"></div></header><div class="intro-grid"><section class="card routines" aria-label="Rotinas"><h2>Rotinas</h2><div class="routine-grid">${c.groups.flatMap((g,i)=>g.items.filter(e=>e.id.startsWith('scene.')).map(e=>`<div data-routine-group="${i}">${renderItem(e)}</div>`)).join('')}</div></section><section class="card weather"><div class="weather-top"><span class="weather-icon" data-field="weather-icon"></span><div><div class="weather-temp" data-field="temperature">—</div><div class="weather-label" data-field="condition"></div><div class="weather-humidity" data-field="humidity"></div></div></div><div class="day"><div class="day-title">Ciclo do dia · <span data-field="sun-state"></span></div><svg class="arc" viewBox="0 0 400 50" preserveAspectRatio="none"><path d="M10 47 Q200 -34 390 47"/><circle cx="200" cy="9" r="5"/></svg><div class="day-times"><span>Amanhecer<b data-field="dawn"></b></span><span>Agora<b data-field="now"></b></span><span>Pôr do sol<b data-field="sunset"></b></span></div><div class="art-caption">Clima da localização configurada no Home Assistant</div></div></section></div><nav class="room-nav" aria-label="Filtrar ambiente"><button data-room="all" class="active">Todos</button>${c.groups.map((g,i)=>`<button data-room="${i}">${esc(g.title)}</button>`).join('')}</nav><div class="rooms">${c.groups.map(renderGroup).join('')}</div><footer class="footer"><span>${esc(c.title)}</span><span class="footer-note">Ágora · automação</span></footer></div><div class="feedback" role="status" aria-live="polite"></div></div></ha-card>`;
      this.shadowRoot.addEventListener('click',e=>this._click(e));
      this.shadowRoot.addEventListener('change',e=>{if(e.target.dataset.volume)this._send(e.target.dataset.volume,'volume_set',{volume_level:Number(e.target.value)/100});});
      this._update();
    }
    _filter(){
      const selected=this._room==='all'?null:Number(this._room);
      const showRoutines=this._tab!=='ambientes'&&this.config.groups.some((g,i)=>(selected===null||i===selected)&&g.items.some(e=>e.id.startsWith('scene.')));
      const showWeather=this._tab==='geral'&&selected===null;
      this.shadowRoot.querySelector('.property').dataset.mode=this._tab;
      const intro=this.shadowRoot.querySelector('.intro-grid');intro.hidden=!showRoutines&&!showWeather;intro.classList.toggle('routines-only',!showWeather);
      this.shadowRoot.querySelector('.routines').hidden=!showRoutines;
      this.shadowRoot.querySelector('.weather').hidden=!showWeather;
      this.shadowRoot.querySelectorAll('[data-routine-group]').forEach(n=>n.hidden=selected!==null&&Number(n.dataset.routineGroup)!==selected);
      this.shadowRoot.querySelectorAll('[data-group]').forEach(n=>n.hidden=(selected!==null&&Number(n.dataset.group)!==selected)||this._tab==='rotinas'||(this._tab==='ambientes'&&n.dataset.category!=='ambientes'));
      this.shadowRoot.querySelectorAll('[data-room]').forEach(n=>n.classList.toggle('active',n.dataset.room===this._room));
      this.shadowRoot.querySelectorAll('[data-tab]').forEach(n=>n.setAttribute('aria-selected',String(n.dataset.tab===this._tab)));
    }
    _click(event){const b=event.target.closest('button');if(!b||b.disabled)return;if(b.dataset.tab){this._tab=b.dataset.tab;this._room='all';this._filter();return;}if(b.dataset.room){this._room=b.dataset.room;this._tab='geral';this._filter();return;}if(b.dataset.info){this.dispatchEvent(new CustomEvent('hass-more-info',{bubbles:true,composed:true,detail:{entityId:b.dataset.info}}));return;}if(b.dataset.id)this._send(b.dataset.id,b.dataset.service);}
    _send(id,service,extra={}){if(!this._hass||!this.items.some(e=>e.id===id))return;const domain=id.split('.')[0];const allowed={switch:['toggle'],scene:['turn_on'],media_player:['media_previous_track','media_play_pause','media_next_track','volume_set']};if(!allowed[domain]?.includes(service))return;this._notify('Enviando comando…');this._hass.callService(domain,service,{entity_id:id,...extra}).then(()=>this._notify(domain==='scene'?'Rotina enviada. A execução física depende dos dispositivos.':'Comando enviado.')).catch(()=>this._notify('Não foi possível enviar o comando. Verifique a integração.'));}
    _notify(t){const n=this.shadowRoot.querySelector('.feedback');n.textContent=t;clearTimeout(this._timer);this._timer=setTimeout(()=>n.textContent='',4500);}
    _update(){if(!this._hass||!this.config)return;const states=this._hass.states;const field=(k,v)=>{const n=this.shadowRoot.querySelector(`[data-field="${k}"]`);if(n)n.textContent=v;};
      this.shadowRoot.querySelectorAll('[data-switch]').forEach(b=>{const s=states[b.dataset.switch]?.state,ok=['on','off'].includes(s);b.disabled=!ok;b.classList.toggle('is-on',s==='on');b.querySelector('.device-state').textContent=ok?(s==='on'?'Ligado':'Desligado'):'Indisponível';});
      this.shadowRoot.querySelectorAll('[data-scene]').forEach(b=>{const s=states[b.dataset.scene];b.disabled=!s||s.state==='unavailable';});
      this.shadowRoot.querySelectorAll('[data-sensor]').forEach(n=>{const s=states[n.dataset.sensor];n.textContent=!s||['unknown','unavailable'].includes(s.state)?'—':n.dataset.sensor.startsWith('sensor.sun_')?formatTime(s.state):`${s.state} ${s.attributes.unit_of_measurement||''}`;});
      this.shadowRoot.querySelectorAll('[data-media]').forEach(n=>{const s=states[n.dataset.media],ok=!!s&&!['unknown','unavailable'].includes(s.state),f=Number(s?.attributes.supported_features||0);n.querySelector('.media-status').textContent=!ok?'Indisponível':s.attributes.media_title||({playing:'Reproduzindo',paused:'Pausado',idle:'Pronta para tocar',standby:'Em espera',off:'Desligada'})[s.state]||s.state;n.querySelectorAll('[data-service]').forEach(b=>{const bits={media_previous_track:16,media_next_track:32,media_play_pause:16385};b.disabled=!ok||!(f&bits[b.dataset.service]);if(b.dataset.service==='media_play_pause')b.textContent=s?.state==='playing'?'Ⅱ':'▶';});const v=n.querySelector('input');v.disabled=!ok||!(f&4);if(this.shadowRoot.activeElement!==v)v.value=Math.round((s?.attributes.volume_level||0)*100);});
      const w=states['weather.forecast_home'],sun=states['sun.sun']?.state;this.shadowRoot.querySelector('.weather').dataset.weather=weatherKind(w?.state,sun);this.shadowRoot.querySelector('[data-field="weather-icon"]').innerHTML=weatherIcon(w?.state);const t=w?.attributes.temperature;field('temperature',t!=null&&Number.isFinite(Number(t))?`${Number(t).toLocaleString('pt-BR')}°`:'—');field('condition',weatherLabels[w?.state]||'Clima indisponível');field('humidity',w?.attributes.humidity!=null?`Umidade ${w.attributes.humidity}%`:'');field('sun-state',sun==='above_horizon'?'Sol acima do horizonte':sun==='below_horizon'?'Sol abaixo do horizonte':'Sem dados');field('dawn',formatTime(states['sensor.sun_next_dawn']?.state));field('sunset',formatTime(states['sensor.sun_next_setting']?.state));field('now',formatTime(new Date()));field('date',new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'numeric',month:'long',timeZone:'America/Sao_Paulo'}).format(new Date()));
    }
  }

customElements.define('agora-property-card',AgoraPropertyCard);})();