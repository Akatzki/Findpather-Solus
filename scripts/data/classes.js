// Races and classes
(() => {
  const store = window.PF_DATA;

  const RACES = [
    {
      "id": "human",
      "name": "Human",
      "description": "Adaptable, ambitious, and currently the only playable option in this prototype."
    }
  ];

  const CLASSES = {
    "Fighter": {
      "id": "Fighter",
      "keyAbilities": [
        "STR",
        "DEX"
      ],
      "requirements": {
        "STR": 13
      },
      "hpPerLevel": 10,
      "spPerLevel": 6,
      "proficiencies": {
        "saves": {
          "fort": 2,
          "reflex": 2,
          "will": 1
        },
        "weapons": {
          "simple": true,
          "martial": true,
          "advanced": false,
          "unarmed": true
        },
        "armor": {
          "unarmored": true,
          "light": true,
          "medium": true,
          "heavy": true,
          "shields": true
        }
      },
      "startingTrainedSkill": "Athletics",
      "baseSkillPoints": 3
    },
    "Barbarian": {
      "id": "Barbarian",
      "keyAbilities": [
        "STR"
      ],
      "requirements": {
        "STR": 13,
        "CON": 13
      },
      "hpPerLevel": 12,
      "spPerLevel": 7,
      "proficiencies": {
        "saves": {
          "fort": 2,
          "reflex": 1,
          "will": 2
        },
        "weapons": {
          "simple": true,
          "martial": true,
          "advanced": false,
          "unarmed": true
        },
        "armor": {
          "unarmored": true,
          "light": true,
          "medium": true,
          "heavy": false,
          "shields": true
        }
      },
      "startingTrainedSkill": "Athletics",
      "baseSkillPoints": 3
    },
    "Monk": {
      "id": "Monk",
      "keyAbilities": [
        "STR",
        "DEX"
      ],
      "requirements": {
        "DEX": 13,
        "WIS": 13
      },
      "hpPerLevel": 10,
      "spPerLevel": 7,
      "proficiencies": {
        "saves": {
          "fort": 2,
          "reflex": 2,
          "will": 2
        },
        "weapons": {
          "simple": true,
          "martial": false,
          "advanced": false,
          "unarmed": true
        },
        "armor": {
          "unarmored": true,
          "light": false,
          "medium": false,
          "heavy": false,
          "shields": false
        }
      },
      "startingTrainedSkill": "Acrobatics",
      "baseSkillPoints": 4
    },
    "Ranger": {
      "id": "Ranger",
      "keyAbilities": [
        "STR",
        "DEX"
      ],
      "requirements": {
        "DEX": 13,
        "WIS": 13
      },
      "hpPerLevel": 10,
      "spPerLevel": 6,
      "proficiencies": {
        "saves": {
          "fort": 2,
          "reflex": 2,
          "will": 1
        },
        "weapons": {
          "simple": true,
          "martial": true,
          "advanced": false,
          "unarmed": true
        },
        "armor": {
          "unarmored": true,
          "light": true,
          "medium": true,
          "heavy": false,
          "shields": true
        }
      },
      "startingTrainedSkill": "Survival",
      "baseSkillPoints": 3
    },
    "Rogue": {
      "id": "Rogue",
      "keyAbilities": [
        "DEX"
      ],
      "requirements": {
        "DEX": 13
      },
      "hpPerLevel": 8,
      "spPerLevel": 6,
      "proficiencies": {
        "saves": {
          "fort": 1,
          "reflex": 2,
          "will": 2
        },
        "weapons": {
          "simple": true,
          "martial": true,
          "advanced": false,
          "unarmed": true
        },
        "armor": {
          "unarmored": true,
          "light": true,
          "medium": false,
          "heavy": false,
          "shields": false
        }
      },
      "startingTrainedSkill": "Stealth",
      "baseSkillPoints": 4
    }
  };

  Object.assign(store, {
    RACES,
    CLASSES,
  });
})();
