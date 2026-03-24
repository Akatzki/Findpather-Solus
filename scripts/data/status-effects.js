// Status effects
(() => {
  const store = window.PF_DATA;

  const STATUS_EFFECT_TEMPLATES = {
    "enrage": {
      "id": "enrage",
      "name": "Enrage",
      "description": "More melee damage, some physical resistance, and no calm, thoughtful Concentrate feats.",
      "duration": 10,
      "durationMode": "turn",
      "durationUnit": "rounds",
      "tags": [
        "Buff",
        "Rage"
      ],
      "disabledAbilityTags": [
        "concentrate"
      ],
      "modifiers": {
        "damageBonusMelee": 1,
        "resistances": {
          "bludgeoning": 2,
          "piercing": 2,
          "slashing": 2
        }
      }
    },
    "guarded": {
      "id": "guarded",
      "name": "Guarded",
      "description": "+2 AC. Nice and responsible.",
      "duration": 1,
      "durationMode": "turn",
      "durationUnit": "rounds",
      "tags": [
        "Buff"
      ],
      "modifiers": {
        "acModifier": 2
      }
    },
    "brace_for_impact": {
      "id": "brace_for_impact",
      "name": "Brace for Impact",
      "description": "Resistance 3 to bludgeoning, piercing, and slashing. Time to become annoying to damage.",
      "duration": 1,
      "durationMode": "turn",
      "durationUnit": "rounds",
      "tags": [
        "Buff"
      ],
      "modifiers": {
        "resistances": {
          "bludgeoning": 3,
          "piercing": 3,
          "slashing": 3
        }
      }
    },
    "off_guard": {
      "id": "off_guard",
      "name": "Off-Guard",
      "description": "-2 AC, and melee attacks ignore the normal -4 flying penalty against this target.",
      "duration": 1,
      "durationMode": "turn",
      "durationUnit": "rounds",
      "tags": [
        "Debuff"
      ],
      "modifiers": {
        "acModifier": -2
      }
    },
    "prone": {
      "id": "prone",
      "name": "Prone",
      "description": "-4 AC and -2 to attack rolls. The floor has won.",
      "duration": 1,
      "durationMode": "turn",
      "durationUnit": "rounds",
      "tags": [
        "Debuff"
      ],
      "modifiers": {
        "acModifier": -4,
        "attackRollModifier": -2
      }
    },
    "staggered": {
      "id": "staggered",
      "name": "Staggered",
      "description": "-2 to attack rolls. Everything feels one beat late.",
      "duration": 2,
      "durationMode": "turn",
      "durationUnit": "rounds",
      "tags": [
        "Debuff"
      ],
      "modifiers": {
        "attackRollModifier": -2
      }
    },
    "marked_prey": {
      "id": "marked_prey",
      "name": "Hunter's Mark",
      "description": "Your attacks deal +1d4 damage to this target while the mark lasts.",
      "duration": 5,
      "durationMode": "turn",
      "durationUnit": "rounds",
      "tags": [
        "Debuff",
        "Mark"
      ],
      "modifiers": {}
    },
    "blinded": {
      "id": "blinded",
      "name": "Blinded",
      "description": "-4 to attack rolls. See also: not seeing.",
      "duration": 1,
      "durationMode": "turn",
      "durationUnit": "rounds",
      "tags": [
        "Debuff"
      ],
      "modifiers": {
        "attackRollModifier": -4
      }
    },
    "poison": {
      "id": "poison",
      "name": "Poison",
      "description": "Take poison damage at the end of each turn for up to 5 turns. Any leftover misery follows you into exploration.",
      "duration": 5,
      "durationMode": "turn",
      "durationUnit": "turns",
      "tags": [
        "Debuff",
        "Poison"
      ],
      "ongoingDamage": 1,
      "ongoingDamageType": "poison",
      "modifiers": {}
    },
    "bleed": {
      "id": "bleed",
      "name": "Bleed",
      "description": "Take necrotic damage at the end of each turn for up to 5 turns. Yes, it follows you into exploration.",
      "duration": 5,
      "durationMode": "turn",
      "durationUnit": "turns",
      "tags": [
        "Debuff",
        "Bleed"
      ],
      "ongoingDamage": 1,
      "ongoingDamageType": "necrotic",
      "modifiers": {}
    },
    "head_injury": {
      "id": "head_injury",
      "name": "Head Injury",
      "description": "Head-tag feats are offline for the duration. Concussions are rude.",
      "duration": 1,
      "durationMode": "turn",
      "durationUnit": "turns",
      "tags": [
        "Debuff",
        "Injury"
      ],
      "disabledAbilityTags": [
        "head"
      ],
      "modifiers": {}
    },
    "arm_injury": {
      "id": "arm_injury",
      "name": "Arm Injury",
      "description": "Arm-tag feats are offline for the duration. Swinging gets complicated.",
      "duration": 1,
      "durationMode": "turn",
      "durationUnit": "turns",
      "tags": [
        "Debuff",
        "Injury"
      ],
      "disabledAbilityTags": [
        "arm"
      ],
      "modifiers": {}
    },
    "leg_injury": {
      "id": "leg_injury",
      "name": "Leg Injury",
      "description": "Leg-tag feats are offline for the duration. Mobility has filed a complaint.",
      "duration": 1,
      "durationMode": "turn",
      "durationUnit": "turns",
      "tags": [
        "Debuff",
        "Injury"
      ],
      "disabledAbilityTags": [
        "leg"
      ],
      "modifiers": {}
    },
    "guard_strike_ready": {
      "id": "guard_strike_ready",
      "name": "Guard Strike",
      "description": "Counterattack the first enemy that attacks you before your next turn.",
      "duration": 1,
      "durationMode": "turn",
      "durationUnit": "rounds",
      "tags": [
        "Buff",
        "Counter",
        "Reach"
      ],
      "modifiers": {}
    },
    "spike_lure": {
      "id": "spike_lure",
      "name": "Spike Lure",
      "description": "If an enemy misses you, it takes 1d4 piercing damage for the trouble.",
      "duration": 5,
      "durationMode": "turn",
      "durationUnit": "rounds",
      "tags": [
        "Buff"
      ],
      "modifiers": {}
    },
    "tree_stance": {
      "id": "tree_stance",
      "name": "Tree Stance",
      "description": "Resistance 3 to bludgeoning, piercing, and slashing while you stay rooted.",
      "duration": 10,
      "durationMode": "turn",
      "durationUnit": "rounds",
      "tags": [
        "Buff",
        "Stance"
      ],
      "modifiers": {
        "resistances": {
          "bludgeoning": 3,
          "piercing": 3,
          "slashing": 3
        }
      }
    },
    "river_stance": {
      "id": "river_stance",
      "name": "River Stance",
      "description": "When your unarmed attack hits, you can try an Acrobatics check to make the target Off-Guard.",
      "duration": 10,
      "durationMode": "turn",
      "durationUnit": "rounds",
      "tags": [
        "Buff",
        "Stance"
      ],
      "modifiers": {}
    },
    "mountain_stance": {
      "id": "mountain_stance",
      "name": "Mountain Stance",
      "description": "+2 AC while the stance lasts. Be inconveniently solid.",
      "duration": 10,
      "durationMode": "turn",
      "durationUnit": "rounds",
      "tags": [
        "Buff",
        "Stance"
      ],
      "modifiers": {
        "acModifier": 2
      }
    },
    "cloud_stance": {
      "id": "cloud_stance",
      "name": "Cloud Stance",
      "description": "Reduce damage from each hit by 1d4. Float, do not splat.",
      "duration": 10,
      "durationMode": "turn",
      "durationUnit": "rounds",
      "tags": [
        "Buff",
        "Stance"
      ],
      "modifiers": {}
    },
    "flame_stance": {
      "id": "flame_stance",
      "name": "Flame Stance",
      "description": "+2 to attack rolls while the stance lasts. Aggression, but organized.",
      "duration": 10,
      "durationMode": "turn",
      "durationUnit": "rounds",
      "tags": [
        "Buff",
        "Stance"
      ],
      "modifiers": {
        "attackRollModifier": 2
      }
    },
    "cover_step": {
      "id": "cover_step",
      "name": "Cover Step",
      "description": "+4 AC and +4 to your next attack for 1 round.",
      "duration": 1,
      "durationMode": "turn",
      "durationUnit": "rounds",
      "tags": [
        "Buff"
      ],
      "consumeOnAttack": true,
      "modifiers": {
        "acModifier": 4,
        "attackRollModifier": 4
      }
    },
    "quiet_step": {
      "id": "quiet_step",
      "name": "Quiet Step",
      "description": "For 10 moves, stepping into an enemy tile does not start combat.",
      "duration": 10,
      "durationMode": "move",
      "durationUnit": "movements",
      "tags": [
        "Buff",
        "Stealth"
      ],
      "modifiers": {}
    },
    "flight_step": {
      "id": "flight_step",
      "name": "Flight Step",
      "description": "+2 AC for 1 round after you get hit. Lesson learned.",
      "duration": 1,
      "durationMode": "turn",
      "durationUnit": "rounds",
      "tags": [
        "Buff"
      ],
      "modifiers": {
        "acModifier": 2
      }
    },
    "concussed": {
      "id": "concussed",
      "name": "Concussed",
      "description": "Head-tag feats and actions are disabled.",
      "duration": 1,
      "durationMode": "turn",
      "durationUnit": "turns",
      "tags": [
        "Debuff",
        "Injury"
      ],
      "disabledAbilityTags": [
        "head"
      ],
      "modifiers": {}
    },
    "pinned": {
      "id": "pinned",
      "name": "Pinned",
      "description": "Leg-tag feats and actions are disabled.",
      "duration": 1,
      "durationMode": "turn",
      "durationUnit": "turns",
      "tags": [
        "Debuff",
        "Injury"
      ],
      "disabledAbilityTags": [
        "leg"
      ],
      "modifiers": {}
    },
    "disarmed": {
      "id": "disarmed",
      "name": "Disarmed",
      "description": "Arm-tag feats and actions are disabled.",
      "duration": 1,
      "durationMode": "turn",
      "durationUnit": "turns",
      "tags": [
        "Debuff",
        "Injury"
      ],
      "disabledAbilityTags": [
        "arm"
      ],
      "modifiers": {}
    },
    "hidden": {
      "id": "hidden",
      "name": "Hidden",
      "description": "+4 AC while hidden. Non-sneaky actions remove Hidden.",
      "duration": 1,
      "durationMode": "turn",
      "durationUnit": "turns",
      "tags": [
        "Buff",
        "Stealth"
      ],
      "modifiers": {
        "acModifier": 4
      }
    }
  };

  Object.assign(store, {
    STATUS_EFFECT_TEMPLATES,
  });
})();
