// Quest definitions
(() => {
  const store = window.PF_DATA;

  const QUESTS = [
    {
      "id": "wolf_problem",
      "name": "Wolf Problem",
      "giverNpcId": "elder_rowan",
      "turnInNpcId": "elder_rowan",
      "areaId": "town",
      "summary": "Cull a few wolves before the trade road turns into a chew toy.",
      "description": "Rowan wants the nearby woods less bitey before the next merchant cart rolls through. Hunt a few wolves, then report back.",
      "objectives": [
        {
          "type": "kill",
          "monsterId": "wolf",
          "count": 2,
          "description": "Take down 2 wolves in the Whispering Woods."
        }
      ],
      "rewards": {
        "goldCp": 180,
        "items": [
          {
            "itemId": "potion_healing",
            "qty": 1
          }
        ],
        "unlockQuests": [
          "northern_watch"
        ]
      }
    },
    {
      "id": "clinic_stock",
      "name": "Clinic Stock",
      "giverNpcId": "healer_mira",
      "turnInNpcId": "healer_mira",
      "areaId": "town",
      "summary": "Restock Mira's clinic before the shelves become decorative.",
      "description": "Mira needs fresh medicinal herbs for basic remedies. Bring back enough usable plants so she can stop rationing everything.",
      "objectives": [
        {
          "type": "obtain_item",
          "itemId": "herbs",
          "count": 3,
          "consumeOnTurnIn": true,
          "description": "Bring 3 Wild Herbs back to Healer Mira."
        }
      ],
      "rewards": {
        "goldCp": 140,
        "items": [
          {
            "itemId": "potion_healing",
            "qty": 1
          }
        ],
        "title": "Friend of the Clinic"
      }
    },
    {
      "id": "proper_introduction",
      "name": "Proper Introduction",
      "giverNpcId": "elder_rowan",
      "turnInNpcId": "elder_rowan",
      "areaId": "town",
      "summary": "Go meet Torren so the forge knows you are a person and not just a rumor.",
      "description": "Rowan wants you introduced at the forge before real work starts piling up. Speak with Blacksmith Torren, then let Rowan know the errand is done.",
      "objectives": [
        {
          "type": "talk",
          "npcId": "blacksmith_torren",
          "description": "Go say hello to Blacksmith Torren at the Ember Anvil Forge."
        }
      ],
      "rewards": {
        "goldCp": 90,
        "unlockQuests": [
          "forge_supplies"
        ]
      }
    },
    {
      "id": "northern_watch",
      "name": "Northern Watch",
      "giverNpcId": "scout_tamsin",
      "turnInNpcId": "scout_tamsin",
      "areaId": "town",
      "summary": "Check the northern cave route and come back with an answer, not a guess.",
      "description": "Tamsin wants proof that the Crystal Caves approach is still reachable. Visit the cave entrance in the Whispering Woods, then report to the watchpost.",
      "availability": {
        "questUnlocksAllOf": [
          "northern_watch"
        ]
      },
      "objectives": [
        {
          "type": "visit_tile",
          "areaId": "woods",
          "x": 9,
          "y": 1,
          "description": "Reach the Crystal Caves entrance in the Whispering Woods."
        }
      ],
      "rewards": {
        "goldCp": 220,
        "title": "Northwatch Scout"
      }
    },
    {
      "id": "forge_supplies",
      "name": "Forge Supplies",
      "giverNpcId": "blacksmith_torren",
      "turnInNpcId": "blacksmith_torren",
      "areaId": "town",
      "summary": "Bring Torren ore and warn Mira about the clinic's incoming tool repairs.",
      "description": "Torren needs fresh ore for replacement fittings and wants the clinic given a heads-up about their repair work. Handle both errands, then head back to the forge.",
      "availability": {
        "questUnlocksAllOf": [
          "forge_supplies"
        ]
      },
      "objectives": [
        {
          "type": "obtain_item",
          "itemId": "ore",
          "count": 2,
          "consumeOnTurnIn": true,
          "description": "Bring 2 Iron Ore back to Torren."
        },
        {
          "type": "talk",
          "npcId": "healer_mira",
          "description": "Let Healer Mira know Torren is handling the clinic repairs."
        }
      ],
      "rewards": {
        "goldCp": 160,
        "items": [
          {
            "itemId": "backpack",
            "qty": 1
          }
        ]
      }
    }
  ];

  Object.assign(store, {
    QUESTS,
  });
})();
