// ORV Game - Data Getter Shim
// Adds standard .getX(id) lookup methods to all flat data objects
// Must be loaded AFTER all data files

(function() {
    function addGetter(obj, methodName) {
        if (!obj || typeof obj !== 'object') return;
        if (obj[methodName]) return; // Already has it
        obj[methodName] = function(id) {
            return obj[id] || null;
        };
    }

    // Wait for DOM/scripts to finish, then patch
    function patchAll() {
        if (typeof ItemsData !== 'undefined') addGetter(ItemsData, 'getItem');
        if (typeof EnemiesData !== 'undefined') addGetter(EnemiesData, 'getEnemy');
        if (typeof BossesData !== 'undefined') addGetter(BossesData, 'getBoss');
        if (typeof SkillsData !== 'undefined') addGetter(SkillsData, 'getSkill');
        if (typeof QuestsData !== 'undefined') addGetter(QuestsData, 'getQuest');
        if (typeof ScenariosData !== 'undefined') addGetter(ScenariosData, 'getScenario');
        if (typeof MapsData !== 'undefined') addGetter(MapsData, 'getMap');
        if (typeof CharactersData !== 'undefined') addGetter(CharactersData, 'getCharacter');

        // DialoguesData needs a getTree method
        if (typeof DialoguesData !== 'undefined' && !DialoguesData.getTree) {
            const _tempTrees = {};
            DialoguesData.getTree = function(id) {
                return _tempTrees[id] || DialoguesData[id] || null;
            };
            DialoguesData.registerTemp = function(id, tree) {
                _tempTrees[id] = tree;
            };
        }

        // Ensure GameConfig.rarityColors exists
        if (typeof GameConfig !== 'undefined' && !GameConfig.rarityColors) {
            GameConfig.rarityColors = {
                common: '#aaaaaa',
                uncommon: '#44ff44',
                rare: '#4488ff',
                epic: '#aa44ff',
                legendary: '#ffaa00',
                mythic: '#ff4488',
                unique: '#ff8800'
            };
        }

        // Ensure GameConfig.leveling.statGainsPerLevel has defaults
        if (typeof GameConfig !== 'undefined' && GameConfig.leveling) {
            if (!GameConfig.leveling.statGainsPerLevel) {
                GameConfig.leveling.statGainsPerLevel = {
                    reader: { STR: 1, AGI: 1, END: 1, INT: 3, LCK: 2, PER: 2 },
                    regressor: { STR: 3, AGI: 2, END: 2, INT: 1, LCK: 1, PER: 1 },
                    warrior: { STR: 3, AGI: 1, END: 3, INT: 0, LCK: 1, PER: 0 },
                    swordsman: { STR: 2, AGI: 3, END: 1, INT: 1, LCK: 1, PER: 1 },
                    default: { STR: 2, AGI: 1, END: 2, INT: 1, LCK: 1, PER: 1 }
                };
            }
            if (!GameConfig.leveling.baseExp) GameConfig.leveling.baseExp = 100;
            if (!GameConfig.leveling.expMultiplier) GameConfig.leveling.expMultiplier = 1.15;
            if (!GameConfig.leveling.maxLevel) GameConfig.leveling.maxLevel = 100;
        }

        // Ensure constellations array exists on GameConfig
        if (typeof GameConfig !== 'undefined' && !GameConfig.constellations) {
            GameConfig.constellations = [
                {
                    id: 'demon_king_of_salvation', name: 'Demon King of Salvation',
                    reactions: { positive: ['Hmm, interesting.', 'Keep going.', 'You surprise me.'], negative: ['Disappointing.', 'I expected more.'] },
                    skillGifts: [{ threshold: 30, skill: 'stigma_of_salvation', coins: 10 }]
                },
                { id: 'bald_general_of_justice', name: 'Bald General of Justice', reactions: { positive: ['Justice is served.', 'Well fought.'], negative: ['That was cowardly.'] }, skillGifts: [] },
                { id: 'secretive_plotter', name: 'Secretive Plotter', reactions: { positive: ['Interesting move.', '...'], negative: ['Predictable.'] }, skillGifts: [] },
                { id: 'great_sage', name: 'Great Sage', reactions: { positive: ['Wisdom grows.', 'Enlightening.'], negative: ['Foolish.'] }, skillGifts: [] },
                { id: 'outer_god', name: 'Outer God', reactions: { positive: ['...', 'CONSUME.'], negative: ['...'] }, skillGifts: [] },
                { id: 'abyssal_black_flame_dragon', name: 'Abyssal Black Flame Dragon', reactions: { positive: ['Burn brighter.', 'Worthy prey.'], negative: ['Weak.'] }, skillGifts: [] },
                { id: 'prometheus', name: 'Prometheus', reactions: { positive: ['The fire spreads.', 'Humanity endures.'], negative: ['Don\'t give up.'] }, skillGifts: [] },
                { id: 'industrial_revolutionary', name: 'Industrial Revolutionary', reactions: { positive: ['Progress!', 'Efficiency noted.'], negative: ['Inefficient.'] }, skillGifts: [] },
                { id: 'omniscient_reader', name: 'Omniscient Reader', reactions: { positive: ['As written.', 'The story continues.'], negative: ['This wasn\'t in the novel.'] }, skillGifts: [{ threshold: 50, skill: 'three_ways_to_survive', coins: 50 }] }
            ];
        }

        // Ensure world config
        if (typeof GameConfig !== 'undefined') {
            if (!GameConfig.world) GameConfig.world = {};
            if (!GameConfig.world.startLocation) GameConfig.world.startLocation = 'subway_line_2';
            if (!GameConfig.world.startScenario) GameConfig.world.startScenario = 'scenario_01_three_ways';
            if (!GameConfig.world.tileSize) GameConfig.world.tileSize = 40;
            if (!GameConfig.player) GameConfig.player = {
                name: 'Kim Dokja',
                startStats: { STR: 5, AGI: 6, END: 8, INT: 15, LCK: 20, PER: 25 },
                startGold: 0
            };
            if (!GameConfig.combat) GameConfig.combat = {
                critMultiplier: 1.8,
                hpRegenRate: 0.001,
                mpRegenRate: 0.003,
                spRegenRate: 0.005
            };
            if (!GameConfig.save) GameConfig.save = {
                slots: 3,
                autosaveInterval: 120
            };
            if (!GameConfig.quality) GameConfig.quality = {
                low: { particles: false, shadows: false, bloom: false, fps: 30 },
                medium: { particles: true, shadows: false, bloom: false, fps: 60 },
                high: { particles: true, shadows: true, bloom: true, fps: 60 }
            };
        }
    }

    // Run immediately (this script loads last before main.js)
    patchAll();
    window.DataShim = { patchAll };
})();
