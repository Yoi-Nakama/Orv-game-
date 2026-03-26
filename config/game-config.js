// ============================================
// OMNISCIENT READER'S VIEWPOINT - GAME CONFIG
// ============================================
'use strict';

const GameConfig = {
  version: '1.0.0',
  title: "Omniscient Reader's Viewpoint",
  subtitle: 'The Three Ways to Survive in a Ruined World',

  // Display
  targetFPS: 60,
  canvas: { width: 800, height: 600 },

  // Performance tiers
  quality: {
    low:    { particles: 20,  shadows: false, bloom: false, fpsLimit: 30 },
    medium: { particles: 60,  shadows: true,  bloom: false, fpsLimit: 60 },
    high:   { particles: 150, shadows: true,  bloom: true,  fpsLimit: 60 },
  },
  currentQuality: 'medium',

  // Player defaults
  player: {
    name: 'Kim Dokja',
    startHP: 100, startMP: 100, startSP: 100,
    startLevel: 1, startCoins: 0,
    startLocation: 'subway_line_2',
    startScenario: 'scenario_01_three_ways',
    class: 'Reader',
    baseStats: {
      STR: 5, AGI: 6, END: 8, INT: 15,
      LCK: 20, PER: 25, ACC: 10,
      DEF: 3, ATK: 8, SPD: 6,
    }
  },

  // World
  world: {
    tileSize: 40,
    chunkSize: 20,
    renderDistance: 3,
    dayLength: 600, // seconds per full day
    spawnRate: 0.01, // enemies per tile per update
  },

  // Combat
  combat: {
    critMultiplier: 1.8,
    missBase: 0.05,
    dodgeBase: 0.1,
    blockBase: 0.15,
    expMultiplier: 1.0,
    lootMultiplier: 1.0,
    regenRate: { hp: 0.5, mp: 1, sp: 2 }, // per second out of combat
  },

  // Leveling
  leveling: {
    maxLevel: 100,
    expTable: (level) => Math.floor(100 * Math.pow(1.15, level - 1)),
    statGainPerLevel: {
      STR: 1, AGI: 1, END: 2, INT: 3,
      LCK: 1, PER: 2, ACC: 1,
      DEF: 1, ATK: 1, SPD: 1,
    },
    hpPerLevel: 15, mpPerLevel: 10, spPerLevel: 5,
  },

  // Save
  save: {
    slots: 3,
    autoSaveInterval: 120, // seconds
    storageKey: 'orv_save',
  },

  // Audio
  audio: {
    masterVolume: 0.7,
    musicVolume: 0.5,
    sfxVolume: 0.8,
    muted: false,
  },

  // UI
  ui: {
    notificationDuration: 3000,
    dialogSpeed: 40, // ms per character
    systemMessageDuration: 4000,
  },

  // Constellations (sponsors from the novel)
  constellations: [
    { id: 'demon_king', name: 'Demon King of Salvation', alignment: 'chaos', favorBonus: 'STR+10%' },
    { id: 'bald_general', name: 'Bald General of Justice', alignment: 'neutral', favorBonus: 'DEF+10%' },
    { id: 'secretive_plotter', name: 'Secretive Plotter', alignment: 'unknown', favorBonus: 'INT+15%' },
    { id: 'great_sage', name: 'Great Sage', alignment: 'law', favorBonus: 'PER+10%' },
    { id: 'outer_god', name: 'Outer God', alignment: 'chaos', favorBonus: 'LCK+20%' },
    { id: 'abyssal_black_flame', name: 'Abyssal Black Flame Dragon', alignment: 'chaos', favorBonus: 'ATK+12%' },
    { id: 'prometheus', name: 'Prometheus', alignment: 'law', favorBonus: 'INT+12%' },
    { id: 'industrial_revolutionary', name: 'Industrial Revolutionary', alignment: 'neutral', favorBonus: 'SPD+10%' },
    { id: 'reader', name: 'Omniscient Reader', alignment: 'unknown', favorBonus: 'All+5%' },
  ],

  // Rarity colors
  rarityColors: {
    common:    '#9ca3af',
    uncommon:  '#22c55e',
    rare:      '#3b82f6',
    epic:      '#8b5cf6',
    legendary: '#c8a951',
    unique:    '#ef4444',
    myth:      '#ec4899',
    divine:    '#f59e0b',
  },

  // Status effect icons
  statusIcons: {
    poison:   '☠',
    burn:     '🔥',
    freeze:   '❄',
    shock:    '⚡',
    curse:    '💀',
    slow:     '⏱',
    haste:    '💨',
    shield:   '🛡',
    regen:    '💚',
    bleed:    '🩸',
    stun:     '💫',
    silence:  '🔇',
    fear:     '😱',
    charm:    '💜',
    invisible:'👁',
    berserk:  '😤',
  },
};

// Make globally available
if (typeof window !== 'undefined') window.GameConfig = GameConfig;
