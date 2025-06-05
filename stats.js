const supabaseUrl = 'https://dqaxkapftyoemlzwbjgx.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxYXhrYXBmdHlvZW1sendiamd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5MjEzMzYsImV4cCI6MjA2NDQ5NzMzNn0.onSRsrHzLpFaVYCdrxYoa8uFD2WDcd2H0PdVEUmM8UA';
const supa = supabase.createClient(supabaseUrl, supabaseKey);

// ----- Parámetros de Elo (inspirados en el script en Python) -----
const ELO_INITIAL = 875;
const K_FACTOR = 32;
const UMBRAL_ELO_B = 850;
const UMBRAL_ELO_A = 1000;

const birriaSelect = document.getElementById('birria-select');
const statsTable = document.getElementById('stats-table');
const playerSelect = document.getElementById('player-select');
const playerInfo = document.getElementById('player-info');
const duoTable = document.getElementById('duo-table');

let partidas = [];
let players = new Set();
let birrias = [];
let eloRatings = {};

function getGroup(elo) {
  if (elo >= UMBRAL_ELO_A) return 'A';
  if (elo >= UMBRAL_ELO_B) return 'B';
  return 'C';
}

async function computeTrueSkill(matches) {
  const { TrueSkill, rate } = await import('https://cdn.jsdelivr.net/npm/ts-trueskill@5/+esm');
  const env = new TrueSkill(ELO_INITIAL, ELO_INITIAL / 3);
  const ratings = {};
  const sorted = [...matches].sort((a, b) => a.id - b.id);
  sorted.forEach(m => {
    const a1 = m.dupla_a?.player_a?.name;
    const a2 = m.dupla_a?.player_b?.name;
    const b1 = m.dupla_b?.player_a?.name;
    const b2 = m.dupla_b?.player_b?.name;
    if (!a1 || !a2 || !b1 || !b2) return;

    [a1, a2, b1, b2].forEach(p => {
      if (!ratings[p]) ratings[p] = env.createRating();
    });

    const teams = [
      [ratings[a1], ratings[a2]],
      [ratings[b1], ratings[b2]]
    ];
    const winA = m.winner_dupla === m.dupla_a?.id;
    const ranks = winA ? [0, 1] : [1, 0];
    const newRatings = rate(teams, ranks, undefined, undefined, env);
    [ratings[a1], ratings[a2]] = newRatings[0];
    [ratings[b1], ratings[b2]] = newRatings[1];
  });
  const exposed = {};
  Object.keys(ratings).forEach(p => {
    exposed[p] = env.expose(ratings[p]) + ELO_INITIAL;
  });
  return exposed;
}

async function loadBirrias() {
  const { data, error } = await supa
    .from('birrias')
    .select('id, play_date, notes')
    .order('play_date', { ascending: false });
  if (error) { console.error(error); return; }
  birrias = data || [];
  birriaSelect.innerHTML = '<option value="">Datos generales</option>';
  birrias.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.id;
    opt.textContent = b.notes || b.play_date;
    birriaSelect.appendChild(opt);
  });
}

async function loadPartidas() {
  let query = supa
    .from('partidas')
    .select(`id, score_a, score_b, winner_dupla, ronda_id,
      rondas!inner(birria_id),
      dupla_a:dupla_a_id(id, player_a(name), player_b(name)),
      dupla_b:dupla_b_id(id, player_a(name), player_b(name))`);
  const birriaId = birriaSelect.value;
  if (birriaId) query = query.eq('rondas.birria_id', birriaId);
  const { data, error } = await query;
  if (error) { console.error(error); return; }
  partidas = data || [];
  players = new Set();
  partidas.forEach(p => {
    const a1 = p.dupla_a?.player_a?.name;
    const a2 = p.dupla_a?.player_b?.name;
    const b1 = p.dupla_b?.player_a?.name;
    const b2 = p.dupla_b?.player_b?.name;
    [a1, a2, b1, b2].forEach(n => { if (n) players.add(n); });
  });
  eloRatings = await computeTrueSkill(partidas);
  renderGeneral();
  buildPlayerSelect();
  playerSelect.value = '';
  renderPlayer('');
}

function buildPlayerSelect() {
  playerSelect.innerHTML = '<option value="">Elige jugador</option>';
  Array.from(players).sort().forEach(n => {
    const opt = document.createElement('option');
    opt.value = n;
    opt.textContent = n;
    playerSelect.appendChild(opt);
  });
}

