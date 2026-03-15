(() => {
  "use strict";

  /********************************************************************
   * Config
   ********************************************************************/
  const SAVE_KEY = "pf_explorer_save_v1";
  const GAME_CONFIG = {
    maxLevel: 10,
    defaultLogMode: "compact"
  };
  const LOG_MODES = {
    compact: "compact",
    detail: "detail"
  };
  const DAMAGE_TYPES = [
    "bludgeoning",
    "piercing",
    "slashing",
    "acid",
    "cold",
    "electricity",
    "fire",
    "poison",
    "sonic",
    "radiant",
    "necrotic",
    "force",
    "mental"
  ];

  const MAP_CAMERA_MODES = {
    fixed: "fixed",
    follow: "follow"
  };

  const FOLLOW_CAMERA_EDGE_BUFFER = 3;
  const MAP_MIN_CELL_SIZE = 24;
  const MAP_WIDTH_SCALE_RATIO = 0.8;
  const MAP_VIEWPORT_MARGIN = 24;
  const MAP_MAX_VISIBLE_TILES = 9;

  const MAP_ICONS = {
    unknown: "❔",
    player: "🧍",
    home: "🏘️",
    dungeon: "🕳️",
    monster: "👹",
    resource: "⛏️",
    treasure: "💰",
    forest: "🌲",
    plains: "🌾",
    dirt: "🟫",
    water: "🌊",
    mountain: "⛰️"
  };

  const RANDOM_EVENT_DAY_REQUIREMENT_DEFAULT = 1;
  const RANDOM_EVENT_DAILY_COUNT = 3;
  const RANDOM_EVENT_TRIGGER_CHANCE = 0.2;

  /********************************************************************
   * Data: Races (locked to Human for now)
   ********************************************************************/
  const RACES = [
    { id: "human", name: "Human", description: "Adaptable and ambitious. (Only race available in this prototype.)" }
  ];

  /********************************************************************
   * Data: Classes (Starting saves and equipment permissions & HP)
   * Sources: Archives of Nethys class pages (Fighter, Barbarian, Monk, Ranger, Rogue).
   ********************************************************************/
  const CLASSES = {
    "Fighter": {
      id: "Fighter",
      keyAbilities: ["STR", "DEX"],
      requirements: { STR: 13 },
      hpPerLevel: 10,
      spPerLevel: 6,
      proficiencies: {
        saves: { fort: 2, reflex: 2, will: 1 },
        weapons: { simple: true, martial: true, advanced: false, unarmed: true },
        armor: { unarmored: true, light: true, medium: true, heavy: true, shields: true }
      },
      startingTrainedSkill: "Athletics",
      baseSkillPoints: 3,
      startingAbility: "second_wind",
      optionalAbilities: ["guard_stance", "feint_strike", "guard_strike", "parry", "aggressive_block"],
      abilities: ["second_wind", "guard_stance", "feint_strike", "guard_strike", "parry", "aggressive_block"]
    },
    "Barbarian": {
      id: "Barbarian",
      keyAbilities: ["STR"],
      requirements: { STR: 13, CON: 13 },
      hpPerLevel: 12,
      spPerLevel: 7,
      proficiencies: {
        saves: { fort: 2, reflex: 1, will: 2 },
        weapons: { simple: true, martial: true, advanced: false, unarmed: true },
        armor: { unarmored: true, light: true, medium: true, heavy: false, shields: true }
      },
      startingTrainedSkill: "Athletics",
      baseSkillPoints: 3,
      startingAbility: "enrage",
      optionalAbilities: ["topple", "retaliate", "vicious_strike", "short_fuse", "frothing_rage"],
      abilities: ["enrage", "topple", "retaliate", "vicious_strike", "short_fuse", "frothing_rage"]
    },
    "Monk": {
      id: "Monk",
      keyAbilities: ["STR", "DEX"],
      requirements: { DEX: 13, WIS: 13 },
      hpPerLevel: 10,
      spPerLevel: 7,
      proficiencies: {
        saves: { fort: 2, reflex: 2, will: 2 },
        weapons: { simple: true, martial: false, advanced: false, unarmed: true },
        armor: { unarmored: true, light: false, medium: false, heavy: false, shields: false }
      },
      startingTrainedSkill: "Acrobatics",
      baseSkillPoints: 4,
      startingAbility: "martial_arts",
      optionalAbilities: ["open_hand", "river_stance", "mountain_stance", "cloud_stance", "flame_stance"],
      abilities: ["martial_arts", "open_hand", "river_stance", "mountain_stance", "cloud_stance", "flame_stance"]
    },
    "Ranger": {
      id: "Ranger",
      keyAbilities: ["STR", "DEX"],
      requirements: { DEX: 13, WIS: 13 },
      hpPerLevel: 10,
      spPerLevel: 6,
      proficiencies: {
        saves: { fort: 2, reflex: 2, will: 1 },
        weapons: { simple: true, martial: true, advanced: false, unarmed: true },
        armor: { unarmored: true, light: true, medium: true, heavy: false, shields: true }
      },
      startingTrainedSkill: "Survival",
      baseSkillPoints: 4,
      startingAbility: "hunting",
      optionalAbilities: ["hunters_mark", "eagle_eye", "precise_strike", "spike_lure", "ambush"],
      abilities: ["hunting", "hunters_mark", "eagle_eye", "precise_strike", "spike_lure", "ambush"]
    },
    "Rogue": {
      id: "Rogue",
      keyAbilities: ["DEX"],
      requirements: { DEX: 13 },
      hpPerLevel: 8,
      spPerLevel: 6,
      proficiencies: {
        saves: { fort: 1, reflex: 2, will: 2 },
        weapons: { simple: true, martial: true, advanced: false, unarmed: true },
        armor: { unarmored: true, light: true, medium: false, heavy: false, shields: false }
      },
      startingTrainedSkill: "Stealth",
      baseSkillPoints: 5,
      startingAbility: "sneak_attack",
      optionalAbilities: ["dirty_trick", "cover_step", "quiet_step", "flight_step", "open_wound"],
      abilities: ["sneak_attack", "dirty_trick", "cover_step", "quiet_step", "flight_step", "open_wound"]
    }
  };

  const ABILITIES = {
    second_wind: {
      id: "second_wind",
      name: "Second Wind",
      classId: "Fighter",
      kind: "active",
      tags: ["Self", "Heal", "Head"],
      contexts: ["combat"],
      costSp: 2,
      duration: null,
      summary: "Starting active combat ability. Costs 2 SP and heals 1d6 + your Constitution modifier.",
      details: [
        "Take a deep breath and dig in."
      ]
    },
    guard_stance: {
      id: "guard_stance",
      name: "Power Strike",
      classId: "Fighter",
      kind: "active",
      tags: ["Attack", "Arm"],
      contexts: ["combat"],
      costSp: 1,
      duration: null,
      summary: "Active combat ability. Cost 1 SP. Attack with -2 to hit, dealing +4 damage on a hit.",
      details: [
        "Commit to a heavier blow and trust it to land cleanly."
      ]
    },
    feint_strike: {
      id: "feint_strike",
      name: "Feint Strike",
      classId: "Fighter",
      kind: "active",
      tags: ["Attack", "Debuff", "Head"],
      contexts: ["combat"],
      costSp: 1,
      duration: 1,
      summary: "Active combat ability. Cost 1 SP. Make a regular attack and apply Off-Guard regardless of hit or miss.",
      details: [
        "The strike lands, or the fake still opens them up."
      ]
    },
    guard_strike: {
      id: "guard_strike",
      name: "Guard Strike",
      classId: "Fighter",
      kind: "active",
      tags: ["Buff", "Counter", "Arm", "Reach"],
      contexts: ["combat"],
      costSp: 1,
      duration: 1,
      summary: "Active combat ability. Cost 1 SP. Gain Guarded and counterattack the first enemy that attacks you before your next turn. Ignores the -4 flying penalty with melee weapons.",
      details: [
        "A poised guard turns defense into a punishing reply."
      ]
    },
    parry: {
      id: "parry",
      name: "Parry",
      classId: "Fighter",
      kind: "passive",
      tags: ["Arm", "Counter"],
      contexts: ["combat"],
      costSp: 0,
      duration: null,
      summary: "Passive combat ability. If an attack misses you, apply Off-Guard to the attacker.",
      details: [
        "Turn their failure into an opening."
      ]
    },
    aggressive_block: {
      id: "aggressive_block",
      name: "Aggressive Block",
      classId: "Fighter",
      kind: "passive",
      tags: ["Arm", "Shield", "Counter"],
      contexts: ["combat"],
      costSp: 0,
      duration: null,
      summary: "Passive combat ability. If you have a shield equipped and an attack misses your AC by more than 8, attack the attacker for free.",
      details: [
        "A hard deflection becomes a clean reprisal."
      ]
    },
    enrage: {
      id: "enrage",
      name: "Enrage",
      classId: "Barbarian",
      kind: "active",
      tags: ["Rage", "Self", "Buff", "Head"],
      contexts: ["combat"],
      costSp: 2,
      duration: 10,
      summary: "Starting active Rage buff. Costs 2 SP, lasts 10 rounds, adds +2 melee weapon damage, and grants resistance 2 to bludgeoning, piercing, and slashing.",
      details: [
        "Wait till you're always angry."
      ]
    },
    topple: {
      id: "topple",
      name: "Topple",
      classId: "Barbarian",
      kind: "active",
      tags: ["Debuff", "Arm"],
      contexts: ["combat"],
      costSp: 1,
      duration: 1,
      summary: "Active combat ability. Costs 1 SP. Make an Athletics check against the enemy's Reflex DC; on a success, the enemy becomes Prone for 1 round.",
      details: [
        "Sometimes the best plan is to put them on the floor."
      ]
    },
    retaliate: {
      id: "retaliate",
      name: "Retaliate",
      classId: "Barbarian",
      kind: "passive",
      tags: ["Counter", "Arm"],
      contexts: ["combat"],
      costSp: 0,
      duration: null,
      summary: "Passive combat ability. Once per turn while enraged, if an enemy hits you while you are below 50% hit points, attack for free.",
      details: [
        "Pain just gives you a clearer target."
      ]
    },
    vicious_strike: {
      id: "vicious_strike",
      name: "Vicious Strike",
      classId: "Barbarian",
      kind: "active",
      tags: ["Attack", "Arm"],
      contexts: ["combat"],
      costSp: 1,
      duration: null,
      summary: "Active combat ability. Cost 1 SP. Add your Strength modifier an additional time to damage on a successful hit.",
      details: [
        "Hit harder, then harder again."
      ]
    },
    short_fuse: {
      id: "short_fuse",
      name: "Short Fuse",
      classId: "Barbarian",
      kind: "passive",
      tags: ["Head", "Rage"],
      contexts: ["combat"],
      costSp: 0,
      duration: null,
      summary: "Passive combat ability. When starting combat roll a d4; on a 4 you become Enraged for free.",
      details: [
        "Sometimes the fight starts before the fight starts."
      ]
    },
    frothing_rage: {
      id: "frothing_rage",
      name: "Frothing Rage",
      classId: "Barbarian",
      kind: "passive",
      tags: ["Head", "Rage", "Debuff"],
      contexts: ["combat"],
      costSp: 0,
      duration: null,
      summary: "Passive combat ability. While enraged and attacking, make a Social check against the enemy's Will DC. On a failure, apply Off-Guard to the enemy.",
      details: [
        "Your sheer mania leaves openings everywhere."
      ]
    },
    martial_arts: {
      id: "martial_arts",
      name: "Martial Arts",
      classId: "Monk",
      kind: "passive",
      tags: ["Arm", "Leg"],
      contexts: ["combat"],
      costSp: 0,
      duration: null,
      summary: "Starting passive combat ability. Unarmed attacks and simple-weapon attacks use at least a d6 damage die, and while unarmored AC becomes 10 + DEX mod + WIS mod.",
      details: [
        "Butt-bumps are also technically Unarmed attacks."
      ]
    },
    open_hand: {
      id: "open_hand",
      name: "Tree Stance",
      classId: "Monk",
      kind: "active",
      tags: ["Self", "Buff", "Stance", "Arm"],
      contexts: ["combat"],
      costSp: 1,
      duration: 10,
      summary: "Active combat buff. Cost 1 SP. Lasts 10 rounds. Gain damage reduction 3 to bludgeoning, piercing, slashing damage.",
      details: [
        "Root yourself, harden your posture, and let the impact glance away."
      ]
    },
    river_stance: {
      id: "river_stance",
      name: "River Stance",
      classId: "Monk",
      kind: "active",
      tags: ["Buff", "Stance", "Leg"],
      contexts: ["combat"],
      costSp: 1,
      duration: 10,
      summary: "Active combat buff. Cost 1 SP. Lasts 10 rounds. When you hit with an unarmed attack, make an Acrobatics check against the enemy's Reflex DC to apply Off-Guard.",
      details: [
        "Flow around their defenses and leave them exposed."
      ]
    },
    mountain_stance: {
      id: "mountain_stance",
      name: "Mountain Stance",
      classId: "Monk",
      kind: "active",
      tags: ["Buff", "Stance", "Leg"],
      contexts: ["combat"],
      costSp: 1,
      duration: 10,
      summary: "Active combat buff. Cost 1 SP. Lasts 10 rounds. Gain +2 AC.",
      details: [
        "Become the obstacle."
      ]
    },
    cloud_stance: {
      id: "cloud_stance",
      name: "Cloud Stance",
      classId: "Monk",
      kind: "active",
      tags: ["Buff", "Stance", "Leg"],
      contexts: ["combat"],
      costSp: 1,
      duration: 10,
      summary: "Active combat buff. Cost 1 SP. Lasts 10 rounds. Reduce damage taken on hit by 1d4.",
      details: [
        "Turn heavy blows into glancing contact."
      ]
    },
    flame_stance: {
      id: "flame_stance",
      name: "Flame Stance",
      classId: "Monk",
      kind: "active",
      tags: ["Buff", "Stance", "Leg"],
      contexts: ["combat"],
      costSp: 1,
      duration: 10,
      summary: "Active combat buff. Cost 1 SP. Lasts 10 rounds. Gain +2 to attack rolls.",
      details: [
        "Burn faster than they can react."
      ]
    },
    hunting: {
      id: "hunting",
      name: "Hunting",
      classId: "Ranger",
      kind: "passive",
      tags: ["Head"],
      contexts: ["exploration", "combat"],
      costSp: 0,
      duration: null,
      summary: "Starting passive exploration/combat ability. Search gains +2 Perception, and entering a revealed enemy tile starts combat with a free opening attack.",
      details: [
        "Shh, we're hunting dire wabbits."
      ]
    },
    hunters_mark: {
      id: "hunters_mark",
      name: "Hunter's Mark",
      classId: "Ranger",
      kind: "active",
      tags: ["Debuff", "Mark", "Head"],
      contexts: ["combat"],
      costSp: 1,
      duration: 5,
      summary: "Active combat ability. Cost 1 SP. Make a Survival check against the enemy's Will DC; on a success, the enemy becomes Hunter's Marked for 5 rounds and your attacks against it deal +1d4 damage.",
      details: [
        "Track the rhythm, fix the quarry in your sights, and strike where it matters."
      ]
    },
    eagle_eye: {
      id: "eagle_eye",
      name: "Eagle Eye",
      classId: "Ranger",
      kind: "passive",
      tags: ["Head"],
      contexts: ["exploration"],
      costSp: 0,
      duration: null,
      summary: "Passive exploration ability. Increase Search range on the map to all tiles within 2 tiles of you.",
      details: [
        "Nothing nearby slips past your eye line."
      ]
    },
    precise_strike: {
      id: "precise_strike",
      name: "Precise Strike",
      classId: "Ranger",
      kind: "active",
      tags: ["Attack", "Head"],
      contexts: ["combat"],
      costSp: 1,
      duration: null,
      summary: "Active combat ability. Cost 1 SP. Attack with a +4 to hit.",
      details: [
        "Wait for the line, then take it."
      ]
    },
    spike_lure: {
      id: "spike_lure",
      name: "Spike Lure",
      classId: "Ranger",
      kind: "active",
      tags: ["Buff", "Arm"],
      contexts: ["combat"],
      costSp: 1,
      duration: 5,
      summary: "Active combat buff. Cost 1 SP. Lasts 5 rounds. Whenever an enemy misses an attack on you, they take 1d4 piercing damage.",
      details: [
        "Let their mistakes run straight into the spikes."
      ]
    },
    ambush: {
      id: "ambush",
      name: "Ambush",
      classId: "Ranger",
      kind: "passive",
      tags: ["Head", "Debuff"],
      contexts: ["combat"],
      costSp: 0,
      duration: null,
      summary: "Passive combat ability. Start combat by applying Off-Guard to the enemy.",
      details: [
        "You prefer the enemy's first mistake to be their last."
      ]
    },
    sneak_attack: {
      id: "sneak_attack",
      name: "Sneak Attack",
      classId: "Rogue",
      kind: "passive",
      tags: ["Arm"],
      contexts: ["combat"],
      costSp: 0,
      duration: null,
      summary: "Starting passive combat ability. On a successful agile-weapon attack, make a Dexterity check against DC 10 + enemy level; on a success, add 1d6 damage.",
      details: [
        "Stabby where it hurts."
      ]
    },
    dirty_trick: {
      id: "dirty_trick",
      name: "Dirty Trick",
      classId: "Rogue",
      kind: "active",
      tags: ["Debuff", "Arm"],
      contexts: ["combat"],
      costSp: 1,
      duration: 1,
      summary: "Active combat ability. Costs 1 SP. Make a Stealth check against the enemy's Reflex DC; on a success, the enemy becomes Blinded for 1 round.",
      details: [
        "Pocket sand is a time-honored tactical doctrine."
      ]
    },
    cover_step: {
      id: "cover_step",
      name: "Cover Step",
      classId: "Rogue",
      kind: "active",
      tags: ["Buff", "Leg"],
      contexts: ["combat"],
      costSp: 1,
      duration: 1,
      summary: "Active combat buff. Cost 1 SP. Make a Stealth check against the enemy's Will DC. On a success, gain +4 AC and +4 to your next attack for 1 round.",
      details: [
        "Slip into cover, then strike from a safer angle."
      ]
    },
    quiet_step: {
      id: "quiet_step",
      name: "Quiet Step",
      classId: "Rogue",
      kind: "active",
      tags: ["Buff", "Leg", "Stealth"],
      contexts: ["exploration"],
      costSp: 1,
      duration: 10,
      summary: "Active exploration buff. Cost 1 SP. Lasts 10 movements. When walking into an enemy tile on the map, do not trigger combat.",
      details: [
        "Ghost past trouble instead of starting it."
      ]
    },
    flight_step: {
      id: "flight_step",
      name: "Flight Step",
      classId: "Rogue",
      kind: "passive",
      tags: ["Buff", "Leg"],
      contexts: ["combat"],
      costSp: 0,
      duration: null,
      summary: "Passive combat ability. Whenever you get hit, gain +2 AC for 1 round.",
      details: [
        "The hit teaches you where not to be next."
      ]
    },
    open_wound: {
      id: "open_wound",
      name: "Open Wound",
      classId: "Rogue",
      kind: "active",
      tags: ["Attack", "Bleed", "Arm"],
      contexts: ["combat"],
      costSp: 1,
      duration: 5,
      summary: "Active combat ability. Cost 1 SP. Make an attack; on a hit, apply Bleed 2.",
      details: [
        "A small cut with a long memory."
      ]
    }
  };

  Object.assign(ABILITIES, {
    skill_acrobatics_nimble_escape: {
      id: "skill_acrobatics_nimble_escape",
      name: "Nimble Escape",
      sourceType: "skill",
      skillId: "Acrobatics",
      unlockLevel: 2,
      kind: "passive",
      tags: ["Movement", "Exploration", "Combat"],
      contexts: ["exploration", "combat"],
      costSp: 0,
      duration: null,
      summary: "Passive level-2 Acrobatics skill ability. Gain +4 to flee checks.",
      details: [
        "You know how to slip out of danger when things go bad."
      ]
    },
    skill_athletics_pack_mule: {
      id: "skill_athletics_pack_mule",
      name: "Pack Mule",
      sourceType: "skill",
      skillId: "Athletics",
      unlockLevel: 2,
      kind: "passive",
      tags: ["Exploration", "Carry"],
      contexts: ["exploration"],
      costSp: 0,
      duration: null,
      summary: "Passive level-2 Athletics skill ability. Increase carrying capacity by 10 inventory slots.",
      details: [
        "You haul more loot before needing to head back."
      ]
    },
    skill_perception_keen_search: {
      id: "skill_perception_keen_search",
      name: "Keen Search",
      sourceType: "skill",
      skillId: "Perception",
      unlockLevel: 2,
      kind: "passive",
      tags: ["Exploration", "Search"],
      contexts: ["exploration"],
      costSp: 0,
      duration: null,
      summary: "Passive level-2 Perception skill ability. Gain +4 Perception on Search actions.",
      details: [
        "You notice trails, angles, and oddities others miss."
      ]
    },
    skill_social_haggler: {
      id: "skill_social_haggler",
      name: "Haggler",
      sourceType: "skill",
      skillId: "Social",
      unlockLevel: 2,
      kind: "passive",
      tags: ["Town", "Money"],
      contexts: ["exploration"],
      costSp: 0,
      duration: null,
      summary: "Passive level-2 Social skill ability. Gain an extra 5% buy discount and 5% sell bonus in shops.",
      details: [
        "A practiced dealmaker keeps more coin in hand."
      ]
    },
    skill_stealth_cautious_camp: {
      id: "skill_stealth_cautious_camp",
      name: "Cautious Camp",
      sourceType: "skill",
      skillId: "Stealth",
      unlockLevel: 2,
      kind: "passive",
      tags: ["Exploration", "Rest"],
      contexts: ["exploration"],
      costSp: 0,
      duration: null,
      summary: "Passive level-2 Stealth skill ability. Roll twice on wilderness short-rest Stealth checks and keep the better result.",
      details: [
        "You know how to settle in without advertising your position."
      ]
    },
    skill_survival_gatherers_bounty: {
      id: "skill_survival_gatherers_bounty",
      name: "Gatherer's Bounty",
      sourceType: "skill",
      skillId: "Survival",
      unlockLevel: 2,
      kind: "passive",
      tags: ["Exploration", "Gathering"],
      contexts: ["exploration"],
      costSp: 0,
      duration: null,
      summary: "Passive level-2 Survival skill ability. Double gathered resource loot.",
      details: [
        "When you find a good patch, you make the most of it."
      ]
    },
    skill_acrobatics_defensive_roll: {
      id: "skill_acrobatics_defensive_roll",
      name: "Defensive Roll",
      sourceType: "skill",
      skillId: "Acrobatics",
      unlockLevel: 4,
      kind: "passive",
      tags: ["Combat", "Defense"],
      contexts: ["combat"],
      costSp: 0,
      duration: null,
      summary: "Passive level-4 Acrobatics skill ability. The first time each combat you would take damage, reduce it by 1d6.",
      details: [
        "A twist, slide, or shoulder turn turns a clean hit into a glancing one."
      ]
    },
    skill_athletics_overpower: {
      id: "skill_athletics_overpower",
      name: "Overpower",
      sourceType: "skill",
      skillId: "Athletics",
      unlockLevel: 4,
      kind: "passive",
      tags: ["Combat", "Attack"],
      contexts: ["combat"],
      costSp: 0,
      duration: null,
      summary: "Passive level-4 Athletics skill ability. Melee attacks against Prone or Off-Guard enemies deal +2 damage.",
      details: [
        "You know how to press an opening with raw force."
      ]
    },
    skill_perception_treasure_hunter: {
      id: "skill_perception_treasure_hunter",
      name: "Treasure Hunter",
      sourceType: "skill",
      skillId: "Perception",
      unlockLevel: 4,
      kind: "passive",
      tags: ["Exploration", "Search", "Loot"],
      contexts: ["exploration"],
      costSp: 0,
      duration: null,
      summary: "Passive level-4 Perception skill ability. Search radius increases by 1 and treasure cache coin rewards are doubled.",
      details: [
        "A sharper eye finds both the route and the reward."
      ]
    },
    skill_social_menacing_presence: {
      id: "skill_social_menacing_presence",
      name: "Menacing Presence",
      sourceType: "skill",
      skillId: "Social",
      unlockLevel: 4,
      kind: "passive",
      tags: ["Combat", "Debuff"],
      contexts: ["combat"],
      costSp: 0,
      duration: null,
      summary: "Passive level-4 Social skill ability. At the start of combat, make a Social check against the enemy's Will DC; on a success, the enemy becomes Off-Guard.",
      details: [
        "Sometimes the fight is half-won before steel ever moves."
      ]
    },
    skill_stealth_monster_plunder: {
      id: "skill_stealth_monster_plunder",
      name: "Monster Plunder",
      sourceType: "skill",
      skillId: "Stealth",
      unlockLevel: 4,
      kind: "passive",
      tags: ["Combat", "Loot"],
      contexts: ["combat", "exploration"],
      costSp: 0,
      duration: null,
      summary: "Passive level-4 Stealth skill ability. Double monster coin loot and double the quantity of any monster item drops.",
      details: [
        "You strip a battlefield clean before the dust settles."
      ]
    },
    skill_survival_field_dressing: {
      id: "skill_survival_field_dressing",
      name: "Field Dressing",
      sourceType: "skill",
      skillId: "Survival",
      unlockLevel: 4,
      kind: "passive",
      tags: ["Combat", "Healing"],
      contexts: ["combat", "exploration"],
      costSp: 0,
      duration: null,
      summary: "Passive level-4 Survival skill ability. After winning a combat, recover HP equal to the enemy's level + your Wisdom modifier (minimum 1).",
      details: [
        "A veteran hunter knows how to patch up and press on."
      ]
    }
  });

  const STATUS_EFFECT_TEMPLATES = {
    guarded: {
      id: "guarded",
      name: "Guarded",
      description: "+2 AC for the duration.",
      duration: 1,
      durationMode: "turn",
      durationUnit: "rounds",
      tags: ["Buff"],
      modifiers: { acModifier: 2 }
    },
    brace_for_impact: {
      id: "brace_for_impact",
      name: "Brace for Impact",
      description: "Resistance 3 to bludgeoning, piercing, and slashing for the duration.",
      duration: 1,
      durationMode: "turn",
      durationUnit: "rounds",
      tags: ["Buff"],
      modifiers: {
        resistances: {
          bludgeoning: 3,
          piercing: 3,
          slashing: 3
        }
      }
    },
    off_guard: {
      id: "off_guard",
      name: "Off-Guard",
      description: "-2 AC for the duration.",
      duration: 1,
      durationMode: "turn",
      durationUnit: "rounds",
      tags: ["Debuff"],
      modifiers: { acModifier: -2 }
    },
    prone: {
      id: "prone",
      name: "Prone",
      description: "-4 AC and -2 attack rolls for the duration.",
      duration: 1,
      durationMode: "turn",
      durationUnit: "rounds",
      tags: ["Debuff"],
      modifiers: { acModifier: -4, attackRollModifier: -2 }
    },
    staggered: {
      id: "staggered",
      name: "Staggered",
      description: "-2 attack rolls for the duration.",
      duration: 2,
      durationMode: "turn",
      durationUnit: "rounds",
      tags: ["Debuff"],
      modifiers: { attackRollModifier: -2 }
    },
    marked_prey: {
      id: "marked_prey",
      name: "Hunter's Mark",
      description: "Your attacks against this target deal +1d4 damage while it lasts.",
      duration: 5,
      durationMode: "turn",
      durationUnit: "rounds",
      tags: ["Debuff", "Mark"],
      modifiers: {}
    },
    blinded: {
      id: "blinded",
      name: "Blinded",
      description: "-4 attack rolls for the duration.",
      duration: 1,
      durationMode: "turn",
      durationUnit: "rounds",
      tags: ["Debuff"],
      modifiers: { attackRollModifier: -4 }
    },
    poison: {
      id: "poison",
      name: "Poison",
      description: "Takes poison damage at the end of each turn for up to 5 turns. Leftover duration carries into exploration.",
      duration: 5,
      durationMode: "turn",
      durationUnit: "turns",
      tags: ["Debuff", "Poison"],
      ongoingDamage: 1,
      ongoingDamageType: "poison",
      modifiers: {}
    },
    bleed: {
      id: "bleed",
      name: "Bleed",
      description: "Takes necrotic damage at the end of each turn for up to 5 turns. Leftover duration carries into exploration.",
      duration: 5,
      durationMode: "turn",
      durationUnit: "turns",
      tags: ["Debuff", "Bleed"],
      ongoingDamage: 1,
      ongoingDamageType: "necrotic",
      modifiers: {}
    },
    head_injury: {
      id: "head_injury",
      name: "Head Injury",
      description: "Disables abilities with the Head tag for the duration.",
      duration: 1,
      durationMode: "turn",
      durationUnit: "turns",
      tags: ["Debuff", "Injury"],
      disabledAbilityTags: ["head"],
      modifiers: {}
    },
    arm_injury: {
      id: "arm_injury",
      name: "Arm Injury",
      description: "Disables abilities with the Arm tag for the duration.",
      duration: 1,
      durationMode: "turn",
      durationUnit: "turns",
      tags: ["Debuff", "Injury"],
      disabledAbilityTags: ["arm"],
      modifiers: {}
    },
    leg_injury: {
      id: "leg_injury",
      name: "Leg Injury",
      description: "Disables abilities with the Leg tag for the duration.",
      duration: 1,
      durationMode: "turn",
      durationUnit: "turns",
      tags: ["Debuff", "Injury"],
      disabledAbilityTags: ["leg"],
      modifiers: {}
    },
    guard_strike_ready: {
      id: "guard_strike_ready",
      name: "Guard Strike",
      description: "Counterattack the first enemy that attacks you before your next turn.",
      duration: 1,
      durationMode: "turn",
      durationUnit: "rounds",
      tags: ["Buff", "Counter", "Reach"],
      modifiers: {}
    },
    spike_lure: {
      id: "spike_lure",
      name: "Spike Lure",
      description: "When an enemy misses you, it takes 1d4 piercing damage.",
      duration: 5,
      durationMode: "turn",
      durationUnit: "rounds",
      tags: ["Buff"],
      modifiers: {}
    },
    tree_stance: {
      id: "tree_stance",
      name: "Tree Stance",
      description: "Resistance 3 to bludgeoning, piercing, and slashing while the stance lasts.",
      duration: 10,
      durationMode: "turn",
      durationUnit: "rounds",
      tags: ["Buff", "Stance"],
      modifiers: {
        resistances: {
          bludgeoning: 3,
          piercing: 3,
          slashing: 3
        }
      }
    },
    river_stance: {
      id: "river_stance",
      name: "River Stance",
      description: "When you hit with an unarmed attack, you can make an Acrobatics check to apply Off-Guard.",
      duration: 10,
      durationMode: "turn",
      durationUnit: "rounds",
      tags: ["Buff", "Stance"],
      modifiers: {}
    },
    mountain_stance: {
      id: "mountain_stance",
      name: "Mountain Stance",
      description: "+2 AC while the stance lasts.",
      duration: 10,
      durationMode: "turn",
      durationUnit: "rounds",
      tags: ["Buff", "Stance"],
      modifiers: { acModifier: 2 }
    },
    cloud_stance: {
      id: "cloud_stance",
      name: "Cloud Stance",
      description: "Reduce damage taken on hit by 1d4.",
      duration: 10,
      durationMode: "turn",
      durationUnit: "rounds",
      tags: ["Buff", "Stance"],
      modifiers: {}
    },
    flame_stance: {
      id: "flame_stance",
      name: "Flame Stance",
      description: "+2 to attack rolls while the stance lasts.",
      duration: 10,
      durationMode: "turn",
      durationUnit: "rounds",
      tags: ["Buff", "Stance"],
      modifiers: { attackRollModifier: 2 }
    },
    cover_step: {
      id: "cover_step",
      name: "Cover Step",
      description: "+4 AC and +4 to your next attack for 1 round.",
      duration: 1,
      durationMode: "turn",
      durationUnit: "rounds",
      tags: ["Buff"],
      consumeOnAttack: true,
      modifiers: { acModifier: 4, attackRollModifier: 4 }
    },
    quiet_step: {
      id: "quiet_step",
      name: "Quiet Step",
      description: "For 10 movements, entering an enemy tile does not trigger combat.",
      duration: 10,
      durationMode: "move",
      durationUnit: "movements",
      tags: ["Buff", "Stealth"],
      modifiers: {}
    },
    flight_step: {
      id: "flight_step",
      name: "Flight Step",
      description: "+2 AC for 1 round after you get hit.",
      duration: 1,
      durationMode: "turn",
      durationUnit: "rounds",
      tags: ["Buff"],
      modifiers: { acModifier: 2 }
    }
  };

  /********************************************************************
   * Data: Skills (as requested)
   ********************************************************************/
  const SKILLS = [
    { id: "Acrobatics", stat: "DEX" },
    { id: "Athletics", stat: "STR" },
    { id: "Crafting", stat: "INT" },
    { id: "Perception", stat: "WIS" },
    { id: "Social", stat: "CHA" },
    { id: "Stealth", stat: "DEX" },
    { id: "Survival", stat: "WIS" }
  ];

  const RANDOM_EVENT_TEMPLATES = [
    {
      id: "scattered_pack",
      title: "Scattered Pack",
      description: "A torn traveler pack lies half-buried in the undergrowth. Something useful may still be tucked beneath the brush.",
      skill: "Perception",
      dcBase: 11,
      dcPerAreaLevel: 2,
      successText: "You spot the intact pouch before the rest of the pack rots away.",
      rewardHint: "salvaged coin and light supplies",
      rewardCoins: [40, 120],
      rewardItems: [{ id: "herbs", qty: [1, 2], chance: 0.7 }],
      failureText: "You rummage blindly through splintered wood and hidden brambles.",
      failDamage: "1d4",
      failDamageType: "piercing"
    },
    {
      id: "cracked_footbridge",
      title: "Cracked Footbridge",
      description: "A narrow bridge sways over a slick drop. A weathered satchel hangs from the far rail.",
      skill: "Acrobatics",
      dcBase: 12,
      dcPerAreaLevel: 2,
      successText: "You keep your balance and snatch the satchel in one smooth crossing.",
      rewardHint: "coin and recovered trade goods",
      rewardCoins: [55, 135],
      rewardItems: [{ id: "hide", qty: [1, 1], chance: 0.45 }],
      failureText: "The rotten planks give way and you slam hard against the bridge frame.",
      failDamage: "1d4+1",
      failDamageType: "bludgeoning"
    },
    {
      id: "toppled_waystone",
      title: "Toppled Waystone",
      description: "A carved waystone has tipped into the mud, pinning a small lockbox beneath it.",
      skill: "Athletics",
      dcBase: 11,
      dcPerAreaLevel: 2,
      successText: "You heave the stone aside and pry the lockbox free.",
      rewardHint: "coin and raw ore",
      rewardCoins: [45, 125],
      rewardItems: [{ id: "ore", qty: [1, 2], chance: 0.55 }],
      failureText: "The stone shifts the wrong way and catches your hands and shoulders.",
      failDamage: "1d4",
      failDamageType: "bludgeoning"
    },
    {
      id: "jammed_cache",
      title: "Jammed Cache",
      description: "You find an old field cache with swollen hinges and a lid that refuses to budge.",
      skill: "Crafting",
      dcBase: 12,
      dcPerAreaLevel: 2,
      successText: "You work the hinges loose without ruining the contents.",
      rewardHint: "coin and a few preserved supplies",
      rewardCoins: [50, 130],
      rewardItems: [{ id: "ore", qty: [1, 1], chance: 0.4 }, { id: "potion_healing", qty: [1, 1], chance: 0.2 }],
      failureText: "The latch snaps and metal shrapnel bites back.",
      failDamage: "1d4",
      failDamageType: "piercing"
    },
    {
      id: "skittish_mule",
      title: "Skittish Mule",
      description: "A frightened pack mule stands tangled in its own reins beside a spilled bundle of trade goods.",
      skill: "Social",
      dcBase: 11,
      dcPerAreaLevel: 2,
      successText: "A calm voice and steady hand settle the beast enough to reclaim the scattered goods.",
      rewardHint: "coin and a grateful gift",
      rewardCoins: [60, 140],
      rewardItems: [{ id: "potion_healing", qty: [1, 1], chance: 0.25 }, { id: "herbs", qty: [1, 2], chance: 0.5 }],
      failureText: "The mule lashes out in a panic before bolting down the trail.",
      failDamage: "1d4",
      failDamageType: "bludgeoning"
    },
    {
      id: "tripwire_stash",
      title: "Tripwire Stash",
      description: "A thin line catches the light between two trees. Someone hid a stash here and rigged it against clumsy thieves.",
      skill: "Stealth",
      dcBase: 12,
      dcPerAreaLevel: 2,
      successText: "You slip past the wire and lift the stash without setting off the alarm.",
      rewardHint: "coin and quiet scavenged materials",
      rewardCoins: [45, 120],
      rewardItems: [{ id: "hide", qty: [1, 2], chance: 0.45 }],
      failureText: "The line snaps taut and a hidden dart or hook catches you on the way through.",
      failDamage: "1d4",
      failDamageType: "piercing"
    },
    {
      id: "fresh_tracks",
      title: "Fresh Tracks",
      description: "A line of fresh tracks leads toward a half-hidden hunter's mark and a likely supply cache.",
      skill: "Survival",
      dcBase: 11,
      dcPerAreaLevel: 2,
      successText: "You read the trail cleanly and recover the cache before scavengers do.",
      rewardHint: "coin, herbs, and field supplies",
      rewardCoins: [50, 135],
      rewardItems: [{ id: "herbs", qty: [1, 2], chance: 0.75 }, { id: "hide", qty: [1, 1], chance: 0.35 }],
      failureText: "You follow the wrong sign into rough brush and catch a few nasty cuts for it.",
      failDamage: "1d4",
      failDamageType: "slashing"
    }
  ];

  const STAT_LEVEL_UP_CAP = 20;

  const SKILL_ABILITY_TIERS = {
    2: [
      "skill_acrobatics_nimble_escape",
      "skill_athletics_pack_mule",
      "skill_perception_keen_search",
      "skill_social_haggler",
      "skill_stealth_cautious_camp",
      "skill_survival_gatherers_bounty"
    ],
    4: [
      "skill_acrobatics_defensive_roll",
      "skill_athletics_overpower",
      "skill_perception_treasure_hunter",
      "skill_social_menacing_presence",
      "skill_stealth_monster_plunder",
      "skill_survival_field_dressing"
    ]
  };

  /********************************************************************
   * Data: Weapons array (requested properties)
   * Cost is stored as copper pieces (cp). 100cp = 1gp; 10cp = 1sp.
   ********************************************************************/
  const WEAPONS = [
    { id:"club",      name:"Club",      type:"weapon", category:"simple",  "Weapon type":"melee",  "Damage":"1d6", "Damage type":"bludgeoning", cost:  10, properties:["reach"], buyable:true },
    { id:"dagger",    name:"Dagger",    type:"weapon", category:"simple",  "Weapon type":"melee",  "Damage":"1d4", "Damage type":"piercing",    cost: 200, properties:["agile","finesse","reach"], buyable:true },
    { id:"shortsword",name:"Shortsword",type:"weapon", category:"martial", "Weapon type":"melee",  "Damage":"1d6", "Damage type":"piercing",    cost: 1000, properties:["agile","finesse"], buyable:true },
    { id:"longsword", name:"Longsword", type:"weapon", category:"martial", "Weapon type":"melee",  "Damage":"1d8", "Damage type":"slashing",    cost: 1500, properties:["versatile:P"], buyable:true },
    { id:"greataxe",  name:"Greataxe",  type:"weapon", category:"martial", "Weapon type":"melee",  "Damage":"1d12","Damage type":"slashing",    cost: 2000, properties:["two-hand"], buyable:true },
    { id:"spear",     name:"Spear",     type:"weapon", category:"simple",  "Weapon type":"melee",  "Damage":"1d6", "Damage type":"piercing",    cost: 100, properties:["reach","versatile:S"], buyable:true },
    { id:"shortbow",  name:"Shortbow",  type:"weapon", category:"martial", "Weapon type":"ranged", "Damage":"1d6", "Damage type":"piercing",    cost: 3000, ammoItemId:"arrows", properties:["range:60","two-hand","ammo-arrow"], buyable:true },
    { id:"quarterstaff",name:"Quarterstaff",type:"weapon",category:"simple","Weapon type":"melee","Damage":"1d6","Damage type":"bludgeoning", cost:  20, properties:["two-hand","versatile:P"], buyable:true },
    { id:"mace",      name:"Mace",      type:"weapon", category:"simple",  "Weapon type":"melee",  "Damage":"1d6", "Damage type":"bludgeoning", cost:  80, properties:[], buyable:true }
  ];

  /********************************************************************
   * Data: Armor & shields (not requested, but needed for AC & shop)
   ********************************************************************/
  const ARMORS = [
    { id:"cloth",   name:"Cloth Wraps", type:"armor", category:"unarmored", acBonus:0, dexCap:99, cost:0, buyable:false, properties:["no-armor"] },
    { id:"leather", name:"Leather Armor", type:"armor", category:"light", acBonus:1, dexCap:4, cost:2000, buyable:true, properties:[] },
    { id:"studded", name:"Studded Leather", type:"armor", category:"light", acBonus:2, dexCap:3, cost:4500, buyable:true, properties:[] },
    { id:"chain",   name:"Chain Shirt", type:"armor", category:"medium", acBonus:3, dexCap:2, cost:6500, buyable:true, properties:[] },
    { id:"scale",   name:"Scale Mail", type:"armor", category:"medium", acBonus:4, dexCap:1, cost:9000, buyable:true, properties:["noisy"] }
  ];

  const OFFHAND = [
    { id:"shield", name:"Wooden Shield", type:"offhand", category:"shield", acBonus:1, cost:1000, buyable:true, properties:["shield"] }
  ];

  const ACCESSORIES = [
    { id:"sack", name:"Carry Sack", type:"accessory", category:"utility", cost:150, buyable:true, carryBonus:5, properties:["carry"] },
    { id:"backpack", name:"Backpack", type:"accessory", category:"utility", cost:350, buyable:true, carryBonus:10, properties:["carry"] }
  ];

  /********************************************************************
   * Data: Consumables (Potions heal 2d4+2 per request)
   ********************************************************************/
  const CONSUMABLES = [
    { id:"potion_healing", name:"Potion of Healing", type:"consumable", category:"potion", cost:500, buyable:true,
      use: (state) => {
        const heal = rollDice("2d4+2");
        const before = state.player.hp.current;
        state.player.hp.current = clamp(state.player.hp.current + heal, 0, state.player.hp.max);
        log(state, `You drink a Potion of Healing and recover ${state.player.hp.current - before} HP.`);
      }
    }
  ];

  const AMMO = [
    {
      id:"arrows",
      name:"Arrows",
      type:"ammo",
      category:"ammunition",
      ammoKey:"arrow",
      cost:1,
      purchaseQty:10,
      purchasePrice:10,
      buyable:true,
      sellable:false,
      properties:["bundle:10"]
    }
  ];

  /********************************************************************
   * Data: Resources (for exploration & selling)
   ********************************************************************/
  const RESOURCES = [
    { id:"herbs", name:"Wild Herbs", type:"resource", sellValue: 35, stackable:true },
    { id:"ore",   name:"Iron Ore",   type:"resource", sellValue: 60, stackable:true },
    { id:"hide",  name:"Beast Hide", type:"resource", sellValue: 45, stackable:true }
  ];

  /********************************************************************
   * Data: Monsters (array requested)
   ********************************************************************/
  const MONSTERS = [
    {
      id:"goblin",
      name:"Goblin Skirmisher",
      level:1,
      hp: 12,
      ac: 12,
      attackBonus: 3,
      damage: "1d6+2",
      damageType: "slashing",
      status: [
        { id:"fort", label:"Fortitude", dc:13 },
        { id:"reflex", label:"Reflex", dc:15 },
        { id:"will", label:"Will", dc:12 }
      ],
      loot: { coins:[30, 120], items:[{id:"herbs", chance:0.35, qty:[1,2]}] },
      traits:["humanoid","goblin"]
    },
    {
      id:"wolf",
      name:"Hungry Wolf",
      level:1,
      hp: 14,
      ac: 11,
      attackBonus: 3,
      damage: "1d6+1",
      damageType: "piercing",
      status: [
        { id:"fort", label:"Fortitude", dc:14 },
        { id:"reflex", label:"Reflex", dc:13 },
        { id:"will", label:"Will", dc:11 }
      ],
      loot: { coins:[20, 80], items:[{id:"hide", chance:0.55, qty:[1,1]}] },
      traits:["animal"]
    },
    {
      id:"skeleton",
      name:"Restless Skeleton",
      level:2,
      hp: 20,
      ac: 13,
      attackBonus: 4,
      damage: "1d8+2",
      damageType: "slashing",
      status: [
        { id:"fort", label:"Fortitude", dc:16 },
        { id:"reflex", label:"Reflex", dc:12 },
        { id:"will", label:"Will", dc:15 }
      ],
      loot: { coins:[80, 220], items:[{id:"ore", chance:0.25, qty:[1,2]}] },
      traits:["undead"]
    },
    {
      id:"bandit",
      name:"Roadside Bandit",
      level:2,
      hp: 18,
      ac: 12,
      attackBonus: 4,
      damage: "1d6+3",
      damageType: "piercing",
      status: [
        { id:"fort", label:"Fortitude", dc:14 },
        { id:"reflex", label:"Reflex", dc:15 },
        { id:"will", label:"Will", dc:13 }
      ],
      loot: { coins:[120, 280], items:[{id:"potion_healing", chance:0.20, qty:[1,1]}] },
      traits:["humanoid"]
    },
    {
      id:"slime",
      name:"Cave Slime",
      level:3,
      hp: 28,
      ac: 10,
      attackBonus: 5,
      damage: "1d10+2",
      damageType: "acid",
      status: [
        { id:"fort", label:"Fortitude", dc:17 },
        { id:"reflex", label:"Reflex", dc:10 },
        { id:"will", label:"Will", dc:12 }
      ],
      loot: { coins:[150, 350], items:[{id:"ore", chance:0.50, qty:[1,3]}] },
      traits:["ooze"]
    },
    {
      id:"crystal_spider",
      name:"Crystal Fang Spider",
      level:3,
      hp: 26,
      ac: 14,
      attackBonus: 6,
      damage: "1d8+3",
      damageType: "piercing",
      status: [
        { id:"fort", label:"Fortitude", dc:15 },
        { id:"reflex", label:"Reflex", dc:17 },
        { id:"will", label:"Will", dc:12 }
      ],
      loot: { coins:[140, 320], items:[{id:"ore", chance:0.35, qty:[1,2]}, {id:"hide", chance:0.30, qty:[1,1]}] },
      traits:["animal","poison"]
    },
    {
      id:"ember_hound",
      name:"Ember Hound",
      level:4,
      hp: 34,
      ac: 14,
      attackBonus: 7,
      damage: "1d10+4",
      damageType: "fire",
      status: [
        { id:"fort", label:"Fortitude", dc:18 },
        { id:"reflex", label:"Reflex", dc:16 },
        { id:"will", label:"Will", dc:14 }
      ],
      loot: { coins:[210, 430], items:[{id:"hide", chance:0.45, qty:[1,2]}, {id:"potion_healing", chance:0.15, qty:[1,1]}] },
      traits:["elemental","beast","fire"]
    },
    {
      id:"cinder_acolyte",
      name:"Cinder Acolyte",
      level:4,
      hp: 30,
      ac: 13,
      attackBonus: 7,
      damage: "1d8+4",
      damageType: "fire",
      status: [
        { id:"fort", label:"Fortitude", dc:17 },
        { id:"reflex", label:"Reflex", dc:15 },
        { id:"will", label:"Will", dc:18 }
      ],
      loot: { coins:[220, 460], items:[{id:"ore", chance:0.30, qty:[1,2]}, {id:"potion_healing", chance:0.22, qty:[1,1]}] },
      traits:["humanoid","fire"]
    },
    {
      id:"marsh_troll",
      name:"Marsh Troll",
      level:5,
      hp: 42,
      ac: 15,
      attackBonus: 8,
      damage: "1d12+4",
      damageType: "bludgeoning",
      status: [
        { id:"fort", label:"Fortitude", dc:20 },
        { id:"reflex", label:"Reflex", dc:14 },
        { id:"will", label:"Will", dc:15 }
      ],
      loot: { coins:[280, 560], items:[{id:"hide", chance:0.55, qty:[1,2]}, {id:"herbs", chance:0.40, qty:[1,3]}] },
      traits:["giant","regenerating"]
    },
    {
      id:"fen_wraith",
      name:"Fen Wraith",
      level:5,
      hp: 38,
      ac: 16,
      attackBonus: 9,
      damage: "2d6+4",
      damageType: "necrotic",
      status: [
        { id:"fort", label:"Fortitude", dc:18 },
        { id:"reflex", label:"Reflex", dc:17 },
        { id:"will", label:"Will", dc:20 }
      ],
      loot: { coins:[300, 610], items:[{id:"herbs", chance:0.50, qty:[1,2]}, {id:"potion_healing", chance:0.18, qty:[1,1]}] },
      traits:["undead","incorporeal"]
    },
    {
      id:"storm_drake",
      name:"Storm Drake",
      level:6,
      hp: 54,
      ac: 18,
      attackBonus: 11,
      damage: "2d8+5",
      damageType: "electricity",
      status: [
        { id:"fort", label:"Fortitude", dc:22 },
        { id:"reflex", label:"Reflex", dc:19 },
        { id:"will", label:"Will", dc:17 }
      ],
      loot: { coins:[420, 780], items:[{id:"ore", chance:0.60, qty:[2,4]}, {id:"potion_healing", chance:0.25, qty:[1,1]}] },
      traits:["dragon","electricity"]
    },
    {
      id:"obsidian_knight",
      name:"Obsidian Knight",
      level:6,
      hp: 58,
      ac: 19,
      attackBonus: 12,
      damage: "2d10+5",
      damageType: "slashing",
      status: [
        { id:"fort", label:"Fortitude", dc:23 },
        { id:"reflex", label:"Reflex", dc:18 },
        { id:"will", label:"Will", dc:21 }
      ],
      loot: { coins:[460, 860], items:[{id:"ore", chance:0.50, qty:[2,3]}, {id:"potion_healing", chance:0.30, qty:[1,1]}] },
      traits:["construct","armored"]
    }
  ];

  /********************************************************************
   * Data: Areas (exploration)
   ********************************************************************/
  const AREAS = [
    { id:"town", name:"Astaria", level:0, map:false, shop:true, description:"A safe haven. Rest, trade, and plan your next venture." },
    { id:"woods", name:"Whispering Woods", level:1, map:true, size:18, travelCostCp:0, description:"A dense, misty forest with scattered ruins, hidden dungeon mouths, and lurking predators.",
      encounterPool:["goblin","wolf"], resourcePool:["herbs","hide"], treasureRange:[20, 120]
    },
    { id:"ruins", name:"Sunken Ruins", level:2, map:true, size:9, travelCostCp:0, description:"Ancient stonework half-swallowed by earth. Bandits and the restless dead prowl here.",
      encounterPool:["bandit","skeleton","wolf"], resourcePool:["ore","herbs"], treasureRange:[80, 240]
    },
    { id:"caves", name:"Crystal Caves", level:3, map:true, size:9, travelCostCp:0, description:"Wet caverns with jagged mineral growths, acidic pools, and patient predators.",
      encounterPool:["slime","crystal_spider","skeleton"], resourcePool:["ore"], treasureRange:[120, 320]
    },
    { id:"vault", name:"Ember Vault", level:4, map:true, size:9, travelCostCp:0, description:"A buried furnace-complex that still breathes old heat through cracked stone halls.",
      encounterPool:["ember_hound","cinder_acolyte","slime"], resourcePool:["ore","hide"], treasureRange:[180, 420]
    },
    { id:"mire", name:"Mire of Echoes", level:5, map:true, size:9, travelCostCp:0, description:"A drowned fen of broken causeways, black pools, and voices that linger in the fog.",
      encounterPool:["marsh_troll","fen_wraith","wolf"], resourcePool:["herbs","hide"], treasureRange:[260, 560]
    },
    { id:"bastion", name:"Stormwatch Bastion", level:6, map:true, size:9, travelCostCp:0, description:"A shattered high keep where lightning clings to old stone and elite guardians remain at watch.",
      encounterPool:["storm_drake","obsidian_knight","fen_wraith"], resourcePool:["ore","herbs"], treasureRange:[360, 760]
    }
  ];

  const DUNGEON_LINKS = [
    { sourceAreaId:"woods", targetAreaId:"ruins", x:2, y:3, terrain:"dirt" },
    { sourceAreaId:"woods", targetAreaId:"caves", x:9, y:1, terrain:"dirt" },
    { sourceAreaId:"woods", targetAreaId:"vault", x:16, y:8, terrain:"dirt" },
    { sourceAreaId:"woods", targetAreaId:"mire", x:9, y:16, terrain:"plains" },
    { sourceAreaId:"woods", targetAreaId:"bastion", x:1, y:9, terrain:"dirt" }
  ];

  /********************************************************************
   * Item index (for inventory / shop lookup)
   ********************************************************************/
  const ITEM_INDEX = new Map();
  [...WEAPONS, ...ARMORS, ...OFFHAND, ...ACCESSORIES, ...CONSUMABLES, ...AMMO, ...RESOURCES].forEach(it => ITEM_INDEX.set(it.id, it));

  function getItem(id){
    const it = ITEM_INDEX.get(id);
    if(!it) throw new Error("Unknown item id: " + id);
    return it;
  }

  const AMMO_ITEM_BY_KEY = {
    arrow: "arrows"
  };

  function ammoItemIdForWeapon(weapon){
    if(!weapon || weapon.type !== "weapon") return null;
    if(weapon.ammoItemId) return weapon.ammoItemId;
    const prop = Array.isArray(weapon.properties)
      ? weapon.properties.find(p => String(p || "").toLowerCase().startsWith("ammo-"))
      : null;
    if(!prop) return null;
    const key = String(prop).slice(5).trim().toLowerCase();
    return AMMO_ITEM_BY_KEY[key] || null;
  }

  function itemQuantity(player, itemId){
    if(!player || !Array.isArray(player.inventory)) return 0;
    const found = player.inventory.find(entry => entry.itemId === itemId);
    return Math.max(0, Number(found && found.qty || 0));
  }

  function weaponAmmoCount(player, weapon){
    const ammoItemId = ammoItemIdForWeapon(weapon);
    return ammoItemId ? itemQuantity(player, ammoItemId) : 0;
  }

  /********************************************************************
   * Utils: math, dice, coins, RNG
   ********************************************************************/
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  function statMod(score){
    return Math.floor((score - 10) / 2);
  }

  function rollInt(min, max){
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function rollD20(){
    return rollInt(1, 20);
  }

  function rollDice(expr){
    // supports "2d4+2", "1d8", "1d6+3"
    const m = String(expr).trim().match(/^(\d+)d(\d+)([+-]\d+)?$/i);
    if(!m) throw new Error("Bad dice expr: " + expr);
    const n = parseInt(m[1],10);
    const sides = parseInt(m[2],10);
    const mod = m[3] ? parseInt(m[3],10) : 0;
    let total = 0;
    for(let i=0;i<n;i++) total += rollInt(1, sides);
    return total + mod;
  }

  function formatCoins(cp){
    cp = Math.max(0, Math.floor(cp));
    const gp = Math.floor(cp / 100);
    cp %= 100;
    const sp = Math.floor(cp / 10);
    cp %= 10;
    return `${gp}gp ${sp}sp ${cp}cp`;
  }

  function addCoins(state, cp){
    state.player.moneyCp = Math.max(0, state.player.moneyCp + Math.floor(cp));
  }
  function canAfford(state, costCp){
    return state.player.moneyCp >= costCp;
  }
  function spendCoins(state, costCp){
    if(!canAfford(state, costCp)) return false;
    state.player.moneyCp -= costCp;
    return true;
  }

  /********************************************************************
   * Pricing helpers (Social skill modifies shop rates)
   * Spec: each Social modifier = 1% discount when buying, 1% upcharge when selling.
   ********************************************************************/
  function socialPriceModifier(player){
    return skillTotal(player, "Social") + (hasAbility(player, "skill_social_haggler") ? 5 : 0);
  }

  function buyMultiplier(player){
    const sm = socialPriceModifier(player);
    return 1 - (sm * 0.01);
  }

  function sellMultiplier(player){
    const sm = socialPriceModifier(player);
    return 1 + (sm * 0.01);
  }

  function adjustedBuyPriceCp(player, baseCp){
    const mult = buyMultiplier(player);
    return Math.max(1, Math.floor(Math.max(0, baseCp) * mult));
  }

  function baseSellPriceCp(item){
    if(!item || item.sellable === false) return 0;
    if(typeof item.sellValue === "number") return Math.max(0, item.sellValue || 0);
    const base = Math.max(0, item.cost || 0);
    return Math.max(0, Math.floor(base * 0.5));
  }

  function adjustedSellPriceCp(player, item){
    const mult = sellMultiplier(player);
    return Math.max(0, Math.floor(baseSellPriceCp(item) * mult));
  }

  function canSellItem(item){
    return !!item && item.sellable !== false && baseSellPriceCp(item) > 0;
  }

  function itemDmgOrAC(it){
    if(!it) return "—";
    if(it.type === "weapon"){
      const dmg = it["Damage"] || it.Damage || "—";
      const dt = it["Damage type"] || it["Damage Type"] || it["damageType"] || "";
      return `${dmg}${dt?" "+dt:""}`;
    }
    if(it.type === "ammo"){
      const bundle = Math.max(1, Number(it.purchaseQty || 1));
      return bundle > 1 ? `Bundle ×${bundle}` : "Ammo";
    }
    // Armor
    if(it.type === "armor"){
      const ac = it.acBonus || 0;
      const cap = dexCapFromArmor(it);
      return `AC +${ac} (Dex cap ${cap>=99?"—":"+"+cap})`;
    }
    // Shields (offhand)
    if(it.category === "shield"){
      const ac = it.acBonus || 0;
      return `AC +${ac}`;
    }
    if(it.type === "accessory" && Number(it.carryBonus || 0) > 0){
      return `Carry +${it.carryBonus}`;
    }
    return "—";
  }

  function itemTooltipHtml(it, player){
    const rows = [];
    const row = (k, v) => `<div class="trow"><div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(v)}</div></div>`;
    const usesProficiency = itemUsesProficiency(it);
    const isProficient = usesProficiency ? isProficientWithItem(player, it) : true;

    rows.push(row("Type", it.type || "—"));
    if(it.category) rows.push(row("Category", it.category));
    if(it["Weapon type"]) rows.push(row("Weapon", it["Weapon type"]));
    if(usesProficiency) rows.push(row("Training", isProficient ? "Proficient" : "Not proficient"));

    if(it.type === "weapon"){
      rows.push(row("Damage", `${(it.Damage||it["Damage"]||"—")} ${(it["Damage type"]||it.damageType||"")}`.trim()));
      const ammoItemId = ammoItemIdForWeapon(it);
      if(ammoItemId) rows.push(row("Ammo", getItem(ammoItemId).name));
      if(Array.isArray(it.properties) && it.properties.length) rows.push(row("Props", it.properties.map(formatPropertyLabel).join(", ")));
    }
    if(it.type === "ammo"){
      rows.push(row("Ammo key", it.ammoKey || "—"));
      rows.push(row("Bundle", `${Math.max(1, Number(it.purchaseQty || 1))}`));
    }
    if(it.type === "armor"){
      rows.push(row("AC bonus", `+${it.acBonus||0}`));
      const cap = dexCapFromArmor(it);
      rows.push(row("Dex cap", cap>=99 ? "—" : `+${cap}`));
    }
    if(it.category === "shield"){
      rows.push(row("AC bonus", `+${it.acBonus||0}`));
    }
    if(it.type === "accessory" && Number(it.carryBonus || 0) > 0){
      rows.push(row("Carry bonus", `+${it.carryBonus} slots`));
    }

    if(typeof it.cost === "number") rows.push(row("Base cost", formatCoins(it.cost)));
    if(it.buyable){
      const buyBase = Math.max(0, Number(it.purchasePrice != null ? it.purchasePrice : it.cost || 0));
      rows.push(row("Buy", buyBase > 0 ? formatCoins(adjustedBuyPriceCp(player, buyBase)) : "—"));
    }
    rows.push(row("Sell", canSellItem(it) ? formatCoins(adjustedSellPriceCp(player, it)) : "—"));

    return `
      <div style="font-weight:700; font-size:13px; margin-bottom:6px">${escapeHtml(it.name)}</div>
      ${usesProficiency && !isProficient ? `<div class="badgeWrap" style="margin-bottom:8px"><span class="badge bad">not proficient</span></div>` : ``}
      ${rows.join("")}
    `;
  }

  function itemLinkHtml(it, player, label=null){
    const text = label == null ? it.name : label;
    const notProficient = itemUsesProficiency(it) && !isProficientWithItem(player, it);
    return `<span class="itemLink${notProficient ? " notProficientText" : ""}" data-item="${it.id}">${escapeHtml(text)}</span>`;
  }

  function itemTextClass(it, player){
    return itemUsesProficiency(it) && !isProficientWithItem(player, it) ? "notProficientText" : "";
  }

  function itemCategoryLabel(it){
    return formatDamageTypeLabel(it && (it.category || it.type || ""));
  }

  function terrainLabel(terrain){
    return formatDamageTypeLabel(terrain || "unknown");
  }

  function terrainBadgeHtml(terrain){
    const key = String(terrain || "unknown").trim().toLowerCase();
    return `<span class="badge terrain-badge terrain-${escapeHtml(key)}">${escapeHtml(terrainLabel(key))}</span>`;
  }

  function normalizeSortConfig(sortConfig, fallbackKey="name"){
    const cfg = sortConfig || {};
    return {
      key: cfg.key || fallbackKey,
      dir: cfg.dir === "desc" ? "desc" : "asc"
    };
  }

  function compareSortValues(a, b){
    if(typeof a === "number" && typeof b === "number") return a - b;
    const na = Number(a);
    const nb = Number(b);
    const aIsNumeric = Number.isFinite(na) && String(a ?? "").trim() !== "";
    const bIsNumeric = Number.isFinite(nb) && String(b ?? "").trim() !== "";
    if(aIsNumeric && bIsNumeric) return na - nb;
    return String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric:true, sensitivity:"base" });
  }

  function sortRows(rows, sortConfig, fallbackKey="name"){
    const cfg = normalizeSortConfig(sortConfig, fallbackKey);
    return [...rows].sort((a, b) => {
      const primary = compareSortValues(a.sort?.[cfg.key], b.sort?.[cfg.key]);
      if(primary !== 0) return cfg.dir === "asc" ? primary : -primary;
      return compareSortValues(a.sort?.name, b.sort?.name);
    });
  }

  function sortHeaderHtml(scope, sortConfig, key, label){
    const cfg = normalizeSortConfig(sortConfig, "name");
    const active = cfg.key === key;
    const icon = active ? (cfg.dir === "asc" ? "▲" : "▼") : "↕";
    return `
      <button class="sortbtn ${active ? "active" : ""}" type="button" data-sort-scope="${escapeHtml(scope)}" data-sort-key="${escapeHtml(key)}">
        <span>${escapeHtml(label)}</span>
        <span class="sortIcon" aria-hidden="true">${icon}</span>
      </button>
    `;
  }

  function toggleSort(scope, key){
    state.ui = state.ui || {};
    const current = normalizeSortConfig(state.ui[scope], "name");
    state.ui[scope] = (current.key === key)
      ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
      : { key, dir: "asc" };
  }

  function wireSortButtons(scope){
    if(!scope) return;
    scope.querySelectorAll("[data-sort-scope][data-sort-key]").forEach(btn => {
      btn.addEventListener("click", () => {
        toggleSort(btn.getAttribute("data-sort-scope"), btn.getAttribute("data-sort-key"));
        render();
      });
    });
  }

  // Simple seeded RNG for map generation
  function mulberry32(seed){
    let a = seed >>> 0;
    return function(){
      a += 0x6D2B79F5;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hasTrainingFlag(value){
    return value === true || value === 1 || value === 2 || value === "trained" || value === "expert";
  }

  function proficiencyClassIds(player){
    if(!player) return [];
    const startingClassId = player.startingClassId && CLASSES[player.startingClassId]
      ? player.startingClassId
      : mainClass(player);
    return startingClassId && CLASSES[startingClassId] ? [startingClassId] : [];
  }

  function canUseWeaponCategory(player, category){
    for(const cid of proficiencyClassIds(player)){
      const cls = CLASSES[cid];
      if(cls && cls.proficiencies && cls.proficiencies.weapons && hasTrainingFlag(cls.proficiencies.weapons[category])){
        return true;
      }
    }
    return false;
  }

  function canUseArmorCategory(player, category){
    for(const cid of proficiencyClassIds(player)){
      const cls = CLASSES[cid];
      if(cls && cls.proficiencies && cls.proficiencies.armor && hasTrainingFlag(cls.proficiencies.armor[category])){
        return true;
      }
    }
    return false;
  }

  function itemUsesProficiency(it){
    if(!it) return false;
    if(it.type === "weapon") return true;
    if(it.type === "armor") return true;
    if(it.type === "offhand") return true;
    if(it.category === "shield") return true;
    return false;
  }

  function isProficientWithItem(player, it){
    if(!it || !itemUsesProficiency(it)) return true;
    if(it.type === "weapon") return canUseWeaponCategory(player, it.category || "simple");
    if(it.category === "shield") return canUseArmorCategory(player, "shields");
    if(it.type === "offhand") return canUseArmorCategory(player, it.category || "shields");
    if(it.type === "armor") return canUseArmorCategory(player, it.category || "unarmored");
    return true;
  }

  function saveTrainingValue(player, saveId){
    let best = 0;
    for(const cid of proficiencyClassIds(player)){
      const cls = CLASSES[cid];
      const raw = Number(cls && cls.proficiencies && cls.proficiencies.saves ? cls.proficiencies.saves[saveId] : 0);
      if(Number.isFinite(raw)) best = Math.max(best, raw);
    }
    return best;
  }

  /********************************************************************
   * Game state (saveable)
   ********************************************************************/
  function defaultState(){
    return {
      version: 1,
      tab: "explore",
      player: null,
      world: {
        areaId: "town",
        day: 1,
        areas: {},
        areaUnlocks: defaultAreaUnlocks(),
        randomEvents: {
          minimumDay: RANDOM_EVENT_DAY_REQUIREMENT_DEFAULT,
          day: 0,
          dailyPool: []
        }
      },
      combat: null,
      ui: {
        selectedTile: null,
        skillDraft: {},
        levelUpOpen: false,
        levelUpDraft: {},
        shopMode: "buy",
        saveToolsVisible: false,
        mobileActionsVisible: false,
        mapCameraMode: MAP_CAMERA_MODES.fixed,
        logMode: GAME_CONFIG.defaultLogMode,
        mapViewByArea: {},
        inventorySort: { key:"name", dir:"asc" },
        shopBuySort: { key:"name", dir:"asc" },
        shopSellSort: { key:"name", dir:"asc" },
        combatNotice: null,
        randomEventPrompt: null
      },
      cooldowns: {
        shortRestReadyAt: 0
      },
      log: []
    };
  }

  function save(state){
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  }
  function load(){
    const raw = localStorage.getItem(SAVE_KEY);
    if(!raw) return null;
    try{ return JSON.parse(raw); }catch(e){ return null; }
  }
  function wipeSave(){
    localStorage.removeItem(SAVE_KEY);
  }

  function log(state, msg){
    const stamp = new Date().toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
    state.log.push(`[${stamp}] ${msg}`);
    if(state.log.length > 400) state.log.splice(0, state.log.length - 400);
  }

  /********************************************************************
   * Character creation: point-buy (compact widget)
   ********************************************************************/
  const POINT_BUY_TOTAL = 27;
  const POINT_BUY_COST = {8:0, 9:1, 10:2, 11:3, 12:4, 13:5, 14:7, 15:9};
  const STATS = ["STR","DEX","CON","INT","WIS","CHA"];

  const STAT_TOOLTIPS = {
    STR: "Strength — melee damage, carrying capacity (inventory slots), Athletics.",
    DEX: "Dexterity — Armor Class without armor, Reflex saves, ranged/finesse attacks, Stealth & Acrobatics.",
    CON: "Constitution — Hit Points and Fortitude saves.",
    INT: "Intelligence — skill points on level up (INT mod, min 1), Crafting.",
    WIS: "Wisdom — Will saves, Perception & Survival, and short-rest SP recovery.",
    CHA: "Charisma — Social skill modifier; shop prices scale with your Social skill (1% per Social modifier)."
  };

  const SKILL_TOOLTIPS = {
    Acrobatics: "Acrobatics (DEX) — balance, tumbling, escaping hazards; used for fleeing.",
    Athletics: "Athletics (STR) — climbing, swimming, jumping, grappling.",
    Crafting: "Crafting (INT) — making/repairing gear; used for gathering ore.",
    Perception: "Perception (WIS) — spotting threats and hidden things; used for Search scouting.",
    Social: "Social (CHA) — persuasion, deception, intimidation, negotiation.",
    Stealth: "Stealth (DEX) — moving quietly and staying hidden; used to avoid ambush on short rest.",
    Survival: "Survival (WIS) — tracking, foraging, navigating; used for gathering herbs/hide."
  };

  function skillTooltipHtml(skillId){
    const text = SKILL_TOOLTIPS[skillId] || "";
    if(!text) return "";
    return `
      <div style="font-weight:700; font-size:13px; margin-bottom:6px">${escapeHtml(skillId)}</div>
      <div class="small muted" style="line-height:1.45">${escapeHtml(text)}</div>
    `;
  }

  function pointCost(score){
    if(score < 8 || score > 15) return Infinity;
    return POINT_BUY_COST[score];
  }

  function totalPointCost(stats){
    let cost = 0;
    for(const s of STATS) cost += pointCost(stats[s]);
    return cost;
  }

  function startingSkillPointPoolForClass(classId, stats){
    const cls = CLASSES[classId] || CLASSES.Fighter;
    const intScore = stats && Number.isFinite(Number(stats.INT)) ? Number(stats.INT) : 8;
    return Math.max(0, Number(cls.baseSkillPoints || 0) + Math.max(0, statMod(intScore)));
  }

  function sanitizeSkillDraft(rawDraft){
    const validSkillIds = new Set(SKILLS.map(sk => sk.id));
    const source = (rawDraft && typeof rawDraft === "object") ? rawDraft : {};
    const draft = {};
    for(const [skillId, value] of Object.entries(source)){
      if(!validSkillIds.has(skillId)) continue;
      const next = Math.max(0, Math.trunc(Number(value || 0)));
      if(next > 0) draft[skillId] = next;
    }
    return draft;
  }

  function summarizeSkillDraft(rawDraft){
    return Object.entries(sanitizeSkillDraft(rawDraft))
      .filter(([, n]) => (n || 0) > 0)
      .map(([skillId, value]) => `${skillId} +${value}`);
  }

  function applySkillTrainingWithBudget(player, rawDraft, budget){
    if(!player) return { spent: 0, remaining: 0, applied: {} };

    const draft = sanitizeSkillDraft(rawDraft);
    let remaining = Math.max(0, Number(budget || 0));
    const applied = {};

    for(const sk of SKILLS){
      const requested = Math.max(0, Number(draft[sk.id] || 0));
      if(requested <= 0 || remaining <= 0) continue;

      const current = Math.max(0, Number(player.skillProficiency[sk.id] || 0));
      const room = Math.max(0, skillProficiencyCap(player, sk.id) - current);
      const add = Math.min(requested, room, remaining);
      if(add <= 0) continue;

      player.skillProficiency[sk.id] = current + add;
      remaining -= add;
      applied[sk.id] = add;
    }

    return { spent: Math.max(0, Number(budget || 0) - remaining), remaining, applied };
  }

  function applySkillDraftToPlayer(player, rawDraft){
    if(!player) return { spent: 0, applied: {} };

    const startingPool = Math.max(0, Number(player.skillPoints || 0));
    const result = applySkillTrainingWithBudget(player, rawDraft, startingPool);
    player.skillPoints = result.remaining;
    return { spent: result.spent, applied: result.applied };
  }

  const LEGACY_DEFAULT_ABILITY_BY_CLASS = Object.fromEntries(
    Object.values(CLASSES).map(cls => [cls.id, cls.startingAbility || null])
  );

  function defaultStartingAbilityIdForClass(classId){
    const cls = CLASSES[classId];
    const abilityId = cls && cls.startingAbility;
    return abilityId && ABILITIES[abilityId] ? abilityId : null;
  }

  function classOptionalAbilityIds(classId){
    const cls = CLASSES[classId];
    return cls && Array.isArray(cls.optionalAbilities)
      ? cls.optionalAbilities.filter(id => !!ABILITIES[id])
      : [];
  }

  function normalizeOptionalAbilityChoiceForClass(classId, abilityId){
    const optionIds = classOptionalAbilityIds(classId);
    if(!optionIds.length) return null;
    return optionIds.includes(abilityId) ? abilityId : optionIds[0];
  }

  function startingAbilityPackageForClass(classId, optionalAbilityId=null){
    const ids = [];
    const defaultId = defaultStartingAbilityIdForClass(classId);
    const optionalId = normalizeOptionalAbilityChoiceForClass(classId, optionalAbilityId);
    if(defaultId) ids.push(defaultId);
    if(optionalId) ids.push(optionalId);
    return [...new Set(ids.filter(id => !!ABILITIES[id]))];
  }

  function syncPlayerAbilityIdsForLevels(player, { grantMissingOptional=true } = {}){
    const abilitySet = new Set(Array.isArray(player && player.abilityIds)
      ? player.abilityIds.filter(id => !!ABILITIES[id])
      : []);

    for(const [classId, level] of Object.entries(player && player.levels || {})){
      if(Number(level || 0) < 1) continue;

      const defaultId = defaultStartingAbilityIdForClass(classId);
      if(defaultId) abilitySet.add(defaultId);

      if(grantMissingOptional){
        const optionalIds = classOptionalAbilityIds(classId);
        if(optionalIds.length && !optionalIds.some(id => abilitySet.has(id))){
          abilitySet.add(optionalIds[0]);
        }
      }
    }

    player.abilityIds = [...abilitySet];
    return player.abilityIds;
  }

  /********************************************************************
   * Player construction
   ********************************************************************/
  function createNewPlayer({name, raceId, classId, stats, abilityId=null, skillDraft=null}){
    const cls = CLASSES[classId];
    const conMod = statMod(stats.CON);
    const startingAbilityIds = startingAbilityPackageForClass(classId, abilityId);

    const baseHp = Math.max(1, cls.hpPerLevel + conMod);
    const baseSp = Math.max(1, cls.spPerLevel + Math.max(0, statMod(stats.WIS)));

    const levels = {};
    Object.keys(CLASSES).forEach(k => levels[k] = 0);
    levels[classId] = 1;

    const p = {
      name: name.trim(),
      raceId,
      startingClassId: classId,
      levels,
      abilityIds: startingAbilityIds,
      xp: 0,
      hp: { current: baseHp, max: baseHp },
      sp: { current: baseSp, max: baseSp },
      stats: {...stats},
      skillPoints: startingSkillPointPoolForClass(classId, stats), // pool for player to allocate now or later
      startingSkillId: cls.startingTrainedSkill || null,
      skillProficiency: Object.fromEntries(SKILLS.map(s => [s.id, 0])), // locked-in skill proficiency points
      damageResistance: createDamageResistanceMap(),
      statusEffects: [],
      moneyCp: 2000, // starting money: 20sp = 2gp (tweakable)
      inventory: [], // array of {itemId, qty}
      equipment: {
        mainHand: null,
        offHand: null,
        armor: null,
        accessory_1: null,
        accessory_2: null,
        accessory_3: null,
        accessory_4: null
      },
      discovered: {
        // placeholder for later
      }
    };

    // Starter kit (lightweight)
    // Everyone gets a dagger and potion; classes still receive one extra thematic weapon, but no weapon is auto-preferred.
    addItem(p, "dagger", 1);
    if(classId === "Fighter") addItem(p, "longsword", 1);
    if(classId === "Barbarian") addItem(p, "greataxe", 1);
    if(classId === "Monk") addItem(p, "quarterstaff", 1);
    if(classId === "Ranger"){
      addItem(p, "shortbow", 1);
      addItem(p, "arrows", 10);
    }
    if(classId === "Rogue") addItem(p, "shortsword", 1);
    addItem(p, "potion_healing", 1);
    addItem(p, "leather", 1);

    // Equip starter armor/weapon: equipped items are removed from inventory.
    const equipInitial = (slotId, iid) => {
      if(!iid) return;
      const it = getItem(iid);
      if(!canEquipToSlot(p, slotId, it)) return;
      if(hasItem(p, iid, 1)) removeItem(p, iid, 1);
      p.equipment[slotId] = iid;
    };
    if(canUseArmorCategory(p, "light")) equipInitial("armor", "leather");
    equipInitial("mainHand", "dagger");

    // Starting skill proficiency: +2 locked-in proficiency (does not spend skill points).
    if(cls.startingTrainedSkill){
      p.skillProficiency[cls.startingTrainedSkill] = 2;
    }

    applySkillDraftToPlayer(p, skillDraft);

    return p;
  }

  function totalLevel(player){
    return Object.values(player.levels).reduce((a,b)=>a+b,0);
  }

  function maxLevelCap(){
    return Math.max(1, Number(GAME_CONFIG.maxLevel || 10));
  }

  function isMaxLevel(player){
    return !!player && totalLevel(player) >= maxLevelCap();
  }

  function mainClass(player){
    // highest level class; tie -> first
    let best = null;
    for(const [k,v] of Object.entries(player.levels)){
      if(v <= 0) continue;
      if(!best || v > best.level) best = { id:k, level:v };
    }
    return best ? best.id : "—";
  }

  function addItem(player, itemId, qty=1){
    const it = getItem(itemId);
    if(qty <= 0) return;
    const existing = player.inventory.find(x => x.itemId === itemId);
    if(existing) existing.qty += qty;
    else player.inventory.push({ itemId, qty });
    // Keep stable order by name
    player.inventory.sort((a,b) => getItem(a.itemId).name.localeCompare(getItem(b.itemId).name));
  }

  function removeItem(player, itemId, qty=1){
    const idx = player.inventory.findIndex(x => x.itemId === itemId);
    if(idx < 0) return false;
    if(player.inventory[idx].qty < qty) return false;
    player.inventory[idx].qty -= qty;
    if(player.inventory[idx].qty <= 0) player.inventory.splice(idx,1);
    return true;
  }

  function hasItem(player, itemId, qty=1){
    const e = player.inventory.find(x => x.itemId === itemId);
    return e && e.qty >= qty;
  }

  /********************************************************************
   * Derived stats: AC, proficiencies, skills, saves, inventory slots
   ********************************************************************/
  function formatDamageTypeLabel(type){
    const raw = String(type || "").trim();
    if(!raw) return "—";
    return raw
      .split(/[_-]/g)
      .map(part => part ? (part.charAt(0).toUpperCase() + part.slice(1)) : "")
      .join(" ");
  }

  function formatPropertyLabel(prop){
    const raw = String(prop || "").trim();
    if(!raw) return "—";
    const lower = raw.toLowerCase();
    if(lower === "reach") return "Reach";
    if(lower === "two-hand") return "Two-hand";
    if(lower === "no-armor") return "No armor";
    if(lower === "ammo-arrow") return "Ammo (Arrow)";
    if(lower.startsWith("range:")) return `Range ${raw.split(":")[1] || ""}`.trim();
    if(lower.startsWith("versatile:")) return `Versatile (${String(raw.split(":")[1] || "").toUpperCase()})`;
    if(lower.startsWith("bundle:")) return `Bundle ×${raw.split(":")[1] || "1"}`;
    return formatDamageTypeLabel(raw.replace(/:/g, " "));
  }

  function createDamageResistanceMap(seed={}){
    const out = {};
    for(const type of DAMAGE_TYPES){
      const raw = Number(seed[type] || 0);
      out[type] = Math.max(0, Number.isFinite(raw) ? raw : 0);
    }
    return out;
  }

  function getAbility(abilityId){
    const ability = ABILITIES[abilityId];
    if(!ability) throw new Error("Unknown ability: " + abilityId);
    return ability;
  }

  function normalizeTagId(tag){
    return String(tag || "").trim().toLowerCase();
  }

  function playerAbilityIds(player){
    if(!player) return [];

    if(Array.isArray(player.abilityIds)){
      return [...new Set(player.abilityIds.filter(id => !!ABILITIES[id]))];
    }

    const ids = [];
    for(const [cid, lvl] of Object.entries(player.levels || {})){
      if((lvl || 0) <= 0) continue;
      const fallbackId = LEGACY_DEFAULT_ABILITY_BY_CLASS[cid];
      if(fallbackId && ABILITIES[fallbackId]) ids.push(fallbackId);
    }
    return [...new Set(ids)];
  }

  function hasAbilityUnlocked(player, abilityId){
    return playerAbilityIds(player).includes(abilityId);
  }

  function abilityDisabledReason(player, abilityId){
    if(!hasAbilityUnlocked(player, abilityId)) return "You do not have that ability.";
    const ability = getAbility(abilityId);
    const abilityTags = new Set((ability.tags || []).map(normalizeTagId));
    if(!abilityTags.size) return "";

    for(const effect of player && player.statusEffects || []){
      const disabledTags = Array.isArray(effect && effect.disabledAbilityTags) ? effect.disabledAbilityTags.map(normalizeTagId) : [];
      const matched = disabledTags.find(tag => abilityTags.has(tag));
      if(matched){
        return `${effect.name} prevents using ${formatDamageTypeLabel(matched)} abilities.`;
      }
    }
    return "";
  }

  function hasAbility(player, abilityId){
    return hasAbilityUnlocked(player, abilityId) && !abilityDisabledReason(player, abilityId);
  }

  function abilitySourceType(ability){
    if(!ability) return "misc";
    if(ability.sourceType) return ability.sourceType;
    return ability.classId ? "class" : "misc";
  }

  function abilitySourceLabel(ability){
    if(!ability) return "—";
    if(abilitySourceType(ability) === "skill") return `${ability.skillId || "Skill"} skill`;
    return ability.classId || "—";
  }

  function abilityBadgeHtml(abilityId, extraClass=""){
    const ability = getAbility(abilityId);
    return `<span class="badge abilityBadge ${extraClass}" data-ability="${escapeHtml(ability.id)}">${escapeHtml(ability.name)}</span>`;
  }

  function renderAbilityBadgeList(abilityIds, emptyText="No abilities"){
    const ids = (abilityIds || []).filter(Boolean);
    if(!ids.length) return `<span class="small muted">${escapeHtml(emptyText)}</span>`;
    return `<div class="badgeWrap">${ids.map(id => abilityBadgeHtml(id)).join("")}</div>`;
  }

  function renderPlayerAbilityBadgeList(player, { kind=null, sourceType=null, emptyText="No abilities" } = {}){
    const ids = playerAbilityIds(player).filter(id => {
      const ability = getAbility(id);
      if(kind && ability.kind !== kind) return false;
      if(sourceType && abilitySourceType(ability) !== sourceType) return false;
      return true;
    });
    return renderAbilityBadgeList(ids, emptyText);
  }

  function abilitySummaryText(ability){
    return String(ability && ability.summary || "")
      .replace(/\s*Cost\s+\d+\s+SP\.*/i, match => {
        const tail = match.replace(/^\s*Cost\s+\d+\s+SP\.\s*/i, "");
        return tail ? ` ${tail}` : "";
      })
      .replace(/\bLasts\s+\d+\s+rounds?\.\s*/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function abilityTooltipHtml(abilityId){
    const ability = getAbility(abilityId);
    const rows = [];
    const row = (k, v) => `<div class="trow"><div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(v)}</div></div>`;

    rows.push(row("Source", abilitySourceLabel(ability)));
    if(ability.unlockLevel != null) rows.push(row("Unlock", `Level ${ability.unlockLevel}`));
    rows.push(row("Type", ability.kind || "—"));
    rows.push(row("Scope", (ability.contexts || []).join(", ") || "—"));
    if(Array.isArray(ability.tags) && ability.tags.length) rows.push(row("Tags", ability.tags.join(", ")));

    return `
      <div style="font-weight:700; font-size:13px; margin-bottom:6px">${escapeHtml(ability.name)}</div>
      <div class="small muted" style="margin-bottom:8px; line-height:1.45">${escapeHtml(abilitySummaryText(ability))}</div>
      ${rows.join("")}
      ${Array.isArray(ability.details) && ability.details.length ? `<div class="small muted" style="margin-top:8px; line-height:1.45">${ability.details.map(line => `• ${escapeHtml(line)}`).join("<br/>")}</div>` : ""}
    `;
  }

  function statusEffectTooltipHtml(effect){
    const rows = [];
    const row = (k, v) => `<div class="trow"><div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(v)}</div></div>`;
    const durationLabel = effect.duration == null
      ? "Permanent"
      : `${effect.duration}/${effect.maxDuration ?? effect.duration} ${effect.durationUnit || (effect.durationMode === "move" ? "moves" : "turns")}`;
    rows.push(row("Duration", durationLabel));
    if(Array.isArray(effect.tags) && effect.tags.length) rows.push(row("Tags", effect.tags.join(", ")));
    if(Number(effect.modifiers && effect.modifiers.acModifier || 0) !== 0) rows.push(row("AC", fmtSigned(Number(effect.modifiers.acModifier || 0))));
    if(Number(effect.modifiers && effect.modifiers.attackRollModifier || 0) !== 0) rows.push(row("Attack", fmtSigned(Number(effect.modifiers.attackRollModifier || 0))));
    if(Number(effect.ongoingDamage || 0) > 0) rows.push(row("Per turn", `${effect.ongoingDamage} ${formatDamageTypeLabel(effect.ongoingDamageType || "damage")}`));
    if(Array.isArray(effect.disabledAbilityTags) && effect.disabledAbilityTags.length) rows.push(row("Disables", effect.disabledAbilityTags.map(formatDamageTypeLabel).join(", ")));
    rows.push(row("Ends on down", effect.expiresOnDown === false ? "No" : "Yes"));

    return `
      <div style="font-weight:700; font-size:13px; margin-bottom:6px">${escapeHtml(effect.name || effect.id || "Effect")}</div>
      <div class="small muted" style="margin-bottom:8px; line-height:1.45">${escapeHtml(effect.description || "")}</div>
      ${rows.join("")}
    `;
  }

  function normalizeSaveId(saveId){
    const raw = String(saveId || "").trim().toLowerCase();
    if(raw === "fortitude" || raw === "fort") return "fort";
    if(raw === "reflex" || raw === "ref") return "reflex";
    if(raw === "will") return "will";
    return raw;
  }

  function saveLabel(saveId){
    const key = normalizeSaveId(saveId);
    if(key === "fort") return "Fortitude";
    if(key === "reflex") return "Reflex";
    return "Will";
  }

  function creatureSaveDc(creature, saveId){
    const key = normalizeSaveId(saveId);
    const entries = Array.isArray(creature && creature.status) ? creature.status : [];
    const found = entries.find(entry => normalizeSaveId(entry && (entry.id || entry.label || entry.saveId || "")) === key);
    if(found && Number.isFinite(Number(found.dc))) return Number(found.dc);
    return 12 + (Math.max(0, Number(creature && creature.level || 0)) * 2);
  }

  function hasStatusEffect(entity, statusId){
    return Array.isArray(entity && entity.statusEffects) && entity.statusEffects.some(effect => (effect.templateId || effect.id) === statusId);
  }

  function findStatusEffect(entity, statusId){
    return Array.isArray(entity && entity.statusEffects) ? entity.statusEffects.find(effect => (effect.templateId || effect.id) === statusId) || null : null;
  }

  function removeStatusEffect(entity, statusId){
    if(!entity || !Array.isArray(entity.statusEffects)) return null;
    const idx = entity.statusEffects.findIndex(effect => (effect.templateId || effect.id) === statusId);
    if(idx < 0) return null;
    const [removed] = entity.statusEffects.splice(idx, 1);
    return removed || null;
  }

  function createStatusEffect(templateId, overrides={}){
    const template = STATUS_EFFECT_TEMPLATES[templateId];
    if(!template) throw new Error("Unknown status effect: " + templateId);

    const baseModifiers = template.modifiers || {};
    const overrideModifiers = overrides.modifiers || {};
    return normalizeStatusEffect({
      ...template,
      ...overrides,
      id: overrides.id || template.id,
      templateId: template.id,
      name: overrides.name || template.name,
      description: overrides.description || template.description,
      duration: overrides.duration == null ? template.duration : overrides.duration,
      maxDuration: overrides.maxDuration == null ? (overrides.duration == null ? template.duration : overrides.duration) : overrides.maxDuration,
      durationMode: overrides.durationMode || template.durationMode || "turn",
      durationUnit: overrides.durationUnit || template.durationUnit || ((overrides.durationMode || template.durationMode) === "move" ? "movements" : "turns"),
      tags: Array.isArray(overrides.tags) ? [...overrides.tags] : [...(template.tags || [])],
      disabledAbilityTags: Array.isArray(overrides.disabledAbilityTags) ? [...overrides.disabledAbilityTags] : [...(template.disabledAbilityTags || [])],
      ongoingDamage: overrides.ongoingDamage == null ? Number(template.ongoingDamage || 0) : Number(overrides.ongoingDamage || 0),
      ongoingDamageType: overrides.ongoingDamageType || template.ongoingDamageType || "",
      consumeOnAttack: overrides.consumeOnAttack !== undefined ? !!overrides.consumeOnAttack : !!template.consumeOnAttack,
      modifiers: {
        ...baseModifiers,
        ...overrideModifiers,
        resistances: {
          ...(baseModifiers.resistances || {}),
          ...(overrideModifiers.resistances || {})
        }
      },
      justApplied: overrides.justApplied !== undefined ? overrides.justApplied : (template.justApplied !== undefined ? template.justApplied : true)
    });
  }

  function createPoisonStatusEffect(x, duration=5){
    const dmg = Math.max(0, Number(x || 0));
    const dur = clamp(Number(duration || 5), 0, 5);
    return createStatusEffect("poison", {
      name: `Poison ${dmg}`,
      description: `Takes ${dmg} poison damage at the end of each turn for up to ${dur} turns. Leftover duration carries into exploration.`,
      duration: dur,
      maxDuration: dur,
      ongoingDamage: dmg,
      ongoingDamageType: "poison",
      justApplied: false
    });
  }

  function createBleedStatusEffect(x, duration=5){
    const dmg = Math.max(0, Number(x || 0));
    const dur = clamp(Number(duration || 5), 0, 5);
    return createStatusEffect("bleed", {
      name: `Bleed ${dmg}`,
      description: `Takes ${dmg} necrotic damage at the end of each turn for up to ${dur} turns. Leftover duration carries into exploration.`,
      duration: dur,
      maxDuration: dur,
      ongoingDamage: dmg,
      ongoingDamageType: "necrotic",
      justApplied: false
    });
  }

  function createHeadInjuryStatusEffect(turns){
    const dur = Math.max(0, Number(turns || 0));
    return createStatusEffect("head_injury", {
      name: `Head Injury ${dur}`,
      duration: dur,
      maxDuration: dur,
      description: `Disables abilities with the Head tag for ${dur} turn${dur === 1 ? "" : "s"}.`
    });
  }

  function createArmInjuryStatusEffect(turns){
    const dur = Math.max(0, Number(turns || 0));
    return createStatusEffect("arm_injury", {
      name: `Arm Injury ${dur}`,
      duration: dur,
      maxDuration: dur,
      description: `Disables abilities with the Arm tag for ${dur} turn${dur === 1 ? "" : "s"}.`
    });
  }

  function createLegInjuryStatusEffect(turns){
    const dur = Math.max(0, Number(turns || 0));
    return createStatusEffect("leg_injury", {
      name: `Leg Injury ${dur}`,
      duration: dur,
      maxDuration: dur,
      description: `Disables abilities with the Leg tag for ${dur} turn${dur === 1 ? "" : "s"}.`
    });
  }

  function normalizeStatusEffect(effect){
    const rawEffect = effect || {};
    const rawStatusId = rawEffect.templateId || rawEffect.id;
    const migratedEffect = rawStatusId === "brace_for_impact"
      ? {
          ...rawEffect,
          id: "tree_stance",
          templateId: "tree_stance",
          name: "Tree Stance",
          description: STATUS_EFFECT_TEMPLATES.tree_stance.description,
          tags: ["Buff", "Stance"],
          modifiers: {
            ...(rawEffect.modifiers || {}),
            resistances: {
              bludgeoning: 3,
              piercing: 3,
              slashing: 3,
              ...((rawEffect.modifiers || {}).resistances || {})
            }
          }
        }
      : rawStatusId === "marked_prey"
        ? {
            ...rawEffect,
            name: STATUS_EFFECT_TEMPLATES.marked_prey.name,
            description: STATUS_EFFECT_TEMPLATES.marked_prey.description,
            tags: STATUS_EFFECT_TEMPLATES.marked_prey.tags
          }
        : rawEffect;
    const modifiers = migratedEffect.modifiers || {};
    return {
      id: migratedEffect.id || migratedEffect.templateId,
      templateId: migratedEffect.templateId || migratedEffect.id,
      name: migratedEffect.name || migratedEffect.id || "Effect",
      description: migratedEffect.description || "",
      duration: migratedEffect.duration == null ? null : Math.max(0, Number(migratedEffect.duration || 0)),
      maxDuration: migratedEffect.maxDuration == null ? (migratedEffect.duration == null ? null : Math.max(0, Number(migratedEffect.duration || 0))) : Math.max(0, Number(migratedEffect.maxDuration || 0)),
      durationMode: migratedEffect.durationMode === "move" ? "move" : "turn",
      durationUnit: migratedEffect.durationUnit || (migratedEffect.durationMode === "move" ? "movements" : "turns"),
      tags: Array.isArray(migratedEffect.tags) ? [...migratedEffect.tags] : [],
      disabledAbilityTags: Array.isArray(migratedEffect.disabledAbilityTags) ? migratedEffect.disabledAbilityTags.map(normalizeTagId) : [],
      ongoingDamage: Math.max(0, Number(migratedEffect.ongoingDamage || 0)),
      ongoingDamageType: String(migratedEffect.ongoingDamageType || "").trim().toLowerCase(),
      consumeOnAttack: !!migratedEffect.consumeOnAttack,
      expiresOnDown: migratedEffect.expiresOnDown !== false,
      justApplied: !!migratedEffect.justApplied,
      modifiers: {
        acModifier: Number.isFinite(Number(modifiers.acModifier || 0)) ? Number(modifiers.acModifier || 0) : 0,
        attackRollModifier: Number.isFinite(Number(modifiers.attackRollModifier || 0)) ? Number(modifiers.attackRollModifier || 0) : 0,
        damageBonusMelee: Number.isFinite(Number(modifiers.damageBonusMelee || 0)) ? Number(modifiers.damageBonusMelee || 0) : 0,
        resistances: createDamageResistanceMap(modifiers.resistances || {})
      }
    };
  }

  function addOrRefreshStatusEffect(entity, effect){
    entity.statusEffects = Array.isArray(entity.statusEffects) ? entity.statusEffects : [];

    const normalized = normalizeStatusEffect(effect);
    if(effect && effect.justApplied === undefined && normalized.justApplied !== true && normalized.ongoingDamage <= 0){
      normalized.justApplied = true;
    }

    const key = normalized.templateId || normalized.id;
    const idx = entity.statusEffects.findIndex(existing => (existing.templateId || existing.id) === key);
    if(idx >= 0) entity.statusEffects[idx] = normalized;
    else entity.statusEffects.push(normalized);
    return normalized;
  }

  function effectAdvancesOnAction(effect, { isMovement=false } = {}){
    if(!effect || effect.duration == null) return false;
    if(effect.durationMode === "move") return !!isMovement;
    return true;
  }

  function advanceEntityStatusEffects(state, entity, { excludeTemplateIds=[], isMovement=false } = {}){
    if(!entity || !Array.isArray(entity.statusEffects) || !entity.statusEffects.length) return;

    const excluded = new Set(excludeTemplateIds || []);
    const ended = [];
    const kept = [];

    for(const effect of entity.statusEffects){
      const key = effect.templateId || effect.id;
      if(effect.duration == null || excluded.has(key)){
        kept.push(effect);
        continue;
      }

      if(!effectAdvancesOnAction(effect, { isMovement })){
        kept.push(effect);
        continue;
      }

      if(Number(effect.ongoingDamage || 0) > 0){
        const sourceLabel = `${effect.name} deals ${effect.ongoingDamage} ${effect.ongoingDamageType} damage.`;
        if(entity === state.player){
          const res = dealDamageToPlayer(state, effect.ongoingDamage, effect.ongoingDamageType || "force", { sourceLabel });
          if(res.defeated) return;
        }else if(state.combat && entity === state.combat.enemy){
          const res = dealDamageToEnemy(state, effect.ongoingDamage, effect.ongoingDamageType || "force", { sourceLabel });
          if(res.defeated) return;
        }
      }

      if(effect.justApplied){
        effect.justApplied = false;
        kept.push(effect);
        continue;
      }

      const nextDuration = Math.max(0, Number(effect.duration || 0) - 1);
      effect.duration = nextDuration;
      if(nextDuration <= 0){
        ended.push(effect);
        continue;
      }
      kept.push(effect);
    }

    entity.statusEffects = kept;
    for(const effect of ended){
      log(state, `${effect.name} ends.`);
    }
  }

  function advanceStatusEffectsAfterAction(state, { excludeTemplateIds=[], isMovement=false } = {}){
    advanceEntityStatusEffects(state, state.player, { excludeTemplateIds, isMovement });
  }

  function advanceEnemyStatusEffectsAfterTurn(state, { excludeTemplateIds=[] } = {}){
    if(!state.combat || !state.combat.enemy) return;
    advanceEntityStatusEffects(state, state.combat.enemy, { excludeTemplateIds, isMovement:false });
  }

  function clearTimedStatusEffectsOnDown(state){
    const player = state.player;
    if(!player || !Array.isArray(player.statusEffects) || !player.statusEffects.length) return;

    const removed = [];
    player.statusEffects = player.statusEffects.filter(effect => {
      if(effect.duration != null && effect.expiresOnDown !== false){
        removed.push(effect);
        return false;
      }
      return true;
    });

    for(const effect of removed){
      log(state, `${effect.name} ends because you were reduced to 0 HP.`);
    }
  }

  function totalDamageResistances(entity){
    const total = createDamageResistanceMap(entity && entity.damageResistance || {});
    for(const effect of entity && entity.statusEffects || []){
      const res = effect.modifiers && effect.modifiers.resistances ? effect.modifiers.resistances : null;
      if(!res) continue;
      for(const type of DAMAGE_TYPES){
        total[type] += Math.max(0, Number(res[type] || 0));
      }
    }
    return total;
  }

  function damageResistanceValue(entity, damageType){
    const key = String(damageType || "").trim().toLowerCase();
    const total = totalDamageResistances(entity);
    return Math.max(0, Number(total[key] || 0));
  }

  function statusModifierTotal(entity, key){
    return (entity && entity.statusEffects || []).reduce((sum, effect) => {
      const raw = Number(effect && effect.modifiers ? effect.modifiers[key] || 0 : 0);
      return sum + (Number.isFinite(raw) ? raw : 0);
    }, 0);
  }

  function renderStatusEffectBadges(entity, emptyText="No active effects", owner="player"){
    const effects = Array.isArray(entity && entity.statusEffects) ? entity.statusEffects : [];
    if(!effects.length) return `<span class="small muted">${escapeHtml(emptyText)}</span>`;
    return `<div class="badgeWrap">${effects.map(effect => `<span class="badge statusBadge" data-status-owner="${escapeHtml(owner)}" data-status-effect="${escapeHtml(effect.templateId || effect.id)}">${escapeHtml(effect.name)}${effect.duration != null ? ` (${effect.duration})` : ""}</span>`).join("")}</div>`;
  }

  function renderResistanceBadgeList(player, emptyText="No active resistances"){
    const total = totalDamageResistances(player);
    const parts = DAMAGE_TYPES
      .filter(type => Number(total[type] || 0) > 0)
      .map(type => `<span class="badge">${escapeHtml(formatDamageTypeLabel(type))} ${escapeHtml(String(total[type]))}</span>`);
    if(!parts.length) return `<span class="small muted">${escapeHtml(emptyText)}</span>`;
    return `<div class="badgeWrap">${parts.join("")}</div>`;
  }

  function dexCapFromArmor(armor){
    if(!armor) return 99;
    return typeof armor.dexCap === "number" ? armor.dexCap : 99;
  }

  function equippedCarryBonus(player, equipment=player.equipment){
    let bonus = 0;
    for(const iid of Object.values(equipment || {})){
      if(!iid || !ITEM_INDEX.has(iid)) continue;
      const item = getItem(iid);
      bonus += Math.max(0, Number(item.carryBonus || 0));
    }
    return bonus;
  }

  function calcAC(player){
    const dexVal = statMod(player.stats.DEX);
    const wisVal = statMod(player.stats.WIS);
    const armorId = player.equipment.armor;
    const armor = armorId ? getItem(armorId) : null;
    const shieldId = player.equipment.offHand;
    const shield = shieldId ? getItem(shieldId) : null;
    const monkUnarmoredDefense = hasAbility(player, "martial_arts") && (!armor || armor.category === "unarmored");

    let ac = 10;

    if(monkUnarmoredDefense){
      ac += dexVal + wisVal;
    }else if(armor && armor.type === "armor"){
      ac += armor.acBonus || 0;
      const cap = dexCapFromArmor(armor);
      ac += clamp(dexVal, -999, cap);
    }else{
      ac += dexVal;
    }

    if(shield && shield.category === "shield"){
      ac += shield.acBonus || 0;
    }

    ac += statusModifierTotal(player, "acModifier");
    return Math.max(0, ac);
  }

  function effectiveEnemyAC(enemy){
    return Math.max(0, Number(enemy && enemy.ac || 0) + statusModifierTotal(enemy, "acModifier"));
  }

  function effectiveEnemyAttackBonus(enemy){
    return Number(enemy && enemy.attackBonus || 0) + statusModifierTotal(enemy, "attackRollModifier");
  }

  function calcInventorySlots(player, { inventory=null, equipment=null } = {}){
    const inv = Array.isArray(inventory) ? inventory : (Array.isArray(player.inventory) ? player.inventory : []);
    const eq = equipment || player.equipment || {};
    const str = player.stats.STR;
    const baseMax = Math.max(1, 2 * Math.max(0, Math.floor(str)));
    const bonus = equippedCarryBonus(player, eq) + (hasAbility(player, "skill_athletics_pack_mule") ? 10 : 0);
    const max = Math.max(1, baseMax + bonus);
    const used = inv.reduce((a,e)=>a + Math.max(0, Number(e.qty || 0)), 0);
    return { used, max, baseMax, bonus };
  }

  function skillTotal(player, skillId){
    const sk = SKILLS.find(s => s.id === skillId);
    if(!sk) return 0;
    const ability = player.stats[sk.stat];
    const base = statMod(ability);
    const prof = player.skillProficiency[skillId] || 0;
    return base + prof;
  }

  function saveTotal(player, saveId){
    let abilityScore;
    if(saveId === "fort") abilityScore = player.stats.CON;
    else if(saveId === "reflex") abilityScore = player.stats.DEX;
    else abilityScore = player.stats.WIS;
    const base = statMod(abilityScore);
    return base + saveTrainingValue(player, saveId);
  }

  function upgradeDamageExprMinimum(expr, minSides){
    const m = String(expr || "").trim().match(/^(\d+)d(\d+)([+-]\d+)?$/i);
    if(!m) return expr;
    return `${m[1]}d${Math.max(Number(m[2]), Number(minSides || 0))}${m[3] || ""}`;
  }

  function hasWeaponProperty(weapon, propertyId){
    return !!(weapon && Array.isArray(weapon.properties) && weapon.properties.includes(propertyId));
  }

  function createUnarmedAttackProfile(player, { slotLabel="hand", nameOverride=null, sourceWeapon=null } = {}){
    const hasMartialArts = hasAbility(player, "martial_arts");
    const dmg = hasMartialArts ? "1d6" : "1d4";
    const dex = statMod(player.stats.DEX);
    const str = statMod(player.stats.STR);
    const abil = Math.max(str, dex);
    const statusAttackModifier = statusModifierTotal(player, "attackRollModifier");
    return {
      weapon: null,
      sourceWeapon,
      slot: slotLabel,
      weaponName: nameOverride || (hasMartialArts ? "Unarmed (Martial Arts)" : "Unarmed"),
      attackBonus: abil + statusAttackModifier,
      baseAttackBonus: abil,
      statusAttackModifier,
      attackAbilityMod: abil,
      damageExpr: dmg,
      damageType: "bludgeoning",
      tags: ["unarmed"],
      isMeleeWeapon: true,
      isAgileWeapon: false,
      usesDex: abil === dex,
      needsAmmo: false,
      ammoItemId: null,
      ammoCount: 0,
      outOfAmmo: false,
      usedWeaponDice: false
    };
  }

  function buildAttackProfile(player, weapon, { fallbackUnarmed=false, slotLabel="hand" } = {}){
    const hasMartialArts = hasAbility(player, "martial_arts");

    if((!weapon || weapon.type !== "weapon") && fallbackUnarmed){
      return createUnarmedAttackProfile(player, { slotLabel });
    }

    if(!weapon || weapon.type !== "weapon") return null;

    const props = weapon.properties || [];
    const isRanged = (weapon["Weapon type"] === "ranged");
    const dex = statMod(player.stats.DEX);
    const str = statMod(player.stats.STR);
    const statusAttackModifier = statusModifierTotal(player, "attackRollModifier");
    const ammoItemId = ammoItemIdForWeapon(weapon);
    const ammoCount = ammoItemId ? weaponAmmoCount(player, weapon) : 0;

    if(ammoItemId && ammoCount < 1 && fallbackUnarmed){
      return {
        ...createUnarmedAttackProfile(player, {
          slotLabel,
          nameOverride: `${weapon.name} (out of ammo → Unarmed)` ,
          sourceWeapon: weapon
        }),
        needsAmmo: true,
        ammoItemId,
        ammoCount,
        outOfAmmo: true
      };
    }

    const usesDex = isRanged || props.includes("finesse");
    const abil = usesDex ? Math.max(dex, str) : str;
    let damageExpr = weapon["Damage"];
    if(hasMartialArts && weapon.category === "simple"){
      damageExpr = upgradeDamageExprMinimum(damageExpr, 6);
    }

    return {
      weapon,
      sourceWeapon: weapon,
      slot: slotLabel,
      weaponName: weapon.name,
      attackBonus: abil + statusAttackModifier,
      baseAttackBonus: abil,
      statusAttackModifier,
      attackAbilityMod: abil,
      damageExpr,
      damageType: weapon["Damage type"],
      tags: props,
      isMeleeWeapon: weapon["Weapon type"] === "melee",
      isAgileWeapon: props.includes("agile"),
      usesDex,
      needsAmmo: !!ammoItemId,
      ammoItemId,
      ammoCount,
      outOfAmmo: false,
      usedWeaponDice: true
    };
  }

  function attackProfile(player){
    const weaponId = player.equipment.mainHand;
    const weapon = weaponId ? getItem(weaponId) : null;
    return buildAttackProfile(player, weapon, { fallbackUnarmed:true, slotLabel:"main hand" });
  }

  function offHandAttackProfile(player){
    const weaponId = player.equipment.offHand;
    const weapon = weaponId ? getItem(weaponId) : null;
    return buildAttackProfile(player, weapon, { fallbackUnarmed:false, slotLabel:"off hand" });
  }

  function hasEnemyTag(enemy, tag){
    const needle = String(tag || "").trim().toLowerCase();
    return Array.isArray(enemy && enemy.traits) && enemy.traits.some(trait => String(trait || "").trim().toLowerCase() === needle);
  }

  function meleeFlyingPenalty(attack, enemy, { ignorePenalty=false } = {}){
    if(ignorePenalty) return 0;
    if(!attack || !attack.weapon || !attack.isMeleeWeapon) return 0;
    if(!hasEnemyTag(enemy, "flying")) return 0;
    if(hasWeaponProperty(attack.weapon, "reach")) return 0;
    return -4;
  }

  function consumeAmmoForAttack(state, attack){
    if(!attack || !attack.needsAmmo) return;
    const ammoItem = attack.ammoItemId ? getItem(attack.ammoItemId) : null;
    const ammoName = ammoItem ? ammoItem.name.toLowerCase() : "ammo";
    const sourceName = attack.sourceWeapon ? attack.sourceWeapon.name : attack.weaponName;

    if(attack.outOfAmmo){
      log(state, `${sourceName} is out of ${ammoName}. This attack is treated as an unarmed strike.`);
      return;
    }

    removeItem(state.player, attack.ammoItemId, 1);
    const remaining = itemQuantity(state.player, attack.ammoItemId);
    log(state, `${sourceName} uses 1 ${ammoName.replace(/s$/, "")}. ${remaining} ${ammoName} remaining.`);
  }

  function hasDualAgileAttack(player){
    const main = attackProfile(player);
    const off = offHandAttackProfile(player);
    return !!(main && main.weapon && main.isAgileWeapon && off && off.weapon && off.isAgileWeapon);
  }

  /********************************************************************
   * Daily random events
   ********************************************************************/
  function shuffleCopy(items){
    const out = Array.isArray(items) ? items.slice() : [];
    for(let i=out.length - 1; i>0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function getRandomEventTemplate(eventId){
    const found = RANDOM_EVENT_TEMPLATES.find(entry => entry.id === eventId);
    if(!found) throw new Error("Unknown random event: " + eventId);
    return found;
  }

  function findRandomEventEntry(state, instanceId){
    const randomEvents = state && state.world && state.world.randomEvents;
    const dailyPool = randomEvents && Array.isArray(randomEvents.dailyPool) ? randomEvents.dailyPool : [];
    return dailyPool.find(entry => entry && entry.instanceId === instanceId) || null;
  }

  function ensureRandomEventState(state, { regenerateIfMissing=true } = {}){
    state.world = state.world || {};
    state.world.randomEvents = state.world.randomEvents && typeof state.world.randomEvents === "object"
      ? state.world.randomEvents
      : {};

    const randomEvents = state.world.randomEvents;
    randomEvents.minimumDay = Math.max(1, Number(randomEvents.minimumDay || RANDOM_EVENT_DAY_REQUIREMENT_DEFAULT));
    randomEvents.day = Math.max(0, Number(randomEvents.day || 0));
    randomEvents.dailyPool = Array.isArray(randomEvents.dailyPool)
      ? randomEvents.dailyPool
          .filter(entry => entry && typeof entry === "object")
          .map((entry, index) => {
            const fallbackTemplateId = RANDOM_EVENT_TEMPLATES[index % RANDOM_EVENT_TEMPLATES.length].id;
            const templateId = RANDOM_EVENT_TEMPLATES.some(template => template.id === entry.templateId)
              ? entry.templateId
              : fallbackTemplateId;
            return {
              instanceId: String(entry.instanceId || `day${state.world.day || 1}_${index}_${templateId}`),
              templateId,
              resolved: !!entry.resolved
            };
          })
      : [];

    if(regenerateIfMissing && (randomEvents.day !== state.world.day || randomEvents.dailyPool.length === 0)){
      regenerateDailyRandomEvents(state);
    }

    return randomEvents;
  }

  function regenerateDailyRandomEvents(state){
    const randomEvents = ensureRandomEventState(state, { regenerateIfMissing:false });
    const chosen = shuffleCopy(RANDOM_EVENT_TEMPLATES.map(entry => entry.id)).slice(0, Math.min(RANDOM_EVENT_DAILY_COUNT, RANDOM_EVENT_TEMPLATES.length));
    randomEvents.day = Math.max(1, Number(state.world.day || 1));
    randomEvents.dailyPool = chosen.map((templateId, index) => ({
      instanceId: `day${randomEvents.day}_${index}_${templateId}`,
      templateId,
      resolved: false
    }));
    if(state.ui) state.ui.randomEventPrompt = null;
    return randomEvents.dailyPool.length;
  }

  function remainingRandomEventsForDay(state){
    const randomEvents = ensureRandomEventState(state);
    return randomEvents.dailyPool.filter(entry => !entry.resolved).length;
  }

  function getActiveRandomEvent(state){
    if(!state || !state.ui || !state.ui.randomEventPrompt || !state.ui.randomEventPrompt.instanceId) return null;
    const entry = findRandomEventEntry(state, state.ui.randomEventPrompt.instanceId);
    if(!entry || entry.resolved){
      state.ui.randomEventPrompt = null;
      return null;
    }
    return {
      entry,
      template: getRandomEventTemplate(entry.templateId)
    };
  }

  function randomEventDc(state, template){
    const area = getArea(state.world.areaId);
    return Math.max(5, Number(template.dcBase || 10) + (Math.max(0, Number(area.level || 0)) * Math.max(0, Number(template.dcPerAreaLevel || 0))));
  }

  function canRandomEventsAppear(state){
    const randomEvents = ensureRandomEventState(state);
    return Math.max(1, Number(state.world.day || 1)) >= Math.max(1, Number(randomEvents.minimumDay || RANDOM_EVENT_DAY_REQUIREMENT_DEFAULT));
  }

  function hasBlockingCenterOverlay(state){
    return !!(state && state.ui && (state.ui.combatNotice || state.ui.randomEventPrompt));
  }

  function canTriggerRandomEventNow(state){
    if(!state || !state.player || state.combat) return false;
    if(hasBlockingCenterOverlay(state)) return false;
    const area = getArea(state.world.areaId);
    if(!area.map) return false;
    if(!canRandomEventsAppear(state)) return false;
    const tile = currentTile(state);
    if(!tile || !tile.revealed || tile.home) return false;
    if(tile.type !== "empty" && !tile.resolved) return false;
    return remainingRandomEventsForDay(state) > 0;
  }

  function maybeTriggerRandomEvent(state){
    if(!canTriggerRandomEventNow(state)) return false;
    if(Math.random() > RANDOM_EVENT_TRIGGER_CHANCE) return false;

    const randomEvents = ensureRandomEventState(state);
    const candidates = randomEvents.dailyPool.filter(entry => !entry.resolved);
    if(!candidates.length) return false;

    const entry = candidates[rollInt(0, candidates.length - 1)];
    const template = getRandomEventTemplate(entry.templateId);
    state.ui.randomEventPrompt = { instanceId: entry.instanceId };
    log(state, `A random event appears: ${template.title}.`);
    return true;
  }

  function applyRandomEventRewards(state, template){
    const rewards = [];

    if(Array.isArray(template.rewardCoins) && template.rewardCoins.length >= 2){
      const coins = rollInt(Number(template.rewardCoins[0] || 0), Number(template.rewardCoins[1] || 0));
      if(coins > 0){
        addCoins(state, coins);
        rewards.push(formatCoins(coins));
      }
    }

    if(Array.isArray(template.rewardItems)){
      for(const reward of template.rewardItems){
        if(!reward || !reward.id) continue;
        const chance = reward.chance == null ? 1 : Number(reward.chance || 0);
        if(Math.random() > chance) continue;
        const qtyRange = Array.isArray(reward.qty) ? reward.qty : [1, 1];
        const qty = rollInt(Number(qtyRange[0] || 1), Number(qtyRange[1] || qtyRange[0] || 1));
        if(qty <= 0) continue;
        addItem(state.player, reward.id, qty);
        rewards.push(`${qty}× ${getItem(reward.id).name}`);
      }
    }

    return rewards;
  }

  function resolveRandomEventAttempt(state){
    const active = getActiveRandomEvent(state);
    if(!active) return;

    const { entry, template } = active;
    const dc = randomEventDc(state, template);
    const roll = rollD20();
    const bonus = skillTotal(state.player, template.skill);
    const total = roll + bonus;

    entry.resolved = true;
    state.ui.randomEventPrompt = null;

    if(roll === 20 || total >= dc){
      const rewards = applyRandomEventRewards(state, template);
      const rewardText = rewards.length ? rewards.join(", ") : "no material reward";
      log(state, `${template.title}: ${template.skill} d20(${roll}) + ${bonus} = ${total} vs DC ${dc} → success. ${template.successText} Rewards: ${rewardText}.`);
      toast(`${template.title} cleared successfully.`, "good");
    }else{
      log(state, `${template.title}: ${template.skill} d20(${roll}) + ${bonus} = ${total} vs DC ${dc} → failure.`);
      const damage = rollDice(template.failDamage || "1d4");
      dealDamageToPlayer(state, damage, template.failDamageType || "bludgeoning", {
        sourceLabel: `${template.title}: ${template.failureText}`
      });
      toast(`${template.title} check failed.`, "bad");
    }

    save(state);
    render();
  }

  function ignoreRandomEvent(state){
    const active = getActiveRandomEvent(state);
    if(!active) return;

    active.entry.resolved = true;
    state.ui.randomEventPrompt = null;
    log(state, `${active.template.title}: you leave it alone and move on.`);
    save(state);
    render();
  }

  function setCombatNotice(state, { kind="neutral", title="Notice", summary="", sectionTitle="Outcome", items=[] } = {}){
    state.ui.combatNotice = {
      kind,
      title,
      summary,
      sectionTitle,
      items: Array.isArray(items) ? items : []
    };
  }

  function dismissCombatNotice(state){
    if(!state || !state.ui || !state.ui.combatNotice) return;
    state.ui.combatNotice = null;
    save(state);
    render();
  }

  /********************************************************************
   * World / map generation
   ********************************************************************/
  function getArea(areaId){
    const a = AREAS.find(x => x.id === areaId);
    if(!a) throw new Error("Unknown area: " + areaId);
    return a;
  }

  function defaultAreaUnlocks(){
    return { woods:true };
  }

  function isAreaUnlocked(state, areaId){
    if(areaId === "town" || areaId === "woods") return true;
    return !!(state && state.world && state.world.areaUnlocks && state.world.areaUnlocks[areaId]);
  }

  function unlockArea(state, areaId){
    if(!state || !state.world || areaId === "town" || areaId === "woods") return;
    if(!state.world.areaUnlocks || typeof state.world.areaUnlocks !== "object") state.world.areaUnlocks = defaultAreaUnlocks();
    state.world.areaUnlocks[areaId] = true;
  }

  function visibleTravelAreas(state){
    return AREAS.filter(area => area.id === state.world.areaId || isAreaUnlocked(state, area.id));
  }

  function travelAreaLabel(area){
    const meta = [`Lv ${area.level}`];
    if(area.map && Number(area.travelCostCp) === 0) meta.push("Free");
    return `${area.name} (${meta.join(" • ")})`;
  }

  function dungeonLinksForArea(areaId){
    return DUNGEON_LINKS.filter(link => link.sourceAreaId === areaId);
  }

  function dungeonEntranceLinkForArea(areaId){
    return DUNGEON_LINKS.find(link => link.targetAreaId === areaId) || null;
  }

  function areaTileSeed(areaState, x, y){
    const seed = Number(areaState && areaState.seed || 0) >>> 0;
    return (((seed ^ (((x + 1) * 374761393) >>> 0)) >>> 0) ^ (((y + 1) * 668265263) >>> 0)) >>> 0;
  }

  function randomTerrainForTile(rng){
    const tr = rng();
    return (tr < 0.34) ? "forest" : (tr < 0.68) ? "plains" : "dirt";
  }

  function makeRandomAreaTile(areaState, areaDef, x, y, options={}){
    const opts = options && typeof options === "object" ? options : {};
    const rng = mulberry32(areaTileSeed(areaState, x, y));
    const terrain = randomTerrainForTile(rng);
    const tile = { revealed:false, resolved:false, type:"empty", content:null, terrain, home:false };

    if(opts.isStart){
      tile.home = true;
      tile.resolved = true;
      return tile;
    }

    const r = rng();
    if(r < 0.13){
      tile.type = "monster";
      tile.content = areaDef.encounterPool[Math.floor(rng() * areaDef.encounterPool.length)];
    }else if(r < 0.28){
      tile.type = "resource";
      tile.content = areaDef.resourcePool[Math.floor(rng() * areaDef.resourcePool.length)];
    }else if(r < 0.32){
      tile.type = "treasure";
      tile.content = null;
    }

    return tile;
  }

  function cloneAreaTile(tile){
    const cloned = tile && typeof tile === "object" ? { ...tile } : { revealed:false, resolved:false, type:"empty", content:null };
    cloned.revealed = !!cloned.revealed;
    cloned.resolved = !!cloned.resolved;
    cloned.type = cloned.type || "empty";
    cloned.content = cloned.content == null ? null : cloned.content;
    cloned.home = !!cloned.home;
    cloned.arrivalX = Number.isFinite(Number(cloned.arrivalX)) ? Number(cloned.arrivalX) : null;
    cloned.arrivalY = Number.isFinite(Number(cloned.arrivalY)) ? Number(cloned.arrivalY) : null;
    cloned.linkedDungeonAreaId = cloned.linkedDungeonAreaId || null;
    return cloned;
  }

  function resizeAreaState(areaState, areaDef, targetSize){
    const oldTiles = Array.isArray(areaState && areaState.tiles) ? areaState.tiles : [];
    const oldSize = Math.max(0, Number(areaState && areaState.size || 0) || oldTiles.length || 0);
    const offsetX = oldSize > 0 ? (Math.floor(targetSize / 2) - Math.floor(oldSize / 2)) : 0;
    const offsetY = oldSize > 0 ? (Math.floor(targetSize / 2) - Math.floor(oldSize / 2)) : 0;

    const newTiles = [];
    for(let y=0; y<targetSize; y++){
      const row = [];
      for(let x=0; x<targetSize; x++){
        row.push(makeRandomAreaTile(areaState, areaDef, x, y));
      }
      newTiles.push(row);
    }

    for(let y=0; y<oldTiles.length; y++){
      const sourceRow = Array.isArray(oldTiles[y]) ? oldTiles[y] : [];
      for(let x=0; x<sourceRow.length; x++){
        const nx = x + offsetX;
        const ny = y + offsetY;
        if(nx < 0 || ny < 0 || nx >= targetSize || ny >= targetSize) continue;
        newTiles[ny][nx] = cloneAreaTile(sourceRow[x]);
      }
    }

    const oldPx = Number.isFinite(Number(areaState && areaState.px)) ? Number(areaState.px) : Math.floor(oldSize / 2);
    const oldPy = Number.isFinite(Number(areaState && areaState.py)) ? Number(areaState.py) : Math.floor(oldSize / 2);
    areaState.tiles = newTiles;
    areaState.size = targetSize;
    areaState.px = clamp(oldPx + offsetX, 0, targetSize - 1);
    areaState.py = clamp(oldPy + offsetY, 0, targetSize - 1);
  }

  function applySpecialTiles(areaState, areaDef){
    if(!areaState || !Array.isArray(areaState.tiles)) return;
    const size = Math.max(1, Number(areaState.size || areaDef.size || 9) || 9);

    for(let y=0; y<size; y++){
      if(!areaState.tiles[y]) areaState.tiles[y] = [];
      for(let x=0; x<size; x++){
        if(!areaState.tiles[y][x]) areaState.tiles[y][x] = makeRandomAreaTile(areaState, areaDef, x, y);
        const tile = areaState.tiles[y][x];
        tile.revealed = !!tile.revealed;
        tile.resolved = !!tile.resolved;
        tile.type = tile.type || "empty";
        tile.content = tile.content == null ? null : tile.content;
        tile.home = false;
        tile.arrivalX = null;
        tile.arrivalY = null;
        tile.linkedDungeonAreaId = null;
        if(!tile.terrain) tile.terrain = makeRandomAreaTile(areaState, areaDef, x, y).terrain;
        if(tile.type === "dungeon"){
          tile.type = "empty";
          tile.content = null;
          tile.resolved = false;
        }
      }
    }

    const hx = Math.floor(size / 2);
    const hy = Math.floor(size / 2);
    const homeTile = areaState.tiles[hy][hx];
    const entranceLink = dungeonEntranceLinkForArea(areaDef.id);
    homeTile.home = true;
    homeTile.type = entranceLink ? "dungeon" : "empty";
    homeTile.content = entranceLink ? entranceLink.sourceAreaId : null;
    homeTile.arrivalX = entranceLink ? entranceLink.x : null;
    homeTile.arrivalY = entranceLink ? entranceLink.y : null;
    homeTile.linkedDungeonAreaId = entranceLink ? areaDef.id : null;
    homeTile.resolved = true;
    homeTile.revealed = true;

    for(const link of dungeonLinksForArea(areaDef.id)){
      if(link.x < 0 || link.y < 0 || link.x >= size || link.y >= size) continue;
      const tile = areaState.tiles[link.y][link.x];
      tile.home = false;
      tile.type = "dungeon";
      tile.content = link.targetAreaId;
      tile.arrivalX = null;
      tile.arrivalY = null;
      tile.linkedDungeonAreaId = link.targetAreaId;
      tile.resolved = false;
      if(link.terrain) tile.terrain = link.terrain;
    }
  }

  function ensureAreaGenerated(state, areaId){
    const areaDef = getArea(areaId);
    if(!areaDef.map) return;

    if(!state.world.areas[areaId]){
      const size = Math.max(1, Number(areaDef.size || 9) || 9);
      const seed = (Date.now() ^ (Math.random() * 1e9) | 0) >>> 0;
      state.world.areas[areaId] = {
        seed,
        size,
        px: Math.floor(size / 2),
        py: Math.floor(size / 2),
        tiles: []
      };
      generateMap(state.world.areas[areaId], areaDef);
    }else{
      normalizeAreaState(state.world.areas[areaId], areaDef);
    }
  }

  function normalizeAreaState(areaState, areaDef){
    if(!areaState) return;
    if(!Number.isFinite(Number(areaState.seed))) areaState.seed = (Date.now() ^ (Math.random() * 1e9) | 0) >>> 0;

    const existingRows = Array.isArray(areaState.tiles) ? areaState.tiles.length : 0;
    const recordedSize = Math.max(0, Number(areaState.size || 0) || 0);
    const currentSize = Math.max(existingRows, recordedSize);
    const targetSize = Math.max(1, Number(areaDef.size || currentSize || 9) || 9);

    if(currentSize <= 0){
      areaState.size = targetSize;
      areaState.px = Math.floor(targetSize / 2);
      areaState.py = Math.floor(targetSize / 2);
      generateMap(areaState, areaDef);
      return;
    }

    if(currentSize < targetSize || existingRows < targetSize || areaState.tiles.some(row => !Array.isArray(row) || row.length < targetSize)){
      resizeAreaState(areaState, areaDef, targetSize);
    }else{
      areaState.size = currentSize;
    }

    areaState.px = clamp(Number.isFinite(Number(areaState.px)) ? Number(areaState.px) : Math.floor(areaState.size / 2), 0, areaState.size - 1);
    areaState.py = clamp(Number.isFinite(Number(areaState.py)) ? Number(areaState.py) : Math.floor(areaState.size / 2), 0, areaState.size - 1);
    applySpecialTiles(areaState, areaDef);
  }

  function moveAreaPlayerToTile(areaState, areaDef, x, y){
    if(!areaState) return;
    normalizeAreaState(areaState, areaDef);
    const size = areaState.size || areaDef.size || 9;
    const tx = clamp(Number.isFinite(Number(x)) ? Number(x) : Math.floor(size / 2), 0, size - 1);
    const ty = clamp(Number.isFinite(Number(y)) ? Number(y) : Math.floor(size / 2), 0, size - 1);
    areaState.px = tx;
    areaState.py = ty;
    if(areaState.tiles && areaState.tiles[ty] && areaState.tiles[ty][tx]){
      const tile = areaState.tiles[ty][tx];
      tile.revealed = true;
      if(tile.home) tile.resolved = true;
    }
  }

  function moveAreaPlayerToHomeTile(areaState, areaDef){
    if(!areaState) return;
    const size = areaState.size || areaDef.size || 9;
    moveAreaPlayerToTile(areaState, areaDef, Math.floor(size / 2), Math.floor(size / 2));
  }

  function refreshAllMapEncounters(state){
    let refreshed = 0;
    for(const areaDef of AREAS){
      if(!areaDef.map) continue;
      const areaState = state.world.areas[areaDef.id];
      if(!areaState || !Array.isArray(areaState.tiles)) continue;
      normalizeAreaState(areaState, areaDef);
      for(let y=0; y<areaState.tiles.length; y++){
        for(let x=0; x<(areaState.tiles[y] || []).length; x++){
          const tile = areaState.tiles[y][x];
          if(!tile || tile.home || tile.type !== "monster") continue;
          tile.content = areaDef.encounterPool[rollInt(0, areaDef.encounterPool.length - 1)];
          tile.resolved = false;
          refreshed++;
        }
      }
    }
    return refreshed;
  }

  function generateMap(areaState, areaDef){
    const size = Math.max(1, Number(areaState.size || areaDef.size || 9) || 9);
    areaState.size = size;
    areaState.px = clamp(Number.isFinite(Number(areaState.px)) ? Number(areaState.px) : Math.floor(size / 2), 0, size - 1);
    areaState.py = clamp(Number.isFinite(Number(areaState.py)) ? Number(areaState.py) : Math.floor(size / 2), 0, size - 1);
    areaState.tiles = [];

    for(let y=0; y<size; y++){
      const row = [];
      for(let x=0; x<size; x++){
        row.push(makeRandomAreaTile(areaState, areaDef, x, y, { isStart: x === areaState.px && y === areaState.py }));
      }
      areaState.tiles.push(row);
    }

    applySpecialTiles(areaState, areaDef);
  }

  function tileSymbol(tile){
    if(!tile.revealed) return MAP_ICONS.unknown;
    if(tile.home && tile.type === "dungeon") return MAP_ICONS.dungeon;
    if(tile.home) return MAP_ICONS.home;
    if(tile.type === "dungeon") return MAP_ICONS.dungeon;
    if(tile.type === "monster" && !tile.resolved) return MAP_ICONS.monster;
    if(tile.type === "resource" && !tile.resolved) return MAP_ICONS.resource;
    if(tile.type === "treasure" && !tile.resolved) return MAP_ICONS.treasure;
    return "";
  }


  function parseCssPx(value, fallback=0){
    const parsed = Number.parseFloat(String(value || "").trim());
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function cameraModeLabel(mode){
    return mode === MAP_CAMERA_MODES.follow ? "Follow Map Mode" : "Fixed Map Mode";
  }

  function renderMapLegend(){
    const items = [
      { icon: MAP_ICONS.player, label: "player" },
      { icon: MAP_ICONS.unknown, label: "unknown" },
      { icon: MAP_ICONS.home, label: "home" },
      { icon: MAP_ICONS.dungeon, label: "dungeon" },
      { icon: MAP_ICONS.monster, label: "monster" },
      { icon: MAP_ICONS.resource, label: "resource" },
      { icon: MAP_ICONS.treasure, label: "treasure" },
      { terrain: "forest", label: "forest" },
      { terrain: "plains", label: "plains" },
      { terrain: "dirt", label: "dirt" },
      { terrain: "water", label: "water" },
      { terrain: "mountain", label: "mountain" }
    ];
    return items.map(item => {
      if(item.terrain){
        return `
          <span class="legendItem legendTerrain"><span class="legendSwatch terrain-${item.terrain}" aria-hidden="true"></span><span>${escapeHtml(item.label)}</span></span>
        `;
      }
      return `
        <span class="legendItem"><span class="legendIcon" aria-hidden="true">${item.icon}</span><span>${escapeHtml(item.label)}</span></span>
      `;
    }).join("");
  }

  function responsiveMapCellBounds(){
    return {
      min: window.innerWidth <= 640 ? 22 : MAP_MIN_CELL_SIZE
    };
  }

  function maxTilesThatFit(availableSpace, padding, gap, cellSize){
    const innerSpace = Math.max(0, Math.floor(availableSpace) - padding);
    if(innerSpace <= 0) return 1;
    return Math.max(1, Math.floor((innerSpace + gap) / (cellSize + gap)));
  }

  function mapSpanPixels(count, cellSize, gap, padding){
    if(count <= 0) return padding;
    return padding + (count * cellSize) + (Math.max(0, count - 1) * gap);
  }

  function computeMapViewportLayout(areaState, mapPaneEl, mapViewportEl){
    const size = Math.max(1, Number(areaState && areaState.size || 0) || 1);
    const styles = getComputedStyle(mapViewportEl);
    const gap = parseCssPx(styles.getPropertyValue("--map-gap"), 4);
    const paddingX = parseCssPx(styles.paddingLeft, 0) + parseCssPx(styles.paddingRight, 0);
    const paddingY = parseCssPx(styles.paddingTop, 0) + parseCssPx(styles.paddingBottom, 0);
    const bounds = responsiveMapCellBounds();
    const availableWidth = Math.max(1, Math.floor(mapViewportEl.clientWidth || mapPaneEl.clientWidth || 0));
    const viewportTop = mapViewportEl.getBoundingClientRect().top;
    const availableHeight = Math.max(1, Math.floor(window.innerHeight - viewportTop - MAP_VIEWPORT_MARGIN));
    const maxVisible = Math.max(1, Number(MAP_MAX_VISIBLE_TILES || 9));

    let cols = Math.min(size, maxVisible, maxTilesThatFit(availableWidth, paddingX, gap, bounds.min));
    cols = clamp(cols, 1, Math.min(size, maxVisible));

    const widthInnerSpace = Math.max(0, availableWidth - paddingX - Math.max(0, cols - 1) * gap);
    const maxWidthCellSize = widthInnerSpace > 0 ? (widthInnerSpace / cols) : 1;
    const cellSize = Math.max(1, Math.floor(maxWidthCellSize * MAP_WIDTH_SCALE_RATIO));

    let rows = Math.min(size, maxVisible, maxTilesThatFit(availableHeight, paddingY, gap, cellSize));
    rows = clamp(rows, 1, Math.min(size, maxVisible));

    return {
      cols,
      rows,
      cellSize,
      gap,
      gridWidth: mapSpanPixels(cols, cellSize, gap, 0),
      gridHeight: mapSpanPixels(rows, cellSize, gap, 0),
      height: mapSpanPixels(rows, cellSize, gap, paddingY)
    };
  }

  let teardownExploreViewportSync = null;
  let activeExploreViewportRefresh = null;

  function clearExploreViewportSync(){
    activeExploreViewportRefresh = null;
    if(typeof teardownExploreViewportSync === "function"){
      const cleanup = teardownExploreViewportSync;
      teardownExploreViewportSync = null;
      try{ cleanup(); }catch(_){ /* ignore */ }
    }
  }

  function setExploreViewportSync(refreshViewport, mapPaneEl, mapViewportEl, mapEl){
    clearExploreViewportSync();

    let rafId = 0;
    const schedule = () => {
      if(rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        if(state && state.player && state.tab === "explore" && document.getElementById("map") === mapEl){
          refreshViewport();
        }
      });
    };

    activeExploreViewportRefresh = schedule;

    const onResize = () => schedule();
    const visualViewport = window.visualViewport || null;

    window.addEventListener("orientationchange", onResize);
    if(visualViewport) visualViewport.addEventListener("resize", onResize);

    let observer = null;
    if(typeof ResizeObserver !== "undefined"){
      observer = new ResizeObserver(() => schedule());
      [mapPaneEl, mapViewportEl].filter(Boolean).forEach(el => observer.observe(el));
    }

    teardownExploreViewportSync = () => {
      activeExploreViewportRefresh = null;
      if(rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("orientationchange", onResize);
      if(visualViewport) visualViewport.removeEventListener("resize", onResize);
      if(observer) observer.disconnect();
    };
  }

  function centeredMapOrigin(areaState, cols, rows){
    const maxX = Math.max(0, areaState.size - cols);
    const maxY = Math.max(0, areaState.size - rows);
    return {
      x: clamp(areaState.px - Math.floor(cols / 2), 0, maxX),
      y: clamp(areaState.py - Math.floor(rows / 2), 0, maxY)
    };
  }

  function ensureMapViewState(state, areaId){
    if(!state.ui.mapViewByArea || typeof state.ui.mapViewByArea !== "object") state.ui.mapViewByArea = {};
    if(!state.ui.mapViewByArea[areaId] || typeof state.ui.mapViewByArea[areaId] !== "object"){
      state.ui.mapViewByArea[areaId] = {};
    }
    return state.ui.mapViewByArea[areaId];
  }

  function computeVisibleMapWindow(state, areaId, areaState, cols, rows){
    const size = Math.max(1, Number(areaState && areaState.size || 0) || 1);
    const maxX = Math.max(0, size - cols);
    const maxY = Math.max(0, size - rows);

    if(state.ui.mapCameraMode !== MAP_CAMERA_MODES.follow){
      const centered = centeredMapOrigin(areaState, cols, rows);
      ensureMapViewState(state, areaId);
      state.ui.mapViewByArea[areaId] = { x:centered.x, y:centered.y, cols, rows };
      return { ...centered, cols, rows };
    }

    const stored = ensureMapViewState(state, areaId);
    const fallback = centeredMapOrigin(areaState, cols, rows);
    let x = Number.isFinite(Number(stored.x)) ? clamp(Number(stored.x), 0, maxX) : fallback.x;
    let y = Number.isFinite(Number(stored.y)) ? clamp(Number(stored.y), 0, maxY) : fallback.y;

    if(areaState.px < x) x = areaState.px;
    if(areaState.px > x + cols - 1) x = areaState.px - cols + 1;
    if(areaState.py < y) y = areaState.py;
    if(areaState.py > y + rows - 1) y = areaState.py - rows + 1;

    const bufferX = Math.min(FOLLOW_CAMERA_EDGE_BUFFER, Math.floor((cols - 1) / 2));
    const bufferY = Math.min(FOLLOW_CAMERA_EDGE_BUFFER, Math.floor((rows - 1) / 2));

    const leftEdge = x + bufferX;
    const rightEdge = x + cols - 1 - bufferX;
    const topEdge = y + bufferY;
    const bottomEdge = y + rows - 1 - bufferY;

    if(areaState.px < leftEdge) x = areaState.px - bufferX;
    if(areaState.px > rightEdge) x = areaState.px - (cols - 1 - bufferX);
    if(areaState.py < topEdge) y = areaState.py - bufferY;
    if(areaState.py > bottomEdge) y = areaState.py - (rows - 1 - bufferY);

    x = clamp(x, 0, maxX);
    y = clamp(y, 0, maxY);

    state.ui.mapViewByArea[areaId] = { x, y, cols, rows };
    return { x, y, cols, rows };
  }

  function isImpassableTerrain(terrain){
    return terrain === "water" || terrain === "mountain";
  }

  function isDirectionBlocked(state, dx, dy){
    const areaId = state.world.areaId;
    const aDef = getArea(areaId);
    if(!aDef.map) return true;
    const aState = state.world.areas[areaId];
    if(!aState) return true;

    const size = aState.size || aDef.size || 9;
    const nx = aState.px + dx;
    const ny = aState.py + dy;
    if(nx < 0 || ny < 0 || nx >= size || ny >= size) return true;
    const row = aState.tiles[ny];
    const t = row ? row[nx] : null;
    if(!t) return true;
    return isImpassableTerrain(t.terrain);
  }

  function currentTile(state){
    const areaId = state.world.areaId;
    const aDef = getArea(areaId);
    if(!aDef.map) return null;
    const aState = state.world.areas[areaId];
    return aState.tiles[aState.py][aState.px];
  }

  function currentDungeonDestination(state){
    const tile = currentTile(state);
    if(!tile || tile.type !== "dungeon" || !tile.content) return null;
    try{
      return {
        area: getArea(tile.content),
        arrivalX: Number.isFinite(Number(tile.arrivalX)) ? Number(tile.arrivalX) : null,
        arrivalY: Number.isFinite(Number(tile.arrivalY)) ? Number(tile.arrivalY) : null,
        linkedDungeonAreaId: tile.linkedDungeonAreaId || null
      };
    }catch(_){
      return null;
    }
  }

  function dungeonEnterLabel(destination){
    const area = destination && destination.area ? destination.area : destination;
    return area ? `Enter ${area.name} (Level ${area.level})` : "Enter Dungeon";
  }

  function isOnHomeTile(state){
    const areaId = state.world.areaId;
    const aDef = getArea(areaId);
    if(!aDef.map) return false;
    const t = currentTile(state);
    return !!(t && t.home);
  }

  function canTravelNow(state){
    if(state.combat) return false;
    // Town is always a valid travel hub; wilderness maps require standing on the home tile.
    if(state.world.areaId === "town") return true;
    return isOnHomeTile(state);
  }

  function travelTo(state, targetAreaId, options={}){
    const opts = options && typeof options === "object" ? options : {};
    const viaDungeon = !!opts.viaDungeon;
    const bypassTravelRequirement = !!opts.bypassTravelRequirement;
    const arrivalX = Number.isFinite(Number(opts.arrivalX)) ? Number(opts.arrivalX) : null;
    const arrivalY = Number.isFinite(Number(opts.arrivalY)) ? Number(opts.arrivalY) : null;

    if(state.combat || hasBlockingCenterOverlay(state)) return;
    if(targetAreaId === state.world.areaId) return;

    const targetArea = getArea(targetAreaId);
    if(!viaDungeon && !isAreaUnlocked(state, targetAreaId)){
      log(state, `${targetArea.name} has not been discovered yet.`);
      return;
    }
    if(!bypassTravelRequirement && !canTravelNow(state)){
      log(state, "You can only travel from the Town tile (🏘️).");
      return;
    }

    if(targetArea.map) unlockArea(state, targetAreaId);
    state.world.areaId = targetAreaId;
    ensureAreaGenerated(state, targetAreaId);
    if(targetArea.map){
      const areaState = state.world.areas[targetAreaId];
      if(arrivalX != null && arrivalY != null) moveAreaPlayerToTile(areaState, targetArea, arrivalX, arrivalY);
      else moveAreaPlayerToHomeTile(areaState, targetArea);
      state.ui.selectedTile = { x: areaState.px, y: areaState.py };
    }else{
      state.ui.selectedTile = null;
    }
    state.tab = "explore";
    log(state, `${viaDungeon ? "You enter" : "You travel to"} ${targetArea.name}.`);
    advanceStatusEffectsAfterAction(state);
    save(state);
    render();
  }

  function movePlayer(state, dx, dy){
    if(state.combat || hasBlockingCenterOverlay(state)) return;

    const areaId = state.world.areaId;
    const aDef = getArea(areaId);
    if(!aDef.map) return;

    const aState = state.world.areas[areaId];
    const nx = aState.px + dx;
    const ny = aState.py + dy;
    if(nx < 0 || ny < 0 || nx >= aState.size || ny >= aState.size) return;

    const nextTile = aState.tiles[ny][nx];
    const wasRevealed = !!nextTile.revealed;
    if(isImpassableTerrain(nextTile.terrain)) {
      log(state, "That way is blocked by impassable terrain.");
      return;
    }

    aState.px = nx;
    aState.py = ny;

    const tile = aState.tiles[ny][nx];
    tile.revealed = true;
    state.ui.selectedTile = {x:nx, y:ny};

    const quietStepActive = hasStatusEffect(state.player, "quiet_step");

    if(tile.type === "monster" && !tile.resolved){
      if(quietStepActive){
        const monster = getMonster(tile.content);
        log(state, `Quiet Step lets you slip into ${monster.name}'s tile without triggering combat.`);
      }else{
        startEncounter(state, tile.content);
        if(state.combat && wasRevealed && hasAbility(state.player, "hunting")){
          log(state, `Hunting lets you strike first against the ${state.combat.enemy.name}.`);
          resolvePlayerAttack(state, { prefix: "Hunting — free attack. " });
          if(state.combat) state.combat.turn = "player";
        }
      }
    }else if(tile.type === "treasure" && !tile.resolved){
      openTreasure(state, aDef, tile);
    }

    advanceStatusEffectsAfterAction(state, { isMovement:true });
    maybeTriggerRandomEvent(state);
    save(state);
    render();
  }

  function openTreasure(state, areaDef, tile){
    const [lo, hi] = areaDef.treasureRange || [20, 120];
    let coins = rollInt(lo, hi);
    const doubled = hasAbility(state.player, "skill_perception_treasure_hunter");
    if(doubled) coins *= 2;
    addCoins(state, coins);
    tile.resolved = true;
    log(state, `You discover a small cache and gain ${formatCoins(coins)}${doubled ? " (Treasure Hunter doubled it)" : ""}.`);
  }

  function gatherResource(state){
    if(state.combat || hasBlockingCenterOverlay(state)) return;
    const tile = currentTile(state);
    if(!tile || tile.type !== "resource" || tile.resolved) return;

    if(state.player.sp.current <= 0){
      log(state, "You are too exhausted to gather resources. (Need SP)");
      return;
    }
    state.player.sp.current -= 1;

    // Simple skill check using Survival or Crafting depending on resource
    const resId = tile.content;
    const res = getItem(resId);
    const skill = (resId === "ore") ? "Crafting" : "Survival";
    const check = rollD20() + skillTotal(state.player, skill);
    const dc = 12 + getArea(state.world.areaId).level * 2;
    let qty = (check >= dc + 10) ? rollInt(2,3) : (check >= dc) ? rollInt(1,2) : 1;
    const doubled = hasAbility(state.player, "skill_survival_gatherers_bounty");
    if(doubled) qty *= 2;

    addItem(state.player, resId, qty);
    tile.resolved = true;
    log(state, `You gather ${qty}× ${res.name}. (${skill} check ${check} vs DC ${dc})${doubled ? " Gatherer's Bounty doubles the haul." : ""}`);
    advanceStatusEffectsAfterAction(state);
    save(state);
    render();
  }

  function searchTile(state){
    if(hasBlockingCenterOverlay(state)) return;
    const areaDef = getArea(state.world.areaId);
    if(!areaDef.map) return;
    if(state.player.sp.current <= 0){
      log(state, "Not enough SP.");
      return;
    }
    state.player.sp.current -= 1;

    const aState = state.world.areas[state.world.areaId];
    const baseDc = 11 + areaDef.level * 2;
    const huntingBonus = hasAbility(state.player, "hunting") ? 2 : 0;
    const keenSearchBonus = hasAbility(state.player, "skill_perception_keen_search") ? 4 : 0;
    const treasureHunterRadiusBonus = hasAbility(state.player, "skill_perception_treasure_hunter") ? 1 : 0;
    const eagleEyeRadius = (hasAbility(state.player, "eagle_eye") ? 2 : 1) + treasureHunterRadiusBonus;
    const mod = skillTotal(state.player, "Perception") + huntingBonus + keenSearchBonus;

    let checks = 0;
    let newlyRevealed = 0;

    for(let dy=-eagleEyeRadius; dy<=eagleEyeRadius; dy++){
      for(let dx=-eagleEyeRadius; dx<=eagleEyeRadius; dx++){
        const x = aState.px + dx;
        const y = aState.py + dy;
        if(x < 0 || y < 0 || x >= aState.size || y >= aState.size) continue;

        const t = aState.tiles[y][x];
        const dc = baseDc + (t.terrain === "forest" ? 1 : 0);

        const roll = rollD20();
        const total = roll + mod;
        checks++;

        if(!t.revealed && (roll === 20 || total >= dc)){
          t.revealed = true;
          newlyRevealed++;
        }
      }
    }

    if(newlyRevealed > 0){
      log(state, `You search nearby tiles (radius ${eagleEyeRadius}): ${checks} check(s), revealed ${newlyRevealed} tile(s). (Perception mod ${fmtSigned(mod)}${huntingBonus ? `, including Hunting ${fmtSigned(huntingBonus)}` : ""}${keenSearchBonus ? `, Keen Search ${fmtSigned(keenSearchBonus)}` : ""}; base DC ${baseDc}, forest +1)`);
    }else{
      log(state, `You search nearby tiles (radius ${eagleEyeRadius}): ${checks} check(s), revealed nothing new. (Perception mod ${fmtSigned(mod)}${huntingBonus ? `, including Hunting ${fmtSigned(huntingBonus)}` : ""}${keenSearchBonus ? `, Keen Search ${fmtSigned(keenSearchBonus)}` : ""}; base DC ${baseDc}, forest +1)`);
    }

    advanceStatusEffectsAfterAction(state);
    save(state);
    render();
  }

/********************************************************************
   * Combat
   ********************************************************************/
  function getMonster(monsterId){
    const m = MONSTERS.find(x => x.id === monsterId);
    if(!m) throw new Error("Unknown monster: " + monsterId);
    return m;
  }

  function startEncounter(state, monsterId){
    const m = getMonster(monsterId);
    state.combat = {
      enemy: {
        id: m.id,
        name: m.name,
        level: m.level,
        hp: { current: m.hp, max: m.hp },
        ac: m.ac,
        attackBonus: m.attackBonus,
        damage: m.damage,
        damageType: m.damageType,
        loot: m.loot,
        traits: Array.isArray(m.traits) ? [...m.traits] : [],
        status: Array.isArray(m.status) ? m.status.map(entry => ({ ...entry, dc: Number(entry.dc || 0) })) : [],
        statusEffects: []
      },
      turn: "player",
      lastRolls: [],
      playerFlags: {}
    };
    log(state, `Encounter! A ${m.name} appears.`);

    if(hasAbility(state.player, "short_fuse") && !hasStatusEffect(state.player, "enrage")){
      const fuseRoll = rollInt(1, 4);
      if(fuseRoll === 4){
        applyEnrageStatus(state, "Short Fuse triggers: you become Enraged for free.");
      }else{
        log(state, `Short Fuse does not trigger. (d4 ${fuseRoll})`);
      }
    }

    if(hasAbility(state.player, "ambush")){
      addOrRefreshStatusEffect(state.combat.enemy, createStatusEffect("off_guard"));
      log(state, `Ambush leaves ${state.combat.enemy.name} Off-Guard as combat begins.`);
    }

    if(state.combat && hasAbility(state.player, "skill_social_menacing_presence")){
      const roll = rollD20();
      const total = roll + skillTotal(state.player, "Social");
      const dc = creatureSaveDc(state.combat.enemy, "will");
      if(roll === 20 || total >= dc){
        addOrRefreshStatusEffect(state.combat.enemy, createStatusEffect("off_guard"));
        log(state, `Menacing Presence: Social d20(${roll}) + ${skillTotal(state.player, "Social")} = ${total} vs Will DC ${dc} → success. ${state.combat.enemy.name} becomes Off-Guard.`);
      }else{
        log(state, `Menacing Presence: Social d20(${roll}) + ${skillTotal(state.player, "Social")} = ${total} vs Will DC ${dc} → failure.`);
      }
    }

    toast(`Encounter! ${m.name}`, "bad");
    state.tab = "combat";
    save(state);
  }

  function endCombat(state, victory){
    const enemy = state.combat.enemy;
    if(victory){
      const rewards = [];
      const xpGain = enemy.level * 35;
      state.player.xp += xpGain;
      rewards.push(`${xpGain} XP`);
      log(state, `You defeat the ${enemy.name} and gain ${xpGain} XP.`);

      const monsterLootDoubled = hasAbility(state.player, "skill_stealth_monster_plunder");

      if(enemy.loot && enemy.loot.coins){
        const [lo, hi] = enemy.loot.coins;
        let coins = rollInt(lo, hi);
        if(monsterLootDoubled) coins *= 2;
        addCoins(state, coins);
        rewards.push(formatCoins(coins));
        log(state, `Loot: ${formatCoins(coins)}${monsterLootDoubled ? " (Monster Plunder doubled it)" : ""}.`);
      }

      if(enemy.loot && enemy.loot.items){
        for(const drop of enemy.loot.items){
          if(Math.random() <= drop.chance){
            let q = rollInt(drop.qty[0], drop.qty[1]);
            if(monsterLootDoubled) q *= 2;
            addItem(state.player, drop.id, q);
            rewards.push(`${q}× ${getItem(drop.id).name}`);
            log(state, `Loot: ${q}× ${getItem(drop.id).name}${monsterLootDoubled ? " (Monster Plunder doubled it)" : ""}.`);
          }
        }
      }

      if(hasAbility(state.player, "skill_survival_field_dressing")){
        const heal = Math.max(1, enemy.level + statMod(state.player.stats.WIS));
        const before = state.player.hp.current;
        state.player.hp.current = clamp(state.player.hp.current + heal, 0, state.player.hp.max);
        const healed = state.player.hp.current - before;
        rewards.push(`${healed} HP recovered`);
        log(state, `Field Dressing restores ${healed} HP after the fight.`);
      }

      const tile = currentTile(state);
      if(tile && tile.type === "monster"){
        tile.resolved = true;
      }

      setCombatNotice(state, {
        kind: "good",
        title: "Victory",
        summary: `You defeated the ${enemy.name}.`,
        sectionTitle: "Rewards",
        items: rewards.length ? rewards : ["No additional rewards."]
      });
    }else{
      log(state, `You escape from the ${enemy.name}.`);
      setCombatNotice(state, {
        kind: "neutral",
        title: "Escape",
        summary: `You escaped from the ${enemy.name}.`,
        sectionTitle: "Outcome",
        items: ["No rewards or losses were applied."]
      });
    }

    state.combat = null;
    if(state.tab === "combat") state.tab = "explore";
    save(state);
  }

  function handlePlayerDefeat(state){
    clearTimedStatusEffectsOnDown(state);
    log(state, "TESTING MODE, DEATH PENALTIES WILL BE RE-IMPLEMENTED LATER PROBABLY");
    state.world.areaId = "town";
    state.combat = null;
    state.tab = "explore";
    state.player.hp.current = state.player.hp.max;
    state.player.sp.current = state.player.sp.max;
    setCombatNotice(state, {
      kind: "neutral",
      title: "YOU DIED.",
      summary: "TESTING MODE, DEATH PENALTIES WILL BE RE-IMPLEMENTED LATER PROBABLY",
      sectionTitle: "Outcome",
      items: [
        "No death penalties were applied.",
        "Returned to Astaria.",
        `Recovered to ${state.player.hp.current}/${state.player.hp.max} HP`,
        `Recovered to ${state.player.sp.current}/${state.player.sp.max} SP`
      ]
    });
    save(state);
    return { defeated:true };
  }

  function dealDamageToEnemy(state, amount, damageType, { sourceLabel="" } = {}){
    if(!state.combat || !state.combat.enemy) return { damage:0, defeated:false };
    const enemy = state.combat.enemy;
    const dmg = Math.max(0, Number(amount || 0));
    enemy.hp.current = clamp(enemy.hp.current - dmg, 0, enemy.hp.max);
    if(sourceLabel){
      log(state, `${sourceLabel} ${enemy.name} takes ${dmg} ${damageType} damage.`);
    }
    if(enemy.hp.current <= 0){
      endCombat(state, true);
      return { damage:dmg, defeated:true };
    }
    return { damage:dmg, defeated:false };
  }

  function dealDamageToPlayer(state, amount, damageType, { sourceLabel="", applyResistance=true } = {}){
    const raw = Math.max(0, Number(amount || 0));
    const resistance = applyResistance ? damageResistanceValue(state.player, damageType) : 0;
    const reduced = Math.min(raw, resistance);
    const dmg = Math.max(0, raw - reduced);
    state.player.hp.current = clamp(state.player.hp.current - dmg, 0, state.player.hp.max);
    if(sourceLabel){
      log(state, `${sourceLabel} You take ${dmg} ${damageType} damage${reduced > 0 ? ` (reduced by ${reduced} resistance)` : ""}.`);
    }
    if(state.player.hp.current <= 0){
      handlePlayerDefeat(state);
      return { damage:dmg, reduced, defeated:true };
    }
    return { damage:dmg, reduced, defeated:false };
  }

  function activeMeleeDamageBonus(player, attack){
    if(!attack || !attack.weapon || !attack.isMeleeWeapon) return 0;
    return (player.statusEffects || []).reduce((sum, effect) => {
      const bonus = effect && effect.modifiers ? Number(effect.modifiers.damageBonusMelee || 0) : 0;
      return sum + (Number.isFinite(bonus) ? bonus : 0);
    }, 0);
  }

  function hasEquippedShield(player){
    const shieldId = player && player.equipment ? player.equipment.offHand : null;
    if(!shieldId || !ITEM_INDEX.has(shieldId)) return false;
    const item = getItem(shieldId);
    return item && item.category === "shield";
  }

  function canUseActiveAbility(state, abilityId){
    const ability = getAbility(abilityId);
    if(ability.kind !== "active") return { ok:false, reason:"That is not an active ability." };
    if(!hasAbilityUnlocked(state.player, abilityId)) return { ok:false, reason:"You do not know that ability." };

    const disabledReason = abilityDisabledReason(state.player, abilityId);
    if(disabledReason) return { ok:false, reason:disabledReason };

    const contexts = Array.isArray(ability.contexts) ? ability.contexts : [];
    if(state.combat){
      if(!contexts.includes("combat")) return { ok:false, reason:"You can only use that outside combat." };
      if(state.combat.turn !== "player") return { ok:false, reason:"It is not your turn." };
    }else{
      if(!contexts.includes("exploration")) return { ok:false, reason:"You can only use that in combat." };
    }

    if(Number(ability.costSp || 0) > state.player.sp.current) return { ok:false, reason:"Not enough SP." };
    if(abilityId === "enrage" && hasStatusEffect(state.player, "enrage")) return { ok:false, reason:"You are already enraged." };
    if(abilityId === "quiet_step" && hasStatusEffect(state.player, "quiet_step")) return { ok:false, reason:"Quiet Step is already active." };
    return { ok:true, reason:"" };
  }

  function resolvePlayerAttack(state, {
    prefix="",
    attack=null,
    attackBonusModifier=0,
    extraDamageOnHit=0,
    ignoreFlyingPenalty=false
  } = {}){
    if(!state.combat) return { usedAction:false, enemyDefeated:false, hit:false, outcome:null, damage:0, attack:null };

    const enemy = state.combat.enemy;
    const ap = attack || attackProfile(state.player);
    if(!ap) return { usedAction:false, enemyDefeated:false, hit:false, outcome:null, damage:0, attack:null };

    consumeAmmoForAttack(state, ap);

    const situational = [];
    let attackBonus = Number(ap.attackBonus || 0) + Number(attackBonusModifier || 0);
    if(Number(attackBonusModifier || 0) !== 0) situational.push(`Ability ${fmtSigned(Number(attackBonusModifier || 0))}`);

    const flyingPenalty = meleeFlyingPenalty(ap, enemy, { ignorePenalty:ignoreFlyingPenalty });
    if(flyingPenalty !== 0){
      attackBonus += flyingPenalty;
      situational.push(`Flying ${fmtSigned(flyingPenalty)}`);
    }

    const enemyAc = effectiveEnemyAC(enemy);
    const roll = rollD20();
    const total = roll + attackBonus;

    let outcome = "miss";
    if(roll === 1){
      outcome = "critfail";
    }else if(roll === 20 || total >= enemyAc){
      outcome = (roll === 20) ? "crit" : "hit";
    }

    const hit = outcome === "hit" || outcome === "crit";
    const extras = [...situational];
    let dmg = 0;

    if(hit){
      const base = rollDice(ap.damageExpr);
      const dmgMod = Number(ap.attackAbilityMod || 0);
      const meleeBonus = activeMeleeDamageBonus(state.player, ap);
      const overpowerBonus = hasAbility(state.player, "skill_athletics_overpower") && ap.isMeleeWeapon && (hasStatusEffect(enemy, "off_guard") || hasStatusEffect(enemy, "prone")) ? 2 : 0;
      const hunterMarkBonus = hasStatusEffect(enemy, "marked_prey") ? rollDice("1d4") : 0;
      const bonusDamage = Number(extraDamageOnHit || 0) + overpowerBonus + hunterMarkBonus;
      dmg = base + dmgMod + meleeBonus + bonusDamage;
      if(outcome === "crit") dmg = (base * 2) + (dmgMod * 2) + (meleeBonus * 2) + (bonusDamage * 2);

      if(meleeBonus > 0) extras.push(`Enrage ${fmtSigned(meleeBonus)}`);
      if(overpowerBonus > 0) extras.push(`Overpower ${fmtSigned(overpowerBonus)}`);
      if(hunterMarkBonus > 0) extras.push(`Hunter's Mark +${hunterMarkBonus}${outcome === "crit" ? " (doubled on crit)" : ""}`);
      if(Number(extraDamageOnHit || 0) !== 0) extras.push(`Ability damage ${fmtSigned(Number(extraDamageOnHit || 0))}`);

      if(hasAbility(state.player, "sneak_attack") && ap.isAgileWeapon){
        const sneakRoll = rollD20();
        const sneakTotal = sneakRoll + statMod(state.player.stats.DEX);
        const sneakDc = 10 + enemy.level;
        if(sneakRoll === 20 || sneakTotal >= sneakDc){
          const sneakDmg = rollDice("1d6");
          dmg += sneakDmg;
          extras.push(`Sneak Attack +${sneakDmg} (DEX ${sneakTotal} vs DC ${sneakDc})`);
        }else{
          extras.push(`Sneak Attack failed (DEX ${sneakTotal} vs DC ${sneakDc})`);
        }
      }

      enemy.hp.current = clamp(enemy.hp.current - dmg, 0, enemy.hp.max);
    }

    if(state.combat && state.combat.enemy && hasAbility(state.player, "frothing_rage") && hasStatusEffect(state.player, "enrage")){
      const frothRoll = rollD20();
      const frothTotal = frothRoll + skillTotal(state.player, "Social");
      const frothDc = creatureSaveDc(state.combat.enemy, "will");
      if(frothRoll !== 20 && frothTotal < frothDc){
        addOrRefreshStatusEffect(state.combat.enemy, createStatusEffect("off_guard"));
        extras.push(`Frothing Rage Off-Guard (Social ${frothTotal} vs DC ${frothDc})`);
      }else{
        extras.push(`Frothing Rage no effect (Social ${frothTotal} vs DC ${frothDc})`);
      }
    }

    if(hit && state.combat && state.combat.enemy && hasStatusEffect(state.player, "river_stance") && (ap.tags || []).includes("unarmed")){
      const riverRoll = rollD20();
      const riverTotal = riverRoll + skillTotal(state.player, "Acrobatics");
      const riverDc = creatureSaveDc(state.combat.enemy, "reflex");
      if(riverRoll === 20 || riverTotal >= riverDc){
        addOrRefreshStatusEffect(state.combat.enemy, createStatusEffect("off_guard"));
        extras.push(`River Stance Off-Guard (Acrobatics ${riverTotal} vs DC ${riverDc})`);
      }else{
        extras.push(`River Stance failed (Acrobatics ${riverTotal} vs DC ${riverDc})`);
      }
    }

    if(hasStatusEffect(state.player, "cover_step")){
      removeStatusEffect(state.player, "cover_step");
      extras.push("Cover Step consumed");
    }

    if(!hit){
      log(state, `${prefix}You attack with ${ap.weaponName}: d20(${roll}) + ${attackBonus} = ${total} vs AC ${enemyAc} → miss${extras.length ? ` [${extras.join("; ")}]` : ""}.`);
      return { usedAction:true, enemyDefeated:false, hit:false, outcome, damage:0, attack:ap, roll, attackBonus, total, enemyAc };
    }

    log(state, `${prefix}You attack with ${ap.weaponName}: d20(${roll}) + ${attackBonus} = ${total} vs AC ${enemyAc} → ${outcome}. Damage: ${dmg} ${ap.damageType}${extras.length ? ` [${extras.join("; ")}]` : ""}.`);

    if(enemy.hp.current <= 0){
      endCombat(state, true);
      return { usedAction:true, enemyDefeated:true, hit:true, outcome, damage:dmg, attack:ap, roll, attackBonus, total, enemyAc };
    }

    return { usedAction:true, enemyDefeated:false, hit:true, outcome, damage:dmg, attack:ap, roll, attackBonus, total, enemyAc };
  }

  function playerAttack(state){
    if(!state.combat || state.combat.turn !== "player") return;

    const mainResult = resolvePlayerAttack(state);
    let usedAction = mainResult.usedAction;

    if(state.combat && !mainResult.enemyDefeated && hasDualAgileAttack(state.player)){
      const offHand = offHandAttackProfile(state.player);
      if(offHand){
        const penalizedAttack = {
          ...offHand,
          attackBonus: Number(offHand.attackBonus || 0) - 4
        };
        const offResult = resolvePlayerAttack(state, {
          attack: penalizedAttack,
          prefix: "Off-hand follow-up. "
        });
        usedAction = usedAction || offResult.usedAction;
      }
    }

    if(usedAction) advanceStatusEffectsAfterAction(state);
    if(state.combat) enemyTurn(state);
    else save(state);
    render();
  }

  function enemyTurn(state){
    if(!state.combat) return;
    const enemy = state.combat.enemy;

    const roll = rollD20();
    const ac = calcAC(state.player);
    const attackBonus = effectiveEnemyAttackBonus(enemy);
    const total = roll + attackBonus;

    let outcome = "miss";
    if(roll === 1){
      outcome = "critfail";
    }else if(roll === 20 || total >= ac){
      outcome = (roll === 20) ? "crit" : "hit";
    }

    const maybeResolveGuardStrike = () => {
      if(!state.combat || !hasStatusEffect(state.player, "guard_strike_ready")) return false;
      removeStatusEffect(state.player, "guard_strike_ready");
      log(state, "Guard Strike triggers.");
      const res = resolvePlayerAttack(state, {
        prefix: "Guard Strike — free counter. ",
        ignoreFlyingPenalty: true
      });
      return !!res.enemyDefeated;
    };

    if(outcome === "miss" || outcome === "critfail"){
      log(state, `${enemy.name} attacks: d20(${roll}) + ${attackBonus} = ${total} vs AC ${ac} → miss.`);

      if(hasAbility(state.player, "parry") && state.combat){
        addOrRefreshStatusEffect(state.combat.enemy, createStatusEffect("off_guard"));
        log(state, `Parry leaves ${state.combat.enemy.name} Off-Guard.`);
      }

      if(hasStatusEffect(state.player, "spike_lure") && state.combat){
        const spikeDmg = rollDice("1d4");
        const res = dealDamageToEnemy(state, spikeDmg, "piercing", { sourceLabel:"Spike Lure:" });
        if(res.defeated){
          save(state);
          render();
          return;
        }
      }

      if(maybeResolveGuardStrike()){
        save(state);
        render();
        return;
      }

      if(state.combat && hasAbility(state.player, "aggressive_block") && hasEquippedShield(state.player) && (ac - total) > 8){
        log(state, "Aggressive Block triggers.");
        const res = resolvePlayerAttack(state, { prefix:"Aggressive Block — free attack. " });
        if(res.enemyDefeated){
          save(state);
          render();
          return;
        }
      }

      advanceEnemyStatusEffectsAfterTurn(state);
      if(!state.combat){
        save(state);
        render();
        return;
      }
      state.combat.turn = "player";
      save(state);
      render();
      return;
    }

    const base = rollDice(enemy.damage);
    let dmg = base;
    if(outcome === "crit") dmg = base * 2;

    let cloudReduction = 0;
    if(hasStatusEffect(state.player, "cloud_stance")){
      cloudReduction = rollDice("1d4");
      dmg = Math.max(0, dmg - cloudReduction);
    }

    let defensiveRollReduction = 0;
    if(dmg > 0 && hasAbility(state.player, "skill_acrobatics_defensive_roll") && !(state.combat.playerFlags && state.combat.playerFlags.defensiveRollUsed)){
      defensiveRollReduction = rollDice("1d6");
      dmg = Math.max(0, dmg - defensiveRollReduction);
      state.combat.playerFlags = state.combat.playerFlags || {};
      state.combat.playerFlags.defensiveRollUsed = true;
    }

    const resistance = damageResistanceValue(state.player, enemy.damageType);
    const reduced = Math.min(dmg, resistance);
    dmg = Math.max(0, dmg - reduced);

    state.player.hp.current = clamp(state.player.hp.current - dmg, 0, state.player.hp.max);
    log(state, `${enemy.name} attacks: d20(${roll}) + ${attackBonus} = ${total} vs AC ${ac} → ${outcome}. You take ${dmg} ${enemy.damageType}${cloudReduction > 0 ? ` (Cloud Stance reduced ${cloudReduction})` : ""}${defensiveRollReduction > 0 ? `${cloudReduction > 0 ? ";" : " ("}Defensive Roll reduced ${defensiveRollReduction}${cloudReduction > 0 ? "" : ")"}` : ""}${reduced > 0 ? `${cloudReduction > 0 || defensiveRollReduction > 0 ? ";" : ""} reduced by ${reduced} resistance` : ""}.`);

    if(state.player.hp.current <= 0){
      handlePlayerDefeat(state);
      save(state);
      render();
      return;
    }

    if(hasAbility(state.player, "flight_step")){
      addOrRefreshStatusEffect(state.player, createStatusEffect("flight_step"));
      log(state, "Flight Step grants +2 AC for 1 round.");
    }

    if(maybeResolveGuardStrike()){
      save(state);
      render();
      return;
    }

    if(state.combat && hasAbility(state.player, "retaliate") && hasStatusEffect(state.player, "enrage") && state.player.hp.current <= Math.floor(state.player.hp.max / 2)){
      log(state, "Retaliate triggers.");
      const res = resolvePlayerAttack(state, { prefix:"Retaliate — free attack. " });
      if(res.enemyDefeated){
        save(state);
        render();
        return;
      }
    }

    advanceEnemyStatusEffectsAfterTurn(state);
    if(!state.combat){
      save(state);
      render();
      return;
    }
    state.combat.turn = "player";
    save(state);
    render();
  }

  function finishPlayerAbilityUse(state){
    advanceStatusEffectsAfterAction(state);
    if(state.combat) enemyTurn(state);
    else save(state);
    render();
  }

  function usePotion(state){
    if(state.combat && state.combat.turn !== "player"){
      log(state, "It is not your turn.");
      return;
    }
    if(!hasItem(state.player, "potion_healing", 1)){
      log(state, "You have no healing potions.");
      return;
    }
    removeItem(state.player, "potion_healing", 1);
    getItem("potion_healing").use(state);
    advanceStatusEffectsAfterAction(state);
    if(state.combat) enemyTurn(state);
    else save(state);
    render();
  }

  function applyEnrageStatus(state, sourceText="You enter an Enrage for 10 rounds."){
    addOrRefreshStatusEffect(state.player, {
      id: "enrage",
      templateId: "enrage",
      name: "Enrage",
      description: getAbility("enrage").summary,
      duration: 10,
      maxDuration: 10,
      durationMode: "turn",
      durationUnit: "rounds",
      tags: ["Rage"],
      expiresOnDown: true,
      justApplied: true,
      modifiers: {
        damageBonusMelee: 2,
        resistances: { bludgeoning: 2, piercing: 2, slashing: 2 }
      }
    });
    log(state, sourceText);
  }

  function spendAbilitySp(state, abilityId){
    state.player.sp.current -= Number(getAbility(abilityId).costSp || 0);
  }

  function useAttackAbility(state, abilityId, {
    prefix=null,
    attackBonusModifier=0,
    extraDamageOnHit=0,
    ignoreFlyingPenalty=false,
    onAfter=null
  } = {}){
    const check = canUseActiveAbility(state, abilityId);
    if(!check.ok){
      log(state, check.reason);
      return;
    }

    spendAbilitySp(state, abilityId);
    const ability = getAbility(abilityId);
    const result = resolvePlayerAttack(state, {
      prefix: prefix != null ? prefix : `${ability.name}: `,
      attackBonusModifier,
      extraDamageOnHit,
      ignoreFlyingPenalty
    });

    if(typeof onAfter === "function"){
      onAfter(result);
    }

    finishPlayerAbilityUse(state);
  }

  function useEnrage(state){
    const check = canUseActiveAbility(state, "enrage");
    if(!check.ok){
      log(state, check.reason);
      return;
    }

    spendAbilitySp(state, "enrage");
    applyEnrageStatus(state);
    finishPlayerAbilityUse(state);
  }

  function useSecondWind(state){
    const check = canUseActiveAbility(state, "second_wind");
    if(!check.ok){
      log(state, check.reason);
      return;
    }

    spendAbilitySp(state, "second_wind");
    const heal = Math.max(1, rollDice("1d6") + statMod(state.player.stats.CON));
    const before = state.player.hp.current;
    state.player.hp.current = clamp(state.player.hp.current + heal, 0, state.player.hp.max);
    log(state, `You use Second Wind and recover ${state.player.hp.current - before} HP.`);
    finishPlayerAbilityUse(state);
  }

  function useGuardStance(state){
    useAttackAbility(state, "guard_stance", {
      attackBonusModifier: -2,
      extraDamageOnHit: 4
    });
  }

  function useFeintStrike(state){
    useAttackAbility(state, "feint_strike", {
      onAfter: () => {
        if(state.combat && state.combat.enemy){
          addOrRefreshStatusEffect(state.combat.enemy, createStatusEffect("off_guard"));
          log(state, `${state.combat.enemy.name} becomes Off-Guard from Feint Strike.`);
        }
      }
    });
  }

  function useGuardStrike(state){
    const check = canUseActiveAbility(state, "guard_strike");
    if(!check.ok){
      log(state, check.reason);
      return;
    }

    spendAbilitySp(state, "guard_strike");
    addOrRefreshStatusEffect(state.player, createStatusEffect("guarded"));
    addOrRefreshStatusEffect(state.player, createStatusEffect("guard_strike_ready"));
    log(state, "You brace with Guard Strike: gain Guarded and prepare a counterattack until your next turn.");
    finishPlayerAbilityUse(state);
  }

  function useCheckAbilityAgainstEnemyDc(state, abilityId, { checkLabel, getBonus, dcId, statusId, duration=1, successText, failureText }){
    const check = canUseActiveAbility(state, abilityId);
    if(!check.ok){
      log(state, check.reason);
      return;
    }

    const ability = getAbility(abilityId);
    const enemy = state.combat.enemy;
    spendAbilitySp(state, abilityId);

    const roll = rollD20();
    const bonus = Number(getBonus(state) || 0);
    const total = roll + bonus;
    const dc = creatureSaveDc(enemy, dcId);

    if(roll === 20 || total >= dc){
      const effect = createStatusEffect(statusId, { duration });
      addOrRefreshStatusEffect(enemy, effect);
      log(state, `${ability.name}: ${checkLabel} d20(${roll}) + ${bonus} = ${total} vs ${saveLabel(dcId)} DC ${dc} → success. ${successText || `${enemy.name} gains ${effect.name} for ${effect.duration} round${effect.duration === 1 ? "" : "s"}.`}`);
    }else{
      log(state, `${ability.name}: ${checkLabel} d20(${roll}) + ${bonus} = ${total} vs ${saveLabel(dcId)} DC ${dc} → failure. ${failureText || "No effect."}`);
    }

    finishPlayerAbilityUse(state);
  }

  function useTopple(state){
    useCheckAbilityAgainstEnemyDc(state, "topple", {
      checkLabel: "Athletics",
      getBonus: st => skillTotal(st.player, "Athletics"),
      dcId: "reflex",
      statusId: "prone",
      successText: `${state.combat.enemy.name} is knocked Prone for 1 round.`
    });
  }


  function useViciousStrike(state){
    useAttackAbility(state, "vicious_strike", {
      extraDamageOnHit: statMod(state.player.stats.STR)
    });
  }

  function useOpenHand(state){
    const check = canUseActiveAbility(state, "open_hand");
    if(!check.ok){
      log(state, check.reason);
      return;
    }
    spendAbilitySp(state, "open_hand");
    addOrRefreshStatusEffect(state.player, createStatusEffect("tree_stance"));
    log(state, "You root into Tree Stance for 10 rounds (resistance 3 to bludgeoning, piercing, and slashing).");
    finishPlayerAbilityUse(state);
  }

  function useRiverStance(state){
    const check = canUseActiveAbility(state, "river_stance");
    if(!check.ok){
      log(state, check.reason);
      return;
    }
    spendAbilitySp(state, "river_stance");
    addOrRefreshStatusEffect(state.player, createStatusEffect("river_stance"));
    log(state, "You flow into River Stance for 10 rounds.");
    finishPlayerAbilityUse(state);
  }

  function useMountainStance(state){
    const check = canUseActiveAbility(state, "mountain_stance");
    if(!check.ok){
      log(state, check.reason);
      return;
    }
    spendAbilitySp(state, "mountain_stance");
    addOrRefreshStatusEffect(state.player, createStatusEffect("mountain_stance"));
    log(state, "You settle into Mountain Stance for 10 rounds (+2 AC).");
    finishPlayerAbilityUse(state);
  }

  function useCloudStance(state){
    const check = canUseActiveAbility(state, "cloud_stance");
    if(!check.ok){
      log(state, check.reason);
      return;
    }
    spendAbilitySp(state, "cloud_stance");
    addOrRefreshStatusEffect(state.player, createStatusEffect("cloud_stance"));
    log(state, "You slip into Cloud Stance for 10 rounds.");
    finishPlayerAbilityUse(state);
  }

  function useFlameStance(state){
    const check = canUseActiveAbility(state, "flame_stance");
    if(!check.ok){
      log(state, check.reason);
      return;
    }
    spendAbilitySp(state, "flame_stance");
    addOrRefreshStatusEffect(state.player, createStatusEffect("flame_stance"));
    log(state, "You ignite Flame Stance for 10 rounds (+2 attack rolls).");
    finishPlayerAbilityUse(state);
  }

  function useHuntersMark(state){
    useCheckAbilityAgainstEnemyDc(state, "hunters_mark", {
      checkLabel: "Survival",
      getBonus: st => skillTotal(st.player, "Survival"),
      dcId: "will",
      statusId: "marked_prey",
      duration: 5,
      successText: `${state.combat.enemy.name} is marked for 5 rounds. Your attacks against it deal +1d4 damage while the mark lasts.`
    });
  }

  function usePreciseStrike(state){
    useAttackAbility(state, "precise_strike", {
      attackBonusModifier: 4
    });
  }

  function useSpikeLure(state){
    const check = canUseActiveAbility(state, "spike_lure");
    if(!check.ok){
      log(state, check.reason);
      return;
    }
    spendAbilitySp(state, "spike_lure");
    addOrRefreshStatusEffect(state.player, createStatusEffect("spike_lure"));
    log(state, "You bait attacks with Spike Lure for 5 rounds.");
    finishPlayerAbilityUse(state);
  }

  function useDirtyTrick(state){
    useCheckAbilityAgainstEnemyDc(state, "dirty_trick", {
      checkLabel: "Stealth",
      getBonus: st => skillTotal(st.player, "Stealth"),
      dcId: "reflex",
      statusId: "blinded",
      successText: `${state.combat.enemy.name} becomes Blinded for 1 round.`
    });
  }

  function useCoverStep(state){
    const check = canUseActiveAbility(state, "cover_step");
    if(!check.ok){
      log(state, check.reason);
      return;
    }

    spendAbilitySp(state, "cover_step");
    const roll = rollD20();
    const bonus = skillTotal(state.player, "Stealth");
    const total = roll + bonus;
    const dc = creatureSaveDc(state.combat.enemy, "will");
    if(roll === 20 || total >= dc){
      addOrRefreshStatusEffect(state.player, createStatusEffect("cover_step"));
      log(state, `Cover Step: Stealth d20(${roll}) + ${bonus} = ${total} vs Will DC ${dc} → success. Gain +4 AC and +4 to your next attack for 1 round.`);
    }else{
      log(state, `Cover Step: Stealth d20(${roll}) + ${bonus} = ${total} vs Will DC ${dc} → failure. No effect.`);
    }
    finishPlayerAbilityUse(state);
  }

  function useQuietStep(state){
    const check = canUseActiveAbility(state, "quiet_step");
    if(!check.ok){
      log(state, check.reason);
      return;
    }
    spendAbilitySp(state, "quiet_step");
    addOrRefreshStatusEffect(state.player, createStatusEffect("quiet_step"));
    log(state, "You move under Quiet Step for 10 movements. Entering enemy tiles will not trigger combat while it lasts.");
    finishPlayerAbilityUse(state);
  }

  function useOpenWound(state){
    useAttackAbility(state, "open_wound", {
      onAfter: (result) => {
        if(result.hit && state.combat && state.combat.enemy){
          addOrRefreshStatusEffect(state.combat.enemy, createBleedStatusEffect(2, 5));
          log(state, `${state.combat.enemy.name} suffers Bleed 2.`);
        }
      }
    });
  }

  function useActiveAbility(state, abilityId){
    if(abilityId === "second_wind") return useSecondWind(state);
    if(abilityId === "guard_stance") return useGuardStance(state);
    if(abilityId === "feint_strike") return useFeintStrike(state);
    if(abilityId === "guard_strike") return useGuardStrike(state);
    if(abilityId === "enrage") return useEnrage(state);
    if(abilityId === "topple") return useTopple(state);
    if(abilityId === "vicious_strike") return useViciousStrike(state);
    if(abilityId === "open_hand") return useOpenHand(state);
    if(abilityId === "river_stance") return useRiverStance(state);
    if(abilityId === "mountain_stance") return useMountainStance(state);
    if(abilityId === "cloud_stance") return useCloudStance(state);
    if(abilityId === "flame_stance") return useFlameStance(state);
    if(abilityId === "hunters_mark") return useHuntersMark(state);
    if(abilityId === "precise_strike") return usePreciseStrike(state);
    if(abilityId === "spike_lure") return useSpikeLure(state);
    if(abilityId === "dirty_trick") return useDirtyTrick(state);
    if(abilityId === "cover_step") return useCoverStep(state);
    if(abilityId === "quiet_step") return useQuietStep(state);
    if(abilityId === "open_wound") return useOpenWound(state);
    log(state, `No handler for ability: ${abilityId}.`);
  }

  function flee(state){
    if(!state.combat || state.combat.turn !== "player") return;
    // simple: D20 + Acrobatics vs DC 12 + enemy level*2
    const enemy = state.combat.enemy;
    const roll = rollD20();
    const total = roll + skillTotal(state.player, "Acrobatics");
    const dc = 12 + enemy.level * 2;
    if(roll === 20 || total >= dc){
      log(state, `You flee successfully. (Acrobatics ${total} vs DC ${dc})`);
      advanceStatusEffectsAfterAction(state);
      endCombat(state, false);
    }else{
      log(state, `You fail to flee. (Acrobatics ${total} vs DC ${dc})`);
      advanceStatusEffectsAfterAction(state);
      enemyTurn(state);
    }
    save(state);
    render();
  }

  /********************************************************************
   * Resting
   ********************************************************************/
  function shortRest(state){
    if(hasBlockingCenterOverlay(state)) return;
    if(state.combat){
      log(state, "You can't rest during combat.");
      return;
    }
    const now = Date.now();
    if(now < state.cooldowns.shortRestReadyAt){
      const s = Math.ceil((state.cooldowns.shortRestReadyAt - now)/1000);
      log(state, `Short rest is on cooldown (${s}s).`);
      return;
    }

    // Risk: outside town, you can be attacked while resting.
    const areaDef = getArea(state.world.areaId);
    const inTown = state.world.areaId === "town";

    // Cooldown applies whether or not the rest succeeds.
    state.cooldowns.shortRestReadyAt = now + 60_000; // 60s cooldown

    if(!inTown && areaDef.map){
      const cautiousCamp = hasAbility(state.player, "skill_stealth_cautious_camp");
      const firstRoll = rollD20();
      const secondRoll = cautiousCamp ? rollD20() : null;
      const roll = secondRoll != null ? Math.max(firstRoll, secondRoll) : firstRoll;
      const total = roll + skillTotal(state.player, "Stealth");
      const dc = 12 + areaDef.level * 2;
      if(roll !== 20 && total < dc){
        log(state, `While you try to rest, you're ambushed! (Stealth ${total} vs DC ${dc}${cautiousCamp ? `; Cautious Camp rolls ${firstRoll}/${secondRoll}, kept ${roll}` : ""})`);
        // Ambush encounter uses the area's encounter pool.
        const mId = areaDef.encounterPool[rollInt(0, areaDef.encounterPool.length-1)];
        startEncounter(state, mId);
        save(state);
        render();
        return;
      }else{
        log(state, `You manage to rest quietly. (Stealth ${total} vs DC ${dc}${cautiousCamp ? `; Cautious Camp rolls ${firstRoll}/${secondRoll}, kept ${roll}` : ""})`);
      }
    }

    // Heal: 1d8 + CON mod (min 1)
    const heal = Math.max(1, rollDice("1d8") + statMod(state.player.stats.CON));
    const beforeHp = state.player.hp.current;
    state.player.hp.current = clamp(state.player.hp.current + heal, 0, state.player.hp.max);

    // SP recover: 1d6 + WIS mod (min 1)
    const spGain = Math.max(1, rollDice("1d6") + statMod(state.player.stats.WIS));
    const beforeSp = state.player.sp.current;
    state.player.sp.current = clamp(state.player.sp.current + spGain, 0, state.player.sp.max);

    log(state, `You take a short rest: +${state.player.hp.current - beforeHp} HP, +${state.player.sp.current - beforeSp} SP. (Cooldown 60s)`);
    save(state);
    render();
  }

  function longRest(state){
    if(hasBlockingCenterOverlay(state)) return;
    if(state.world.areaId !== "town"){
      log(state, "You can only take a long rest in town (for now).");
      return;
    }
    if(state.combat) return;

    state.player.hp.current = state.player.hp.max;
    state.player.sp.current = state.player.sp.max;
    state.world.day = Math.max(1, Number(state.world.day || 1)) + 1;
    // reset short rest cooldown too
    state.cooldowns.shortRestReadyAt = 0;

    const refreshed = refreshAllMapEncounters(state);
    const refreshedEvents = regenerateDailyRandomEvents(state);
    log(state, `Day ${state.world.day}: you take a long rest and fully recover.${refreshed ? ` Wilderness encounters refreshed: ${refreshed}.` : ""}${refreshedEvents ? ` Random events refreshed: ${refreshedEvents}.` : ""}`);
    toast(`Day ${state.world.day} begins.`, "good");
    save(state);
    render();
  }

  /********************************************************************
   * Shop
   ********************************************************************/
  function shopStock(){
    const stock = [];
    const addStock = (item) => {
      if(!item || !item.buyable) return;
      stock.push({
        kind:"item",
        id:item.id,
        price: Math.max(0, Number(item.purchasePrice != null ? item.purchasePrice : item.cost || 0)),
        qty: Math.max(1, Number(item.purchaseQty || 1))
      });
    };
    for(const w of WEAPONS) addStock(w);
    for(const a of ARMORS) addStock(a);
    for(const o of OFFHAND) addStock(o);
    for(const a of ACCESSORIES) addStock(a);
    for(const c of CONSUMABLES) addStock(c);
    for(const a of AMMO) addStock(a);
    return stock.sort((x,y)=>getItem(x.id).name.localeCompare(getItem(y.id).name));
  }

  function buyItem(state, itemId){
    if(state.world.areaId !== "town"){
      log(state, "You can only buy items in town.");
      return;
    }
    const it = getItem(itemId);
    const purchaseQty = Math.max(1, Number(it.purchaseQty || 1));
    const base = Math.max(0, Number(it.purchasePrice != null ? it.purchasePrice : it.cost || 0));
    if(!it.buyable || base <= 0){
      log(state, "That item can't be bought right now.");
      return;
    }
    const price = adjustedBuyPriceCp(state.player, base);
    const inv = calcInventorySlots(state.player);
    if((inv.used + purchaseQty) > inv.max){
      log(state, `Your inventory is too full to buy ${it.name}${purchaseQty > 1 ? ` x${purchaseQty}` : ""}.`);
      return;
    }
    if(!spendCoins(state, price)){
      log(state, "Not enough money.");
      return;
    }
    addItem(state.player, itemId, purchaseQty);
    log(state, `Purchased ${it.name}${purchaseQty > 1 ? ` x${purchaseQty}` : ""} for ${formatCoins(price)}.`);
    save(state);
    render();
  }

  function sellItem(state, itemId){
    if(state.world.areaId !== "town"){
      log(state, "You can only sell items in town.");
      return;
    }
    const it = getItem(itemId);
    if(!canSellItem(it)){
      log(state, `${it.name} can't be sold.`);
      return;
    }
    const sellPrice = adjustedSellPriceCp(state.player, it);
    if(sellPrice <= 0){
      log(state, `${it.name} has no sell value.`);
      return;
    }

    if(!removeItem(state.player, itemId, 1)) return;

    addCoins(state, sellPrice);
    log(state, `Sold ${it.name} for ${formatCoins(sellPrice)}.`);
    save(state);
    render();
  }

  /********************************************************************
   * Equipment
   ********************************************************************/
  const MAX_SKILL_INVEST = 25;

  function skillProficiencyCap(player, skillId){
    const startingBonus = (player && player.startingSkillId === skillId) ? 2 : 0;
    return MAX_SKILL_INVEST + startingBonus;
  }

  function isTwoHandWeapon(it){
    return !!(it && it.type === "weapon" && Array.isArray(it.properties) && it.properties.includes("two-hand"));
  }
  function isAgileWeapon(it){
    return !!(it && it.type === "weapon" && Array.isArray(it.properties) && it.properties.includes("agile"));
  }

  const EQUIP_SLOTS = [
    { id:"mainHand", label:"Main hand", filter: (it)=>it.type==="weapon" },
    // Off-hand can take shields/offhand items, or an agile one-handed weapon.
    { id:"offHand", label:"Off hand", filter: (it)=>it.category==="shield" || it.type==="offhand" || (it.type==="weapon" && isAgileWeapon(it) && !isTwoHandWeapon(it)) },
    { id:"armor", label:"Armor", filter: (it)=>it.type==="armor" },
    { id:"accessory_1", label:"Acc 1", filter: (it)=>it.type==="accessory" },
    { id:"accessory_2", label:"Acc 2", filter: (it)=>it.type==="accessory" },
    { id:"accessory_3", label:"Acc 3", filter: (it)=>it.type==="accessory" },
    { id:"accessory_4", label:"Acc 4", filter: (it)=>it.type==="accessory" }
  ];

  function canEquipToSlot(player, slotId, it){
    if(!it) return false;

    if(slotId === "mainHand"){
      if(it.type !== "weapon") return false;
      return canUseWeaponCategory(player, it.category || "simple");
    }

    if(slotId === "offHand"){
      // If main hand is two-handed, off-hand is occupied.
      const mh = player.equipment.mainHand ? getItem(player.equipment.mainHand) : null;
      if(isTwoHandWeapon(mh)) return false;

      if(it.category === "shield") return canUseArmorCategory(player, "shields");
      if(it.type === "offhand") return canUseArmorCategory(player, it.category || "shields");
      if(it.type === "weapon"){
        // Only agile weapons can be wielded off-hand.
        return isAgileWeapon(it) && !isTwoHandWeapon(it) && canUseWeaponCategory(player, it.category || "simple");
      }
      return false;
    }

    if(slotId === "armor") return it.type === "armor" && canUseArmorCategory(player, it.category || "unarmored");
    if(slotId.startsWith("accessory_")) return it.type === "accessory";
    return false;
  }

  function validateEquippedItems(player){
    if(!player || !player.equipment) return;

    const mh = player.equipment.mainHand ? getItem(player.equipment.mainHand) : null;
    if(isTwoHandWeapon(mh) && player.equipment.offHand){
      addItem(player, player.equipment.offHand, 1);
      player.equipment.offHand = null;
    }

    for(const slotId of Object.keys(player.equipment)){
      const iid = player.equipment[slotId];
      if(!iid) continue;
      const it = getItem(iid);
      if(!it || !canEquipToSlot(player, slotId, it)){
        addItem(player, iid, 1);
        player.equipment[slotId] = null;
      }
    }
  }

  function cloneInventoryEntries(entries){
    return (entries || []).map(entry => ({ itemId: entry.itemId, qty: Number(entry.qty || 0) }));
  }

  function addItemToInventoryEntries(entries, itemId, qty=1){
    const found = entries.find(entry => entry.itemId === itemId);
    if(found) found.qty += qty;
    else entries.push({ itemId, qty });
    entries.sort((a,b) => getItem(a.itemId).name.localeCompare(getItem(b.itemId).name));
  }

  function removeItemFromInventoryEntries(entries, itemId, qty=1){
    const idx = entries.findIndex(entry => entry.itemId === itemId);
    if(idx < 0 || entries[idx].qty < qty) return false;
    entries[idx].qty -= qty;
    if(entries[idx].qty <= 0) entries.splice(idx, 1);
    return true;
  }

  function equipItem(state, slotId, itemId){
    const p = state.player;
    const prev = p.equipment[slotId] || null;

    // No-op if unchanged.
    if((itemId || null) === (prev || null)) return;

    const nextInventory = cloneInventoryEntries(p.inventory);
    const nextEquipment = { ...(p.equipment || {}) };

    if(itemId === ""){
      nextEquipment[slotId] = null;
      if(prev) addItemToInventoryEntries(nextInventory, prev, 1);
      const nextInv = calcInventorySlots(p, { inventory: nextInventory, equipment: nextEquipment });
      if(nextInv.used > nextInv.max){
        toast("Inventory is full — cannot unequip that item right now.", "warn");
        render();
        return;
      }

      p.inventory = nextInventory;
      p.equipment = nextEquipment;
      log(state, prev ? `Unequipped ${getItem(prev).name}.` : "Unequipped.");
      save(state);
      render();
      return;
    }

    if(!removeItemFromInventoryEntries(nextInventory, itemId, 1)){
      log(state, "Item not in inventory.");
      toast("Item not in inventory.", "bad");
      render();
      return;
    }

    const it = getItem(itemId);
    if(!canEquipToSlot(p, slotId, it)){
      toast("Your class is not trained to equip that category in this slot.", "bad");
      render();
      return;
    }

    if(prev) addItemToInventoryEntries(nextInventory, prev, 1);
    nextEquipment[slotId] = itemId;

    if(slotId === "mainHand" && isTwoHandWeapon(it) && nextEquipment.offHand){
      addItemToInventoryEntries(nextInventory, nextEquipment.offHand, 1);
      nextEquipment.offHand = null;
    }

    const nextInv = calcInventorySlots(p, { inventory: nextInventory, equipment: nextEquipment });
    if(nextInv.used > nextInv.max){
      toast("Inventory is full — cannot complete that equip or swap.", "warn");
      render();
      return;
    }

    p.inventory = nextInventory;
    p.equipment = nextEquipment;
    log(state, `Equipped ${it.name} to ${slotId}.`);
    save(state);
    render();
  }

/********************************************************************
   * Leveling
   ********************************************************************/
  function xpToNextLevel(player){
    if(!player) return null;
    const lvl = totalLevel(player);
    if(lvl >= maxLevelCap()) return null;
    return 120 + (lvl-1)*80;
  }

  function canLevelUp(player){
    const needed = xpToNextLevel(player);
    return needed != null && player.xp >= needed;
  }

  function classRequirementEntries(classId){
    const reqs = CLASSES[classId] && CLASSES[classId].requirements ? CLASSES[classId].requirements : {};
    return STATS
      .filter(stat => Number.isFinite(Number(reqs[stat])))
      .map(stat => [stat, Number(reqs[stat])]);
  }

  function classRequirementText(classId){
    const entries = classRequirementEntries(classId);
    return entries.length ? entries.map(([stat, value]) => `${stat} ${value}`).join(", ") : "None";
  }

  function unmetClassRequirements(classId, stats){
    const source = stats || {};
    return classRequirementEntries(classId)
      .filter(([stat, value]) => Number(source[stat] || 0) < value)
      .map(([stat, value]) => `${stat} ${value}`);
  }

  function canTakeClassLevel(player, classId, stats=player && player.stats){
    if(!player || !CLASSES[classId]) return false;
    if(Number(player.levels && player.levels[classId] || 0) > 0) return true;
    return unmetClassRequirements(classId, stats || {}).length === 0;
  }

  function availableSkillAbilityIdsForTier(player, tier){
    if(!tier) return [];
    const owned = new Set(playerAbilityIds(player));
    const ids = Array.isArray(SKILL_ABILITY_TIERS[tier]) ? SKILL_ABILITY_TIERS[tier] : [];
    return ids.filter(id => !!ABILITIES[id] && !owned.has(id));
  }

  function classAbilityGrantIdsForAdvance(player, classId, optionalAbilityId=null){
    const currentClassLevel = Number(player && player.levels && player.levels[classId] || 0);
    const nextClassLevel = currentClassLevel + 1;
    const owned = new Set(playerAbilityIds(player));

    if(nextClassLevel === 1){
      return startingAbilityPackageForClass(classId, optionalAbilityId).filter(id => !owned.has(id));
    }

    const remainingOptionals = classOptionalAbilityIds(classId).filter(id => !owned.has(id));
    return remainingOptionals.length ? [remainingOptionals[0]] : [];
  }

  function sanitizeLevelUpStatAlloc(player, rawAlloc, budget){
    const source = rawAlloc && typeof rawAlloc === "object" ? rawAlloc : {};
    const out = {};
    let spent = 0;
    for(const stat of STATS){
      const current = Number(player && player.stats && player.stats[stat] || 0);
      const maxRoom = Math.max(0, STAT_LEVEL_UP_CAP - current);
      const requested = Math.max(0, Math.trunc(Number(source[stat] || 0)));
      const add = Math.min(requested, maxRoom, Math.max(0, budget - spent));
      if(add > 0){
        out[stat] = add;
        spent += add;
      }
    }
    return out;
  }

  function applyLevelUpStatAlloc(player, rawAlloc, budget){
    const alloc = sanitizeLevelUpStatAlloc(player, rawAlloc, budget);
    const stats = { ...(player && player.stats || {}) };
    for(const stat of STATS){
      stats[stat] = Math.min(STAT_LEVEL_UP_CAP, Number(stats[stat] || 0) + Number(alloc[stat] || 0));
    }
    return {
      stats,
      alloc,
      spent: Object.values(alloc).reduce((sum, value) => sum + Number(value || 0), 0)
    };
  }

  function levelUpSkillPointGainForStats(stats){
    return Math.max(1, statMod(stats.INT));
  }

  function sanitizeLevelUpSkillTrainDraft(player, rawDraft, budget){
    const source = sanitizeSkillDraft(rawDraft);
    const draft = {};
    let remaining = Math.max(0, Number(budget || 0));

    for(const sk of SKILLS){
      const requested = Math.max(0, Number(source[sk.id] || 0));
      if(requested <= 0 || remaining <= 0) continue;

      const current = Math.max(0, Number(player && player.skillProficiency && player.skillProficiency[sk.id] || 0));
      const room = Math.max(0, skillProficiencyCap(player, sk.id) - current);
      const add = Math.min(requested, room, remaining);
      if(add <= 0) continue;

      draft[sk.id] = add;
      remaining -= add;
    }

    return {
      draft,
      spent: Math.max(0, Number(budget || 0) - remaining),
      remaining
    };
  }

  function buildLevelUpPreview(player, rawDraft={}){
    const nextTotalLevel = totalLevel(player) + 1;
    const statPointBudget = nextTotalLevel % 2 === 1 ? 2 : 0;
    const statResult = applyLevelUpStatAlloc(player, rawDraft.statAlloc, statPointBudget);
    const previewStats = statResult.stats;

    const eligibleClassIds = Object.keys(CLASSES).filter(cid => canTakeClassLevel(player, cid, previewStats));
    const fallbackClassId = mainClass(player);
    const requestedClassId = rawDraft && CLASSES[rawDraft.classId] ? rawDraft.classId : fallbackClassId;
    const classId = eligibleClassIds.includes(requestedClassId)
      ? requestedClassId
      : (eligibleClassIds.includes(fallbackClassId) ? fallbackClassId : (eligibleClassIds[0] || Object.keys(CLASSES)[0]));

    const optionalAbilityId = normalizeOptionalAbilityChoiceForClass(classId, rawDraft.optionalAbilityId);
    const currentClassLevel = Number(player.levels && player.levels[classId] || 0);
    const newClassLevel = currentClassLevel + 1;
    const classAbilityGrantIds = classAbilityGrantIdsForAdvance(player, classId, optionalAbilityId);

    const skillTier = nextTotalLevel % 2 === 0 ? nextTotalLevel : null;
    const skillAbilityOptions = availableSkillAbilityIdsForTier(player, skillTier);
    const skillAbilityId = skillAbilityOptions.includes(rawDraft.skillAbilityId)
      ? rawDraft.skillAbilityId
      : (skillAbilityOptions[0] || null);

    const skillPointGain = levelUpSkillPointGainForStats(previewStats);
    const skillTrainResult = sanitizeLevelUpSkillTrainDraft(player, rawDraft.skillTrainDraft, skillPointGain);
    const cls = CLASSES[classId];
    const hpGain = Math.max(1, cls.hpPerLevel + statMod(previewStats.CON));
    const spGain = Math.max(1, cls.spPerLevel + Math.max(0, statMod(previewStats.WIS)));

    const blockers = [];
    if(statPointBudget > 0 && statResult.spent < statPointBudget){
      blockers.push(`Spend all ${statPointBudget} ability score point${statPointBudget === 1 ? "" : "s"}.`);
    }
    if(skillTier && skillAbilityOptions.length > 0 && !skillAbilityId){
      blockers.push(`Choose a level ${skillTier} skill ability.`);
    }

    return {
      currentTotalLevel: totalLevel(player),
      nextTotalLevel,
      xpCost: xpToNextLevel(player),
      statPointBudget,
      statPointSpent: statResult.spent,
      statPointsRemaining: Math.max(0, statPointBudget - statResult.spent),
      stats: previewStats,
      statAlloc: statResult.alloc,
      eligibleClassIds,
      classId,
      currentClassLevel,
      newClassLevel,
      optionalAbilityId,
      classAbilityGrantIds,
      classRequirementText: classRequirementText(classId),
      skillTier,
      skillAbilityOptions,
      skillAbilityId,
      skillPointGain,
      skillTrainDraft: skillTrainResult.draft,
      skillTrainSpent: skillTrainResult.spent,
      skillTrainRemaining: skillTrainResult.remaining,
      hpGain,
      spGain,
      canConfirm: blockers.length === 0,
      blockers
    };
  }

  function levelUpDraftFromPreview(preview){
    return {
      classId: preview.classId,
      optionalAbilityId: preview.optionalAbilityId,
      skillAbilityId: preview.skillAbilityId,
      statAlloc: { ...preview.statAlloc },
      skillTrainDraft: { ...preview.skillTrainDraft }
    };
  }

  function openLevelUpOverlay(state){
    if(!state || !state.player || !canLevelUp(state.player)) return;
    const preview = buildLevelUpPreview(state.player, state.ui && state.ui.levelUpDraft || {});
    state.ui.levelUpOpen = true;
    state.ui.levelUpDraft = levelUpDraftFromPreview(preview);
    render();
  }

  function closeLevelUpOverlay(state){
    if(!state || !state.ui) return;
    state.ui.levelUpOpen = false;
    state.ui.levelUpDraft = {};
    render();
  }

  function levelUp(state, rawDraft=null){
    if(!state || !state.player || !canLevelUp(state.player)) return;

    const preview = buildLevelUpPreview(state.player, rawDraft || state.ui.levelUpDraft || {});
    if(!preview.canConfirm){
      toast(preview.blockers[0] || "Finish your level-up choices first.", "warn");
      return;
    }
    if(!canTakeClassLevel(state.player, preview.classId, preview.stats)){
      toast(`You do not meet the requirements for ${preview.classId}.`, "warn");
      return;
    }

    const player = state.player;
    const oldOwned = new Set(playerAbilityIds(player));
    const nextTotalLevel = preview.nextTotalLevel;

    player.xp -= preview.xpCost;
    player.stats = { ...preview.stats };
    player.levels[preview.classId] = preview.newClassLevel;

    player.hp.max += preview.hpGain;
    player.hp.current += preview.hpGain;
    player.sp.max += preview.spGain;
    player.sp.current += preview.spGain;

    const classGrantedNames = [];
    for(const abilityId of preview.classAbilityGrantIds){
      if(oldOwned.has(abilityId) || !ABILITIES[abilityId]) continue;
      player.abilityIds.push(abilityId);
      oldOwned.add(abilityId);
      classGrantedNames.push(getAbility(abilityId).name);
    }

    let skillAbilityName = null;
    if(preview.skillAbilityId && !oldOwned.has(preview.skillAbilityId) && ABILITIES[preview.skillAbilityId]){
      player.abilityIds.push(preview.skillAbilityId);
      oldOwned.add(preview.skillAbilityId);
      skillAbilityName = getAbility(preview.skillAbilityId).name;
    }

    const training = applySkillTrainingWithBudget(player, preview.skillTrainDraft, preview.skillPointGain);
    if(training.remaining > 0){
      player.skillPoints += training.remaining;
    }

    const statSummary = STATS
      .filter(stat => Number(preview.statAlloc[stat] || 0) > 0)
      .map(stat => `${stat} +${preview.statAlloc[stat]}`)
      .join(", ");
    const trainedSummary = summarizeSkillDraft(training.applied).join(", ");

    log(state, `Level up! ${player.name} reaches total level ${nextTotalLevel} by taking ${preview.classId} ${preview.newClassLevel} (+${preview.hpGain} HP, +${preview.spGain} SP, +${preview.skillPointGain} skill point${preview.skillPointGain === 1 ? "" : "s"}).`);
    if(statSummary){
      log(state, `Ability score increases applied: ${statSummary}.`);
    }
    if(classGrantedNames.length){
      log(state, `Class abilities gained: ${classGrantedNames.join(", ")}.`);
    }
    if(skillAbilityName){
      log(state, `Skill ability gained: ${skillAbilityName}.`);
    }
    if(training.spent > 0 || training.remaining > 0){
      const parts = [];
      if(training.spent > 0) parts.push(`locked in ${trainedSummary || `${training.spent} skill point${training.spent === 1 ? "" : "s"}`}`);
      if(training.remaining > 0) parts.push(`${training.remaining} unspent added to your Character tab training pool`);
      log(state, `Skill training gained: ${parts.join("; ")}.`);
    }

    state.ui.levelUpOpen = false;
    state.ui.levelUpDraft = {};
    save(state);
    render();
  }

  /********************************************************************
   * Rendering
   ********************************************************************/
  const $app = document.getElementById("app");

  // Floating UI overlays
  let $tooltip = null;
  let $toast = null;
  let $modal = null;
  let toastTimer = null;

  function ensureOverlays(){
    if(!$tooltip){
      $tooltip = document.createElement("div");
      $tooltip.id = "tooltip";
      $tooltip.className = "tooltip hidden";
      document.body.appendChild($tooltip);
    }
    if(!$toast){
      $toast = document.createElement("div");
      $toast.id = "toast";
      $toast.className = "toast hidden";
      document.body.appendChild($toast);
    }
    if(!$modal){
      $modal = document.createElement("div");
      $modal.id = "modal";
      $modal.className = "modal hidden";
      $modal.innerHTML = `
        <div class="modalBackdrop" data-modal-backdrop></div>
        <div class="modalCard" role="dialog" aria-modal="true" aria-labelledby="modal_title">
          <div class="modalHeader">
            <div class="modalTitle" id="modal_title">Confirm</div>
          </div>
          <div class="modalBody" id="modal_body"></div>
          <div class="modalActions">
            <button class="btn" id="modal_cancel">Cancel</button>
            <button class="btn primary" id="modal_ok">OK</button>
          </div>
        </div>
      `;
      document.body.appendChild($modal);
    }
  }

  function showTooltip(html, x, y){
    ensureOverlays();
    if(!$tooltip) return;
    $tooltip.innerHTML = html;
    $tooltip.classList.remove("hidden");

    // Clamp within viewport
    const pad = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    $tooltip.style.left = "0px";
    $tooltip.style.top = "0px";
    const rect = $tooltip.getBoundingClientRect();
    let tx = x + 14;
    let ty = y + 14;
    if(tx + rect.width + pad > vw) tx = Math.max(pad, x - rect.width - 14);
    if(ty + rect.height + pad > vh) ty = Math.max(pad, y - rect.height - 14);
    $tooltip.style.left = `${tx}px`;
    $tooltip.style.top = `${ty}px`;
  }

  function hideTooltip(){
    if($tooltip) $tooltip.classList.add("hidden");
  }

  function wireResolvedTooltips(scope, selector, htmlFor){
    if(!scope) return;
    scope.querySelectorAll(selector).forEach(el => {
      const buildHtml = () => {
        try{
          return htmlFor(el) || "";
        }catch(_){
          return "";
        }
      };

      el.addEventListener("mouseenter", (e) => {
        const html = buildHtml();
        if(!html) return;
        showTooltip(html, e.clientX, e.clientY);
      });
      el.addEventListener("mousemove", (e) => {
        const html = buildHtml();
        if(!html) return;
        showTooltip(html, e.clientX, e.clientY);
      });
      el.addEventListener("mouseleave", () => hideTooltip());
    });
  }

  function wireAbilityTooltips(scope){
    wireResolvedTooltips(scope, "[data-ability]", el => abilityTooltipHtml(el.getAttribute("data-ability") || ""));
  }

  function wireStatTooltips(scope){
    wireResolvedTooltips(scope, "[data-stat-tip]", el => {
      const stat = el.getAttribute("data-stat-tip") || "";
      return `
        <div style="font-weight:700; font-size:13px; margin-bottom:6px">${escapeHtml(fullStatName(stat))} (${escapeHtml(stat)})</div>
        <div class="small muted" style="line-height:1.45">${escapeHtml(STAT_TOOLTIPS[stat] || "")}</div>
      `;
    });
  }

  function wireStatusTooltips(scope){
    wireResolvedTooltips(scope, "[data-status-effect]", el => {
      const statusId = el.getAttribute("data-status-effect") || "";
      const owner = el.getAttribute("data-status-owner") === "enemy"
        ? (state.combat && state.combat.enemy)
        : state.player;
      const effect = findStatusEffect(owner, statusId);
      return effect ? statusEffectTooltipHtml(effect) : "";
    });
  }

  function wireSkillTooltips(scope){
    wireResolvedTooltips(scope, "[data-skill-tip]", el => skillTooltipHtml(el.getAttribute("data-skill-tip") || ""));
  }

  function wireTextTooltips(scope){
    wireResolvedTooltips(scope, "[data-tooltip]", el => {
      const message = el.getAttribute("data-tooltip") || "";
      if(!message) return "";
      return `<div class="small muted" style="line-height:1.45">${escapeHtml(message)}</div>`;
    });
  }

  function toast(msg, kind="info"){
    ensureOverlays();
    if(!$toast) return;
    $toast.textContent = msg;
    $toast.className = `toast ${kind}`;
    if(toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      if($toast) $toast.classList.add("hidden");
    }, 2200);
  }

  function confirmDialog({ title="Confirm", message="", okText="OK", cancelText="Cancel", okKind="primary", cancelKind="" } = {}){
    ensureOverlays();
    return new Promise(resolve => {
      const modal = $modal;
      const titleEl = modal.querySelector("#modal_title");
      const bodyEl = modal.querySelector("#modal_body");
      const okBtn = modal.querySelector("#modal_ok");
      const cancelBtn = modal.querySelector("#modal_cancel");
      const backdrop = modal.querySelector("[data-modal-backdrop]");

      titleEl.textContent = title;
      bodyEl.textContent = message;
      okBtn.textContent = okText;
      okBtn.className = okKind ? `btn ${okKind}` : "btn";
      cancelBtn.className = cancelKind ? `btn ${cancelKind}` : "btn";
      if(cancelText === null){
        cancelBtn.style.display = "none";
      }else{
        cancelBtn.style.display = "";
        cancelBtn.textContent = cancelText;
      }

      const cleanup = (val) => {
        modal.classList.add("hidden");
        okBtn.onclick = null;
        cancelBtn.onclick = null;
        backdrop.onclick = null;
        document.removeEventListener("keydown", onKey);
        resolve(val);
      };

      const onKey = (e) => {
        if(e.key === "Escape") cleanup(false);
      };

      okBtn.onclick = () => cleanup(true);
      cancelBtn.onclick = () => cleanup(false);
      backdrop.onclick = () => cleanup(false);
      document.addEventListener("keydown", onKey);

      modal.classList.remove("hidden");
    });
  }

  function alertDialog({ title="Error", message="", okText="OK" } = {}){
    // One-button modal; resolves when dismissed.
    return confirmDialog({ title, message, okText, cancelText: null });
  }

  let state = load() || defaultState();

  normalizeState(state);

  function normalizeState(st){
    // UI state
    st.ui = st.ui || {};
    if(st.ui.selectedTile === undefined) st.ui.selectedTile = null;
    if(!st.ui.skillDraft) st.ui.skillDraft = {};
    if(typeof st.ui.levelUpOpen !== "boolean") st.ui.levelUpOpen = false;
    if(!st.ui.levelUpDraft || typeof st.ui.levelUpDraft !== "object") st.ui.levelUpDraft = {};
    if(st.ui.shopMode !== "sell") st.ui.shopMode = "buy";
    if(typeof st.ui.saveToolsVisible !== "boolean") st.ui.saveToolsVisible = false;
    if(typeof st.ui.mobileActionsVisible !== "boolean") st.ui.mobileActionsVisible = false;
    if(!Object.values(MAP_CAMERA_MODES).includes(st.ui.mapCameraMode)) st.ui.mapCameraMode = MAP_CAMERA_MODES.fixed;
    if(!Object.values(LOG_MODES).includes(st.ui.logMode)) st.ui.logMode = GAME_CONFIG.defaultLogMode;
    if(!st.ui.mapViewByArea || typeof st.ui.mapViewByArea !== "object") st.ui.mapViewByArea = {};
    if(!st.ui.combatNotice || typeof st.ui.combatNotice !== "object") st.ui.combatNotice = null;
    if(!st.ui.randomEventPrompt || typeof st.ui.randomEventPrompt !== "object") st.ui.randomEventPrompt = null;
    st.ui.inventorySort = normalizeSortConfig(st.ui.inventorySort, "name");
    st.ui.shopBuySort = normalizeSortConfig(st.ui.shopBuySort, "name");
    st.ui.shopSellSort = normalizeSortConfig(st.ui.shopSellSort, "name");

    const validTabs = new Set(["explore", "combat", "character", "inventory", "shop", "log", "settings"]);
    if(!validTabs.has(st.tab)) st.tab = "explore";

    // Core containers
    st.world = st.world || { areaId:"town", areas:{} };
    st.world.areas = st.world.areas || {};
    st.world.day = Math.max(1, Number(st.world.day || 1));
    if(!st.world.areaId) st.world.areaId = "town";
    st.world.areaUnlocks = (st.world.areaUnlocks && typeof st.world.areaUnlocks === "object") ? st.world.areaUnlocks : defaultAreaUnlocks();
    st.world.areaUnlocks.woods = true;
    for(const areaDef of AREAS){
      if(!areaDef.map || areaDef.id === "woods") continue;
      if(areaDef.id === st.world.areaId) st.world.areaUnlocks[areaDef.id] = true;
      const knownAreaState = st.world.areas[areaDef.id];
      if(knownAreaState && Array.isArray(knownAreaState.tiles) && knownAreaState.tiles.length) st.world.areaUnlocks[areaDef.id] = true;
    }
    st.log = Array.isArray(st.log) ? st.log : [];
    ensureRandomEventState(st);

    // Player shape migrations
    if(st.player){
      const p = st.player;

      // Ensure the unified skill proficiency map exists.
      const legacySkillBase = (p.skillBase && typeof p.skillBase === "object") ? p.skillBase : null;
      const validSkillIds = new Set(SKILLS.map(s => s.id));
      if(typeof p.startingSkillId !== "string" || !validSkillIds.has(p.startingSkillId)){
        p.startingSkillId = legacySkillBase
          ? (SKILLS.find(sk => Number(legacySkillBase[sk.id] || 0) > 0)?.id || null)
          : null;
      }
      if(!p.skillProficiency) p.skillProficiency = Object.fromEntries(SKILLS.map(s => [s.id, 0]));
      if(typeof p.startingClassId !== "string" || !CLASSES[p.startingClassId]){
        p.startingClassId = Object.entries(p.levels || {}).find(([, lvl]) => Number(lvl || 0) > 0)?.[0] || mainClass(p);
      }
      p.damageResistance = createDamageResistanceMap(p.damageResistance || {});
      p.statusEffects = Array.isArray(p.statusEffects) ? p.statusEffects : [];
      p.statusEffects = p.statusEffects.map(effect => normalizeStatusEffect(effect));
      syncPlayerAbilityIdsForLevels(p, { grantMissingOptional:true });

      // Migrate older saves that split skill training across skillBase + skillProficiency.
      for(const sk of SKILLS){
        const v = Number(p.skillProficiency[sk.id] || 0);
        const base = legacySkillBase ? Number(legacySkillBase[sk.id] || 0) : 0;
        const merged = Math.max(0, (isFinite(v) ? v : 0) + (isFinite(base) ? base : 0));
        p.skillProficiency[sk.id] = Math.min(skillProficiencyCap(p, sk.id), merged);
      }
      delete p.skillBase;

      p.skillPoints = Math.max(0, Number(p.skillPoints || 0));

      // Equipment + inventory migration: equipped items should not also live in inventory.
      p.equipment = p.equipment || {
        mainHand:null, offHand:null, armor:null,
        accessory_1:null, accessory_2:null, accessory_3:null, accessory_4:null
      };

      p.inventory = Array.isArray(p.inventory) ? p.inventory : [];
      const equippedIds = Object.values(p.equipment).filter(Boolean);
      for(const iid of equippedIds){
        if(hasItem(p, iid, 1)){
          removeItem(p, iid, 1);
        }
      }

      validateEquippedItems(p);
    }

    if(st.combat && st.combat.enemy){
      const enemy = st.combat.enemy;
      enemy.traits = Array.isArray(enemy.traits) ? enemy.traits : [];
      enemy.status = Array.isArray(enemy.status)
        ? enemy.status.map(entry => ({ ...entry, id: normalizeSaveId(entry && (entry.id || entry.label || entry.saveId || "")), dc: Number(entry && entry.dc || 0), label: entry && entry.label ? entry.label : saveLabel(entry && (entry.id || entry.label || entry.saveId || "")) }))
        : [];
      enemy.statusEffects = Array.isArray(enemy.statusEffects) ? enemy.statusEffects.map(effect => normalizeStatusEffect(effect)) : [];
      st.combat.playerFlags = st.combat.playerFlags && typeof st.combat.playerFlags === "object" ? st.combat.playerFlags : {};
    }

    if(st.ui.randomEventPrompt && !findRandomEventEntry(st, st.ui.randomEventPrompt.instanceId)){
      st.ui.randomEventPrompt = null;
    }
  }

  function captureWindowScroll(){
    return {
      x: Math.max(0, Number(window.scrollX || window.pageXOffset || 0)),
      y: Math.max(0, Number(window.scrollY || window.pageYOffset || 0))
    };
  }

  function restoreWindowScroll(pos){
    if(!pos) return;
    const left = Math.max(0, Number(pos.x || 0));
    const top = Math.max(0, Number(pos.y || 0));
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo(left, top);
      });
    });
  }

  function render(){
    const scrollPos = captureWindowScroll();
    clearExploreViewportSync();
    hideTooltip();
    if(!state || !state.player || state.tab !== "explore") window.onkeydown = null;

    if(!state.player){
      renderCharacterCreator();
    }else{
      renderGame();
    }

    restoreWindowScroll(scrollPos);

    try{
      save(state);
    }catch(_){
      // Ignore transient storage errors.
    }
  }

  function renderCharacterCreator(){
    const scrollPos = captureWindowScroll();
    hideTooltip();
    const stats = state._draftStats || {STR:8, DEX:8, CON:8, INT:8, WIS:8, CHA:8};
    const rawDraft = state._draft || { name:"", raceId:"human", classId:"Fighter", abilityId: normalizeOptionalAbilityChoiceForClass("Fighter", null) };
    const classId = CLASSES[rawDraft.classId] ? rawDraft.classId : "Fighter";
    const draft = {
      name: rawDraft.name || "",
      raceId: "human",
      classId,
      abilityId: normalizeOptionalAbilityChoiceForClass(classId, rawDraft.abilityId)
    };
    state._draft = { ...draft };

    const skillDraft = sanitizeSkillDraft(state._draftSkills || {});
    state._draftSkills = { ...skillDraft };

    const cost = totalPointCost(stats);
    const remaining = POINT_BUY_TOTAL - cost;
    const skillPool = startingSkillPointPoolForClass(draft.classId, stats);
    const draftSpent = Object.values(skillDraft).reduce((a, b) => a + (b || 0), 0);
    const skillAvailable = skillPool - draftSpent;
    const previewClass = CLASSES[draft.classId];
    const previewHp = Math.max(1, previewClass.hpPerLevel + statMod(stats.CON));
    const previewSp = Math.max(1, previewClass.spPerLevel + Math.max(0, statMod(stats.WIS)));
    const previewHpCap = Math.max(...Object.values(CLASSES).map(cls => Math.max(1, cls.hpPerLevel + statMod(stats.CON))));
    const previewSpCap = Math.max(...Object.values(CLASSES).map(cls => Math.max(1, cls.spPerLevel + Math.max(0, statMod(stats.WIS)))));
    const previewHpWidth = Math.max(38, Math.round((previewHp / previewHpCap) * 100));
    const previewSpWidth = Math.max(38, Math.round((previewSp / previewSpCap) * 100));
    const creatorNameLabel = (draft.name || "").trim() || "New Adventurer";
    const startingSkillId = CLASSES[draft.classId].startingTrainedSkill || null;
    const skillCapHint = startingSkillId
      ? `${escapeHtml(startingSkillId)} starts at <span class="mono">+2</span> proficiency and caps at <span class="mono">${skillProficiencyCap({ startingSkillId }, startingSkillId)}</span>`
      : `Max proficiency per skill: <span class="mono">${MAX_SKILL_INVEST}</span>`;
    const skillAvailabilityText = skillAvailable >= 0
      ? `Available: <span class="mono">${skillAvailable}</span>`
      : `Overspent by <span class="mono">${Math.abs(skillAvailable)}</span>`;
    const startSkillText = skillAvailable < 0
      ? `Reduce pending skill training by <strong>${Math.abs(skillAvailable)}</strong> point${Math.abs(skillAvailable) === 1 ? "" : "s"} before beginning.`
      : skillAvailable > 0
        ? `You still have <strong>${skillAvailable}</strong> unspent skill point${skillAvailable === 1 ? "" : "s"}. You can begin now and spend them later from the Character tab.`
        : `All starting skill points are assigned.`;

    $app.innerHTML = `
      <div class="topbar creatorTopbar">
        <div class="topbarLead">
          <div class="title">
            <h1>Findpather BETA</h1>
            <div class="subtitle">So you want to be an adventurer...</div>
          </div>
        </div>

        <div class="bars">
          <div>
            <div class="barlabel"><span>Projected HP</span><span class="mono">${previewHp}</span></div>
            <div class="bar hp"><div class="fill" style="width:${previewHpWidth}%"></div></div>
          </div>
          <div>
            <div class="barlabel"><span>Projected SP</span><span class="mono">${previewSp}</span></div>
            <div class="bar sp"><div class="fill" style="width:${previewSpWidth}%"></div></div>
          </div>
        </div>

        <div class="topmeta creatorTopmeta">
          <span class="pill"><strong id="creator_name_preview">${escapeHtml(creatorNameLabel)}</strong> <span>Lv 1</span></span>
          <span class="pill"><span class="muted">Class</span> <strong>${escapeHtml(draft.classId)}</strong></span>
          <span class="pill"><span class="muted">Ability Pts</span> <strong class="mono">${remaining}</strong></span>
          <span class="pill"><span class="muted">Skill Pts</span> <strong class="mono">${skillAvailable}</strong></span>
        </div>
      </div>

      <div class="creatorWrap">
        <div class="creatorCard">
          <header>
            <h2>Character Creation</h2>
            <p>Create your adventurer. Every detail is important!</p>
          </header>
          <div class="body">
            <div class="creatorLayout">
              <div class="creatorColumn creatorColumnLeft">
                <div class="field creatorFieldCard creatorName">
                  <header><strong>Name</strong></header>
                  <input id="cc_name" type="text" maxlength="24" placeholder="e.g., John FindPather" value="${escapeHtml(draft.name)}"/>
                </div>

                <div class="field creatorFieldCard creatorRace">
                  <header><strong>Race</strong></header>
                  <select id="cc_race" disabled>
                    <option value="human">Human</option>
                  </select>
                  <div class="small muted" style="margin-left:5px; line-height:1.5">The world is young, <strong>Humans</strong> rule the world for now.</div>
                </div>

                <div class="field creatorFieldCard creatorClass">
                  <header><strong>Class</header></strong>
                  <select id="cc_class">
                    ${Object.keys(CLASSES).map(cid => `<option value="${cid}" ${cid===draft.classId?"selected":""}>${cid}</option>`).join("")}
                  </select>
                </div>

                <div class="panel creatorPreview">
                  <header><h2>Class Preview</h2><div class="hint">Each class is a bit different, choose wisely!</div></header>
                  <div class="body" id="class_preview"></div>
                </div>
              </div>

              <div class="creatorColumn creatorColumnRight">
                <div class="panel creatorScores">
                  <header>
                    <h2>Ability Scores</h2>
                    <span class="pill"><span class="muted">Ability Points Available</span> <strong class="mono">${remaining}</strong></span>
                  </header>
                  <div class="body" id="pb_list"></div>
                </div>

                <div class="panel creatorSkills">
                  <header><h2>Skills</h2><span class="pill"><span class="muted">Skill Points available</span> <strong class="mono">${skillAvailable}</strong></span></header>
                  
                  <div class="body">
                    <div class="small muted" style="line-height:1.5; margin-bottom:10px">
                      ${startingSkillId ? `${escapeHtml(startingSkillId)} is your class-trained skill and begins at <strong>+2 proficiency</strong>.` : `Allocate your starting skill points here.`}
                    </div>
                    <div class="tableWrap">
                      <table class="table">
                        <thead>
                          <tr>
                            <th>Skill</th><th>Base</th><th>Prof</th><th>Total</th><th>Train</th>
                          </tr>
                        </thead>
                        <tbody id="cc_skill_list"></tbody>
                      </table>
                    </div>
                    <div class="small muted" style="margin-top:10px; line-height:1.5">
                      Unspent Skill points will still be available for later if you don't want to choose now!
                    </div>
                  </div>
                </div>
                <div class="panel creatorStart">
                  <header><h2>Start</h2><div class="hint">Your first steps into Astaria…</div></header>
                  <div class="body">
                    <div class="small muted" style="line-height:1.5">
                      <div>• You will start with basic gear, a healing potion, and a bit of coin.</div>
                      <div>• You can explore by moving around a fog-of-war map, gathering resources, and fighting monsters.</div>
                      <div>• Short rests recover some HP/SP on a cooldown; long rests are in town.</div>
                    </div>
                    <div class="small muted" style="margin-top:12px; line-height:1.5">${startSkillText}</div>
                    <div style="display:flex; gap:10px; margin-top:12px; flex-wrap:wrap">
                      <button class="btn primary" id="cc_start">Begin Adventure</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    const pbList = document.getElementById("pb_list");
    pbList.innerHTML = STATS.map(stat => {
      const v = stats[stat];
      const canDec = v > 8;
      const canInc = v < 15 && (totalPointCost({...stats, [stat]: v+1}) <= POINT_BUY_TOTAL);
      return `
        <div class="pointBuyRow">
          <div style="display:flex; align-items:center">
            <span class="badge statHint" data-stat-tip="${stat}">${fullStatName(stat)}</span>
          </div>
          <div class="pbControls">
            <button class="iconbtn" data-act="dec" data-stat="${stat}" ${canDec?"":"disabled"}>−</button>
            <span style="min-width:18px; text-align:center">${v}</span>
            <button class="iconbtn" data-act="inc" data-stat="${stat}" ${canInc?"":"disabled"}>+</button>
            <span class="muted" style="min-width:50px; text-align:right">(${fmtSigned(statMod(v))})</span>
          </div>
        </div>
      `;
    }).join("");

    pbList.querySelectorAll("button[data-act]").forEach(btn => {
      btn.addEventListener("click", () => {
        const act = btn.getAttribute("data-act");
        const stat = btn.getAttribute("data-stat");
        const cur = stats[stat];
        let next = cur;
        if(act === "dec") next = Math.max(8, cur-1);
        if(act === "inc") next = Math.min(15, cur+1);
        const candidate = {...stats, [stat]: next};
        if(totalPointCost(candidate) <= POINT_BUY_TOTAL){
          state._draftStats = candidate;
          renderCharacterCreator();
        }
      });
    });

    const skillList = document.getElementById("cc_skill_list");
    skillList.innerHTML = SKILLS.map(sk => {
      const base = statMod(stats[sk.stat]);
      const proficiency = startingSkillId === sk.id ? 2 : 0;
      const pending = skillDraft[sk.id] || 0;
      const total = base + proficiency + pending;
      const cap = skillProficiencyCap({ startingSkillId }, sk.id);
      const canDec = pending > 0;
      const canInc = skillAvailable > 0 && (proficiency + pending) < cap;
      const pendingLabel = pending > 0 ? `+${pending}` : "0";

      return `
        <tr>
          <td class="skillHint" data-skill-tip="${sk.id}">${sk.id}</td>
          <td class="mono">${fmtSigned(base)}</td>
          <td class="mono">${proficiency}</td>
          <td class="mono">${fmtSigned(total)}</td>
          <td>
            <div class="trainControls">
              <button class="btn ghost" data-creator-skill="${sk.id}" data-dir="dec" ${canDec?"":"disabled"}>−</button>
              <span class="pendingBadge ${pending ? "active" : ""}">${pendingLabel}</span>
              <button class="btn ghost" data-creator-skill="${sk.id}" data-dir="inc" ${canInc?"":"disabled"}>+</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    skillList.querySelectorAll("button[data-creator-skill]").forEach(btn => {
      btn.addEventListener("click", () => {
        const skillId = btn.getAttribute("data-creator-skill");
        const dir = btn.getAttribute("data-dir");
        const nextDraft = sanitizeSkillDraft(state._draftSkills || {});
        const spent = Object.values(nextDraft).reduce((a, b) => a + (b || 0), 0);
        const available = startingSkillPointPoolForClass(draft.classId, stats) - spent;
        const proficiency = startingSkillId === skillId ? 2 : 0;
        const pending = nextDraft[skillId] || 0;
        const cap = skillProficiencyCap({ startingSkillId }, skillId);

        if(dir === "inc"){
          if(available <= 0) return;
          if((proficiency + pending) >= cap){
            toast(`You can't raise ${skillId} above ${cap} proficiency.`, "warn");
            return;
          }
          nextDraft[skillId] = pending + 1;
          state._draftSkills = nextDraft;
          renderCharacterCreator();
          return;
        }

        if(pending <= 0) return;
        if(pending === 1) delete nextDraft[skillId];
        else nextDraft[skillId] = pending - 1;
        state._draftSkills = nextDraft;
        renderCharacterCreator();
      });
    });

    const nameEl = document.getElementById("cc_name");
    const creatorNamePreviewEl = document.getElementById("creator_name_preview");
    nameEl.addEventListener("input", () => {
      const currentDraft = state._draft || draft;
      const nextName = nameEl.value;
      state._draft = {...currentDraft, name: nextName};
      if(creatorNamePreviewEl){
        creatorNamePreviewEl.textContent = nextName.trim() || "New Adventurer";
      }
    });

    const classEl = document.getElementById("cc_class");
    classEl.addEventListener("change", () => {
      const currentDraft = state._draft || draft;
      const nextClassId = classEl.value;
      const nextAbilityId = normalizeOptionalAbilityChoiceForClass(nextClassId, currentDraft.abilityId);
      state._draft = {
        ...currentDraft,
        name: nameEl.value,
        classId: nextClassId,
        abilityId: nextAbilityId
      };
      renderCharacterCreator();
    });

    const preview = document.getElementById("class_preview");
    preview.innerHTML = renderClassPreview(draft.classId, stats, draft.abilityId);
    preview.querySelectorAll('input[name="cc_optional_ability"]').forEach(input => {
      input.addEventListener("change", () => {
        if(!input.checked) return;
        const currentDraft = state._draft || draft;
        state._draft = {
          ...currentDraft,
          name: nameEl.value,
          classId: classEl.value,
          abilityId: input.value
        };
        renderCharacterCreator();
      });
    });

    wireAbilityTooltips($app);
    wireStatTooltips($app);
    wireSkillTooltips($app);
    wireTextTooltips($app);
    restoreWindowScroll(scrollPos);

    document.getElementById("cc_start").addEventListener("click", () => {
      const currentDraft = state._draft || draft;
      const nm = (nameEl.value || currentDraft.name || "").trim();
      const selectedClassId = classEl.value || currentDraft.classId || "Fighter";
      const selectedAbilityEl = preview.querySelector('input[name="cc_optional_ability"]:checked');
      const selectedAbilityId = selectedAbilityEl
        ? selectedAbilityEl.value
        : normalizeOptionalAbilityChoiceForClass(selectedClassId, currentDraft.abilityId);
      const initialSkillDraft = sanitizeSkillDraft(state._draftSkills || {});
      if(!nm){
        alertDialog({ title: "Can't begin adventure", message: "Please enter a Name before beginning." });
        return;
      }
      if(remaining !== 0){
        if(remaining > 0) alertDialog({ title: "Can't begin adventure", message: `Spend all point-buy points before beginning (${remaining} remaining).` });
        else alertDialog({ title: "Can't begin adventure", message: "You have overspent point-buy points. Reduce some scores." });
        return;
      }
      if(skillAvailable < 0){
        alertDialog({ title: "Can't begin adventure", message: `You have overspent skill training by ${Math.abs(skillAvailable)} point${Math.abs(skillAvailable) === 1 ? "" : "s"}. Remove some training before beginning.` });
        return;
      }

      state.player = createNewPlayer({ name: nm, raceId: "human", classId: selectedClassId, stats, abilityId: selectedAbilityId, skillDraft: initialSkillDraft });
      state.world.areaId = "town";
      state.world.day = 1;
      state.world.areas = {};
      state.world.areaUnlocks = defaultAreaUnlocks();
      state.world.randomEvents = {};
      regenerateDailyRandomEvents(state);
      state.log = [];
      state.tab = "explore";
      state.combat = null;
      state.ui.combatNotice = null;
      state.ui.randomEventPrompt = null;
      state.cooldowns.shortRestReadyAt = 0;
      delete state._draft;
      delete state._draftStats;
      delete state._draftSkills;

      log(state, `Welcome to Astaria, ${state.player.name}.`);
      log(state, `You are a Human ${selectedClassId}.`);
      const defaultAbilityId = defaultStartingAbilityIdForClass(selectedClassId);
      if(defaultAbilityId){
        log(state, `Starting class ability: ${getAbility(defaultAbilityId).name}.`);
      }
      if(selectedAbilityId){
        log(state, `Optional level-1 ability selected: ${getAbility(selectedAbilityId).name}.`);
      }
      const initialSkillSummary = summarizeSkillDraft(initialSkillDraft);
      if(initialSkillSummary.length){
        log(state, `Starting skill training assigned: ${initialSkillSummary.join(", ")}.`);
      }
      save(state);
      render();
    });
  }

  function renderClassPreview(classId, stats, selectedAbilityId=null){
    const cls = CLASSES[classId];
    const conMod = statMod(stats.CON);
    const wisMod = statMod(stats.WIS);
    const hp = Math.max(1, cls.hpPerLevel + conMod);
    const sp = Math.max(1, cls.spPerLevel + Math.max(0, wisMod));
    const weap = cls.proficiencies.weapons;
    const arm = cls.proficiencies.armor;
    const weaponList = Object.entries(weap).filter(([,v]) => hasTrainingFlag(v)).map(([k]) => formatDamageTypeLabel(k)).join(", ") || "none";
    const armorList = Object.entries(arm).filter(([,v]) => hasTrainingFlag(v)).map(([k]) => formatDamageTypeLabel(k)).join(", ") || "none";
    const abilityIds = (cls.abilities || []).filter(id => !!ABILITIES[id]);
    const abilityList = renderAbilityBadgeList(abilityIds, "No class abilities");
    const startingAbilityId = defaultStartingAbilityIdForClass(classId);
    const optionalAbilityIds = classOptionalAbilityIds(classId);
    const selectedId = normalizeOptionalAbilityChoiceForClass(classId, selectedAbilityId);

    const saveLine = (id,label) => `${label} (+<span class="mono">${Number(cls.proficiencies.saves[id] || 0)}</span>)`;

    const startingAbility = startingAbilityId ? getAbility(startingAbilityId) : null;
    const startingAbilityCard = startingAbility ? `
      <div class="abilityChoiceSection">
        <div class="small muted" style="margin-bottom:8px"><strong>Starting Ability</strong></div>
        <div class="abilityChoiceCard selected">
          <div class="abilityChoiceBody">
            <div class="abilityChoiceTitle">
              ${abilityBadgeHtml(startingAbilityId)}
              <span class="badge">${escapeHtml(formatDamageTypeLabel(startingAbility.kind || "ability"))}</span>
            </div>
            <div class="small muted" style="line-height:1.45">${escapeHtml(abilitySummaryText(startingAbility))}</div>
          </div>
        </div>
      </div>
    ` : ``;

    const abilityChoices = optionalAbilityIds.length ? `
      <div class="abilityChoiceSection">
        <div class="small muted" style="margin-bottom:8px"><strong>Choose a Level 1 ability.</strong></div>
        <div class="abilityChoiceList">
          ${optionalAbilityIds.map(id => {
            const ability = getAbility(id);
            const checked = id === selectedId;
            return `
              <label class="abilityChoiceCard ${checked ? "selected" : ""}">
                <input type="radio" name="cc_optional_ability" value="${escapeHtml(id)}" ${checked ? "checked" : ""}/>
                <div class="abilityChoiceBody">
                  <div class="abilityChoiceTitle">
                    ${abilityBadgeHtml(id)}
                    <span class="badge">${escapeHtml(formatDamageTypeLabel(ability.kind || "ability"))}</span>
                  </div>
                  <div class="small muted" style="line-height:1.45">${escapeHtml(abilitySummaryText(ability))}</div>
                </div>
              </label>
            `;
          }).join("")}
        </div>
      </div>
    ` : `<div class="small muted" style="margin-top:12px">This class has no optional level-1 abilities.</div>`;

    return `
      <div class="kv"><div class="k">Key Ability</div><div class="v">${cls.keyAbilities.join(" / ")}</div></div>
      <div class="kv"><div class="k">Multiclass Requirement</div><div class="v">${escapeHtml(classRequirementText(classId))}</div></div>
      <div class="kv"><div class="k">Starting Skill</div><div class="v">${cls.startingTrainedSkill} <span class="muted">(+2 proficiency)</span></div></div>
      <div class="kv"><div class="k">HP at level 1</div><div class="v">${hp}</div></div>
      <div class="kv"><div class="k">SP at level 1</div><div class="v">${sp}</div></div>
      <div class="kv"><div class="k">Saving Throws</div><div class="v">${saveLine("fort","Fortitude")} | ${saveLine("reflex","Reflex")} | ${saveLine("will","Will")}</div></div>
      <div class="kv"><div class="k">Weapon Proficiency</div><div class="v">${escapeHtml(weaponList)}</div></div>
      <div class="kv"><div class="k">Armor Proficiency</div><div class="v">${escapeHtml(armorList)}</div></div>
      <div class="kv" style="align-items:flex-start"><div class="k">Class Abilities</div><div class="v" style="max-width:420px">${abilityList}</div></div>
      ${startingAbilityCard}
      ${abilityChoices}
    `;
  }

  function renderActionsMenu(){
    return `
      <div class="actionsMenu">
        <div class="actionsNav">
          ${tabButton("explore","Explore")}
          ${tabButton("combat","Combat", !state.combat)}
          ${tabButton("character","Character")}
          ${tabButton("inventory","Inventory")}
          ${tabButton("shop","Shop", (state.world.areaId!=="town"))}
          ${tabButton("settings","Settings")}
        </div>
        <div class="sidebarDivider"></div>
        <div class="saveToolsWrap">
          <button class="tabbtn mini saveToggleBtn" data-ui-action="toggle-save-tools">${state.ui.saveToolsVisible ? "Hide Save Menu" : "Save Menu"}</button>
          ${state.ui.saveToolsVisible ? `
            <div class="saveToolsGrid">
              <button class="tabbtn mini filledGrey" data-ui-action="save">Save</button>
              <button class="tabbtn mini filledGrey" data-ui-action="export">Export Save</button>
              <button class="tabbtn mini filledGrey" data-ui-action="import">Import Save</button>
              <button class="tabbtn mini filledDanger" data-ui-action="new">New Game</button>
            </div>
          ` : ``}
        </div>
      </div>
    `;
  }

  function renderLevelUpOverlay(preview){
    const player = state.player;
    const selectedClass = CLASSES[preview.classId];
    const statRows = STATS.map(stat => {
      const current = Number(player.stats[stat] || 0);
      const added = Number(preview.statAlloc[stat] || 0);
      const next = current + added;
      const maxRoom = Math.max(0, STAT_LEVEL_UP_CAP - current);
      const canDec = added > 0;
      const canInc = preview.statPointsRemaining > 0 && added < maxRoom;
      return `
        <div class="pointBuyRow">
          <div style="display:flex; align-items:center; gap:8px">
            <span class="badge statHint" data-stat-tip="${stat}">${fullStatName(stat)}</span>
          </div>
          <div class="pbControls">
            <button class="iconbtn" type="button" data-levelup-stat="${stat}" data-dir="dec" ${canDec ? "" : "disabled"}>−</button>
            <span class="mono" style="min-width:72px; text-align:center">${current} → ${next}</span>
            <button class="iconbtn" type="button" data-levelup-stat="${stat}" data-dir="inc" ${canInc ? "" : "disabled"}>+</button>
            <span class="muted" style="min-width:74px; text-align:right">(${fmtSigned(statMod(next))})</span>
          </div>
        </div>
      `;
    }).join("");

    const skillRows = SKILLS.map(sk => {
      const base = statMod(preview.stats[sk.stat]);
      const proficiency = player.skillProficiency[sk.id] || 0;
      const pending = preview.skillTrainDraft[sk.id] || 0;
      const total = base + proficiency + pending;
      const cap = skillProficiencyCap(player, sk.id);
      const canDec = pending > 0;
      const canInc = preview.skillTrainRemaining > 0 && (proficiency + pending) < cap;
      return `
        <tr>
          <td class="skillHint" data-skill-tip="${sk.id}">${sk.id}</td>
          <td class="mono">${fmtSigned(base)}</td>
          <td class="mono">${proficiency}</td>
          <td class="mono">${fmtSigned(total)}</td>
          <td>
            <div class="trainControls">
              <button class="btn ghost" type="button" data-levelup-skill="${sk.id}" data-dir="dec" ${canDec ? "" : "disabled"}>−</button>
              <span class="pendingBadge ${pending ? "active" : ""}">${pending > 0 ? `+${pending}` : "0"}</span>
              <button class="btn ghost" type="button" data-levelup-skill="${sk.id}" data-dir="inc" ${canInc ? "" : "disabled"}>+</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    return `
      <div class="levelUpOverlay" id="levelup_overlay">
        <div class="levelUpBackdrop" data-levelup-close></div>
        <div class="levelUpCard" role="dialog" aria-modal="true" aria-labelledby="levelup_title">
          <div class="levelUpHeader">
            <div>
              <div class="levelUpEyebrow">Level up available</div>
              <h2 id="levelup_title">${escapeHtml(player.name)} • Level ${preview.currentTotalLevel} → ${preview.nextTotalLevel}</h2>
              <div class="small muted" style="line-height:1.45">Choose your next class level, collect this level's rewards, and confirm. Multiclassing uses simple stat requirements and never grants extra starting proficiencies.</div>
            </div>
            <button class="btn ghost" type="button" data-levelup-close>✕</button>
          </div>

          <div class="levelUpSummaryGrid">
            <div class="levelUpSummaryCard"><div class="label">XP Cost</div><div class="value mono">${preview.xpCost}</div></div>
            <div class="levelUpSummaryCard"><div class="label">Class Advance</div><div class="value">${escapeHtml(preview.classId)} ${preview.currentClassLevel} → ${preview.newClassLevel}</div></div>
            <div class="levelUpSummaryCard"><div class="label">Level Gains</div><div class="value">+${preview.hpGain} HP • +${preview.spGain} SP • +${preview.skillPointGain} skill pt${preview.skillPointGain === 1 ? "" : "s"}</div></div>
            <div class="levelUpSummaryCard"><div class="label">Milestone Reward</div><div class="value">${preview.skillTier ? `Choose 1 level ${preview.skillTier} skill ability` : `Spend ${preview.statPointBudget} ability score point${preview.statPointBudget === 1 ? "" : "s"}`}</div></div>
          </div>

          <div class="levelUpMainGrid">
            <div class="levelUpSection">
              <header>
                <h3>Class Choice</h3>
                <div class="hint">First level in a class requires the listed stats.</div>
              </header>
              <div class="body">
                <div class="field">
                  <label for="levelup_class">Take a level in</label>
                  <select id="levelup_class">
                    ${Object.keys(CLASSES).map(cid => {
                      const current = Number(player.levels[cid] || 0);
                      const eligible = canTakeClassLevel(player, cid, preview.stats);
                      const reqText = classRequirementText(cid);
                      const levelText = `${current} → ${current + 1}`;
                      return `<option value="${cid}" ${cid === preview.classId ? "selected" : ""} ${eligible ? "" : "disabled"}>${escapeHtml(cid)} (${levelText})${current < 1 ? ` • Req: ${escapeHtml(reqText)}` : ""}${eligible ? "" : " • Locked"}</option>`;
                    }).join("")}
                  </select>
                </div>
                <div class="small muted" style="margin-top:10px; line-height:1.45">Requirement: <strong>${escapeHtml(preview.classRequirementText)}</strong>. This class level grants <strong>+${preview.hpGain} HP</strong>, <strong>+${preview.spGain} SP</strong>, and the class ability package shown below.</div>
                <div class="small muted" style="margin-top:8px; line-height:1.45">Key abilities: ${escapeHtml(selectedClass.keyAbilities.join(" / "))}</div>
                <div style="margin-top:10px">
                  <div class="small muted" style="margin-bottom:6px">Granted class abilities</div>
                  ${renderAbilityBadgeList(preview.classAbilityGrantIds, preview.currentClassLevel < 1 ? "Choose your first-level package below" : "No new class ability remains for this class right now")}
                </div>
                ${preview.currentClassLevel < 1 ? `
                  <div class="abilityChoiceSection">
                    <div class="small muted" style="margin-bottom:8px">Taking your first ${escapeHtml(preview.classId)} level grants <strong>${escapeHtml(defaultStartingAbilityIdForClass(preview.classId) ? getAbility(defaultStartingAbilityIdForClass(preview.classId)).name : "no default ability")}</strong> automatically. Choose 1 optional level-1 ability:</div>
                    <div class="abilityChoiceList">
                      ${classOptionalAbilityIds(preview.classId).map(id => {
                        const ability = getAbility(id);
                        const checked = id === preview.optionalAbilityId;
                        return `
                          <label class="abilityChoiceCard ${checked ? "selected" : ""}">
                            <input type="radio" name="lu_optional_ability" value="${escapeHtml(id)}" ${checked ? "checked" : ""}/>
                            <div class="abilityChoiceBody">
                              <div class="abilityChoiceTitle">
                                ${abilityBadgeHtml(id)}
                                <span class="badge">${escapeHtml(formatDamageTypeLabel(ability.kind || "ability"))}</span>
                              </div>
                              <div class="small muted" style="line-height:1.45">${escapeHtml(abilitySummaryText(ability))}</div>
                            </div>
                          </label>
                        `;
                      }).join("")}
                    </div>
                  </div>
                ` : ``}
              </div>
            </div>

            ${preview.skillTier ? `
              <div class="levelUpSection">
                <header>
                  <h3>Skill Ability • Level ${preview.skillTier}</h3>
                  <div class="hint">Choose one permanent skill ability for this even level.</div>
                </header>
                <div class="body">
                  ${preview.skillAbilityOptions.length ? `
                    <div class="abilityChoiceList">
                      ${preview.skillAbilityOptions.map(id => {
                        const ability = getAbility(id);
                        const checked = id === preview.skillAbilityId;
                        return `
                          <label class="abilityChoiceCard ${checked ? "selected" : ""}">
                            <input type="radio" name="lu_skill_ability" value="${escapeHtml(id)}" ${checked ? "checked" : ""}/>
                            <div class="abilityChoiceBody">
                              <div class="abilityChoiceTitle">
                                ${abilityBadgeHtml(id)}
                                <span class="badge">${escapeHtml(ability.skillId || "Skill")}</span>
                                <span class="badge">Level ${preview.skillTier}</span>
                              </div>
                              <div class="small muted" style="line-height:1.45">${escapeHtml(abilitySummaryText(ability))}</div>
                            </div>
                          </label>
                        `;
                      }).join("")}
                    </div>
                  ` : `<div class="small muted" style="line-height:1.45">No level ${preview.skillTier} skill abilities are implemented yet, so this level can still be taken without making a skill-ability choice.</div>`}
                </div>
              </div>
            ` : `
              <div class="levelUpSection">
                <header>
                  <h3>Ability Score Increase</h3>
                  <div class="hint">Odd levels grant 2 ability score points.</div>
                </header>
                <div class="body">
                  <div class="pointBuyRow" style="justify-content:space-between">
                    <div>Ability Score Points Remaining</div>
                    <div class="pbControls"><span class="mono">${preview.statPointsRemaining}</span> <span class="muted">/</span> <span class="mono">${preview.statPointBudget}</span></div>
                  </div>
                  <div style="display:grid; gap:10px; margin-top:12px">${statRows}</div>
                </div>
              </div>
            `}

            <div class="levelUpSection levelUpSkillsSection">
              <header>
                <h3>Skill Training</h3>
                <div class="hint">Gain ${preview.skillPointGain} point${preview.skillPointGain === 1 ? "" : "s"}; any remainder goes to the Character tab pool.</div>
              </header>
              <div class="body">
                <div class="tableWrap">
                  <table class="table">
                    <thead>
                      <tr>
                        <th>Skill</th><th>Base</th><th>Prof</th><th>Total</th><th>Train</th>
                      </tr>
                    </thead>
                    <tbody>${skillRows}</tbody>
                  </table>
                </div>
                <div class="small muted" style="margin-top:10px; line-height:1.45">Pending level-up training is only committed when you confirm this level. Unspent points are preserved as normal skill training points on the Character tab.</div>
              </div>
            </div>
          </div>

          <div class="levelUpFooter">
            <div class="small muted" style="line-height:1.45">${preview.canConfirm ? `Ready to confirm ${escapeHtml(preview.classId)} ${preview.newClassLevel}.` : escapeHtml(preview.blockers.join(" "))}</div>
            <div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:flex-end">
              <button class="btn" type="button" data-levelup-close>Close</button>
              <button class="btn primary levelReadyBtn" type="button" id="btn_levelup_confirm" ${preview.canConfirm ? "" : "disabled"}>Confirm Level Up</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function wireLevelUpOverlay(preview){
    const overlay = document.getElementById("levelup_overlay");
    if(!overlay) return;

    overlay.querySelectorAll('[data-levelup-close]').forEach(btn => {
      btn.addEventListener("click", () => closeLevelUpOverlay(state));
    });

    const classEl = document.getElementById("levelup_class");
    if(classEl){
      classEl.addEventListener("change", () => {
        const next = buildLevelUpPreview(state.player, {
          ...(state.ui.levelUpDraft || {}),
          classId: classEl.value
        });
        state.ui.levelUpDraft = levelUpDraftFromPreview(next);
        render();
      });
    }

    overlay.querySelectorAll('input[name="lu_optional_ability"]').forEach(input => {
      input.addEventListener("change", () => {
        if(!input.checked) return;
        const next = buildLevelUpPreview(state.player, {
          ...(state.ui.levelUpDraft || {}),
          optionalAbilityId: input.value
        });
        state.ui.levelUpDraft = levelUpDraftFromPreview(next);
        render();
      });
    });

    overlay.querySelectorAll('input[name="lu_skill_ability"]').forEach(input => {
      input.addEventListener("change", () => {
        if(!input.checked) return;
        const next = buildLevelUpPreview(state.player, {
          ...(state.ui.levelUpDraft || {}),
          skillAbilityId: input.value
        });
        state.ui.levelUpDraft = levelUpDraftFromPreview(next);
        render();
      });
    });

    overlay.querySelectorAll('button[data-levelup-stat]').forEach(btn => {
      btn.addEventListener("click", () => {
        const stat = btn.getAttribute("data-levelup-stat");
        const dir = btn.getAttribute("data-dir");
        const draft = {
          ...(state.ui.levelUpDraft || {}),
          statAlloc: { ...((state.ui.levelUpDraft && state.ui.levelUpDraft.statAlloc) || {}) }
        };
        const current = Number(draft.statAlloc[stat] || 0);
        if(dir === "inc") draft.statAlloc[stat] = current + 1;
        else if(current <= 1) delete draft.statAlloc[stat];
        else draft.statAlloc[stat] = current - 1;
        const next = buildLevelUpPreview(state.player, draft);
        state.ui.levelUpDraft = levelUpDraftFromPreview(next);
        render();
      });
    });

    overlay.querySelectorAll('button[data-levelup-skill]').forEach(btn => {
      btn.addEventListener("click", () => {
        const skillId = btn.getAttribute("data-levelup-skill");
        const dir = btn.getAttribute("data-dir");
        const draft = {
          ...(state.ui.levelUpDraft || {}),
          skillTrainDraft: { ...((state.ui.levelUpDraft && state.ui.levelUpDraft.skillTrainDraft) || {}) }
        };
        const current = Number(draft.skillTrainDraft[skillId] || 0);
        if(dir === "inc") draft.skillTrainDraft[skillId] = current + 1;
        else if(current <= 1) delete draft.skillTrainDraft[skillId];
        else draft.skillTrainDraft[skillId] = current - 1;
        const next = buildLevelUpPreview(state.player, draft);
        state.ui.levelUpDraft = levelUpDraftFromPreview(next);
        render();
      });
    });

    const confirmBtn = document.getElementById("btn_levelup_confirm");
    if(confirmBtn){
      confirmBtn.addEventListener("click", () => {
        levelUp(state, state.ui.levelUpDraft || {});
      });
    }
  }

  function renderCombatNoticeOverlay(){
    const notice = state && state.ui ? state.ui.combatNotice : null;
    if(!notice) return "";

    const kindClass = notice.kind === "good"
      ? "good"
      : notice.kind === "bad"
        ? "bad"
        : "neutral";
    const items = Array.isArray(notice.items) && notice.items.length ? notice.items : ["Nothing else changes."];

    return `
      <div class="centerOverlay">
        <div class="centerOverlayBackdrop" data-ui-action="dismiss-combat-notice"></div>
        <div class="centerCard noticeCard ${kindClass}" role="dialog" aria-modal="true" aria-labelledby="combat_notice_title">
          <div class="centerCardHeader">
            <div>
              <div class="centerCardEyebrow">Combat Result</div>
              <h3 class="centerCardTitle" id="combat_notice_title">${escapeHtml(notice.title || "Notice")}</h3>
            </div>
          </div>
          <div class="centerCardBody">
            <div class="centerCardSummary">${escapeHtml(notice.summary || "")}</div>
            <div class="centerCardSectionLabel">${escapeHtml(notice.sectionTitle || "Outcome")}</div>
            <div class="centerCardList">${items.map(item => `<div class="centerCardListItem">${escapeHtml(item)}</div>`).join("")}</div>
          </div>
          <div class="centerCardActions">
            <button class="btn primary" data-ui-action="dismiss-combat-notice">Dismiss</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderRandomEventOverlay(){
    const active = getActiveRandomEvent(state);
    if(!active) return "";

    const { template } = active;
    const dc = randomEventDc(state, template);
    const bonus = skillTotal(state.player, template.skill);
    const riskLabel = `${template.failDamage || "1d4"} ${formatDamageTypeLabel(template.failDamageType || "damage")}`;

    return `
      <div class="centerOverlay">
        <div class="centerOverlayBackdrop"></div>
        <div class="centerCard eventCard" role="dialog" aria-modal="true" aria-labelledby="random_event_title">
          <div class="centerCardHeader">
            <div>
              <div class="centerCardEyebrow">Random Event</div>
              <h3 class="centerCardTitle" id="random_event_title">${escapeHtml(template.title)}</h3>
            </div>
            <span class="pill"><span class="muted">Day</span> <strong class="mono">${state.world.day}</strong></span>
          </div>
          <div class="centerCardBody">
            <div class="centerCardSummary">${escapeHtml(template.description)}</div>
            <div class="eventPromptMeta">
              <span class="badge">${escapeHtml(template.skill)} check</span>
              <span class="badge">Bonus ${fmtSigned(bonus)}</span>
              <span class="badge">DC ${dc}</span>
            </div>
            <div class="small muted" style="line-height:1.5; margin-top:10px">Success grants ${escapeHtml(template.rewardHint || "a small reward")}. Failure deals a little damage (${escapeHtml(riskLabel)}). You can also ignore the event and move on.</div>
          </div>
          <div class="centerCardActions">
            <button class="btn" data-ui-action="ignore-random-event">Ignore</button>
            <button class="btn primary" data-ui-action="attempt-random-event">Attempt ${escapeHtml(template.skill)}</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderGame(){
    // Auto-generate area map if needed
    ensureAreaGenerated(state, state.world.areaId);

    const player = state.player;
    const tl = totalLevel(player);
    const area = getArea(state.world.areaId);
    const invSlots = calcInventorySlots(player);
    const ac = calcAC(player);
    const ap = attackProfile(player);
    const levelUpPreview = canLevelUp(player) ? buildLevelUpPreview(player, state.ui && state.ui.levelUpDraft || {}) : null;
    if(levelUpPreview){
      state.ui.levelUpDraft = levelUpDraftFromPreview(levelUpPreview);
    }else{
      state.ui.levelUpOpen = false;
      state.ui.levelUpDraft = {};
    }

    // Build layout scaffold
    $app.innerHTML = `
      <div class="topbar">
        <div class="topbarLead">
          <button class="btn mobileActionsToggle" data-ui-action="toggle-mobile-actions" aria-label="${state.ui.mobileActionsVisible ? "Hide menu" : "Show menu"}" aria-expanded="${state.ui.mobileActionsVisible ? "true" : "false"}">${state.ui.mobileActionsVisible ? "✕" : "☰"}</button>
          <div class="title">
            <h1>Pathfinder Explorer</h1>
            <div class="subtitle">exploration-first d20 prototype</div>
          </div>
        </div>

        <div class="bars">
          <div>
            <div class="barlabel"><span>HP</span><span class="mono">${player.hp.current}/${player.hp.max}</span></div>
            <div class="bar hp"><div class="fill" style="width:${Math.round((player.hp.current/player.hp.max)*100)}%"></div></div>
          </div>
          <div>
            <div class="barlabel"><span>SP</span><span class="mono">${player.sp.current}/${player.sp.max}</span></div>
            <div class="bar sp"><div class="fill" style="width:${Math.round((player.sp.current/player.sp.max)*100)}%"></div></div>
          </div>
        </div>

        <div class="topmeta">
          <span class="pill"><strong>${player.name}</strong> <span>Lv ${tl}</span></span>
          <span class="pill"><span class="muted">${area.name}</span></span>
          <span class="pill"><span class="muted">Day</span> <strong class="mono">${state.world.day}</strong></span>
          <span class="pill"><span class="muted">Money</span> <strong class="mono">${formatCoins(player.moneyCp)}</strong></span>
          <button class="btn" id="btn_shortrest">Short Rest</button>
          <button class="btn" id="btn_longrest" ${state.world.areaId==="town" ? "" : "disabled"}>Long Rest</button>
        </div>
      </div>

      <div class="mobileActionsDock ${state.ui.mobileActionsVisible ? "" : "hidden"}">
        <div class="mobileActionsInner">
          <div class="panel mobileActionsPanel">
            <div class="body">
              ${renderActionsMenu()}
            </div>
          </div>
        </div>
      </div>

      <div class="content">
        <div class="panel sidebar sidebarDesktop">
          <div class="body">
            ${renderActionsMenu()}
          </div>
        </div>

        <div class="panel main">
          <header><h2 id="main_title"></h2><div class="hint" id="main_hint"></div></header>
          <div class="body" id="main_body"></div>
        </div>

        <div class="panel right">
          <header><h2>Character Sheet</h2><div class="hint">quick view</div></header>
          <div class="body">
            <div class="kv"><div class="k">Race</div><div class="v">${RACES.find(r=>r.id===player.raceId)?.name || "Human"}</div></div>
            <div class="kv"><div class="k">Class levels</div><div class="v">${renderLevels(player)}</div></div>
            <div class="kv"><div class="k">Armor Class</div><div class="v">${ac}</div></div>
            <div class="kv"><div class="k">Attack</div><div class="v">${ap.weaponName} <span class="muted">(${fmtSigned(ap.attackBonus)})</span></div></div>
            <div class="kv"><div class="k">Damage</div><div class="v">${ap.damageExpr} ${ap.damageType}</div></div>
            <div class="kv"><div class="k">Fort / Ref / Will</div><div class="v">${fmtSigned(saveTotal(player,"fort"))} / ${fmtSigned(saveTotal(player,"reflex"))} / ${fmtSigned(saveTotal(player,"will"))}</div></div>
            <div class="kv"><div class="k">Inventory</div><div class="v">${invSlots.used}/${invSlots.max} slots${invSlots.bonus ? ` <span class="muted">(+${invSlots.bonus} carry)</span>` : ""}</div></div>
            <div class="kv" style="align-items:flex-start"><div class="k">Abilities</div><div class="v" style="max-width:220px">${renderPlayerAbilityBadgeList(player, { emptyText:"None" })}</div></div>
            <div class="kv" style="align-items:flex-start"><div class="k">Status Effects</div><div class="v" style="max-width:220px">${renderStatusEffectBadges(player, "None")}</div></div>
            <div class="kv" style="align-items:flex-start"><div class="k">Resistances</div><div class="v" style="max-width:220px">${renderResistanceBadgeList(player, "None")}</div></div>
            <div class="kv"><div class="k">XP</div><div class="v">${isMaxLevel(player) ? `${player.xp} <span class="badge">Max Level ${maxLevelCap()}</span>` : `${player.xp} / ${xpToNextLevel(player)} ${canLevelUp(player) ? '<span class="badge warn">Level Up Ready</span>' : ''}`}</div></div>
            ${isMaxLevel(player) ? `<div class="small muted" style="margin-top:10px; line-height:1.45">You have reached the current level cap of ${maxLevelCap()}. Increase <span class="mono">GAME_CONFIG.maxLevel</span> to raise it later.</div>` : canLevelUp(player) ? `<div class="small muted" style="margin-top:10px; line-height:1.45">You have enough experience to level up. Open the Character tab to choose your class advance, spend this level's rewards, and confirm the change.</div>` : ``}
          </div>
        </div>
      </div>

      <div class="logfooter">
        <div class="panel">
          <header><h2>Log</h2><div class="hint">${currentLogMode(state) === LOG_MODES.detail ? "detail hover enabled" : "last events"}</div></header>
          <div class="body" id="log_body"></div>
        </div>
      </div>

      ${state.ui.levelUpOpen && levelUpPreview ? renderLevelUpOverlay(levelUpPreview) : ""}
      ${renderCombatNoticeOverlay()}
      ${renderRandomEventOverlay()}
    `;

    // Hook up top buttons
    document.getElementById("btn_shortrest").addEventListener("click", () => shortRest(state));
    document.getElementById("btn_longrest").addEventListener("click", () => longRest(state));

    // Tab buttons
    document.querySelectorAll(".tabbtn[data-tab]").forEach(btn => {
      btn.addEventListener("click", () => {
        const tab = btn.getAttribute("data-tab");
        if(btn.disabled) return;
        state.tab = tab;
        state.ui.mobileActionsVisible = false;
        render();
      });
    });

    document.querySelectorAll('[data-ui-action="toggle-mobile-actions"]').forEach(btn => {
      btn.addEventListener("click", () => {
        state.ui.mobileActionsVisible = !state.ui.mobileActionsVisible;
        render();
      });
    });

    document.querySelectorAll('[data-ui-action="toggle-save-tools"]').forEach(btn => {
      btn.addEventListener("click", () => {
        state.ui.saveToolsVisible = !state.ui.saveToolsVisible;
        render();
      });
    });

    document.querySelectorAll('[data-ui-action="save"]').forEach(btn => {
      btn.addEventListener("click", () => {
        state.ui.mobileActionsVisible = false;
        save(state);
        log(state, "Game saved.");
        render();
      });
    });

    document.querySelectorAll('[data-ui-action="export"]').forEach(btn => {
      btn.addEventListener("click", () => {
        state.ui.mobileActionsVisible = false;
        exportSave();
      });
    });

    document.querySelectorAll('[data-ui-action="import"]').forEach(btn => {
      btn.addEventListener("click", () => {
        state.ui.mobileActionsVisible = false;
        importSave();
      });
    });

    document.querySelectorAll('[data-ui-action="new"]').forEach(btn => {
      btn.addEventListener("click", async () => {
        state.ui.mobileActionsVisible = false;
        const ok = await confirmDialog({
          title: "Start a New Game?",
          message: "This will permanently replace your current local save and reset your character, progress, map exploration, inventory, and log.",
          okText: "Start New Game",
          cancelText: "Keep Current Save",
          okKind: "danger"
        });
        if(!ok) return;
        wipeSave();
        state = defaultState();
        render();
      });
    });

    // Render active tab
    renderActiveTab();
    if(state.ui.levelUpOpen && levelUpPreview){
      wireLevelUpOverlay(levelUpPreview);
    }
    wireAbilityTooltips($app);
    wireStatTooltips($app);
    wireStatusTooltips($app);
    wireSkillTooltips($app);
    wireTextTooltips($app);

    document.querySelectorAll('[data-ui-action="dismiss-combat-notice"]').forEach(btn => {
      btn.addEventListener("click", () => dismissCombatNotice(state));
    });
    document.querySelectorAll('[data-ui-action="attempt-random-event"]').forEach(btn => {
      btn.addEventListener("click", () => resolveRandomEventAttempt(state));
    });
    document.querySelectorAll('[data-ui-action="ignore-random-event"]').forEach(btn => {
      btn.addEventListener("click", () => ignoreRandomEvent(state));
    });

    // Render log footer
    const logBody = document.getElementById("log_body");
    logBody.innerHTML = renderLogEntries(state.log, { limit:18 });
  }

  function tabButton(id, label, disabled=false){
    const active = state.tab === id;
    const needsLevelAlert = id === "character" && state && state.player && canLevelUp(state.player);
    return `<button class="tabbtn ${active?"active":""} ${needsLevelAlert ? "attention" : ""}" data-tab="${id}" ${disabled?"disabled":""}><span>${label}</span>${needsLevelAlert ? '<span class="menuAlertDot">Level Up</span>' : ''}</button>`;
  }

  function renderLevels(player){
    const parts = Object.entries(player.levels)
      .filter(([k,v])=>v>0)
      .map(([k,v])=>`${k}:${v}`);
    return parts.length ? `<span class="mono">${parts.join(" ")}</span>` : "—";
  }

  function renderActiveTab(){
    const title = document.getElementById("main_title");
    const hint = document.getElementById("main_hint");
    const body = document.getElementById("main_body");

    switch(state.tab){
      case "explore":
        title.textContent = "Explore";
        hint.textContent = "Explore, gather resources, and fight monsters!";
        body.innerHTML = renderExploreTab();
        wireExploreTab();
        break;
      case "combat":
        title.textContent = "Combat";
        hint.textContent = "A simple d20 system (attack vs AC; nat 20 crit; nat 1 fumble).";
        body.innerHTML = renderCombatTab();
        wireCombatTab();
        break;
      case "character":
        title.textContent = "Character";
        hint.textContent = "Stats, saves, skills, and proficiencies.";
        body.innerHTML = renderCharacterTab();
        wireCharacterTab();
        break;
      case "inventory":
        title.textContent = "Inventory";
        hint.textContent = "Inventory capacity increases with the more Strength you have.";
        body.innerHTML = renderInventoryTab();
        wireInventoryTab();
        break;
      case "shop":
        title.textContent = "Shop";
        hint.textContent = state.world.areaId==="town" ? "Buy and sell at your leisure." : "You need to be in town to shop.";
        body.innerHTML = renderShopTab();
        wireShopTab();
        break;
      case "log":
        title.textContent = "Log";
        hint.textContent = currentLogMode(state) === LOG_MODES.detail ? "Full event log with hover breakdowns for rolls and modifiers." : "Full event log.";
        body.innerHTML = renderLogEntries(state.log);
        break;
      case "settings":
        title.textContent = "Settings";
        hint.textContent = "Display and UI options.";
        body.innerHTML = renderSettingsTab();
        wireSettingsTab();
        break;
      default:
        state.tab = "explore";
        renderActiveTab();
    }
  }

  function renderExplorationAbilitiesPanel(){
    const activeExploreAbilities = playerAbilityIds(state.player)
      .filter(id => getAbility(id).kind === "active" && (getAbility(id).contexts || []).includes("exploration"));
    const passiveExploreAbilities = playerAbilityIds(state.player)
      .filter(id => getAbility(id).kind === "passive" && (getAbility(id).contexts || []).includes("exploration"));

    const activeButtons = activeExploreAbilities.map(id => {
      const ability = getAbility(id);
      const availability = canUseActiveAbility(state, id);
      const disabled = availability.ok ? "" : "disabled";
      return `<button class="btn" data-ability-use="${ability.id}" data-ability="${ability.id}" ${disabled}>${escapeHtml(ability.name)}</button>`;
    }).join("");

    const sections = [];
    if(activeExploreAbilities.length){
      sections.push(`
        <div style="margin-bottom:${passiveExploreAbilities.length ? "12px" : "0"}">
          <div class="small muted" style="margin-bottom:6px">Active exploration abilities</div>
          <div style="display:flex; gap:8px; flex-wrap:wrap">${activeButtons}</div>
        </div>
      `);
    }
    if(passiveExploreAbilities.length){
      sections.push(`
        <div>
          <div class="small muted" style="margin-bottom:6px">Passive exploration abilities</div>
          ${renderAbilityBadgeList(passiveExploreAbilities, "")}
        </div>
      `);
    }

    return `
      <div class="panel">
        <header><h2>Exploration Abilities</h2><div class="hint">Movement, scouting, and utility outside combat.</div></header>
        <div class="body">
          <div class="small muted" style="line-height:1.45; margin-bottom:${sections.length ? "10px" : "0"}">Search, scouting, and movement abilities appear here. Passive exploration abilities are always on; active ones spend SP when used.</div>
          ${sections.length ? sections.join("") : `<div class="small muted">This character currently has no exploration abilities outside combat.</div>`}
        </div>
      </div>
    `;
  }

  function renderExploreTab(){
    const area = getArea(state.world.areaId);
    const inTown = state.world.areaId === "town";
    const canTravel = canTravelNow(state);
    const hideTravelSelect = (!canTravel && area.map && !inTown);
    const travelOptions = visibleTravelAreas(state);

    const tile = currentTile(state);
    const dungeonDestination = currentDungeonDestination(state);
    const tileInfo = tile ? renderTileInfo(tile, state.world.areaId) : `
      <div class="small muted">No map in this area.</div>
    `;

    return `
      <div class="grid" style="gap:12px">
        <div class="panel">
          <header><h2>Location</h2><div class="hint">${area.description}</div></header>
          <div class="body">
            <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; justify-content:space-between">
              <div>
                <div class="pill"><span class="muted">Current</span> <strong>${area.name}</strong> <span class="muted">Lv ${area.level}</span></div>
              </div>
              <div style="display:flex; gap:8px; flex-wrap:wrap">
                <select id="area_select" ${canTravel?"":"disabled"} class="${hideTravelSelect?"hidden":""}" style="min-width:220px; background:rgba(17,21,34,.65); color:var(--text); border:1px solid var(--border); border-radius:10px; padding:8px">
                  ${travelOptions.map(a => `<option value="${a.id}" ${a.id===area.id?"selected":""}>${escapeHtml(travelAreaLabel(a))}</option>`).join("")}
                </select>
                ${hideTravelSelect ? `<div class="small muted" style="padding:8px 0">${state.combat ? "Travel is disabled during combat." : `Travel is only available from the <strong>Home</strong> tile (${MAP_ICONS.home}).`}</div>` : ``}
              </div>
            </div>
          </div>
        </div>

        ${area.map ? `
          <div class="mapWrap">
            <div class="mapPane" id="map_pane">
              <div class="mapViewport" id="map_viewport">
                <div class="map" id="map"></div>
              </div>
              <div class="mapControls">
                <button class="btn" id="mv_n">↑</button>
                <button class="btn" id="mv_s">↓</button>
                <button class="btn" id="mv_w">←</button>
                <button class="btn" id="mv_e">→</button>
                ${tile && tile.home && state.world.areaId !== "town" ? `<button class="btn primary" id="btn_enter_town">Enter Town</button>` : ``}
                ${dungeonDestination ? `<button class="btn primary" id="btn_enter_dungeon">${escapeHtml(dungeonEnterLabel(dungeonDestination))}</button>` : ``}
                <button class="btn" id="btn_search" ${state.combat ? "disabled":""}>Search (1 SP)</button>
                <button class="btn" id="btn_gather" ${(!tile || tile.type!=="resource" || tile.resolved) ? "disabled":""}>Gather (1 SP)</button>
              </div>
            </div>
            <div class="mapInfoPane">
              <div class="panel">
                <header><h2>Tile</h2><div class="hint">What you see here depends on Perception and choices.</div></header>
                <div class="body" id="tile_info">${tileInfo}</div>
              </div>
            </div>
          </div>

          <div class="panel">
            <header><h2>Map Notes</h2><div class="hint">Legend and camera settings.</div></header>
            <div class="body">
              <div style="display:flex; gap:12px; align-items:flex-start; justify-content:space-between; flex-wrap:wrap">
                <div>
                  <div class="small muted" style="margin-bottom:6px; line-height:1.4">Map legend</div>
                  <div class="mapLegend">${renderMapLegend()}</div>
                </div>
                <div style="max-width:360px">
                  <button class="btn" id="btn_map_camera_mode" data-tooltip="Toggle how the map camera behaves while you move around the current area.">Camera: ${cameraModeLabel(state.ui.mapCameraMode)}</button>
                  <div class="small muted" style="margin-top:6px; line-height:1.4">${state.ui.mapCameraMode === MAP_CAMERA_MODES.follow ? "Follow mode only shifts when you move within 3 tiles of a viewport edge." : "Fixed mode keeps you as close to the center of the viewport as possible."}</div>
                </div>
              </div>
            </div>
          </div>

          ${renderExplorationAbilitiesPanel()}
        ` : `
          <div class="panel">
            <header><h2>Town Options</h2><div class="hint">Safe actions</div></header>
            <div class="body">
              <div class="split">
                <div>
                  <div class="big">Astaria</div>
                  <div class="small muted" style="line-height:1.5; margin-top:6px">
                    • Long rest to full HP/SP<br/>
                    • Visit the shop to buy/sell gear and potions<br/>
                    • Travel out to explore
                  </div>
                </div>
                <div>
                  <div class="small muted" style="margin-bottom:8px">Quick actions</div>
                  <div style="display:flex; gap:8px; flex-wrap:wrap">
                    <button class="btn primary" id="btn_longrest2">Long Rest</button>
                    <button class="btn" id="btn_shop">Go to Shop</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          ${renderExplorationAbilitiesPanel()}
        `}
      </div>
    `;
  }

  function renderTileInfo(tile, areaId=state.world.areaId){
    const terrainBadge = terrainBadgeHtml(tile.terrain || "unknown");

    if(!tile.revealed) return `
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px">
        ${terrainBadge}
        <span class="badge">Unexplored</span>
      </div>
      <div class="small muted">You haven't revealed what's here yet. Use <strong>Search</strong> to scout nearby tiles.</div>
    `;

    if(tile.home){
      if(tile.type === "dungeon" && tile.content){
        const destination = getArea(tile.content);
        const linkedArea = tile.linkedDungeonAreaId ? getArea(tile.linkedDungeonAreaId) : null;
        return `
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px">
            ${terrainBadge}
            <span class="badge warn">Travel Tile</span>
            <span class="badge warn">Entrance</span>
            <span class="badge">${escapeHtml(destination.name)}</span>
          </div>
          <div class="small muted">This is your area's entrance tile. You can <strong>Travel</strong> between locations from here, use <strong>Enter Town</strong> to return to safety, or stand here and use <strong>${escapeHtml(dungeonEnterLabel(destination))}</strong> to return to the linked ${escapeHtml(destination.name)} entrance${linkedArea ? ` for <strong>${escapeHtml(linkedArea.name)}</strong>` : ""}.</div>
        `;
      }
      return `
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px">
          ${terrainBadge}
          <span class="badge warn">Travel Tile</span>
        </div>
        <div class="small muted">This is the area's travel tile. You can <strong>Travel</strong> between locations from here, and use <strong>Enter Town</strong> to return to safety.</div>
      `;
    }
    if(tile.type === "dungeon"){
      const destination = getArea(tile.content);
      return `
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px">
          ${terrainBadge}
          <span class="badge warn">Dungeon</span>
          <span class="badge">${escapeHtml(destination.name)}</span>
        </div>
        <div class="small muted">This entrance leads to <strong>${escapeHtml(destination.name)}</strong> (level ${destination.level}). Stand here and use <strong>${escapeHtml(dungeonEnterLabel(destination))}</strong> to travel there for free.</div>
      `;
    }
    if(tile.type === "monster" && !tile.resolved){
      const m = getMonster(tile.content);
      return `
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px">
          ${terrainBadge}
          <span class="badge bad">Monster</span>
          <span class="badge">Likely: ${m.name}</span>
        </div>
        <div class="small muted">Entering this tile triggers an encounter automatically.</div>
      `;
    }
    if(tile.type === "resource" && !tile.resolved){
      const r = getItem(tile.content);
      return `
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px">
          ${terrainBadge}
          <span class="badge good">Resource</span>
          <span class="badge">${r.name}</span>
        </div>
        <div class="small muted">Use <strong>Gather</strong> (1 SP) to collect resources. Check uses Survival or Crafting.</div>
      `;
    }
    if(tile.type === "treasure" && !tile.resolved){
      return `
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px">
          ${terrainBadge}
          <span class="badge warn">Treasure</span>
        </div>
        <div class="small muted">Treasure is opened automatically when you step onto it.</div>
      `;
    }
    const searchRadius = hasAbility(state.player, "eagle_eye") ? 2 : 1;
    return `
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px">
        ${terrainBadge}
        <span class="badge">Clear</span>
      </div>
      <div class="small muted">This tile seems quiet. Use <strong>Search</strong> (1 SP) to make a Perception check and reveal nearby tiles (radius ${searchRadius}).</div>
    `;
  }

  function wireExploreTab(){
    const areaSelect = document.getElementById("area_select");
    if(areaSelect){
      areaSelect.addEventListener("change", () => {
        const target = areaSelect.value;
        // Always snap back if travel isn't allowed.
        if(!canTravelNow(state)){
          areaSelect.value = state.world.areaId;
          return;
        }
        travelTo(state, target);
      });
    }

    const btnLong = document.getElementById("btn_longrest2");
    if(btnLong){
      btnLong.addEventListener("click", () => longRest(state));
      document.getElementById("btn_shop").addEventListener("click", () => { state.tab="shop"; render(); });
    }

    document.querySelectorAll("button[data-ability-use]").forEach(btn => {
      btn.addEventListener("click", () => {
        const abilityId = btn.getAttribute("data-ability-use");
        useActiveAbility(state, abilityId);
      });
    });

    const mapEl = document.getElementById("map");
    const area = getArea(state.world.areaId);
    if(area.map && mapEl){
      const aState = state.world.areas[state.world.areaId];
      const mapPaneEl = document.getElementById("map_pane");
      const mapViewportEl = document.getElementById("map_viewport");
      const tileInfoEl = document.getElementById("tile_info");

      const renderMapViewport = () => {
        if(!mapPaneEl || !mapViewportEl || !mapEl) return;
        const layout = computeMapViewportLayout(aState, mapPaneEl, mapViewportEl);
        const view = computeVisibleMapWindow(state, state.world.areaId, aState, layout.cols, layout.rows);
        mapViewportEl.style.setProperty("--map-cell-size", `${layout.cellSize}px`);
        mapViewportEl.style.width = "100%";
        mapViewportEl.style.height = `${layout.height}px`;
        mapEl.style.setProperty("--map-cols", String(view.cols));
        mapEl.style.width = `${layout.gridWidth}px`;
        mapEl.style.height = `${layout.gridHeight}px`;
        mapEl.innerHTML = "";

        for(let y=view.y; y<view.y + view.rows; y++){
          for(let x=view.x; x<view.x + view.cols; x++){
            const tile = aState.tiles[y][x];
            const isPlayer = (x===aState.px && y===aState.py);
            const cell = document.createElement("div");
            const terrainCls = tile.terrain ? ` terrain-${tile.terrain}` : "";
            const symbol = isPlayer ? MAP_ICONS.player : tileSymbol(tile);
            cell.className = "tile" + terrainCls + (tile.type === "dungeon" ? " dungeon" : "") + (tile.revealed ? " revealed" : " fog") + (tile.home ? " home" : "") + (isPlayer ? " player" : "") + (!symbol ? " tileBlank" : "");
            cell.textContent = symbol || "";

            const terrainName = tile.terrain ? (tile.terrain.charAt(0).toUpperCase() + tile.terrain.slice(1)) : "Unknown";
            const status = !tile.revealed
              ? "Unrevealed"
              : tile.home
                ? "Home"
                : tile.type === "dungeon"
                  ? "Dungeon"
                  : (tile.type !== "empty" && !tile.resolved ? formatDamageTypeLabel(tile.type) : "Clear");
            const tileTooltipHtml = `
              <div style="font-weight:700; font-size:13px; margin-bottom:6px">Tile [${x+1}, ${y+1}]</div>
              <div class="trow"><div class="k">Terrain</div><div class="v">${escapeHtml(terrainName)}</div></div>
              <div class="trow"><div class="k">Status</div><div class="v">${escapeHtml(status)}</div></div>
              ${isPlayer ? `<div class="badgeWrap" style="margin-top:8px"><span class="badge good">you are here</span></div>` : ``}
            `;

            cell.addEventListener("mouseenter", (e) => {
              state.ui.selectedTile = {x,y};
              if(tileInfoEl) tileInfoEl.innerHTML = renderTileInfo(tile, state.world.areaId);
              showTooltip(tileTooltipHtml, e.clientX, e.clientY);
            });
            cell.addEventListener("mousemove", (e) => {
              showTooltip(tileTooltipHtml, e.clientX, e.clientY);
            });
            cell.addEventListener("mouseleave", () => hideTooltip());
            mapEl.appendChild(cell);
          }
        }
      };

      renderMapViewport();
      requestAnimationFrame(() => {
        if(state.tab === "explore" && document.getElementById("map") === mapEl) renderMapViewport();
      });
      setExploreViewportSync(renderMapViewport, mapPaneEl, mapViewportEl, mapEl);

      const btnN = document.getElementById("mv_n");
      const btnS = document.getElementById("mv_s");
      const btnW = document.getElementById("mv_w");
      const btnE = document.getElementById("mv_e");

      const syncMoveDisabled = () => {
        btnN.disabled = isDirectionBlocked(state, 0, -1);
        btnS.disabled = isDirectionBlocked(state, 0,  1);
        btnW.disabled = isDirectionBlocked(state, -1, 0);
        btnE.disabled = isDirectionBlocked(state,  1, 0);
      };
      syncMoveDisabled();

      btnN.addEventListener("click", ()=>{ if(btnN.disabled) return; movePlayer(state,0,-1); });
      btnS.addEventListener("click", ()=>{ if(btnS.disabled) return; movePlayer(state,0,1); });
      btnW.addEventListener("click", ()=>{ if(btnW.disabled) return; movePlayer(state,-1,0); });
      btnE.addEventListener("click", ()=>{ if(btnE.disabled) return; movePlayer(state,1,0); });

      const btnCameraMode = document.getElementById("btn_map_camera_mode");
      if(btnCameraMode){
        btnCameraMode.addEventListener("click", () => {
          state.ui.mapCameraMode = state.ui.mapCameraMode === MAP_CAMERA_MODES.fixed ? MAP_CAMERA_MODES.follow : MAP_CAMERA_MODES.fixed;
          save(state);
          render();
        });
      }

      const enterBtn = document.getElementById("btn_enter_town");
      if(enterBtn) enterBtn.addEventListener("click", ()=>travelTo(state, "town"));

      const enterDungeonBtn = document.getElementById("btn_enter_dungeon");
      const dungeonDestination = currentDungeonDestination(state);
      if(enterDungeonBtn && dungeonDestination){
        enterDungeonBtn.addEventListener("click", ()=>travelTo(state, dungeonDestination.area.id, {
          bypassTravelRequirement:true,
          viaDungeon:true,
          arrivalX: dungeonDestination.arrivalX,
          arrivalY: dungeonDestination.arrivalY
        }));
      }

      document.getElementById("btn_gather").addEventListener("click", ()=>gatherResource(state));
      document.getElementById("btn_search").addEventListener("click", ()=>searchTile(state));

      // keyboard arrows
      window.onkeydown = (e) => {
        if(state.tab !== "explore") return;
        if(state.combat || hasBlockingCenterOverlay(state)) return;
        if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key)) e.preventDefault();
        if(e.key==="ArrowUp" && !isDirectionBlocked(state,0,-1)) movePlayer(state,0,-1);
        if(e.key==="ArrowDown" && !isDirectionBlocked(state,0,1)) movePlayer(state,0,1);
        if(e.key==="ArrowLeft" && !isDirectionBlocked(state,-1,0)) movePlayer(state,-1,0);
        if(e.key==="ArrowRight" && !isDirectionBlocked(state,1,0)) movePlayer(state,1,0);
      };
    }else{
      window.onkeydown = null;
    }
  }

  function renderCombatTab(){
    if(!state.combat){
      return `
        <div class="small muted">You are not currently in combat.</div>
        <div style="margin-top:10px"><button class="btn" id="btn_back">Return to Explore</button></div>
      `;
    }
    const e = state.combat.enemy;
    const ap = attackProfile(state.player);
    const offAp = offHandAttackProfile(state.player);
    const dualAgileAttack = !!(ap && ap.weapon && ap.isAgileWeapon && offAp && offAp.weapon && offAp.isAgileWeapon);
    const activeCombatAbilities = playerAbilityIds(state.player)
      .filter(id => getAbility(id).kind === "active" && (getAbility(id).contexts || []).includes("combat"));
    const passiveCombatAbilities = playerAbilityIds(state.player)
      .filter(id => getAbility(id).kind === "passive" && (getAbility(id).contexts || []).includes("combat"));
    const activeButtons = activeCombatAbilities.length
      ? activeCombatAbilities.map(id => {
          const ability = getAbility(id);
          const availability = canUseActiveAbility(state, id);
          const disabled = availability.ok ? "" : "disabled";
          return `<button class="btn" data-ability-use="${ability.id}" data-ability="${ability.id}" ${disabled}>${escapeHtml(ability.name)}</button>`;
        }).join("")
      : `<span class="small muted">No active combat abilities.</span>`;

    const enemyAc = effectiveEnemyAC(e);
    const enemyAttack = effectiveEnemyAttackBonus(e);
    const enemyTraits = Array.isArray(e.traits) && e.traits.length
      ? `<div class="badgeWrap" style="margin-top:10px">${e.traits.map(trait => `<span class="badge">${escapeHtml(formatDamageTypeLabel(trait))}</span>`).join("")}</div>`
      : `<div class="small muted" style="margin-top:10px">No enemy traits.</div>`;
    const ammoItem = ap && ap.ammoItemId ? getItem(ap.ammoItemId) : null;
    const ammoLine = ap && ap.needsAmmo
      ? (ap.outOfAmmo
          ? `No ${ammoItem ? ammoItem.name.toLowerCase() : "ammo"} remaining. This weapon currently attacks as an unarmed strike.`
          : `${ap.ammoCount} ${ammoItem ? ammoItem.name.toLowerCase() : "ammo"} remaining.`)
      : "";

    return `
      <div class="grid" style="gap:12px">
        <div class="panel">
          <header><h2>Enemy</h2><div class="hint">AC ${enemyAc}${enemyAc !== e.ac ? ` (base ${e.ac})` : ``} • Attack ${fmtSigned(enemyAttack)}${enemyAttack !== e.attackBonus ? ` (base ${fmtSigned(e.attackBonus)})` : ``} • Damage ${e.damage} ${escapeHtml(e.damageType)}</div></header>
          <div class="body">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap">
              <div class="big">${escapeHtml(e.name)}</div>
              <div class="pill"><span class="muted">HP</span> <strong class="mono">${e.hp.current}/${e.hp.max}</strong></div>
            </div>
            <div class="bar hp" style="margin-top:10px"><div class="fill" style="width:${Math.round((e.hp.current/e.hp.max)*100)}%"></div></div>
            <div class="kvGrid" style="margin-top:12px">
              <div class="kv"><div class="k">Fortitude DC</div><div class="v">${creatureSaveDc(e, "fort")}</div></div>
              <div class="kv"><div class="k">Reflex DC</div><div class="v">${creatureSaveDc(e, "reflex")}</div></div>
              <div class="kv"><div class="k">Will DC</div><div class="v">${creatureSaveDc(e, "will")}</div></div>
            </div>
            <div style="margin-top:12px">
              <div class="small muted" style="margin-bottom:6px">Traits</div>
              ${enemyTraits}
            </div>
            <div style="margin-top:12px">
              <div class="small muted" style="margin-bottom:6px">Enemy status effects</div>
              ${renderStatusEffectBadges(e, "No active enemy effects", "enemy")}
            </div>
          </div>
        </div>

        <div class="panel">
          <header><h2>Your Actions</h2><div class="hint">Turn: ${state.combat.turn}</div></header>
          <div class="body">
            <div class="small muted" style="margin-bottom:8px; line-height:1.5">
              Attack with <strong>${escapeHtml(ap.weaponName)}</strong> (attack ${fmtSigned(ap.attackBonus)}, damage ${escapeHtml(ap.damageExpr)}+mod).
              ${dualAgileAttack ? `<br/>Off-hand follow-up with <strong>${escapeHtml(offAp.weaponName)}</strong> at ${fmtSigned(Number(offAp.attackBonus || 0) - 4)} to hit, then normal damage on a hit.` : ``}
              ${ammoLine ? `<br/>${escapeHtml(ammoLine)}` : ``}
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap">
              <button class="btn primary" id="btn_attack" ${state.combat.turn!=="player" ? "disabled" : ""}>Attack</button>
              <button class="btn" id="btn_potion" ${state.combat.turn!=="player" ? "disabled" : ""}>Use Potion</button>
              <button class="btn danger" id="btn_flee" ${state.combat.turn!=="player" ? "disabled" : ""}>Flee</button>
            </div>
            <div style="margin-top:12px">
              <div class="small muted" style="margin-bottom:6px">Class abilities</div>
              <div style="display:flex; gap:8px; flex-wrap:wrap">${activeButtons}</div>
            </div>
            <div style="margin-top:12px">
              <div class="small muted" style="margin-bottom:6px">Passive combat abilities</div>
              ${renderAbilityBadgeList(passiveCombatAbilities, "No passive combat abilities")}
            </div>
            <div style="margin-top:12px">
              <div class="small muted" style="margin-bottom:6px">Your status effects</div>
              ${renderStatusEffectBadges(state.player, "No active effects")}
            </div>
            <div style="margin-top:12px">
              <div class="small muted" style="margin-bottom:6px">Current resistances</div>
              ${renderResistanceBadgeList(state.player, "No active resistances")}
            </div>
          </div>
        </div>

        <div class="panel">
          <header><h2>Combat Notes</h2><div class="hint">Simple & extendable</div></header>
          <div class="body small muted" style="line-height:1.5">
            • Attack roll: <span class="mono">d20 + attack bonus</span> vs AC<br/>
            • Natural 20: critical hit (double damage) • Natural 1: fumble (automatic miss)<br/>
            • Timed status effects tick down at the end of the affected creature's turn.<br/>
            • Timed status effects end automatically if you fall to 0 HP.
          </div>
        </div>
      </div>
    `;
  }

  function wireCombatTab(){
    if(!state.combat){
      document.getElementById("btn_back").addEventListener("click", () => { state.tab="explore"; render(); });
      return;
    }
    document.getElementById("btn_attack").addEventListener("click", () => { playerAttack(state); });
    document.getElementById("btn_potion").addEventListener("click", () => usePotion(state));
    document.getElementById("btn_flee").addEventListener("click", () => flee(state));
    document.querySelectorAll("button[data-ability-use]").forEach(btn => {
      btn.addEventListener("click", () => {
        const abilityId = btn.getAttribute("data-ability-use");
        useActiveAbility(state, abilityId);
      });
    });
  }

  function renderCharacterTab(){
    const p = state.player;
    const tl = totalLevel(p);
    const cls = mainClass(p);
    const ac = calcAC(p);
    const inv = calcInventorySlots(p);

    const statRows = STATS.map(s => `
      <div class="kv">
        <div class="k statHint" data-stat-tip="${s}">${fullStatName(s)}</div>
        <div class="v">${p.stats[s]} <span class="muted">(${fmtSigned(statMod(p.stats[s]))})</span></div>
      </div>
    `).join("");

    const draft = sanitizeSkillDraft((state.ui && state.ui.skillDraft) ? state.ui.skillDraft : {});
    state.ui = state.ui || {};
    state.ui.skillDraft = { ...draft };

    const draftSpent = Object.values(draft).reduce((a,b)=>a+(b||0),0);
    const available = Math.max(0, p.skillPoints - draftSpent);

    const saveRows = `
      <div class="kv"><div class="k">Fortitude</div><div class="v">${fmtSigned(saveTotal(p,"fort"))}</div></div>
      <div class="kv"><div class="k">Reflex</div><div class="v">${fmtSigned(saveTotal(p,"reflex"))}</div></div>
      <div class="kv"><div class="k">Will</div><div class="v">${fmtSigned(saveTotal(p,"will"))}</div></div>
    `;

    const skillRows = SKILLS.map(sk => {
      const base = statMod(p.stats[sk.stat]);
      const proficiency = p.skillProficiency[sk.id] || 0;
      const pending = draft[sk.id] || 0;
      const total = base + proficiency + pending;
      const cap = skillProficiencyCap(p, sk.id);

      const canDec = pending > 0;
      const canInc = available > 0 && (proficiency + pending) < cap;
      const pendingLabel = pending > 0 ? `+${pending}` : "0";

      return `
        <tr>
          <td class="skillHint" data-skill-tip="${sk.id}">${sk.id}</td>
          <td class="mono">${fmtSigned(base)}</td>
          <td class="mono">${proficiency}</td>
          <td class="mono">${fmtSigned(total)}</td>
          <td>
            <div class="trainControls">
              <button class="btn ghost" data-skill="${sk.id}" data-dir="dec" ${canDec?"":"disabled"}>−</button>
              <span class="pendingBadge ${pending ? "active" : ""}">${pendingLabel}</span>
              <button class="btn ghost" data-skill="${sk.id}" data-dir="inc" ${canInc?"":"disabled"}>+</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    const skillCapHint = p.startingSkillId
      ? `Most skills cap at <span class="mono">${MAX_SKILL_INVEST}</span> • ${escapeHtml(p.startingSkillId)} starts at +2 and caps at <span class="mono">${skillProficiencyCap(p, p.startingSkillId)}</span>`
      : `Max proficiency per skill: <span class="mono">${MAX_SKILL_INVEST}</span>`;
    const levelBanner = canLevelUp(p) ? `
      <div class="levelReadyBanner">
        <div>
          <div class="levelReadyTitle">Level Up Ready</div>
          <div class="small muted" style="line-height:1.45">You have ${p.xp} XP and can advance to level ${tl + 1}. Open the level-up screen to choose a class, skill ability, and this level's stat or skill rewards.</div>
        </div>
        <button class="btn primary levelReadyBtn" id="btn_open_levelup">Level Up</button>
      </div>
    ` : ``;

    return `
      <div class="grid characterGrid" style="gap:12px">
        ${levelBanner}
        <div class="characterTopGrid">
          <div class="panel characterPanel overviewPanel">
            <header><h2>Overview</h2><div class="hint">${cls} • Total level ${tl}</div></header>
            <div class="body">
              <div class="kv"><div class="k">Name</div><div class="v">${escapeHtml(p.name)}</div></div>
              <div class="kv"><div class="k">Race</div><div class="v">${RACES.find(r=>r.id===p.raceId)?.name || "Human"}</div></div>
              <div class="kv"><div class="k">Total Level</div><div class="v">${tl}</div></div>
              <div class="kv"><div class="k">Class Levels</div><div class="v">${renderLevels(p)}</div></div>
              <div class="kv"><div class="k">Armor Class</div><div class="v">${ac}</div></div>
              <div class="kv"><div class="k">Inventory</div><div class="v">${inv.used}/${inv.max} slots <span class="muted small">(base ${inv.baseMax}${inv.bonus ? `, +${inv.bonus} carry` : ""})</span></div></div>
            </div>
          </div>

          <div class="panel characterPanel abilityPanel">
            <header><h2>Ability Scores</h2><div class="hint">Base scores and modifiers</div></header>
            <div class="body">${statRows}</div>
          </div>
        </div>

        <div class="characterBottomGrid">
          <div class="panel characterPanel savePanel">
            <header><h2>Saving Throws, Status & Resistances</h2><div class="hint">Defenses and active effects</div></header>
            <div class="body">
              ${saveRows}
              <div class="small muted" style="margin:12px 0 8px">Current status effects</div>
              ${renderStatusEffectBadges(p, "No active effects")}
              <div class="small muted" style="margin:12px 0 8px">Damage resistance</div>
              ${renderResistanceBadgeList(p, "No active resistances")}
            </div>
          </div>

          <div class="panel characterPanel">
            <header><h2>Abilities</h2><div class="hint">Hover abilities to see exactly what they do</div></header>
            <div class="body">
              <div class="small muted" style="margin-bottom:8px">Class active abilities</div>
              ${renderPlayerAbilityBadgeList(p, { kind:"active", sourceType:"class", emptyText:"No active class abilities" })}
              <div class="small muted" style="margin:12px 0 8px">Class passive abilities</div>
              ${renderPlayerAbilityBadgeList(p, { kind:"passive", sourceType:"class", emptyText:"No passive class abilities" })}
              <div class="small muted" style="margin:12px 0 8px">Skill abilities</div>
              ${renderPlayerAbilityBadgeList(p, { sourceType:"skill", emptyText:"No skill abilities yet" })}
            </div>
          </div>
        </div>

        <div class="panel characterPanel">
          <header><h2>Skills</h2><div class="hint"><span class="pill">Skill points available: ${available}</span></div></header>
          <div class="body">
            <div class="tableWrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Skill</th><th>Base</th><th>Prof</th><th>Total</th><th>Train</th>
                  </tr>
                </thead>
                <tbody>
                  ${skillRows}
                </tbody>
              </table>
            </div>

            <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-top:10px">
              <button class="btn primary" id="btn_skill_lock" ${draftSpent>0?"":"disabled"}>Lock In Training</button>
              <div class="small muted" style="line-height:1.4">
                Pending points are <strong>not</strong> spent until you lock them in.
              </div>
            </div>

            <div class="small muted" style="margin-top:10px; line-height:1.5">
              This prototype uses a simplified "proficiency points" system (not full PF2e skill ranks). Skill training is now stored as a single locked-in <strong>Proficiency</strong> value, while the <strong>Train</strong> controls show any pending changes before you confirm them. On level up, you gain skill points equal to your <strong>INT modifier</strong> (minimum 1).
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function wireCharacterTab(){
    // Pending skill allocations live in UI state until locked in.
    state.ui = state.ui || {};
    state.ui.skillDraft = sanitizeSkillDraft(state.ui.skillDraft || {});

    const recalc = () => {
      const draft = sanitizeSkillDraft(state.ui.skillDraft || {});
      state.ui.skillDraft = draft;
      const spent = Object.values(draft).reduce((a,b)=>a+(b||0),0);
      const available = Math.max(0, state.player.skillPoints - spent);
      return { draft, spent, available };
    };

    document.querySelectorAll("button[data-skill]").forEach(btn => {
      btn.addEventListener("click", () => {
        const skill = btn.getAttribute("data-skill");
        const dir = btn.getAttribute("data-dir");

        const { draft, spent, available } = recalc();
        const pending = draft[skill] || 0;
        const proficiency = state.player.skillProficiency[skill] || 0;
        const cap = skillProficiencyCap(state.player, skill);

        if(dir === "inc"){
          if(available <= 0) return;
          if((proficiency + pending) >= cap){
            toast(`You can't raise ${skill} above ${cap} proficiency.`, "warn");
            return;
          }
          draft[skill] = pending + 1;
          render();
          return;
        }

        // dec
        if(pending <= 0) return;
        if(pending === 1) delete draft[skill];
        else draft[skill] = pending - 1;
        render();
      });
    });

    const levelBtn = document.getElementById("btn_open_levelup");
    if(levelBtn){
      levelBtn.addEventListener("click", () => openLevelUpOverlay(state));
    }

    const lockBtn = document.getElementById("btn_skill_lock");
    if(lockBtn){
      lockBtn.addEventListener("click", async () => {
        const { draft, spent } = recalc();
        if(spent <= 0) return;

        const parts = summarizeSkillDraft(draft);
        const summary = parts.join(", ");

        const ok = await confirmDialog({
          title: "Lock in skill training?",
          message: `Spend ${spent} skill point(s): ${summary}`,
          okText: "Lock In",
          cancelText: "Cancel"
        });

        if(!ok) return;

        const result = applySkillDraftToPlayer(state.player, draft);
        state.ui.skillDraft = {};

        const appliedSummary = summarizeSkillDraft(result.applied).join(", ");
        if(result.spent > 0){
          log(state, `Skill training locked in: ${appliedSummary || summary}.`);
        }
        save(state);
        render();
      });
    }
  }

  function renderInventoryTab(){
    const p = state.player;
    const inv = calcInventorySlots(p);
    const inTown = state.world.areaId === "town";
    const inventorySort = normalizeSortConfig(state.ui.inventorySort, "name");

    const mhId = p.equipment.mainHand || null;
    const mhItem = mhId ? getItem(mhId) : null;
    const mainTwoHanded = isTwoHandWeapon(mhItem);

    const eqRows = EQUIP_SLOTS.map(slot => {
      if(slot.id === "offHand" && mainTwoHanded && mhItem){
        return `
          <div class="kv">
            <div class="k">${slot.label}</div>
            <div class="v">
              <select disabled style="min-width:180px; background:rgba(17,21,34,.65); color:var(--text); border:1px solid var(--border); border-radius:10px; padding:6px">
                <option value="${mhId}" selected>${escapeHtml(mhItem.name)} (two-handed)</option>
              </select>
            </div>
          </div>
        `;
      }

      const current = p.equipment[slot.id] || "";
      const options = [{id:"", name:"(empty)"}];

      if(current){
        const curItem = getItem(current);
        options.push({id: current, name: curItem.name});
      }

      for(const entry of p.inventory){
        const it = getItem(entry.itemId);
        if(!slot.filter(it)) continue;
        if(!canEquipToSlot(p, slot.id, it)) continue;
        if(options.some(o => o.id === it.id)) continue;
        options.push({id: it.id, name: it.name});
      }

      const disabled = (slot.id === "offHand" && mainTwoHanded) ? "disabled" : "";

      return `
        <div class="kv">
          <div class="k">${slot.label}</div>
          <div class="v">
            <select ${disabled} data-eq="${slot.id}" style="min-width:180px; background:rgba(17,21,34,.65); color:var(--text); border:1px solid var(--border); border-radius:10px; padding:6px">
              ${options.map(o => `<option value="${o.id}" ${o.id===current ? "selected" : ""}>${escapeHtml(o.name)}</option>`).join("")}
            </select>
          </div>
        </div>
      `;
    }).join("");

    const itemRows = sortRows(p.inventory.map(e => {
      const it = getItem(e.itemId);
      const value = adjustedSellPriceCp(state.player, it);
      const itemClass = itemTextClass(it, state.player);
      return {
        sort: {
          name: it.name,
          category: itemCategoryLabel(it),
          stats: itemDmgOrAC(it),
          qty: Number(e.qty || 0),
          value
        },
        html: `
          <tr>
            <td class="${itemClass}">${itemLinkHtml(it, state.player)}</td>
            <td class="${itemClass}">${escapeHtml(itemCategoryLabel(it))}</td>
            <td class="mono ${itemClass}">${escapeHtml(itemDmgOrAC(it))}</td>
            <td class="mono">${e.qty}</td>
            <td class="mono">${formatCoins(value)}</td>
            <td>
              ${it.type==="consumable" && it.id==="potion_healing" ? `<button class="btn" data-use="${it.id}">Use</button>` : ``}
              ${canSellItem(it) ? `<button class="btn" data-sell="${it.id}" ${inTown?"":"disabled"}>Sell</button>` : `<span class="small muted">—</span>`}
            </td>
          </tr>
        `
      };
    }), inventorySort).map(row => row.html).join("");

    return `
      <div class="grid" style="gap:12px">
        <div class="panel">
          <header><h2>Equipment</h2><div class="hint">Carry only what you need</div></header>
          <div class="small muted" style="margin-bottom:10px; line-height:1.5">
          </div>
          <div class="body">
            <div class="kvGrid">${eqRows}</div>
            <div class="small muted" style="margin-top:10px; line-height:1.5">
            </div>
          </div>
        </div>

        <div class="panel">
          <header><h2>Items</h2><div class="hint"><span class="pill">Inventory Slots : ${inv.used} / ${inv.max}</span></div></header>
          <div class="body">
            <div class="tableWrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>${sortHeaderHtml("inventorySort", inventorySort, "name", "Item")}</th>
                    <th>${sortHeaderHtml("inventorySort", inventorySort, "category", "Category")}</th>
                    <th>${sortHeaderHtml("inventorySort", inventorySort, "stats", "Dmg / AC")}</th>
                    <th>${sortHeaderHtml("inventorySort", inventorySort, "qty", "Qty")}</th>
                    <th>${sortHeaderHtml("inventorySort", inventorySort, "value", "Value")}</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemRows || `<tr><td colspan="6" class="muted">(empty)</td></tr>`}
                </tbody>
              </table>
            </div>
            ${!inTown ? `<div class="small muted" style="margin-top:10px">You can only sell items in town.</div>` : ``}
          </div>
        </div>
      </div>
    `;
  }

function wireInventoryTab(){
    document.querySelectorAll("select[data-eq]").forEach(sel => {
      sel.addEventListener("change", () => {
        const slot = sel.getAttribute("data-eq");
        equipItem(state, slot, sel.value);
      });
    });

    document.querySelectorAll("button[data-sell]").forEach(btn => {
      btn.addEventListener("click", () => {
        sellItem(state, btn.getAttribute("data-sell"));
      });
    });

    document.querySelectorAll("button[data-use]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-use");
        if(id === "potion_healing"){
          usePotion(state);
        }
      });
    });

    const mainBody = document.getElementById("main_body");
    wireItemTooltips(mainBody);
    wireSortButtons(mainBody);
  }

  function renderShopTab(){
    if(state.world.areaId !== "town"){
      return `<div class="small muted">You must be in town to access the shop.</div>`;
    }

    const mode = state.ui.shopMode === "sell" ? "sell" : "buy";
    const toggleLabel = mode === "buy" ? "Show Sell" : "Show Buy";
    const stock = shopStock();
    const buySort = normalizeSortConfig(state.ui.shopBuySort, "name");
    const sellSort = normalizeSortConfig(state.ui.shopSellSort, "name");
    const socialMod = fmtSigned(socialPriceModifier(state.player));

    const buyRows = sortRows(stock.map(s => {
      const it = getItem(s.id);
      const price = adjustedBuyPriceCp(state.player, s.price);
      const displayName = s.qty > 1 ? `${it.name} x${s.qty}` : it.name;
      const itemClass = itemTextClass(it, state.player);
      return {
        sort: {
          name: it.name,
          category: itemCategoryLabel(it),
          stats: itemDmgOrAC(it),
          price,
          qty: s.qty
        },
        html: `
          <tr>
            <td class="${itemClass}">${itemLinkHtml(it, state.player, displayName)}</td>
            <td class="${itemClass}">${escapeHtml(itemCategoryLabel(it))}</td>
            <td class="mono ${itemClass}">${escapeHtml(itemDmgOrAC(it))}</td>
            <td class="mono">${formatCoins(price)}</td>
            <td><button class="btn primary" data-buy="${it.id}">${s.qty > 1 ? `Buy x${s.qty}` : "Buy"}</button></td>
          </tr>
        `
      };
    }), buySort).map(row => row.html).join("");

    const sellableEntries = state.player.inventory.filter(entry => canSellItem(getItem(entry.itemId)));
    const sellRows = sortRows(sellableEntries.map(e => {
      const it = getItem(e.itemId);
      const sellPrice = adjustedSellPriceCp(state.player, it);
      const itemClass = itemTextClass(it, state.player);
      return {
        sort: {
          name: it.name,
          category: itemCategoryLabel(it),
          stats: itemDmgOrAC(it),
          qty: Number(e.qty || 0),
          price: sellPrice
        },
        html: `
          <tr>
            <td class="${itemClass}">${itemLinkHtml(it, state.player)}</td>
            <td class="${itemClass}">${escapeHtml(itemCategoryLabel(it))}</td>
            <td class="mono ${itemClass}">${escapeHtml(itemDmgOrAC(it))}</td>
            <td class="mono">${e.qty}</td>
            <td class="mono">${formatCoins(sellPrice)}</td>
            <td><button class="btn" data-sell="${it.id}">Sell</button></td>
          </tr>
        `
      };
    }), sellSort).map(row => row.html).join("");

    return `
      <div class="grid" style="gap:12px">
        <div class="panel">
          <header>
            <h2>${mode === "buy" ? "Buy" : "Sell"}</h2>
            <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; justify-content:flex-end">
              <span class="hint">Your Social skill changes prices (1% per point). <span class="pill">Current : ${socialMod}%</span></span>
              <button class="btn" id="btn_shop_mode_toggle">${toggleLabel}</button>
            </div>
          </header>
          <div class="body">
            <div class="small muted" style="margin-bottom:10px; line-height:1.5">
            </div>
            <div class="tableWrap">
              ${mode === "buy" ? `
                <table class="table">
                  <thead>
                    <tr>
                      <th>${sortHeaderHtml("shopBuySort", buySort, "name", "Item")}</th>
                      <th>${sortHeaderHtml("shopBuySort", buySort, "category", "Category")}</th>
                      <th>${sortHeaderHtml("shopBuySort", buySort, "stats", "Dmg / AC")}</th>
                      <th>${sortHeaderHtml("shopBuySort", buySort, "price", "Price")}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>${buyRows}</tbody>
                </table>
              ` : `
                <table class="table">
                  <thead>
                    <tr>
                      <th>${sortHeaderHtml("shopSellSort", sellSort, "name", "Item")}</th>
                      <th>${sortHeaderHtml("shopSellSort", sellSort, "category", "Category")}</th>
                      <th>${sortHeaderHtml("shopSellSort", sellSort, "stats", "Dmg / AC")}</th>
                      <th>${sortHeaderHtml("shopSellSort", sellSort, "qty", "Qty")}</th>
                      <th>${sortHeaderHtml("shopSellSort", sellSort, "price", "Sell (each)")}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>${sellRows || `<tr><td colspan="6" class="muted">Nothing to sell.</td></tr>`}</tbody>
                </table>
              `}
            </div>
          </div>
        </div>

        <div class="panel">
          <header><h2>Tip</h2><div class="hint">Gear matters</div></header>
          <div class="body small muted" style="line-height:1.5">
            Upgrading armor increases AC. Better weapons improve damage dice.
            Potions currently heal <span class="mono">2d4+2</span>.
            Carry Sack and Backpack accessories increase carrying capacity while equipped.
          </div>
        </div>
      </div>
    `;
  }

  function wireShopTab(){
    if(state.world.areaId !== "town") return;

    const btnMode = document.getElementById("btn_shop_mode_toggle");
    if(btnMode){
      btnMode.addEventListener("click", () => {
        state.ui.shopMode = state.ui.shopMode === "buy" ? "sell" : "buy";
        render();
      });
    }

    document.querySelectorAll("button[data-buy]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-buy");
        buyItem(state, id);
      });
    });

    document.querySelectorAll("button[data-sell]").forEach(btn => {
      btn.addEventListener("click", () => {
        sellItem(state, btn.getAttribute("data-sell"));
      });
    });

    const mainBody = document.getElementById("main_body");
    wireItemTooltips(mainBody);
    wireSortButtons(mainBody);
  }

  function wireItemTooltips(scope){
    if(!scope) return;
    scope.querySelectorAll("[data-item]").forEach(el => {
      const id = el.getAttribute("data-item");
      if(!id) return;
      el.addEventListener("mouseenter", (e) => {
        try{
          const it = getItem(id);
          showTooltip(itemTooltipHtml(it, state.player), e.clientX, e.clientY);
        }catch(_){
          // ignore
        }
      });
      el.addEventListener("mousemove", (e) => {
        if(!$tooltip || $tooltip.classList.contains("hidden")) return;
        showTooltip($tooltip.innerHTML, e.clientX, e.clientY);
      });
      el.addEventListener("mouseleave", () => hideTooltip());
    });
  }

  /********************************************************************
   * Save import/export
   ********************************************************************/
  function exportSave(){
    const data = JSON.stringify(state);
    const blob = new Blob([data], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pf_explorer_save.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    log(state, "Exported save.");
    render();
  }

  function importSave(){
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      if(!file) return;
      const text = await file.text();
      try{
        const parsed = JSON.parse(text);
        // very light validation
        if(!parsed || !parsed.player) throw new Error("Not a valid save.");
        state = parsed;
        normalizeState(state);
        save(state);
        render();
      }catch(e){
        alertDialog({ title: "Import failed", message: "Failed to import save: " + e.message });
      }
    });
    input.click();
  }

  /********************************************************************
   * Small helpers
   ********************************************************************/
  function fullStatName(s){
    switch(s){
      case "STR": return "Strength";
      case "DEX": return "Dexterity";
      case "CON": return "Constitution";
      case "INT": return "Intelligence";
      case "WIS": return "Wisdom";
      case "CHA": return "Charisma";
      default: return s;
    }
  }
  function fmtSigned(n){
    const v = Math.floor(n);
    return (v >= 0 ? "+" : "") + v;
  }
  function escapeHtml(str){
    return String(str)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll("\"","&quot;")
      .replaceAll("'","&#039;");
  }

  function currentLogMode(state){
    return state && state.ui && state.ui.logMode === LOG_MODES.detail ? LOG_MODES.detail : LOG_MODES.compact;
  }

  function logTokenHtml(label, tooltip){
    return `<span class="logToken" data-tooltip="${escapeHtml(tooltip)}">${escapeHtml(label)}</span>`;
  }

  function collectLogDetailMatches(line){
    const matches = [];
    const pushMatches = (regex, buildTooltip) => {
      regex.lastIndex = 0;
      let match;
      while((match = regex.exec(line))){
        matches.push({ start: match.index, end: match.index + match[0].length, tooltip: buildTooltip(match) });
        if(match[0].length === 0) regex.lastIndex += 1;
      }
    };

    pushMatches(/rolls\s+(\d+)\/(\d+),\s*kept\s+(\d+)/g, m => `Two rolls were made (${m[1]} and ${m[2]}). The kept result was ${m[3]}.`);
    pushMatches(/vs\s+([A-Za-z][A-Za-z -]*)\s+DC\s+(\d+)/g, m => `This compares the final result against ${m[1].trim()} DC ${m[2]}. Meet or beat the target to succeed.`);
    pushMatches(/vs\s+AC\s+(\d+)/g, m => `This compares the final result against Armor Class ${m[1]}. Meet or beat the target to hit.`);
    pushMatches(/base\s+DC\s+(\d+)/gi, m => `The base difficulty for this check is ${m[1]} before situational modifiers.`);
    pushMatches(/\bd(\d+)\((\d+)\)/gi, m => `A d${m[1]} was rolled and came up ${m[2]} before modifiers.`);
    pushMatches(/\bd(\d+)\s+(\d+)\b/gi, m => `A d${m[1]} was rolled and came up ${m[2]}.`);
    pushMatches(/=\s*(-?\d+)/g, m => `The final total after modifiers is ${m[1]}.`);
    pushMatches(/[+-]\s?\d+/g, m => `This modifier adjusts the running total by ${m[0].replace(/\s+/g, '')}.`);
    pushMatches(/\b-?\d+(?=\s+vs\s+(?:[A-Za-z][A-Za-z -]*\s+)?(?:AC|DC))/g, () => `This is the final result being compared against the target number.`);

    matches.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
    const accepted = [];
    let cursor = -1;
    for(const match of matches){
      if(match.start < cursor) continue;
      accepted.push(match);
      cursor = match.end;
    }
    return accepted;
  }

  function renderLogLine(line, { detail=false } = {}){
    const raw = String(line || "");
    if(!detail) return `<div class="logLine">${escapeHtml(raw)}</div>`;
    const matches = collectLogDetailMatches(raw);
    if(!matches.length) return `<div class="logLine">${escapeHtml(raw)}</div>`;

    let out = "";
    let cursor = 0;
    for(const match of matches){
      if(match.start > cursor) out += escapeHtml(raw.slice(cursor, match.start));
      out += logTokenHtml(raw.slice(match.start, match.end), match.tooltip);
      cursor = match.end;
    }
    if(cursor < raw.length) out += escapeHtml(raw.slice(cursor));
    return `<div class="logLine">${out}</div>`;
  }

  function renderLogEntries(entries, { limit=null } = {}){
    const source = Array.isArray(entries) ? entries.slice() : [];
    const lines = limit == null ? source.reverse() : source.slice(-limit).reverse();
    const detail = currentLogMode(state) === LOG_MODES.detail;
    return `<div class="logList">${lines.map(line => renderLogLine(line, { detail })).join("")}</div>`;
  }

  function renderSettingsTab(){
    const mode = currentLogMode(state);
    return `
      <div class="grid" style="gap:12px">
        <div class="panel">
          <header><h2>Log Display</h2><div class="hint">Compact or detailed breakdowns</div></header>
          <div class="body">
            <div class="small muted" style="line-height:1.5; margin-bottom:12px">Compact mode keeps the current log text unchanged. Detail mode adds hover explanations for rolls, modifiers, and totals in the footer log and the full log view.</div>
            <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px">
              <button class="btn ${mode === LOG_MODES.compact ? 'primary' : ''}" data-log-mode="compact">Compact</button>
              <button class="btn ${mode === LOG_MODES.detail ? 'primary' : ''}" data-log-mode="detail">Detail</button>
            </div>
            <div class="small muted">Current mode: <strong>${mode === LOG_MODES.detail ? 'Detail' : 'Compact'}</strong></div>
          </div>
        </div>
      </div>
    `;
  }

  function wireSettingsTab(){
    document.querySelectorAll('button[data-log-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        const nextMode = btn.getAttribute('data-log-mode') === LOG_MODES.detail ? LOG_MODES.detail : LOG_MODES.compact;
        if(state.ui.logMode === nextMode) return;
        state.ui.logMode = nextMode;
        save(state);
        render();
      });
    });
  }

  let resizeRenderTimer = null;
  let lastWindowWidth = window.innerWidth;
  let lastWindowHeight = window.innerHeight;

  function activeElementUsesKeyboard(){
    const active = document.activeElement;
    if(!active || !(active instanceof HTMLElement)) return false;
    if(active.isContentEditable) return true;
    const tag = active.tagName;
    if(tag === "TEXTAREA" || tag === "SELECT") return true;
    if(tag !== "INPUT") return false;
    const type = String(active.getAttribute("type") || "text").toLowerCase();
    return !["button","checkbox","color","file","hidden","image","radio","range","reset","submit"].includes(type);
  }

  window.addEventListener("resize", () => {
    if(typeof activeExploreViewportRefresh === "function") activeExploreViewportRefresh();
    const width = window.innerWidth;
    const height = window.innerHeight;
    const widthChanged = width !== lastWindowWidth;
    const heightDelta = Math.abs(height - lastWindowHeight);
    const keyboardResize = !widthChanged && heightDelta > 0 && activeElementUsesKeyboard();
    lastWindowWidth = width;
    lastWindowHeight = height;
    if(keyboardResize) return;
    if(resizeRenderTimer) clearTimeout(resizeRenderTimer);
    resizeRenderTimer = setTimeout(() => {
      if(!state || !state.player || state.tab !== "explore") render();
    }, 80);
  });

  // Initial render
  render();

})();
