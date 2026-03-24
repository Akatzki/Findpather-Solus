// Areas and dungeon links
(() => {
  const store = window.PF_DATA;

  const AREAS = [
    {
      "id": "town",
      "name": "Astaria",
      "level": 0,
      "map": false,
      "shop": true,
      "description": "A safe town with beds, shops, and a suspicious number of people eager to outsource danger."
    },
    {
      "id": "woods",
      "name": "Whispering Woods",
      "level": 1,
      "map": true,
      "size": 18,
      "travelCostCp": 0,
      "description": "Misty woods full of ruins, hidden holes, and things making eye contact from the bushes.",
      "encounterPool": [
        "goblin",
        "wolf"
      ],
      "resourcePool": [
        "herbs",
        "hide",
        "hardwood",
        "linen_cloth"
      ],
      "treasureRange": [
        20,
        120
      ],
      "terrainRows": [
        "FFMMFFFFPDDPWWPPFF",
        "FFMFFFFFPDDPWWPPFF",
        "FFFFFFFPPDDPWWPFFF",
        "FFDDDDDDDDDPWWFFFF",
        "FFFMPPFPDDPPWWFFFF",
        "FFFFFPPPDDPPWWFFFF",
        "FFFFFPPPDDPPWWPFFF",
        "FFFFPPPPDDPPWWPPFF",
        "FFPPPPPPDDDDDDDDDF",
        "PDDDDDDDDDDPPWWPPF",
        "FFPPPPPPDDPPWWPFFF",
        "FFFFFPPPDDPPWWFFFF",
        "FFFFFPPPDDPPWWFFFF",
        "FFFFPPPPDDPPWWFFFF",
        "FFFPPPFPDDPPWWFFFF",
        "FFPPFFFPDDPPWWFFFF",
        "FPPFFFFFPDDPWWFFFF",
        "FFFFFFFPPDDPWWFFFF"
      ]
    },
    {
      "id": "ruins",
      "name": "Sunken Ruins",
      "level": 2,
      "map": true,
      "size": 9,
      "travelCostCp": 0,
      "description": "Half-buried stonework where bandits and skeletons both act like they pay rent.",
      "encounterPool": [
        "bandit",
        "skeleton",
        "wolf"
      ],
      "resourcePool": [
        "ore",
        "herbs",
        "linen_cloth",
        "hardwood"
      ],
      "treasureRange": [
        80,
        240
      ],
      "terrainRows": [
        "MMDDDDDMM",
        "MDDPPPDWM",
        "DDPWWPDDM",
        "DPDDDDPDM",
        "DDDDPDDDD",
        "MDDPPPDWM",
        "MDDDWDDDM",
        "MMDPPPDMM",
        "MMMDDDMMM"
      ]
    },
    {
      "id": "caves",
      "name": "Crystal Caves",
      "level": 3,
      "map": true,
      "size": 9,
      "travelCostCp": 0,
      "description": "Wet caves packed with sharp crystals, acid puddles, and patient things with too many legs.",
      "encounterPool": [
        "slime",
        "crystal_spider",
        "skeleton"
      ],
      "resourcePool": [
        "ore",
        "crystal_shard"
      ],
      "treasureRange": [
        120,
        320
      ],
      "terrainRows": [
        "MMMMDMMMM",
        "MMDDDDDMM",
        "MDDWMWDDM",
        "MDDDDDDDM",
        "DDDDPDDDD",
        "MDDDDDDDM",
        "MDDWMWDDM",
        "MMDDDDDMM",
        "MMMMDMMMM"
      ]
    },
    {
      "id": "vault",
      "name": "Ember Vault",
      "level": 4,
      "map": true,
      "size": 9,
      "travelCostCp": 0,
      "description": "An old furnace complex still running on heat, spite, and terrible ventilation.",
      "encounterPool": [
        "ember_hound",
        "cinder_acolyte",
        "slime"
      ],
      "resourcePool": [
        "ore",
        "ember_ore",
        "crystal_shard"
      ],
      "treasureRange": [
        180,
        420
      ],
      "terrainRows": [
        "MMDDDDDMM",
        "MDDPWPDDM",
        "DDDDWDDDD",
        "DPPDDDPPD",
        "DDDDPDDDD",
        "DPPDDDPPD",
        "DDDDWDDDD",
        "MDDPWPDDM",
        "MMDDDDDMM"
      ]
    },
    {
      "id": "mire",
      "name": "Mire of Echoes",
      "level": 5,
      "map": true,
      "size": 9,
      "travelCostCp": 0,
      "description": "Black water, broken roads, and fog that sounds like it is gossiping about you.",
      "encounterPool": [
        "marsh_troll",
        "fen_wraith",
        "wolf"
      ],
      "resourcePool": [
        "herbs",
        "hide",
        "linen_cloth",
        "hardwood"
      ],
      "treasureRange": [
        260,
        560
      ],
      "terrainRows": [
        "WWWFPFWWW",
        "WWPPDPPWW",
        "WPPDDDPPW",
        "FPDDPDDPF",
        "PDDDPDDDP",
        "FPDDPDDPF",
        "WPPDDDPPW",
        "WWPPDPPWW",
        "WWWFPFWWW"
      ]
    },
    {
      "id": "bastion",
      "name": "Stormwatch Bastion",
      "level": 6,
      "map": true,
      "size": 9,
      "travelCostCp": 0,
      "description": "A shattered keep where lightning refuses to leave and the guards somehow still have work ethic.",
      "encounterPool": [
        "storm_drake",
        "obsidian_knight",
        "fen_wraith"
      ],
      "resourcePool": [
        "ore",
        "ember_ore",
        "crystal_shard",
        "hardwood"
      ],
      "treasureRange": [
        360,
        760
      ],
      "terrainRows": [
        "MMMDPDMMM",
        "MDDDPDDDM",
        "MDMPPPMDM",
        "DDPDDDPPD",
        "PDPDPDPDP",
        "DDPDDDPPD",
        "MDMPPPMDM",
        "MDDDPWDDM",
        "MMMDPDMMM"
      ]
    }
  ];

  const DUNGEON_LINKS = [
    {
      "sourceAreaId": "woods",
      "targetAreaId": "ruins",
      "x": 2,
      "y": 3,
      "terrain": "dirt"
    },
    {
      "sourceAreaId": "woods",
      "targetAreaId": "caves",
      "x": 9,
      "y": 1,
      "terrain": "dirt"
    },
    {
      "sourceAreaId": "woods",
      "targetAreaId": "vault",
      "x": 16,
      "y": 8,
      "terrain": "dirt"
    },
    {
      "sourceAreaId": "woods",
      "targetAreaId": "mire",
      "x": 9,
      "y": 16,
      "terrain": "plains"
    },
    {
      "sourceAreaId": "woods",
      "targetAreaId": "bastion",
      "x": 1,
      "y": 9,
      "terrain": "dirt"
    }
  ];

  Object.assign(store, {
    AREAS,
    DUNGEON_LINKS,
  });
})();
