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
    const pairTable       = qs('#pairings-table');
    const soloSection     = qs('#solo-section');
    const soloPartnerSel  = qs('#solo-partner');
    const assignSoloBtn   = qs('#assign-solo');
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

    const selectDuplaA    = qs('#select-dupla-a');
    const selectDuplaB    = qs('#select-dupla-b');
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
    let lastExtremes = null;
    let currentBirriaId = null;
    let lastRondaId = null;
    let currentSolo = null;
    const playersMap = {};

    const save = () => {
      localStorage.setItem('players', JSON.stringify(players));
      localStorage.setItem('history', JSON.stringify(history));
      localStorage.setItem('stats',   JSON.stringify(stats));
      localStorage.setItem('absents', JSON.stringify(absents));
    };

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

      birriaSection.classList.remove('hidden');
      newBirriaBtn.classList.add('hidden');
      deleteBirriaBtn.classList.remove('hidden');
      await loadBirrias();
      birriaSelect.value = currentBirriaId;
      return data.id;
    }

    async function refreshStatsFromDB() {
      const { data, error } = await supa
        .from('duplas')
        .select('position, player_a(name), player_b(name)');
      if (error) { console.error(error); return; }
      stats = {};
      (data || []).forEach(d => {
        const pos = d.position || 0;
        const names = [d.player_a?.name, d.player_b?.name];
        names.forEach(n => {
          if (!n) return;
          stats[n] = stats[n] || { sum: 0, count: 0 };
          stats[n].sum += pos;
          stats[n].count += 1;
        });
      });
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

    async function saveRoundToSupabase(pairs, num) {
      if (!currentBirriaId) return null;
      let { data, error } = await supa.from('rondas').insert({ birria_id: currentBirriaId, round_num: num }).select('id').single();
      if (error) { console.error(error); return; }
      const rondaId = data.id;
      const duplas = [];
      for (let i=0;i<pairs.length;i++) {
        const [a,b] = pairs[i];
        const aId = await getPlayerId(a);
        const bId = await getPlayerId(b);
        duplas.push({ ronda_id: rondaId, player_a: aId, player_b: bId, position: i+1 });
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
      if (active.length < 3) return { pairs: [], solo: null, extremes: null };
      const oddOriginal = active.length % 2 === 1;
      let arr = [...active];
      if (oddOriginal) arr.push('DESCANSO');
      const n = arr.length;

      // Outer shift solo cuando el nº es par
      const outerShift = oddOriginal ? 0 : idx % n;
      arr = arr.slice(outerShift).concat(arr.slice(0, outerShift));

      const cycle = n - 1;
      const r = idx % cycle;
      const rot = [arr[0], ...arr.slice(1).slice(r), ...arr.slice(1, 1 + r)];

      const pairs = [];
      let solo = null;
      for (let i = 0; i < n / 2; i++) {
        const a = rot[i], b = rot[n - 1 - i];
        if (a === 'DESCANSO' || b === 'DESCANSO') {
          solo = a === 'DESCANSO' ? b : a;
        } else {
          pairs.push([a, b]);
        }
      }

      // Fairness: desviación respecto a la media ideal
      const npos = pairs.length + 1;
      const mean = (npos + 1) / 2;
      const avgOf = name => {
        const st = stats[name] || { sum: 0, count: 0 };
        return st.count ? st.sum / st.count : mean;
      };
      pairs.sort((u, v) => {
        const du = ((avgOf(u[0]) + avgOf(u[1])) / 2) - mean;
        const dv = ((avgOf(v[0]) + avgOf(v[1])) / 2) - mean;
        return dv - du; // peor primero
      });

      let extremes = null;
      if (pairs.length >= 3) {
        extremes = [...pairs[0], ...pairs[1], ...pairs[pairs.length - 2], ...pairs[pairs.length - 1]].sort();
      }
      return { pairs, solo, extremes };
    }

    /* =================== Mostrar ronda e historial =================== */
    function showRound({ pairs, solo }) {
      pairTable.innerHTML = '<tr><th class="border p-2 bg-gray-100">#</th><th class="border p-2 bg-gray-100">Dupla</th></tr>';
      pairs.forEach((p, i) => {
        pairTable.innerHTML += `<tr><td class='border p-2 font-medium bg-gray-50'>Duo ${i + 1}</td><td class='border p-2'>${p[0]} + ${p[1]}</td></tr>`;
      });
      if (solo) {
        pairTable.innerHTML += `<tr><td class='border p-2 font-medium bg-yellow-100'>Solo</td><td class='border p-2 text-red-600'>${solo}</td></tr>`;
        soloPartnerSel.innerHTML = '<option value="">Elige compañero</option>';
        players.filter(p => p !== solo && !absents.includes(p)).forEach(n => {
          const o = document.createElement('option');
          o.value = n;
          o.textContent = n;
          soloPartnerSel.appendChild(o);
        });
        soloSection.classList.remove('hidden');
      } else {
        soloSection.classList.add('hidden');
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
    }

    /* =================== Matriz de combinaciones =================== */
    const pairKey = (a, b) => [a, b].sort().join('|');
    function updateMatrixTable() {
      const active = players.filter(p => !absents.includes(p));
      if (active.length < 2) {
        matrixTable.innerHTML = '';
        return;
      }
      const played = new Set();
      history.forEach(h => {
        h.pairs.forEach(([a, b]) => played.add(pairKey(a, b)));
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
            const ok = played.has(pairKey(p, q));
            html += `<td class='border p-1 ${ok ? 'bg-green-200/60 text-green-700' : 'bg-red-200/60 text-red-700 font-semibold'}'>${ok ? '✔' : '✖'}</td>`;
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
      const buildOpts = sel => {
        sel.innerHTML = '<option value="">Elige dupla</option>';
        list.forEach(d => {
          const opt = document.createElement('option');
          const a = d.player_a?.name || 'JugadorA';
          const b = d.player_b?.name || 'JugadorB';
          opt.value = d.id;
          opt.textContent = `${a} + ${b}`;
          sel.appendChild(opt);
        });
      };
      buildOpts(selectDuplaA);
      buildOpts(selectDuplaB);

      pairTable.innerHTML = '<tr><th class="border p-2 bg-gray-100">#</th><th class="border p-2 bg-gray-100">Dupla</th></tr>';
      list.forEach((d, i) => {
        const a = d.player_a?.name || 'A';
        const b = d.player_b?.name || 'B';
        pairTable.innerHTML += `<tr><td class='border p-2 font-medium bg-gray-50'>Duo ${i + 1}</td><td class='border p-2'>${a} + ${b}</td></tr>`;
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
      history = [];
      if (!currentBirriaId) {
        round = 0;
        save();
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
      history = (data || []).map(r => ({
        round: r.round_num,
        pairs: (r.duplas || [])
          .sort((a,b) => a.position - b.position)
          .map(d => [d.player_a?.name || '', d.player_b?.name || '']),
        solo: null
      }));
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
        history = [];
        stats = {};
        round = 0;
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
        if (data.extremes && lastExtremes && JSON.stringify(data.extremes) === JSON.stringify(lastExtremes) && active.length >= 8) {
          round++;
          return nextBtn.onclick();
        }
        roundTitle.textContent = `Ronda (${round + 1}) actual`;
        showRound(data);
        record(data.pairs, data.solo);
        history.push({ round: round + 1, pairs: data.pairs, solo: data.solo });
        lastExtremes = data.extremes;
        save();
        renderHistory();
        renderPlayers();
        updateMatrixTable();
        round++;
        currentSolo = data.solo;
        if (currentBirriaId) {
          lastRondaId = await saveRoundToSupabase(data.pairs, round);
          await refreshStatsFromDB();
          renderPlayers();
        }
      };

      assignSoloBtn.onclick = async () => {
        const partner = soloPartnerSel.value;
        if (!currentSolo || !partner) return;
        const last = history[history.length - 1];
        last.pairs.push([currentSolo, partner]);
        last.solo = null;
        record([[currentSolo, partner]], null);
        save();
        renderHistory();
        showRound(last);
        if (lastRondaId) {
          const aId = await getPlayerId(currentSolo);
          const bId = await getPlayerId(partner);
          await supa.from('duplas').insert({ ronda_id: lastRondaId, player_a: aId, player_b: bId, position: last.pairs.length });
          await refreshStatsFromDB();
          renderPlayers();
        }
        currentSolo = null;
      };

    deleteBtn.onclick = () => {
      if (!history.length) return;
      if (prompt('Escribe SEGURO para borrar la última ronda') !== 'SEGURO') return;
      history.pop();
      if (round > 0) round--;
      lastExtremes = null;
      currentSolo = null;
      save();
      if (history.length) {
        const last = history[history.length - 1];
        roundTitle.textContent = `Ronda (${last.round}) actual`;
        showRound(last);
      } else {
        pairTable.innerHTML = '';
        roundTitle.textContent = 'Sin ronda generada';
      }
      renderHistory();
      renderPlayers();
      updateMatrixTable();
    };

    resetBtn.onclick = () => {
      if (prompt('Escribe SEGURO para borrar TODO') !== 'SEGURO') return;
      players = [];
      history = [];
      stats = {};
      absents = [];
      round = 0;
      lastExtremes = null;
      currentSolo = null;
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

    selectRound.onchange = () => {
      const id = selectRound.value;
      if (id) {
        loadDuplas(id);
      } else {
        pairTable.innerHTML = '';
        roundTitle.textContent = 'Sin ronda seleccionada';
        selectMatch.innerHTML = '<option value="">Nueva partida</option>';

      }
    };

    saveMatchBtn.onclick = async () => {
      const rondaId = selectRound.value;
      const duplaA = selectDuplaA.value;
      const duplaB = selectDuplaB.value;
      const sA = parseInt(scoreAInput.value, 10);
      const sB = parseInt(scoreBInput.value, 10);
      if (!rondaId || !duplaA || !duplaB || duplaA === duplaB || isNaN(sA) || isNaN(sB)) {
        alert('Completa todos los campos correctamente');
        return;
      }
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
      }
    };

    selectMatch.onchange = () => {
      const id = selectMatch.value;
      if (!id) {
        scoreAInput.value = '';
        scoreBInput.value = '';
        selectDuplaA.value = '';
        selectDuplaB.value = '';
        return;
      }
      const m = matchesData.find(x => x.id === id);
      if (m) {
        selectDuplaA.value = m.dupla_a_id;
        selectDuplaB.value = m.dupla_b_id;
        scoreAInput.value = m.score_a;
        scoreBInput.value = m.score_b;
      }
    };

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
          await refreshStatsFromDB();
          playerSection.classList.add('hidden');
          roundSection.classList.add('hidden');
          qs('#history-section').classList.add('hidden');
          matrixSection.classList.add('hidden');
          matchSection.classList.add('hidden');
          pairTable.innerHTML = '';
          roundTitle.textContent = 'Sin ronda seleccionada';
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
