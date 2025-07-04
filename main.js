    /* =================== Estado y utilidades =================== */
    const DEFAULT_PRESETS = ["Pepito","Katy","Ng","Steven","Alex","Brando","Bethania","Michel","Kelvin","Kevin","Patricia","Jonny","Leo","Kelvin","Ricky","Gina"];
    const qs = s => document.querySelector(s);
    const qsa = s => document.querySelectorAll(s);

    // DOM refs
    const nameInput       = qs('#player-name');
    const btnAdd          = qs('#btn-add');
    const datalistEl      = qs('#players-list');
    const presetWrapper   = qs('#preset-buttons');
    const togglePresets   = qs('#toggle-presets');
    const presetList      = qs('#preset-list');
    const listEl          = qs('#list');
    const playerSection   = qs('#player-list');
    const roundSection    = qs('#round-controls');
    const roundTitle      = qs('#round-title');
    const roundMenu       = qs('#round-menu');
    const pairTable       = qs('#pairings-table');
    const nextBtn         = qs('#next');
    const deleteBtn       = qs('#delete-round');
    const resetBtn        = qs('#reset');
    const showMatrixBtn   = qs('#show-matrix');
    const historyList     = qs('#history-list');
    const matrixSection   = qs('#matrix-section');
    const matrixTable     = qs('#matrix-table');
    const matchSection    = qs('#match-section');
    const birriaSection   = qs('#birria-section');
    const newBirriaBtn    = qs('#new-birria');
    const deleteBirriaBtn = qs('#delete-birria');
    const birriaInfo      = qs('#birria-info');
    const birriaSelect    = qs('#birria-select');
    const selectRound     = qs('#select-round');

    const playerA1Sel     = qs('#player-a1');
    const playerA2Sel     = qs('#player-a2');
    const playerB1Sel     = qs('#player-b1');
    const playerB2Sel     = qs('#player-b2');
    const scoreAInput     = qs('#score-a');
    const scoreBInput     = qs('#score-b');
    const saveMatchBtn    = qs('#save-match-btn');
    const selectMatch     = qs('#select-match');
    const deleteMatchBtn  = qs('#delete-match-btn');


    let players  = JSON.parse(localStorage.getItem('players')  || '[]');
    let history  = JSON.parse(localStorage.getItem('history')  || '[]');
    let stats    = JSON.parse(localStorage.getItem('stats')    || '{}');
    let absents  = JSON.parse(localStorage.getItem('absents')  || '[]');
    let round    = history.length;
    let currentRoundIdx = history.length ? history.length - 1 : null;
    let currentBirriaId = localStorage.getItem('currentBirriaId') || null;
    let lastRondaId = null;
    const playersMap = {};
    const SOLO_DUMMY = '__SOLO__';

    let matchDraft = JSON.parse(localStorage.getItem('matchDraft') || '{}');

    const save = () => {
      localStorage.setItem('players', JSON.stringify(players));
      localStorage.setItem('history', JSON.stringify(history));
      localStorage.setItem('stats',   JSON.stringify(stats));
      localStorage.setItem('absents', JSON.stringify(absents));
      if (currentBirriaId) {
        localStorage.setItem('currentBirriaId', currentBirriaId);
      } else {
        localStorage.removeItem('currentBirriaId');
      }
    };

    function persistMatchDraft() {
      localStorage.setItem('matchDraft', JSON.stringify({
        matchId: selectMatch.value,
        roundId: selectRound.value,
        playerA1: playerA1Sel.value,
        playerA2: playerA2Sel.value,
        playerB1: playerB1Sel.value,
        playerB2: playerB2Sel.value,
        scoreA: scoreAInput.value,
        scoreB: scoreBInput.value,
      }));
    }

    async function restoreMatchDraft() {
      matchDraft = JSON.parse(localStorage.getItem('matchDraft') || '{}');
      if (!matchDraft || Object.keys(matchDraft).length === 0) return;
      if (matchDraft.roundId) {
        selectRound.value = matchDraft.roundId;
        await loadDuplas(matchDraft.roundId);
      }
      selectMatch.value = matchDraft.matchId || '';
      playerA1Sel.value = matchDraft.playerA1 || '';
      playerA2Sel.value = matchDraft.playerA2 || '';
      playerB1Sel.value = matchDraft.playerB1 || '';
      playerB2Sel.value = matchDraft.playerB2 || '';
      scoreAInput.value = matchDraft.scoreA || '';
      scoreBInput.value = matchDraft.scoreB || '';
    }

    /* =================== Supabase helpers =================== */
    async function getPlayerId(name) {
      if (playersMap[name]) return playersMap[name];
      let { data, error } = await supa.from('players').select('id').eq('name', name).limit(1);
      if (error) { console.error(error); return null; }
      if (data && data.length) {
        playersMap[name] = data[0].id;
        return data[0].id;
      }
      ({ data, error } = await supa.from('players').insert({ name }).select('id').single());
      if (error) { console.error(error); return null; }
      playersMap[name] = data.id;
      return data.id;
    }

    async function createBirria() {
      const nombre = prompt('Nombre de la birria?');
      if (!nombre) return null;
      const play_date = new Date().toISOString().slice(0,10);
      const { data, error } = await supa
        .from('birrias')
        .insert({ play_date, notes: nombre })
        .select('id, play_date, notes')
        .single();
      if (error) { console.error(error); return null; }
      currentBirriaId = data.id;
      birriaInfo.textContent = `Birria ${data.notes || data.play_date}`;
      save();

      birriaSection.classList.remove('hidden');
      newBirriaBtn.classList.add('hidden');
      deleteBirriaBtn.classList.remove('hidden');
      await loadBirrias();
      birriaSelect.value = currentBirriaId;
      return data.id;
    }

    async function refreshStatsFromDB() {
      let query = supa
        .from('duplas')
        .select('position, ronda_id, rondas!inner(birria_id), player_a(name), player_b(name)');
      if (currentBirriaId) query = query.eq('rondas.birria_id', currentBirriaId);
      const { data, error } = await query;
      if (error) { console.error(error); return; }
      stats = {};
      const pSet = new Set();
      const seen = new Set();
      const maxPos = {};
      const soloMap = {};
      (data || []).forEach(d => {
        maxPos[d.ronda_id] = Math.max(maxPos[d.ronda_id] || 0, d.position || 0);
        const a = d.player_a?.name;
        const b = d.player_b?.name;
        if (a === SOLO_DUMMY) { soloMap[d.ronda_id] = b; return; }
        if (b === SOLO_DUMMY) { soloMap[d.ronda_id] = a; return; }
        if (!a || !b) return;
        const key = `${d.ronda_id}|${[a, b].sort().join('|')}`;
        if (seen.has(key)) return; // evitar duplicados por partidas
        seen.add(key);
        const pos = d.position || 0;
        [a, b].forEach(n => {
          stats[n] = stats[n] || { sum: 0, count: 0 };
          stats[n].sum += pos;
          stats[n].count += 1;
          pSet.add(n);
        });
      });
      Object.entries(soloMap).forEach(([id, soloName]) => {
        const pos = maxPos[id] || 0;
        if (!soloName) return;
        stats[soloName] = stats[soloName] || { sum: 0, count: 0 };
        stats[soloName].sum += pos;
        stats[soloName].count += 1;
        pSet.add(soloName);
      });
      players = Array.from(pSet).filter(n => n !== SOLO_DUMMY).sort();
      save();
    }

    async function loadBirrias() {
      const { data, error } = await supa
        .from('birrias')
        .select('id, play_date, notes')

        .order('play_date', { ascending: false });
      if (error) { console.error(error); return; }
      birriaSelect.innerHTML = '<option value="">Elige birria</option>';
      (data || []).forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.id;
        opt.textContent = b.notes || b.play_date;

        birriaSelect.appendChild(opt);
      });
      if (currentBirriaId) birriaSelect.value = currentBirriaId;
    }

    async function saveRoundToSupabase(pairs, num, solo) {
      if (!currentBirriaId) return null;
      const fields = { birria_id: currentBirriaId, round_num: num };
      let soloId = null;
      if (solo) {
        soloId = await getPlayerId(solo);
      }
      let { data, error } = await supa.from('rondas').insert(fields).select('id').single();
      if (error) { console.error(error); return; }
      const rondaId = data.id;
      const duplas = [];
      for (let i=0;i<pairs.length;i++) {
        const [a,b] = pairs[i];
        const aId = await getPlayerId(a);
        const bId = await getPlayerId(b);
        duplas.push({ ronda_id: rondaId, player_a: aId, player_b: bId, position: i+1 });
      }
      if (solo) {
        const dummyId = await getPlayerId(SOLO_DUMMY);
        duplas.push({ ronda_id: rondaId, player_a: soloId, player_b: dummyId, position: pairs.length + 1 });
      }
      const { error: dErr } = await supa.from('duplas').insert(duplas);
      if (dErr) console.error(dErr);
      await loadRounds();
      return rondaId;
    }

    /* =================== Promedio posiciones =================== */
    function record(pairs, solo) {
      const len = pairs.length;
      pairs.forEach(([a, b], i) => {
        const pos = i + 1;
        [a, b].forEach(n => {
          stats[n] = stats[n] || { sum: 0, count: 0 };
          stats[n].sum   += pos;
          stats[n].count += 1;
        });
      });
      if (solo) {
        stats[solo] = stats[solo] || { sum: 0, count: 0 };
        stats[solo].sum   += len + 1;
        stats[solo].count += 1;
      }
    }
    function recomputeStats() {
      stats = {};
      history.forEach(h => {
        record(h.pairs, h.solo);
      });
    }
    const avg = n => stats[n] ? (stats[n].sum / stats[n].count).toFixed(2) : '-';

    /* =================== Render lista + presets =================== */
    function updateDatalist() {
      datalistEl.innerHTML = '';
      players.forEach(p => {
        const o = document.createElement('option');
        o.value = p;
        datalistEl.appendChild(o);
      });
    }

    function renderPlayers() {
      if (!players.length) {
        playerSection.classList.add('hidden');
        roundSection.classList.add('hidden');
        qs('#history-section').classList.add('hidden');
        updateDatalist();
        return;
      }
      playerSection.classList.remove('hidden');
      listEl.innerHTML = '';
      players.forEach((p, i) => {
        const li = document.createElement('li');
        const isAbsent = absents.includes(p);
        li.className = 'flex justify-between items-center bg-gray-50 rounded-xl p-2 hover:bg-gray-100' + (isAbsent ? ' opacity-50' : '');
        li.innerHTML = `<span>${i + 1}. ${p} <span class='text-xs text-gray-500'>(prom: ${avg(p)})</span></span>`;

        const buttons = document.createElement('div');

        const absentBtn = document.createElement('button');
        absentBtn.textContent = isAbsent ? 'Presente' : 'Ausente';
        absentBtn.className = 'text-xs border rounded px-2 py-1 mr-2 ' + (isAbsent ? 'bg-green-200' : 'bg-yellow-200');
        absentBtn.onclick = () => {
          if (isAbsent) absents = absents.filter(a => a !== p); else absents.push(p);
          save();
          renderPlayers();
          updateMatrixTable();
        };

        const del = document.createElement('button');
        del.innerHTML = '&times;';
        del.className = 'text-red-500 hover:text-red-700';
        del.onclick = () => {
          delete stats[p];
          players.splice(i, 1);
          absents = absents.filter(a => a !== p);
          updatePresetStyles();
          save();
          renderPlayers();
          updateMatrixTable();
        };

        buttons.appendChild(absentBtn);
        buttons.appendChild(del);
        li.appendChild(buttons);
        listEl.appendChild(li);
      });
      updateDatalist();
      const show = players.length >= 3;
      roundSection.classList.toggle('hidden', !show);
      qs('#history-section').classList.toggle('hidden', !show);
    }

    /* Preset buttons */
    function buildPresetButtons() {
      presetWrapper.innerHTML = '';
      DEFAULT_PRESETS.forEach(name => {
        const b = document.createElement('button');
        b.textContent = name;
        b.className = 'preset-button rounded-xl p-2 text-xs font-medium';
      b.onclick = () => {
        if (players.includes(name)) return;
        players.push(name);
        stats[name] = stats[name] || { sum: 0, count: 0 };
        save();
        renderPlayers();
        updatePresetStyles();
        updateMatrixTable();
        getPlayerId(name);
      };
        presetWrapper.appendChild(b);
      });
      updatePresetStyles();
    }
    function updatePresetStyles() {
      qsa('.preset-button').forEach(b => {
        b.className = `preset-button rounded-xl p-2 text-xs font-medium ${players.includes(b.textContent) ? 'bg-red-300/70 hover:bg-red-400 text-white' : 'bg-green-200 hover:bg-green-300 text-gray-700'}`;
      });
    }

    /* =================== Algoritmo de parejas =================== */
    function generateRound(idx) {
      const active = players.filter(p => !absents.includes(p));
      if (active.length < 3) return { pairs: [], solo: null };

      // Historial de parejas y solos
      const pairCounts = {};
      const soloCounts = {};
      history.forEach(h => {
        h.pairs.forEach(([a, b]) => {
          const k = pairKey(a, b);
          pairCounts[k] = (pairCounts[k] || 0) + 1;
        });
        if (h.solo) soloCounts[h.solo] = (soloCounts[h.solo] || 0) + 1;
      });

      const avgOf = name => {
        const st = stats[name] || { sum: 0, count: 0 };
        const mean = (active.length + 1) / 2;
        return st.count ? st.sum / st.count : mean;
      };

      const baseArr = [...active];
      let solo = null;
      if (baseArr.length % 2 === 1) {
        baseArr.sort((a, b) => {
          const sa = soloCounts[a] || 0;
          const sb = soloCounts[b] || 0;
          if (sa !== sb) return sa - sb;
          return avgOf(b) - avgOf(a);
        });
        solo = baseArr.shift();
      }

      const memo = new Map();
      function search(arr) {
        const key = arr.slice().sort().join('|');
        if (memo.has(key)) return memo.get(key);
        if (arr.length === 0) return { pairs: [], repeats: 0, cost: 0 };
        const [first, ...rest] = arr;
        let best = { pairs: [], repeats: Infinity, cost: Infinity };
        for (let i = 0; i < rest.length; i++) {
          const second = rest[i];
          const remaining = rest.slice(0, i).concat(rest.slice(i + 1));
          const k = pairKey(first, second);
          const cnt = pairCounts[k] || 0;
          const res = search(remaining);
          const repeats = res.repeats + (cnt > 0 ? 1 : 0);
          const cost = res.cost + cnt;
          if (repeats < best.repeats || (repeats === best.repeats && cost < best.cost)) {
            best = { pairs: [[first, second], ...res.pairs], repeats, cost };
          }
        }
        memo.set(key, best);
        return best;
      }

      const result = search(baseArr);
      const mean = ((result.pairs.length + 1) + 1) / 2;
      result.pairs.sort((u, v) => {
        const du = ((avgOf(u[0]) + avgOf(u[1])) / 2) - mean;
        const dv = ((avgOf(v[0]) + avgOf(v[1])) / 2) - mean;
        return dv - du;
      });

      return { pairs: result.pairs, solo };
    }

    /* =================== Mostrar ronda e historial =================== */
    function showRound({ pairs, solo }) {
      pairTable.innerHTML = '<tr><th class="border p-2 bg-gray-100">#</th><th class="border p-2 bg-gray-100">Dupla</th></tr>';
      pairs.forEach((p, i) => {
        pairTable.innerHTML += `<tr><td class='border p-2 font-medium bg-gray-50'>Duo ${i + 1}</td><td class='border p-2'>${p[0]} + ${p[1]}</td></tr>`;
      });
      if (solo) {
        pairTable.innerHTML += `<tr><td class='border p-2 font-medium bg-yellow-100'>Solo</td><td class='border p-2 text-red-600'>${solo}</td></tr>`;
      }
    }
    function renderHistory() {
      historyList.innerHTML = '';
      history.slice().reverse().forEach(h => {
        const div = document.createElement('div');
        div.className = 'border rounded-xl overflow-hidden shadow-sm';
        let html = `<table class='w-full text-xs text-center border-collapse'><tr><th colspan='3' class='bg-gray-200 p-2'>Ronda ${h.round}</th></tr>`;
        h.pairs.forEach((p, i) => {
          html += `<tr><td class='border p-1 font-medium bg-gray-50'>Duo ${i + 1}</td><td class='border p-1'>${p[0]}</td><td class='border p-1'>${p[1]}</td></tr>`;
        });
        if (h.solo) html += `<tr><td class='border p-1 font-medium bg-yellow-100'>Solo</td><td colspan='2' class='border p-1 text-red-600'>${h.solo}</td></tr>`;
        html += '</table>';
        div.innerHTML = html;
        historyList.appendChild(div);
      });
      renderRoundMenu();
    }

    function renderRoundMenu() {
      roundMenu.innerHTML = '';
      history.forEach((h, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = `Ronda ${i + 1}`;
        roundMenu.appendChild(opt);
      });
      if (history.length) {
        roundMenu.classList.remove('hidden');
        if (currentRoundIdx === null) currentRoundIdx = history.length - 1;
        if (currentRoundIdx >= history.length) currentRoundIdx = history.length - 1;
        roundMenu.value = currentRoundIdx;
      } else {
        roundMenu.classList.add('hidden');
        currentRoundIdx = null;
      }
    }

    /* =================== Matriz de combinaciones =================== */
    const pairKey = (a, b) => [a, b].sort().join('|');
    function updateMatrixTable() {
      const active = players.filter(p => !absents.includes(p));
      if (active.length < 2) {
        matrixTable.innerHTML = '';
        return;
      }
      const played = {};
      history.forEach(h => {
        h.pairs.forEach(([a, b]) => {
          const key = pairKey(a, b);
          played[key] = (played[key] || 0) + 1;
        });
      });

      let html = '<tr><th class="border p-1 bg-gray-200"></th>';
      active.forEach(p => {
        html += `<th class='border p-1 bg-gray-200 text-[10px] sm:text-xs'>${p}</th>`;
      });
      html += '</tr>';

      active.forEach((p, i) => {
        html += `<tr><th class='border p-1 bg-gray-200 text-[10px] sm:text-xs'>${p}</th>`;
        active.forEach((q, j) => {
          if (i === j) {
            html += `<td class='border p-1 bg-gray-50'>—</td>`;
          } else if (i < j) {
            const count = played[pairKey(p, q)] || 0;
            html += `<td class='border p-1 ${count ? 'bg-green-200/60 text-green-700' : 'bg-red-200/60 text-red-700 font-semibold'}'>${count}</td>`;
          } else {
            html += `<td class='border p-1 bg-gray-50'></td>`; // triángulo inferior vacío
          }
        });
        html += '</tr>';
      });
      matrixTable.innerHTML = html;
    }
    /* =================== Rondas y duplas desde Supabase =================== */
    let roundsData = [];
    let duplasData = [];
    let matchesData = [];

    async function loadRounds() {
      let query = supa.from('rondas').select('id, round_num').order('round_num', { ascending: true });
      if (currentBirriaId) query = query.eq('birria_id', currentBirriaId);
      const { data, error } = await query;
      if (error) {
        console.error(error);
        return;
      }
      roundsData = data || [];
      selectRound.innerHTML = '<option value="">Elige ronda</option>';
      roundsData.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = `Ronda ${r.round_num}`;
        selectRound.appendChild(opt);
      });
      matchSection.classList.toggle('hidden', roundsData.length === 0);
    }

    async function loadDuplas(rondaId) {
      const { data, error } = await supa
        .from('duplas')
        .select('id, position, player_a(name), player_b(name)')
        .eq('ronda_id', rondaId)
        .order('position');
      if (error) {
        console.error(error);
        return;
      }
      const list = data || [];
      duplasData = list.filter(d => d.player_a?.name !== SOLO_DUMMY && d.player_b?.name !== SOLO_DUMMY);
      const playersSet = new Set();
      list.forEach(d => {
        if (d.player_a?.name && d.player_a.name !== SOLO_DUMMY) playersSet.add(d.player_a.name);
        if (d.player_b?.name && d.player_b.name !== SOLO_DUMMY) playersSet.add(d.player_b.name);
      });
      const playersArr = Array.from(playersSet).sort();
      const buildOpts = sel => {
        sel.innerHTML = '<option value="">Elige jugador</option>';
        playersArr.forEach(n => {
          const opt = document.createElement('option');
          opt.value = n;
          opt.textContent = n;
          sel.appendChild(opt);
        });
      };
      [playerA1Sel, playerA2Sel, playerB1Sel, playerB2Sel].forEach(sel => {
        buildOpts(sel);
        sel.value = '';
      });

      pairTable.innerHTML = '<tr><th class="border p-2 bg-gray-100">#</th><th class="border p-2 bg-gray-100">Dupla</th></tr>';
      (data || []).sort((a,b)=>a.position-b.position).forEach((d, idx) => {
        const a = d.player_a?.name || 'A';
        const b = d.player_b?.name || 'B';
        if (a === SOLO_DUMMY) {
          pairTable.innerHTML += `<tr><td class='border p-2 font-medium bg-yellow-100'>Solo</td><td class='border p-2 text-red-600'>${b}</td></tr>`;
        } else if (b === SOLO_DUMMY) {
          pairTable.innerHTML += `<tr><td class='border p-2 font-medium bg-yellow-100'>Solo</td><td class='border p-2 text-red-600'>${a}</td></tr>`;
        } else {
          pairTable.innerHTML += `<tr><td class='border p-2 font-medium bg-gray-50'>Duo ${idx + 1}</td><td class='border p-2'>${a} + ${b}</td></tr>`;
        }
      });
      const r = roundsData.find(r => r.id === rondaId);
      roundTitle.textContent = r ? `Ronda (${r.round_num}) guardada` : 'Ronda';

      await loadMatches(rondaId);
    }

    async function loadMatches(rondaId) {
      const { data, error } = await supa
        .from('partidas')
        .select('id, dupla_a_id, dupla_b_id, score_a, score_b, dupla_a:dupla_a_id(player_a(name), player_b(name)), dupla_b:dupla_b_id(player_a(name), player_b(name))')
        .eq('ronda_id', rondaId)
        .order('id');
      if (error) {
        console.error(error);
        return;
      }
      matchesData = data || [];
      selectMatch.innerHTML = '<option value="">Nueva partida</option>';
      matchesData.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        const a1 = m.dupla_a?.player_a?.name || 'A';
        const a2 = m.dupla_a?.player_b?.name || 'B';
        const b1 = m.dupla_b?.player_a?.name || 'C';
        const b2 = m.dupla_b?.player_b?.name || 'D';
        opt.textContent = `${a1} + ${a2} vs ${b1} + ${b2}`;
        selectMatch.appendChild(opt);
      });

    }

    async function loadHistoryFromDB() {
      if (!currentBirriaId) {
        // Si no hay una birria seleccionada no borrar los datos locales.
        renderHistory();
        updateMatrixTable();
        return;
      }
      const { data, error } = await supa
        .from('rondas')
        .select('round_num, duplas(position, player_a(name), player_b(name))')
        .eq('birria_id', currentBirriaId)
        .order('round_num');
      if (error) { console.error(error); return; }
      history = (data || []).map(r => {
        const pairs = [];
        let solo = null;
        (r.duplas || [])
          .sort((a,b)=>a.position-b.position)
          .forEach(d => {
            const a = d.player_a?.name || '';
            const b = d.player_b?.name || '';
            if (a === SOLO_DUMMY) solo = b;
            else if (b === SOLO_DUMMY) solo = a;
            else pairs.push([a,b]);
          });
        return { round: r.round_num, pairs, solo };
      });
      round = history.length;
      save();
      renderHistory();
      updateMatrixTable();
    }

    /* =================== Eventos =================== */
      btnAdd.onclick = () => {
        const n = nameInput.value.trim();
        if (!n) return;
        if (players.some(p => p.toLowerCase() === n.toLowerCase())) {
          alert('Ese jugador ya está en la lista');
          return;
        }
        players.push(n);
        stats[n] = { sum: 0, count: 0 };
        nameInput.value = '';
        save();
        renderPlayers();
        updatePresetStyles();
        updateMatrixTable();
        getPlayerId(n);
      };
      togglePresets.onclick = () => presetList.classList.toggle('hidden');

      birriaSelect.onchange = async () => {
        const id = birriaSelect.value || null;
        if (!id) {
          currentBirriaId = null;
          save();
          birriaInfo.textContent = '';
          deleteBirriaBtn.classList.add('hidden');
          await loadRounds();
          await loadHistoryFromDB();
          pairTable.innerHTML = '';
          roundTitle.textContent = 'Sin ronda seleccionada';
          await refreshStatsFromDB();
          renderPlayers();
          return;
        }
        const sel = birriaSelect.options[birriaSelect.selectedIndex];
        const ok = confirm(`¿Usar la birria ${sel.textContent}?`);
        if (!ok) {
          birriaSelect.value = currentBirriaId || '';
          return;
        }
        currentBirriaId = id;
        birriaInfo.textContent = `Birria ${sel.textContent}`;
        save();
        deleteBirriaBtn.classList.remove('hidden');
        await loadRounds();
        await loadHistoryFromDB();
        pairTable.innerHTML = '';
        roundTitle.textContent = 'Sin ronda seleccionada';
        await refreshStatsFromDB();
        renderPlayers();
      };

      newBirriaBtn.onclick = async () => {
        if (!confirm('¿Crear nueva birria?')) return;
        await createBirria();
        birriaSelect.value = currentBirriaId;
        players = [];
        absents = [];
        history = [];
        stats = {};
        round = 0;
        currentRoundIdx = null;
        save();
        renderHistory();
        renderPlayers();
        updateMatrixTable();
        await loadRounds();
        await loadHistoryFromDB();
        pairTable.innerHTML = '';
        roundTitle.textContent = 'Sin ronda generada';
      };

      deleteBirriaBtn.onclick = async () => {
        if (!currentBirriaId) return;
        if (prompt('Escribe SEGURO para borrar la birria') !== 'SEGURO') return;
        const { error } = await supa.from('birrias').delete().eq('id', currentBirriaId);
        if (error) { console.error(error); return; }
        currentBirriaId = null;
        birriaInfo.textContent = '';
        birriaSelect.value = '';
        deleteBirriaBtn.classList.add('hidden');
        newBirriaBtn.classList.remove('hidden');
        history = [];
        round = 0;
        save();
        renderHistory();
        updateMatrixTable();
        await loadBirrias();
        await loadRounds();
        await loadHistoryFromDB();
        pairTable.innerHTML = '';
        roundTitle.textContent = 'Sin ronda seleccionada';
        await refreshStatsFromDB();
        renderPlayers();
      };

      nextBtn.onclick = async () => {
        const active = players.filter(p => !absents.includes(p));
        if (active.length < 3) return;
        const data = generateRound(round);
        roundTitle.textContent = `Ronda (${round + 1}) actual`;
        showRound(data);
        record(data.pairs, data.solo);
        history.push({ round: round + 1, pairs: data.pairs, solo: data.solo });
        save();
        renderHistory();
        renderPlayers();
        updateMatrixTable();
        round++;
        currentRoundIdx = history.length - 1;
        if (currentBirriaId) {
          lastRondaId = await saveRoundToSupabase(data.pairs, round, data.solo);
          await refreshStatsFromDB();
          renderPlayers();
        }
      };


    async function deleteRoundFromDB(num) {
      const rec = roundsData.find(r => r.round_num === num);
      if (!rec) return;
      await supa.from('partidas').delete().eq('ronda_id', rec.id);
      await supa.from('duplas').delete().eq('ronda_id', rec.id);
      await supa.from('rondas').delete().eq('id', rec.id);
      await loadRounds();
    }

    deleteBtn.onclick = async () => {
      if (!history.length) return;
      const idx = currentRoundIdx ?? history.length - 1;
      const num = idx + 1;
      if (prompt('Escribe SEGURO para borrar la ronda seleccionada') !== 'SEGURO') return;
      history.splice(idx, 1);
      history.forEach((h, i) => { h.round = i + 1; });
      round = history.length;
      recomputeStats();
      save();
      if (currentBirriaId) await deleteRoundFromDB(num);
      if (history.length) {
        if (idx >= history.length) currentRoundIdx = history.length - 1; else currentRoundIdx = idx;
        const cur = history[currentRoundIdx];
        roundTitle.textContent = `Ronda (${cur.round}) actual`;
        showRound(cur);
      } else {
        pairTable.innerHTML = '';
        roundTitle.textContent = 'Sin ronda generada';
        currentRoundIdx = null;
      }
      renderHistory();
      renderPlayers();
      updateMatrixTable();
      if (currentBirriaId) {
        await refreshStatsFromDB();
        renderPlayers();
      }
    };

    resetBtn.onclick = () => {
      if (prompt('Escribe SEGURO para borrar TODO') !== 'SEGURO') return;
      players = [];
      history = [];
      stats = {};
      absents = [];
      round = 0;
      currentRoundIdx = null;
      save();
      renderPlayers();
      renderHistory();
      pairTable.innerHTML = '';
      roundTitle.textContent = 'Sin ronda generada';
      updatePresetStyles();
      updateMatrixTable();
    };

    showMatrixBtn.onclick = () => {
      matrixSection.classList.toggle('hidden');
      if (!matrixSection.classList.contains('hidden')) {
        updateMatrixTable();
        setTimeout(() => matrixSection.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
      }
    };

    roundMenu.onchange = () => {
      if (!history.length) return;
      const idx = parseInt(roundMenu.value, 10);
      if (isNaN(idx) || idx < 0 || idx >= history.length) return;
      currentRoundIdx = idx;
      const h = history[idx];
      roundTitle.textContent = `Ronda (${h.round}) actual`;
      showRound(h);
    };

    selectRound.onchange = () => {
      const id = selectRound.value;
      if (id) {
        loadDuplas(id).then(() => persistMatchDraft());
      } else {
        pairTable.innerHTML = '';
        roundTitle.textContent = 'Sin ronda seleccionada';
        selectMatch.innerHTML = '<option value="">Nueva partida</option>';
        persistMatchDraft();

      }
    };

    saveMatchBtn.onclick = async () => {
      const rondaId = selectRound.value;
      const a1 = playerA1Sel.value;
      const a2 = playerA2Sel.value;
      const b1 = playerB1Sel.value;
      const b2 = playerB2Sel.value;
      const sA = parseInt(scoreAInput.value, 10);
      const sB = parseInt(scoreBInput.value, 10);
      const chosen = [a1, a2, b1, b2];
      const unique = new Set(chosen);
      if (!rondaId || chosen.some(x => !x) || unique.size !== 4 || isNaN(sA) || isNaN(sB)) {
        alert('Completa todos los campos correctamente');
        return;
      }

      async function duplaIdOf(p, q) {
        const found = duplasData.find(d => {
          const n1 = d.player_a?.name;
          const n2 = d.player_b?.name;
          return (n1 === p && n2 === q) || (n1 === q && n2 === p);
        });
        if (found) return found.id;
        const pId = await getPlayerId(p);
        const qId = await getPlayerId(q);
        const position = duplasData.length + 1;
        const { data, error } = await supa
          .from('duplas')
          .insert({ ronda_id: rondaId, player_a: pId, player_b: qId, position })
          .select('id')
          .single();
        if (error) { console.error(error); return null; }
        duplasData.push({ id: data.id, position, player_a:{name:p}, player_b:{name:q} });
        return data.id;
      }

      const duplaA = await duplaIdOf(a1, a2);
      const duplaB = await duplaIdOf(b1, b2);
      if (!duplaA || !duplaB) return;
      const winner = sA >= sB ? duplaA : duplaB;
      let error;
      if (selectMatch.value) {
        ({ error } = await supa
          .from('partidas')
          .update({
            dupla_a_id: duplaA,
            dupla_b_id: duplaB,
            score_a: sA,
            score_b: sB,
            winner_dupla: winner,
          })
          .eq('id', selectMatch.value));
      } else {
          ({ error } = await supa.from('partidas').insert({
            ronda_id: rondaId,
            dupla_a_id: duplaA,
            dupla_b_id: duplaB,
            score_a: sA,
            score_b: sB,
            winner_dupla: winner,
          }));
      }
      if (error) {
        alert('Error al guardar');
        console.error(error);
      } else {
        alert('Partido guardado');
        scoreAInput.value = '';
        scoreBInput.value = '';
        selectMatch.value = '';
        playerA1Sel.value = '';
        playerA2Sel.value = '';
        playerB1Sel.value = '';
        playerB2Sel.value = '';
        localStorage.removeItem('matchDraft');
        matchDraft = {};
        await loadMatches(rondaId);
        await refreshStatsFromDB();
        renderPlayers();
      }
    };

    deleteMatchBtn.onclick = async () => {
      const id = selectMatch.value;
      if (!id) return;
      if (!confirm('¿Borrar partida?')) return;
      const { error } = await supa.from('partidas').delete().eq('id', id);
      if (!error) {
        selectMatch.value = '';
        await loadMatches(selectRound.value);
        await refreshStatsFromDB();
        renderPlayers();
        scoreAInput.value = '';
        scoreBInput.value = '';
        playerA1Sel.value = '';
        playerA2Sel.value = '';
        playerB1Sel.value = '';
        playerB2Sel.value = '';
        localStorage.removeItem('matchDraft');
        matchDraft = {};
      }
    };

    selectMatch.onchange = () => {
      const id = selectMatch.value;
      if (!id) {
        scoreAInput.value = '';
        scoreBInput.value = '';
        playerA1Sel.value = '';
        playerA2Sel.value = '';
        playerB1Sel.value = '';
        playerB2Sel.value = '';
        persistMatchDraft();
        return;
      }
      const m = matchesData.find(x => x.id === id);
      if (m) {
        playerA1Sel.value = m.dupla_a?.player_a?.name || '';
        playerA2Sel.value = m.dupla_a?.player_b?.name || '';
        playerB1Sel.value = m.dupla_b?.player_a?.name || '';
        playerB2Sel.value = m.dupla_b?.player_b?.name || '';
        scoreAInput.value = m.score_a;
        scoreBInput.value = m.score_b;
      }
      persistMatchDraft();
    };

    [playerA1Sel, playerA2Sel, playerB1Sel, playerB2Sel].forEach(sel => {
      sel.onchange = persistMatchDraft;
    });
    scoreAInput.oninput = persistMatchDraft;
    scoreBInput.oninput = persistMatchDraft;

    // ===== Supabase Auth =====
    const supabaseUrl = 'https://dqaxkapftyoemlzwbjgx.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxYXhrYXBmdHlvZW1sendiamd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5MjEzMzYsImV4cCI6MjA2NDQ5NzMzNn0.onSRsrHzLpFaVYCdrxYoa8uFD2WDcd2H0PdVEUmM8UA';
    const supa = supabase.createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'sb-badminton-auth',
      },
    });
    const loginSection = qs('#login-section');
    const appDiv = qs('#app');
    const emailInputLogin = qs('#login-email');
    const passInputLogin = qs('#login-password');
    const loginBtn = qs('#login-btn');
    const logoutBtn = qs('#logout-btn');

      async function checkAuth() {
        const { data } = await supa.auth.getSession();
        console.log('Auth session check:', data.session);
        if (data.session) {
          loginSection.classList.add('hidden');
          appDiv.classList.remove('hidden');
          birriaSection.classList.remove('hidden');
          await loadBirrias();
          if (currentBirriaId) {
            birriaSelect.value = currentBirriaId;
            const sel = birriaSelect.options[birriaSelect.selectedIndex];
            birriaInfo.textContent = `Birria ${sel?.textContent || ''}`;
            deleteBirriaBtn.classList.toggle('hidden', false);
            await loadRounds();
            await loadHistoryFromDB();
            if (history.length) {
              currentRoundIdx = history.length - 1;
              const last = history[currentRoundIdx];
              roundTitle.textContent = `Ronda (${last.round}) actual`;
              showRound(last);
            }
            await refreshStatsFromDB();
            renderPlayers();
            await restoreMatchDraft();
          } else {
            await refreshStatsFromDB();
            playerSection.classList.add('hidden');
            roundSection.classList.add('hidden');
            qs('#history-section').classList.add('hidden');
            matrixSection.classList.add('hidden');
            matchSection.classList.add('hidden');
            pairTable.innerHTML = '';
            roundTitle.textContent = 'Sin ronda seleccionada';
          }
        } else {
          loginSection.classList.remove('hidden');
          appDiv.classList.add('hidden');
          matchSection.classList.add('hidden');
          birriaSection.classList.add('hidden');
        }
      }

    loginBtn.onclick = async () => {
      const { data, error } = await supa.auth.signInWithPassword({
        email: emailInputLogin.value,
        password: passInputLogin.value,
      });
      if (error) {
        alert(error.message);
      } else {
        console.log('Sesión iniciada:', data);
        await checkAuth();
      }
    };


    logoutBtn.onclick = async () => {
      await supa.auth.signOut();
      await checkAuth();
    };

    supa.auth.onAuthStateChange((event, session) => {
      console.log('Auth change:', event, session);
      checkAuth();
    });
    checkAuth();

    /* =================== Init =================== */
    buildPresetButtons();
