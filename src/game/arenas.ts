export interface ArenaSkin {
  id: string;
  index: number;
  name: string;
  blurb: string;
  bg1: string;
  bg2: string;
  glow: string;
  rim: string;
  enemy: string;
  enemyGlow: string;
  hpMul: number;
  dmgMul: number;
  speedMul: number;
  scoreMul: number;
  unlockStars: number;
}

export const ARENAS: ArenaSkin[] = [
  {
    id: 'meadow',
    index: 0,
    name: 'Ink Meadow',
    blurb: 'Where every beast is born.',
    bg1: '#2f1c4d',
    bg2: '#150b24',
    glow: 'rgba(124, 58, 196, 0.55)',
    rim: '#7c3ac4',
    enemy: '#d92b3f',
    enemyGlow: 'rgba(255, 74, 96, 0.85)',
    hpMul: 1,
    dmgMul: 1,
    speedMul: 1,
    scoreMul: 1,
    unlockStars: 0,
  },
  {
    id: 'ember',
    index: 1,
    name: 'Ember Citadel',
    blurb: 'The drones burn hotter here.',
    bg1: '#3d1526',
    bg2: '#1a0a12',
    glow: 'rgba(214, 60, 40, 0.5)',
    rim: '#d93a20',
    enemy: '#ff5a2b',
    enemyGlow: 'rgba(255, 140, 60, 0.9)',
    hpMul: 1.25,
    dmgMul: 1.2,
    speedMul: 1.1,
    scoreMul: 1.4,
    unlockStars: 3,
  },
  {
    id: 'frost',
    index: 2,
    name: 'Frost Hollow',
    blurb: 'Cold, fast, unforgiving.',
    bg1: '#14243f',
    bg2: '#08101e',
    glow: 'rgba(70, 150, 230, 0.5)',
    rim: '#3d8fd6',
    enemy: '#2fd0e8',
    enemyGlow: 'rgba(120, 235, 255, 0.9)',
    hpMul: 1.5,
    dmgMul: 1.4,
    speedMul: 1.2,
    scoreMul: 1.9,
    unlockStars: 7,
  },
  {
    id: 'void',
    index: 3,
    name: 'Void Spire',
    blurb: 'Survive and the door opens.',
    bg1: '#2a1040',
    bg2: '#0a0410',
    glow: 'rgba(168, 60, 255, 0.55)',
    rim: '#a83cff',
    enemy: '#c93bff',
    enemyGlow: 'rgba(220, 130, 255, 0.9)',
    hpMul: 1.8,
    dmgMul: 1.7,
    speedMul: 1.35,
    scoreMul: 2.5,
    unlockStars: 12,
  },
];

export function arenaById(id: string): ArenaSkin {
  return ARENAS.find((a) => a.id === id) ?? ARENAS[0];
}

export function isUnlocked(skin: ArenaSkin, stars: number): boolean {
  return stars >= skin.unlockStars;
}
