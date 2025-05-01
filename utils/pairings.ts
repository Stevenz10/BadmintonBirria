import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";

export type Player = { name: string; elo: number; group: "A" | "B" | "C" };
export type Duo = [string, string | null];
export type History = Record<string, number>;

const CSV_PATH = process.cwd() + "/players.csv";

export function loadPlayers(): Player[] {
  const raw = readFileSync(CSV_PATH, "utf8");
  const rows = parse(raw, { columns: true, skip_empty_lines: true });
  const elos = rows.map((r: any) => Number(r.Elo)).sort((a, b) => a - b);
  const p33 = elos[Math.floor(elos.length * 0.33)];
  const p66 = elos[Math.floor(elos.length * 0.66)];

  return rows.map((r: any) => {
    const elo = Number(r.Elo);
    return {
      name: r.Player.trim(),
      elo,
      group: elo >= p66 ? "A" : elo <= p33 ? "C" : "B"
    } as Player;
  });
}

function key(a: string, b: string) {
  return [a, b].sort().join(" / ");
}

export function makeDuos(
  selected: string[],
  hist: History
): { duos: Duo[]; newHist: History } {
  const players = loadPlayers().filter((p) => selected.includes(p.name));
  const unused = new Set(players.map((p) => p.name));
  const duos: Duo[] = [];
  const newHist: History = { ...hist };

  const pref: Record<string, string[]> = { A: ["C", "B", "A"], B: ["A", "C", "B"], C: ["A", "B", "C"] };

  while (unused.size) {
    const p = Array.from(unused)[0];
    unused.delete(p);
    const groupP = players.find((x) => x.name === p)!.group;

    let best: string | null = null;
    let bestScore = Infinity;

    for (const targetGroup of pref[groupP]) {
      const cands = players.filter((q) => unused.has(q.name) && q.group === targetGroup).map((q) => q.name);
      for (const q of cands) {
        const score = newHist[key(p, q)] ?? 0;
        if (score < bestScore) {
          best = q;
          bestScore = score;
        }
      }
      if (best) break;
    }

    if (best) {
      unused.delete(best);
      duos.push([p, best]);
      newHist[key(p, best)] = (newHist[key(p, best)] ?? 0) + 1;
    } else {
      duos.push([p, null]);
    }
  }

  for (let i = duos.length - 1; i > 0; --i) {
    const j = Math.floor(Math.random() * (i + 1));
    [duos[i], duos[j]] = [duos[j], duos[i]];
  }

  return { duos, newHist };
}
