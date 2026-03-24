// NPC definitions
(() => {
  const store = window.PF_DATA;

  const NPCS = [
    {
      "id": "elder_rowan",
      "name": "Elder Rowan",
      "emoji": "🧓",
      "areaId": "town",
      "residence": "Astaria Hall",
      "role": "Town Elder",
      "description": "Keeps Astaria's workers, merchants, and watch working together.",
      "greeting": "Astaria does not run on wishes. Want coin? Great, I have chores with monsters attached.",
      "tooltip": "Rowan hands out practical jobs and somehow knows what the whole town is short on."
    },
    {
      "id": "healer_mira",
      "name": "Healer Mira",
      "emoji": "🌿",
      "areaId": "town",
      "residence": "North Lantern Clinic",
      "role": "Village Healer",
      "description": "Mixes remedies, patches people up, and lives herb shortage to herb shortage.",
      "greeting": "Bring me some useful plants and preferably fewer wounds next time.",
      "tooltip": "Mira handles medicine, poultices, and a small garden she guards with her life."
    },
    {
      "id": "scout_tamsin",
      "name": "Scout Tamsin",
      "emoji": "🏹",
      "areaId": "town",
      "residence": "East Gate Watchpost",
      "role": "Town Scout",
      "description": "Knows the woods, the roads, and exactly how fast trouble can travel.",
      "greeting": "The map likes to lie. Bring back good information and we can stay ahead of it.",
      "tooltip": "Tamsin issues scouting work and prefers reports with facts instead of optimism."
    },
    {
      "id": "blacksmith_torren",
      "name": "Blacksmith Torren",
      "emoji": "⚒️",
      "areaId": "town",
      "residence": "Ember Anvil Forge",
      "role": "Blacksmith",
      "description": "Keeps weapons sharp, armor shiny, and conversation gruff.",
      "greeting": "If yer here for forge work, be useful first and dramatic later.",
      "tooltip": "Torren maintains Astaria's gear and speaks fluent grumble."
    },
    {
      "id": "training_master",
      "name": "Trainer Serah",
      "emoji": "🎓",
      "areaId": "town",
      "residence": "South Yard Training Hall",
      "role": "Training Master",
      "description": "Runs Astaria's training yard, drills fundamentals, and handles full retraining for adventurers who want to rebuild their approach.",
      "greeting": "If you want to relearn everything from scratch, you came to the right place.",
      "tooltip": "Serah offers feat and skill retraining services from the training hall."
    }
  ];

  Object.assign(store, {
    NPCS,
  });
})();
