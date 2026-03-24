// Random events
(() => {
  const store = window.PF_DATA;

  const RANDOM_EVENT_TEMPLATES = [
    {
      "id": "scattered_pack",
      "title": "Scattered Pack",
      "description": "A torn traveler pack is half-swallowed by brush. There might still be something useful in the mess, if the woods have not already claimed it.",
      "skill": "Perception",
      "dcBase": 11,
      "dcPerAreaLevel": 2,
      "successText": "You find the one pouch that has not been turned into compost yet.",
      "rewardHint": "some coin and lightly chewed supplies",
      "rewardCoins": [
        40,
        120
      ],
      "rewardItems": [
        {
          "id": "herbs",
          "qty": [
            1,
            2
          ],
          "chance": 0.7
        }
      ],
      "failureText": "You grab blindly and mostly discover that brambles have opinions.",
      "failDamage": "1d4",
      "failDamageType": "piercing"
    },
    {
      "id": "cracked_footbridge",
      "title": "Cracked Footbridge",
      "description": "A narrow bridge wobbles over a slick drop, with a weathered satchel hanging from the far rail like a dare.",
      "skill": "Acrobatics",
      "dcBase": 12,
      "dcPerAreaLevel": 2,
      "successText": "You cross cleanly, snag the satchel, and avoid becoming a cautionary tale.",
      "rewardHint": "coin and salvaged trade goods",
      "rewardCoins": [
        55,
        135
      ],
      "rewardItems": [
        {
          "id": "hide",
          "qty": [
            1,
            1
          ],
          "chance": 0.45
        }
      ],
      "failureText": "The planks give up before you do, and the bridge frame wins the argument.",
      "failDamage": "1d4+1",
      "failDamageType": "bludgeoning"
    },
    {
      "id": "toppled_waystone",
      "title": "Toppled Waystone",
      "description": "A carved waystone has face-planted into the mud, pinning a lockbox underneath like a very rude paperweight.",
      "skill": "Athletics",
      "dcBase": 11,
      "dcPerAreaLevel": 2,
      "successText": "You shift the stone just enough to yank the box free.",
      "rewardHint": "coin and a chunk of raw ore",
      "rewardCoins": [
        45,
        125
      ],
      "rewardItems": [
        {
          "id": "ore",
          "qty": [
            1,
            2
          ],
          "chance": 0.55
        }
      ],
      "failureText": "The stone lurches the wrong way and reminds you it is, in fact, a stone.",
      "failDamage": "1d4",
      "failDamageType": "bludgeoning"
    },
    {
      "id": "jammed_cache",
      "title": "Jammed Cache",
      "description": "An old field cache sits there with swollen hinges and a lid that refuses to cooperate on principle.",
      "skill": "Crafting",
      "dcBase": 12,
      "dcPerAreaLevel": 2,
      "successText": "You coax it open without turning the supplies inside into scrap.",
      "rewardHint": "coin and a few preserved odds and ends",
      "rewardCoins": [
        50,
        130
      ],
      "rewardItems": [
        {
          "id": "ore",
          "qty": [
            1,
            1
          ],
          "chance": 0.4
        },
        {
          "id": "potion_healing",
          "qty": [
            1,
            1
          ],
          "chance": 0.2
        }
      ],
      "failureText": "The latch snaps, and the cache expresses its feelings in shrapnel.",
      "failDamage": "1d4",
      "failDamageType": "piercing"
    },
    {
      "id": "skittish_mule",
      "title": "Skittish Mule",
      "description": "A pack mule has tied itself into a panic knot beside a spill of trade goods.",
      "skill": "Social",
      "dcBase": 11,
      "dcPerAreaLevel": 2,
      "successText": "You calm the mule, sort out the reins, and rescue the cargo before it walks off.",
      "rewardHint": "coin and a grateful little bonus",
      "rewardCoins": [
        60,
        140
      ],
      "rewardItems": [
        {
          "id": "potion_healing",
          "qty": [
            1,
            1
          ],
          "chance": 0.25
        },
        {
          "id": "herbs",
          "qty": [
            1,
            2
          ],
          "chance": 0.5
        }
      ],
      "failureText": "The mule votes against your plan with both back legs, then leaves.",
      "failDamage": "1d4",
      "failDamageType": "bludgeoning"
    },
    {
      "id": "tripwire_stash",
      "title": "Tripwire Stash",
      "description": "A thin wire glints between two trees. Someone hid a stash here and clearly did not believe in trust.",
      "skill": "Stealth",
      "dcBase": 12,
      "dcPerAreaLevel": 2,
      "successText": "You slip past the trap and lift the stash like you were invited.",
      "rewardHint": "coin and discreet scavenged materials",
      "rewardCoins": [
        45,
        120
      ],
      "rewardItems": [
        {
          "id": "hide",
          "qty": [
            1,
            2
          ],
          "chance": 0.45
        }
      ],
      "failureText": "The wire snaps tight and the woods immediately file a complaint into your skin.",
      "failDamage": "1d4",
      "failDamageType": "piercing"
    },
    {
      "id": "fresh_tracks",
      "title": "Fresh Tracks",
      "description": "Fresh tracks lead toward a hunter's mark and what looks very much like a supply cache, assuming you can read the trail before the scavengers do.",
      "skill": "Survival",
      "dcBase": 11,
      "dcPerAreaLevel": 2,
      "successText": "You follow the sign cleanly and beat every other opportunist to the stash.",
      "rewardHint": "coin, herbs, and trail rations",
      "rewardCoins": [
        50,
        135
      ],
      "rewardItems": [
        {
          "id": "herbs",
          "qty": [
            1,
            2
          ],
          "chance": 0.75
        },
        {
          "id": "hide",
          "qty": [
            1,
            1
          ],
          "chance": 0.35
        }
      ],
      "failureText": "You follow the wrong trail into a thicket and donate some skin to it.",
      "failDamage": "1d4",
      "failDamageType": "slashing"
    }
  ];

  Object.assign(store, {
    RANDOM_EVENT_TEMPLATES,
  });
})();
