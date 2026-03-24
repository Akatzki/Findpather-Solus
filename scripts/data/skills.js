// Skills and stat caps
(() => {
  const store = window.PF_DATA;

  const SKILLS = [
    {
      "id": "Acrobatics",
      "stat": "DEX"
    },
    {
      "id": "Athletics",
      "stat": "STR"
    },
    {
      "id": "Crafting",
      "stat": "INT"
    },
    {
      "id": "Perception",
      "stat": "WIS"
    },
    {
      "id": "Social",
      "stat": "CHA"
    },
    {
      "id": "Stealth",
      "stat": "DEX"
    },
    {
      "id": "Survival",
      "stat": "WIS"
    }
  ];

  const STAT_LEVEL_UP_CAP = 20;

  const SKILL_ABILITY_TIERS = {};

  Object.assign(store, {
    SKILLS,
    STAT_LEVEL_UP_CAP,
    SKILL_ABILITY_TIERS,
  });
})();
