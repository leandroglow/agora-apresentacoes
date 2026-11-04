'use strict';

export const IRRIGATION_ZONES = Object.freeze([
  {station: 1, id: 'sensor.laerte_e_jo_fundos', name: 'Jardim dos fundos'},
  {station: 3, id: 'sensor.laerte_e_jo_frente', name: 'Jardim da frente'},
  {station: 4, id: 'sensor.laerte_e_jo_jardim_vertical', name: 'Jardim vertical'}
]);
export const MAX_DURATION_MINUTES = 100;
const labels = {idle: 'Em espera', running: 'Rega indicada', paused: 'Pausada'};

export function validateDuration(value) {
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_DURATION_MINUTES) {
    throw new Error('Escolha de 1 a 100 minutos.');
  }
  return minutes;
}

export function actionPayload(entity_id, action, duration) {
  if (!IRRIGATION_ZONES.some(zone => zone.id === entity_id)) throw new Error('Zona não autorizada.');
  if (action === 'start') return {entity_id, service: 'rainbird_iq4.start_zone', duration: validateDuration(duration)};
  if (action === 'stop') return {entity_id, service: 'rainbird_iq4.stop_zone'};
  throw new Error('Ação inválida.');
}

export function normalizeStates(states) {
  return IRRIGATION_ZONES.map(zone => {
    const state = states?.[zone.id]?.state;
    return {...zone, state: Object.hasOwn(labels, state) ? state : 'unavailable'};
  });
}

export function mountIrrigation(root, {request, refresh}) {
  let active = true;
  const rows = new Map();
  for (const zone of IRRIGATION_ZONES) {
    const card = document.createElement('article');
    card.className = 'k21-zone';
    card.innerHTML = '<div class="k21-zone-heading"><div><small></small><h3></h3></div><span class="k21-state"></span></div>' +
      '<label>Tempo de rega <span><input type="number" min="1" max="100" step="1" value="10" inputmode="numeric"> min</span></label>' +
      '<div class="k21-actions"><button type="button" data-action="start">Regar</button><button type="button" data-action="stop">Parar</button></div>' +
      '<p class="k21-feedback" role="status"></p>';
    card.querySelector('h3').textContent = zone.name;
    card.querySelector('small').textContent = 'Estação ' + zone.station;
    const input = card.querySelector('input');
    input.setAttribute('aria-label', 'Duração em minutos · ' + zone.name);
    const row = {state:'unavailable', busy:false};
    const buttons = [...card.querySelectorAll('button')];
    const status = card.querySelector('.k21-state');
    const feedback = card.querySelector('.k21-feedback');
    row.update = state => {
      row.state = state;
      status.dataset.state = state;
      status.textContent = labels[state] || 'Indisponível';
      for (const button of buttons) button.disabled = row.busy || state === 'unavailable';
    };
    for (const button of buttons) button.addEventListener('click', async () => {
      if (!active || row.busy || row.state === 'unavailable') return;
      try {
        const start = button.dataset.action === 'start';
        const payload = actionPayload(zone.id, start ? 'start' : 'stop', input.value);
        const question = start ? 'Regar ' + zone.name + ' por ' + payload.duration + ' min?' : 'Parar a rega de ' + zone.name + '?';
        if (!window.confirm(question)) return;
        row.busy = true;
        row.update(row.state);
        feedback.textContent = 'Enviando comando…';
        const result = await request(payload);
        if (!active) return;
        if (!result?.accepted) throw new Error('O envio do comando não foi confirmado.');
        feedback.textContent = 'Comando aceito pelo Home Assistant.';
        await refresh();
      } catch (error) {
        if (active) feedback.textContent = error.message || 'Não foi possível confirmar o comando.';
      } finally {
        row.busy = false;
        if (active) row.update(row.state);
      }
    });
    row.update('unavailable');
    rows.set(zone.id, row);
    root.append(card);
  }
  return {
    setStates(states) {
      if (active) for (const zone of normalizeStates(states)) rows.get(zone.id).update(zone.state);
    },
    destroy() { active = false; root.replaceChildren(); }
  };
}
