const supabaseUrl = 'https://dqaxkapftyoemlzwbjgx.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxYXhrYXBmdHlvZW1sendiamd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5MjEzMzYsImV4cCI6MjA2NDQ5NzMzNn0.onSRsrHzLpFaVYCdrxYoa8uFD2WDcd2H0PdVEUmM8UA';
const supa = supabase.createClient(supabaseUrl, supabaseKey);

const birriaSelect = document.getElementById('birria-select');
const statsTable = document.getElementById('stats-table');
const playerSelect = document.getElementById('player-select');
const playerInfo = document.getElementById('player-info');
const duoTable = document.getElementById('duo-table');

let partidas = [];
let players = new Set();
let birrias = [];

async function loadBirrias() {
  const { data, error } = await supa
    .from('birrias')
    .select('id, play_date, notes')
    .order('play_date', { ascending: false });
  if (error) { console.error(error); return; }
  birrias = data || [];
  birriaSelect.innerHTML = '<option value="">Todas las birrias</option>';
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
    .select('id, score_a, score_b, winner_dupla, rondas(birria_id), dupla_a:dupla_a_id(player_a(name), player_b(name)), dupla_b:dupla_b_id(player_a(name), player_b(name))');
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
  renderGeneral();
  buildPlayerSelect();
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
    const winner = p.winner_dupla === p.dupla_a?.id ? 'A' : (p.winner_dupla === p.dupla_b?.id ? 'B' : null);
    duoA.forEach(n => {
      if (!n) return;
      stats[n] = stats[n] || { wins:0, played:0, points:0 };
      stats[n].played += 1;
      stats[n].points += p.score_a || 0;
      if (winner === 'A') stats[n].wins += 1;
    });
    duoB.forEach(n => {
      if (!n) return;
      stats[n] = stats[n] || { wins:0, played:0, points:0 };
      stats[n].played += 1;
      stats[n].points += p.score_b || 0;
      if (winner === 'B') stats[n].wins += 1;
    });
  });
  statsTable.innerHTML = '<tr><th class="border p-2 bg-gray-100">Jugador</th><th class="border p-2 bg-gray-100">WinRate</th><th class="border p-2 bg-gray-100">Partidas</th><th class="border p-2 bg-gray-100">Puntos</th></tr>';
  Object.keys(stats).sort().forEach(n => {
    const s = stats[n];
    const winRate = s.played ? ((s.wins / s.played) * 100).toFixed(1) + '%' : '-';
    statsTable.innerHTML += `<tr><td class='border p-2'>${n}</td><td class='border p-2'>${winRate}</td><td class='border p-2'>${s.played}</td><td class='border p-2'>${s.points}</td></tr>`;
  });
}

function renderPlayer(name) {
  if (!name) {
    playerInfo.textContent = '';
    duoTable.innerHTML = '';
    return;
  }
  const info = { wins:0, played:0, points:0 };
  const duoStats = {};
  partidas.forEach(p => {
    const duoA = [p.dupla_a?.player_a?.name, p.dupla_a?.player_b?.name];
    const duoB = [p.dupla_b?.player_a?.name, p.dupla_b?.player_b?.name];
    const winA = p.winner_dupla === p.dupla_a?.id;
    const winB = p.winner_dupla === p.dupla_b?.id;
    if (duoA.includes(name)) {
      info.played += 1;
      info.points += p.score_a || 0;
      if (winA) info.wins += 1;
      const mate = duoA[0] === name ? duoA[1] : duoA[0];
      if (mate) {
        duoStats[mate] = duoStats[mate] || { wins:0, played:0 };
        duoStats[mate].played += 1;
        if (winA) duoStats[mate].wins += 1;
      }
    } else if (duoB.includes(name)) {
      info.played += 1;
      info.points += p.score_b || 0;
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
  playerInfo.textContent = `${name}: WinRate ${winRate}, Partidas ${info.played}, Puntos ${info.points}`;
  duoTable.innerHTML = '<tr><th class="border p-2 bg-gray-100">Compañero</th><th class="border p-2 bg-gray-100">WinRate</th><th class="border p-2 bg-gray-100">Partidas</th></tr>';
  Object.keys(duoStats).sort().forEach(m => {
    const s = duoStats[m];
    const wr = s.played ? ((s.wins/s.played)*100).toFixed(1)+'%' : '-';
    duoTable.innerHTML += `<tr><td class='border p-2'>${m}</td><td class='border p-2'>${wr}</td><td class='border p-2'>${s.played}</td></tr>`;
  });
}

birriaSelect.onchange = loadPartidas;
playerSelect.onchange = () => renderPlayer(playerSelect.value);

loadBirrias().then(loadPartidas);
