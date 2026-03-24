// Monster definitions
(() => {
  const store = window.PF_DATA;

  const MONSTERS = [
    {
      "id": "goblin",
      "name": "Goblin Skirmisher",
      "level": 1,
      "hp": 12,
      "ac": 12,
      "attackBonus": 3,
      "damage": "1d6+2",
      "damageType": "slashing",
      "status": [
        {
          "id": "fort",
          "label": "Fortitude",
          "dc": 13
        },
        {
          "id": "reflex",
          "label": "Reflex",
          "dc": 15
        },
        {
          "id": "will",
          "label": "Will",
          "dc": 12
        }
      ],
      "loot": {
        "coins": [
          30,
          120
        ],
        "items": [
          {
            "id": "herbs",
            "chance": 0.35,
            "qty": [
              1,
              2
            ]
          }
        ]
      },
      "traits": [
        "humanoid",
        "goblin",
        "cowardly"
      ],
      "basicAttackTags": [
        "arm"
      ]
    },
    {
      "id": "wolf",
      "name": "Hungry Wolf",
      "level": 1,
      "hp": 14,
      "ac": 11,
      "attackBonus": 3,
      "damage": "1d6+1",
      "damageType": "piercing",
      "status": [
        {
          "id": "fort",
          "label": "Fortitude",
          "dc": 14
        },
        {
          "id": "reflex",
          "label": "Reflex",
          "dc": 13
        },
        {
          "id": "will",
          "label": "Will",
          "dc": 11
        }
      ],
      "loot": {
        "coins": [
          20,
          80
        ],
        "items": [
          {
            "id": "hide",
            "chance": 0.55,
            "qty": [
              1,
              1
            ]
          }
        ]
      },
      "traits": [
        "animal",
        "pack_hunter"
      ],
      "basicAttackTags": [
        "head"
      ]
    },
    {
      "id": "skeleton",
      "name": "Restless Skeleton",
      "level": 2,
      "hp": 20,
      "ac": 13,
      "attackBonus": 4,
      "damage": "1d8+2",
      "damageType": "slashing",
      "status": [
        {
          "id": "fort",
          "label": "Fortitude",
          "dc": 16
        },
        {
          "id": "reflex",
          "label": "Reflex",
          "dc": 12
        },
        {
          "id": "will",
          "label": "Will",
          "dc": 15
        }
      ],
      "loot": {
        "coins": [
          80,
          220
        ],
        "items": [
          {
            "id": "ore",
            "chance": 0.25,
            "qty": [
              1,
              2
            ]
          }
        ]
      },
      "traits": [
        "undead"
      ],
      "basicAttackTags": [
        "arm"
      ]
    },
    {
      "id": "bandit",
      "name": "Roadside Bandit",
      "level": 2,
      "hp": 18,
      "ac": 12,
      "attackBonus": 4,
      "damage": "1d6+3",
      "damageType": "piercing",
      "status": [
        {
          "id": "fort",
          "label": "Fortitude",
          "dc": 14
        },
        {
          "id": "reflex",
          "label": "Reflex",
          "dc": 15
        },
        {
          "id": "will",
          "label": "Will",
          "dc": 13
        }
      ],
      "loot": {
        "coins": [
          120,
          280
        ],
        "items": [
          {
            "id": "potion_healing",
            "chance": 0.2,
            "qty": [
              1,
              1
            ]
          }
        ]
      },
      "traits": [
        "humanoid"
      ],
      "basicAttackTags": [
        "arm"
      ]
    },
    {
      "id": "slime",
      "name": "Cave Slime",
      "level": 3,
      "hp": 28,
      "ac": 10,
      "attackBonus": 5,
      "damage": "1d10+2",
      "damageType": "acid",
      "status": [
        {
          "id": "fort",
          "label": "Fortitude",
          "dc": 17
        },
        {
          "id": "reflex",
          "label": "Reflex",
          "dc": 10
        },
        {
          "id": "will",
          "label": "Will",
          "dc": 12
        }
      ],
      "loot": {
        "coins": [
          150,
          350
        ],
        "items": [
          {
            "id": "ore",
            "chance": 0.5,
            "qty": [
              1,
              3
            ]
          }
        ]
      },
      "traits": [
        "ooze"
      ],
      "basicAttackTags": [
        "head"
      ]
    },
    {
      "id": "crystal_spider",
      "name": "Crystal Fang Spider",
      "level": 3,
      "hp": 26,
      "ac": 14,
      "attackBonus": 6,
      "damage": "1d8+3",
      "damageType": "piercing",
      "status": [
        {
          "id": "fort",
          "label": "Fortitude",
          "dc": 15
        },
        {
          "id": "reflex",
          "label": "Reflex",
          "dc": 17
        },
        {
          "id": "will",
          "label": "Will",
          "dc": 12
        }
      ],
      "loot": {
        "coins": [
          140,
          320
        ],
        "items": [
          {
            "id": "ore",
            "chance": 0.35,
            "qty": [
              1,
              2
            ]
          },
          {
            "id": "hide",
            "chance": 0.3,
            "qty": [
              1,
              1
            ]
          }
        ]
      },
      "traits": [
        "animal",
        "poison"
      ],
      "basicAttackTags": [
        "head"
      ]
    },
    {
      "id": "ember_hound",
      "name": "Ember Hound",
      "level": 4,
      "hp": 34,
      "ac": 14,
      "attackBonus": 7,
      "damage": "1d10+4",
      "damageType": "fire",
      "status": [
        {
          "id": "fort",
          "label": "Fortitude",
          "dc": 18
        },
        {
          "id": "reflex",
          "label": "Reflex",
          "dc": 16
        },
        {
          "id": "will",
          "label": "Will",
          "dc": 14
        }
      ],
      "loot": {
        "coins": [
          210,
          430
        ],
        "items": [
          {
            "id": "hide",
            "chance": 0.45,
            "qty": [
              1,
              2
            ]
          },
          {
            "id": "potion_healing",
            "chance": 0.15,
            "qty": [
              1,
              1
            ]
          }
        ]
      },
      "traits": [
        "elemental",
        "beast",
        "fire"
      ],
      "basicAttackTags": [
        "head"
      ]
    },
    {
      "id": "cinder_acolyte",
      "name": "Cinder Acolyte",
      "level": 4,
      "hp": 30,
      "ac": 13,
      "attackBonus": 7,
      "damage": "1d8+4",
      "damageType": "fire",
      "status": [
        {
          "id": "fort",
          "label": "Fortitude",
          "dc": 17
        },
        {
          "id": "reflex",
          "label": "Reflex",
          "dc": 15
        },
        {
          "id": "will",
          "label": "Will",
          "dc": 18
        }
      ],
      "loot": {
        "coins": [
          220,
          460
        ],
        "items": [
          {
            "id": "ore",
            "chance": 0.3,
            "qty": [
              1,
              2
            ]
          },
          {
            "id": "potion_healing",
            "chance": 0.22,
            "qty": [
              1,
              1
            ]
          }
        ]
      },
      "traits": [
        "humanoid",
        "fire"
      ],
      "basicAttackTags": [
        "head"
      ]
    },
    {
      "id": "marsh_troll",
      "name": "Marsh Troll",
      "level": 5,
      "hp": 42,
      "ac": 15,
      "attackBonus": 8,
      "damage": "1d12+4",
      "damageType": "bludgeoning",
      "status": [
        {
          "id": "fort",
          "label": "Fortitude",
          "dc": 20
        },
        {
          "id": "reflex",
          "label": "Reflex",
          "dc": 14
        },
        {
          "id": "will",
          "label": "Will",
          "dc": 15
        }
      ],
      "loot": {
        "coins": [
          280,
          560
        ],
        "items": [
          {
            "id": "hide",
            "chance": 0.55,
            "qty": [
              1,
              2
            ]
          },
          {
            "id": "herbs",
            "chance": 0.4,
            "qty": [
              1,
              3
            ]
          }
        ]
      },
      "traits": [
        "giant",
        "regenerating"
      ],
      "basicAttackTags": [
        "arm"
      ]
    },
    {
      "id": "fen_wraith",
      "name": "Fen Wraith",
      "level": 5,
      "hp": 38,
      "ac": 16,
      "attackBonus": 9,
      "damage": "2d6+4",
      "damageType": "necrotic",
      "status": [
        {
          "id": "fort",
          "label": "Fortitude",
          "dc": 18
        },
        {
          "id": "reflex",
          "label": "Reflex",
          "dc": 17
        },
        {
          "id": "will",
          "label": "Will",
          "dc": 20
        }
      ],
      "loot": {
        "coins": [
          300,
          610
        ],
        "items": [
          {
            "id": "herbs",
            "chance": 0.5,
            "qty": [
              1,
              2
            ]
          },
          {
            "id": "potion_healing",
            "chance": 0.18,
            "qty": [
              1,
              1
            ]
          }
        ]
      },
      "traits": [
        "undead",
        "incorporeal"
      ],
      "basicAttackTags": [
        "head"
      ]
    },
    {
      "id": "storm_drake",
      "name": "Storm Drake",
      "level": 6,
      "hp": 54,
      "ac": 18,
      "attackBonus": 11,
      "damage": "2d8+5",
      "damageType": "electricity",
      "status": [
        {
          "id": "fort",
          "label": "Fortitude",
          "dc": 22
        },
        {
          "id": "reflex",
          "label": "Reflex",
          "dc": 19
        },
        {
          "id": "will",
          "label": "Will",
          "dc": 17
        }
      ],
      "loot": {
        "coins": [
          420,
          780
        ],
        "items": [
          {
            "id": "ore",
            "chance": 0.6,
            "qty": [
              2,
              4
            ]
          },
          {
            "id": "potion_healing",
            "chance": 0.25,
            "qty": [
              1,
              1
            ]
          }
        ]
      },
      "traits": [
        "dragon",
        "electricity"
      ],
      "basicAttackTags": [
        "head"
      ]
    },
    {
      "id": "obsidian_knight",
      "name": "Obsidian Knight",
      "level": 6,
      "hp": 58,
      "ac": 19,
      "attackBonus": 12,
      "damage": "2d10+5",
      "damageType": "slashing",
      "status": [
        {
          "id": "fort",
          "label": "Fortitude",
          "dc": 23
        },
        {
          "id": "reflex",
          "label": "Reflex",
          "dc": 18
        },
        {
          "id": "will",
          "label": "Will",
          "dc": 21
        }
      ],
      "loot": {
        "coins": [
          460,
          860
        ],
        "items": [
          {
            "id": "ore",
            "chance": 0.5,
            "qty": [
              2,
              3
            ]
          },
          {
            "id": "potion_healing",
            "chance": 0.3,
            "qty": [
              1,
              1
            ]
          }
        ]
      },
      "traits": [
        "construct",
        "armored"
      ],
      "basicAttackTags": [
        "arm"
      ]
    }
  ];

  Object.assign(store, {
    MONSTERS,
  });
})();
