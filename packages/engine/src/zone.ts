/** Mappa delle zone: per ogni zona, l'elenco delle zone adiacenti.
 *  Per un grafo non orientato, elencare l'adiacenza in entrambe le direzioni. */
export type ZoneMap = Record<string, string[]>;

export type RangeBand = 'engaged' | 'near' | 'far';

/** True se `b` è una zona adiacente ad `a` secondo la mappa (la stessa zona non è "adiacente"). */
export function areAdjacent(map: ZoneMap, a: string, b: string): boolean {
  return (map[a] ?? []).includes(b);
}

/** Distanza minima (numero di passi) tra due zone via BFS. Stessa zona = 0.
 *  Ritorna Infinity se non raggiungibile o se una delle due zone non è nella mappa. */
export function zoneDistance(map: ZoneMap, from: string, to: string): number {
  if (from === to) {
    return from in map ? 0 : Infinity;
  }
  if (!(from in map) || !(to in map)) {
    return Infinity;
  }
  const visited = new Set<string>([from]);
  let frontier: string[] = [from];
  let dist = 0;
  while (frontier.length > 0) {
    dist += 1;
    const next: string[] = [];
    for (const zone of frontier) {
      for (const adj of map[zone] ?? []) {
        if (adj === to) {
          return dist;
        }
        if (!visited.has(adj)) {
          visited.add(adj);
          next.push(adj);
        }
      }
    }
    frontier = next;
  }
  return Infinity;
}

/** Classifica una distanza in banda di gittata: 0 = ingaggio, 1 = vicino, >=2 = lontano. */
export function rangeBand(distance: number): RangeBand {
  if (distance <= 0) {
    return 'engaged';
  }
  if (distance === 1) {
    return 'near';
  }
  return 'far';
}
