// Feats and abilities
(() => {
  const store = window.PF_DATA;

  const SKILL_FEATS = {
    "skill_feat_acrobatics_mastery": {
      "id": "skill_feat_acrobatics_mastery",
      "name": "Agility",
      "emoji": "🤸",
      "sourceType": "skill",
      "skillId": "Acrobatics",
      "kind": "passive",
      "contexts": [
        "combat",
        "exploration"
      ],
      "tags": [
        "Passive",
        "Skill",
        "Movement"
      ],
      "maxRank": 1,
      "requiredSkillTotal": 5,
      "requirements": {
        "skillTotalsAllOf": [
          {
            "skillId": "Acrobatics",
            "total": 5
          }
        ]
      },
      "summary": "Flee checks are made with advantage.",
      "details": [
        "Why fight when you can fly?"
      ]
    },
    "skill_feat_acrobatics_defensive_roll": {
      "id": "skill_feat_acrobatics_defensive_roll",
      "name": "Defensive Roll",
      "emoji": "🌀",
      "sourceType": "skill",
      "skillId": "Acrobatics",
      "kind": "passive",
      "contexts": [
        "combat"
      ],
      "tags": [
        "Passive",
        "Skill",
        "Defense"
      ],
      "maxRank": 1,
      "requiredSkillTotal": 15,
      "requirements": {
        "skillTotalsAllOf": [
          {
            "skillId": "Acrobatics",
            "total": 15
          }
        ]
      },
      "summary": "The first time each combat you would take damage, reduce it by 1d6.",
      "details": [
        "Turns out falling stylishly helps."
      ]
    },
    "skill_feat_athletics_mastery": {
      "id": "skill_feat_athletics_mastery",
      "name": "Might",
      "emoji": "🏋️",
      "sourceType": "skill",
      "skillId": "Athletics",
      "kind": "passive",
      "contexts": [
        "exploration"
      ],
      "tags": [
        "Passive",
        "Skill",
        "Carry"
      ],
      "maxRank": 1,
      "requiredSkillTotal": 5,
      "requirements": {
        "skillTotalsAllOf": [
          {
            "skillId": "Athletics",
            "total": 5
          }
        ]
      },
      "summary": "Inventory capacity +5.",
      "details": [
        "Learn how to properly use your strength."
      ]
    },
    "skill_feat_athletics_overpower": {
      "id": "skill_feat_athletics_overpower",
      "name": "Overpower",
      "emoji": "💥",
      "sourceType": "skill",
      "skillId": "Athletics",
      "kind": "passive",
      "contexts": [
        "combat"
      ],
      "tags": [
        "Passive",
        "Skill",
        "Combat",
        "Attack"
      ],
      "maxRank": 1,
      "requiredSkillTotal": 15,
      "requirements": {
        "skillTotalsAllOf": [
          {
            "skillId": "Athletics",
            "total": 15
          }
        ]
      },
      "summary": "Melee and unarmed attacks against Off-Guard or Prone enemies deal +2 damage.",
      "details": [
        "If they are already wobbling, finish the thought."
      ]
    },
    "skill_feat_crafting_mastery": {
      "id": "skill_feat_crafting_mastery",
      "name": "Tinker",
      "emoji": "🔧",
      "sourceType": "skill",
      "skillId": "Crafting",
      "kind": "passive",
      "contexts": [
        "exploration"
      ],
      "tags": [
        "Passive",
        "Skill",
        "Crafting",
        "Consumable"
      ],
      "maxRank": 1,
      "requiredSkillTotal": 5,
      "requirements": {
        "skillTotalsAllOf": [
          {
            "skillId": "Crafting",
            "total": 5
          }
        ]
      },
      "summary": "On a critical success when crafting a consumable, you have a 5% chance to craft 1 extra consumable.",
      "details": [
        "Sometimes the batch just comes out better."
      ]
    },
    "skill_feat_crafting_masterwork": {
      "id": "skill_feat_crafting_masterwork",
      "name": "Efficiency",
      "emoji": "⚒️",
      "sourceType": "skill",
      "skillId": "Crafting",
      "kind": "passive",
      "contexts": [
        "exploration"
      ],
      "tags": [
        "Passive",
        "Skill",
        "Crafting",
        "Resource"
      ],
      "maxRank": 1,
      "requiredSkillTotal": 15,
      "requirements": {
        "skillTotalsAllOf": [
          {
            "skillId": "Crafting",
            "total": 15
          }
        ]
      },
      "summary": "On a critical crafting success, retain half of the resource ingredients spent.",
      "details": []
    },
    "skill_feat_perception_mastery": {
      "id": "skill_feat_perception_mastery",
      "name": "Hawkeye",
      "emoji": "👁️",
      "sourceType": "skill",
      "skillId": "Perception",
      "kind": "passive",
      "contexts": [
        "combat",
        "exploration"
      ],
      "tags": [
        "Passive",
        "Skill",
        "Search"
      ],
      "maxRank": 1,
      "requiredSkillTotal": 5,
      "requirements": {
        "skillTotalsAllOf": [
          {
            "skillId": "Perception",
            "total": 5
          }
        ]
      },
      "summary": "Search radius +1.",
      "details": [
        "You notice trouble before it notices you."
      ]
    },
    "skill_feat_perception_treasure_hunter": {
      "id": "skill_feat_perception_treasure_hunter",
      "name": "Treasure Hunter",
      "emoji": "💎",
      "sourceType": "skill",
      "skillId": "Perception",
      "kind": "passive",
      "contexts": [
        "exploration"
      ],
      "tags": [
        "Passive",
        "Skill",
        "Search",
        "Loot"
      ],
      "maxRank": 1,
      "requiredSkillTotal": 15,
      "requirements": {
        "skillTotalsAllOf": [
          {
            "skillId": "Perception",
            "total": 15
          }
        ]
      },
      "summary": "Search radius +1, and treasure cache coin rewards are doubled.",
      "details": [
        "You find the stash and the better stash."
      ]
    },
    "skill_feat_social_mastery": {
      "id": "skill_feat_social_mastery",
      "name": "Haggle",
      "emoji": "🗣️",
      "sourceType": "skill",
      "skillId": "Social",
      "kind": "passive",
      "contexts": [
        "exploration"
      ],
      "tags": [
        "Passive",
        "Skill",
        "Town",
        "Quest"
      ],
      "maxRank": 1,
      "requiredSkillTotal": 5,
      "requirements": {
        "skillTotalsAllOf": [
          {
            "skillId": "Social",
            "total": 5
          }
        ]
      },
      "summary": "Quest rewards are increased by 5%.",
      "details": [
        "Every contract has room to breathe."
      ]
    },
    "skill_feat_social_menacing_presence": {
      "id": "skill_feat_social_menacing_presence",
      "name": "Menacing Presence",
      "emoji": "😠",
      "sourceType": "skill",
      "skillId": "Social",
      "kind": "passive",
      "contexts": [
        "combat"
      ],
      "tags": [
        "Passive",
        "Skill",
        "Combat",
        "Debuff"
      ],
      "maxRank": 1,
      "requiredSkillTotal": 15,
      "requirements": {
        "skillTotalsAllOf": [
          {
            "skillId": "Social",
            "total": 15
          }
        ]
      },
      "summary": "At the start of combat, make a Social check against Will DC. On a success, the enemy becomes Off-Guard.",
      "details": [
        "Sometimes the glare gets initiative."
      ]
    },
    "skill_feat_stealth_mastery": {
      "id": "skill_feat_stealth_mastery",
      "name": "Sneak",
      "emoji": "🕶️",
      "sourceType": "skill",
      "skillId": "Stealth",
      "kind": "passive",
      "contexts": [
        "combat",
        "exploration"
      ],
      "tags": [
        "Passive",
        "Skill",
        "Rest"
      ],
      "maxRank": 1,
      "requiredSkillTotal": 5,
      "requirements": {
        "skillTotalsAllOf": [
          {
            "skillId": "Stealth",
            "total": 5
          }
        ]
      },
      "summary": "When you short-rest in the wild, roll Stealth twice and keep the better result.",
      "details": []
    },
    "skill_feat_survival_mastery": {
      "id": "skill_feat_survival_mastery",
      "name": "Resourceful",
      "emoji": "🌿",
      "sourceType": "skill",
      "skillId": "Survival",
      "kind": "passive",
      "contexts": [
        "combat",
        "exploration"
      ],
      "tags": [
        "Passive",
        "Skill",
        "Gathering"
      ],
      "maxRank": 1,
      "requiredSkillTotal": 5,
      "requirements": {
        "skillTotalsAllOf": [
          {
            "skillId": "Survival",
            "total": 5
          }
        ]
      },
      "summary": "Successful non-ore gathers grant +1 extra resource.",
      "details": []
    },
    "skill_feat_survival_field_dressing": {
      "id": "skill_feat_survival_field_dressing",
      "name": "Field Dressing",
      "emoji": "🩹",
      "sourceType": "skill",
      "skillId": "Survival",
      "kind": "passive",
      "contexts": [
        "combat",
        "exploration"
      ],
      "tags": [
        "Passive",
        "Skill",
        "Healing"
      ],
      "maxRank": 1,
      "requiredSkillTotal": 15,
      "requirements": {
        "skillTotalsAllOf": [
          {
            "skillId": "Survival",
            "total": 15
          }
        ]
      },
      "summary": "After winning combat, recover 1d6 HP.",
      "details": []
    },
    "quiet_step": {
      "id": "quiet_step",
      "name": "Quiet Step",
      "emoji": "🦶",
      "sourceType": "skill",
      "skillId": "Stealth",
      "kind": "passive",
      "contexts": [
        "exploration"
      ],
      "tags": [
        "Passive",
        "Skill",
        "Exploration",
        "Stealth"
      ],
      "maxRank": 1,
      "requiredSkillTotal": 15,
      "requirements": {
        "skillTotalsAllOf": [
          {
            "skillId": "Stealth",
            "total": 15
          }
        ]
      },
      "summary": "Stepping into an enemy tile does not start combat.",
      "details": []
    }
  };

  const GENERAL_FEATS = {};

  const CLASS_FEATS = {
    "sword_mastery": {
      "id": "sword_mastery",
      "name": "Sword Mastery",
      "emoji": "⚔️",
      "sourceType": "class",
      "classId": "Fighter",
      "classes": [
        "Fighter",
        "Barbarian",
        "Ranger",
        "Rogue"
      ],
      "kind": "passive",
      "contexts": [
        "combat"
      ],
      "tags": [
        "Passive",
        "Combat",
        "Weapon"
      ],
      "costSp": 0,
      "maxRank": 5,
      "summary": "+1 to hit per rank with swords.",
      "details": [
        "Every rank is one more point of sword accuracy."
      ],
      "requirements": {
        "classLevelsAnyOf": [
          {
            "classId": "Fighter",
            "level": 1
          },
          {
            "classId": "Barbarian",
            "level": 1
          },
          {
            "classId": "Ranger",
            "level": 1
          },
          {
            "classId": "Rogue",
            "level": 1
          }
        ]
      }
    },
    "mace_mastery": {
      "id": "mace_mastery",
      "name": "Mace Mastery",
      "emoji": "🔨",
      "sourceType": "class",
      "classId": "Barbarian",
      "classes": [
        "Barbarian",
        "Monk"
      ],
      "kind": "passive",
      "contexts": [
        "combat"
      ],
      "tags": [
        "Passive",
        "Combat",
        "Weapon"
      ],
      "costSp": 0,
      "maxRank": 5,
      "summary": "+1 to hit per rank with maces.",
      "details": [
        "Every rank is one more point of mace accuracy."
      ],
      "requirements": {
        "classLevelsAnyOf": [
          {
            "classId": "Barbarian",
            "level": 1
          },
          {
            "classId": "Monk",
            "level": 1
          }
        ]
      }
    },
    "axe_mastery": {
      "id": "axe_mastery",
      "name": "Axe Mastery",
      "emoji": "🪓",
      "sourceType": "class",
      "classId": "Ranger",
      "classes": [
        "Ranger",
        "Barbarian"
      ],
      "kind": "passive",
      "contexts": [
        "combat"
      ],
      "tags": [
        "Passive",
        "Combat",
        "Weapon"
      ],
      "costSp": 0,
      "maxRank": 5,
      "summary": "+1 to hit per rank with axes.",
      "details": [
        "Every rank is one more point of axe accuracy."
      ],
      "requirements": {
        "classLevelsAnyOf": [
          {
            "classId": "Ranger",
            "level": 1
          },
          {
            "classId": "Barbarian",
            "level": 1
          }
        ]
      }
    },
    "polearm_mastery": {
      "id": "polearm_mastery",
      "name": "Polearm Mastery",
      "emoji": "🛡️",
      "sourceType": "class",
      "classId": "Fighter",
      "classes": [
        "Fighter",
        "Monk"
      ],
      "kind": "passive",
      "contexts": [
        "combat"
      ],
      "tags": [
        "Passive",
        "Combat",
        "Weapon"
      ],
      "costSp": 0,
      "maxRank": 5,
      "summary": "+1 to hit per rank with polearm-property weapons.",
      "details": [
        "Every rank is one more point of polearm accuracy."
      ],
      "requirements": {
        "classLevelsAnyOf": [
          {
            "classId": "Fighter",
            "level": 1
          },
          {
            "classId": "Monk",
            "level": 1
          }
        ]
      }
    },
    "dagger_mastery": {
      "id": "dagger_mastery",
      "name": "Dagger Mastery",
      "emoji": "🗡️",
      "sourceType": "class",
      "classId": "Fighter",
      "classes": [
        "Fighter",
        "Rogue"
      ],
      "kind": "passive",
      "contexts": [
        "combat"
      ],
      "tags": [
        "Passive",
        "Combat",
        "Weapon"
      ],
      "costSp": 0,
      "maxRank": 5,
      "summary": "+1 to hit per rank with daggers.",
      "details": [
        "Every rank is one more point of dagger accuracy."
      ],
      "requirements": {
        "classLevelsAnyOf": [
          {
            "classId": "Fighter",
            "level": 1
          },
          {
            "classId": "Rogue",
            "level": 1
          }
        ]
      }
    },
    "dual_wield_mastery": {
      "id": "dual_wield_mastery",
      "name": "Dual Wield Mastery",
      "emoji": "🗡️",
      "sourceType": "class",
      "classId": "Fighter",
      "classes": [
        "Fighter",
        "Barbarian",
        "Ranger",
        "Rogue",
        "Monk"
      ],
      "kind": "passive",
      "contexts": [
        "combat"
      ],
      "tags": [
        "Passive",
        "Combat",
        "Weapon",
        "Off-Hand"
      ],
      "costSp": 0,
      "maxRank": 4,
      "summary": "+1 per rank to off-hand attack rolls. At max rank, gain +1 AC while holding an agile weapon in both hands.",
      "details": [
        "Each rank shaves 1 off the usual -4 off-hand penalty.",
        "At rank 4, you also get +1 AC while dual-wielding agile weapons."
      ],
      "requirements": {
        "featRanksAnyOf": [
          {
            "featId": "sword_mastery",
            "rank": 5
          },
          {
            "featId": "axe_mastery",
            "rank": 5
          },
          {
            "featId": "mace_mastery",
            "rank": 5
          },
          {
            "featId": "dagger_mastery",
            "rank": 5
          }
        ]
      }
    },
    "bow_mastery": {
      "id": "bow_mastery",
      "name": "Bow Mastery",
      "emoji": "🏹",
      "sourceType": "class",
      "classId": "Ranger",
      "classes": [
        "Ranger",
        "Rogue"
      ],
      "kind": "passive",
      "contexts": [
        "combat"
      ],
      "tags": [
        "Passive",
        "Combat",
        "Weapon"
      ],
      "costSp": 0,
      "maxRank": 5,
      "summary": "+1 to hit per rank with bows.",
      "details": [
        "Every rank is one more point of bow accuracy."
      ],
      "requirements": {
        "classLevelsAnyOf": [
          {
            "classId": "Ranger",
            "level": 1
          },
          {
            "classId": "Rogue",
            "level": 1
          }
        ]
      }
    },
    "enrage": {
      "id": "enrage",
      "name": "Enrage",
      "emoji": "😡",
      "sourceType": "class",
      "classId": "Barbarian",
      "classes": [
        "Barbarian"
      ],
      "kind": "active",
      "contexts": [
        "combat"
      ],
      "tags": [
        "Combat",
        "Self",
        "Buff",
        "Rage",
        "Head"
      ],
      "costSp": 1,
      "maxRank": 5,
      "summary": "Spend SP equal to rank. For 10 rounds, gain +1 melee weapon damage per rank and resistance 2 to bludgeoning, piercing, and slashing, or 3 at max rank. Concentrate feats are off the table while raging.",
      "details": [
        "Rank 1 costs 1 SP; rank 5 costs 5 SP."
      ],
      "requirements": {
        "classLevelsAnyOf": [
          {
            "classId": "Barbarian",
            "level": 1
          }
        ]
      }
    },
    "sneak_attack": {
      "id": "sneak_attack",
      "name": "Sneak Attack",
      "emoji": "🥷",
      "sourceType": "class",
      "classId": "Rogue",
      "classes": [
        "Rogue"
      ],
      "kind": "passive",
      "contexts": [
        "combat"
      ],
      "tags": [
        "Passive",
        "Combat"
      ],
      "costSp": 0,
      "maxRank": 5,
      "summary": "When an agile or ranged hit lands, roll 1d6. If the result is 1 + rank or lower, add 1d6 damage, or 2d6 at max rank.",
      "details": [
        "The trigger number climbs by 1 each rank, up to 6 at rank 5."
      ],
      "requirements": {
        "classLevelsAnyOf": [
          {
            "classId": "Rogue",
            "level": 1
          }
        ]
      }
    },
    "hunters_mark": {
      "id": "hunters_mark",
      "name": "Hunter's Mark",
      "emoji": "🎯",
      "sourceType": "class",
      "classId": "Ranger",
      "classes": [
        "Ranger"
      ],
      "kind": "active",
      "contexts": [
        "combat"
      ],
      "tags": [
        "Active",
        "Debuff",
        "Combat",
        "Arm",
        "Mark"
      ],
      "costSp": 1,
      "maxRank": 5,
      "summary": "1 SP: mark a target for 5 rounds. Marked targets cannot gain Hidden or Cover and take +1d4 damage from your attacks, or +2d4 at max rank.",
      "details": [
        "Only one target can be marked at a time."
      ],
      "requirements": {
        "classLevelsAnyOf": [
          {
            "classId": "Ranger",
            "level": 1
          }
        ]
      }
    },
    "second_wind": {
      "id": "second_wind",
      "name": "Second Wind",
      "emoji": "💨",
      "sourceType": "class",
      "classId": "Fighter",
      "classes": [
        "Fighter"
      ],
      "kind": "active",
      "contexts": [
        "combat"
      ],
      "tags": [
        "Active",
        "Self",
        "Heal",
        "Head"
      ],
      "costSp": 1,
      "maxRank": 5,
      "summary": "Spend SP equal to rank to heal rank x (1d6 + CON modifier).",
      "details": [
        "Rank 1 costs 1 SP; rank 5 costs 5 SP."
      ],
      "requirements": {
        "classLevelsAnyOf": [
          {
            "classId": "Fighter",
            "level": 1
          }
        ]
      }
    },
    "martial_arts": {
      "id": "martial_arts",
      "name": "Martial Arts",
      "emoji": "🥋",
      "sourceType": "class",
      "classId": "Monk",
      "classes": [
        "Monk"
      ],
      "kind": "passive",
      "contexts": [
        "combat"
      ],
      "tags": [
        "Passive",
        "Combat",
        "Unarmed"
      ],
      "costSp": 0,
      "maxRank": 5,
      "summary": "Unarmed and simple-weapon attacks use at least a d6, unarmed strikes are agile, and you get +1 to hit per rank with unarmed attacks.",
      "details": [],
      "requirements": {
        "classLevelsAnyOf": [
          {
            "classId": "Monk",
            "level": 1
          }
        ]
      }
    },
    "shield_mastery": {
      "id": "shield_mastery",
      "name": "Shield Mastery",
      "emoji": "🛡️",
      "sourceType": "class",
      "classId": "Fighter",
      "classes": [
        "Fighter",
        "Barbarian",
        "Ranger"
      ],
      "kind": "passive",
      "contexts": [
        "combat"
      ],
      "tags": [
        "Passive",
        "Combat",
        "Shield"
      ],
      "costSp": 0,
      "maxRank": 3,
      "summary": "Any equipped shield gives better protection as ranks go up. Rank 2 adds DR 1 against bludgeoning, piercing, and slashing; rank 3 makes that DR 2.",
      "details": [
        "The AC bonus applies at every rank while a shield is equipped."
      ],
      "requirements": {
        "shieldProficiency": true,
        "classLevelsAnyOf": [
          {
            "classId": "Fighter",
            "level": 1
          },
          {
            "classId": "Barbarian",
            "level": 1
          },
          {
            "classId": "Ranger",
            "level": 1
          }
        ]
      }
    },
    "feint_strike": {
      "id": "feint_strike",
      "name": "Feint Strike",
      "emoji": "🎭",
      "sourceType": "class",
      "classId": "Fighter",
      "classes": [
        "Fighter",
        "Barbarian",
        "Ranger",
        "Rogue"
      ],
      "kind": "active",
      "contexts": [
        "combat"
      ],
      "tags": [
        "Active",
        "Combat",
        "Attack",
        "Debuff",
        "Arm"
      ],
      "costSp": 1,
      "maxRank": 5,
      "summary": "Spend SP equal to rank for a sword attack with +1 per rank to hit and damage. If the final attack total beats Reflex DC, the target becomes Off-Guard whether you hit or whiff.",
      "details": [
        "The strike uses your normal sword attack profile.",
        "The Off-Guard check uses the final attack total against Reflex DC even if the attack misses AC.",
        "This feat scales to rank 5."
      ],
      "requirements": {
        "featRanksAllOf": [
          {
            "featId": "sword_mastery",
            "rank": 3
          }
        ]
      }
    },
    "power_strike": {
      "id": "power_strike",
      "name": "Power Strike",
      "emoji": "💥",
      "sourceType": "class",
      "classId": "Barbarian",
      "classes": [
        "Barbarian",
        "Monk"
      ],
      "kind": "active",
      "contexts": [
        "combat"
      ],
      "tags": [
        "Active",
        "Combat",
        "Attack",
        "Arm"
      ],
      "costSp": 2,
      "maxRank": 5,
      "summary": "Spend rank + 1 SP for a mace attack at -2 to hit. On a hit, deal +4 damage at rank 1 and +1 more damage per rank after that.",
      "details": [
        "The strike uses your normal mace attack profile.",
        "This feat scales to rank 5."
      ],
      "requirements": {
        "featRanksAllOf": [
          {
            "featId": "mace_mastery",
            "rank": 3
          }
        ]
      }
    },
    "blade_dance": {
      "id": "blade_dance",
      "name": "Blade Dance",
      "emoji": "🌀",
      "sourceType": "class",
      "classId": "Fighter",
      "classes": [
        "Fighter",
        "Barbarian",
        "Ranger",
        "Rogue"
      ],
      "kind": "active",
      "contexts": [
        "combat"
      ],
      "tags": [
        "Active",
        "Combat",
        "Attack",
        "Arm"
      ],
      "costSp": 2,
      "maxRank": 5,
      "summary": "Swing at every enemy in a selected row with your sword. Attacks gain +floor(rank/2) to hit and +rank damage.",
      "details": [
        "Targets the selected enemy row.",
        "SP cost scales as 2 / 2 / 3 / 3 / 4 by rank."
      ],
      "requirements": {
        "featRanksAllOf": [
          {
            "featId": "sword_mastery",
            "rank": 5
          }
        ]
      }
    },
    "stunning_palm": {
      "id": "stunning_palm",
      "name": "Stunning Palm",
      "emoji": "✋",
      "sourceType": "class",
      "classId": "Monk",
      "classes": [
        "Monk"
      ],
      "kind": "active",
      "contexts": [
        "combat"
      ],
      "tags": [
        "Active",
        "Combat",
        "Attack",
        "Debuff",
        "Arm"
      ],
      "costSp": 1,
      "maxRank": 5,
      "summary": "1 SP: make an unarmed attack with +1 per rank to hit. If it hits and meets Fortitude DC, the target is staggered for 1 round.",
      "details": [
        "Staggered from Stunning Palm applies -1 AC and an attack-roll penalty based on feat rank.",
        "This feat scales to rank 5."
      ],
      "requirements": {
        "featRanksAllOf": [
          {
            "featId": "martial_arts",
            "rank": 3
          }
        ]
      }
    },
    "hundred_fists": {
      "id": "hundred_fists",
      "name": "Hundred Fists",
      "emoji": "👊",
      "sourceType": "class",
      "classId": "Monk",
      "classes": [
        "Monk"
      ],
      "kind": "active",
      "contexts": [
        "combat"
      ],
      "tags": [
        "Active",
        "Combat",
        "Attack",
        "Arm",
        "Leg"
      ],
      "costSp": 2,
      "maxRank": 5,
      "summary": "Throw two unarmed attacks at one target. Both gain +floor(rank/2) to hit, and if the first lands the second gets +rank damage.",
      "details": [
        "SP cost scales as 2 / 2 / 3 / 3 / 4 by rank."
      ],
      "requirements": {
        "featRanksAllOf": [
          {
            "featId": "martial_arts",
            "rank": 5
          }
        ]
      }
    },
    "hamstring_cut": {
      "id": "hamstring_cut",
      "name": "Hamstring Cut",
      "emoji": "🩸",
      "sourceType": "class",
      "classId": "Rogue",
      "classes": [
        "Fighter",
        "Rogue"
      ],
      "kind": "active",
      "contexts": [
        "combat"
      ],
      "tags": [
        "Active",
        "Combat",
        "Attack",
        "Debuff",
        "Arm"
      ],
      "costSp": 1,
      "maxRank": 5,
      "summary": "1 SP: make a dagger attack with +1 per rank to hit. On hit, if the final attack total + rank beats Fortitude DC, apply Bleed equal to rank for 3 rounds.",
      "details": [
        "Bleed damage is based on feat rank.",
        "This feat scales to rank 5."
      ],
      "requirements": {
        "featRanksAllOf": [
          {
            "featId": "dagger_mastery",
            "rank": 3
          }
        ]
      }
    },
    "shadow_flurry": {
      "id": "shadow_flurry",
      "name": "Shadow Flurry",
      "emoji": "🌑",
      "sourceType": "class",
      "classId": "Rogue",
      "classes": [
        "Fighter",
        "Rogue"
      ],
      "kind": "active",
      "contexts": [
        "combat"
      ],
      "tags": [
        "Active",
        "Combat",
        "Attack",
        "Sneaky",
        "Arm"
      ],
      "costSp": 2,
      "maxRank": 5,
      "summary": "Throw two dagger attacks at one target. If the first lands, the target becomes Off-Guard before the second. If you are Hidden when you use it, both attacks gain +rank damage.",
      "details": [],
      "requirements": {
        "featRanksAllOf": [
          {
            "featId": "dagger_mastery",
            "rank": 5
          },
          {
            "featId": "hide",
            "rank": 1
          }
        ]
      }
    },
    "pinning_shot": {
      "id": "pinning_shot",
      "name": "Pinning Shot",
      "emoji": "📌",
      "sourceType": "class",
      "classId": "Ranger",
      "classes": [
        "Ranger",
        "Rogue"
      ],
      "kind": "active",
      "contexts": [
        "combat"
      ],
      "tags": [
        "Active",
        "Combat",
        "Attack",
        "Debuff",
        "Arm"
      ],
      "costSp": 1,
      "maxRank": 5,
      "summary": "Make a bow attack. If the final attack total plus rank beats Reflex DC, apply Pinned for rank rounds.",
      "details": [],
      "requirements": {
        "featRanksAllOf": [
          {
            "featId": "bow_mastery",
            "rank": 3
          }
        ]
      }
    },
    "volley_fire": {
      "id": "volley_fire",
      "name": "Volley Fire",
      "emoji": "🏹",
      "sourceType": "class",
      "classId": "Ranger",
      "classes": [
        "Ranger",
        "Rogue"
      ],
      "kind": "active",
      "contexts": [
        "combat"
      ],
      "tags": [
        "Active",
        "Combat",
        "Attack",
        "Head"
      ],
      "costSp": 2,
      "maxRank": 5,
      "summary": "Loose a shot at every enemy in a selected row. Each arrow gets +floor(rank/2) to hit and rank-based bonus damage.",
      "details": [
        "Targets the selected enemy row.",
        "SP cost scales as 2 / 2 / 3 / 3 / 4 by rank."
      ],
      "requirements": {
        "featRanksAllOf": [
          {
            "featId": "bow_mastery",
            "rank": 5
          }
        ]
      }
    },
    "concussive_blow": {
      "id": "concussive_blow",
      "name": "Concussive Blow",
      "emoji": "🔔",
      "sourceType": "class",
      "classId": "Barbarian",
      "classes": [
        "Barbarian",
        "Monk"
      ],
      "kind": "active",
      "contexts": [
        "combat"
      ],
      "tags": [
        "Active",
        "Combat",
        "Attack",
        "Debuff",
        "Arm"
      ],
      "costSp": 2,
      "maxRank": 5,
      "summary": "Make a mace attack with +rank damage. If the final attack total plus rank beats Fortitude DC, apply Concussed for rank rounds.",
      "details": [],
      "requirements": {
        "featRanksAllOf": [
          {
            "featId": "mace_mastery",
            "rank": 5
          }
        ]
      }
    },
    "rending_chop": {
      "id": "rending_chop",
      "name": "Rending Chop",
      "emoji": "🪓",
      "sourceType": "class",
      "classId": "Barbarian",
      "classes": [
        "Ranger",
        "Barbarian"
      ],
      "kind": "active",
      "contexts": [
        "combat"
      ],
      "tags": [
        "Active",
        "Combat",
        "Attack",
        "Debuff",
        "Arm"
      ],
      "costSp": 1,
      "maxRank": 5,
      "summary": "Make an axe attack with +rank damage. If the final attack total plus rank beats Fortitude DC, apply Disarmed for rank rounds.",
      "details": [],
      "requirements": {
        "featRanksAllOf": [
          {
            "featId": "axe_mastery",
            "rank": 3
          }
        ]
      }
    },
    "executioners_swing": {
      "id": "executioners_swing",
      "name": "Executioner's Chop",
      "emoji": "☠️",
      "sourceType": "class",
      "classId": "Barbarian",
      "classes": [
        "Ranger",
        "Barbarian"
      ],
      "kind": "active",
      "contexts": [
        "combat"
      ],
      "tags": [
        "Active",
        "Combat",
        "Attack",
        "Arm"
      ],
      "costSp": 2,
      "maxRank": 5,
      "summary": "Make an axe attack with +rank damage. If the target is below 50% HP before the hit, double only that bonus damage.",
      "details": [],
      "requirements": {
        "featRanksAllOf": [
          {
            "featId": "axe_mastery",
            "rank": 5
          }
        ]
      }
    },
    "martial_body": {
      "id": "martial_body",
      "name": "Martial Body",
      "emoji": "🧘",
      "sourceType": "class",
      "classId": "Monk",
      "classes": [
        "Monk"
      ],
      "kind": "passive",
      "contexts": [
        "combat"
      ],
      "tags": [
        "Passive",
        "Combat",
        "Defense"
      ],
      "costSp": 0,
      "maxRank": 3,
      "summary": "While unarmored, your AC becomes 10 to 12 by rank, plus Dexterity and Wisdom modifiers.",
      "details": [],
      "requirements": {
        "classLevelsAnyOf": [
          {
            "classId": "Monk",
            "level": 1
          }
        ]
      }
    },
    "hide": {
      "id": "hide",
      "name": "Hide",
      "emoji": "🫥",
      "sourceType": "class",
      "classId": "Rogue",
      "classes": [
        "Rogue",
        "Ranger"
      ],
      "kind": "active",
      "contexts": [
        "combat"
      ],
      "tags": [
        "Active",
        "Combat",
        "Self",
        "Sneaky",
        "Head"
      ],
      "costSp": 1,
      "maxRank": 5,
      "summary": "Make a Stealth check against the highest enemy Will DC. On a success, gain Hidden for ranks rounds.",
      "details": [],
      "requirements": {
        "classLevelsAnyOf": [
          {
            "classId": "Rogue",
            "level": 1
          },
          {
            "classId": "Ranger",
            "level": 1
          }
        ]
      }
    },
    "sweep_strike": {
      "id": "sweep_strike",
      "name": "Sweep Strike",
      "emoji": "🪄",
      "sourceType": "class",
      "classId": "Fighter",
      "classes": [
        "Fighter",
        "Monk"
      ],
      "kind": "active",
      "contexts": [
        "combat"
      ],
      "tags": [
        "Active",
        "Combat",
        "Attack",
        "Debuff",
        "Arm"
      ],
      "costSp": 2,
      "maxRank": 5,
      "summary": "Attack a row of monsters with a polearm. If the final attack total plus rank beats Reflex DC, apply Off-Guard.",
      "details": [],
      "requirements": {
        "featRanksAllOf": [
          {
            "featId": "polearm_mastery",
            "rank": 3
          }
        ]
      }
    },
    "leg_sweep": {
      "id": "leg_sweep",
      "name": "Leg Sweep",
      "emoji": "🦵",
      "sourceType": "class",
      "classId": "Fighter",
      "classes": [
        "Fighter",
        "Monk"
      ],
      "kind": "active",
      "contexts": [
        "combat"
      ],
      "tags": [
        "Active",
        "Combat",
        "Attack",
        "Debuff",
        "Arm"
      ],
      "costSp": 2,
      "maxRank": 5,
      "summary": "Attack a row of monsters with a polearm. If the final attack total plus rank beats Reflex DC, apply Pinned for rank rounds.",
      "details": [],
      "requirements": {
        "featRanksAllOf": [
          {
            "featId": "polearm_mastery",
            "rank": 5
          }
        ]
      }
    },
    "parry": {
      "id": "parry",
      "name": "Parry",
      "emoji": "🛡️",
      "sourceType": "class",
      "classId": "Fighter",
      "classes": [
        "Fighter",
        "Barbarian",
        "Ranger"
      ],
      "kind": "passive",
      "contexts": [
        "combat"
      ],
      "tags": [
        "Passive",
        "Combat",
        "Shield",
        "Arm"
      ],
      "costSp": 0,
      "maxRank": 5,
      "summary": "If an enemy misses your AC by 10/9/8/7/5 or more, by rank, that enemy becomes Off-Guard.",
      "details": [],
      "requirements": {
        "featRanksAllOf": [
          {
            "featId": "shield_mastery",
            "rank": 1
          }
        ]
      }
    },
    "guard_strike": {
      "id": "guard_strike",
      "name": "Guard Strike",
      "emoji": "🛡️",
      "sourceType": "class",
      "classId": "Fighter",
      "classes": [
        "Fighter",
        "Barbarian",
        "Ranger"
      ],
      "kind": "passive",
      "contexts": [
        "combat"
      ],
      "tags": [
        "Passive",
        "Combat",
        "Shield",
        "Counter",
        "Arm"
      ],
      "costSp": 0,
      "maxRank": 5,
      "summary": "While Guarded, counterattack the first enemy that attacks you each round. Each rank adds +1 damage, and rank 5 adds +1 AC while Guarded.",
      "details": [],
      "requirements": {
        "featRanksAllOf": [
          {
            "featId": "shield_mastery",
            "rank": 3
          }
        ]
      }
    },
    "retaliate": {
      "id": "retaliate",
      "name": "Retaliate",
      "emoji": "💢",
      "sourceType": "class",
      "classId": "Barbarian",
      "classes": [
        "Barbarian"
      ],
      "kind": "passive",
      "contexts": [
        "combat"
      ],
      "tags": [
        "Passive",
        "Combat",
        "Counter",
        "Head"
      ],
      "costSp": 0,
      "maxRank": 3,
      "summary": "Once per round while at or below 20%/40%/60% HP, by rank, counterattack the first enemy that hits you for free.",
      "details": [],
      "requirements": {
        "featRanksAllOf": [
          {
            "featId": "enrage",
            "rank": 5
          }
        ]
      }
    },
    "short_fuse": {
      "id": "short_fuse",
      "name": "Short Fuse",
      "emoji": "🧨",
      "sourceType": "class",
      "classId": "Barbarian",
      "classes": [
        "Barbarian"
      ],
      "kind": "passive",
      "contexts": [
        "combat"
      ],
      "tags": [
        "Passive",
        "Combat",
        "Rage",
        "Head"
      ],
      "costSp": 0,
      "maxRank": 2,
      "summary": "At the start of combat, automatically trigger Enrage with a 25% chance at rank 1 or a 50% chance at rank 2.",
      "details": [],
      "requirements": {
        "featRanksAllOf": [
          {
            "featId": "enrage",
            "rank": 3
          }
        ]
      }
    },
    "dirty_trick": {
      "id": "dirty_trick",
      "name": "Dirty Trick",
      "emoji": "🪙",
      "sourceType": "class",
      "classId": "Rogue",
      "classes": [
        "Rogue"
      ],
      "kind": "active",
      "contexts": [
        "combat"
      ],
      "tags": [
        "Active",
        "Combat",
        "Debuff",
        "Arm"
      ],
      "costSp": 1,
      "maxRank": 3,
      "summary": "1 SP: make a Stealth check against Reflex DC with a +1 per-rank bonus. On a success, the enemy is Blinded for 1 round.",
      "details": [],
      "requirements": {
        "classLevelsAllOf": [
          {
            "classId": "Rogue",
            "level": 1
          }
        ]
      }
    }
  };

  const ABILITIES = {
    "second_wind": {
      "id": "second_wind",
      "name": "Second Wind",
      "classId": "Fighter",
      "kind": "active",
      "tags": [
        "Self",
        "Heal",
        "Head"
      ],
      "contexts": [
        "combat"
      ],
      "costSp": 2,
      "duration": null,
      "summary": "2 SP: heal 1d6 + your Constitution modifier.",
      "details": [
        "A deep breath and a stubborn refusal to fall over."
      ]
    },
    "power_strike": {
      "id": "power_strike",
      "name": "Power Strike",
      "classId": "Fighter",
      "kind": "active",
      "tags": [
        "Attack",
        "Arm"
      ],
      "contexts": [
        "combat"
      ],
      "costSp": 1,
      "duration": null,
      "summary": "1 SP: make an attack at -2 to hit and +4 damage on a hit.",
      "details": [
        "Big swing. Tiny apology."
      ]
    },
    "feint_strike": {
      "id": "feint_strike",
      "name": "Feint Strike",
      "classId": "Fighter",
      "kind": "active",
      "tags": [
        "Attack",
        "Debuff",
        "Head"
      ],
      "contexts": [
        "combat"
      ],
      "costSp": 1,
      "duration": 1,
      "summary": "1 SP: make a normal attack, and the target becomes Off-Guard whether it hits or misses.",
      "details": [
        "Either the blade lands or the bluff does."
      ]
    },
    "guard_strike": {
      "id": "guard_strike",
      "name": "Guard Strike",
      "classId": "Fighter",
      "kind": "active",
      "tags": [
        "Buff",
        "Counter",
        "Arm",
        "Reach"
      ],
      "contexts": [
        "combat"
      ],
      "costSp": 1,
      "duration": 1,
      "summary": "1 SP: gain Guarded and counterattack the first enemy that attacks you before your next turn. Also ignores the -4 flying penalty with melee weapons.",
      "details": [
        "Stand ready and let them regret volunteering."
      ]
    },
    "parry": {
      "id": "parry",
      "name": "Parry",
      "classId": "Fighter",
      "kind": "passive",
      "tags": [
        "Arm",
        "Counter"
      ],
      "contexts": [
        "combat"
      ],
      "costSp": 0,
      "duration": null,
      "summary": "If an attack misses you, the attacker becomes Off-Guard.",
      "details": [
        "Their miss becomes your opening."
      ]
    },
    "aggressive_block": {
      "id": "aggressive_block",
      "name": "Aggressive Block",
      "classId": "Fighter",
      "kind": "passive",
      "tags": [
        "Arm",
        "Shield",
        "Counter"
      ],
      "contexts": [
        "combat"
      ],
      "costSp": 0,
      "duration": null,
      "summary": "With a shield equipped, if an attack misses your AC by more than 8, hit the attacker for free.",
      "details": [
        "A shield is just a counterattack with patience."
      ]
    },
    "enrage": {
      "id": "enrage",
      "name": "Enrage",
      "classId": "Barbarian",
      "kind": "active",
      "tags": [
        "Rage",
        "Self",
        "Buff",
        "Head"
      ],
      "contexts": [
        "combat"
      ],
      "costSp": 2,
      "duration": 10,
      "summary": "2 SP: rage for 10 rounds, gaining +2 melee weapon damage and resistance 2 to bludgeoning, piercing, and slashing.",
      "details": [
        "Subtlety has officially left the building."
      ]
    },
    "topple": {
      "id": "topple",
      "name": "Topple",
      "classId": "Barbarian",
      "kind": "active",
      "tags": [
        "Debuff",
        "Arm"
      ],
      "contexts": [
        "combat"
      ],
      "costSp": 1,
      "duration": 1,
      "summary": "1 SP: make an Athletics check against Reflex DC. On a success, the enemy is Prone for 1 round.",
      "details": [
        "Gravity is doing most of the heavy lifting."
      ]
    },
    "retaliate": {
      "id": "retaliate",
      "name": "Retaliate",
      "classId": "Barbarian",
      "kind": "passive",
      "tags": [
        "Counter",
        "Arm"
      ],
      "contexts": [
        "combat"
      ],
      "costSp": 0,
      "duration": null,
      "summary": "Once per turn while enraged, if an enemy hits you while you are below half HP, attack back for free.",
      "details": [
        "Pain clarifies your priorities."
      ]
    },
    "vicious_strike": {
      "id": "vicious_strike",
      "name": "Vicious Strike",
      "classId": "Barbarian",
      "kind": "active",
      "tags": [
        "Attack",
        "Arm"
      ],
      "contexts": [
        "combat"
      ],
      "costSp": 1,
      "duration": null,
      "summary": "1 SP: on a hit, add your Strength modifier to damage one extra time.",
      "details": [
        "Hit them like you mean the sequel."
      ]
    },
    "frothing_rage": {
      "id": "frothing_rage",
      "name": "Frothing Rage",
      "classId": "Barbarian",
      "kind": "passive",
      "tags": [
        "Head",
        "Rage",
        "Debuff"
      ],
      "contexts": [
        "combat"
      ],
      "costSp": 0,
      "duration": null,
      "summary": "While enraged and attacking, make a Social check against Will DC. If you fail, the enemy still becomes Off-Guard.",
      "details": [
        "Apparently even your bad social rolls are upsetting."
      ]
    },
    "martial_arts": {
      "id": "martial_arts",
      "name": "Martial Arts",
      "classId": "Monk",
      "kind": "passive",
      "tags": [
        "Arm",
        "Leg"
      ],
      "contexts": [
        "combat"
      ],
      "costSp": 0,
      "duration": null,
      "summary": "Unarmed and simple-weapon attacks use at least a d6, and while unarmored your AC becomes 10 + DEX mod + WIS mod.",
      "details": [
        "Congratulations, your whole body is equipment now."
      ]
    },
    "tree_stance": {
      "id": "tree_stance",
      "name": "Tree Stance",
      "classId": "Monk",
      "kind": "active",
      "tags": [
        "Self",
        "Buff",
        "Stance",
        "Arm"
      ],
      "contexts": [
        "combat"
      ],
      "costSp": 1,
      "duration": 10,
      "summary": "1 SP: for 10 rounds, gain damage reduction 3 against bludgeoning, piercing, and slashing.",
      "details": [
        "Be inconveniently solid."
      ]
    },
    "river_stance": {
      "id": "river_stance",
      "name": "River Stance",
      "classId": "Monk",
      "kind": "active",
      "tags": [
        "Buff",
        "Stance",
        "Leg"
      ],
      "contexts": [
        "combat"
      ],
      "costSp": 1,
      "duration": 10,
      "summary": "1 SP: for 10 rounds, when an unarmed attack hits, make Acrobatics against Reflex DC to apply Off-Guard.",
      "details": [
        "Flow around the guard and leave them wondering."
      ]
    },
    "mountain_stance": {
      "id": "mountain_stance",
      "name": "Mountain Stance",
      "classId": "Monk",
      "kind": "active",
      "tags": [
        "Buff",
        "Stance",
        "Leg"
      ],
      "contexts": [
        "combat"
      ],
      "costSp": 1,
      "duration": 10,
      "summary": "1 SP: for 10 rounds, gain +2 AC.",
      "details": [
        "Become local geography."
      ]
    },
    "cloud_stance": {
      "id": "cloud_stance",
      "name": "Cloud Stance",
      "classId": "Monk",
      "kind": "active",
      "tags": [
        "Buff",
        "Stance",
        "Leg"
      ],
      "contexts": [
        "combat"
      ],
      "costSp": 1,
      "duration": 10,
      "summary": "1 SP: for 10 rounds, reduce damage taken on hit by 1d4.",
      "details": [
        "Let the hit meet mostly empty air."
      ]
    },
    "flame_stance": {
      "id": "flame_stance",
      "name": "Flame Stance",
      "classId": "Monk",
      "kind": "active",
      "tags": [
        "Buff",
        "Stance",
        "Leg"
      ],
      "contexts": [
        "combat"
      ],
      "costSp": 1,
      "duration": 10,
      "summary": "1 SP: for 10 rounds, gain +2 to attack rolls.",
      "details": [
        "Move first, think never."
      ]
    },
    "hunting": {
      "id": "hunting",
      "name": "Hunting",
      "classId": "Ranger",
      "kind": "passive",
      "tags": [
        "Head"
      ],
      "contexts": [
        "exploration",
        "combat"
      ],
      "costSp": 0,
      "duration": null,
      "summary": "Search gets +2 Perception, and stepping onto a revealed enemy tile starts combat with a free opening attack.",
      "details": [
        "The brush is full of unpaid overtime."
      ]
    },
    "hunters_mark": {
      "id": "hunters_mark",
      "name": "Hunter's Mark",
      "classId": "Ranger",
      "kind": "active",
      "tags": [
        "Debuff",
        "Mark",
        "Head"
      ],
      "contexts": [
        "combat"
      ],
      "costSp": 1,
      "duration": 5,
      "summary": "1 SP: make a Survival check against Will DC. On a success, the target is marked for 5 rounds and your attacks against it deal +1d4 damage.",
      "details": [
        "Once the quarry is tagged, excuses get thinner."
      ]
    },
    "eagle_eye": {
      "id": "eagle_eye",
      "name": "Eagle Eye",
      "classId": "Ranger",
      "kind": "passive",
      "tags": [
        "Head"
      ],
      "contexts": [
        "exploration"
      ],
      "costSp": 0,
      "duration": null,
      "summary": "Search reaches every tile within 2 spaces of you.",
      "details": [
        "Nearby nonsense loses its hiding spots."
      ]
    },
    "precise_strike": {
      "id": "precise_strike",
      "name": "Precise Strike",
      "classId": "Ranger",
      "kind": "active",
      "tags": [
        "Attack",
        "Head"
      ],
      "contexts": [
        "combat"
      ],
      "costSp": 1,
      "duration": null,
      "summary": "1 SP: make an attack with +4 to hit.",
      "details": [
        "Pick the line and commit."
      ]
    },
    "spike_lure": {
      "id": "spike_lure",
      "name": "Spike Lure",
      "classId": "Ranger",
      "kind": "active",
      "tags": [
        "Buff",
        "Arm"
      ],
      "contexts": [
        "combat"
      ],
      "costSp": 1,
      "duration": 5,
      "summary": "1 SP: for 5 rounds, whenever an enemy misses you, it takes 1d4 piercing damage.",
      "details": [
        "Their miss still leaves a hole in them."
      ]
    },
    "ambush": {
      "id": "ambush",
      "name": "Ambush",
      "classId": "Ranger",
      "kind": "passive",
      "tags": [
        "Head",
        "Debuff"
      ],
      "contexts": [
        "combat"
      ],
      "costSp": 0,
      "duration": null,
      "summary": "Combat starts with the enemy Off-Guard.",
      "details": [
        "First impressions should be unfair."
      ]
    },
    "sneak_attack": {
      "id": "sneak_attack",
      "name": "Sneak Attack",
      "classId": "Rogue",
      "kind": "passive",
      "tags": [
        "Arm"
      ],
      "contexts": [
        "combat"
      ],
      "costSp": 0,
      "duration": null,
      "summary": "When an agile-weapon attack hits, make a Dexterity check against DC 10 + enemy level. On a success, add 1d6 damage.",
      "details": [
        "Find the soft spot. Be rude about it."
      ]
    },
    "cover_step": {
      "id": "cover_step",
      "name": "Cover Step",
      "classId": "Rogue",
      "kind": "active",
      "tags": [
        "Buff",
        "Leg"
      ],
      "contexts": [
        "combat"
      ],
      "costSp": 1,
      "duration": 1,
      "summary": "1 SP: make a Stealth check against Will DC. On a success, gain +4 AC and +4 to your next attack for 1 round.",
      "details": [
        "Duck, reposition, overachieve."
      ]
    },
    "flight_step": {
      "id": "flight_step",
      "name": "Flight Step",
      "classId": "Rogue",
      "kind": "passive",
      "tags": [
        "Buff",
        "Leg"
      ],
      "contexts": [
        "combat"
      ],
      "costSp": 0,
      "duration": null,
      "summary": "Whenever you get hit, gain +2 AC for 1 round.",
      "details": [
        "Pain is educational."
      ]
    },
    "open_wound": {
      "id": "open_wound",
      "name": "Open Wound",
      "classId": "Rogue",
      "kind": "active",
      "tags": [
        "Attack",
        "Bleed",
        "Arm"
      ],
      "contexts": [
        "combat"
      ],
      "costSp": 1,
      "duration": 5,
      "summary": "1 SP: make an attack. On a hit, apply Bleed 2.",
      "details": []
    },
    "skill_acrobatics_nimble_escape": {
      "id": "skill_acrobatics_nimble_escape",
      "name": "Nimble Escape",
      "sourceType": "skill",
      "skillId": "Acrobatics",
      "unlockLevel": 2,
      "kind": "passive",
      "tags": [
        "Movement",
        "Exploration",
        "Combat"
      ],
      "contexts": [
        "exploration",
        "combat"
      ],
      "costSp": 0,
      "duration": null,
      "summary": "+4 to flee checks.",
      "details": [
        "Heroism is optional."
      ]
    },
    "skill_athletics_pack_mule": {
      "id": "skill_athletics_pack_mule",
      "name": "Pack Mule",
      "sourceType": "skill",
      "skillId": "Athletics",
      "unlockLevel": 2,
      "kind": "passive",
      "tags": [
        "Exploration",
        "Carry"
      ],
      "contexts": [
        "exploration"
      ],
      "costSp": 0,
      "duration": null,
      "summary": "+10 inventory slots.",
      "details": [
        "The backpack hates this. You do not."
      ]
    },
    "skill_perception_keen_search": {
      "id": "skill_perception_keen_search",
      "name": "Keen Search",
      "sourceType": "skill",
      "skillId": "Perception",
      "unlockLevel": 2,
      "kind": "passive",
      "tags": [
        "Exploration",
        "Search"
      ],
      "contexts": [
        "exploration"
      ],
      "costSp": 0,
      "duration": null,
      "summary": "+4 Perception on Search actions.",
      "details": [
        "You can smell suspicious treasure now."
      ]
    },
    "skill_social_haggler": {
      "id": "skill_social_haggler",
      "name": "Haggler",
      "sourceType": "skill",
      "skillId": "Social",
      "unlockLevel": 2,
      "kind": "passive",
      "tags": [
        "Town",
        "Money"
      ],
      "contexts": [
        "exploration"
      ],
      "costSp": 0,
      "duration": null,
      "summary": "Gain an extra 5% buy discount and 5% sell bonus in shops.",
      "details": [
        "Charm is cheaper than full price."
      ]
    },
    "skill_stealth_cautious_camp": {
      "id": "skill_stealth_cautious_camp",
      "name": "Cautious Camp",
      "sourceType": "skill",
      "skillId": "Stealth",
      "unlockLevel": 2,
      "kind": "passive",
      "tags": [
        "Exploration",
        "Rest"
      ],
      "contexts": [
        "exploration"
      ],
      "costSp": 0,
      "duration": null,
      "summary": "When short-resting in the wilderness, roll Stealth twice and keep the better result.",
      "details": [
        "Camp like the bushes owe you money."
      ]
    },
    "skill_survival_gatherers_bounty": {
      "id": "skill_survival_gatherers_bounty",
      "name": "Gatherer's Bounty",
      "sourceType": "skill",
      "skillId": "Survival",
      "unlockLevel": 2,
      "kind": "passive",
      "tags": [
        "Exploration",
        "Gathering"
      ],
      "contexts": [
        "exploration"
      ],
      "costSp": 0,
      "duration": null,
      "summary": "Successful gathering gives double resources.",
      "details": [
        "When the patch is good, empty the patch."
      ]
    },
    "skill_acrobatics_defensive_roll": {
      "id": "skill_acrobatics_defensive_roll",
      "name": "Defensive Roll",
      "sourceType": "skill",
      "skillId": "Acrobatics",
      "unlockLevel": 4,
      "kind": "passive",
      "tags": [
        "Combat",
        "Defense"
      ],
      "contexts": [
        "combat"
      ],
      "costSp": 0,
      "duration": null,
      "summary": "The first time each combat you would take damage, reduce it by 1d6.",
      "details": [
        "Turns out falling stylishly helps."
      ]
    },
    "skill_athletics_overpower": {
      "id": "skill_athletics_overpower",
      "name": "Overpower",
      "sourceType": "skill",
      "skillId": "Athletics",
      "unlockLevel": 4,
      "kind": "passive",
      "tags": [
        "Combat",
        "Attack"
      ],
      "contexts": [
        "combat"
      ],
      "costSp": 0,
      "duration": null,
      "summary": "Melee attacks against Prone or Off-Guard enemies deal +2 damage.",
      "details": [
        "If they are already wobbling, finish the thought."
      ]
    },
    "skill_perception_treasure_hunter": {
      "id": "skill_perception_treasure_hunter",
      "name": "Treasure Hunter",
      "sourceType": "skill",
      "skillId": "Perception",
      "unlockLevel": 4,
      "kind": "passive",
      "tags": [
        "Exploration",
        "Search",
        "Loot"
      ],
      "contexts": [
        "exploration"
      ],
      "costSp": 0,
      "duration": null,
      "summary": "Search radius increases by 1, and treasure cache coin rewards are doubled.",
      "details": [
        "You find the stash and the better stash."
      ]
    },
    "skill_social_menacing_presence": {
      "id": "skill_social_menacing_presence",
      "name": "Menacing Presence",
      "sourceType": "skill",
      "skillId": "Social",
      "unlockLevel": 4,
      "kind": "passive",
      "tags": [
        "Combat",
        "Debuff"
      ],
      "contexts": [
        "combat"
      ],
      "costSp": 0,
      "duration": null,
      "summary": "At the start of combat, make a Social check against Will DC. On a success, the enemy becomes Off-Guard.",
      "details": [
        "Sometimes the glare gets initiative."
      ]
    },
    "skill_survival_field_dressing": {
      "id": "skill_survival_field_dressing",
      "name": "Field Dressing",
      "sourceType": "skill",
      "skillId": "Survival",
      "unlockLevel": 4,
      "kind": "passive",
      "tags": [
        "Combat",
        "Healing"
      ],
      "contexts": [
        "combat",
        "exploration"
      ],
      "costSp": 0,
      "duration": null,
      "summary": "After winning combat, recover HP equal to the enemy's level + your Wisdom modifier, minimum 1.",
      "details": [
        "Patch up, wipe off, keep moving."
      ]
    }
  };

  Object.assign(store, {
    SKILL_FEATS,
    GENERAL_FEATS,
    CLASS_FEATS,
    ABILITIES,
  });
})();
