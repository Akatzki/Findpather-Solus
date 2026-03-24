// Items, gear, and resources
(() => {
  const store = window.PF_DATA;

  const WEAPONS = [
    {
      "id": "club",
      "name": "Club",
      "type": "weapon",
      "category": "simple",
      "Weapon type": "melee",
      "Damage": "1d6",
      "Damage type": "bludgeoning",
      "cost": 10,
      "properties": [
        "agile"
      ],
      "buyable": true,
      "weaponTypes": [
        "club"
      ]
    },
    {
      "id": "handaxe",
      "name": "Handaxe",
      "type": "weapon",
      "category": "simple",
      "Weapon type": "melee",
      "Damage": "1d4",
      "Damage type": "slashing",
      "cost": 120,
      "properties": [
        "agile"
      ],
      "buyable": true,
      "weaponTypes": [
        "axe"
      ]
    },
    {
      "id": "dagger",
      "name": "Dagger",
      "type": "weapon",
      "category": "simple",
      "Weapon type": "melee",
      "Damage": "1d4",
      "Damage type": "piercing",
      "cost": 200,
      "properties": [
        "agile",
        "finesse",
        "reach"
      ],
      "buyable": true,
      "weaponTypes": [
        "dagger"
      ]
    },
    {
      "id": "shortsword",
      "name": "Shortsword",
      "type": "weapon",
      "category": "martial",
      "Weapon type": "melee",
      "Damage": "1d6",
      "Damage type": "piercing",
      "cost": 1000,
      "properties": [
        "agile",
        "finesse"
      ],
      "buyable": true,
      "weaponTypes": [
        "sword"
      ]
    },
    {
      "id": "longsword",
      "name": "Longsword",
      "type": "weapon",
      "category": "martial",
      "Weapon type": "melee",
      "Damage": "1d8",
      "Damage type": "slashing",
      "cost": 1500,
      "properties": [
        "versatile:P"
      ],
      "buyable": true,
      "weaponTypes": [
        "sword"
      ]
    },
    {
      "id": "battleaxe",
      "name": "Battleaxe",
      "type": "weapon",
      "category": "martial",
      "Weapon type": "melee",
      "Damage": "1d8",
      "Damage type": "slashing",
      "cost": 1600,
      "properties": [],
      "buyable": true,
      "weaponTypes": [
        "axe"
      ]
    },
    {
      "id": "greataxe",
      "name": "Greataxe",
      "type": "weapon",
      "category": "martial",
      "Weapon type": "melee",
      "Damage": "1d12",
      "Damage type": "slashing",
      "cost": 2000,
      "properties": [
        "two-hand"
      ],
      "buyable": true,
      "weaponTypes": [
        "axe"
      ]
    },
    {
      "id": "greatclub",
      "name": "Greatclub",
      "type": "weapon",
      "category": "martial",
      "Weapon type": "melee",
      "Damage": "1d12",
      "Damage type": "bludgeoning",
      "cost": 1800,
      "properties": [
        "two-hand"
      ],
      "buyable": true,
      "weaponTypes": [
        "mace"
      ]
    },
    {
      "id": "spear",
      "name": "Spear",
      "type": "weapon",
      "category": "simple",
      "Weapon type": "melee",
      "Damage": "1d6",
      "Damage type": "piercing",
      "cost": 100,
      "properties": [
        "reach",
        "versatile:S",
        "polearm"
      ],
      "buyable": true,
      "weaponTypes": [
        "spear",
        "polearm"
      ]
    },
    {
      "id": "shortbow",
      "name": "Shortbow",
      "type": "weapon",
      "category": "martial",
      "Weapon type": "ranged",
      "Damage": "1d6",
      "Damage type": "piercing",
      "cost": 3000,
      "ammoItemId": "arrows",
      "properties": [
        "range:60",
        "two-hand",
        "ammo-arrow"
      ],
      "buyable": true,
      "weaponTypes": [
        "bow"
      ]
    },
    {
      "id": "quarterstaff",
      "name": "Quarterstaff",
      "type": "weapon",
      "category": "simple",
      "Weapon type": "melee",
      "Damage": "1d6",
      "Damage type": "bludgeoning",
      "cost": 20,
      "properties": [
        "two-hand",
        "versatile:P"
      ],
      "buyable": true,
      "weaponTypes": [
        "staff"
      ]
    },
    {
      "id": "mace",
      "name": "Mace",
      "type": "weapon",
      "category": "simple",
      "Weapon type": "melee",
      "Damage": "1d6",
      "Damage type": "bludgeoning",
      "cost": 80,
      "properties": [],
      "buyable": true,
      "weaponTypes": [
        "mace"
      ]
    },
    {
      "id": "rapier",
      "name": "Rapier",
      "type": "weapon",
      "category": "martial",
      "Weapon type": "melee",
      "Damage": "1d6",
      "Damage type": "piercing",
      "cost": 2500,
      "sellValue": 280,
      "buyable": false,
      "properties": [
        "agile",
        "finesse"
      ],
      "weaponTypes": [
        "sword"
      ]
    },
    {
      "id": "halberd",
      "name": "Halberd",
      "type": "weapon",
      "category": "martial",
      "Weapon type": "melee",
      "Damage": "1d10",
      "Damage type": "slashing",
      "cost": 3500,
      "sellValue": 450,
      "buyable": false,
      "properties": [
        "reach",
        "two-hand",
        "versatile:P",
        "polearm"
      ],
      "weaponTypes": [
        "polearm"
      ]
    },
    {
      "id": "greatsword",
      "name": "Greatsword",
      "type": "weapon",
      "category": "martial",
      "Weapon type": "melee",
      "Damage": "1d12",
      "Damage type": "slashing",
      "cost": 4000,
      "sellValue": 420,
      "buyable": false,
      "properties": [
        "two-hand"
      ],
      "weaponTypes": [
        "sword"
      ]
    },
    {
      "id": "longbow",
      "name": "Longbow",
      "type": "weapon",
      "category": "martial",
      "Weapon type": "ranged",
      "Damage": "1d8",
      "Damage type": "piercing",
      "cost": 4500,
      "sellValue": 460,
      "ammoItemId": "arrows",
      "buyable": false,
      "properties": [
        "range:100",
        "two-hand",
        "ammo-arrow"
      ],
      "weaponTypes": [
        "bow"
      ]
    },
    {
      "id": "club_plus1",
      "name": "Club +1",
      "type": "weapon",
      "category": "simple",
      "Weapon type": "melee",
      "Damage": "1d6",
      "Damage type": "bludgeoning",
      "cost": 3510,
      "properties": [
        "agile"
      ],
      "buyable": false,
      "sellable": false,
      "plusOne": true,
      "upgradedFrom": "club",
      "attackBonusItem": 1,
      "weaponTypes": [
        "club"
      ]
    },
    {
      "id": "handaxe_plus1",
      "name": "Handaxe +1",
      "type": "weapon",
      "category": "simple",
      "Weapon type": "melee",
      "Damage": "1d4",
      "Damage type": "slashing",
      "cost": 3620,
      "properties": [
        "agile"
      ],
      "buyable": false,
      "sellable": false,
      "plusOne": true,
      "upgradedFrom": "handaxe",
      "attackBonusItem": 1,
      "weaponTypes": [
        "axe"
      ]
    },
    {
      "id": "dagger_plus1",
      "name": "Dagger +1",
      "type": "weapon",
      "category": "simple",
      "Weapon type": "melee",
      "Damage": "1d4",
      "Damage type": "piercing",
      "cost": 3700,
      "properties": [
        "agile",
        "finesse",
        "reach"
      ],
      "buyable": false,
      "sellable": false,
      "plusOne": true,
      "upgradedFrom": "dagger",
      "attackBonusItem": 1,
      "weaponTypes": [
        "dagger"
      ]
    },
    {
      "id": "shortsword_plus1",
      "name": "Shortsword +1",
      "type": "weapon",
      "category": "martial",
      "Weapon type": "melee",
      "Damage": "1d6",
      "Damage type": "piercing",
      "cost": 4500,
      "properties": [
        "agile",
        "finesse"
      ],
      "buyable": false,
      "sellable": false,
      "plusOne": true,
      "upgradedFrom": "shortsword",
      "attackBonusItem": 1,
      "weaponTypes": [
        "sword"
      ]
    },
    {
      "id": "longsword_plus1",
      "name": "Longsword +1",
      "type": "weapon",
      "category": "martial",
      "Weapon type": "melee",
      "Damage": "1d8",
      "Damage type": "slashing",
      "cost": 5000,
      "properties": [
        "versatile:P"
      ],
      "buyable": false,
      "sellable": false,
      "plusOne": true,
      "upgradedFrom": "longsword",
      "attackBonusItem": 1,
      "weaponTypes": [
        "sword"
      ]
    },
    {
      "id": "battleaxe_plus1",
      "name": "Battleaxe +1",
      "type": "weapon",
      "category": "martial",
      "Weapon type": "melee",
      "Damage": "1d8",
      "Damage type": "slashing",
      "cost": 5100,
      "properties": [],
      "buyable": false,
      "sellable": false,
      "plusOne": true,
      "upgradedFrom": "battleaxe",
      "attackBonusItem": 1,
      "weaponTypes": [
        "axe"
      ]
    },
    {
      "id": "greataxe_plus1",
      "name": "Greataxe +1",
      "type": "weapon",
      "category": "martial",
      "Weapon type": "melee",
      "Damage": "1d12",
      "Damage type": "slashing",
      "cost": 5500,
      "properties": [
        "two-hand"
      ],
      "buyable": false,
      "sellable": false,
      "plusOne": true,
      "upgradedFrom": "greataxe",
      "attackBonusItem": 1,
      "weaponTypes": [
        "axe"
      ]
    },
    {
      "id": "greatclub_plus1",
      "name": "Greatclub +1",
      "type": "weapon",
      "category": "martial",
      "Weapon type": "melee",
      "Damage": "1d12",
      "Damage type": "bludgeoning",
      "cost": 5300,
      "properties": [
        "two-hand"
      ],
      "buyable": false,
      "sellable": false,
      "plusOne": true,
      "upgradedFrom": "greatclub",
      "attackBonusItem": 1,
      "weaponTypes": [
        "mace"
      ]
    },
    {
      "id": "spear_plus1",
      "name": "Spear +1",
      "type": "weapon",
      "category": "simple",
      "Weapon type": "melee",
      "Damage": "1d6",
      "Damage type": "piercing",
      "cost": 3600,
      "properties": [
        "reach",
        "versatile:S",
        "polearm"
      ],
      "buyable": false,
      "sellable": false,
      "plusOne": true,
      "upgradedFrom": "spear",
      "attackBonusItem": 1,
      "weaponTypes": [
        "spear",
        "polearm"
      ]
    },
    {
      "id": "shortbow_plus1",
      "name": "Shortbow +1",
      "type": "weapon",
      "category": "martial",
      "Weapon type": "ranged",
      "Damage": "1d6",
      "Damage type": "piercing",
      "cost": 6500,
      "ammoItemId": "arrows",
      "properties": [
        "range:60",
        "two-hand",
        "ammo-arrow"
      ],
      "buyable": false,
      "sellable": false,
      "plusOne": true,
      "upgradedFrom": "shortbow",
      "attackBonusItem": 1,
      "weaponTypes": [
        "bow"
      ]
    },
    {
      "id": "quarterstaff_plus1",
      "name": "Quarterstaff +1",
      "type": "weapon",
      "category": "simple",
      "Weapon type": "melee",
      "Damage": "1d6",
      "Damage type": "bludgeoning",
      "cost": 3520,
      "properties": [
        "two-hand",
        "versatile:P"
      ],
      "buyable": false,
      "sellable": false,
      "plusOne": true,
      "upgradedFrom": "quarterstaff",
      "attackBonusItem": 1,
      "weaponTypes": [
        "staff"
      ]
    },
    {
      "id": "mace_plus1",
      "name": "Mace +1",
      "type": "weapon",
      "category": "simple",
      "Weapon type": "melee",
      "Damage": "1d6",
      "Damage type": "bludgeoning",
      "cost": 3580,
      "properties": [],
      "buyable": false,
      "sellable": false,
      "plusOne": true,
      "upgradedFrom": "mace",
      "attackBonusItem": 1,
      "weaponTypes": [
        "mace"
      ]
    },
    {
      "id": "rapier_plus1",
      "name": "Rapier +1",
      "type": "weapon",
      "category": "martial",
      "Weapon type": "melee",
      "Damage": "1d6",
      "Damage type": "piercing",
      "cost": 6000,
      "sellValue": 280,
      "buyable": false,
      "properties": [
        "agile",
        "finesse"
      ],
      "sellable": false,
      "plusOne": true,
      "upgradedFrom": "rapier",
      "attackBonusItem": 1,
      "weaponTypes": [
        "sword"
      ]
    },
    {
      "id": "halberd_plus1",
      "name": "Halberd +1",
      "type": "weapon",
      "category": "martial",
      "Weapon type": "melee",
      "Damage": "1d10",
      "Damage type": "slashing",
      "cost": 7000,
      "sellValue": 450,
      "buyable": false,
      "properties": [
        "reach",
        "two-hand",
        "versatile:P",
        "polearm"
      ],
      "sellable": false,
      "plusOne": true,
      "upgradedFrom": "halberd",
      "attackBonusItem": 1,
      "weaponTypes": [
        "polearm"
      ]
    },
    {
      "id": "greatsword_plus1",
      "name": "Greatsword +1",
      "type": "weapon",
      "category": "martial",
      "Weapon type": "melee",
      "Damage": "1d12",
      "Damage type": "slashing",
      "cost": 7500,
      "sellValue": 420,
      "buyable": false,
      "properties": [
        "two-hand"
      ],
      "sellable": false,
      "plusOne": true,
      "upgradedFrom": "greatsword",
      "attackBonusItem": 1,
      "weaponTypes": [
        "sword"
      ]
    },
    {
      "id": "longbow_plus1",
      "name": "Longbow +1",
      "type": "weapon",
      "category": "martial",
      "Weapon type": "ranged",
      "Damage": "1d8",
      "Damage type": "piercing",
      "cost": 8100,
      "sellValue": 460,
      "ammoItemId": "arrows",
      "buyable": false,
      "properties": [
        "range:100",
        "two-hand",
        "ammo-arrow"
      ],
      "sellable": false,
      "plusOne": true,
      "upgradedFrom": "longbow",
      "attackBonusItem": 1,
      "weaponTypes": [
        "bow"
      ]
    }
  ];

  const ARMORS = [
    {
      "id": "cloth",
      "name": "Cloth Wraps",
      "type": "armor",
      "category": "unarmored",
      "acBonus": 0,
      "dexCap": 99,
      "cost": 0,
      "buyable": false,
      "properties": [
        "no-armor"
      ]
    },
    {
      "id": "leather",
      "name": "Leather Armor",
      "type": "armor",
      "category": "light",
      "acBonus": 1,
      "dexCap": 4,
      "cost": 2000,
      "buyable": true,
      "properties": []
    },
    {
      "id": "studded",
      "name": "Studded Leather",
      "type": "armor",
      "category": "light",
      "acBonus": 2,
      "dexCap": 3,
      "cost": 4500,
      "buyable": true,
      "properties": []
    },
    {
      "id": "chain",
      "name": "Chain Shirt",
      "type": "armor",
      "category": "medium",
      "acBonus": 3,
      "dexCap": 2,
      "cost": 6500,
      "buyable": true,
      "properties": []
    },
    {
      "id": "scale",
      "name": "Scale Mail",
      "type": "armor",
      "category": "medium",
      "acBonus": 4,
      "dexCap": 1,
      "cost": 9000,
      "buyable": true,
      "properties": [
        "noisy"
      ]
    },
    {
      "id": "breastplate",
      "name": "Breastplate",
      "type": "armor",
      "category": "medium",
      "acBonus": 5,
      "dexCap": 1,
      "cost": 7000,
      "sellValue": 560,
      "buyable": false,
      "properties": []
    },
    {
      "id": "half_plate",
      "name": "Half Plate",
      "type": "armor",
      "category": "heavy",
      "acBonus": 6,
      "dexCap": 0,
      "cost": 9000,
      "sellValue": 680,
      "buyable": false,
      "properties": [
        "noisy"
      ]
    },
    {
      "id": "full_plate",
      "name": "Full Plate",
      "type": "armor",
      "category": "heavy",
      "acBonus": 7,
      "dexCap": 0,
      "cost": 12000,
      "sellValue": 1040,
      "buyable": false,
      "properties": [
        "noisy"
      ]
    },
    {
      "id": "leather_plus1",
      "name": "Leather Armor +1",
      "type": "armor",
      "category": "light",
      "acBonus": 2,
      "dexCap": 4,
      "cost": 5000,
      "buyable": false,
      "properties": [],
      "sellable": false,
      "plusOne": true,
      "upgradedFrom": "leather"
    },
    {
      "id": "studded_plus1",
      "name": "Studded Leather +1",
      "type": "armor",
      "category": "light",
      "acBonus": 3,
      "dexCap": 3,
      "cost": 7650,
      "buyable": false,
      "properties": [],
      "sellable": false,
      "plusOne": true,
      "upgradedFrom": "studded"
    },
    {
      "id": "chain_plus1",
      "name": "Chain Shirt +1",
      "type": "armor",
      "category": "medium",
      "acBonus": 4,
      "dexCap": 2,
      "cost": 11050,
      "buyable": false,
      "properties": [],
      "sellable": false,
      "plusOne": true,
      "upgradedFrom": "chain"
    },
    {
      "id": "scale_plus1",
      "name": "Scale Mail +1",
      "type": "armor",
      "category": "medium",
      "acBonus": 5,
      "dexCap": 1,
      "cost": 15300,
      "buyable": false,
      "properties": [
        "noisy"
      ],
      "sellable": false,
      "plusOne": true,
      "upgradedFrom": "scale"
    },
    {
      "id": "breastplate_plus1",
      "name": "Breastplate +1",
      "type": "armor",
      "category": "medium",
      "acBonus": 6,
      "dexCap": 1,
      "cost": 11900,
      "sellValue": 560,
      "buyable": false,
      "properties": [],
      "sellable": false,
      "plusOne": true,
      "upgradedFrom": "breastplate"
    },
    {
      "id": "half_plate_plus1",
      "name": "Half Plate +1",
      "type": "armor",
      "category": "heavy",
      "acBonus": 7,
      "dexCap": 0,
      "cost": 15300,
      "sellValue": 680,
      "buyable": false,
      "properties": [
        "noisy"
      ],
      "sellable": false,
      "plusOne": true,
      "upgradedFrom": "half_plate"
    },
    {
      "id": "full_plate_plus1",
      "name": "Full Plate +1",
      "type": "armor",
      "category": "heavy",
      "acBonus": 8,
      "dexCap": 0,
      "cost": 20400,
      "sellValue": 1040,
      "buyable": false,
      "properties": [
        "noisy"
      ],
      "sellable": false,
      "plusOne": true,
      "upgradedFrom": "full_plate"
    }
  ];

  const OFFHAND = [
    {
      "id": "shield",
      "name": "Wooden Shield",
      "type": "offhand",
      "category": "shield",
      "acBonus": 1,
      "cost": 1000,
      "buyable": true,
      "properties": [
        "shield"
      ]
    },
    {
      "id": "steel_shield",
      "name": "Steel Shield",
      "type": "offhand",
      "category": "shield",
      "acBonus": 2,
      "cost": 2500,
      "sellValue": 260,
      "buyable": false,
      "properties": [
        "shield"
      ]
    }
  ];

  const ACCESSORIES = [
    {
      "id": "sack",
      "name": "Fanny Pack",
      "type": "accessory",
      "category": "utility",
      "cost": 150,
      "buyable": true,
      "carryBonus": 5,
      "properties": [
        "carry"
      ]
    },
    {
      "id": "backpack",
      "name": "Backpack",
      "type": "accessory",
      "category": "utility",
      "cost": 350,
      "buyable": true,
      "carryBonus": 10,
      "properties": [
        "carry"
      ]
    }
  ];

  const CONSUMABLE_DEFINITIONS = [
    {
      "id": "potion_healing",
      "name": "Potion of Healing",
      "type": "consumable",
      "category": "potion",
      "cost": 500,
      "sellValue": 150,
      "buyable": true,
      "effect": {
        "kind": "restore_hp",
        "amount": "2d4+2",
        "logLabel": "a Potion of Healing"
      }
    },
    {
      "id": "greater_potion_healing",
      "name": "Greater Potion of Healing",
      "type": "consumable",
      "category": "potion",
      "cost": 1200,
      "sellValue": 360,
      "buyable": false,
      "effect": {
        "kind": "restore_hp",
        "amount": "4d4+4",
        "logLabel": "a Greater Potion of Healing"
      }
    },
    {
      "id": "stamina_tonic",
      "name": "Stamina Tonic",
      "type": "consumable",
      "category": "tonic",
      "cost": 350,
      "sellValue": 100,
      "buyable": false,
      "effect": {
        "kind": "restore_sp",
        "amount": "2d4+2",
        "logLabel": "a Stamina Tonic"
      }
    },
    {
      "id": "greater_stamina_tonic",
      "name": "Greater Stamina Tonic",
      "type": "consumable",
      "category": "tonic",
      "cost": 700,
      "sellValue": 200,
      "buyable": false,
      "effect": {
        "kind": "restore_sp",
        "amount": "4d4+4",
        "logLabel": "a Greater Stamina Tonic"
      }
    }
  ];

  const AMMO = [
    {
      "id": "arrows",
      "name": "Arrows",
      "type": "ammo",
      "category": "ammunition",
      "ammoKey": "arrow",
      "cost": 1,
      "purchaseQty": 10,
      "purchasePrice": 10,
      "buyable": true,
      "sellable": false,
      "properties": [
        "bundle:10"
      ]
    }
  ];

  const RESOURCES = [
    {
      "id": "herbs",
      "name": "Wild Herbs",
      "type": "resource",
      "gatherSkill": "Survival",
      "sellValue": 35,
      "stackable": true
    },
    {
      "id": "ore",
      "name": "Iron Ore",
      "type": "resource",
      "gatherSkill": "Crafting",
      "sellValue": 60,
      "stackable": true
    },
    {
      "id": "hide",
      "name": "Beast Hide",
      "type": "resource",
      "gatherSkill": "Survival",
      "sellValue": 45,
      "stackable": true
    },
    {
      "id": "hardwood",
      "name": "Hardwood",
      "type": "resource",
      "gatherSkill": "Survival",
      "sellValue": 80,
      "stackable": true
    },
    {
      "id": "linen_cloth",
      "name": "Linen Cloth",
      "type": "resource",
      "gatherSkill": "Survival",
      "sellValue": 70,
      "stackable": true
    },
    {
      "id": "crystal_shard",
      "name": "Crystal Shard",
      "type": "resource",
      "gatherSkill": "Crafting",
      "sellValue": 120,
      "stackable": true
    },
    {
      "id": "ember_ore",
      "name": "Ember Ore",
      "type": "resource",
      "gatherSkill": "Crafting",
      "sellValue": 150,
      "stackable": true
    }
  ];

  Object.assign(store, {
    WEAPONS,
    ARMORS,
    OFFHAND,
    ACCESSORIES,
    CONSUMABLE_DEFINITIONS,
    AMMO,
    RESOURCES,
  });
})();
