const supabaseUrl = 'https://dqaxkapftyoemlzwbjgx.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxYXhrYXBmdHlvZW1sendiamd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5MjEzMzYsImV4cCI6MjA2NDQ5NzMzNn0.onSRsrHzLpFaVYCdrxYoa8uFD2WDcd2H0PdVEUmM8UA';
const supa = supabase.createClient(supabaseUrl, supabaseKey);

// ----- Parámetros de Elo (inspirados en el script en Python) -----
const ELO_INITIAL = 875;
const UMBRAL_ELO_B = 850;
const UMBRAL_ELO_A = 1000;

const birriaSelect = document.getElementById('birria-select');
const statsTable = document.getElementById('stats-table');
const playerSelect = document.getElementById('player-select');
const playerInfo = document.getElementById('player-info');
const duoTable = document.getElementById('duo-table');
const h2hTable = document.getElementById('h2h-table');
const tsCanvas = document.getElementById('ts-chart');
const minGamesSelect = document.getElementById('min-games');

let muElo = ELO_INITIAL;
let sigmaElo = 0;

let partidas = [];
let players = new Set();
let birrias = [];
let eloRatings = {};
let ratingHistory = {};
let tsChart = null;

function getGroup(elo) {
  if (elo >= muElo + 0.5 * sigmaElo) return 'A';
  if (elo >= muElo - 0.5 * sigmaElo) return 'B';
  if (elo >= muElo - 1.5 * sigmaElo) return 'C';
  return 'D';
}

async function computeTrueSkill(matches) {
  const { TrueSkill, rate } = await import('https://cdn.jsdelivr.net/npm/ts-trueskill@5/dist/src/index.js');
  const env = new TrueSkill(ELO_INITIAL, ELO_INITIAL / 3);
  const ratings = {};
  ratingHistory = {};
  const sorted = [...matches].sort((a, b) => a.id - b.id);
  sorted.forEach((m, idx) => {
    const a1 = m.dupla_a?.player_a?.name;
    const a2 = m.dupla_a?.player_b?.name;
    const b1 = m.dupla_b?.player_a?.name;
    const b2 = m.dupla_b?.player_b?.name;
    if (!a1 || !a2 || !b1 || !b2) return;

    [a1, a2, b1, b2].forEach(p => {
      if (!ratings[p]) {
        ratings[p] = env.createRating();
        ratingHistory[p] = [];
      }
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

    [a1, a2, b1, b2].forEach(p => {
      ratingHistory[p].push({ x: idx + 1, y: env.expose(ratings[p]) + ELO_INITIAL });
    });
  });
  const exposed = {};
  Object.keys(ratings).forEach(p => {
    exposed[p] = env.expose(ratings[p]) + ELO_INITIAL;
  });
  const values = Object.values(exposed);
  if (values.length) {
    muElo = values.reduce((s, e) => s + e, 0) / values.length;
    sigmaElo = Math.sqrt(values.reduce((s, e) => s + (e - muElo) ** 2, 0) / values.length);
  }
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
  const minGames = parseInt(minGamesSelect.value, 10) || 0;
  Object.keys(stats)
    .filter(n => stats[n].played >= minGames)
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
    h2hTable.innerHTML = '';
    if (tsChart) { tsChart.destroy(); tsChart = null; }
    return;
  }
  const info = { wins:0, played:0, pf:0, pc:0 };
  const duoStats = {};
  const h2hStats = {};
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
      duoB.forEach(op => {
        if (!op) return;
        h2hStats[op] = h2hStats[op] || { wins:0, losses:0 };
        if (winA) h2hStats[op].wins += 1; else h2hStats[op].losses +=1;
      });
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
      duoA.forEach(op => {
        if (!op) return;
        h2hStats[op] = h2hStats[op] || { wins:0, losses:0 };
        if (winB) h2hStats[op].wins += 1; else h2hStats[op].losses += 1;
      });
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

  h2hTable.innerHTML = '<tr><th class="border p-2 bg-gray-100">Rival</th><th class="border p-2 bg-gray-100">Victorias</th><th class="border p-2 bg-gray-100">Derrotas</th></tr>';
  Object.keys(h2hStats)
    .sort((a, b) => (h2hStats[b].wins + h2hStats[b].losses) - (h2hStats[a].wins + h2hStats[a].losses))
    .forEach(r => {
      const s = h2hStats[r];
      h2hTable.innerHTML += `<tr><td class='border p-2'>${r}</td><td class='border p-2'>${s.wins}</td><td class='border p-2'>${s.losses}</td></tr>`;
    });

  if (tsChart) { tsChart.destroy(); }
  if (ratingHistory[name]) {
    tsChart = new Chart(tsCanvas.getContext('2d'), {
      type: 'line',
      data: {
        datasets: [{
          label: name,
          data: ratingHistory[name],
          borderColor: 'rgb(75,192,192)',
          tension: 0.1,
          fill: false
        }]
      },
      options: {
        scales: {
          x: { title: { display: true, text: 'Partida' } },
          y: { title: { display: true, text: 'TrueSkill' } }
        }
      }
    });
  }
}

birriaSelect.onchange = loadPartidas;
playerSelect.onchange = () => renderPlayer(playerSelect.value);
minGamesSelect.onchange = renderGeneral;

loadBirrias().then(loadPartidas);