function renderGeneral() {
  const stats = {};
  partidas.forEach(p => {
    const duoA = [p.dupla_a?.player_a?.name, p.dupla_a?.player_b?.name];
    const duoB = [p.dupla_b?.player_a?.name, p.dupla_b?.player_b?.name];
    const winnerId = p.winner_dupla;
    const winner = winnerId === p.dupla_a?.id ? 'A' : (winnerId === p.dupla_b?.id ? 'B' : null);
    duoA.forEach(n => {
      if (!n) return;
      stats[n] = stats[n] || { wins:0, played:0, pf:0, pc:0 };
      stats[n].played += 1;
      stats[n].pf += p.score_a || 0;
      stats[n].pc += p.score_b || 0;
      if (winner === 'A') stats[n].wins += 1;
    });
    duoB.forEach(n => {
      if (!n) return;
      stats[n] = stats[n] || { wins:0, played:0, pf:0, pc:0 };
      stats[n].played += 1;
      stats[n].pf += p.score_b || 0;
      stats[n].pc += p.score_a || 0;
      if (winner === 'B') stats[n].wins += 1;
    });
  });
  statsTable.innerHTML = '<tr><th class="border p-2 bg-gray-100">Jugador</th><th class="border p-2 bg-gray-100">Elo</th><th class="border p-2 bg-gray-100">Grupo</th><th class="border p-2 bg-gray-100">WinRate</th><th class="border p-2 bg-gray-100">Partidas</th><th class="border p-2 bg-gray-100">Puntos Totales</th></tr>';
  Object.keys(stats)
    .sort((a, b) => (eloRatings[b] ?? ELO_INITIAL) - (eloRatings[a] ?? ELO_INITIAL))
    .forEach(n => {
      const s = stats[n];
      const elo = eloRatings[n] ? eloRatings[n].toFixed(1) : ELO_INITIAL.toFixed(1);
      const group = getGroup(eloRatings[n] ?? ELO_INITIAL);
      const winRate = s.played ? ((s.wins / s.played) * 100).toFixed(1) + '%' : '-';
      const diff = s.pf - s.pc;
      statsTable.innerHTML += `<tr><td class='border p-2'>${n}</td><td class='border p-2'>${elo}</td><td class='border p-2'>${group}</td><td class='border p-2'>${winRate}</td><td class='border p-2'>${s.played}</td><td class='border p-2'>${diff}</td></tr>`;
    });
}

function renderPlayer(name) {
  if (!name) {
    playerInfo.textContent = '';
    duoTable.innerHTML = '';
    return;
  }
  const info = { wins:0, played:0, pf:0, pc:0 };
  const duoStats = {};
  partidas.forEach(p => {
    const duoA = [p.dupla_a?.player_a?.name, p.dupla_a?.player_b?.name];
    const duoB = [p.dupla_b?.player_a?.name, p.dupla_b?.player_b?.name];
    const winnerId = p.winner_dupla;
    const winA = winnerId === p.dupla_a?.id;
    const winB = winnerId === p.dupla_b?.id;
    if (duoA.includes(name)) {
      info.played += 1;
      info.pf += p.score_a || 0;
      info.pc += p.score_b || 0;
      if (winA) info.wins += 1;
      const mate = duoA[0] === name ? duoA[1] : duoA[0];
      if (mate) {
        duoStats[mate] = duoStats[mate] || { wins:0, played:0 };
        duoStats[mate].played += 1;
        if (winA) duoStats[mate].wins += 1;
      }
    } else if (duoB.includes(name)) {
      info.played += 1;
      info.pf += p.score_b || 0;
      info.pc += p.score_a || 0;
      if (winB) info.wins += 1;
      const mate = duoB[0] === name ? duoB[1] : duoB[0];
      if (mate) {
        duoStats[mate] = duoStats[mate] || { wins:0, played:0 };
        duoStats[mate].played += 1;
        if (winB) duoStats[mate].wins += 1;
      }
    }
  });
  const winRate = info.played ? ((info.wins / info.played)*100).toFixed(1)+'%' : '-';
  const elo = eloRatings[name] ? eloRatings[name].toFixed(1) : ELO_INITIAL.toFixed(1);
  const group = getGroup(eloRatings[name] ?? ELO_INITIAL);
  const diff = info.pf - info.pc;
  playerInfo.innerHTML =
    '<tr>'+
    '<th class="border p-2 bg-gray-100">Jugador</th>'+
    '<th class="border p-2 bg-gray-100">Elo</th>'+
    '<th class="border p-2 bg-gray-100">Grupo</th>'+
    '<th class="border p-2 bg-gray-100">WinRate</th>'+
    '<th class="border p-2 bg-gray-100">Partidas</th>'+
    '<th class="border p-2 bg-gray-100">Puntos Totales</th>'+
    '</tr>'+
    `<tr><td class='border p-2'>${name}</td><td class='border p-2'>${elo}</td><td class='border p-2'>${group}</td><td class='border p-2'>${winRate}</td><td class='border p-2'>${info.played}</td><td class='border p-2'>${diff}</td></tr>`;
  duoTable.innerHTML = '<tr><th class="border p-2 bg-gray-100">Compañero</th><th class="border p-2 bg-gray-100">WinRate</th><th class="border p-2 bg-gray-100">Partidas</th></tr>';
  Object.keys(duoStats)
    .sort((a, b) => duoStats[b].played - duoStats[a].played)
    .forEach(m => {
      const s = duoStats[m];
      const wr = s.played ? ((s.wins/s.played)*100).toFixed(1)+'%' : '-';
      duoTable.innerHTML += `<tr><td class='border p-2'>${m}</td><td class='border p-2'>${wr}</td><td class='border p-2'>${s.played}</td></tr>`;
    });
}

birriaSelect.onchange = loadPartidas;
playerSelect.onchange = () => renderPlayer(playerSelect.value);

loadBirrias().then(loadPartidas);
