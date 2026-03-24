// Crafting recipes
(() => {
  const store = window.PF_DATA;

  const CRAFTING_RECIPES = [
    {
      "id": "craft_potion_healing",
      "group": "consumables",
      "name": "Potion of Healing",
      "resultItemId": "potion_healing",
      "resultQty": 1,
      "description": "Restores 2d4+2 HP. Tastes like bad decisions and survival.",
      "dc": 12,
      "ingredients": [
        {
          "itemId": "herbs",
          "qty": 3
        }
      ]
    },
    {
      "id": "craft_greater_potion_healing",
      "group": "consumables",
      "name": "Greater Potion of Healing",
      "resultItemId": "greater_potion_healing",
      "resultQty": 1,
      "description": "Restores 4d4+4 HP. Worse ideas, bigger glug.",
      "dc": 13,
      "ingredients": [
        {
          "itemId": "herbs",
          "qty": 5
        },
        {
          "itemId": "crystal_shard",
          "qty": 1
        }
      ]
    },
    {
      "id": "craft_stamina_tonic",
      "group": "consumables",
      "name": "Stamina Tonic",
      "resultItemId": "stamina_tonic",
      "resultQty": 1,
      "description": "Restores 2d4+2 SP. Like coffee but more bitter.",
      "dc": 12,
      "ingredients": [
        {
          "itemId": "herbs",
          "qty": 2
        },
        {
          "itemId": "crystal_shard",
          "qty": 1
        }
      ]
    },
    {
      "id": "craft_greater_stamina_tonic",
      "group": "consumables",
      "name": "Greater Stamina Tonic",
      "resultItemId": "greater_stamina_tonic",
      "resultQty": 1,
      "description": "Restores 4d4+4 SP. Even more caffeine.",
      "dc": 13,
      "ingredients": [
        {
          "itemId": "herbs",
          "qty": 3
        },
        {
          "itemId": "crystal_shard",
          "qty": 1
        }
      ]
    },
    {
      "id": "craft_rapier",
      "group": "gear",
      "name": "Rapier",
      "resultItemId": "rapier",
      "resultQty": 1,
      "description": "A fast, fancy blade for people who like punctuation marks in sword form.",
      "dc": 15,
      "ingredients": [
        {
          "itemId": "ore",
          "qty": 3
        },
        {
          "itemId": "hardwood",
          "qty": 1
        }
      ]
    },
    {
      "id": "craft_halberd",
      "group": "gear",
      "name": "Halberd",
      "resultItemId": "halberd",
      "resultQty": 1,
      "description": "A polearm for keeping problems at polite spear-length.",
      "dc": 16,
      "ingredients": [
        {
          "itemId": "ore",
          "qty": 5
        },
        {
          "itemId": "hardwood",
          "qty": 2
        },
        {
          "itemId": "linen_cloth",
          "qty": 1
        }
      ]
    },
    {
      "id": "craft_greatsword",
      "group": "gear",
      "name": "Greatsword",
      "resultItemId": "greatsword",
      "resultQty": 1,
      "description": "A huge two-hander for settling arguments in one swing.",
      "dc": 16,
      "ingredients": [
        {
          "itemId": "ore",
          "qty": 6
        },
        {
          "itemId": "hardwood",
          "qty": 1
        }
      ]
    },
    {
      "id": "craft_longbow",
      "group": "gear",
      "name": "Longbow",
      "resultItemId": "longbow",
      "resultQty": 1,
      "description": "A bow for when \"over there\" still is not far enough away.",
      "dc": 17,
      "ingredients": [
        {
          "itemId": "hardwood",
          "qty": 4
        },
        {
          "itemId": "linen_cloth",
          "qty": 2
        },
        {
          "itemId": "hide",
          "qty": 2
        }
      ]
    },
    {
      "id": "craft_steel_shield",
      "group": "gear",
      "name": "Steel Shield",
      "resultItemId": "steel_shield",
      "resultQty": 1,
      "description": "A sturdier board for people tired of pretending wood is enough.",
      "dc": 15,
      "ingredients": [
        {
          "itemId": "ore",
          "qty": 3
        },
        {
          "itemId": "hardwood",
          "qty": 1
        },
        {
          "itemId": "linen_cloth",
          "qty": 1
        }
      ]
    },
    {
      "id": "craft_breastplate",
      "group": "gear",
      "name": "Breastplate",
      "resultItemId": "breastplate",
      "resultQty": 1,
      "description": "Solid protection that still lets you bend at the important times.",
      "dc": 18,
      "ingredients": [
        {
          "itemId": "ore",
          "qty": 6
        },
        {
          "itemId": "linen_cloth",
          "qty": 2
        },
        {
          "itemId": "hide",
          "qty": 2
        }
      ]
    },
    {
      "id": "craft_half_plate",
      "group": "gear",
      "name": "Half Plate",
      "resultItemId": "half_plate",
      "resultQty": 1,
      "description": "Heavy, loud, and reassuring in a very metal way.",
      "dc": 19,
      "ingredients": [
        {
          "itemId": "ore",
          "qty": 8
        },
        {
          "itemId": "linen_cloth",
          "qty": 2
        },
        {
          "itemId": "hide",
          "qty": 2
        }
      ]
    },
    {
      "id": "craft_full_plate",
      "group": "gear",
      "name": "Full Plate",
      "resultItemId": "full_plate",
      "resultQty": 1,
      "description": "Maximum clank. Also excellent protection.",
      "dc": 21,
      "ingredients": [
        {
          "itemId": "ore",
          "qty": 10
        },
        {
          "itemId": "ember_ore",
          "qty": 2
        },
        {
          "itemId": "linen_cloth",
          "qty": 3
        },
        {
          "itemId": "hide",
          "qty": 2
        }
      ]
    },
    {
      "id": "craft_weapon_plus1",
      "group": "upgrades",
      "name": "+1 Weapon",
      "description": "Make a weapon hit a little harder and feel smug about it.",
      "dc": 18,
      "upgradeKind": "weapon",
      "ingredients": [
        {
          "itemId": "ore",
          "qty": 4
        },
        {
          "itemId": "crystal_shard",
          "qty": 2
        },
        {
          "itemId": "ember_ore",
          "qty": 1
        }
      ]
    },
    {
      "id": "craft_armor_plus1",
      "group": "upgrades",
      "name": "+1 Armor",
      "description": "Make armor one notch better at saying \"absolutely not.\"",
      "dc": 21,
      "upgradeKind": "armor",
      "ingredients": [
        {
          "itemId": "ore",
          "qty": 5
        },
        {
          "itemId": "crystal_shard",
          "qty": 2
        },
        {
          "itemId": "ember_ore",
          "qty": 1
        },
        {
          "itemId": "linen_cloth",
          "qty": 2
        }
      ]
    }
  ];

  Object.assign(store, {
    CRAFTING_RECIPES,
  });
})();
