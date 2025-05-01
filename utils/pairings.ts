// utils/pairings.ts
//---------------------------------------------------
// Genera los dúos más equilibrados posibles según
// el Elo y la historia de emparejamientos.
//---------------------------------------------------

import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";

export type Player  = { name: string; elo: number; group: "A" | "B" | "C" };
export type Duo     = [string, string | null];    // null = descansa
export type History = Record<string, number>;

/** El CSV se sirve ahora desde /public */
const CSV_PATH = process.cwd() + "/public/players.csv";

/* ------------------------------------------------- */
/* 1. Cargar jugadores y asignarles grupo A / B / C  */
/* ------------------------------------------------- */
export function loadPlayers(): Player[] {
  const raw  = readFileSync(CSV_PATH, "utf8");
  const rows = parse(raw, { columns: true, skip_empty_lines: true });

  const elos = rows.map((r: any) => Number(r.Elo)).sort((a, b) => a - b);
  const p33  = elos[Math.floor(elos.length * 0.33)];
  const p66  = elos[Math.floor(elos.length * 0.66)];

  return rows.map((r: any) => {
    const elo = Number(r.Elo);
    return {
      name:  r.Player.trim(),
      elo,
      group: elo >= p66 ? "A" : elo <= p33 ? "C" : "B"
    } as Player;
  });
}

/* ------------------------------------------------- */
/* 2. Algoritmo para formar dúos con mínima repetición*/
/* ------------------------------------------------- */
function key(a: string, b: string) {
  return [a, b].sort().join(" / ");
}

export function makeDuos(
  selected: string[],
  hist: History
): { duos: Duo[]; newHist: History } {

  const players = loadPlayers().filter(p => selected.includes(p.name));
  const unused  = new Set(players.map(p => p.name));
  const duos: Duo[] = [];
  const newHist: History = { ...hist };

  // Preferencias de mezcla por grupo
  const pref: Record<"A" | "B" | "C", ("A" | "B" | "C")[]> = {
    A: ["C", "B", "A"],
    B: ["A", "C", "B"],
    C: ["A", "B", "C"]
  };

  while (unused.size) {
    const p = Array.from(unused)[0];
    unused.delete(p);

    const groupP = players.find(x => x.name === p)!.group;
    let partner: string | null = null;
    let bestScore = Infinity;

    // Busca compañero con menor historial, siguiendo la prioridad de grupos
    for (const targetGroup of pref[groupP]) {
      const cands = players.filter(q =>
        unused.has(q.name) && q.group === targetGroup
      );
      for (const q of cands) {
        const score = newHist[key(p, q.name)] ?? 0;
        if (score < bestScore) {
          bestScore = score;
          partner   = q.name;
        }
      }
      if (partner) break;
    }

    if (partner) {
      unused.delete(partner);
      duos.push([p, partner]);
      newHist[key(p, partner)] = (newHist[key(p, partner)] ?? 0) + 1;
    } else {
      // Número impar: jugador p descansa
      duos.push([p, null]);
    }
  }

  // Mezcla aleatoria del listado final de dúos
  for (let i = duos.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [duos[i], duos[j]] = [duos[j], duos[i]];
  }

  return { duos, newHist };
}
