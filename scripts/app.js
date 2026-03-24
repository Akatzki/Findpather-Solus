(function () {
  "use strict";

  const SAVE_VERSION=3;

  const SAVE_KEY=`findpather_save_v${SAVE_VERSION}`;

  const LEGACY_SAVE_KEYS=["findpather_save_v1", "findpather_save"];

  const SAVE_KEYS=[...new Set([SAVE_KEY, ...LEGACY_SAVE_KEYS])];

  const GAME_CONFIG={
    maxLevel:10, defaultLogMode:"compact"
  };

  const LOG_MODES={
    compact:"compact", detail:"detail"
  };

  const DAMAGE_TYPES=["bludgeoning", "piercing", "slashing", "acid", "cold", "electricity", "fire", "poison", "sonic", "radiant", "necrotic", "force", "mental"];

  const MAP_CAMERA_MODES={
    fixed:"fixed", follow:"follow"
  };

  const FOLLOW_CAMERA_EDGE_BUFFER=3;

  const MAP_MIN_CELL_SIZE=24;

  const MAP_WIDTH_SCALE_RATIO=0.8;

  const MAP_VIEWPORT_MARGIN=24;

  const MAP_MAX_VISIBLE_TILES=9;

  const MAP_ICONS={
    unknown:"❔", player:"🧍", home:"🏘️", dungeon:"🕳️", monster:"👹", resource:"⛏️", treasure:"💰", forest:"🌲", plains:"🌾", dirt:"🟫", water:"🌊", mountain:"⛰️"
  };

  const RANDOM_EVENT_DAY_REQUIREMENT_DEFAULT=1;

  const RANDOM_EVENT_DAILY_COUNT=3;

  const RANDOM_EVENT_TRIGGER_CHANCE=0.2;

  const PF_DATA=window.PF_DATA||{
  };

  const {
    RACES=[], CLASSES={
    }, ABILITIES={
    }, STATUS_EFFECT_TEMPLATES={
    }, SKILLS=[], RANDOM_EVENT_TEMPLATES=[], STAT_LEVEL_UP_CAP=20, WEAPONS=[], ARMORS=[], OFFHAND=[], ACCESSORIES=[], CONSUMABLE_DEFINITIONS=[], AMMO=[], RESOURCES=[], CRAFTING_RECIPES=[], MONSTERS=[], AREAS=[], DUNGEON_LINKS=[], NPCS=[], QUESTS=[]
  }
  =PF_DATA;

  const NPC_DEFINITIONS=Array.isArray(NPCS)?NPCS.map(normalizeNpcDefinition).filter(Boolean):[];

  const QUEST_DEFINITIONS=Array.isArray(QUESTS)?QUESTS.map(normalizeQuestDefinition).filter(Boolean):[];

  const NPC_INDEX=new Map(NPC_DEFINITIONS.map(npc=>[npc.id, npc]));

  const QUEST_INDEX=new Map(QUEST_DEFINITIONS.map(quest=>[quest.id, quest]));

  // ---------------------------------------------------------------------------
  // Item catalog and lookup helpers
  // ---------------------------------------------------------------------------
  function createConsumables(definitions) {
   return (Array.isArray(definitions) ? definitions : []).map(def => {
      const normalized = {
         ...def
      };
      const effect = normalized.effect || {};
      delete normalized.effect;
      normalized.use = (state) => {
         const amountExpr = /^\d+d\d+([+-]\d+)?$/i.test(String(effect.amount || "").trim()) ? String(effect.amount).trim() : "1d1-1";
         const label = effect.logLabel || normalized.name;
         if (effect.kind === "restore_hp") {
            const healRoll = rollDiceDetailed(amountExpr, normalized.id, {
               label
            });
            const before = state.player.hp.current;
            state.player.hp.current = clamp(state.player.hp.current + healRoll.total, 0, state.player.hp.max);
            const recovered = state.player.hp.current - before;
            const wasted = Math.max(0, healRoll.total - recovered);
            const parts = cloneRollParts(healRoll.parts);
            const capPart = createRollModifierPart(-wasted, "healing_cap", "Missing HP cap", "Healing beyond your missing HP is lost.");
            if (capPart) parts.push(capPart);
            log(state, `You drink ${label} and recover ${recovered} HP.`, {
               rollGroups: [buildLogRollGroup({
                  label: `${label} healing`,
                  parts,
                  total: recovered
               })]
            });
            return;
         }
         if (effect.kind === "restore_sp") {
            const spRoll = rollDiceDetailed(amountExpr, normalized.id, {
               label
            });
            const before = state.player.sp.current;
            state.player.sp.current = clamp(state.player.sp.current + spRoll.total, 0, state.player.sp.max);
            const recovered = state.player.sp.current - before;
            const wasted = Math.max(0, spRoll.total - recovered);
            const parts = cloneRollParts(spRoll.parts);
            const capPart = createRollModifierPart(-wasted, "sp_cap", "Missing SP cap", "Restoration beyond your missing SP is lost.");
            if (capPart) parts.push(capPart);
            log(state, `You drink ${label} and recover ${recovered} SP.`, {
               rollGroups: [buildLogRollGroup({
                  label: `${label} stamina`,
                  parts,
                  total: recovered
               })]
            });
         }
      };
      return normalized;
   });
}

  const CONSUMABLES=createConsumables(CONSUMABLE_DEFINITIONS);

  const ITEM_INDEX=new Map();

  [...WEAPONS, ...ARMORS, ...OFFHAND, ...ACCESSORIES, ...CONSUMABLES, ...AMMO, ...RESOURCES].forEach(it=>ITEM_INDEX.set(it.id, it));

  function getItem(id) {
    const it=ITEM_INDEX.get(id);
    if(!it)throw new Error("Unknown item id: "+id);
    return it;
  }

  const AMMO_ITEM_BY_KEY={
    arrow:"arrows"
  };

  function ammoItemIdForWeapon(weapon) {
    if(!weapon||weapon.type!=="weapon")return null;
    if(weapon.ammoItemId)return weapon.ammoItemId;
    const prop=Array.isArray(weapon.properties)?weapon.properties.find(p=>String(p||"").toLowerCase().startsWith("ammo-")):null;
    if(!prop)return null;
    const key=String(prop).slice(5).trim().toLowerCase();
    return AMMO_ITEM_BY_KEY[key]||null;
  }

  function itemQuantity(player, itemId) {
    if(!player||!Array.isArray(player.inventory))return 0;
    const found=player.inventory.find(entry=>entry.itemId===itemId);
    return Math.max(0, Number(found&&found.qty||0));
  }

  function weaponAmmoCount(player, weapon) {
    const ammoItemId=ammoItemIdForWeapon(weapon);
    return ammoItemId?itemQuantity(player, ammoItemId):0;
  }

  // ---------------------------------------------------------------------------
  // Core utilities and economy rules
  // ---------------------------------------------------------------------------
  const clamp=(n, a, b)=>Math.max(a, Math.min(b, n));

  function statMod(score) {
    return Math.floor((score-10)/2);
  }

  function rollInt(min, max) {
    return Math.floor(Math.random()*(max-min+1))+min;
  }

  function rollD20() {
    return rollInt(1, 20);
  }

  function rollDice(expr){const m=String(expr).trim().match(/^(\d+)d(\d+)([+-]\d+)?$/i);if(!m)throw new Error("Bad dice expr: "+expr);const n=parseInt(m[1],10);const sides=parseInt(m[2],10);const mod=m[3]?parseInt(m[3],10):0;let total=0;for(let i=0;i<n;i++)total+=rollInt(1,sides);return total+mod;}

  function formatCoins(cp){cp=Math.max(0,Math.floor(cp));const gp=Math.floor(cp/100);cp%=100;const sp=Math.floor(cp/10);cp%=10;return`${gp}gp ${sp}sp ${cp}cp`;}

  function addCoins(state, cp) {
    state.player.moneyCp=Math.max(0, state.player.moneyCp+Math.floor(cp));
  }

  function canAfford(state, costCp) {
    return state.player.moneyCp>=costCp;
  }

  function spendCoins(state, costCp) {
    if(!canAfford(state, costCp))return false;
    state.player.moneyCp-=costCp;
    return true;
  }

  function socialPriceModifier(player) {
    return skillTotal(player, "Social")+(hasAbility(player, "skill_social_haggler")?5:0);
  }

  function buyMultiplier(player) {
    const sm=socialPriceModifier(player);
    return 1-(sm*0.01);
  }

  function sellMultiplier(player) {
    const sm=socialPriceModifier(player);
    return 1+(sm*0.01);
  }

  function adjustedBuyPriceCp(player, baseCp) {
    const mult=buyMultiplier(player);
    return Math.max(1, Math.floor(Math.max(0, baseCp)*mult));
  }

  function baseSellPriceCp(item) {
    if(!item||item.sellable===false)return 0;
    if(typeof item.sellValue==="number")return Math.max(0, item.sellValue||0);
    const base=Math.max(0, item.cost||0);
    return Math.max(0, Math.floor(base*0.5));
  }

  function adjustedSellPriceCp(player, item) {
    const mult=sellMultiplier(player);
    return Math.max(0, Math.floor(baseSellPriceCp(item)*mult));
  }

  function canSellItem(item) {
    return!!item&&item.sellable!==false&&baseSellPriceCp(item)>0;
  }

  function itemDmgOrAC(it) {
	if (!it) return "—";
	if (it.type === "weapon") {
	  const dmg = it["Damage"] || it.Damage || "—";
	  const dt = it["Damage type"] || it["Damage Type"] || it["damageType"] || "";
	  const atkBonus = Math.max(0, Number(it.attackBonusItem || 0));
	  return `${dmg}${dt ? " " + dt : ""}${atkBonus ? ` • Atk +${atkBonus}` : ""}`;
	}
	if (it.type === "ammo") {
	  const bundle = Math.max(1, Number(it.purchaseQty || 1));
	  return bundle > 1 ? `Bundle ×${bundle}` : "Ammo";
	}
	if (it.type === "armor") {
	  const ac = it.acBonus || 0;
	  const cap = dexCapFromArmor(it);
	  return `AC +${ac} (Dex cap ${cap >= 99 ? "—" : "+" + cap})`;
	}
	if (it.category === "shield") {
	  const ac = it.acBonus || 0;
	  return `AC +${ac}`;
	}
	if (it.type === "accessory" && Number(it.carryBonus || 0) > 0) {
	  return `Carry +${it.carryBonus}`;
	}
	return "—";
	}

	function itemLinkHtml(it, player, label = null) {
	const text = label == null ? it.name : label;
	const notProficient = itemUsesProficiency(it) && !isProficientWithItem(player, it);
	return `<span class="itemLink${notProficient ? " notProficientText" : ""}" data-item="${it.id}">${escapeHtml(text)}</span>`;
  }

  function itemTextClass(it, player) {
    return itemUsesProficiency(it)&&!isProficientWithItem(player, it)?"notProficientText":"";
  }

  function itemCategoryLabel(it) {
    return formatDamageTypeLabel(it&&(it.category||it.type||""));
  }

  function terrainLabel(terrain) {
    return formatDamageTypeLabel(terrain||"unknown");
  }

  function terrainBadgeHtml(terrain) {
	const key = String(terrain || "unknown").trim().toLowerCase();
	return `<span class="badge terrain-badge terrain-${escapeHtml(key)}">${escapeHtml(terrainLabel(key))}</span>`;
  }

  function normalizeSortConfig(sortConfig, fallbackKey="name") {
    const cfg=sortConfig||{
    };
    return {
      key:cfg.key||fallbackKey, dir:cfg.dir==="desc"?"desc":"asc"
    };
  }

  function compareSortValues(a, b) {
    if(typeof a==="number"&&typeof b==="number")return a-b;
    const na=Number(a);
    const nb=Number(b);
    const aIsNumeric=Number.isFinite(na)&&String(a??"").trim()!=="";
    const bIsNumeric=Number.isFinite(nb)&&String(b??"").trim()!=="";
    if(aIsNumeric&&bIsNumeric)return na-nb;
    return String(a??"").localeCompare(String(b??""), undefined, {
      numeric:true, sensitivity:"base"
    });
  }

  function sortRows(rows, sortConfig, fallbackKey="name") {
    const cfg=normalizeSortConfig(sortConfig, fallbackKey);
    return[...rows].sort((a, b)=> {
      const primary=compareSortValues(a.sort?.[cfg.key], b.sort?.[cfg.key]);
      if(primary!==0)return cfg.dir==="asc"?primary:-primary;
      return compareSortValues(a.sort?.name, b.sort?.name);
    });
  }

  function sortHeaderHtml(scope,sortConfig,key,label){const cfg=normalizeSortConfig(sortConfig,"name");const active=cfg.key===key;const icon=active?(cfg.dir==="asc"?"▲":"▼"):"↕";return`
        <button class="sortbtn ${active ? "active" : ""}" type="button" data-sort-scope="${escapeHtml(scope)}" data-sort-key="${escapeHtml(key)}">
          <span>${escapeHtml(label)}</span>
          <span class="sortIcon" aria-hidden="true">${icon}</span>
        </button>
      `;}

  function toggleSort(scope, key) {
    state.ui=state.ui||{
    };
    const current=normalizeSortConfig(state.ui[scope], "name");
    state.ui[scope]=(current.key===key)?{
      key, dir:current.dir==="asc"?"desc":"asc"
    }
    :{
      key, dir:"asc"
    };
  }

  function wireSortButtons(scope) {
    if(!scope)return;
    scope.querySelectorAll("[data-sort-scope][data-sort-key]").forEach(btn=> {
      btn.addEventListener("click", ()=> {
        toggleSort(btn.getAttribute("data-sort-scope"), btn.getAttribute("data-sort-key"));
        render();
      });
    });
  }

  function mulberry32(seed) {
    let a=seed>>>0;
    return function() {
      a+=0x6D2B79F5;
      let t=a;
      t=Math.imul(t^(t>>>15), t|1);
      t^=t+Math.imul(t^(t>>>7), t|61);
      return((t^(t>>>14))>>>0)/4294967296;
    };
  }

  function hasTrainingFlag(value) {
    return value===true||value===1||value===2||value==="trained"||value==="expert";
  }

  function proficiencyClassIds(player) {
    if(!player)return[];
    const startingClassId=player.startingClassId&&CLASSES[player.startingClassId]?player.startingClassId:mainClass(player);
    return startingClassId&&CLASSES[startingClassId]?[startingClassId]:[];
  }

  function canUseWeaponCategory(player, category) {
    for(const cid of proficiencyClassIds(player)) {
      const cls=CLASSES[cid];
      if(cls&&cls.proficiencies&&cls.proficiencies.weapons&&hasTrainingFlag(cls.proficiencies.weapons[category])) {
        return true;
      }
    }
    return false;
  }

  function canUseArmorCategory(player, category) {
    for(const cid of proficiencyClassIds(player)) {
      const cls=CLASSES[cid];
      if(cls&&cls.proficiencies&&cls.proficiencies.armor&&hasTrainingFlag(cls.proficiencies.armor[category])) {
        return true;
      }
    }
    return false;
  }

  function itemUsesProficiency(it) {
    if(!it)return false;
    if(it.type==="weapon")return true;
    if(it.type==="armor")return true;
    if(it.type==="offhand")return true;
    if(it.category==="shield")return true;
    return false;
  }

  function isProficientWithItem(player, it) {
    if(!it||!itemUsesProficiency(it))return true;
    if(it.type==="weapon")return canUseWeaponCategory(player, it.category||"simple");
    if(it.category==="shield")return canUseArmorCategory(player, "shields");
    if(it.type==="offhand")return canUseArmorCategory(player, it.category||"shields");
    if(it.type==="armor")return canUseArmorCategory(player, it.category||"unarmored");
    return true;
  }

  function saveTrainingValue(player, saveId) {
    let best=0;
    for(const cid of proficiencyClassIds(player)) {
      const cls=CLASSES[cid];
      const raw=Number(cls&&cls.proficiencies&&cls.proficiencies.saves?cls.proficiencies.saves[saveId]:0);
      if(Number.isFinite(raw))best=Math.max(best, raw);
    }
    return best;
  }

  // ---------------------------------------------------------------------------
  // Save state and persistence
  // ---------------------------------------------------------------------------
  function defaultState() {
    return {
      version:SAVE_VERSION, tab:"explore", player:null, world:{
        areaId:"town", day:1, areas:{
        }, areaUnlocks:defaultAreaUnlocks(), randomEvents:{
          minimumDay:RANDOM_EVENT_DAY_REQUIREMENT_DEFAULT, day:0, dailyPool:[]
        }
      }, combat:null, ui:{
        selectedTile:null, skillDraft:{
        }, levelUpOpen:false, levelUpDraft:{
        }, shopMode:"buy", saveToolsVisible:false, mobileActionsVisible:false, mapCameraMode:MAP_CAMERA_MODES.fixed, logMode:GAME_CONFIG.defaultLogMode, mapViewByArea:{
        }, inventorySort:{
          key:"name", dir:"asc"
        }, shopBuySort:{
          key:"name", dir:"asc"
        }, shopSellSort:{
          key:"name", dir:"asc"
        }, combatNotice:null, randomEventPrompt:null, selectedTownNpcId:"", questListMode:"active"
      }, quests:{
        active:{
        }, completed:{
        }
      }, cooldowns:{
        shortRestReadyAt:0
      }, log:[]
    };
  }

  function saveStorageKeys() {
    return SAVE_KEYS.slice();
  }

  function clearLegacySaveKeys({
    keepKey=SAVE_KEY
  }
  ={
  }) {
    for(const key of saveStorageKeys()) {
      if(key===keepKey)continue;
      try {
        localStorage.removeItem(key);
      } catch(_) {
      }
    }
  }

  function parseSaveJson(raw) {
	if (typeof raw !== "string") return null;
	const trimmed = raw.replace(/^\uFEFF/, "").trim();
	if (!trimmed) return null;
	try {
	  return JSON.parse(trimmed);
	} catch (_) {
	  return null;
	}
  }

  function cloneSaveData(data) {
    try {
      return JSON.parse(JSON.stringify(data));
    } catch(_) {
      return null;
    }
  }

  function asPlainObject(value) {
    return value&&typeof value==="object"&&!Array.isArray(value)?value:null;
  }

  function extractSavePayload(rawData) {
    const root=asPlainObject(rawData);
    if(!root)return null;
    if(root.player||root.world||root.ui||root.combat||root.cooldowns||Array.isArray(root.log)||root.version!=null)return root;
    for(const key of["state", "save", "data"]) {
      const candidate=asPlainObject(root[key]);
      if(candidate)return candidate;
    }
    return root;
  }

  function normalizeSaveVersion(value) {
    const parsed=Number(value);
    return Number.isFinite(parsed)?Math.max(0, Math.floor(parsed)):0;
  }

  function isLikelySaveData(rawData) {
    const payload=extractSavePayload(rawData);
    return!!(payload&&(payload.player||payload.world||payload.ui||payload.combat||payload.cooldowns||Array.isArray(payload.log)||payload.version!=null));
  }

  function migrateSaveToCurrent(rawData) {
    const extracted=extractSavePayload(rawData);
    const source=cloneSaveData(extracted);
    if(!source)return null;
    const defaults=defaultState();
    const migrated={
      ...defaults, ...source, ui:{
        ...defaults.ui, ...(asPlainObject(source.ui)||{
        })
      }, world:{
        ...defaults.world, ...(asPlainObject(source.world)||{
        })
      }, quests:{
        ...defaults.quests, ...(asPlainObject(source.quests)||{
        })
      }, cooldowns:{
        ...defaults.cooldowns, ...(asPlainObject(source.cooldowns)||{
        })
      }
    };
    if(source.player===null||asPlainObject(source.player))migrated.player=source.player;
    if(source.combat===null||asPlainObject(source.combat))migrated.combat=source.combat;
    migrated.log=Array.isArray(source.log)?source.log.slice():[];
    const sourceVersion=normalizeSaveVersion(source.version);
    if(sourceVersion<1) {
      if(!migrated.version)migrated.version=1;
    }
    if(sourceVersion<2) {
      if(migrated.player&&!migrated.player.startingClassId) {
        migrated.player.startingClassId=Object.entries(migrated.player.levels||{
        }).find(([, level])=>Number(level||0)>0)?.[0]||null;
      }
      if(migrated.player&&!Array.isArray(migrated.player.abilityIds)) {
        const legacyClassId=migrated.player.startingClassId||Object.entries(migrated.player.levels||{
        }).find(([, level])=>Number(level||0)>0)?.[0]||null;
        migrated.player.abilityIds=legacyClassId?startingAbilityPackageForClass(legacyClassId, null):[];
      }
      migrated.version=2;
    }
    if(sourceVersion<3) {
      migrated.version=3;
    }
    normalizeState(migrated);
    migrated.version=SAVE_VERSION;
    return migrated;
  }

  function save(state) {
    if(!state||typeof state!=="object")return;
    state.version=SAVE_VERSION;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
      clearLegacySaveKeys({
        keepKey:SAVE_KEY
      });
    } catch(_) {
    }
  }

  function load() {
    for(const key of saveStorageKeys()) {
      let raw=null;
      try {
        raw=localStorage.getItem(key);
      } catch(_) {
        continue;
      }
      if(!raw)continue;
      const parsed=parseSaveJson(raw);
      if(!parsed||!isLikelySaveData(parsed))continue;
      const migrated=migrateSaveToCurrent(parsed);
      if(!migrated)continue;
      if(key!==SAVE_KEY||normalizeSaveVersion(parsed.version)!==SAVE_VERSION) {
        save(migrated);
      }
      return migrated;
    }
    return null;
  }

  function wipeSave() {
    for(const key of saveStorageKeys()) {
      try {
        localStorage.removeItem(key);
      } catch(_) {
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Roll details and log helpers
  // ---------------------------------------------------------------------------
  const ROLL_DETAIL_SOURCE_LABELS=Object.freeze({
    attack_roll:"Attack roll", attack_total:"Attack total", attack_target_ac:"Target Armor Class", attack_outcome:"Attack outcome", weapon_damage:"Weapon damage", damage_total:"Damage total", critical_hit_bonus:"Critical hit bonus", enemy_attack_roll:"Enemy attack roll", enemy_attack_bonus:"Enemy attack bonus", enemy_damage:"Enemy damage", skill_die:"Skill check die", skill_total:"Skill check total", target_dc:"Difficulty Class", strength_modifier:"Strength modifier", dexterity_modifier:"Dexterity modifier", constitution_modifier:"Constitution modifier", intelligence_modifier:"Intelligence modifier", wisdom_modifier:"Wisdom modifier", charisma_modifier:"Charisma modifier", skill_proficiency:"Skill proficiency", save_training:"Save training", weapon_item_bonus:"Weapon item bonus", status_attack_bonus:"Attack modifier from a status effect", status_damage_bonus:"Damage modifier from a status effect", off_hand_penalty:"Off-hand penalty", flying_penalty:"Flying target penalty", extra_attack_bonus:"Additional attack modifier", extra_damage_on_hit:"Additional damage modifier", damage_resistance:"Damage resistance", cloud_stance_reduction:"Cloud Stance reduction", defensive_roll_reduction:"Defensive Roll reduction", second_wind:"Second Wind healing", potion_healing:"Potion of Healing", greater_potion_healing:"Greater Potion of Healing", stamina_tonic:"Stamina Tonic", greater_stamina_tonic:"Greater Stamina Tonic", random_event_fail_damage:"Failure damage", search_check:"Search reveal check", gather_check:"Gathering check", crafting_check:"Crafting check", flee_check:"Flee check", cover_step_check:"Cover Step check", status_check:"Status check", hunters_mark:"Hunter's Mark", sneak_attack_trigger:"Sneak Attack trigger", sneak_attack_damage:"Sneak Attack damage", frothing_rage:"Frothing Rage", river_stance:"River Stance", acrobatics_skill:"Acrobatics check", athletics_skill:"Athletics check", stealth_skill:"Stealth check", survival_skill:"Survival check", crafting_skill:"Crafting check", perception_skill:"Perception check", social_skill:"Social check", hunting_bonus:"Hunting bonus", keen_search_bonus:"Keen Search bonus", ac_bonus_dual_wield:"Dual Wield Mastery AC bonus", healing_cap:"Missing HP cap", sp_cap:"Missing SP cap", damage_floor:"Minimum 0 damage"
  });

  function abilitySourceKeyForStat(stat) {
    switch(String(stat||"").trim().toUpperCase()) {
      case"STR":return"strength_modifier";
      case"DEX":return"dexterity_modifier";
      case"CON":return"constitution_modifier";
      case"INT":return"intelligence_modifier";
      case"WIS":return"wisdom_modifier";
      case"CHA":return"charisma_modifier";
      default:return"ability_modifier";
    }
  }

  function rollSourceLabel(sourceKey, fallbackLabel="") {
    const key=String(sourceKey||"").trim();
    if(key&&ROLL_DETAIL_SOURCE_LABELS[key])return ROLL_DETAIL_SOURCE_LABELS[key];
    try {
      const feat=typeof getClassFeat==="function"?getClassFeat(key):null;
      if(feat&&feat.name)return feat.name;
    } catch(_) {
    }
    try {
      const ability=typeof getAbility==="function"?getAbility(key):null;
      if(ability&&ability.name)return ability.name;
    } catch(_) {
    }
    return fallbackLabel||key||"Roll source";
  }

  function rollPartValue(part) {
    if(!part||typeof part!=="object")return 0;
    return Number(part.value||0);
  }

  function sumRollParts(parts) {
    return(Array.isArray(parts)?parts:[]).reduce((sum, part)=>sum+rollPartValue(part), 0);
  }

  function createRollModifierPart(value, sourceKey, label="", note="") {
    const numeric=Number(value||0);
    if(!numeric)return null;
    return {
      type:"modifier", sourceKey:String(sourceKey||"").trim(), label:String(label||"").trim(), note:String(note||"").trim(), value:numeric
    };
  }

  function rollDiceDetailed(expr, sourceKey, {
	label = "",
	note = "",
	flatSourceKey = "",
	flatLabel = "",
	flatNote = ""
	} = {}) {
	const m = String(expr).trim().match(/^(\d+)d(\d+)([+-]\d+)?$/i);
	if (!m) throw new Error("Bad dice expr: " + expr);
	const n = parseInt(m[1], 10);
	const sides = parseInt(m[2], 10);
	const flat = m[3] ? parseInt(m[3], 10) : 0;
	const rolls = [];
	let total = 0;
	for (let i = 0; i < n; i++) {
	  const value = rollInt(1, sides);
	  rolls.push(value);
	  total += value;
	}
	const parts = [{
	  type: "dice",
	  sourceKey: String(sourceKey || "").trim(),
	  label: String(label || "").trim(),
	  note: String(note || "").trim(),
	  expr: `${n}d${sides}`,
	  rolls,
	  value: total
	}];
	const flatPart = createRollModifierPart(flat, flatSourceKey || sourceKey, flatLabel, flatNote);
	if (flatPart) parts.push(flatPart);
	return {
	  total: total + flat,
	  parts
	};
  }

  function rollD20Detailed(sourceKey, options={
  }) {
    return rollDiceDetailed("1d20", sourceKey, options);
  }

  function cloneRollPart(part) {
    return part&&typeof part==="object"?JSON.parse(JSON.stringify(part)):part;
  }

  function cloneRollParts(parts) {
    return(Array.isArray(parts)?parts:[]).map(cloneRollPart).filter(Boolean);
  }

  function statusModifierSources(entity, key) {
    return(entity&&entity.statusEffects||[]).map(effect=> {
      const value=Number(effect&&effect.modifiers?effect.modifiers[key]||0:0);
      if(!value)return null;
      return {
        value, sourceKey:key==="attackRollModifier"?"status_attack_bonus":(key==="damageBonusMelee"?"status_damage_bonus":key), label:effect.name||"Status", note:effect.description||""
      };
    }).filter(Boolean);
  }

  function skillCheckSourceParts(player, skillId) {
    const skill=SKILLS.find(entry=>entry.id===skillId);
    if(!player||!skill)return[];
    const parts=[];
    const stat=String(skill.stat||"").trim().toUpperCase();
    const base=statMod(player.stats[stat]);
    const prof=Number(player.skillProficiency[skillId]||0);
    const basePart=createRollModifierPart(base, abilitySourceKeyForStat(stat), stat, fullStatName(stat)+" modifier");
    const profPart=createRollModifierPart(prof, "skill_proficiency", skillId+" prof", skillId+" proficiency");
    if(basePart)parts.push(basePart);
    if(profPart)parts.push(profPart);
    return parts;
  }

  function enemyAttackBonusParts(enemy) {
    const parts=[];
    const base=createRollModifierPart(Number(enemy&&enemy.attackBonus||0), "enemy_attack_bonus", enemy&&enemy.name?(enemy.name+" atk"):"Attack", "Base enemy attack bonus");
    if(base)parts.push(base);
    for(const source of statusModifierSources(enemy, "attackRollModifier")) {
      const part=createRollModifierPart(source.value, source.sourceKey, source.label, source.note);
      if(part)parts.push(part);
    }
    return parts;
  }

  function buildLogRollGroup({
    label="", parts=[], total=null, targetLabel="", targetValue=null, outcome="", note=""
  }
  ={
  }) {
    const clonedParts=cloneRollParts(parts);
    return {
      label:String(label||"").trim(), note:String(note||"").trim(), parts:clonedParts, total:total==null?sumRollParts(clonedParts):Number(total||0), targetLabel:String(targetLabel||"").trim(), targetValue:targetValue==null?null:Number(targetValue||0), outcome:String(outcome||"").trim()
    };
  }

  function normalizeLogRollPart(part) {
    if(!part||typeof part!=="object")return null;
    const type=part.type==="modifier"?"modifier":"dice";
    const normalized={
      type, sourceKey:String(part.sourceKey||"").trim(), label:String(part.label||"").trim(), note:String(part.note||"").trim(), value:Number(part.value||0)
    };
    if(type==="dice") {
      normalized.expr=String(part.expr||"").trim();
      normalized.rolls=(Array.isArray(part.rolls)?part.rolls:[]).map(value=>Number(value||0));
    }
    return normalized;
  }

  function normalizeLogRollGroup(group) {
    if(!group||typeof group!=="object")return null;
    return {
      label:String(group.label||"").trim(), note:String(group.note||"").trim(), parts:(Array.isArray(group.parts)?group.parts:[]).map(normalizeLogRollPart).filter(Boolean), total:Number(group.total||0), targetLabel:String(group.targetLabel||"").trim(), targetValue:group.targetValue==null?null:Number(group.targetValue||0), outcome:String(group.outcome||"").trim()
    };
  }

  function logEntryMessageText(entry){if(entry&&typeof entry==="object"&&!Array.isArray(entry)){const stamp=entry.stamp?`[${entry.stamp}] `:"";return stamp+String(entry.message||"");}return String(entry||"");}

  function logEntryRollGroups(entry) {
    if(!entry||typeof entry!=="object"||Array.isArray(entry))return[];
    return Array.isArray(entry.rollGroups)?entry.rollGroups.map(normalizeLogRollGroup).filter(Boolean):[];
  }

  function log(state,msg,options={}){const stamp=new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});const rollGroups=(Array.isArray(options&&options.rollGroups)?options.rollGroups:[]).map(normalizeLogRollGroup).filter(Boolean);const entry=rollGroups.length?{stamp,message:String(msg||""),rollGroups}:`[${stamp}] ${msg}`;state.log.push(entry);if(state.log.length>400)state.log.splice(0,state.log.length-400);}

  // ---------------------------------------------------------------------------
  // Character creation and progression
  // ---------------------------------------------------------------------------
  const POINT_BUY_TOTAL=27;

  const POINT_BUY_COST={
    8:0, 9:1, 10:2, 11:3, 12:4, 13:5, 14:7, 15:9
  };

  const STATS=["STR", "DEX", "CON", "INT", "WIS", "CHA"];

  const STAT_TOOLTIPS = {
	STR: "Strength : melee damage, carrying capacity (inventory slots), Athletics.",
	DEX: "Dexterity : Armor Class without armor, Reflex saves, ranged/finesse attacks, Stealth & Acrobatics.",
	CON: "Constitution : Hit Points and Fortitude saves.",
	INT: "Intelligence : level-up skill points use class base skill points + INT modifier, Crafting.",
	WIS: "Wisdom : Will saves, Perception & Survival, and short-rest SP recovery.",
	CHA: "Charisma : Social skill modifier; shop prices scale with your Social skill (1% per Social modifier)."
  };

  const SKILL_TOOLTIPS = {
	Acrobatics: "Acrobatics (DEX) : balance, tumbling, escaping hazards; used for fleeing.",
	Athletics: "Athletics (STR) : climbing, swimming, jumping, grappling.",
	Crafting: "Crafting (INT) : making/repairing gear; used for gathering ore.",
	Perception: "Perception (WIS) : spotting threats and hidden things; used for Search scouting.",
	Social: "Social (CHA) : persuasion, deception, intimidation, negotiation.",
	Stealth: "Stealth (DEX) : moving quietly and staying hidden; used to avoid ambush on short rest.",
	Survival: "Survival (WIS) : tracking, foraging, navigating; used for gathering herbs/hide."
  };

  function skillTooltipHtml(skillId){const text=SKILL_TOOLTIPS[skillId]||"";if(!text)return"";return`
        <div style="font-weight:700; font-size:13px; margin-bottom:6px">${escapeHtml(skillId)}</div>
        <div class="small muted" style="line-height:1.45">${escapeHtml(text)}</div>
      `;}

  function pointCost(score) {
    if(score<8||score>15)return Infinity;
    return POINT_BUY_COST[score];
  }

  function totalPointCost(stats) {
    let cost=0;
    for(const s of STATS)cost+=pointCost(stats[s]);
    return cost;
  }

  function startingSkillPointPoolForClass(classId, stats) {
    const cls=CLASSES[classId]||CLASSES.Fighter;
    const intScore=stats&&Number.isFinite(Number(stats.INT))?Number(stats.INT):8;
    return Math.max(0, Number(cls.baseSkillPoints||0)+Math.max(0, statMod(intScore)));
  }

  function sanitizeSkillDraft(rawDraft) {
    const validSkillIds=new Set(SKILLS.map(sk=>sk.id));
    const source=(rawDraft&&typeof rawDraft==="object")?rawDraft:{
    };
    const draft={
    };
    for(const[skillId, value]of Object.entries(source)) {
      if(!validSkillIds.has(skillId))continue;
      const next=Math.max(0, Math.trunc(Number(value||0)));
      if(next>0)draft[skillId]=next;
    }
    return draft;
  }

  function summarizeSkillDraft(rawDraft){return Object.entries(sanitizeSkillDraft(rawDraft)).filter(([,n])=>(n||0)>0).map(([skillId,value])=>`${skillId} +${value}`);}

  function applySkillTrainingWithBudget(player, rawDraft, budget) {
    if(!player)return {
      spent:0, remaining:0, applied:{
      }
    };
    const draft=sanitizeSkillDraft(rawDraft);
    let remaining=Math.max(0, Number(budget||0));
    const applied={
    };
    for(const sk of SKILLS) {
      const requested=Math.max(0, Number(draft[sk.id]||0));
      if(requested<=0||remaining<=0)continue;
      const current=Math.max(0, Number(player.skillProficiency[sk.id]||0));
      const room=Math.max(0, skillProficiencyCap(player, sk.id)-current);
      const add=Math.min(requested, room, remaining);
      if(add<=0)continue;
      player.skillProficiency[sk.id]=current+add;
      remaining-=add;
      applied[sk.id]=add;
    }
    return {
      spent:Math.max(0, Number(budget||0)-remaining), remaining, applied
    };
  }

  function applySkillDraftToPlayer(player, rawDraft) {
    if(!player)return {
      spent:0, applied:{
      }
    };
    const startingPool=Math.max(0, Number(player.skillPoints||0));
    const result=applySkillTrainingWithBudget(player, rawDraft, startingPool);
    player.skillPoints=result.remaining;
    return {
      spent:result.spent, applied:result.applied
    };
  }

  function totalLevel(player) {
    return Object.values(player.levels).reduce((a, b)=>a+b, 0);
  }

  function maxLevelCap() {
    return Math.max(1, Number(GAME_CONFIG.maxLevel||10));
  }

  function isMaxLevel(player) {
    return!!player&&totalLevel(player)>=maxLevelCap();
  }

  function mainClass(player) {
    let best=null;
    for(const[k, v]of Object.entries(player.levels)) {
      if(v<=0)continue;
      if(!best||v>best.level)best={
        id:k, level:v
      };
    }
    return best?best.id:"—";
  }

  function addItem(player, itemId, qty=1) {
    if(qty<=0)return;
    const existing=player.inventory.find(x=>x.itemId===itemId);
    if(existing)existing.qty+=qty;
    else player.inventory.push({
      itemId, qty
    });
    player.inventory.sort((a, b)=>getItem(a.itemId).name.localeCompare(getItem(b.itemId).name));
  }

  function removeItem(player, itemId, qty=1) {
    const idx=player.inventory.findIndex(x=>x.itemId===itemId);
    if(idx<0)return false;
    if(player.inventory[idx].qty<qty)return false;
    player.inventory[idx].qty-=qty;
    if(player.inventory[idx].qty<=0)player.inventory.splice(idx, 1);
    return true;
  }

  function hasItem(player, itemId, qty=1) {
    const e=player.inventory.find(x=>x.itemId===itemId);
    return e&&e.qty>=qty;
  }

  function normalizeQuestDataId(value) {
    return String(value||"").trim().toLowerCase();
  }

  function normalizeQuestObjectiveType(value) {
    const raw=normalizeQuestDataId(value);
    if(raw==="go_to_tile"||raw==="goto_tile"||raw==="reach_tile")return"visit_tile";
    if(raw==="obtain"||raw==="item")return"obtain_item";
    if(raw==="talk_to_npc"||raw==="speak"||raw==="speak_to_npc")return"talk";
    if(raw==="kill_monster"||raw==="kill_monsters")return"kill";
    return raw;
  }

  function normalizePlayerTitles(value) {
    return[...new Set((Array.isArray(value)?value:[]).map(entry=>String(entry||"").trim()).filter(Boolean))];
  }

  function activePlayerTitle(player) {
    if(!player)return"";
    const explicit=typeof player.activeTitle==="string"?player.activeTitle.trim():"";
    if(explicit)return explicit;
    return Array.isArray(player.titles)&&player.titles.length?String(player.titles[0]||"").trim():"";
  }

  // ---------------------------------------------------------------------------
  // Quests and NPC systems
  // ---------------------------------------------------------------------------
  function grantPlayerTitle(player, title) {
    const cleanTitle=String(title||"").trim();
    if(!player||!cleanTitle)return false;
    player.titles=normalizePlayerTitles(player.titles);
    if(!player.titles.includes(cleanTitle))player.titles.push(cleanTitle);
    player.activeTitle=cleanTitle;
    return true;
  }

  function normalizeNpcDefinition(raw) {
    const source=raw&&typeof raw==="object"?raw:{
    };
    const id=normalizeQuestDataId(source.id);
    if(!id)return null;
    return {
      id, name:String(source.name||id).trim()||id, emoji:String(source.emoji||"🙂"), areaId:normalizeQuestDataId(source.areaId||source.locationAreaId||"town")||"town", residence:String(source.residence||source.location||"Town").trim()||"Town", role:String(source.role||"Resident").trim()||"Resident", description:String(source.description||"").trim(), greeting:String(source.greeting||"").trim(), tooltip:String(source.tooltip||"").trim()
    };
  }

  function normalizeQuestObjectiveDefinition(raw) {
    const source=raw&&typeof raw==="object"?raw:{
    };
    const type=normalizeQuestObjectiveType(source.type);
    if(!type)return null;
    if(type==="kill") {
      const monsterId=normalizeQuestDataId(source.monsterId);
      if(!monsterId)return null;
      return {
        type, monsterId, count:Math.max(1, Math.floor(Number(source.count||source.required||1)||1)), description:String(source.description||"").trim()
      };
    }
    if(type==="visit_tile") {
      const areaId=normalizeQuestDataId(source.areaId);
      if(!areaId)return null;
      return {
        type, areaId, x:Math.max(0, Math.floor(Number(source.x||0)||0)), y:Math.max(0, Math.floor(Number(source.y||0)||0)), description:String(source.description||"").trim()
      };
    }
    if(type==="obtain_item") {
      const itemId=normalizeQuestDataId(source.itemId);
      if(!itemId)return null;
      return {
        type, itemId, count:Math.max(1, Math.floor(Number(source.count||source.required||1)||1)), consumeOnTurnIn:!!source.consumeOnTurnIn, description:String(source.description||"").trim()
      };
    }
    if(type==="talk") {
      const npcId=normalizeQuestDataId(source.npcId);
      if(!npcId)return null;
      return {
        type, npcId, description:String(source.description||"").trim()
      };
    }
    return null;
  }

  function normalizeQuestRewards(raw) {
    const source=raw&&typeof raw==="object"?raw:{
    };
    return {
      goldCp:Math.max(0, Math.floor(Number(source.goldCp!=null?source.goldCp:(source.gold||0))||0)), items:(Array.isArray(source.items)?source.items:[]).map(entry=> {
        const itemId=normalizeQuestDataId(entry&&(entry.itemId||entry.id));
        if(!itemId)return null;
        return {
          itemId, qty:Math.max(1, Math.floor(Number(entry&&(entry.qty||entry.count||1))||1))
        };
      }).filter(Boolean), title:String(source.title||"").trim(), unlockQuests:normalizeQuestUnlocks(source.unlockQuests||source.unlocks||[])
    };
  }

  function normalizeQuestAvailability(raw) {
    const source=raw&&typeof raw==="object"?raw:{
    };
    return {
      questUnlocksAllOf:normalizeQuestUnlocks(source.questUnlocksAllOf||source.unlocksAllOf||[]), completedQuestsAllOf:normalizeQuestUnlocks(source.completedQuestsAllOf||[]), playerLevelMin:Math.max(0, Math.floor(Number(source.playerLevelMin||source.minLevel||0)||0))
    };
  }

  function normalizeQuestDefinition(raw) {
    const source=raw&&typeof raw==="object"?raw:{
    };
    const id=normalizeQuestDataId(source.id);
    if(!id)return null;
    const giverNpcId=normalizeQuestDataId(source.giverNpcId||source.npcId);
    const objectives=(Array.isArray(source.objectives)?source.objectives:[]).map(normalizeQuestObjectiveDefinition).filter(Boolean);
    if(!giverNpcId||!objectives.length)return null;
    return {
      id, name:String(source.name||id).trim()||id, giverNpcId, turnInNpcId:normalizeQuestDataId(source.turnInNpcId||giverNpcId)||giverNpcId, areaId:normalizeQuestDataId(source.areaId||"town")||"town", summary:String(source.summary||source.description||"").trim(), description:String(source.description||source.summary||"").trim(), repeatable:!!source.repeatable, availability:normalizeQuestAvailability(source.availability), objectives, rewards:normalizeQuestRewards(source.rewards)
    };
  }

  function getNpc(npcId) {
    const npc=NPC_INDEX.get(normalizeQuestDataId(npcId));
    if(!npc)throw new Error("Unknown npc id: "+npcId);
    return npc;
  }

  function getQuest(questId) {
    const quest=QUEST_INDEX.get(normalizeQuestDataId(questId));
    if(!quest)throw new Error("Unknown quest id: "+questId);
    return quest;
  }

  function townNpcDefinitions(areaId="town") {
    const normalizedAreaId=normalizeQuestDataId(areaId||"town")||"town";
    return NPC_DEFINITIONS.filter(npc=>npc.areaId===normalizedAreaId);
  }

  function defaultQuestJournalState() {
    return {
      active:{
      }, completed:{
      }
    };
  }

  function defaultQuestObjectiveState(objective) {
    if(objective.type==="kill")return {
      current:0
    };
    if(objective.type==="visit_tile"||objective.type==="talk")return {
      done:false
    };
    return {
    };
  }

  function normalizeQuestObjectiveState(objective, raw) {
    const source=raw&&typeof raw==="object"?raw:{
    };
    if(objective.type==="kill") {
      return {
        current:Math.max(0, Math.floor(Number(source.current||0)||0))
      };
    }
    if(objective.type==="visit_tile"||objective.type==="talk") {
      return {
        done:!!source.done
      };
    }
    return {
    };
  }

  function normalizeQuestEntry(raw) {
    const source=raw&&typeof raw==="object"?raw:{
    };
    const questId=normalizeQuestDataId(source.questId||source.id);
    const quest=QUEST_INDEX.get(questId);
    if(!quest)return null;
    const objectiveStatesSource=Array.isArray(source.objectiveStates)?source.objectiveStates:[];
    return {
      questId, acceptedDay:Math.max(1, Math.floor(Number(source.acceptedDay||1)||1)), giverNpcId:normalizeQuestDataId(source.giverNpcId||quest.giverNpcId)||quest.giverNpcId, turnInNpcId:normalizeQuestDataId(source.turnInNpcId||quest.turnInNpcId||quest.giverNpcId)||quest.turnInNpcId||quest.giverNpcId, objectiveStates:quest.objectives.map((objective, index)=>normalizeQuestObjectiveState(objective, objectiveStatesSource[index]))
    };
  }

  function normalizeCompletedQuestEntry(raw) {
    const source=raw&&typeof raw==="object"?raw:{
    };
    const questId=normalizeQuestDataId(source.questId||source.id);
    const quest=QUEST_INDEX.get(questId);
    if(!quest)return null;
    return {
      questId, completedDay:Math.max(1, Math.floor(Number(source.completedDay||1)||1)), turnedInNpcId:normalizeQuestDataId(source.turnedInNpcId||quest.turnInNpcId||quest.giverNpcId)||quest.turnInNpcId||quest.giverNpcId, rewardSummary:(Array.isArray(source.rewardSummary)?source.rewardSummary:[]).map(entry=>String(entry||"").trim()).filter(Boolean)
    };
  }

  function normalizeQuestJournalState(raw) {
    const source=raw&&typeof raw==="object"?raw:{
    };
    const journal=defaultQuestJournalState();
    const activeSource=source.active&&typeof source.active==="object"?source.active:{
    };
    const completedSource=source.completed&&typeof source.completed==="object"?source.completed:{
    };
    Object.keys(activeSource).forEach(key=> {
      const entry=normalizeQuestEntry({
        ...(activeSource[key]||{
        }), questId:key
      });
      if(entry)journal.active[entry.questId]=entry;
    });
    Object.keys(completedSource).forEach(key=> {
      const entry=normalizeCompletedQuestEntry({
        ...(completedSource[key]||{
        }), questId:key
      });
      if(entry)journal.completed[entry.questId]=entry;
    });
    Object.keys(journal.completed).forEach(questId=> {
      if(journal.active[questId])delete journal.active[questId];
    });
    return journal;
  }

  function isQuestAccepted(state, questId) {
    const journal=state&&state.quests?state.quests:defaultQuestJournalState();
    return!!journal.active[normalizeQuestDataId(questId)];
  }

  function isQuestCompleted(state, questId) {
    const journal=state&&state.quests?state.quests:defaultQuestJournalState();
    return!!journal.completed[normalizeQuestDataId(questId)];
  }

  function questEntry(state, questId) {
    return state&&state.quests&&state.quests.active?state.quests.active[normalizeQuestDataId(questId)]||null:null;
  }

  function currentAreaTilePosition(state, areaId) {
    const normalizedAreaId=normalizeQuestDataId(areaId);
    if(!state||!state.world||!state.world.areas||state.world.areaId!==normalizedAreaId)return null;
    const areaState=state.world.areas[normalizedAreaId];
    if(!areaState)return null;
    return {
      x:Number(areaState.px||0), y:Number(areaState.py||0)
    };
  }

  function questObjectiveLabel(objective){if(objective.description)return objective.description;if(objective.type==="kill"){const monster=MONSTERS.find(entry=>entry.id===objective.monsterId);const monsterName=monster?monster.name:formatDamageTypeLabel(objective.monsterId);return`Defeat ${objective.count} ${monsterName}${objective.count === 1 ? "" : "s"}.`;}if(objective.type==="visit_tile"){const area=AREAS.find(entry=>entry.id===objective.areaId);const areaName=area?area.name:formatDamageTypeLabel(objective.areaId);return`Visit ${areaName} tile [${objective.x + 1}, ${objective.y + 1}].`;}if(objective.type==="obtain_item"){let itemName=formatDamageTypeLabel(objective.itemId);try{itemName=getItem(objective.itemId).name;}catch(_){}return`Bring ${objective.count}x ${itemName}.`;}if(objective.type==="talk"){const npc=NPC_INDEX.get(objective.npcId);const npcName=npc?npc.name:formatDamageTypeLabel(objective.npcId);return`Talk to ${npcName}.`;}return"Objective";}

  function evaluateQuestObjectiveProgress(state,objective,objectiveState){const source=objectiveState&&typeof objectiveState==="object"?objectiveState:defaultQuestObjectiveState(objective);if(objective.type==="kill"){const current=Math.min(objective.count,Math.max(0,Math.floor(Number(source.current||0)||0)));return{type:objective.type,label:questObjectiveLabel(objective),current,required:objective.count,complete:current>=objective.count,progressText:`${current}/${objective.count}`};}if(objective.type==="visit_tile"){const pos=currentAreaTilePosition(state,objective.areaId);const done=!!source.done||!!(pos&&pos.x===objective.x&&pos.y===objective.y);return{type:objective.type,label:questObjectiveLabel(objective),current:done?1:0,required:1,complete:done,progressText:done?"Complete":"Pending"};}if(objective.type==="obtain_item"){const current=Math.min(objective.count,itemQuantity(state.player,objective.itemId));return{type:objective.type,label:questObjectiveLabel(objective),current,required:objective.count,complete:current>=objective.count,progressText:`${current}/${objective.count}`};}if(objective.type==="talk"){const done=!!source.done;return{type:objective.type,label:questObjectiveLabel(objective),current:done?1:0,required:1,complete:done,progressText:done?"Complete":"Pending"};}return{type:objective.type,label:questObjectiveLabel(objective),current:0,required:1,complete:false,progressText:"Pending"};}

  function evaluateQuestProgress(state, quest, entry) {
    const objectiveStates=entry&&Array.isArray(entry.objectiveStates)?entry.objectiveStates:[];
    const objectives=quest.objectives.map((objective, index)=>evaluateQuestObjectiveProgress(state, objective, objectiveStates[index]));
    return {
      objectives, complete:objectives.length>0&&objectives.every(objective=>objective.complete)
    };
  }

  function activeQuestData(state) {
    const journal=state&&state.quests?state.quests:defaultQuestJournalState();
    return Object.values(journal.active).map(entry=> {
      const quest=QUEST_INDEX.get(entry.questId);
      if(!quest)return null;
      return {
        quest, entry, progress:evaluateQuestProgress(state, quest, entry)
      };
    }).filter(Boolean).sort((a, b)=>(Number(b.progress.complete)-Number(a.progress.complete))||(Number(a.entry.acceptedDay||0)-Number(b.entry.acceptedDay||0))||a.quest.name.localeCompare(b.quest.name));
  }

  function completedQuestData(state) {
    const journal=state&&state.quests?state.quests:defaultQuestJournalState();
    return Object.values(journal.completed).map(entry=> {
      const quest=QUEST_INDEX.get(entry.questId);
      if(!quest)return null;
      return {
        quest, entry
      };
    }).filter(Boolean).sort((a, b)=>(Number(b.entry.completedDay||0)-Number(a.entry.completedDay||0))||a.quest.name.localeCompare(b.quest.name));
  }

  function questAvailabilityIssues(state,quest){const issues=[];if(!state||!state.player||!quest)return["Unavailable"];if(!quest.repeatable&&isQuestCompleted(state,quest.id))issues.push("Already completed.");if(isQuestAccepted(state,quest.id))issues.push("Already active.");if(Number(quest.availability.playerLevelMin||0)>0&&totalLevel(state.player)<Number(quest.availability.playerLevelMin||0)){issues.push(`Requires level ${quest.availability.playerLevelMin}.`);}const unlocks=new Set(normalizeQuestUnlocks(state.player.questUnlocks));quest.availability.questUnlocksAllOf.forEach(flag=>{if(!unlocks.has(flag))issues.push("Locked.");});quest.availability.completedQuestsAllOf.forEach(requiredQuestId=>{if(!isQuestCompleted(state,requiredQuestId)){const requiredQuest=QUEST_INDEX.get(requiredQuestId);issues.push(`Requires ${requiredQuest ? requiredQuest.name : formatDamageTypeLabel(requiredQuestId)}.`);}});return issues;}

  function canAcceptQuest(state, questId) {
    const quest=typeof questId==="string"?QUEST_INDEX.get(normalizeQuestDataId(questId)):questId;
    return!!quest&&questAvailabilityIssues(state, quest).length===0;
  }

  function availableQuestOffersForNpc(state, npcId) {
    const normalizedNpcId=normalizeQuestDataId(npcId);
    return QUEST_DEFINITIONS.filter(quest=>quest.giverNpcId===normalizedNpcId&&canAcceptQuest(state, quest));
  }

  function turnInReadyQuestsForNpc(state, npcId) {
    const normalizedNpcId=normalizeQuestDataId(npcId);
    return activeQuestData(state).filter(entry=>entry.quest.turnInNpcId===normalizedNpcId&&entry.progress.complete);
  }

  function talkProgressQuestsForNpc(state, npcId) {
    const normalizedNpcId=normalizeQuestDataId(npcId);
    return activeQuestData(state).filter(entry=>entry.quest.objectives.some((objective, index)=>objective.type==="talk"&&objective.npcId===normalizedNpcId&&!entry.progress.objectives[index].complete));
  }

  function relatedActiveQuestsForNpc(state, npcId) {
    const normalizedNpcId=normalizeQuestDataId(npcId);
    return activeQuestData(state).filter(entry=> {
      if(entry.quest.giverNpcId===normalizedNpcId)return true;
      if(entry.quest.turnInNpcId===normalizedNpcId)return true;
      return entry.quest.objectives.some(objective=>objective.type==="talk"&&objective.npcId===normalizedNpcId);
    });
  }

  function questNpcMarker(state, npcId) {
    const ready=turnInReadyQuestsForNpc(state, npcId);
    const progress=talkProgressQuestsForNpc(state, npcId);
    if(ready.length||progress.length) {
      return {
        emoji:"❓", className:"npcTownBtnProgress", label:ready.length?"Quest ready to turn in":"Quest progress available"
      };
    }
    const offers=availableQuestOffersForNpc(state, npcId);
    if(offers.length) {
      return {
        emoji:"❗", className:"npcTownBtnOffer", label:"Quest available"
      };
    }
    return null;
  }

  function createQuestEntry(quest) {
    return {
      questId:quest.id, acceptedDay:Math.max(1, Number(state&&state.world&&state.world.day||1)), giverNpcId:quest.giverNpcId, turnInNpcId:quest.turnInNpcId||quest.giverNpcId, objectiveStates:quest.objectives.map(defaultQuestObjectiveState)
    };
  }

  function questRewardBonusRate(player) {
    return hasAbility(player, "skill_feat_social_mastery")?0.05:0;
  }

  function scaleQuestRewardAmount(amount, rate) {
    const base=Math.max(0, Math.floor(Number(amount||0)));
    if(base<=0||rate<=0)return base;
    return Math.max(base, Math.round(base*(1+rate)));
  }

  function adjustedQuestRewardData(player, quest) {
    const rewardData=quest&&quest.rewards?quest.rewards:{
      goldCp:0, items:[], title:"", unlockQuests:[]
    };
    const bonusRate=questRewardBonusRate(player);
    return {
      ...rewardData, goldCp:scaleQuestRewardAmount(rewardData.goldCp, bonusRate), items:(rewardData.items||[]).map(function(entry) {
        return {
          ...entry, qty:scaleQuestRewardAmount(entry.qty, bonusRate)
        };
      })
    };
  }

  function questRewardSummaryLines(quest,rewardSummaryOverride=null){if(Array.isArray(rewardSummaryOverride)&&rewardSummaryOverride.length)return rewardSummaryOverride;const rewards=[];const player=state&&state.player?state.player:null;const rewardData=adjustedQuestRewardData(player,quest);if(Number(rewardData.goldCp||0)>0)rewards.push(formatCoins(rewardData.goldCp));(rewardData.items||[]).forEach(entry=>{try{rewards.push(`${entry.qty}x ${getItem(entry.itemId).name}`);}catch(_){rewards.push(`${entry.qty}x ${formatDamageTypeLabel(entry.itemId)}`);}});if(rewardData.title)rewards.push(`Title: ${rewardData.title}`);(rewardData.unlockQuests||[]).forEach(questId=>{const unlockedQuest=QUEST_INDEX.get(questId);rewards.push(`Unlocks ${unlockedQuest ? unlockedQuest.name : formatDamageTypeLabel(questId)}`);});if(questRewardBonusRate(player)>0)rewards.push("Haggle +5%");return rewards;}

  function applyQuestRewards(state,quest){const rewards=[];if(!state||!state.player||!quest)return rewards;const baseRewardData=quest.rewards||{};const rewardData=adjustedQuestRewardData(state.player,quest);if(Number(rewardData.goldCp||0)>0){addCoins(state,rewardData.goldCp);rewards.push(formatCoins(rewardData.goldCp)+(Number(rewardData.goldCp||0)>Number(baseRewardData.goldCp||0)?" (Haggle)":""));}(rewardData.items||[]).forEach((entry,index)=>{addItem(state.player,entry.itemId,entry.qty);const baseQty=Number(baseRewardData.items&&baseRewardData.items[index]?baseRewardData.items[index].qty||0:0);try{rewards.push(`${entry.qty}x ${getItem(entry.itemId).name}${entry.qty > baseQty ? " (Haggle)" : ""}`);}catch(_){rewards.push(`${entry.qty}x ${formatDamageTypeLabel(entry.itemId)}${entry.qty > baseQty ? " (Haggle)" : ""}`);}});if(rewardData.title){if(grantPlayerTitle(state.player,rewardData.title))rewards.push(`Title: ${rewardData.title}`);}if(rewardData.unlockQuests&&rewardData.unlockQuests.length){state.player.questUnlocks=normalizeQuestUnlocks([...(state.player.questUnlocks||[]),...rewardData.unlockQuests]);rewardData.unlockQuests.forEach(questId=>{const unlockedQuest=QUEST_INDEX.get(questId);rewards.push(`Unlocks ${unlockedQuest ? unlockedQuest.name : formatDamageTypeLabel(questId)}`);});}return rewards;}

  function notifyQuestEvent(state,type,payload={}){if(!state||!state.player||!state.quests)return;const eventType=normalizeQuestObjectiveType(type);const activeEntries=Object.values(state.quests.active||{});if(!activeEntries.length)return;for(const entry of activeEntries){const quest=QUEST_INDEX.get(entry.questId);if(!quest)continue;const before=evaluateQuestProgress(state,quest,entry);let changed=false;quest.objectives.forEach((objective,index)=>{const objectiveState=entry.objectiveStates[index]||(entry.objectiveStates[index]=defaultQuestObjectiveState(objective));if(objective.type==="kill"&&eventType==="kill"){const defeatedMonsterId=normalizeQuestDataId(payload.monsterId);if(defeatedMonsterId===objective.monsterId){const beforeCount=Math.max(0,Math.floor(Number(objectiveState.current||0)||0));const delta=Math.max(1,Math.floor(Number(payload.count||1)||1));const afterCount=Math.min(objective.count,beforeCount+delta);if(afterCount!==beforeCount){objectiveState.current=afterCount;changed=true;}}}if(objective.type==="visit_tile"&&eventType==="visit_tile"){const areaId=normalizeQuestDataId(payload.areaId);const x=Math.floor(Number(payload.x||0)||0);const y=Math.floor(Number(payload.y||0)||0);if(areaId===objective.areaId&&x===objective.x&&y===objective.y&&!objectiveState.done){objectiveState.done=true;changed=true;}}if(objective.type==="talk"&&eventType==="talk"){const npcId=normalizeQuestDataId(payload.npcId);if(npcId===objective.npcId&&!objectiveState.done){objectiveState.done=true;changed=true;}}});if(!changed)continue;const after=evaluateQuestProgress(state,quest,entry);log(state,`Quest updated: ${quest.name}.`);if(!before.complete&&after.complete){const turnInNpc=NPC_INDEX.get(quest.turnInNpcId);const targetName=turnInNpc?turnInNpc.name:"the quest giver";log(state,`${quest.name} is ready to turn in with ${targetName}.`);toast(`Quest ready: ${quest.name}`,"good");}}}

  function acceptQuest(state,questId,npcId=null){if(!state||!state.player)return;const quest=getQuest(questId);const sourceNpcId=normalizeQuestDataId(npcId||quest.giverNpcId)||quest.giverNpcId;if(quest.giverNpcId!==sourceNpcId)return;if(!canAcceptQuest(state,quest))return;state.quests.active[quest.id]=createQuestEntry(quest);log(state,`Quest accepted: ${quest.name}. ${quest.summary || quest.description || ""}`.trim());toast(`Quest accepted: ${quest.name}`,"good");save(state);render();}

  function consumeQuestObjectiveItems(state,quest){const missing=[];for(const objective of quest.objectives){if(objective.type!=="obtain_item"||!objective.consumeOnTurnIn)continue;if(!hasItem(state.player,objective.itemId,objective.count)){let itemName=formatDamageTypeLabel(objective.itemId);try{itemName=getItem(objective.itemId).name;}catch(_){}missing.push(`${objective.count}x ${itemName}`);}}if(missing.length)return{ok:false,missing};for(const objective of quest.objectives){if(objective.type==="obtain_item"&&objective.consumeOnTurnIn){removeItem(state.player,objective.itemId,objective.count);}}return{ok:true,missing:[]};}

  function turnInQuest(state,questId,npcId=null){if(!state||!state.player)return;const quest=getQuest(questId);const entry=questEntry(state,quest.id);if(!entry)return;const turnInNpcId=normalizeQuestDataId(npcId||quest.turnInNpcId)||quest.turnInNpcId;if(turnInNpcId!==quest.turnInNpcId)return;const progress=evaluateQuestProgress(state,quest,entry);if(!progress.complete)return;const consumed=consumeQuestObjectiveItems(state,quest);if(!consumed.ok){log(state,`${quest.name} still needs: ${consumed.missing.join(", ")}.`);render();return;}const rewards=applyQuestRewards(state,quest);delete state.quests.active[quest.id];state.quests.completed[quest.id]={questId:quest.id,completedDay:Math.max(1,Number(state.world.day||1)),turnedInNpcId:quest.turnInNpcId,rewardSummary:rewards.slice()};const turnInNpc=NPC_INDEX.get(quest.turnInNpcId);log(state,`${turnInNpc ? turnInNpc.name : "The quest giver"} marks ${quest.name} complete.`);if(rewards.length)log(state,`Quest rewards: ${rewards.join(", ")}.`);toast(`Quest complete: ${quest.name}`,"good");save(state);render();}

  function talkToNpc(state,npcId){if(!state||!state.player)return;const npc=getNpc(npcId);const line=npc.greeting||npc.description||`${npc.name} nods at you.`;log(state,`${npc.name}: ${line}`);notifyQuestEvent(state,"talk",{npcId:npc.id});save(state);render();}

  function npcTooltipHtml(state,npcId){const npc=getNpc(npcId);const marker=questNpcMarker(state,npc.id);const offers=availableQuestOffersForNpc(state,npc.id);const ready=turnInReadyQuestsForNpc(state,npc.id);const progress=talkProgressQuestsForNpc(state,npc.id);const badges=[];if(marker)badges.push(`<span class="badge ${marker.emoji === "❓" ? "warn" : "good"}">${escapeHtml(marker.emoji)} ${escapeHtml(marker.label)}</span>`);if(offers.length)badges.push(`<span class="badge good">${offers.length} quest offer${offers.length === 1 ? "" : "s"}</span>`);if(ready.length)badges.push(`<span class="badge warn">${ready.length} ready to turn in</span>`);if(progress.length)badges.push(`<span class="badge warn">${progress.length} can progress here</span>`);return`
        <div style="font-weight:700; font-size:13px; margin-bottom:6px">${escapeHtml(`${npc.emoji} ${npc.name}`)}</div>
        <div class="trow"><div class="k">Role</div><div class="v">${escapeHtml(npc.role)}</div></div>
        <div class="trow"><div class="k">Resides</div><div class="v">${escapeHtml(npc.residence)}</div></div>
        <div class="small muted" style="margin-top:8px; line-height:1.45">${escapeHtml(npc.tooltip || npc.description || "A resident of Astaria.")}</div>
        ${badges.length ? `<div class="badgeWrap" style="margin-top:8px">${badges.join("")}</div>` : ``}
      `;}

  function renderQuestObjectiveHtml(objectiveProgress){return`
        <div class="questObjective ${objectiveProgress.complete ? "complete" : ""}">
          <div class="questObjectiveText">${escapeHtml(objectiveProgress.label)}</div>
          <div class="questObjectiveProgress">${escapeHtml(objectiveProgress.progressText)}</div>
        </div>
      `;}

  function renderQuestRewardsHtml(quest,rewardSummaryOverride=null){const rewards=questRewardSummaryLines(quest,rewardSummaryOverride);if(!rewards.length)return`<div class="small muted">No explicit rewards.</div>`;return`<div class="questRewardWrap">${rewards.map(reward => `<span class="badge">${escapeHtml(reward)}</span>`).join("")}</div>`;}

  function townNpcActionTargetForQuest(entry) {
    if(!entry)return null;
    if(entry.progress&&entry.progress.complete)return entry.quest.turnInNpcId;
    const talkObjective=entry.quest.objectives.find((objective, index)=>objective.type==="talk"&&!(entry.progress&&entry.progress.objectives&&entry.progress.objectives[index]&&entry.progress.objectives[index].complete));
    return talkObjective?talkObjective.npcId:null;
  }

  function formatDamageTypeLabel(type){const raw=String(type||"").trim();if(!raw)return"—";return raw.split(/[_-]/g).map(part=>part?(part.charAt(0).toUpperCase()+part.slice(1)):"").join(" ");}

  function formatPropertyLabel(prop){const raw=String(prop||"").trim();if(!raw)return"—";const lower=raw.toLowerCase();if(lower==="reach")return"Reach";if(lower==="two-hand")return"Two-hand";if(lower==="no-armor")return"No armor";if(lower==="ammo-arrow")return"Ammo (Arrow)";if(lower.startsWith("range:"))return`Range ${raw.split(":")[1] || ""}`.trim();if(lower.startsWith("versatile:"))return`Versatile (${String(raw.split(":")[1] || "").toUpperCase()})`;if(lower.startsWith("bundle:"))return`Bundle ×${raw.split(":")[1] || "1"}`;return formatDamageTypeLabel(raw.replace(/:/g," "));}

  function createDamageResistanceMap(seed={
  }) {
    const out={
    };
    for(const type of DAMAGE_TYPES) {
      const raw=Number(seed[type]||0);
      out[type]=Math.max(0, Number.isFinite(raw)?raw:0);
    }
    return out;
  }

  function normalizeTagId(tag) {
    return String(tag||"").trim().toLowerCase();
  }

  // ---------------------------------------------------------------------------
  // Status effects and combat math
  // ---------------------------------------------------------------------------
  function hasAbility(player, abilityId) {
    return hasAbilityUnlocked(player, abilityId)&&!abilityDisabledReason(player, abilityId);
  }

  function abilitySourceType(ability) {
    if(!ability)return"misc";
    if(ability.sourceType)return ability.sourceType;
    return ability.classId?"class":"misc";
  }

  function abilityTooltipDurationLabel(ability){if(!ability)return"";const candidates=[ability.summary,...(Array.isArray(ability.details)?ability.details:[])].filter(value=>typeof value==="string"&&value.trim());const matchers=[[/\bLasts\s+(\d+)\s+rounds?\b/i,m=>`${m[1]} rounds`],[/\bfor\s+(\d+)\s+rounds?\b/i,m=>`${m[1]} rounds`],[/\bfor\s+(\d+)\s+turns?\b/i,m=>`${m[1]} turns`],[/\bfor\s+(\d+)\s+movements?\b/i,m=>`${m[1]} movements`],[/\bfor\s+(\d+)\s+moves?\b/i,m=>`${m[1]} moves`]];for(const source of candidates){for(const[pattern,formatter]of matchers){const match=source.match(pattern);if(match)return formatter(match);}}return"";}

  function statusEffectTooltipHtml(effect){const rows=[];const row=(k,v)=>`<div class="trow"><div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(v)}</div></div>`;const durationLabel=effect.duration==null?"Permanent":`${effect.duration}/${effect.maxDuration ?? effect.duration} ${effect.durationUnit || (effect.durationMode === "move" ? "moves" : "turns")}`;rows.push(row("Duration",durationLabel));if(Array.isArray(effect.tags)&&effect.tags.length)rows.push(row("Tags",effect.tags.join(", ")));if(Number(effect.modifiers&&effect.modifiers.acModifier||0)!==0)rows.push(row("AC",fmtSigned(Number(effect.modifiers.acModifier||0))));if(Number(effect.modifiers&&effect.modifiers.attackRollModifier||0)!==0)rows.push(row("Attack",fmtSigned(Number(effect.modifiers.attackRollModifier||0))));if(Number(effect.ongoingDamage||0)>0)rows.push(row("Per turn",`${effect.ongoingDamage} ${formatDamageTypeLabel(effect.ongoingDamageType || "damage")}`));if(Array.isArray(effect.disabledAbilityTags)&&effect.disabledAbilityTags.length)rows.push(row("Disables",effect.disabledAbilityTags.map(formatDamageTypeLabel).join(", ")));rows.push(row("Ends on down",effect.expiresOnDown===false?"No":"Yes"));return`
        <div style="font-weight:700; font-size:13px; margin-bottom:6px">${escapeHtml(effect.name || effect.id || "Effect")}</div>
        <div class="small muted" style="margin-bottom:8px; line-height:1.45">${escapeHtml(effect.description || "")}</div>
        ${rows.join("")}
      `;}

  function normalizeSaveId(saveId) {
    const raw=String(saveId||"").trim().toLowerCase();
    if(raw==="fortitude"||raw==="fort")return"fort";
    if(raw==="reflex"||raw==="ref")return"reflex";
    if(raw==="will")return"will";
    return raw;
  }

  function saveLabel(saveId) {
    const key=normalizeSaveId(saveId);
    if(key==="fort")return"Fortitude";
    if(key==="reflex")return"Reflex";
    return"Will";
  }

  function creatureSaveDc(creature, saveId) {
    const key=normalizeSaveId(saveId);
    const entries=Array.isArray(creature&&creature.status)?creature.status:[];
    const found=entries.find(entry=>normalizeSaveId(entry&&(entry.id||entry.label||entry.saveId||""))===key);
    if(found&&Number.isFinite(Number(found.dc)))return Number(found.dc);
    return 12+(Math.max(0, Number(creature&&creature.level||0))*2);
  }

  function hasStatusEffect(entity, statusId) {
    return Array.isArray(entity&&entity.statusEffects)&&entity.statusEffects.some(effect=>(effect.templateId||effect.id)===statusId);
  }

  function findStatusEffect(entity, statusId) {
    return Array.isArray(entity&&entity.statusEffects)?entity.statusEffects.find(effect=>(effect.templateId||effect.id)===statusId)||null:null;
  }

  function removeStatusEffect(entity, statusId) {
    if(!entity||!Array.isArray(entity.statusEffects))return null;
    const idx=entity.statusEffects.findIndex(effect=>(effect.templateId||effect.id)===statusId);
    if(idx<0)return null;
    const[removed]=entity.statusEffects.splice(idx, 1);
    return removed||null;
  }

  function createStatusEffect(templateId, overrides={
  }) {
    const template=STATUS_EFFECT_TEMPLATES[templateId];
    if(!template)throw new Error("Unknown status effect: "+templateId);
    const baseModifiers=template.modifiers||{
    };
    const overrideModifiers=overrides.modifiers||{
    };
    return normalizeStatusEffect({
      ...template, ...overrides, id:overrides.id||template.id, templateId:template.id, name:overrides.name||template.name, description:overrides.description||template.description, duration:overrides.duration==null?template.duration:overrides.duration, maxDuration:overrides.maxDuration==null?(overrides.duration==null?template.duration:overrides.duration):overrides.maxDuration, durationMode:overrides.durationMode||template.durationMode||"turn", durationUnit:overrides.durationUnit||template.durationUnit||((overrides.durationMode||template.durationMode)==="move"?"movements":"turns"), tags:Array.isArray(overrides.tags)?[...overrides.tags]:[...(template.tags||[])], disabledAbilityTags:Array.isArray(overrides.disabledAbilityTags)?[...overrides.disabledAbilityTags]:[...(template.disabledAbilityTags||[])], ongoingDamage:overrides.ongoingDamage==null?Number(template.ongoingDamage||0):Number(overrides.ongoingDamage||0), ongoingDamageType:overrides.ongoingDamageType||template.ongoingDamageType||"", consumeOnAttack:overrides.consumeOnAttack!==undefined?!!overrides.consumeOnAttack:!!template.consumeOnAttack, modifiers:{
        ...baseModifiers, ...overrideModifiers, resistances:{
          ...(baseModifiers.resistances||{
          }), ...(overrideModifiers.resistances||{
          })
        }
      }, justApplied:overrides.justApplied!==undefined?overrides.justApplied:(template.justApplied!==undefined?template.justApplied:true)
    });
  }

  function createBleedStatusEffect(x,duration=5){const dmg=Math.max(0,Number(x||0));const dur=clamp(Number(duration||5),0,5);return createStatusEffect("bleed",{name:`Bleed ${dmg}`,description:`Take ${dmg} necrotic damage at the end of each turn for up to ${dur} turns. Yes, it follows you into exploration.`,duration:dur,maxDuration:dur,ongoingDamage:dmg,ongoingDamageType:"necrotic",justApplied:false});}

  function migrateLegacyStatusEffect(effect) {
    const rawEffect=effect||{
    };
    const rawStatusId=rawEffect.templateId||rawEffect.id;
    if(rawStatusId==="brace_for_impact") {
      return {
        ...rawEffect, id:"tree_stance", templateId:"tree_stance", name:"Tree Stance", description:STATUS_EFFECT_TEMPLATES.tree_stance.description, tags:["Buff", "Stance"], modifiers:{
          ...(rawEffect.modifiers||{
          }), resistances:{
            bludgeoning:3, piercing:3, slashing:3, ...((rawEffect.modifiers||{
            }).resistances||{
            })
          }
        }
      };
    }
    if(rawStatusId==="marked_prey") {
      return {
        ...rawEffect, name:STATUS_EFFECT_TEMPLATES.marked_prey.name, description:STATUS_EFFECT_TEMPLATES.marked_prey.description, tags:STATUS_EFFECT_TEMPLATES.marked_prey.tags
      };
    }
    return rawEffect;
  }

  function effectAdvancesOnAction(effect, {
    isMovement=false
  }
  ={
  }) {
    if(!effect||effect.duration==null)return false;
    if(effect.durationMode==="move")return!!isMovement;
    return true;
  }

  function advanceStatusEffectsAfterAction(state, {
    excludeTemplateIds=[], isMovement=false
  }
  ={
  }) {
    advanceEntityStatusEffects(state, state.player, {
      excludeTemplateIds, isMovement
    });
  }

  function clearTimedStatusEffectsOnDown(state){const player=state.player;if(!player||!Array.isArray(player.statusEffects)||!player.statusEffects.length)return;const removed=[];player.statusEffects=player.statusEffects.filter(effect=>{if(effect.duration!=null&&effect.expiresOnDown!==false){removed.push(effect);return false;}return true;});for(const effect of removed){log(state,`${effect.name} ends because you were reduced to 0 HP.`);}}

  function totalDamageResistances(entity) {
    const total=createDamageResistanceMap(entity&&entity.damageResistance||{
    });
    for(const effect of entity&&entity.statusEffects||[]) {
      const res=effect.modifiers&&effect.modifiers.resistances?effect.modifiers.resistances:null;
      if(!res)continue;
      for(const type of DAMAGE_TYPES) {
        total[type]+=Math.max(0, Number(res[type]||0));
      }
    }
    return total;
  }

  function damageResistanceValue(entity, damageType) {
    const key=String(damageType||"").trim().toLowerCase();
    const total=totalDamageResistances(entity);
    return Math.max(0, Number(total[key]||0));
  }

  function statusModifierTotal(entity, key) {
    return(entity&&entity.statusEffects||[]).reduce((sum, effect)=> {
      const raw=Number(effect&&effect.modifiers?effect.modifiers[key]||0:0);
      return sum+(Number.isFinite(raw)?raw:0);
    }, 0);
  }

  function renderStatusEffectBadges(entity,emptyText="No active effects",owner="player"){const effects=Array.isArray(entity&&entity.statusEffects)?entity.statusEffects:[];if(!effects.length)return`<span class="small muted">${escapeHtml(emptyText)}</span>`;return`<div class="badgeWrap">${effects.map(effect => `<span class="badge statusBadge" data-status-owner="${escapeHtml(owner)}" data-status-effect="${escapeHtml(effect.templateId || effect.id)}">${escapeHtml(effect.name)}${effect.duration != null ? ` (${effect.duration})` : ""}</span>`).join("")}</div>`;}

  function renderResistanceBadgeList(player,emptyText="No active resistances"){const total=totalDamageResistances(player);const parts=DAMAGE_TYPES.filter(type=>Number(total[type]||0)>0).map(type=>`<span class="badge">${escapeHtml(formatDamageTypeLabel(type))} ${escapeHtml(String(total[type]))}</span>`);if(!parts.length)return`<span class="small muted">${escapeHtml(emptyText)}</span>`;return`<div class="badgeWrap">${parts.join("")}</div>`;}

  function dexCapFromArmor(armor) {
    if(!armor)return 99;
    return typeof armor.dexCap==="number"?armor.dexCap:99;
  }

  function equippedCarryBonus(player, equipment=player.equipment) {
    let bonus=0;
    for(const iid of Object.values(equipment||{
    })) {
      if(!iid||!ITEM_INDEX.has(iid))continue;
      const item=getItem(iid);
      bonus+=Math.max(0, Number(item.carryBonus||0));
    }
    return bonus;
  }

  function effectiveEnemyAC(enemy) {
    return Math.max(0, Number(enemy&&enemy.ac||0)+statusModifierTotal(enemy, "acModifier"));
  }

  function effectiveEnemyAttackBonus(enemy) {
    return Number(enemy&&enemy.attackBonus||0)+statusModifierTotal(enemy, "attackRollModifier");
  }

  function calcInventorySlots(player, {
    inventory=null, equipment=null
  }
  ={
  }) {
    const inv=Array.isArray(inventory)?inventory:(Array.isArray(player.inventory)?player.inventory:[]);
    const eq=equipment||player.equipment||{
    };
    const str=player.stats.STR;
    const baseMax=Math.max(1, 2*Math.max(0, Math.floor(str)));
    const bonus=equippedCarryBonus(player, eq)+(hasAbility(player, "skill_athletics_pack_mule")?10:0);
    const max=Math.max(1, baseMax+bonus);
    const used=inv.reduce((a, e)=>a+Math.max(0, Number(e.qty||0)), 0);
    return {
      used, max, baseMax, bonus
    };
  }

  function skillTotal(player, skillId) {
    const sk=SKILLS.find(s=>s.id===skillId);
    if(!sk)return 0;
    const ability=player.stats[sk.stat];
    const base=statMod(ability);
    const prof=player.skillProficiency[skillId]||0;
    return base+prof;
  }

  function saveTotal(player, saveId) {
    let abilityScore;
    if(saveId==="fort")abilityScore=player.stats.CON;
    else if(saveId==="reflex")abilityScore=player.stats.DEX;
    else abilityScore=player.stats.WIS;
    const base=statMod(abilityScore);
    return base+saveTrainingValue(player, saveId);
  }

  function upgradeDamageExprMinimum(expr,minSides){const m=String(expr||"").trim().match(/^(\d+)d(\d+)([+-]\d+)?$/i);if(!m)return expr;return`${m[1]}d${Math.max(Number(m[2]), Number(minSides || 0))}${m[3] || ""}`;}

  function hasWeaponProperty(weapon, propertyId) {
    return!!(weapon&&Array.isArray(weapon.properties)&&weapon.properties.includes(propertyId));
  }

  function attackProfile(player) {
    const weaponId=player.equipment.mainHand;
    const weapon=weaponId?getItem(weaponId):null;
    return buildAttackProfile(player, weapon, {
      fallbackUnarmed:true, slotLabel:"main hand"
    });
  }

  function hasEnemyTag(enemy, tag) {
    const needle=String(tag||"").trim().toLowerCase();
    return Array.isArray(enemy&&enemy.traits)&&enemy.traits.some(trait=>String(trait||"").trim().toLowerCase()===needle);
  }

  function consumeAmmoForAttack(state,attack){if(!attack||!attack.needsAmmo)return;const ammoItem=attack.ammoItemId?getItem(attack.ammoItemId):null;const ammoName=ammoItem?ammoItem.name.toLowerCase():"ammo";const sourceName=attack.sourceWeapon?attack.sourceWeapon.name:attack.weaponName;if(attack.outOfAmmo){log(state,`${sourceName} is out of ${ammoName}. This attack is treated as an unarmed strike.`);return;}removeItem(state.player,attack.ammoItemId,1);const remaining=itemQuantity(state.player,attack.ammoItemId);log(state,`${sourceName} uses 1 ${ammoName.replace(/s$/, "")}. ${remaining} ${ammoName} remaining.`);}

  function shuffleCopy(items) {
    const out=Array.isArray(items)?items.slice():[];
    for(let i=out.length-1;i>0;i--) {
      const j=Math.floor(Math.random()*(i+1));
      [out[i], out[j]]=[out[j], out[i]];
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Random events and world exploration
  // ---------------------------------------------------------------------------
  function getRandomEventTemplate(eventId) {
    const found=RANDOM_EVENT_TEMPLATES.find(entry=>entry.id===eventId);
    if(!found)throw new Error("Unknown random event: "+eventId);
    return found;
  }

  function findRandomEventEntry(state, instanceId) {
    const randomEvents=state&&state.world&&state.world.randomEvents;
    const dailyPool=randomEvents&&Array.isArray(randomEvents.dailyPool)?randomEvents.dailyPool:[];
    return dailyPool.find(entry=>entry&&entry.instanceId===instanceId)||null;
  }

  function ensureRandomEventState(state,{regenerateIfMissing=true}={}){state.world=state.world||{};state.world.randomEvents=state.world.randomEvents&&typeof state.world.randomEvents==="object"?state.world.randomEvents:{};const randomEvents=state.world.randomEvents;randomEvents.minimumDay=Math.max(1,Number(randomEvents.minimumDay||RANDOM_EVENT_DAY_REQUIREMENT_DEFAULT));randomEvents.day=Math.max(0,Number(randomEvents.day||0));randomEvents.dailyPool=Array.isArray(randomEvents.dailyPool)?randomEvents.dailyPool.filter(entry=>entry&&typeof entry==="object").map((entry,index)=>{const fallbackTemplateId=RANDOM_EVENT_TEMPLATES[index%RANDOM_EVENT_TEMPLATES.length].id;const templateId=RANDOM_EVENT_TEMPLATES.some(template=>template.id===entry.templateId)?entry.templateId:fallbackTemplateId;return{instanceId:String(entry.instanceId||`day${state.world.day || 1}_${index}_${templateId}`),templateId,resolved:!!entry.resolved};}):[];if(regenerateIfMissing&&(randomEvents.day!==state.world.day||randomEvents.dailyPool.length===0)){regenerateDailyRandomEvents(state);}return randomEvents;}

  function regenerateDailyRandomEvents(state){const randomEvents=ensureRandomEventState(state,{regenerateIfMissing:false});const chosen=shuffleCopy(RANDOM_EVENT_TEMPLATES.map(entry=>entry.id)).slice(0,Math.min(RANDOM_EVENT_DAILY_COUNT,RANDOM_EVENT_TEMPLATES.length));randomEvents.day=Math.max(1,Number(state.world.day||1));randomEvents.dailyPool=chosen.map((templateId,index)=>({instanceId:`day${randomEvents.day}_${index}_${templateId}`,templateId,resolved:false}));if(state.ui)state.ui.randomEventPrompt=null;return randomEvents.dailyPool.length;}

  function remainingRandomEventsForDay(state) {
    const randomEvents=ensureRandomEventState(state);
    return randomEvents.dailyPool.filter(entry=>!entry.resolved).length;
  }

  function getActiveRandomEvent(state) {
    if(!state||!state.ui||!state.ui.randomEventPrompt||!state.ui.randomEventPrompt.instanceId)return null;
    const entry=findRandomEventEntry(state, state.ui.randomEventPrompt.instanceId);
    if(!entry||entry.resolved) {
      state.ui.randomEventPrompt=null;
      return null;
    }
    return {
      entry, template:getRandomEventTemplate(entry.templateId)
    };
  }

  function randomEventDc(state, template) {
    const area=getArea(state.world.areaId);
    return Math.max(5, Number(template.dcBase||10)+(Math.max(0, Number(area.level||0))*Math.max(0, Number(template.dcPerAreaLevel||0))));
  }

  function canRandomEventsAppear(state) {
    const randomEvents=ensureRandomEventState(state);
    return Math.max(1, Number(state.world.day||1))>=Math.max(1, Number(randomEvents.minimumDay||RANDOM_EVENT_DAY_REQUIREMENT_DEFAULT));
  }

  function hasBlockingCenterOverlay(state) {
    return!!(state&&state.ui&&(state.ui.combatNotice||state.ui.randomEventPrompt));
  }

  function canTriggerRandomEventNow(state) {
    if(!state||!state.player||state.combat)return false;
    if(hasBlockingCenterOverlay(state))return false;
    const area=getArea(state.world.areaId);
    if(!area.map)return false;
    if(!canRandomEventsAppear(state))return false;
    const tile=currentTile(state);
    if(!tile||!tile.revealed||tile.home)return false;
    if(tile.type!=="empty"&&!tile.resolved)return false;
    return remainingRandomEventsForDay(state)>0;
  }

  function maybeTriggerRandomEvent(state){if(!canTriggerRandomEventNow(state))return false;if(Math.random()>RANDOM_EVENT_TRIGGER_CHANCE)return false;const randomEvents=ensureRandomEventState(state);const candidates=randomEvents.dailyPool.filter(entry=>!entry.resolved);if(!candidates.length)return false;const entry=candidates[rollInt(0,candidates.length-1)];const template=getRandomEventTemplate(entry.templateId);state.ui.randomEventPrompt={instanceId:entry.instanceId};log(state,`A random event appears: ${template.title}.`);return true;}

  function applyRandomEventRewards(state,template){const rewards=[];if(Array.isArray(template.rewardCoins)&&template.rewardCoins.length>=2){const coins=rollInt(Number(template.rewardCoins[0]||0),Number(template.rewardCoins[1]||0));if(coins>0){addCoins(state,coins);rewards.push(formatCoins(coins));}}if(Array.isArray(template.rewardItems)){for(const reward of template.rewardItems){if(!reward||!reward.id)continue;const chance=reward.chance==null?1:Number(reward.chance||0);if(Math.random()>chance)continue;const qtyRange=Array.isArray(reward.qty)?reward.qty:[1,1];const qty=rollInt(Number(qtyRange[0]||1),Number(qtyRange[1]||qtyRange[0]||1));if(qty<=0)continue;addItem(state.player,reward.id,qty);rewards.push(`${qty}× ${getItem(reward.id).name}`);}}return rewards;}

  function resolveRandomEventAttempt(state){const active=getActiveRandomEvent(state);if(!active)return;const{entry,template}=active;const dc=randomEventDc(state,template);const rollData=rollD20Detailed("skill_die",{label:template.skill||"Skill"});const skillParts=skillCheckSourceParts(state.player,template.skill);const bonus=skillTotal(state.player,template.skill);const derivedBonus=sumRollParts(skillParts);const miscPart=createRollModifierPart(bonus-derivedBonus,"status_check",template.skill||"Skill",(template.skill||"Skill")+" modifier");const checkParts=[...rollData.parts,...cloneRollParts(skillParts)];if(miscPart)checkParts.push(miscPart);const roll=rollData.total;const total=sumRollParts(checkParts);const checkGroup=buildLogRollGroup({label:`${template.title} ${template.skill} check`,parts:checkParts,total,targetLabel:"DC",targetValue:dc,outcome:(roll===20||total>=dc)?"success":"failure"});entry.resolved=true;state.ui.randomEventPrompt=null;if(roll===20||total>=dc){const rewards=applyRandomEventRewards(state,template);const rewardText=rewards.length?rewards.join(", "):"no material reward";log(state,`${template.title}: success. ${template.successText} Rewards: ${rewardText}.`,{rollGroups:[checkGroup]});toast(`${template.title} cleared successfully.`,"good");}else{const damageType=template.failDamageType||"bludgeoning";const damageExpr=/^\d+d\d+([+-]\d+)?$/i.test(String(template.failDamage||"").trim())?String(template.failDamage).trim():"1d4";const damageRoll=rollDiceDetailed(damageExpr,"random_event_fail_damage",{label:template.title});const resistance=damageResistanceValue(state.player,damageType);const reduced=Math.min(damageRoll.total,resistance);const damageParts=cloneRollParts(damageRoll.parts);const resistPart=createRollModifierPart(-reduced,"damage_resistance","Resistance",`Your ${damageType} resistance reduced the damage.`);if(resistPart)damageParts.push(resistPart);const damage=Math.max(0,damageRoll.total-reduced);dealDamageToPlayer(state,damage,damageType,{sourceLabel:"",applyResistance:false});log(state,`${template.title}: failure. ${template.failureText} You take ${damage} ${damageType} damage.`,{rollGroups:[checkGroup,buildLogRollGroup({label:`${template.title} damage`,parts:damageParts,total:damage})]});toast(`${template.title} check failed.`,"bad");}save(state);render();}

  function ignoreRandomEvent(state){const active=getActiveRandomEvent(state);if(!active)return;active.entry.resolved=true;state.ui.randomEventPrompt=null;log(state,`${active.template.title}: you leave it alone and move on.`);save(state);render();}

  function setCombatNotice(state, {
    kind="neutral", title="Notice", summary="", sectionTitle="Outcome", items=[]
  }
  ={
  }) {
    state.ui.combatNotice={
      kind, title, summary, sectionTitle, items:Array.isArray(items)?items:[]
    };
  }

  function dismissCombatNotice(state) {
    if(!state||!state.ui||!state.ui.combatNotice)return;
    state.ui.combatNotice=null;
    save(state);
    render();
  }

  function getArea(areaId) {
    const a=AREAS.find(x=>x.id===areaId);
    if(!a)throw new Error("Unknown area: "+areaId);
    return a;
  }

  function defaultAreaUnlocks() {
    return {
      woods:true
    };
  }

  function isAreaUnlocked(state, areaId) {
    if(areaId==="town"||areaId==="woods")return true;
    return!!(state&&state.world&&state.world.areaUnlocks&&state.world.areaUnlocks[areaId]);
  }

  function unlockArea(state, areaId) {
    if(!state||!state.world||areaId==="town"||areaId==="woods")return;
    if(!state.world.areaUnlocks||typeof state.world.areaUnlocks!=="object")state.world.areaUnlocks=defaultAreaUnlocks();
    state.world.areaUnlocks[areaId]=true;
  }

  function visibleTravelAreas(state) {
    return AREAS.filter(area=>area.id===state.world.areaId||isAreaUnlocked(state, area.id));
  }

  function travelAreaLabel(area){const meta=[`Lv ${area.level}`];if(area.map&&Number(area.travelCostCp)===0)meta.push("Free");return`${area.name} (${meta.join(" • ")})`;}

  function dungeonLinksForArea(areaId) {
    return DUNGEON_LINKS.filter(link=>link.sourceAreaId===areaId);
  }

  function dungeonEntranceLinkForArea(areaId) {
    return DUNGEON_LINKS.find(link=>link.targetAreaId===areaId)||null;
  }

  const STATIC_MAP_TERRAIN_BY_CHAR=Object.freeze({
    F:"forest", P:"plains", D:"dirt", W:"water", M:"mountain"
  });

  const DEFAULT_DYNAMIC_SPAWN_RATES=Object.freeze({
    monster:0.13, resource:0.15, treasure:0.04
  });

  function hashString32(input) {
    let hash=2166136261>>>0;
    const text=String(input||"");
    for(let i=0;i<text.length;i++) {
      hash^=text.charCodeAt(i);
      hash=Math.imul(hash, 16777619)>>>0;
    }
    return hash>>>0;
  }

  function areaTileSeed(areaState, x, y) {
    const seed=Number(areaState&&areaState.seed||0)>>>0;
    return(((seed^(((x+1)*374761393)>>>0))>>>0)^(((y+1)*668265263)>>>0))>>>0;
  }

  function randomTerrainForTile(rng) {
    const tr=rng();
    if(tr<0.16)return"water";
    if(tr<0.25)return"mountain";
    return(tr<0.58)?"forest":(tr<0.8)?"plains":"dirt";
  }

  function parseStaticTerrainRows(areaDef) {
    const rows=Array.isArray(areaDef&&areaDef.terrainRows)?areaDef.terrainRows:null;
    if(!rows||!rows.length)return null;
    const size=Math.max(1, Number(areaDef.size||rows.length)||rows.length);
    if(rows.length!==size)return null;
    const grid=[];
    for(const rowText of rows) {
      if(typeof rowText!=="string"||rowText.length!==size)return null;
      const row=[];
      for(const rawChar of rowText) {
        const terrain=STATIC_MAP_TERRAIN_BY_CHAR[String(rawChar||"").toUpperCase()];
        if(!terrain)return null;
        row.push(terrain);
      }
      grid.push(row);
    }
    return grid;
  }

  function areaTerrainGrid(areaState, areaDef) {
    const staticGrid=parseStaticTerrainRows(areaDef);
    if(staticGrid)return staticGrid;
    const size=Math.max(1, Number(areaDef&&areaDef.size||areaState&&areaState.size||9)||9);
    const grid=[];
    for(let y=0;y<size;y++) {
      const row=[];
      for(let x=0;x<size;x++) {
        const rng=mulberry32(areaTileSeed(areaState, x, y));
        row.push(randomTerrainForTile(rng));
      }
      grid.push(row);
    }
    return grid;
  }

  function areaLayoutSignature(areaState,areaDef){const rows=Array.isArray(areaDef&&areaDef.terrainRows)?areaDef.terrainRows:null;if(rows&&rows.length){return`static:${rows.length}:${hashString32(rows.join("|"))}`;}const size=Math.max(1,Number(areaDef&&areaDef.size||areaState&&areaState.size||9)||9);const seed=Number(areaState&&areaState.seed||0)>>>0;return`random:${size}:${seed}`;}

  function createBaseAreaTile(terrain, existingTile=null) {
    const existing=existingTile?cloneAreaTile(existingTile):null;
    return {
      revealed:!!(existing&&existing.revealed), resolved:false, type:"empty", content:null, terrain:terrain||(existing&&existing.terrain)||"plains", home:false, arrivalX:null, arrivalY:null, linkedDungeonAreaId:null
    };
  }

  function cloneAreaTile(tile) {
    const cloned=tile&&typeof tile==="object"?{
      ...tile
    }
    :{
      revealed:false, resolved:false, type:"empty", content:null, terrain:"plains"
    };
    cloned.revealed=!!cloned.revealed;
    cloned.resolved=!!cloned.resolved;
    cloned.type=cloned.type||"empty";
    cloned.content=cloned.content==null?null:cloned.content;
    cloned.terrain=cloned.terrain||"plains";
    cloned.home=!!cloned.home;
    cloned.arrivalX=Number.isFinite(Number(cloned.arrivalX))?Number(cloned.arrivalX):null;
    cloned.arrivalY=Number.isFinite(Number(cloned.arrivalY))?Number(cloned.arrivalY):null;
    cloned.linkedDungeonAreaId=cloned.linkedDungeonAreaId||null;
    return cloned;
  }

  function rebuildAreaTerrain(areaState, areaDef) {
    const oldTiles=Array.isArray(areaState&&areaState.tiles)?areaState.tiles:[];
    const terrainGrid=areaTerrainGrid(areaState, areaDef);
    const size=terrainGrid.length;
    const newTiles=[];
    for(let y=0;y<size;y++) {
      const row=[];
      for(let x=0;x<size;x++) {
        const existingTile=oldTiles[y]&&oldTiles[y][x]?oldTiles[y][x]:null;
        row.push(createBaseAreaTile(terrainGrid[y][x], existingTile));
      }
      newTiles.push(row);
    }
    areaState.tiles=newTiles;
    areaState.size=size;
    areaState.layoutSignature=areaLayoutSignature(areaState, areaDef);
    areaState.dynamicNodesInitialized=false;
  }

  function findNearestPassableTile(areaState, startX, startY) {
    if(!areaState||!Array.isArray(areaState.tiles))return null;
    let best=null;
    for(let y=0;y<areaState.tiles.length;y++) {
      const row=Array.isArray(areaState.tiles[y])?areaState.tiles[y]:[];
      for(let x=0;x<row.length;x++) {
        const tile=row[x];
        if(!tile||isImpassableTerrain(tile.terrain))continue;
        const distance=Math.abs(x-startX)+Math.abs(y-startY);
        if(!best||distance<best.distance) {
          best={
            x, y, distance
          };
        }
      }
    }
    return best;
  }

  function ensureAreaPlayerPosition(areaState, areaDef) {
    if(!areaState||!Array.isArray(areaState.tiles)||!areaState.tiles.length)return;
    const size=Math.max(1, Number(areaState.size||areaDef.size||areaState.tiles.length||9)||9);
    const fallbackX=Math.floor(size/2);
    const fallbackY=Math.floor(size/2);
    let px=clamp(Number.isFinite(Number(areaState.px))?Number(areaState.px):fallbackX, 0, size-1);
    let py=clamp(Number.isFinite(Number(areaState.py))?Number(areaState.py):fallbackY, 0, size-1);
    const currentTile=areaState.tiles[py]&&areaState.tiles[py][px]?areaState.tiles[py][px]:null;
    if(!currentTile||isImpassableTerrain(currentTile.terrain)) {
      const nearest=findNearestPassableTile(areaState, px, py)||findNearestPassableTile(areaState, fallbackX, fallbackY);
      if(nearest) {
        px=nearest.x;
        py=nearest.y;
      } else {
        px=fallbackX;
        py=fallbackY;
      }
    }
    areaState.px=px;
    areaState.py=py;
    const standingTile=areaState.tiles[py]&&areaState.tiles[py][px]?areaState.tiles[py][px]:null;
    if(standingTile) {
      standingTile.revealed=true;
      if(standingTile.home)standingTile.resolved=true;
    }
  }

  function applySpecialTiles(areaState, areaDef) {
    if(!areaState||!Array.isArray(areaState.tiles))return;
    const size=Math.max(1, Number(areaState.size||areaDef.size||9)||9);
    for(let y=0;y<size;y++) {
      if(!areaState.tiles[y])areaState.tiles[y]=[];
      for(let x=0;x<size;x++) {
        if(!areaState.tiles[y][x])areaState.tiles[y][x]=createBaseAreaTile("plains");
        const tile=areaState.tiles[y][x];
        tile.revealed=!!tile.revealed;
        tile.resolved=!!tile.resolved;
        tile.type=tile.type||"empty";
        tile.content=tile.content==null?null:tile.content;
        tile.home=false;
        tile.arrivalX=null;
        tile.arrivalY=null;
        tile.linkedDungeonAreaId=null;
        if(!tile.terrain)tile.terrain="plains";
        if(tile.type==="dungeon") {
          tile.type="empty";
          tile.content=null;
          tile.resolved=false;
        }
      }
    }
    const hx=Math.floor(size/2);
    const hy=Math.floor(size/2);
    const homeTile=areaState.tiles[hy][hx];
    const entranceLink=dungeonEntranceLinkForArea(areaDef.id);
    if(!homeTile.terrain||isImpassableTerrain(homeTile.terrain))homeTile.terrain="dirt";
    homeTile.home=true;
    homeTile.type=entranceLink?"dungeon":"empty";
    homeTile.content=entranceLink?entranceLink.sourceAreaId:null;
    homeTile.arrivalX=entranceLink?entranceLink.x:null;
    homeTile.arrivalY=entranceLink?entranceLink.y:null;
    homeTile.linkedDungeonAreaId=entranceLink?areaDef.id:null;
    homeTile.resolved=true;
    homeTile.revealed=true;
    for(const link of dungeonLinksForArea(areaDef.id)) {
      if(link.x<0||link.y<0||link.x>=size||link.y>=size)continue;
      const tile=areaState.tiles[link.y][link.x];
      tile.home=false;
      tile.type="dungeon";
      tile.content=link.targetAreaId;
      tile.arrivalX=null;
      tile.arrivalY=null;
      tile.linkedDungeonAreaId=link.targetAreaId;
      tile.resolved=false;
      if(link.terrain)tile.terrain=link.terrain;
      if(!tile.terrain||isImpassableTerrain(tile.terrain))tile.terrain="dirt";
    }
  }

  function dynamicSpawnCandidates(areaState) {
    const out=[];
    if(!areaState||!Array.isArray(areaState.tiles))return out;
    for(let y=0;y<areaState.tiles.length;y++) {
      const row=Array.isArray(areaState.tiles[y])?areaState.tiles[y]:[];
      for(let x=0;x<row.length;x++) {
        const tile=row[x];
        if(!tile)continue;
        if(tile.home||tile.type==="dungeon")continue;
        if(x===areaState.px&&y===areaState.py)continue;
        if(isImpassableTerrain(tile.terrain))continue;
        out.push({
          x, y
        });
      }
    }
    return out;
  }

  function resolveDynamicSpawnCount(poolEnabled, explicitCount, explicitRate, eligibleCount, fallbackRate) {
    if(!poolEnabled||eligibleCount<=0)return 0;
    const countValue=Number(explicitCount);
    if(Number.isFinite(countValue)&&countValue>=0) {
      return Math.min(eligibleCount, Math.floor(countValue));
    }
    const rateValue=Number(explicitRate);
    const rate=Number.isFinite(rateValue)?clamp(rateValue, 0, 1):fallbackRate;
    return Math.min(eligibleCount, Math.max(1, Math.round(eligibleCount*rate)));
  }

  function clearAreaDynamicNodes(areaState) {
    if(!areaState||!Array.isArray(areaState.tiles))return;
    for(let y=0;y<areaState.tiles.length;y++) {
      const row=Array.isArray(areaState.tiles[y])?areaState.tiles[y]:[];
      for(let x=0;x<row.length;x++) {
        const tile=row[x];
        if(!tile)continue;
        if(tile.home||tile.type==="dungeon")continue;
        tile.type="empty";
        tile.content=null;
        tile.resolved=false;
      }
    }
  }

  function repopulateAreaDynamicNodes(areaState, areaDef) {
    if(!areaState||!Array.isArray(areaState.tiles))return {
      monsters:0, resources:0, treasures:0
    };
    clearAreaDynamicNodes(areaState);
    const profile=areaDef&&typeof areaDef.spawnProfile==="object"?areaDef.spawnProfile:{
    };
    const candidates=shuffleCopy(dynamicSpawnCandidates(areaState));
    const eligibleCount=candidates.length;
    const summary={
      monsters:0, resources:0, treasures:0
    };
    let cursor=0;
    const monsterCount=resolveDynamicSpawnCount(Array.isArray(areaDef.encounterPool)&&areaDef.encounterPool.length>0, profile.monsterCount, profile.monsterRate, eligibleCount, DEFAULT_DYNAMIC_SPAWN_RATES.monster);
    const resourceCount=resolveDynamicSpawnCount(Array.isArray(areaDef.resourcePool)&&areaDef.resourcePool.length>0, profile.resourceCount, profile.resourceRate, Math.max(0, eligibleCount-monsterCount), DEFAULT_DYNAMIC_SPAWN_RATES.resource);
    const treasureCount=resolveDynamicSpawnCount(Array.isArray(areaDef.treasureRange)&&areaDef.treasureRange.length>=2, profile.treasureCount, profile.treasureRate, Math.max(0, eligibleCount-monsterCount-resourceCount), DEFAULT_DYNAMIC_SPAWN_RATES.treasure);
    const assignTiles=(count, assigner)=> {
      let assigned=0;
      for(let i=0;i<count&&cursor<candidates.length;i++, cursor++) {
        const pos=candidates[cursor];
        const tile=areaState.tiles[pos.y][pos.x];
        if(!tile)continue;
        assigner(tile);
        assigned++;
      }
      return assigned;
    };
    summary.monsters=assignTiles(monsterCount, tile=> {
      tile.type="monster";
      tile.content=areaDef.encounterPool[rollInt(0, areaDef.encounterPool.length-1)];
      tile.resolved=false;
    });
    summary.resources=assignTiles(resourceCount, tile=> {
      tile.type="resource";
      tile.content=areaDef.resourcePool[rollInt(0, areaDef.resourcePool.length-1)];
      tile.resolved=false;
    });
    summary.treasures=assignTiles(treasureCount, tile=> {
      tile.type="treasure";
      tile.content=null;
      tile.resolved=false;
    });
    areaState.dynamicNodesInitialized=true;
    return summary;
  }

  function ensureAreaGenerated(state, areaId) {
    const areaDef=getArea(areaId);
    if(!areaDef.map)return;
    if(!state.world.areas[areaId]) {
      const size=Math.max(1, Number(areaDef.size||9)||9);
      const seed=(Date.now()^(Math.random()*1e9)|0)>>>0;
      state.world.areas[areaId]={
        seed, size, px:Math.floor(size/2), py:Math.floor(size/2), tiles:[], layoutSignature:"", dynamicNodesInitialized:false
      };
      generateMap(state.world.areas[areaId], areaDef);
    } else {
      normalizeAreaState(state.world.areas[areaId], areaDef);
    }
  }

  function normalizeAreaState(areaState, areaDef) {
    if(!areaState)return;
    if(!Number.isFinite(Number(areaState.seed)))areaState.seed=(Date.now()^(Math.random()*1e9)|0)>>>0;
    const terrainGrid=areaTerrainGrid(areaState, areaDef);
    const targetSize=terrainGrid.length;
    const expectedSignature=areaLayoutSignature(areaState, areaDef);
    const needsTerrainRebuild=!Array.isArray(areaState.tiles)||areaState.tiles.length!==targetSize||areaState.tiles.some(row=>!Array.isArray(row)||row.length!==targetSize)||areaState.layoutSignature!==expectedSignature;
    if(needsTerrainRebuild) {
      rebuildAreaTerrain(areaState, areaDef);
    } else {
      areaState.size=targetSize;
      for(let y=0;y<targetSize;y++) {
        if(!Array.isArray(areaState.tiles[y]))areaState.tiles[y]=[];
        for(let x=0;x<targetSize;x++) {
          const existingTile=areaState.tiles[y][x]?cloneAreaTile(areaState.tiles[y][x]):createBaseAreaTile(terrainGrid[y][x]);
          existingTile.terrain=terrainGrid[y][x];
          if(!existingTile.home&&existingTile.type!=="dungeon"&&isImpassableTerrain(existingTile.terrain)) {
            if(existingTile.type!=="empty"||existingTile.content!=null||existingTile.resolved) {
              areaState.dynamicNodesInitialized=false;
            }
            existingTile.type="empty";
            existingTile.content=null;
            existingTile.resolved=false;
          }
          areaState.tiles[y][x]=existingTile;
        }
      }
      areaState.layoutSignature=expectedSignature;
    }
    areaState.dynamicNodesInitialized=!!areaState.dynamicNodesInitialized;
    applySpecialTiles(areaState, areaDef);
    ensureAreaPlayerPosition(areaState, areaDef);
    if(!areaState.dynamicNodesInitialized) {
      repopulateAreaDynamicNodes(areaState, areaDef);
    }
  }

  function moveAreaPlayerToTile(areaState, areaDef, x, y) {
    if(!areaState)return;
    normalizeAreaState(areaState, areaDef);
    const size=areaState.size||areaDef.size||9;
    areaState.px=clamp(Number.isFinite(Number(x))?Number(x):Math.floor(size/2), 0, size-1);
    areaState.py=clamp(Number.isFinite(Number(y))?Number(y):Math.floor(size/2), 0, size-1);
    ensureAreaPlayerPosition(areaState, areaDef);
    if(areaState.tiles&&areaState.tiles[areaState.py]&&areaState.tiles[areaState.py][areaState.px]) {
      const tile=areaState.tiles[areaState.py][areaState.px];
      tile.revealed=true;
      if(tile.home)tile.resolved=true;
    }
  }

  function moveAreaPlayerToHomeTile(areaState, areaDef) {
    if(!areaState)return;
    const size=areaState.size||areaDef.size||9;
    moveAreaPlayerToTile(areaState, areaDef, Math.floor(size/2), Math.floor(size/2));
  }

  function refreshAllMapDynamicNodes(state) {
    const summary={
      monsters:0, resources:0, treasures:0
    };
    for(const areaDef of AREAS) {
      if(!areaDef.map)continue;
      const areaState=state.world.areas[areaDef.id];
      if(!areaState)continue;
      normalizeAreaState(areaState, areaDef);
      const refreshed=repopulateAreaDynamicNodes(areaState, areaDef);
      summary.monsters+=refreshed.monsters;
      summary.resources+=refreshed.resources;
      summary.treasures+=refreshed.treasures;
    }
    return summary;
  }

  function generateMap(areaState, areaDef) {
    if(!Number.isFinite(Number(areaState.seed)))areaState.seed=(Date.now()^(Math.random()*1e9)|0)>>>0;
    rebuildAreaTerrain(areaState, areaDef);
    areaState.size=Math.max(1, Number(areaState.size||areaDef.size||areaState.tiles.length||9)||9);
    areaState.px=clamp(Number.isFinite(Number(areaState.px))?Number(areaState.px):Math.floor(areaState.size/2), 0, areaState.size-1);
    areaState.py=clamp(Number.isFinite(Number(areaState.py))?Number(areaState.py):Math.floor(areaState.size/2), 0, areaState.size-1);
    applySpecialTiles(areaState, areaDef);
    ensureAreaPlayerPosition(areaState, areaDef);
    repopulateAreaDynamicNodes(areaState, areaDef);
  }

  function tileSymbol(tile) {
    if(!tile.revealed)return MAP_ICONS.unknown;
    if(tile.home&&tile.type==="dungeon")return MAP_ICONS.dungeon;
    if(tile.home)return MAP_ICONS.home;
    if(tile.type==="dungeon")return MAP_ICONS.dungeon;
    if(tile.type==="monster"&&!tile.resolved)return MAP_ICONS.monster;
    if(tile.type==="resource"&&!tile.resolved)return MAP_ICONS.resource;
    if(tile.type==="treasure"&&!tile.resolved)return MAP_ICONS.treasure;
    return"";
  }

  function parseCssPx(value, fallback=0) {
    const parsed=Number.parseFloat(String(value||"").trim());
    return Number.isFinite(parsed)?parsed:fallback;
  }

  function cameraModeLabel(mode) {
    return mode===MAP_CAMERA_MODES.follow?"Follow Map Mode":"Fixed Map Mode";
  }

  function renderMapLegend(){const items=[{icon:MAP_ICONS.player,label:"player"},{icon:MAP_ICONS.unknown,label:"unknown"},{icon:MAP_ICONS.home,label:"home"},{icon:MAP_ICONS.dungeon,label:"dungeon"},{icon:MAP_ICONS.monster,label:"monster"},{icon:MAP_ICONS.resource,label:"resource"},{icon:MAP_ICONS.treasure,label:"treasure"},{terrain:"forest",label:"forest"},{terrain:"plains",label:"plains"},{terrain:"dirt",label:"dirt"},{terrain:"water",label:"water"},{terrain:"mountain",label:"mountain"}];return items.map(item=>{if(item.terrain){return`
            <span class="legendItem legendTerrain"><span class="legendSwatch terrain-${item.terrain}" aria-hidden="true"></span><span>${escapeHtml(item.label)}</span></span>
          `;}return`
          <span class="legendItem"><span class="legendIcon" aria-hidden="true">${item.icon}</span><span>${escapeHtml(item.label)}</span></span>
        `;}).join("");}

  function responsiveMapCellBounds() {
    return {
      min:window.innerWidth<=640?22:MAP_MIN_CELL_SIZE
    };
  }

  function maxTilesThatFit(availableSpace, padding, gap, cellSize) {
    const innerSpace=Math.max(0, Math.floor(availableSpace)-padding);
    if(innerSpace<=0)return 1;
    return Math.max(1, Math.floor((innerSpace+gap)/(cellSize+gap)));
  }

  function mapSpanPixels(count, cellSize, gap, padding) {
    if(count<=0)return padding;
    return padding+(count*cellSize)+(Math.max(0, count-1)*gap);
  }

  function computeMapViewportLayout(areaState, mapPaneEl, mapViewportEl) {
    const size=Math.max(1, Number(areaState&&areaState.size||0)||1);
    const styles=getComputedStyle(mapViewportEl);
    const gap=parseCssPx(styles.getPropertyValue("--map-gap"), 4);
    const paddingX=parseCssPx(styles.paddingLeft, 0)+parseCssPx(styles.paddingRight, 0);
    const paddingY=parseCssPx(styles.paddingTop, 0)+parseCssPx(styles.paddingBottom, 0);
    const bounds=responsiveMapCellBounds();
    const availableWidth=Math.max(1, Math.floor(mapViewportEl.clientWidth||mapPaneEl.clientWidth||0));
    const viewportTop=mapViewportEl.getBoundingClientRect().top;
    const availableHeight=Math.max(1, Math.floor(window.innerHeight-viewportTop-MAP_VIEWPORT_MARGIN));
    const maxVisible=Math.max(1, Number(MAP_MAX_VISIBLE_TILES||9));
    let cols=Math.min(size, maxVisible, maxTilesThatFit(availableWidth, paddingX, gap, bounds.min));
    cols=clamp(cols, 1, Math.min(size, maxVisible));
    const widthInnerSpace=Math.max(0, availableWidth-paddingX-Math.max(0, cols-1)*gap);
    const maxWidthCellSize=widthInnerSpace>0?(widthInnerSpace/cols):1;
    const cellSize=Math.max(1, Math.floor(maxWidthCellSize*MAP_WIDTH_SCALE_RATIO));
    let rows=Math.min(size, maxVisible, maxTilesThatFit(availableHeight, paddingY, gap, cellSize));
    rows=clamp(rows, 1, Math.min(size, maxVisible));
    return {
      cols, rows, cellSize, gap, gridWidth:mapSpanPixels(cols, cellSize, gap, 0), gridHeight:mapSpanPixels(rows, cellSize, gap, 0), height:mapSpanPixels(rows, cellSize, gap, paddingY)
    };
  }

  let teardownExploreViewportSync=null;

  let activeExploreViewportRefresh=null;

  function clearExploreViewportSync() {
    activeExploreViewportRefresh=null;
    if(typeof teardownExploreViewportSync==="function") {
      const cleanup=teardownExploreViewportSync;
      teardownExploreViewportSync=null;
      try {
        cleanup();
      } catch(_) {
      }
    }
  }

  function setExploreViewportSync(refreshViewport, mapPaneEl, mapViewportEl, mapEl) {
    clearExploreViewportSync();
    let rafId=0;
    const schedule=()=> {
      if(rafId)cancelAnimationFrame(rafId);
      rafId=requestAnimationFrame(()=> {
        rafId=0;
        if(state&&state.player&&state.tab==="explore"&&document.getElementById("map")===mapEl) {
          refreshViewport();
        }
      });
    };
    activeExploreViewportRefresh=schedule;
    const onResize=()=>schedule();
    const visualViewport=window.visualViewport||null;
    window.addEventListener("orientationchange", onResize);
    if(visualViewport)visualViewport.addEventListener("resize", onResize);
    let observer=null;
    if(typeof ResizeObserver!=="undefined") {
      observer=new ResizeObserver(()=>schedule());
      [mapPaneEl, mapViewportEl].filter(Boolean).forEach(el=>observer.observe(el));
    }
    teardownExploreViewportSync=()=> {
      activeExploreViewportRefresh=null;
      if(rafId)cancelAnimationFrame(rafId);
      window.removeEventListener("orientationchange", onResize);
      if(visualViewport)visualViewport.removeEventListener("resize", onResize);
      if(observer)observer.disconnect();
    };
  }

  function centeredMapOrigin(areaState, cols, rows) {
    const maxX=Math.max(0, areaState.size-cols);
    const maxY=Math.max(0, areaState.size-rows);
    return {
      x:clamp(areaState.px-Math.floor(cols/2), 0, maxX), y:clamp(areaState.py-Math.floor(rows/2), 0, maxY)
    };
  }

  function ensureMapViewState(state, areaId) {
    if(!state.ui.mapViewByArea||typeof state.ui.mapViewByArea!=="object")state.ui.mapViewByArea={
    };
    if(!state.ui.mapViewByArea[areaId]||typeof state.ui.mapViewByArea[areaId]!=="object") {
      state.ui.mapViewByArea[areaId]={
      };
    }
    return state.ui.mapViewByArea[areaId];
  }

  function computeVisibleMapWindow(state, areaId, areaState, cols, rows) {
    const size=Math.max(1, Number(areaState&&areaState.size||0)||1);
    const maxX=Math.max(0, size-cols);
    const maxY=Math.max(0, size-rows);
    if(state.ui.mapCameraMode!==MAP_CAMERA_MODES.follow) {
      const centered=centeredMapOrigin(areaState, cols, rows);
      ensureMapViewState(state, areaId);
      state.ui.mapViewByArea[areaId]={
        x:centered.x, y:centered.y, cols, rows
      };
      return {
        ...centered, cols, rows
      };
    }
    const stored=ensureMapViewState(state, areaId);
    const fallback=centeredMapOrigin(areaState, cols, rows);
    let x=Number.isFinite(Number(stored.x))?clamp(Number(stored.x), 0, maxX):fallback.x;
    let y=Number.isFinite(Number(stored.y))?clamp(Number(stored.y), 0, maxY):fallback.y;
    if(areaState.px<x)x=areaState.px;
    if(areaState.px>x+cols-1)x=areaState.px-cols+1;
    if(areaState.py<y)y=areaState.py;
    if(areaState.py>y+rows-1)y=areaState.py-rows+1;
    const bufferX=Math.min(FOLLOW_CAMERA_EDGE_BUFFER, Math.floor((cols-1)/2));
    const bufferY=Math.min(FOLLOW_CAMERA_EDGE_BUFFER, Math.floor((rows-1)/2));
    const leftEdge=x+bufferX;
    const rightEdge=x+cols-1-bufferX;
    const topEdge=y+bufferY;
    const bottomEdge=y+rows-1-bufferY;
    if(areaState.px<leftEdge)x=areaState.px-bufferX;
    if(areaState.px>rightEdge)x=areaState.px-(cols-1-bufferX);
    if(areaState.py<topEdge)y=areaState.py-bufferY;
    if(areaState.py>bottomEdge)y=areaState.py-(rows-1-bufferY);
    x=clamp(x, 0, maxX);
    y=clamp(y, 0, maxY);
    state.ui.mapViewByArea[areaId]={
      x, y, cols, rows
    };
    return {
      x, y, cols, rows
    };
  }

  function isImpassableTerrain(terrain) {
    return terrain==="water"||terrain==="mountain";
  }

  function isDirectionBlocked(state, dx, dy) {
    const areaId=state.world.areaId;
    const aDef=getArea(areaId);
    if(!aDef.map)return true;
    const aState=state.world.areas[areaId];
    if(!aState)return true;
    const size=aState.size||aDef.size||9;
    const nx=aState.px+dx;
    const ny=aState.py+dy;
    if(nx<0||ny<0||nx>=size||ny>=size)return true;
    const row=aState.tiles[ny];
    const t=row?row[nx]:null;
    if(!t)return true;
    return isImpassableTerrain(t.terrain);
  }

  function currentTile(state) {
    const areaId=state.world.areaId;
    const aDef=getArea(areaId);
    if(!aDef.map)return null;
    const aState=state.world.areas[areaId];
    return aState.tiles[aState.py][aState.px];
  }

  function currentDungeonDestination(state) {
    const tile=currentTile(state);
    if(!tile||tile.type!=="dungeon"||!tile.content)return null;
    try {
      return {
        area:getArea(tile.content), arrivalX:Number.isFinite(Number(tile.arrivalX))?Number(tile.arrivalX):null, arrivalY:Number.isFinite(Number(tile.arrivalY))?Number(tile.arrivalY):null, linkedDungeonAreaId:tile.linkedDungeonAreaId||null
      };
    } catch(_) {
      return null;
    }
  }

  function dungeonEnterLabel(destination){const area=destination&&destination.area?destination.area:destination;return area?`Enter ${area.name} (Level ${area.level})`:"Enter Dungeon";}

  function isOnHomeTile(state) {
    const areaId=state.world.areaId;
    const aDef=getArea(areaId);
    if(!aDef.map)return false;
    const t=currentTile(state);
    return!!(t&&t.home);
  }

  function canTravelNow(state) {
    if(state.combat)return false;
    if(state.world.areaId==="town")return true;
    return isOnHomeTile(state);
  }

  function travelTo(state,targetAreaId,options={}){const opts=options&&typeof options==="object"?options:{};const viaDungeon=!!opts.viaDungeon;const bypassTravelRequirement=!!opts.bypassTravelRequirement;const arrivalX=Number.isFinite(Number(opts.arrivalX))?Number(opts.arrivalX):null;const arrivalY=Number.isFinite(Number(opts.arrivalY))?Number(opts.arrivalY):null;if(state.combat||hasBlockingCenterOverlay(state))return;if(targetAreaId===state.world.areaId)return;const targetArea=getArea(targetAreaId);if(!viaDungeon&&!isAreaUnlocked(state,targetAreaId)){log(state,`${targetArea.name} has not been discovered yet.`);return;}if(!bypassTravelRequirement&&!canTravelNow(state)){log(state,"You can only travel from the Town tile (🏘️).");return;}if(targetArea.map)unlockArea(state,targetAreaId);state.world.areaId=targetAreaId;ensureAreaGenerated(state,targetAreaId);if(targetArea.map){const areaState=state.world.areas[targetAreaId];if(arrivalX!=null&&arrivalY!=null)moveAreaPlayerToTile(areaState,targetArea,arrivalX,arrivalY);else moveAreaPlayerToHomeTile(areaState,targetArea);state.ui.selectedTile={x:areaState.px,y:areaState.py};notifyQuestEvent(state,"visit_tile",{areaId:targetAreaId,x:areaState.px,y:areaState.py});}else{state.ui.selectedTile=null;}state.tab="explore";log(state,`${viaDungeon ? "You enter" : "You travel to"} ${targetArea.name}.`);advanceStatusEffectsAfterAction(state);save(state);render();}

  function movePlayer(state,dx,dy){if(state.combat||hasBlockingCenterOverlay(state))return;const areaId=state.world.areaId;const aDef=getArea(areaId);if(!aDef.map)return;const aState=state.world.areas[areaId];const nx=aState.px+dx;const ny=aState.py+dy;if(nx<0||ny<0||nx>=aState.size||ny>=aState.size)return;const nextTile=aState.tiles[ny][nx];const wasRevealed=!!nextTile.revealed;if(isImpassableTerrain(nextTile.terrain)){log(state,"That way is blocked by impassable terrain.");return;}aState.px=nx;aState.py=ny;const tile=aState.tiles[ny][nx];tile.revealed=true;state.ui.selectedTile={x:nx,y:ny};notifyQuestEvent(state,"visit_tile",{areaId,x:nx,y:ny});const quietStepActive=hasStatusEffect(state.player,"quiet_step");if(tile.type==="monster"&&!tile.resolved){if(quietStepActive){const monster=getMonster(tile.content);log(state,`Quiet Step lets you slip into ${monster.name}'s tile without triggering combat.`);}else{startEncounter(state,tile.content);if(state.combat&&wasRevealed&&hasAbility(state.player,"hunting")){log(state,`Hunting lets you strike first against the ${state.combat.enemy.name}.`);resolvePlayerAttack(state,{prefix:"Hunting — free attack. "});if(state.combat)state.combat.turn="player";}}}else if(tile.type==="treasure"&&!tile.resolved){openTreasure(state,aDef,tile);}advanceStatusEffectsAfterAction(state,{isMovement:true});maybeTriggerRandomEvent(state);save(state);render();}

  function openTreasure(state,areaDef,tile){const[lo,hi]=areaDef.treasureRange||[20,120];let coins=rollInt(lo,hi);const doubled=hasAbility(state.player,"skill_perception_treasure_hunter")||hasAbility(state.player,"skill_feat_perception_treasure_hunter");if(doubled)coins*=2;addCoins(state,coins);tile.resolved=true;log(state,`You discover a small cache and gain ${formatCoins(coins)}${doubled ? " (Treasure Hunter doubled it)" : ""}.`);}

  function gatherResource(state){if(state.combat||hasBlockingCenterOverlay(state))return;const tile=currentTile(state);if(!tile||tile.type!=="resource"||tile.resolved)return;if(state.player.sp.current<=0){log(state,"You are too exhausted to gather resources. (Need SP)");return;}state.player.sp.current-=1;const resId=tile.content;const res=getItem(resId);const skill=res&&res.gatherSkill?res.gatherSkill:((resId==="ore")?"Crafting":"Survival");const rollData=rollD20Detailed("gather_check",{label:skill});const skillParts=skillCheckSourceParts(state.player,skill);const bonus=skillTotal(state.player,skill);const derivedBonus=sumRollParts(skillParts);const miscPart=createRollModifierPart(bonus-derivedBonus,"status_check",skill,`${skill} modifier`);const checkParts=[...rollData.parts,...cloneRollParts(skillParts)];if(miscPart)checkParts.push(miscPart);const check=sumRollParts(checkParts);const dc=12+getArea(state.world.areaId).level*2;let qty=(check>=dc+10)?rollInt(2,3):(check>=dc)?rollInt(1,2):1;const doubled=hasAbility(state.player,"skill_survival_gatherers_bounty");if(doubled)qty*=2;addItem(state.player,resId,qty);tile.resolved=true;log(state,`You gather ${qty}x ${res.name}.${doubled ? " Gatherer's Bounty doubles the haul." : ""}`,{rollGroups:[buildLogRollGroup({label:`${skill} gather`,parts:checkParts,total:check,targetLabel:"DC",targetValue:dc,outcome:check>=dc+10?"critical success":(check>=dc?"success":"failure")})]});advanceStatusEffectsAfterAction(state);save(state);render();}

  function searchTile(state){if(hasBlockingCenterOverlay(state))return;const areaDef=getArea(state.world.areaId);if(!areaDef.map)return;if(state.player.sp.current<=0){log(state,"Not enough SP.");return;}state.player.sp.current-=1;const aState=state.world.areas[state.world.areaId];const baseDc=11+areaDef.level*2;const huntingBonus=hasAbility(state.player,"hunting")?2:0;const keenSearchBonus=hasAbility(state.player,"skill_perception_keen_search")?4:0;const treasureHunterRadiusBonus=(hasAbility(state.player,"skill_perception_treasure_hunter")||hasAbility(state.player,"skill_feat_perception_treasure_hunter"))?1:0;const eagleEyeRadius=(hasAbility(state.player,"eagle_eye")?2:1)+treasureHunterRadiusBonus;const perceptionPartsBase=skillCheckSourceParts(state.player,"Perception");let checks=0;let newlyRevealed=0;const rollGroups=[];for(let dy=-eagleEyeRadius;dy<=eagleEyeRadius;dy++){for(let dx=-eagleEyeRadius;dx<=eagleEyeRadius;dx++){const x=aState.px+dx;const y=aState.py+dy;if(x<0||y<0||x>=aState.size||y>=aState.size)continue;const t=aState.tiles[y][x];const dc=baseDc+(t.terrain==="forest"?1:0);const rollData=rollD20Detailed("search_check",{label:`Tile ${x},${y}`});const parts=[...rollData.parts,...cloneRollParts(perceptionPartsBase)];const huntingPart=createRollModifierPart(huntingBonus,"hunting_bonus","Hunting","Hunting adds +2 to search checks.");const keenPart=createRollModifierPart(keenSearchBonus,"keen_search_bonus","Keen Search","Keen Search adds +4 to search checks.");if(huntingPart)parts.push(huntingPart);if(keenPart)parts.push(keenPart);const total=sumRollParts(parts);checks++;const revealedNow=!t.revealed&&(rollData.total===20||total>=dc);if(revealedNow){t.revealed=true;newlyRevealed++;}rollGroups.push(buildLogRollGroup({label:`Search tile ${x},${y}`,note:t.terrain==="forest"?"Forest tiles add +1 DC.":"",parts,total,targetLabel:"DC",targetValue:dc,outcome:revealedNow?"revealed":(total>=dc||rollData.total===20?"success":"failure")}));}}if(newlyRevealed>0){log(state,`You search nearby tiles (radius ${eagleEyeRadius}) and reveal ${newlyRevealed} new tile(s) across ${checks} check(s).`,{rollGroups});}else{log(state,`You search nearby tiles (radius ${eagleEyeRadius}) but reveal nothing new across ${checks} check(s).`,{rollGroups});}advanceStatusEffectsAfterAction(state);save(state);render();}

  // ---------------------------------------------------------------------------
  // Abilities, shopping, and equipment rules
  // ---------------------------------------------------------------------------
  function abilityHasTag(abilityId, tag) {
    const ability=getAbility(abilityId);
    const needle=String(tag||"").trim().toLowerCase();
    return Array.isArray(ability&&ability.tags)&&ability.tags.some(entry=>String(entry||"").trim().toLowerCase()===needle);
  }

  function notifyCombatAction(message, kind="neutral") {
    combatToast(message, kind);
  }

  function notifyAbilityUse(abilityId,{success=true,message=""}={}){const ability=getAbility(abilityId);const label=String(message||`You use ${ability.name}.`).trim();let kind="neutral";if(success){if(abilityHasTag(abilityId,"Heal"))kind="good";else if(abilityHasTag(abilityId,"Buff"))kind="buff";}notifyCombatAction(label,kind);}

  function getMonster(monsterId) {
    const m=MONSTERS.find(x=>x.id===monsterId);
    if(!m)throw new Error("Unknown monster: "+monsterId);
    return m;
  }

  function dealDamageToPlayer(state,amount,damageType,{sourceLabel="",applyResistance=true}={}){const raw=Math.max(0,Number(amount||0));const resistance=applyResistance?damageResistanceValue(state.player,damageType):0;const reduced=Math.min(raw,resistance);const dmg=Math.max(0,raw-reduced);state.player.hp.current=clamp(state.player.hp.current-dmg,0,state.player.hp.max);if(sourceLabel){log(state,`${sourceLabel} You take ${dmg} ${damageType} damage${reduced > 0 ? ` (reduced by ${reduced} resistance)` : ""}.`);}if(state.player.hp.current<=0){handlePlayerDefeat(state);return{damage:dmg,reduced,defeated:true};}return{damage:dmg,reduced,defeated:false};}

  function hasEquippedShield(player) {
    const shieldId=player&&player.equipment?player.equipment.offHand:null;
    if(!shieldId||!ITEM_INDEX.has(shieldId))return false;
    const item=getItem(shieldId);
    return item&&item.category==="shield";
  }

  function useAttackAbility(state,abilityId,{prefix=null,attackBonusModifier=0,extraDamageOnHit=0,ignoreFlyingPenalty=false,onAfter=null}={}){const check=canUseActiveAbility(state,abilityId);if(!check.ok){log(state,check.reason);return;}spendAbilitySp(state,abilityId);const ability=getAbility(abilityId);const result=resolvePlayerAttack(state,{prefix:prefix!=null?prefix:`${ability.name}: `,attackBonusModifier,extraDamageOnHit,ignoreFlyingPenalty,attackBonusSourceKey:ability.id,attackBonusSourceLabel:ability.name,extraDamageSourceKey:ability.id,extraDamageSourceLabel:ability.name});if(typeof onAfter==="function"){onAfter(result);}finishPlayerAbilityUse(state);}

  function useGuardStance(state) {
    useAttackAbility(state, "power_strike", {
      attackBonusModifier:-2, extraDamageOnHit:4
    });
  }

  function useGuardStrike(state) {
    const check=canUseActiveAbility(state, "guard_strike");
    if(!check.ok) {
      log(state, check.reason);
      return;
    }
    spendAbilitySp(state, "guard_strike");
    addOrRefreshStatusEffect(state.player, createStatusEffect("guarded"));
    addOrRefreshStatusEffect(state.player, createStatusEffect("guard_strike_ready"));
    log(state, "You brace with Guard Strike: gain Guarded and prepare a counterattack until your next turn.");
    notifyAbilityUse("guard_strike", {
      message:"You use Guard Strike and ready a counterattack."
    });
    finishPlayerAbilityUse(state);
  }

  function useCheckAbilityAgainstEnemyDc(state,abilityId,{checkLabel,skillId=null,getBonus,getParts=null,dcId,statusId,duration=1,successText,failureText}){const check=canUseActiveAbility(state,abilityId);if(!check.ok){log(state,check.reason);return;}const ability=getAbility(abilityId);const enemy=preferredCombatEnemy(state)||state.combat.enemy;if(!enemy){log(state,"Select an enemy target first.");return;}spendAbilitySp(state,abilityId);const rollData=rollD20Detailed(skillId?"skill_die":"status_check",{label:checkLabel||ability.name});const bonus=Number(getBonus(state)||0);const detailParts=typeof getParts==="function"?cloneRollParts(getParts(state)):(skillId?cloneRollParts(skillCheckSourceParts(state.player,skillId)):[]);const derivedBonus=sumRollParts(detailParts);const miscPart=createRollModifierPart(bonus-derivedBonus,ability.id,ability.name,`${checkLabel || ability.name} modifier`);if(miscPart)detailParts.push(miscPart);const parts=[...rollData.parts,...detailParts];const total=sumRollParts(parts);const dc=creatureSaveDc(enemy,dcId);if(rollData.total===20||total>=dc){const effect=createStatusEffect(statusId,{duration});addOrRefreshStatusEffect(enemy,effect);log(state,`${ability.name} succeeds against ${enemy.name}. ${successText || `${enemy.name} gains ${effect.name} for ${effect.duration} round${effect.duration === 1 ? "" : "s"}.`}`,{rollGroups:[buildLogRollGroup({label:`${ability.name} ${checkLabel}`,parts,total,targetLabel:`${saveLabel(dcId)} DC`,targetValue:dc,outcome:"success"})]});notifyAbilityUse(abilityId,{message:`${ability.name} succeeds against ${enemy.name}.`});}else{log(state,`${ability.name} fails against ${enemy.name}. ${failureText || "No effect."}`,{rollGroups:[buildLogRollGroup({label:`${ability.name} ${checkLabel}`,parts,total,targetLabel:`${saveLabel(dcId)} DC`,targetValue:dc,outcome:"failure"})]});notifyAbilityUse(abilityId,{success:false,message:`${ability.name} fails against ${enemy.name}.`});}finishPlayerAbilityUse(state);}

  function useTopple(state){useCheckAbilityAgainstEnemyDc(state,"topple",{checkLabel:"Athletics",skillId:"Athletics",getBonus:st=>skillTotal(st.player,"Athletics"),dcId:"reflex",statusId:"prone",successText:`${state.combat.enemy.name} is knocked Prone for 1 round.`});}

  function useViciousStrike(state) {
    useAttackAbility(state, "vicious_strike", {
      extraDamageOnHit:statMod(state.player.stats.STR)
    });
  }

  function useTreeStance(state) {
    const check=canUseActiveAbility(state, "tree_stance");
    if(!check.ok) {
      log(state, check.reason);
      return;
    }
    spendAbilitySp(state, "tree_stance");
    addOrRefreshStatusEffect(state.player, createStatusEffect("tree_stance"));
    log(state, "You root into Tree Stance for 10 rounds (resistance 3 to bludgeoning, piercing, and slashing).");
    notifyAbilityUse("tree_stance", {
      message:"You enter Tree Stance."
    });
    finishPlayerAbilityUse(state);
  }

  function useRiverStance(state) {
    const check=canUseActiveAbility(state, "river_stance");
    if(!check.ok) {
      log(state, check.reason);
      return;
    }
    spendAbilitySp(state, "river_stance");
    addOrRefreshStatusEffect(state.player, createStatusEffect("river_stance"));
    log(state, "You flow into River Stance for 10 rounds.");
    notifyAbilityUse("river_stance", {
      message:"You enter River Stance."
    });
    finishPlayerAbilityUse(state);
  }

  function useMountainStance(state) {
    const check=canUseActiveAbility(state, "mountain_stance");
    if(!check.ok) {
      log(state, check.reason);
      return;
    }
    spendAbilitySp(state, "mountain_stance");
    addOrRefreshStatusEffect(state.player, createStatusEffect("mountain_stance"));
    log(state, "You settle into Mountain Stance for 10 rounds (+2 AC).");
    notifyAbilityUse("mountain_stance", {
      message:"You enter Mountain Stance."
    });
    finishPlayerAbilityUse(state);
  }

  function useCloudStance(state) {
    const check=canUseActiveAbility(state, "cloud_stance");
    if(!check.ok) {
      log(state, check.reason);
      return;
    }
    spendAbilitySp(state, "cloud_stance");
    addOrRefreshStatusEffect(state.player, createStatusEffect("cloud_stance"));
    log(state, "You slip into Cloud Stance for 10 rounds.");
    notifyAbilityUse("cloud_stance", {
      message:"You enter Cloud Stance."
    });
    finishPlayerAbilityUse(state);
  }

  function useFlameStance(state) {
    const check=canUseActiveAbility(state, "flame_stance");
    if(!check.ok) {
      log(state, check.reason);
      return;
    }
    spendAbilitySp(state, "flame_stance");
    addOrRefreshStatusEffect(state.player, createStatusEffect("flame_stance"));
    log(state, "You ignite Flame Stance for 10 rounds (+2 attack rolls).");
    notifyAbilityUse("flame_stance", {
      message:"You enter Flame Stance."
    });
    finishPlayerAbilityUse(state);
  }

  function usePreciseStrike(state) {
    useAttackAbility(state, "precise_strike", {
      attackBonusModifier:4
    });
  }

  function useSpikeLure(state) {
    const check=canUseActiveAbility(state, "spike_lure");
    if(!check.ok) {
      log(state, check.reason);
      return;
    }
    spendAbilitySp(state, "spike_lure");
    addOrRefreshStatusEffect(state.player, createStatusEffect("spike_lure"));
    log(state, "You bait attacks with Spike Lure for 5 rounds.");
    notifyAbilityUse("spike_lure", {
      message:"You ready Spike Lure."
    });
    finishPlayerAbilityUse(state);
  }

  function useDirtyTrick(state){useCheckAbilityAgainstEnemyDc(state,"dirty_trick",{checkLabel:"Stealth",skillId:"Stealth",getBonus:st=>skillTotal(st.player,"Stealth"),dcId:"reflex",statusId:"blinded",successText:`${state.combat.enemy.name} becomes Blinded for 1 round.`});}

  function useCoverStep(state) {
    const check=canUseActiveAbility(state, "cover_step");
    if(!check.ok) {
      log(state, check.reason);
      return;
    }
    const enemy=preferredCombatEnemy(state)||state.combat.enemy;
    if(!enemy) {
      log(state, "Select an enemy target first.");
      return;
    }
    spendAbilitySp(state, "cover_step");
    const rollData=rollD20Detailed("cover_step_check", {
      label:"Stealth"
    });
    const parts=[...rollData.parts, ...cloneRollParts(skillCheckSourceParts(state.player, "Stealth"))];
    const total=sumRollParts(parts);
    const dc=creatureSaveDc(enemy, "will");
    if(rollData.total===20||total>=dc) {
      addOrRefreshStatusEffect(state.player, createStatusEffect("cover_step"));
      log(state, "Cover Step succeeds. Gain +4 AC and +4 to your next attack for 1 round.", {
        rollGroups:[buildLogRollGroup({
          label:"Cover Step", parts, total, targetLabel:"Will DC", targetValue:dc, outcome:"success"
        })]
      });
      notifyAbilityUse("cover_step", {
        message:"Cover Step succeeds and boosts your defenses."
      });
    } else {
      log(state, "Cover Step fails. No effect.", {
        rollGroups:[buildLogRollGroup({
          label:"Cover Step", parts, total, targetLabel:"Will DC", targetValue:dc, outcome:"failure"
        })]
      });
      notifyAbilityUse("cover_step", {
        success:false, message:"Cover Step fails."
      });
    }
    finishPlayerAbilityUse(state);
  }

  function useQuietStep(state) {
    const check=canUseActiveAbility(state, "quiet_step");
    if(!check.ok) {
      log(state, check.reason);
      return;
    }
    spendAbilitySp(state, "quiet_step");
    addOrRefreshStatusEffect(state.player, createStatusEffect("quiet_step"));
    log(state, "You move under Quiet Step for 10 movements. Entering enemy tiles will not trigger combat while it lasts.");
    finishPlayerAbilityUse(state);
  }

  function useOpenWound(state){useAttackAbility(state,"open_wound",{onAfter:(result)=>{if(result.hit&&state.combat&&state.combat.enemy){addOrRefreshStatusEffect(state.combat.enemy,createBleedStatusEffect(2,5));log(state,`${state.combat.enemy.name} suffers Bleed 2.`);}}});}

  function shortRest(state){if(hasBlockingCenterOverlay(state))return;if(state.combat){log(state,"You can't rest during combat.");return;}const now=Date.now();if(now<state.cooldowns.shortRestReadyAt){const s=Math.ceil((state.cooldowns.shortRestReadyAt-now)/1000);log(state,`Short rest is on cooldown (${s}s).`);return;}const areaDef=getArea(state.world.areaId);const inTown=state.world.areaId==="town";state.cooldowns.shortRestReadyAt=now+60000;if(!inTown&&areaDef.map){const cautiousCamp=hasAbility(state.player,"skill_stealth_cautious_camp");const firstRoll=rollD20();const secondRoll=cautiousCamp?rollD20():null;const roll=secondRoll!=null?Math.max(firstRoll,secondRoll):firstRoll;const total=roll+skillTotal(state.player,"Stealth");const dc=12+areaDef.level*2;if(roll!==20&&total<dc){log(state,`While you try to rest, you're ambushed! (Stealth ${total} vs DC ${dc}${cautiousCamp ? `; Cautious Camp rolls ${firstRoll}/${secondRoll}, kept ${roll}` : ""})`);const mId=areaDef.encounterPool[rollInt(0,areaDef.encounterPool.length-1)];startEncounter(state,mId);save(state);render();return;}else{log(state,`You manage to rest quietly. (Stealth ${total} vs DC ${dc}${cautiousCamp ? `; Cautious Camp rolls ${firstRoll}/${secondRoll}, kept ${roll}` : ""})`);}}const heal=Math.max(1,rollDice("1d8")+statMod(state.player.stats.CON));const beforeHp=state.player.hp.current;state.player.hp.current=clamp(state.player.hp.current+heal,0,state.player.hp.max);const spGain=Math.max(1,rollDice("1d6")+statMod(state.player.stats.WIS));const beforeSp=state.player.sp.current;state.player.sp.current=clamp(state.player.sp.current+spGain,0,state.player.sp.max);log(state,`You take a short rest: +${state.player.hp.current - beforeHp} HP, +${state.player.sp.current - beforeSp} SP. (Cooldown 60s)`);save(state);render();}

  function longRest(state){if(hasBlockingCenterOverlay(state))return;if(state.world.areaId!=="town"){log(state,"You can only take a long rest in town (for now).");return;}if(state.combat)return;state.player.hp.current=state.player.hp.max;state.player.sp.current=state.player.sp.max;state.world.day=Math.max(1,Number(state.world.day||1))+1;state.cooldowns.shortRestReadyAt=0;const refreshed=refreshAllMapDynamicNodes(state);const refreshedEvents=regenerateDailyRandomEvents(state);log(state,`Day ${state.world.day}: you take a long rest and fully recover.${refreshed.monsters ? ` Monster spawns reset: ${refreshed.monsters}.` : ""}${refreshed.resources ? ` Gathering points reset: ${refreshed.resources}.` : ""}${refreshed.treasures ? ` Treasure caches reset: ${refreshed.treasures}.` : ""}${refreshedEvents ? ` Random events refreshed: ${refreshedEvents}.` : ""}`);toast(`Day ${state.world.day} begins.`,"good");save(state);render();}

  function buildShopStock() {
    const stock=[];
    const addStock=(item)=> {
      if(!item||!item.buyable)return;
      stock.push({
        kind:"item", id:item.id, price:Math.max(0, Number(item.purchasePrice!=null?item.purchasePrice:item.cost||0)), qty:Math.max(1, Number(item.purchaseQty||1))
      });
    };
    for(const w of WEAPONS)addStock(w);
    for(const a of ARMORS)addStock(a);
    for(const o of OFFHAND)addStock(o);
    for(const a of ACCESSORIES)addStock(a);
    for(const c of CONSUMABLES)addStock(c);
    for(const a of AMMO)addStock(a);
    return stock.sort((x, y)=>getItem(x.id).name.localeCompare(getItem(y.id).name));
  }

  const SHOP_STOCK=buildShopStock();

  function shopStock() {
    return SHOP_STOCK;
  }

  function shopFeedback(state, message, kind="info", {
    persist=false
  }
  ={
  }) {
    log(state, message);
    toast(message, kind);
    if(persist)save(state);
    render();
  }

  function buyItem(state,itemId){if(state.world.areaId!=="town"){shopFeedback(state,"You can only buy items in town.","warn");return;}const it=getItem(itemId);const purchaseQty=Math.max(1,Number(it.purchaseQty||1));const base=Math.max(0,Number(it.purchasePrice!=null?it.purchasePrice:it.cost||0));if(!it.buyable||base<=0){shopFeedback(state,"That item can't be bought right now.","warn");return;}const price=adjustedBuyPriceCp(state.player,base);const projectedInventory=(Array.isArray(state.player.inventory)?state.player.inventory:[]).map(entry=>({...entry}));addItemToInventoryEntries(projectedInventory,itemId,purchaseQty);const nextInventory=calcInventorySlots(state.player,{inventory:projectedInventory});if(nextInventory.used>nextInventory.max){shopFeedback(state,`Your inventory is too full to buy ${it.name}${purchaseQty > 1 ? ` x${purchaseQty}` : ""} (${nextInventory.used}/${nextInventory.max} slots).`,"warn");return;}if(!spendCoins(state,price)){shopFeedback(state,`Not enough money for ${it.name} (cost: ${formatCoins(price)}).`,"warn");return;}addItem(state.player,itemId,purchaseQty);shopFeedback(state,`Purchased ${it.name}${purchaseQty > 1 ? ` x${purchaseQty}` : ""} for ${formatCoins(price)}.`,"good",{persist:true});}

  function sellItem(state,itemId){if(state.world.areaId!=="town"){shopFeedback(state,"You can only sell items in town.","warn");return;}const it=getItem(itemId);if(!canSellItem(it)){shopFeedback(state,`${it.name} can't be sold.`,"warn");return;}const sellPrice=adjustedSellPriceCp(state.player,it);if(sellPrice<=0){shopFeedback(state,`${it.name} has no sell value.`,"warn");return;}if(!removeItem(state.player,itemId,1)){shopFeedback(state,`You do not have ${it.name} to sell.`,"warn");return;}addCoins(state,sellPrice);shopFeedback(state,`Sold ${it.name} for ${formatCoins(sellPrice)}.`,"good",{persist:true});}

  const MAX_SKILL_INVEST=25;

  function skillProficiencyCap(player, skillId) {
    const startingBonus=(player&&player.startingSkillId===skillId)?2:0;
    return MAX_SKILL_INVEST+startingBonus;
  }

  function isTwoHandWeapon(it) {
    return!!(it&&it.type==="weapon"&&Array.isArray(it.properties)&&it.properties.includes("two-hand"));
  }

  function isAgileWeapon(it) {
    return!!(it&&it.type==="weapon"&&Array.isArray(it.properties)&&it.properties.includes("agile"));
  }

  const EQUIP_SLOTS=[{
    id:"mainHand", label:"Main hand", filter:(it)=>it.type==="weapon"
  }, {
    id:"offHand", label:"Off hand", filter:(it)=>it.category==="shield"||it.type==="offhand"||(it.type==="weapon"&&isAgileWeapon(it)&&!isTwoHandWeapon(it))
  }, {
    id:"armor", label:"Armor", filter:(it)=>it.type==="armor"
  }, {
    id:"accessory_1", label:"Acc 1", filter:(it)=>it.type==="accessory"
  }, {
    id:"accessory_2", label:"Acc 2", filter:(it)=>it.type==="accessory"
  }, {
    id:"accessory_3", label:"Acc 3", filter:(it)=>it.type==="accessory"
  }, {
    id:"accessory_4", label:"Acc 4", filter:(it)=>it.type==="accessory"
  }];

  function canEquipToSlot(player, slotId, it) {
    if(!it)return false;
    if(slotId==="mainHand") {
      if(it.type!=="weapon")return false;
      return canUseWeaponCategory(player, it.category||"simple");
    }
    if(slotId==="offHand") {
      const mh=player.equipment.mainHand?getItem(player.equipment.mainHand):null;
      if(isTwoHandWeapon(mh))return false;
      if(it.category==="shield")return canUseArmorCategory(player, "shields");
      if(it.type==="offhand")return canUseArmorCategory(player, it.category||"shields");
      if(it.type==="weapon") {
        return isAgileWeapon(it)&&!isTwoHandWeapon(it)&&canUseWeaponCategory(player, it.category||"simple");
      }
      return false;
    }
    if(slotId==="armor")return it.type==="armor"&&canUseArmorCategory(player, it.category||"unarmored");
    if(slotId.startsWith("accessory_"))return it.type==="accessory";
    return false;
  }

  function validateEquippedItems(player) {
    if(!player||!player.equipment)return;
    const mh=player.equipment.mainHand?getItem(player.equipment.mainHand):null;
    if(isTwoHandWeapon(mh)&&player.equipment.offHand) {
      addItem(player, player.equipment.offHand, 1);
      player.equipment.offHand=null;
    }
    for(const slotId of Object.keys(player.equipment)) {
      const iid=player.equipment[slotId];
      if(!iid)continue;
      const it=getItem(iid);
      if(!it||!canEquipToSlot(player, slotId, it)) {
        addItem(player, iid, 1);
        player.equipment[slotId]=null;
      }
    }
  }

  function sanitizeInventoryEntries(entries) {
    const sanitized=[];
    if(!Array.isArray(entries))return sanitized;
    for(const entry of entries) {
      const itemId=entry&&typeof entry.itemId==="string"?entry.itemId:null;
      if(!itemId||!ITEM_INDEX.has(itemId))continue;
      const qty=Math.max(0, Math.floor(Number(entry.qty||0)));
      if(qty<=0)continue;
      addItemToInventoryEntries(sanitized, itemId, qty);
    }
    return sanitized;
  }

  function sanitizeEquipmentState(equipment) {
    const base={
      mainHand:null, offHand:null, armor:null, accessory_1:null, accessory_2:null, accessory_3:null, accessory_4:null
    };
    const raw=asPlainObject(equipment)||{
    };
    for(const slotId of Object.keys(base)) {
      const itemId=typeof raw[slotId]==="string"?raw[slotId]:null;
      base[slotId]=itemId&&ITEM_INDEX.has(itemId)?itemId:null;
    }
    return base;
  }

  function cloneInventoryEntries(entries) {
    return(entries||[]).map(entry=>({
      itemId:entry.itemId, qty:Number(entry.qty||0)
    }));
  }

  function addItemToInventoryEntries(entries, itemId, qty=1) {
    const found=entries.find(entry=>entry.itemId===itemId);
    if(found)found.qty+=qty;
    else entries.push({
      itemId, qty
    });
    entries.sort((a, b)=>getItem(a.itemId).name.localeCompare(getItem(b.itemId).name));
  }

  function removeItemFromInventoryEntries(entries, itemId, qty=1) {
    const idx=entries.findIndex(entry=>entry.itemId===itemId);
    if(idx<0||entries[idx].qty<qty)return false;
    entries[idx].qty-=qty;
    if(entries[idx].qty<=0)entries.splice(idx, 1);
    return true;
  }

  function equipItem(state,slotId,itemId){const p=state.player;const prev=p.equipment[slotId]||null;if((itemId||null)===(prev||null))return;const nextInventory=cloneInventoryEntries(p.inventory);const nextEquipment={...(p.equipment||{})};if(itemId===""){nextEquipment[slotId]=null;if(prev)addItemToInventoryEntries(nextInventory,prev,1);const nextInv=calcInventorySlots(p,{inventory:nextInventory,equipment:nextEquipment});if(nextInv.used>nextInv.max){toast("Inventory is full — cannot unequip that item right now.","warn");render();return;}p.inventory=nextInventory;p.equipment=nextEquipment;log(state,prev?`Unequipped ${getItem(prev).name}.`:"Unequipped.");save(state);render();return;}if(!removeItemFromInventoryEntries(nextInventory,itemId,1)){log(state,"Item not in inventory.");toast("Item not in inventory.","bad");render();return;}const it=getItem(itemId);if(!canEquipToSlot(p,slotId,it)){toast("Your class is not trained to equip that category in this slot.","bad");render();return;}if(prev)addItemToInventoryEntries(nextInventory,prev,1);nextEquipment[slotId]=itemId;if(slotId==="mainHand"&&isTwoHandWeapon(it)&&nextEquipment.offHand){addItemToInventoryEntries(nextInventory,nextEquipment.offHand,1);nextEquipment.offHand=null;}const nextInv=calcInventorySlots(p,{inventory:nextInventory,equipment:nextEquipment});if(nextInv.used>nextInv.max){toast("Inventory is full — cannot complete that equip or swap.","warn");render();return;}p.inventory=nextInventory;p.equipment=nextEquipment;log(state,`Equipped ${it.name} to ${slotId}.`);save(state);render();}

  function xpToNextLevel(player) {
    if(!player)return null;
    const lvl=totalLevel(player);
    if(lvl>=maxLevelCap())return null;
    return 120+(lvl-1)*80;
  }

  function canLevelUp(player) {
    const needed=xpToNextLevel(player);
    return needed!=null&&player.xp>=needed;
  }

  function classRequirementEntries(classId) {
    const reqs=CLASSES[classId]&&CLASSES[classId].requirements?CLASSES[classId].requirements:{
    };
    return STATS.filter(stat=>Number.isFinite(Number(reqs[stat]))).map(stat=>[stat, Number(reqs[stat])]);
  }

  function classRequirementText(classId){const entries=classRequirementEntries(classId);return entries.length?entries.map(([stat,value])=>`${stat} ${value}`).join(", "):"None";}

  function unmetClassRequirements(classId,stats){const source=stats||{};return classRequirementEntries(classId).filter(([stat,value])=>Number(source[stat]||0)<value).map(([stat,value])=>`${stat} ${value}`);}

  function canTakeClassLevel(player, classId, stats=player&&player.stats) {
    if(!player||!CLASSES[classId])return false;
    if(Number(player.levels&&player.levels[classId]||0)>0)return true;
    return unmetClassRequirements(classId, stats||{
    }).length===0;
  }

  function sanitizeLevelUpStatAlloc(player, rawAlloc, budget) {
    const source=rawAlloc&&typeof rawAlloc==="object"?rawAlloc:{
    };
    const out={
    };
    let spent=0;
    for(const stat of STATS) {
      const current=Number(player&&player.stats&&player.stats[stat]||0);
      const maxRoom=Math.max(0, STAT_LEVEL_UP_CAP-current);
      const requested=Math.max(0, Math.trunc(Number(source[stat]||0)));
      const add=Math.min(requested, maxRoom, Math.max(0, budget-spent));
      if(add>0) {
        out[stat]=add;
        spent+=add;
      }
    }
    return out;
  }

  function applyLevelUpStatAlloc(player, rawAlloc, budget) {
    const alloc=sanitizeLevelUpStatAlloc(player, rawAlloc, budget);
    const stats={
      ...(player&&player.stats||{
      })
    };
    for(const stat of STATS) {
      stats[stat]=Math.min(STAT_LEVEL_UP_CAP, Number(stats[stat]||0)+Number(alloc[stat]||0));
    }
    return {
      stats, alloc, spent:Object.values(alloc).reduce((sum, value)=>sum+Number(value||0), 0)
    };
  }

  function levelUpSkillPointGainForStats(stats, classId) {
    const cls=CLASSES[classId]||CLASSES.Fighter||{
      baseSkillPoints:0
    };
    return Math.max(0, Number(cls.baseSkillPoints||0)+statMod(stats.INT));
  }

  function sanitizeLevelUpSkillTrainDraft(player, rawDraft, budget) {
    const source=sanitizeSkillDraft(rawDraft);
    const draft={
    };
    let remaining=Math.max(0, Number(budget||0));
    for(const sk of SKILLS) {
      const requested=Math.max(0, Number(source[sk.id]||0));
      if(requested<=0||remaining<=0)continue;
      const current=Math.max(0, Number(player&&player.skillProficiency&&player.skillProficiency[sk.id]||0));
      const room=Math.max(0, skillProficiencyCap(player, sk.id)-current);
      const add=Math.min(requested, room, remaining);
      if(add<=0)continue;
      draft[sk.id]=add;
      remaining-=add;
    }
    return {
      draft, spent:Math.max(0, Number(budget||0)-remaining), remaining
    };
  }

  function openLevelUpOverlay(state) {
    if(!state||!state.player||!canLevelUp(state.player))return;
    state.ui=state.ui||{
    };
    SetLevelUpBaseFeatState(state);
    const preview=buildLevelUpPreview(state.player, state.ui&&state.ui.levelUpDraft||{
    });
    state.ui.levelUpOpen=true;
    state.ui.levelUpDraft=levelUpDraftFromPreview(preview);
    render();
  }

  function closeLevelUpOverlay(state) {
    if(!state||!state.ui)return;
    state.ui.levelUpOpen=false;
    state.ui.levelUpDraft={
    };
    ClearLevelUpBaseFeatState(state);
    render();
  }

  // ---------------------------------------------------------------------------
  // DOM setup and tab rendering
  // ---------------------------------------------------------------------------
  const $app=document.getElementById("app");

  let $tooltip=null;

  let $toast=null;

  let $combatToast=null;

  let $modal=null;

  let toastTimer=null;

  let combatToastHideTimer=null;

  let combatToastAdvanceTimer=null;

  let combatToastActive=false;

  let combatToastBatch=null;

  const combatToastQueue=[];

  function ensureOverlays(){if(!$tooltip){$tooltip=document.createElement("div");$tooltip.id="tooltip";$tooltip.className="tooltip hidden";document.body.appendChild($tooltip);}if(!$toast){$toast=document.createElement("div");$toast.id="toast";$toast.className="toast hidden";$toast.setAttribute("role","status");$toast.setAttribute("aria-live","polite");document.body.appendChild($toast);}if(!$combatToast){$combatToast=document.createElement("div");$combatToast.id="combat_toast";$combatToast.className="combatToast hidden";$combatToast.setAttribute("role","status");$combatToast.setAttribute("aria-live","polite");document.body.appendChild($combatToast);}if(!$modal){$modal=document.createElement("div");$modal.id="modal";$modal.className="modal hidden";$modal.innerHTML=`
          <div class="modalBackdrop" data-modal-backdrop></div>
          <div class="modalCard" role="dialog" aria-modal="true" aria-labelledby="modal_title">
            <div class="modalHeader">
              <div class="modalTitle" id="modal_title">Confirm</div>
            </div>
            <div class="modalBody" id="modal_body"></div>
            <div class="modalActions">
              <button class="btn" id="modal_cancel">Cancel</button>
              <button class="btn primary" id="modal_ok">OK</button>
            </div>
          </div>
        `;document.body.appendChild($modal);}}

  function showTooltip(html,x,y){ensureOverlays();if(!$tooltip)return;$tooltip.innerHTML=html;$tooltip.classList.remove("hidden");const pad=12;const vw=window.innerWidth;const vh=window.innerHeight;$tooltip.style.left="0px";$tooltip.style.top="0px";const rect=$tooltip.getBoundingClientRect();let tx=x+14;let ty=y+14;if(tx+rect.width+pad>vw)tx=Math.max(pad,x-rect.width-14);if(ty+rect.height+pad>vh)ty=Math.max(pad,y-rect.height-14);$tooltip.style.left=`${tx}px`;$tooltip.style.top=`${ty}px`;}

  function hideTooltip() {
    if($tooltip)$tooltip.classList.add("hidden");
  }

  function wireResolvedTooltips(scope, selector, htmlFor) {
    if(!scope)return;
    scope.querySelectorAll(selector).forEach(el=> {
      const buildHtml=()=> {
        try {
          return htmlFor(el)||"";
        } catch(_) {
          return"";
        }
      };
      el.addEventListener("mouseenter", (e)=> {
        const html=buildHtml();
        if(!html)return;
        showTooltip(html, e.clientX, e.clientY);
      });
      el.addEventListener("mousemove", (e)=> {
        const html=buildHtml();
        if(!html)return;
        showTooltip(html, e.clientX, e.clientY);
      });
      el.addEventListener("mouseleave", ()=>hideTooltip());
    });
  }

  function wireStatTooltips(scope){wireResolvedTooltips(scope,"[data-stat-tip]",el=>{const stat=el.getAttribute("data-stat-tip")||"";return`
          <div style="font-weight:700; font-size:13px; margin-bottom:6px">${escapeHtml(fullStatName(stat))} (${escapeHtml(stat)})</div>
          <div class="small muted" style="line-height:1.45">${escapeHtml(STAT_TOOLTIPS[stat] || "")}</div>
        `;});}

  function wireStatusTooltips(scope) {
    wireResolvedTooltips(scope, "[data-status-effect]", el=> {
      const statusId=el.getAttribute("data-status-effect")||"";
      const owner=el.getAttribute("data-status-owner")==="enemy"?(state.combat&&state.combat.enemy):state.player;
      const effect=findStatusEffect(owner, statusId);
      return effect?statusEffectTooltipHtml(effect):"";
    });
  }

  function wireSkillTooltips(scope) {
    wireResolvedTooltips(scope, "[data-skill-tip]", el=>skillTooltipHtml(el.getAttribute("data-skill-tip")||""));
  }

  function wireTextTooltips(scope){wireResolvedTooltips(scope,"[data-tooltip]",el=>{const message=el.getAttribute("data-tooltip")||"";if(!message)return"";return`<div class="small muted" style="line-height:1.45">${escapeHtml(message).replaceAll("\n", "<br/>")}</div>`;});}

  function toast(msg,kind="info"){ensureOverlays();if(!$toast)return;$toast.textContent=msg;$toast.className=`toast ${kind}`;if(toastTimer)clearTimeout(toastTimer);toastTimer=setTimeout(()=>{if($toast)$toast.classList.add("hidden");},2200);}

  function normalizeCombatToastKind(kind) {
    return["good", "miss", "buff", "bad", "neutral"].includes(kind)?kind:"neutral";
  }

  function createCombatToastEntry(message, kind="neutral") {
    const msg=String(message||"").trim();
    if(!msg)return null;
    return {
      msg, kind:normalizeCombatToastKind(kind)
    };
  }

  function clearCombatToastQueue() {
    combatToastQueue.length=0;
    combatToastBatch=null;
    combatToastActive=false;
    if(combatToastHideTimer)clearTimeout(combatToastHideTimer);
    if(combatToastAdvanceTimer)clearTimeout(combatToastAdvanceTimer);
    combatToastHideTimer=null;
    combatToastAdvanceTimer=null;
    if($combatToast) {
      $combatToast.className="combatToast hidden";
      $combatToast.innerHTML="";
    }
  }

  function normalizeCombatToastPhase(phase) {
    return phase==="enemy"||phase==="player"?phase:"round";
  }

  function queueCombatToastPayload(payload) {
    const sections=(Array.isArray(payload&&payload.sections)?payload.sections:[]).map(section=>({
      phase:normalizeCombatToastPhase(section&&section.phase), entries:(Array.isArray(section&&section.entries)?section.entries:[]).map(entry=>createCombatToastEntry(entry&&entry.msg, entry&&entry.kind)).filter(Boolean)
    })).filter(section=>section.entries.length);
    if(!sections.length)return;
    ensureOverlays();
    combatToastQueue.push({
      sections
    });
    if(combatToastQueue.length>12) {
      combatToastQueue.splice(0, combatToastQueue.length-12);
    }
    if(!combatToastActive) {
      showNextCombatToast();
    }
  }

  function queueCombatToastEntries(entries, phase=null) {
    const normalized=(Array.isArray(entries)?entries:[]).map(entry=>createCombatToastEntry(entry&&entry.msg, entry&&entry.kind)).filter(Boolean);
    if(!normalized.length)return;
    queueCombatToastPayload({
      sections:[{
        phase:normalizeCombatToastPhase(phase), entries:normalized
      }]
    });
  }

  function beginCombatToastBatch(phase="round") {
    const normalizedPhase=normalizeCombatToastPhase(phase);
    if(!combatToastBatch) {
      combatToastBatch={
        phase:normalizedPhase, sections:{
          player:[], enemy:[], round:[]
        }
      };
      return;
    }
    combatToastBatch.phase=normalizedPhase;
  }

  function flushCombatToastBatch() {
    if(!combatToastBatch) {
      return;
    }
    queueCombatToastPayload({
      sections:[{
        phase:"player", entries:combatToastBatch.sections.player
      }, {
        phase:"enemy", entries:combatToastBatch.sections.enemy
      }, {
        phase:"round", entries:combatToastBatch.sections.round
      }]
    });
    combatToastBatch=null;
  }

  function showNextCombatToast(){ensureOverlays();if(!$combatToast){combatToastActive=false;return;}const next=combatToastQueue.shift();if(!next){combatToastActive=false;$combatToast.className="combatToast hidden";$combatToast.innerHTML="";return;}const sections=(Array.isArray(next.sections)?next.sections:[]).map(section=>({phase:normalizeCombatToastPhase(section&&section.phase),entries:(Array.isArray(section&&section.entries)?section.entries:[]).map(entry=>createCombatToastEntry(entry&&entry.msg,entry&&entry.kind)).filter(Boolean)})).filter(section=>section.entries.length);if(!sections.length){combatToastActive=false;showNextCombatToast();return;}const entries=sections.flatMap(section=>section.entries);combatToastActive=true;$combatToast.className="combatToast";$combatToast.innerHTML="";const fragment=document.createDocumentFragment();const showLabels=sections.length>1;for(const section of sections){const phaseLabel=section.phase==="player"?"Player actions":section.phase==="enemy"?"Enemy actions":"";if(showLabels&&phaseLabel){const label=document.createElement("div");label.className="combatToastLabel";label.textContent=phaseLabel;fragment.appendChild(label);}for(const entry of section.entries){const row=document.createElement("div");row.className=`combatToastEntry ${normalizeCombatToastKind(entry.kind)}`;row.textContent=entry.msg;fragment.appendChild(row);}}$combatToast.appendChild(fragment);requestAnimationFrame(()=>{if($combatToast)$combatToast.classList.add("show");});const totalChars=entries.reduce((sum,entry)=>sum+entry.msg.length,0);const displayDuration=clamp(1750+Math.max(0,entries.length-1)*650+Math.floor(totalChars/68)*160,1800,5200);const hideDelay=Math.max(1250,displayDuration-180);combatToastHideTimer=setTimeout(()=>{if($combatToast)$combatToast.classList.remove("show");},hideDelay);combatToastAdvanceTimer=setTimeout(()=>{if($combatToast){$combatToast.className="combatToast hidden";$combatToast.innerHTML="";}combatToastActive=false;combatToastHideTimer=null;combatToastAdvanceTimer=null;showNextCombatToast();},displayDuration);}

  function combatToast(message, kind="neutral") {
    const entry=createCombatToastEntry(message, kind);
    if(!entry)return;
    if(combatToastBatch) {
      combatToastBatch.sections[normalizeCombatToastPhase(combatToastBatch.phase)].push(entry);
      return;
    }
    queueCombatToastEntries([entry]);
  }

  function confirmDialog({title="Confirm",message="",okText="OK",cancelText="Cancel",okKind="primary",cancelKind=""}={}){ensureOverlays();return new Promise(resolve=>{const modal=$modal;const titleEl=modal.querySelector("#modal_title");const bodyEl=modal.querySelector("#modal_body");const okBtn=modal.querySelector("#modal_ok");const cancelBtn=modal.querySelector("#modal_cancel");const backdrop=modal.querySelector("[data-modal-backdrop]");titleEl.textContent=title;bodyEl.textContent=message;okBtn.textContent=okText;okBtn.className=okKind?`btn ${okKind}`:"btn";cancelBtn.className=cancelKind?`btn ${cancelKind}`:"btn";if(cancelText===null){cancelBtn.style.display="none";}else{cancelBtn.style.display="";cancelBtn.textContent=cancelText;}const cleanup=(val)=>{modal.classList.add("hidden");okBtn.onclick=null;cancelBtn.onclick=null;backdrop.onclick=null;document.removeEventListener("keydown",onKey);resolve(val);};const onKey=(e)=>{if(e.key==="Escape")cleanup(false);};okBtn.onclick=()=>cleanup(true);cancelBtn.onclick=()=>cleanup(false);backdrop.onclick=()=>cleanup(false);document.addEventListener("keydown",onKey);modal.classList.remove("hidden");});}

  function alertDialog({
    title="Error", message="", okText="OK"
  }
  ={
  }) {
    return confirmDialog({
      title, message, okText, cancelText:null
    });
  }

  let state=load()||defaultState();

  normalizeState(state);

  function normalizeState(st) {
    st.version=SAVE_VERSION;
    st.ui=asPlainObject(st.ui)||{
    };
    if(st.ui.selectedTile===undefined)st.ui.selectedTile=null;
    if(!st.ui.skillDraft)st.ui.skillDraft={
    };
    if(typeof st.ui.selectedTownNpcId!=="string")st.ui.selectedTownNpcId="";
    if(st.ui.questListMode!=="completed")st.ui.questListMode="active";
    if(typeof st.ui.levelUpOpen!=="boolean")st.ui.levelUpOpen=false;
    if(!st.ui.levelUpDraft||typeof st.ui.levelUpDraft!=="object")st.ui.levelUpDraft={
    };
    if(st.ui.shopMode!=="sell")st.ui.shopMode="buy";
    if(typeof st.ui.saveToolsVisible!=="boolean")st.ui.saveToolsVisible=false;
    if(typeof st.ui.mobileActionsVisible!=="boolean")st.ui.mobileActionsVisible=false;
    if(!Object.values(MAP_CAMERA_MODES).includes(st.ui.mapCameraMode))st.ui.mapCameraMode=MAP_CAMERA_MODES.fixed;
    if(!Object.values(LOG_MODES).includes(st.ui.logMode))st.ui.logMode=GAME_CONFIG.defaultLogMode;
    if(!st.ui.mapViewByArea||typeof st.ui.mapViewByArea!=="object")st.ui.mapViewByArea={
    };
    if(!st.ui.combatNotice||typeof st.ui.combatNotice!=="object")st.ui.combatNotice=null;
    if(!st.ui.randomEventPrompt||typeof st.ui.randomEventPrompt!=="object")st.ui.randomEventPrompt=null;
    st.ui.inventorySort=normalizeSortConfig(st.ui.inventorySort, "name");
    st.ui.shopBuySort=normalizeSortConfig(st.ui.shopBuySort, "name");
    st.ui.shopSellSort=normalizeSortConfig(st.ui.shopSellSort, "name");
    const validTabs=new Set(["explore", "town", "quests", "combat", "character", "inventory", "crafting", "shop", "log", "settings"]);
    if(!validTabs.has(st.tab))st.tab="explore";
    st.world=asPlainObject(st.world)||{
      areaId:"town", areas:{
      }
    };
    st.world.areas=asPlainObject(st.world.areas)||{
    };
    st.world.day=Math.max(1, Number(st.world.day||1));
    if(!st.world.areaId)st.world.areaId="town";
    st.world.areaUnlocks=(st.world.areaUnlocks&&typeof st.world.areaUnlocks==="object")?st.world.areaUnlocks:defaultAreaUnlocks();
    st.world.areaUnlocks.woods=true;
    st.quests=normalizeQuestJournalState(st.quests);
    st.cooldowns=asPlainObject(st.cooldowns)||{
    };
    st.cooldowns.shortRestReadyAt=Math.max(0, Number(st.cooldowns.shortRestReadyAt||0));
    if(st.player!==null&&!asPlainObject(st.player))st.player=null;
    if(st.combat!==null&&!asPlainObject(st.combat))st.combat=null;
    for(const areaDef of AREAS) {
      if(!areaDef.map||areaDef.id==="woods")continue;
      if(areaDef.id===st.world.areaId)st.world.areaUnlocks[areaDef.id]=true;
      const knownAreaState=st.world.areas[areaDef.id];
      if(knownAreaState&&Array.isArray(knownAreaState.tiles)&&knownAreaState.tiles.length)st.world.areaUnlocks[areaDef.id]=true;
    }
    st.log=Array.isArray(st.log)?st.log:[];
    ensureRandomEventState(st);
    if(st.player) {
      const p=st.player;
      p.name=typeof p.name==="string"&&p.name.trim()?p.name.trim():"Adventurer";
      p.raceId=RACES.some(race=>race.id===p.raceId)?p.raceId:"human";
      const normalizedLevels=Object.fromEntries(Object.keys(CLASSES).map(classId=>[classId, Math.max(0, Number(p.levels&&p.levels[classId]||0))]));
      if(!Object.values(normalizedLevels).some(level=>level>0)) {
        const fallbackClassId=(typeof p.startingClassId==="string"&&CLASSES[p.startingClassId])?p.startingClassId:(typeof p.classId==="string"&&CLASSES[p.classId]?p.classId:"Fighter");
        normalizedLevels[fallbackClassId]=1;
      }
      p.levels=normalizedLevels;
      const normalizedStats={
      };
      for(const statId of STATS) {
        normalizedStats[statId]=Math.max(1, Number(p.stats&&p.stats[statId]||10));
      }
      p.stats=normalizedStats;
      const hpMax=Math.max(1, Number(p.hp&&p.hp.max||0)||(CLASSES[p.startingClassId]||CLASSES[mainClass(p)]||CLASSES.Fighter).hpPerLevel+statMod(p.stats.CON));
      const spMax=Math.max(1, Number(p.sp&&p.sp.max||0)||(CLASSES[p.startingClassId]||CLASSES[mainClass(p)]||CLASSES.Fighter).spPerLevel+Math.max(0, statMod(p.stats.WIS)));
      p.hp={
        current:Math.max(0, Math.min(hpMax, Number(p.hp&&p.hp.current!=null?p.hp.current:hpMax))), max:hpMax
      };
      p.sp={
        current:Math.max(0, Math.min(spMax, Number(p.sp&&p.sp.current!=null?p.sp.current:spMax))), max:spMax
      };
      p.xp=Math.max(0, Number(p.xp||0));
      p.moneyCp=Math.max(0, Math.floor(Number(p.moneyCp||0)));
      p.discovered=asPlainObject(p.discovered)||{
      };
      p.titles=normalizePlayerTitles(p.titles);
      if(typeof p.activeTitle==="string"&&p.activeTitle.trim()) {
        const activeTitle=p.activeTitle.trim();
        if(!p.titles.includes(activeTitle))p.titles.push(activeTitle);
        p.activeTitle=activeTitle;
      } else {
        p.activeTitle=p.titles[0]||"";
      }
      const legacySkillBase=(p.skillBase&&typeof p.skillBase==="object")?p.skillBase:null;
      const validSkillIds=new Set(SKILLS.map(s=>s.id));
      if(typeof p.startingSkillId!=="string"||!validSkillIds.has(p.startingSkillId)) {
        p.startingSkillId=legacySkillBase?(SKILLS.find(sk=>Number(legacySkillBase[sk.id]||0)>0)?.id||null):null;
      }
      if(!asPlainObject(p.skillProficiency))p.skillProficiency=Object.fromEntries(SKILLS.map(s=>[s.id, 0]));
      if(typeof p.startingClassId!=="string"||!CLASSES[p.startingClassId]) {
        p.startingClassId=Object.entries(p.levels||{
        }).find(([, lvl])=>Number(lvl||0)>0)?.[0]||mainClass(p);
      }
      p.damageResistance=createDamageResistanceMap(p.damageResistance||{
      });
      p.statusEffects=Array.isArray(p.statusEffects)?p.statusEffects:[];
      p.statusEffects=p.statusEffects.map(effect=>normalizeStatusEffect(effect));
      syncPlayerAbilityIdsForLevels(p);
      for(const sk of SKILLS) {
        const v=Number(p.skillProficiency[sk.id]||0);
        const base=legacySkillBase?Number(legacySkillBase[sk.id]||0):0;
        const merged=Math.max(0, (isFinite(v)?v:0)+(isFinite(base)?base:0));
        p.skillProficiency[sk.id]=Math.min(skillProficiencyCap(p, sk.id), merged);
      }
      delete p.skillBase;
      p.skillPoints=Math.max(0, Number(p.skillPoints||0));
      p.equipment=sanitizeEquipmentState(p.equipment);
      p.inventory=sanitizeInventoryEntries(p.inventory);
      const equippedIds=Object.values(p.equipment).filter(Boolean);
      for(const iid of equippedIds) {
        if(hasItem(p, iid, 1)) {
          removeItem(p, iid, 1);
        }
      }
      validateEquippedItems(p);
    }
    if(st.combat&&st.combat.enemy) {
      const enemy=st.combat.enemy;
      enemy.traits=Array.isArray(enemy.traits)?enemy.traits:[];
      enemy.status=Array.isArray(enemy.status)?enemy.status.map(entry=>({
        ...entry, id:normalizeSaveId(entry&&(entry.id||entry.label||entry.saveId||"")), dc:Number(entry&&entry.dc||0), label:entry&&entry.label?entry.label:saveLabel(entry&&(entry.id||entry.label||entry.saveId||""))
      })):[];
      enemy.statusEffects=Array.isArray(enemy.statusEffects)?enemy.statusEffects.map(effect=>normalizeStatusEffect(effect)):[];
      st.combat.playerFlags=st.combat.playerFlags&&typeof st.combat.playerFlags==="object"?st.combat.playerFlags:{
      };
    }
    if(st.ui.randomEventPrompt&&!findRandomEventEntry(st, st.ui.randomEventPrompt.instanceId)) {
      st.ui.randomEventPrompt=null;
    }
    const townNpcIds=townNpcDefinitions("town").map(npc=>npc.id);
    if(!townNpcIds.includes(st.ui.selectedTownNpcId))st.ui.selectedTownNpcId=townNpcIds[0]||"";
  }

  function captureWindowScroll() {
    return {
      x:Math.max(0, Number(window.scrollX||window.pageXOffset||0)), y:Math.max(0, Number(window.scrollY||window.pageYOffset||0))
    };
  }

  function restoreWindowScroll(pos) {
    if(!pos)return;
    const left=Math.max(0, Number(pos.x||0));
    const top=Math.max(0, Number(pos.y||0));
    requestAnimationFrame(()=> {
      requestAnimationFrame(()=> {
        window.scrollTo(left, top);
      });
    });
  }

  function isCompactViewport() {
    return window.innerWidth<=900;
  }

  function wireCreatorSelectBehavior(selectEl) {
    if(!selectEl)return;
    const blurKeyboardInput=()=> {
      if(!isCompactViewport())return;
      const active=document.activeElement;
      if(!active||!(active instanceof HTMLElement)||active===selectEl)return;
      if(active.isContentEditable||active.tagName==="TEXTAREA") {
        active.blur();
        return;
      }
      if(active.tagName!=="INPUT")return;
      const type=String(active.getAttribute("type")||"text").toLowerCase();
      if(["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"].includes(type))return;
      active.blur();
    };
    selectEl.addEventListener("pointerdown", blurKeyboardInput, {
      passive:true
    });
    selectEl.addEventListener("touchstart", blurKeyboardInput, {
      passive:true
    });
    selectEl.addEventListener("focus", blurKeyboardInput);
  }

  function renderTopbarResourceBar(kind,label,valueLabel,percent){const safePercent=clamp(Math.round(Number(percent||0)),0,100);const text=String(valueLabel==null?"":valueLabel);return`
        <div class="bar ${escapeHtml(kind)}" role="img" aria-label="${escapeHtml(label + " " + text)}">
          <div class="fill" style="width:${safePercent}%"></div>
          <div class="barlabel">
            <span>${escapeHtml(label)}</span>
            <span class="mono">${escapeHtml(text)}</span>
          </div>
        </div>
      `;}

  function renderCharacterCreator(){const scrollPos=captureWindowScroll();hideTooltip();const stats=state._draftStats||{STR:8,DEX:8,CON:8,INT:8,WIS:8,CHA:8};const rawDraft=state._draft||{name:"",raceId:"human",classId:"Fighter",abilityId:normalizeOptionalAbilityChoiceForClass("Fighter",null)};const classId=CLASSES[rawDraft.classId]?rawDraft.classId:"Fighter";const draft={name:rawDraft.name||"",raceId:"human",classId,abilityId:normalizeOptionalAbilityChoiceForClass(classId,rawDraft.abilityId)};state._draft={...draft};const skillDraft=sanitizeSkillDraft(state._draftSkills||{});state._draftSkills={...skillDraft};const cost=totalPointCost(stats);const remaining=POINT_BUY_TOTAL-cost;const skillPool=startingSkillPointPoolForClass(draft.classId,stats);const draftSpent=Object.values(skillDraft).reduce((a,b)=>a+(b||0),0);const skillAvailable=skillPool-draftSpent;const previewClass=CLASSES[draft.classId];const previewHp=Math.max(1,previewClass.hpPerLevel+statMod(stats.CON));const previewSp=Math.max(1,previewClass.spPerLevel+Math.max(0,statMod(stats.WIS)));const previewHpCap=Math.max(...Object.values(CLASSES).map(cls=>Math.max(1,cls.hpPerLevel+statMod(stats.CON))));const previewSpCap=Math.max(...Object.values(CLASSES).map(cls=>Math.max(1,cls.spPerLevel+Math.max(0,statMod(stats.WIS)))));const previewHpWidth=Math.max(38,Math.round((previewHp/previewHpCap)*100));const previewSpWidth=Math.max(38,Math.round((previewSp/previewSpCap)*100));const creatorNameLabel=(draft.name||"").trim()||"New Adventurer";const startingSkillId=CLASSES[draft.classId].startingTrainedSkill||null;const startSkillText=skillAvailable<0?`Reduce pending skill training by <strong>${Math.abs(skillAvailable)}</strong> point${Math.abs(skillAvailable) === 1 ? "" : "s"} before beginning.`:skillAvailable>0?`You still have <strong>${skillAvailable}</strong> unspent skill point${skillAvailable === 1 ? "" : "s"}. You can begin now and spend them later from the Character tab.`:`All starting skill points are assigned.`;const creatorClassFeatPreview=buildCreatorClassFeatSnapshot(draft.classId,state._draftClassFeat||{});state._draftClassFeat={...creatorClassFeatPreview.ranks};$app.innerHTML=`
        <div class="topbar creatorTopbar">
          <div class="topbarLead">
            <div class="title">
              <h1>Findpather Solus - ALPHA</h1>
              <div class="subtitle">So you want to be an adventurer...</div>
            </div>
          </div>

          <div class="bars">
            ${renderTopbarResourceBar("hp", "HP", previewHp, previewHpWidth)}
            ${renderTopbarResourceBar("sp", "SP", previewSp, previewSpWidth)}
          </div>

          <div class="topmeta creatorTopmeta">
            <span class="pill"><strong id="creator_name_preview">${escapeHtml(creatorNameLabel)}</strong> <span>Lv 1</span></span>
            <span class="pill"><span class="muted">Class</span> <strong>${escapeHtml(draft.classId)}</strong></span>
            <span class="pill"><span class="muted">Ability Pts</span> <strong class="mono">${remaining}</strong></span>
            <span class="pill"><span class="muted">Skill Pts</span> <strong class="mono">${skillAvailable}</strong></span>
          </div>
        </div>

        <div class="creatorWrap">
          <div class="creatorCard">
            <header>
              <h2>Character Creation</h2>
              <p>Create your adventurer. Every detail is important!</p>
            </header>
            <div class="body">
              <div class="creatorLayout">
                <div class="creatorColumn creatorColumnLeft">
                  <div class="field creatorFieldCard creatorName">
                    <header><strong>Name</strong></header>
                    <input id="cc_name" type="text" maxlength="24" placeholder="e.g., John FindPather" value="${escapeHtml(draft.name)}"/>
                  </div>

                  <div class="field creatorFieldCard creatorRace">
                    <header><strong>Race</strong></header>
                    <select id="cc_race" disabled>
                      <option value="human">Human</option>
                    </select>
                    <div class="small muted" style="margin-left:5px; line-height:1.5">The world is young, <strong>Humans</strong> rule the world for now.</div>
                  </div>

                  <div class="field creatorFieldCard creatorClass">
                    <header><strong>Class</strong></header>
                    <select id="cc_class">
                      ${Object.keys(CLASSES).map(cid => `<option value="${cid}" ${cid === draft.classId ? "selected" : ""}>${cid}</option>`).join("")}
                    </select>
                  </div>

                  <div class="panel creatorPreview">
                    <header><h2>Class Preview</h2><div class="hint">Each class is a bit different, choose wisely!</div></header>
                    <div class="body" id="class_preview"></div>
                  </div>
                </div>

                <div class="creatorColumn creatorColumnRight">
                  <div class="panel creatorScores">
                    <header>
                      <h2>Ability Scores</h2>
                      <span class="pill"><span class="muted">Ability Points Available</span> <strong class="mono">${remaining}</strong></span>
                    </header>
                    <div class="body" id="pb_list"></div>
                  </div>

                  <div class="panel creatorSkills">
                    <header><h2>Skills</h2><span class="pill"><span class="muted">Skill Points available</span> <strong class="mono">${skillAvailable}</strong></span></header>
                    
                    <div class="body">
                      <div class="small muted" style="line-height:1.5; margin-bottom:10px">
                        ${startingSkillId ? `${escapeHtml(startingSkillId)} is your class-trained skill and begins at <strong>+2 proficiency</strong>.` : `Allocate your starting skill points here.`}
                      </div>
                      <div class="tableWrap">
                        <table class="table">
                          <thead>
                            <tr>
                              <th>Skill</th><th>Base</th><th>Prof</th><th>Total</th><th>Train</th>
                            </tr>
                          </thead>
                          <tbody id="cc_skill_list"></tbody>
                        </table>
                      </div>
                      <div class="small muted" style="margin-top:10px; line-height:1.5">
                        Unspent Skill points will still be available for later if you don't want to choose now!
                      </div>
                    </div>
                  </div>
                  <div class="panel creatorStart">
                    <header><h2>Start</h2><div class="hint">Your first steps into Astaria…</div></header>
                    <div class="body">
                      <div class="small muted" style="line-height:1.5">
                        <div>• You will start with basic gear, a healing potion, and a bit of coin.</div>
                        <div>• You can explore by moving around a fog-of-war map, gathering resources, and fighting monsters.</div>
                        <div>• Short rests recover some HP/SP on a cooldown; long rests are in town.</div>
                      </div>
                      <div class="small muted" style="margin-top:12px; line-height:1.5">${startSkillText}</div>
                      <div style="display:flex; gap:10px; margin-top:12px; flex-wrap:wrap">
                        <button class="btn primary" id="cc_start">Begin Adventure</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;const pbList=document.getElementById("pb_list");pbList.innerHTML=STATS.map(stat=>{const v=stats[stat];const canDec=v>8;const canInc=v<15&&(totalPointCost({...stats,[stat]:v+1})<=POINT_BUY_TOTAL);return`
          <div class="pointBuyRow">
            <div style="display:flex; align-items:center">
              <span class="badge statHint" data-stat-tip="${stat}">${fullStatName(stat)}</span>
            </div>
            <div class="pbControls">
              <button class="iconbtn" data-act="dec" data-stat="${stat}" ${canDec ? "" : "disabled"}>−</button>
              <span style="min-width:18px; text-align:center">${v}</span>
              <button class="iconbtn" data-act="inc" data-stat="${stat}" ${canInc ? "" : "disabled"}>+</button>
              <span class="muted" style="min-width:50px; text-align:right">(${fmtSigned(statMod(v))})</span>
            </div>
          </div>
        `;}).join("");pbList.querySelectorAll("button[data-act]").forEach(btn=>{btn.addEventListener("click",()=>{const act=btn.getAttribute("data-act");const stat=btn.getAttribute("data-stat");const cur=stats[stat];let next=cur;if(act==="dec")next=Math.max(8,cur-1);if(act==="inc")next=Math.min(15,cur+1);const candidate={...stats,[stat]:next};if(totalPointCost(candidate)<=POINT_BUY_TOTAL){state._draftStats=candidate;renderCharacterCreator();}});});const skillList=document.getElementById("cc_skill_list");skillList.innerHTML=SKILLS.map(sk=>{const base=statMod(stats[sk.stat]);const proficiency=startingSkillId===sk.id?2:0;const pending=skillDraft[sk.id]||0;const total=base+proficiency+pending;const cap=skillProficiencyCap({startingSkillId},sk.id);const canDec=pending>0;const canInc=skillAvailable>0&&(proficiency+pending)<cap;const pendingLabel=pending>0?`+${pending}`:"0";return`
          <tr>
            <td class="skillHint" data-skill-tip="${sk.id}">${sk.id}</td>
            <td class="mono">${fmtSigned(base)}</td>
            <td class="mono">${proficiency}</td>
            <td class="mono">${fmtSigned(total)}</td>
            <td>
              <div class="trainControls">
                <button class="btn ghost" data-creator-skill="${sk.id}" data-dir="dec" ${canDec ? "" : "disabled"}>−</button>
                <span class="pendingBadge ${pending ? "active" : ""}">${pendingLabel}</span>
                <button class="btn ghost" data-creator-skill="${sk.id}" data-dir="inc" ${canInc ? "" : "disabled"}>+</button>
              </div>
            </td>
          </tr>
        `;}).join("");skillList.querySelectorAll("button[data-creator-skill]").forEach(btn=>{btn.addEventListener("click",()=>{const skillId=btn.getAttribute("data-creator-skill");const dir=btn.getAttribute("data-dir");const nextDraft=sanitizeSkillDraft(state._draftSkills||{});const spent=Object.values(nextDraft).reduce((a,b)=>a+(b||0),0);const available=startingSkillPointPoolForClass(draft.classId,stats)-spent;const proficiency=startingSkillId===skillId?2:0;const pending=nextDraft[skillId]||0;const cap=skillProficiencyCap({startingSkillId},skillId);if(dir==="inc"){if(available<=0)return;if((proficiency+pending)>=cap){toast(`You can't raise ${skillId} above ${cap} proficiency.`,"warn");return;}nextDraft[skillId]=pending+1;state._draftSkills=nextDraft;renderCharacterCreator();return;}if(pending<=0)return;if(pending===1)delete nextDraft[skillId];else nextDraft[skillId]=pending-1;state._draftSkills=nextDraft;renderCharacterCreator();});});const nameEl=document.getElementById("cc_name");const creatorNamePreviewEl=document.getElementById("creator_name_preview");nameEl.addEventListener("input",()=>{const currentDraft=state._draft||draft;const nextName=nameEl.value;state._draft={...currentDraft,name:nextName};if(creatorNamePreviewEl){creatorNamePreviewEl.textContent=nextName.trim()||"New Adventurer";}});const classEl=document.getElementById("cc_class");wireCreatorSelectBehavior(document.getElementById("cc_race"));wireCreatorSelectBehavior(classEl);classEl.addEventListener("change",()=>{const currentDraft=state._draft||draft;const nextClassId=classEl.value;const nextAbilityId=normalizeOptionalAbilityChoiceForClass(nextClassId,currentDraft.abilityId);state._draft={...currentDraft,name:nameEl.value,classId:nextClassId,abilityId:nextAbilityId};renderCharacterCreator();});const preview=document.getElementById("class_preview");preview.innerHTML=renderClassPreview(draft.classId,stats);preview.querySelectorAll('input[name="cc_optional_ability"]').forEach(input=>{input.addEventListener("change",()=>{if(!input.checked)return;const currentDraft=state._draft||draft;state._draft={...currentDraft,name:nameEl.value,classId:classEl.value,abilityId:input.value};renderCharacterCreator();});});bindClassFeatUiHandlers(document.getElementById("creator_class_feat_section"),"creator");wireAbilityTooltips($app);wireStatTooltips($app);wireSkillTooltips($app);wireTextTooltips($app);restoreWindowScroll(scrollPos);document.getElementById("cc_start").addEventListener("click",()=>{const currentDraft=state._draft||draft;const nm=(nameEl.value||currentDraft.name||"").trim();const selectedClassId=classEl.value||currentDraft.classId||"Fighter";const selectedAbilityEl=preview.querySelector('input[name="cc_optional_ability"]:checked');const selectedAbilityId=selectedAbilityEl?selectedAbilityEl.value:normalizeOptionalAbilityChoiceForClass(selectedClassId,currentDraft.abilityId);const initialSkillDraft=sanitizeSkillDraft(state._draftSkills||{});const initialClassFeatDraft=buildCreatorClassFeatSnapshot(selectedClassId,state._draftClassFeat||{}).ranks;if(!nm){alertDialog({title:"Can't begin adventure",message:"Please enter a Name before beginning."});return;}if(remaining!==0){if(remaining>0)alertDialog({title:"Can't begin adventure",message:`Spend all point-buy points before beginning (${remaining} remaining).`});else alertDialog({title:"Can't begin adventure",message:"You have overspent point-buy points. Reduce some scores."});return;}if(skillAvailable<0){alertDialog({title:"Can't begin adventure",message:`You have overspent skill training by ${Math.abs(skillAvailable)} point${Math.abs(skillAvailable) === 1 ? "" : "s"}. Remove some training before beginning.`});return;}state.player=createNewPlayer({name:nm,raceId:"human",classId:selectedClassId,stats,abilityId:selectedAbilityId,skillDraft:initialSkillDraft,classFeatDraft:initialClassFeatDraft});state.world.areaId="town";state.world.day=1;state.world.areas={};state.world.areaUnlocks=defaultAreaUnlocks();state.world.randomEvents={};regenerateDailyRandomEvents(state);state.log=[];state.tab="explore";state.combat=null;state.ui.combatNotice=null;state.ui.randomEventPrompt=null;state.cooldowns.shortRestReadyAt=0;delete state._draft;delete state._draftStats;delete state._draftSkills;delete state._draftClassFeat;log(state,`Welcome to Astaria, ${state.player.name}.`);log(state,`You are a Human ${selectedClassId}.`);const defaultAbilityId=defaultStartingAbilityIdForClass(selectedClassId);if(defaultAbilityId){log(state,`Starting class ability: ${getAbility(defaultAbilityId).name}.`);}if(selectedAbilityId){log(state,`Optional level 1 ability selected: ${getAbility(selectedAbilityId).name}.`);}const initialSkillSummary=summarizeSkillDraft(initialSkillDraft);if(initialSkillSummary.length){log(state,`Starting skill training assigned: ${initialSkillSummary.join(", ")}.`);}save(state);render();});}

  function renderActionsMenu(){return`
        <div class="actionsMenu">
          <div class="actionsNav">
            ${tabButton("explore", "Explore")}
            ${tabButton("town", "Town", (state.world.areaId !== "town"))}
            ${tabButton("quests", "Quests")}
            ${tabButton("combat", "Combat", !state.combat)}
            ${tabButton("character", "Character")}
            ${tabButton("inventory", "Inventory")}
            ${tabButton("crafting", "Crafting")}
            ${tabButton("shop", "Shop", (state.world.areaId !== "town"))}
            ${tabButton("settings", "Settings")}
          </div>
          <div class="sidebarDivider"></div>
          <div class="saveToolsWrap">
            <button class="tabbtn mini saveToggleBtn" data-ui-action="toggle-save-tools">${state.ui.saveToolsVisible ? "Hide Save Menu" : "Save Menu"}</button>
            ${state.ui.saveToolsVisible ? `
              <div class="saveToolsGrid">
                <button class="tabbtn mini filledGrey" data-ui-action="save">Save</button>
                <button class="tabbtn mini filledGrey" data-ui-action="export">Export Save</button>
                <button class="tabbtn mini filledGrey" data-ui-action="import">Import Save</button>
                <button class="tabbtn mini filledDanger" data-ui-action="new">New Game</button>
              </div>
            ` : ``}
          </div>
        </div>
      `;}

  function renderRandomEventOverlay(){const active=getActiveRandomEvent(state);if(!active)return"";const{template}=active;const dc=randomEventDc(state,template);const bonus=skillTotal(state.player,template.skill);const riskLabel=`${template.failDamage || "1d4"} ${formatDamageTypeLabel(template.failDamageType || "damage")}`;return`
        <div class="centerOverlay">
          <div class="centerOverlayBackdrop"></div>
          <div class="centerCard eventCard" role="dialog" aria-modal="true" aria-labelledby="random_event_title">
            <div class="centerCardHeader">
              <div>
                <div class="centerCardEyebrow">Random Event</div>
                <h3 class="centerCardTitle" id="random_event_title">${escapeHtml(template.title)}</h3>
              </div>
              <span class="pill"><span class="muted">Day</span> <strong class="mono">${state.world.day}</strong></span>
            </div>
            <div class="centerCardBody">
              <div class="centerCardSummary">${escapeHtml(template.description)}</div>
              <div class="eventPromptMeta">
                <span class="badge">${escapeHtml(template.skill)} check</span>
                <span class="badge">Bonus ${fmtSigned(bonus)}</span>
                <span class="badge">DC ${dc}</span>
              </div>
              <div class="small muted" style="line-height:1.5; margin-top:10px">Success grants ${escapeHtml(template.rewardHint || "a small reward")}. Failure deals a little damage (${escapeHtml(riskLabel)}). You can also ignore the event and move on.</div>
            </div>
            <div class="centerCardActions">
              <button class="btn" data-ui-action="ignore-random-event">Ignore</button>
              <button class="btn primary" data-ui-action="attempt-random-event">Attempt ${escapeHtml(template.skill)}</button>
            </div>
          </div>
        </div>
      `;}

  function renderGame(){ensureAreaGenerated(state,state.world.areaId);const player=state.player;const tl=totalLevel(player);const area=getArea(state.world.areaId);const invSlots=calcInventorySlots(player);const ac=calcAC(player);const ap=attackProfile(player);const levelUpPreview=canLevelUp(player)?buildLevelUpPreview(player,state.ui&&state.ui.levelUpDraft||{}):null;if(levelUpPreview){state.ui.levelUpDraft=levelUpDraftFromPreview(levelUpPreview);}else{state.ui.levelUpOpen=false;state.ui.levelUpDraft={};}$app.innerHTML=`
        <div class="topbar">
          <div class="topbarLead">
            <div class="title">
              <h1>Findpather Solus</h1>
              <div class="subtitle">A d20 adventure simulator</div>
            </div>
          </div>

          <div class="bars">
            ${renderTopbarResourceBar("hp", "HP", `${player.hp.current}/${player.hp.max}`, Math.round((player.hp.current / Math.max(1, player.hp.max)) * 100))}
            ${renderTopbarResourceBar("sp", "SP", `${player.sp.current}/${player.sp.max}`, Math.round((player.sp.current / Math.max(1, player.sp.max)) * 100))}
          </div>

          <div class="topmeta">
            <span class="pill"><strong>${player.name}</strong> <span>Lv ${tl}</span></span>
            <span class="pill"><span class="muted">${area.name}</span></span>
            <span class="pill"><span class="muted">Day</span> <strong class="mono">${state.world.day}</strong></span>
            <span class="pill"><span class="muted">Money</span> <strong class="mono">${formatCoins(player.moneyCp)}</strong></span>
            <button class="btn topmetaDesktopAction" data-ui-action="short-rest">Short Rest</button>
            <button class="btn topmetaDesktopAction" data-ui-action="long-rest" ${state.world.areaId === "town" ? "" : "disabled"}>Long Rest</button>
            <div class="topmetaActionsRow">
              <button class="btn mobileActionsToggle" data-ui-action="toggle-mobile-actions" aria-label="${state.ui.mobileActionsVisible ? "Hide menu" : "Show menu"}" aria-expanded="${state.ui.mobileActionsVisible ? "true" : "false"}">Menu</button>
              <button class="btn" data-ui-action="short-rest">Short Rest</button>
              <button class="btn" data-ui-action="long-rest" ${state.world.areaId === "town" ? "" : "disabled"}>Long Rest</button>
            </div>
          </div>
        </div>

        <div class="mobileActionsDock ${state.ui.mobileActionsVisible ? "" : "hidden"}">
          <div class="mobileActionsInner">
            <div class="panel mobileActionsPanel">
              <header><h2>Menu</h2><div class="hint">Explore, town, quests, settings</div></header>
              <div class="body">
                ${renderActionsMenu()}
              </div>
            </div>
          </div>
        </div>

        <div class="content">
          <div class="panel sidebar sidebarDesktop">
            <header><h2>Menu</h2><div class="hint"></div></header>
            <div class="body">
              ${renderActionsMenu()}
            </div>
          </div>

          <div class="panel main">
            <header><h2 id="main_title"></h2><div class="hint" id="main_hint"></div></header>
            <div class="body" id="main_body"></div>
          </div>

          <div class="panel right">
            <header><h2>Character Sheet</h2><div class="hint">quick view</div></header>
            <div class="body">
              <div class="kv"><div class="k">Race</div><div class="v">${RACES.find(r => r.id === player.raceId)?.name || "Human"}</div></div>
              <div class="kv"><div class="k">Class levels</div><div class="v">${renderLevels(player)}</div></div>
              <div class="kv"><div class="k">Title</div><div class="v">${activePlayerTitle(player) ? escapeHtml(activePlayerTitle(player)) : "—"}</div></div>
              <div class="kv"><div class="k">Armor Class</div><div class="v">${ac}</div></div>
              <div class="kv"><div class="k">Attack</div><div class="v">${ap.weaponName} <span class="muted">(${fmtSigned(ap.attackBonus)})</span></div></div>
              <div class="kv"><div class="k">Damage</div><div class="v">${ap.damageExpr} ${ap.damageType}</div></div>
              <div class="kv"><div class="k">Fort / Ref / Will</div><div class="v">${fmtSigned(saveTotal(player, "fort"))} / ${fmtSigned(saveTotal(player, "reflex"))} / ${fmtSigned(saveTotal(player, "will"))}</div></div>
              <div class="kv"><div class="k">Inventory</div><div class="v">${invSlots.used}/${invSlots.max} slots${invSlots.bonus ? ` <span class="muted">(+${invSlots.bonus} carry)</span>` : ""}</div></div>
              <div class="kv" style="align-items:flex-start"><div class="k">Abilities</div><div class="v" style="max-width:220px">${renderPlayerAbilityBadgeList(player, { emptyText: "None" })}</div></div>
              <div class="kv" style="align-items:flex-start"><div class="k">Status Effects</div><div class="v" style="max-width:220px">${renderStatusEffectBadges(player, "None")}</div></div>
              <div class="kv" style="align-items:flex-start"><div class="k">Resistances</div><div class="v" style="max-width:220px">${renderResistanceBadgeList(player, "None")}</div></div>
              <div class="kv"><div class="k">XP</div><div class="v">${isMaxLevel(player) ? `${player.xp} <span class="badge">Max Level ${maxLevelCap()}</span>` : `${player.xp} / ${xpToNextLevel(player)} ${canLevelUp(player) ? '<span class="badge warn">Level Up Ready</span>' : ''}`}</div></div>
              ${isMaxLevel(player) ? `<div class="small muted" style="margin-top:10px; line-height:1.45">You have reached the current level cap of ${maxLevelCap()}. Increase <span class="mono">GAME_CONFIG.maxLevel</span> to raise it later.</div>` : canLevelUp(player) ? `<div class="small muted" style="margin-top:10px; line-height:1.45">You have enough experience to level up. Open the Character tab to choose your class advance, spend this level's rewards, and confirm the change.</div>` : ``}
            </div>
          </div>
        </div>

        <div class="logfooter">
          <div class="panel">
            <header><h2>Log</h2><div class="hint">${currentLogMode(state) === LOG_MODES.detail ? "recent rolls with breakdowns" : "recent events"}</div></header>
            <div class="body" id="log_body"></div>
          </div>
        </div>

        ${state.ui.levelUpOpen && levelUpPreview ? renderLevelUpOverlay(levelUpPreview) : ""}
        ${renderCombatNoticeOverlay()}
        ${renderRandomEventOverlay()}
      `;document.querySelectorAll('[data-ui-action="short-rest"]').forEach(btn=>{btn.addEventListener("click",()=>shortRest(state));});document.querySelectorAll('[data-ui-action="long-rest"]').forEach(btn=>{btn.addEventListener("click",()=>longRest(state));});document.querySelectorAll(".tabbtn[data-tab]").forEach(btn=>{btn.addEventListener("click",()=>{const tab=btn.getAttribute("data-tab");if(btn.disabled)return;state.tab=tab;state.ui.mobileActionsVisible=false;render();});});document.querySelectorAll('[data-ui-action="toggle-mobile-actions"]').forEach(btn=>{btn.addEventListener("click",()=>{state.ui.mobileActionsVisible=!state.ui.mobileActionsVisible;render();});});document.querySelectorAll('[data-ui-action="toggle-save-tools"]').forEach(btn=>{btn.addEventListener("click",()=>{state.ui.saveToolsVisible=!state.ui.saveToolsVisible;render();});});document.querySelectorAll('[data-ui-action="save"]').forEach(btn=>{btn.addEventListener("click",()=>{state.ui.mobileActionsVisible=false;save(state);log(state,"Game saved.");render();});});document.querySelectorAll('[data-ui-action="export"]').forEach(btn=>{btn.addEventListener("click",()=>{state.ui.mobileActionsVisible=false;exportSave();});});document.querySelectorAll('[data-ui-action="import"]').forEach(btn=>{btn.addEventListener("click",()=>{state.ui.mobileActionsVisible=false;importSave();});});document.querySelectorAll('[data-ui-action="new"]').forEach(btn=>{btn.addEventListener("click",async()=>{state.ui.mobileActionsVisible=false;const ok=await confirmDialog({title:"Start a New Game?",message:"This will permanently replace your current local save and reset your character, progress, map exploration, inventory, and log.",okText:"Start New Game",cancelText:"Keep Current Save",okKind:"danger"});if(!ok)return;wipeSave();state=defaultState();render();});});renderActiveTab();if(state.ui.levelUpOpen&&levelUpPreview){wireLevelUpOverlay();}wireAbilityTooltips($app);wireStatTooltips($app);wireStatusTooltips($app);wireSkillTooltips($app);wireTextTooltips($app);document.querySelectorAll('[data-ui-action="dismiss-combat-notice"]').forEach(btn=>{btn.addEventListener("click",()=>dismissCombatNotice(state));});document.querySelectorAll('[data-ui-action="attempt-random-event"]').forEach(btn=>{btn.addEventListener("click",()=>resolveRandomEventAttempt(state));});document.querySelectorAll('[data-ui-action="ignore-random-event"]').forEach(btn=>{btn.addEventListener("click",()=>ignoreRandomEvent(state));});const logBody=document.getElementById("log_body");if(logBody){logBody.innerHTML=renderLogEntries(state.log,{limit:18});wireTextTooltips(logBody);}}

  function renderLevels(player){const parts=ownedClassIdsInOrder(player).map(classId=>`${classId}:${Math.max(0, Number(player && player.levels && player.levels[classId] || 0))}`).filter(Boolean);return parts.length?`<span class="mono">${parts.join(" ")}</span>`:"—";}

  function renderActiveTab() {
    const title=document.getElementById("main_title");
    const hint=document.getElementById("main_hint");
    const body=document.getElementById("main_body");
    switch(state.tab) {
      case"explore":title.textContent="Explore";
      hint.textContent="Explore, gather resources, and fight monsters!";
      body.innerHTML=renderExploreTab();
      wireExploreTab();
      break;
      case"town":title.textContent="Town";
      hint.textContent=state.world.areaId==="town"?"Talk to townsfolk and manage quest work.":"You need to be in town to access town residents.";
      body.innerHTML=renderTownTab();
      wireTownTab();
      break;
      case"quests":title.textContent="Quests";
      hint.textContent="Track active objectives and review completed work.";
      body.innerHTML=renderQuestsTab();
      wireQuestsTab();
      break;
      case"combat":title.textContent="Combat";
      hint.textContent="A simple d20 system (attack vs AC; nat 20 crit; nat 1 fumble).";
      body.innerHTML=renderCombatTab();
      wireCombatTab();
      break;
      case"character":title.textContent="Character";
      hint.textContent="Stats, saves, skills, and proficiencies.";
      body.innerHTML=renderCharacterTab();
      wireCharacterTab();
      break;
      case"inventory":title.textContent="Inventory";
      hint.textContent="Inventory capacity increases with the more Strength you have.";
      body.innerHTML=renderInventoryTab();
      wireInventoryTab();
      break;
      case"crafting":title.textContent="Crafting";
      hint.textContent="Turn gathered materials into consumables, gear, and +1 upgrades.";
      body.innerHTML=renderCraftingTab();
      wireCraftingTab();
      break;
      case"shop":title.textContent="Shop";
      hint.textContent=state.world.areaId==="town"?"Buy and sell at your leisure.":"You need to be in town to shop.";
      body.innerHTML=renderShopTab();
      wireShopTab();
      break;
      case"log":title.textContent="Log";
      hint.textContent=currentLogMode(state)===LOG_MODES.detail?"Full event log with explicit dice, modifiers, and results.":"Full event log with result text only.";
      body.innerHTML=renderLogEntries(state.log);
      break;
      case"settings":title.textContent="Settings";
      hint.textContent="Display and UI options.";
      body.innerHTML=renderSettingsTab();
      wireSettingsTab();
      break;
      default:state.tab="explore";
      renderActiveTab();
    }
  }

  function renderExploreTab(){const area=getArea(state.world.areaId);const inTown=state.world.areaId==="town";const canTravel=canTravelNow(state);const hideTravelSelect=(!canTravel&&area.map&&!inTown);const travelOptions=visibleTravelAreas(state);const tile=currentTile(state);const dungeonDestination=currentDungeonDestination(state);const tileInfo=tile?renderTileInfo(tile):`
        <div class="small muted">No map in this area.</div>
      `;return`
        <div class="grid" style="gap:12px">
          <div class="panel">
            <header><h2>Location</h2><div class="pill"><span class="muted">Current</span> <strong>${area.name}</strong> <span class="muted">Lv ${area.level}</span></div></header>
            <div class="body">
              <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; justify-content:space-between">
                <div>
                  <div class="small muted" style="line-height:1.5; margin-top:6px">${area.description}</div>
                </div>
                <div style="display:flex; gap:8px; flex-wrap:wrap">
                  <select id="area_select" ${canTravel ? "" : "disabled"} class="${hideTravelSelect ? "hidden" : ""}" style="min-width:220px; background:rgba(17,21,34,.65); color:var(--text); border:1px solid var(--border); border-radius:10px; padding:8px">
                    ${travelOptions.map(a => `<option value="${a.id}" ${a.id === area.id ? "selected" : ""}>${escapeHtml(travelAreaLabel(a))}</option>`).join("")}
                  </select>
                  ${hideTravelSelect ? `<div class="small muted" style="padding:8px 0">${state.combat ? "You can't travel during combat!" : `Fast travel from the <strong>Home</strong> tile (${MAP_ICONS.home}).`}</div>` : ``}
                </div>
              </div>
            </div>
          </div>

          ${area.map ? `
            <div class="mapWrap">
              <div class="mapPane" id="map_pane">
                <div class="mapViewport" id="map_viewport">
                  <div class="map" id="map"></div>
                </div>
                <div class="mapControls">
                  <button class="btn" id="mv_n">↑</button>
                  <button class="btn" id="mv_s">↓</button>
                  <button class="btn" id="mv_w">←</button>
                  <button class="btn" id="mv_e">→</button>
                  ${tile && tile.home && state.world.areaId !== "town" ? `<button class="btn primary" id="btn_enter_town">Enter Town</button>` : ``}
                  ${dungeonDestination ? `<button class="btn primary" id="btn_enter_dungeon">${escapeHtml(dungeonEnterLabel(dungeonDestination))}</button>` : ``}
                  <button class="btn" id="btn_search" ${state.combat ? "disabled" : ""}>Scout (1 SP)</button>
                  <button class="btn" id="btn_gather" ${(!tile || tile.type !== "resource" || tile.resolved) ? "disabled" : ""}>Gather (1 SP)</button>
                </div>
              </div>
              <div class="mapInfoPane">
                <div class="panel">
                  <header><h2>Tile</h2><div class="hint"><strong>Scout</strong> around to reveal the area around you.</div></header>
                  <div class="body" id="tile_info">${tileInfo}</div>
                </div>
              </div>
            </div>

            <div class="panel">
              <header><h2>Map Notes</h2><div class="hint">Legend and camera settings.</div></header>
              <div class="body">
                <div style="display:flex; gap:12px; align-items:flex-start; justify-content:space-between; flex-wrap:wrap">
                  <div>
                    <div class="small muted" style="margin-bottom:6px; line-height:1.4">Map legend</div>
                    <div class="mapLegend">${renderMapLegend()}</div>
                  </div>
                  <div style="max-width:360px">
                    <button class="btn" id="btn_map_camera_mode" data-tooltip="Toggle how the map camera behaves while you move around the current area.">Camera: ${cameraModeLabel(state.ui.mapCameraMode)}</button>
                    <div class="small muted" style="margin-top:6px; line-height:1.4">${state.ui.mapCameraMode === MAP_CAMERA_MODES.follow ? "Follow mode keeps the map still until you move too close to an edge." : "Fixed mode keeps you as close to the center of the map as possible."}</div>
                  </div>
                </div>
              </div>
            </div>

            ${renderExplorationAbilitiesPanel()}
          ` : `
            <div class="panel">
              <header><h2>Town Options</h2><div class="hint">You're safe here!</div></header>
              <div class="body">
                <div class="split">
                  <div>
                    <div class="big">Astaria</div>
                    <div class="small muted" style="line-height:1.5; margin-top:6px">
                      • Long rest to recover fully<br/>
                      • Visit the shop to buy whatever you might need<br/>
                      • Travel into the wilderness to explore
                    </div>
                  </div>
                  <div>
                    <div class="small muted" style="margin-bottom:8px">Quick actions</div>
                    <div style="display:flex; gap:8px; flex-wrap:wrap">
                      <button class="btn primary" id="btn_longrest2">Long Rest</button>
                      <button class="btn" id="btn_shop">Go to Shop</button>
                      <button class="btn" id="btn_town_menu">Town Menu</button>
                      <button class="btn" id="btn_quest_log">Quest Log</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            ${renderExplorationAbilitiesPanel()}
          `}
        </div>
      `;}

  function renderTownNpcButton(npc,selected=false){const marker=questNpcMarker(state,npc.id);const markerHtml=marker?`<span class="npcTownBtnMarker">${escapeHtml(marker.emoji)}</span>`:``;const markerClass=marker?marker.className:"";return`
        <button class="btn npcTownBtn ${selected ? "selected" : ""} ${escapeHtml(markerClass)}" data-town-npc="${escapeHtml(npc.id)}">
          <span class="npcTownBtnEmoji">${escapeHtml(npc.emoji)}</span>
          <span class="npcTownBtnMeta">
            <span class="npcTownBtnName">${escapeHtml(npc.name)}</span>
            <span class="npcTownBtnResidence">${escapeHtml(npc.residence)}</span>
          </span>
          ${markerHtml}
        </button>
      `;}

  function renderTownQuestCard(entry,mode){const quest=entry.quest;const progress=entry.progress||evaluateQuestProgress(state,quest,entry.entry||questEntry(state,quest.id));const questGiver=NPC_INDEX.get(quest.giverNpcId);const turnInNpc=NPC_INDEX.get(quest.turnInNpcId);const buttonHtml=mode==="offer"?`<button class="btn primary" data-accept-quest="${escapeHtml(quest.id)}">Accept Quest</button>`:mode==="turnin"?`<button class="btn primary" data-turnin-quest="${escapeHtml(quest.id)}">Turn In Quest</button>`:"";return`
        <div class="questCard compact ${mode === "turnin" ? "ready" : ""}">
          <div class="questCardHead">
            <div>
              <div class="questCardTitle">${escapeHtml(quest.name)}</div>
              <div class="small muted">${escapeHtml(questGiver ? questGiver.name : "Unknown")} -> ${escapeHtml(turnInNpc ? turnInNpc.name : "Unknown")}</div>
            </div>
            ${buttonHtml}
          </div>
          <div class="small muted" style="line-height:1.5; margin-top:8px">${escapeHtml(quest.summary || quest.description || "No summary available.")}</div>
          <div class="questObjectiveList">${progress.objectives.map(renderQuestObjectiveHtml).join("")}</div>
          <div class="small muted" style="margin-top:10px">Rewards</div>
          ${renderQuestRewardsHtml(quest)}
        </div>
      `;}

  function renderTownTab(){if(state.world.areaId!=="town"){return`<div class="small muted">You must be in town to access the Town menu.</div>`;}const residents=townNpcDefinitions("town");const selectedNpcId=residents.some(npc=>npc.id===state.ui.selectedTownNpcId)?state.ui.selectedTownNpcId:(residents[0]?residents[0].id:"");state.ui.selectedTownNpcId=selectedNpcId;const npc=selectedNpcId?getNpc(selectedNpcId):null;const marker=npc?questNpcMarker(state,npc.id):null;const available=npc?availableQuestOffersForNpc(state,npc.id):[];const ready=npc?turnInReadyQuestsForNpc(state,npc.id):[];const progress=npc?talkProgressQuestsForNpc(state,npc.id):[];const related=npc?relatedActiveQuestsForNpc(state,npc.id).filter(entry=>!ready.some(readyEntry=>readyEntry.quest.id===entry.quest.id)&&!progress.some(progressEntry=>progressEntry.quest.id===entry.quest.id)):[];return`
        <div class="grid townMenuGrid" style="gap:12px">
          <div class="panel">
            <header><h2>Townfolk</h2><div class="hint">Residents of Astaria</div></header>
            <div class="body">
              <div class="townNpcGrid">${residents.map(resident => renderTownNpcButton(resident, resident.id === selectedNpcId)).join("")}</div>
            </div>
          </div>

          ${npc ? `
            <div class="panel">
              <header><h2>${escapeHtml(`${npc.emoji} ${npc.name}`)}</h2><div class="hint">${escapeHtml(npc.role)}</div></header>
              <div class="body">
                <div class="badgeWrap" style="margin-bottom:10px">
                  <span class="badge">${escapeHtml(npc.residence)}</span>
                  ${marker ? `<span class="badge ${marker.emoji === "❓" ? "warn" : "good"}">${escapeHtml(marker.emoji)} ${escapeHtml(marker.label)}</span>` : ``}
                </div>
                <div class="small muted" style="line-height:1.55">${escapeHtml(npc.description || npc.tooltip || "A familiar face in town.")}</div>
                <div class="townNpcQuote">${escapeHtml(npc.greeting || `${npc.name} gives you a measured nod.`)}</div>
                <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:12px">
                  <button class="btn primary" data-talk-npc="${escapeHtml(npc.id)}">Talk</button>
                  <button class="btn" data-tab-target="quests">Open Quest Log</button>
                </div>
              </div>
            </div>

            ${ready.length ? `
              <div class="panel">
                <header><h2>Ready to Turn In</h2><div class="hint">${ready.length} quest${ready.length === 1 ? "" : "s"}</div></header>
                <div class="body townQuestStack">${ready.map(entry => renderTownQuestCard(entry, "turnin")).join("")}</div>
              </div>
            ` : ``}

            ${available.length ? `
              <div class="panel">
                <header><h2>Available Quests</h2><div class="hint">${available.length} offer${available.length === 1 ? "" : "s"}</div></header>
                <div class="body townQuestStack">${available.map(quest => renderTownQuestCard({ quest, progress: evaluateQuestProgress(state, quest, createQuestEntry(quest)) }, "offer")).join("")}</div>
              </div>
            ` : ``}

            ${progress.length ? `
              <div class="panel">
                <header><h2>Progress with ${escapeHtml(npc.name)}</h2><div class="hint">Talking here can advance these quests</div></header>
                <div class="body townQuestStack">${progress.map(entry => renderTownQuestCard(entry, "active")).join("")}</div>
              </div>
            ` : ``}

            ${related.length ? `
              <div class="panel">
                <header><h2>Other Linked Quests</h2><div class="hint">Current work tied to ${escapeHtml(npc.name)}</div></header>
                <div class="body townQuestStack">${related.map(entry => renderTownQuestCard(entry, "active")).join("")}</div>
              </div>
            ` : ``}
          ` : `<div class="panel"><div class="body"><div class="small muted">No residents are available.</div></div></div>`}
        </div>
      `;}

  function wireTownTab() {
    const mainBody=document.getElementById("main_body");
    if(mainBody) {
      wireResolvedTooltips(mainBody, "[data-town-npc]", el=>npcTooltipHtml(state, el.getAttribute("data-town-npc")||""));
    }
    document.querySelectorAll("button[data-town-npc]").forEach(btn=> {
      btn.addEventListener("click", ()=> {
        state.ui.selectedTownNpcId=btn.getAttribute("data-town-npc")||"";
        render();
      });
    });
    document.querySelectorAll("button[data-talk-npc]").forEach(btn=> {
      btn.addEventListener("click", ()=>talkToNpc(state, btn.getAttribute("data-talk-npc")||""));
    });
    document.querySelectorAll("button[data-accept-quest]").forEach(btn=> {
      btn.addEventListener("click", ()=>acceptQuest(state, btn.getAttribute("data-accept-quest")||"", state.ui.selectedTownNpcId));
    });
    document.querySelectorAll("button[data-turnin-quest]").forEach(btn=> {
      btn.addEventListener("click", ()=>turnInQuest(state, btn.getAttribute("data-turnin-quest")||"", state.ui.selectedTownNpcId));
    });
    document.querySelectorAll("button[data-tab-target]").forEach(btn=> {
      btn.addEventListener("click", ()=> {
        state.tab=btn.getAttribute("data-tab-target")||"quests";
        render();
      });
    });
  }

  function renderQuestJournalCard(entry,mode="active"){const quest=entry.quest;const progress=entry.progress||evaluateQuestProgress(state,quest,questEntry(state,quest.id));const giverNpc=NPC_INDEX.get(quest.giverNpcId);const turnInNpc=NPC_INDEX.get(quest.turnInNpcId);const actionNpcId=mode==="active"?townNpcActionTargetForQuest(entry):null;const actionNpc=actionNpcId?NPC_INDEX.get(actionNpcId):null;const actionButton=actionNpc&&state.world.areaId==="town"?`<button class="btn" data-open-town-npc="${escapeHtml(actionNpc.id)}">${escapeHtml(progress.complete ? `Open ${actionNpc.name}` : `Talk to ${actionNpc.name}`)}</button>`:``;const completedMeta=mode==="completed"?`<span class="badge good">Completed on day ${entry.entry.completedDay}</span>`:``;const activeMeta=mode==="active"&&progress.complete?`<span class="badge warn">Ready to turn in</span>`:`<span class="badge">Active</span>`;return`
        <div class="questCard ${mode === "active" && progress.complete ? "ready" : ""}">
          <div class="questCardHead">
            <div>
              <div class="questCardTitle">${escapeHtml(quest.name)}</div>
              <div class="small muted">Given by ${escapeHtml(giverNpc ? giverNpc.name : "Unknown")} • Turn in with ${escapeHtml(turnInNpc ? turnInNpc.name : "Unknown")}</div>
            </div>
            <div class="questCardStatusWrap">${mode === "completed" ? completedMeta : activeMeta}</div>
          </div>
          <div class="small muted" style="line-height:1.55; margin-top:8px">${escapeHtml(quest.description || quest.summary || "No description available.")}</div>
          <div class="questObjectiveList">${(mode === "completed" ? quest.objectives.map(objective => ({ label: questObjectiveLabel(objective), progressText: "Complete", complete: true })) : progress.objectives).map(renderQuestObjectiveHtml).join("")}</div>
          <div class="small muted" style="margin-top:10px">Rewards</div>
          ${renderQuestRewardsHtml(quest, mode === "completed" ? entry.entry.rewardSummary : null)}
          ${actionButton ? `<div style="margin-top:12px">${actionButton}</div>` : ``}
        </div>
      `;}

  function renderQuestsTab(){const mode=state.ui.questListMode==="completed"?"completed":"active";const activeEntries=activeQuestData(state);const completedEntries=completedQuestData(state);const visibleEntries=mode==="completed"?completedEntries:activeEntries;return`
        <div class="grid" style="gap:12px">
          <div class="panel">
            <header><h2>Quest Journal</h2><div class="hint">${activeEntries.length} active • ${completedEntries.length} completed</div></header>
            <div class="body">
              <div style="display:flex; gap:12px; align-items:center; justify-content:space-between; flex-wrap:wrap">
                <!--<div class="small muted" style="line-height:1.5">Track current objectives, check who can advance them, and review finished jobs.</div>-->
                <button class="btn primary" id="btn_toggle_quest_mode">${mode === "active" ? "Show Completed Quests" : "Show Active Quests"}</button>
              </div>
            </div>
          </div>

          ${visibleEntries.length ? visibleEntries.map(entry => renderQuestJournalCard(entry, mode)).join("") : `
            <div class="panel">
              <div class="body">
                <div class="small muted">${mode === "active" ? "You do not have any active quests yet. Visit the Town menu to find work." : "You have not completed any quests yet."}</div>
              </div>
            </div>
          `}
        </div>
      `;}

  function wireQuestsTab() {
    const btnToggle=document.getElementById("btn_toggle_quest_mode");
    if(btnToggle) {
      btnToggle.addEventListener("click", ()=> {
        state.ui.questListMode=state.ui.questListMode==="completed"?"active":"completed";
        render();
      });
    }
    document.querySelectorAll("button[data-open-town-npc]").forEach(btn=> {
      btn.addEventListener("click", ()=> {
        state.ui.selectedTownNpcId=btn.getAttribute("data-open-town-npc")||"";
        state.tab="town";
        render();
      });
    });
  }

  function renderTileInfo(tile){const terrainBadge=terrainBadgeHtml(tile.terrain||"unknown");if(!tile.revealed)return`
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px">
          ${terrainBadge}
          <span class="badge">Unexplored</span>
        </div>
        <div class="small muted">You haven't revealed what's here yet. Use <strong>Search</strong> to scout nearby tiles.</div>
      `;if(tile.home){if(tile.type==="dungeon"&&tile.content){const destination=getArea(tile.content);const linkedArea=tile.linkedDungeonAreaId?getArea(tile.linkedDungeonAreaId):null;return`
            <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px">
              ${terrainBadge}
              <span class="badge warn">Travel Tile</span>
              <span class="badge warn">Entrance</span>
              <span class="badge">${escapeHtml(destination.name)}</span>
            </div>
            <div class="small muted">This is your area's entrance tile. You can <strong>Travel</strong> between locations from here, use <strong>Enter Town</strong> to return to safety, or stand here and use <strong>${escapeHtml(dungeonEnterLabel(destination))}</strong> to return to the linked ${escapeHtml(destination.name)} entrance${linkedArea ? ` for <strong>${escapeHtml(linkedArea.name)}</strong>` : ""}.</div>
          `;}return`
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px">
            ${terrainBadge}
            <span class="badge warn">Travel Tile</span>
          </div>
          <div class="small muted">This is the area's travel tile. You can <strong>Travel</strong> between locations from here, and use <strong>Enter Town</strong> to return to safety.</div>
        `;}if(tile.type==="dungeon"){const destination=getArea(tile.content);return`
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px">
            ${terrainBadge}
            <span class="badge warn">Dungeon</span>
            <span class="badge">${escapeHtml(destination.name)}</span>
          </div>
          <div class="small muted">This entrance leads to <strong>${escapeHtml(destination.name)}</strong> (level ${destination.level}). Stand here and use <strong>${escapeHtml(dungeonEnterLabel(destination))}</strong> to travel there for free.</div>
        `;}if(tile.type==="monster"&&!tile.resolved){const m=getMonster(tile.content);return`
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px">
            ${terrainBadge}
            <span class="badge bad">Monster</span>
            <span class="badge">Likely: ${m.name}</span>
          </div>
          <div class="small muted">Entering this tile triggers an encounter automatically.</div>
        `;}if(tile.type==="resource"&&!tile.resolved){const r=getItem(tile.content);return`
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px">
            ${terrainBadge}
            <span class="badge good">Resource</span>
            <span class="badge">${r.name}</span>
          </div>
          <div class="small muted">Use <strong>Gather</strong> (1 SP) to collect resources. Check uses Survival or Crafting.</div>
        `;}if(tile.type==="treasure"&&!tile.resolved){return`
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px">
            ${terrainBadge}
            <span class="badge warn">Treasure</span>
          </div>
          <div class="small muted">Treasure is opened automatically when you step onto it.</div>
        `;}const searchRadius=hasAbility(state.player,"eagle_eye")?2:1;return`
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px">
          ${terrainBadge}
          <span class="badge">Clear</span>
        </div>
        <div class="small muted">This tile seems quiet. Use <strong>Search</strong> (1 SP) to make a Perception check and reveal nearby tiles (radius ${searchRadius}).</div>
      `;}

  function wireExploreTab(){
    const areaSelect=document.getElementById("area_select");
    if(areaSelect){
      areaSelect.addEventListener("change",()=>{
        const target=areaSelect.value;
        if(!canTravelNow(state)){
          areaSelect.value=state.world.areaId;
          return;
        }
        travelTo(state,target);
      });
    }

    const btnLong=document.getElementById("btn_longrest2");
    if(btnLong){
      btnLong.addEventListener("click",()=>longRest(state));
      const btnShop=document.getElementById("btn_shop");
      const btnTownMenu=document.getElementById("btn_town_menu");
      const btnQuestLog=document.getElementById("btn_quest_log");
      if(btnShop)btnShop.addEventListener("click",()=>{state.tab="shop";render();});
      if(btnTownMenu)btnTownMenu.addEventListener("click",()=>{state.tab="town";render();});
      if(btnQuestLog)btnQuestLog.addEventListener("click",()=>{state.tab="quests";render();});
    }

    document.querySelectorAll("button[data-ability-use]").forEach(btn=>{
      btn.addEventListener("click",()=>{
        const abilityId=btn.getAttribute("data-ability-use");
        useActiveAbility(state,abilityId);
      });
    });

    const mapEl=document.getElementById("map");
    const area=getArea(state.world.areaId);
    if(area.map&&mapEl){
      const aState=state.world.areas[state.world.areaId];
      const mapPaneEl=document.getElementById("map_pane");
      const mapViewportEl=document.getElementById("map_viewport");
      const tileInfoEl=document.getElementById("tile_info");
      const canMoveToDelta=(dx,dy)=>Math.abs(dx)+Math.abs(dy)===1&&!isDirectionBlocked(state,dx,dy);
      const isInteractiveField=(event)=>{
        const target=event&&event.target;
        if(!target)return false;
        if(target.isContentEditable)return true;
        const tag=String(target.tagName||"").toUpperCase();
        return tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT";
      };
      const movementDeltaForKey=(key)=>{
        const normalized=String(key||"").toLowerCase();
        if(normalized==="arrowup"||normalized==="w")return{dx:0,dy:-1};
        if(normalized==="arrowdown"||normalized==="s")return{dx:0,dy:1};
        if(normalized==="arrowleft"||normalized==="a")return{dx:-1,dy:0};
        if(normalized==="arrowright"||normalized==="d")return{dx:1,dy:0};
        return null;
      };
      const renderMapViewport=()=>{
        if(!mapPaneEl||!mapViewportEl||!mapEl)return;
        const layout=computeMapViewportLayout(aState,mapPaneEl,mapViewportEl);
        const view=computeVisibleMapWindow(state,state.world.areaId,aState,layout.cols,layout.rows);
        mapViewportEl.style.setProperty("--map-cell-size",`${layout.cellSize}px`);
        mapViewportEl.style.width="100%";
        mapViewportEl.style.height=`${layout.height}px`;
        mapEl.style.setProperty("--map-cols",String(view.cols));
        mapEl.style.width=`${layout.gridWidth}px`;
        mapEl.style.height=`${layout.gridHeight}px`;
        mapEl.innerHTML="";
        for(let y=view.y;y<view.y+view.rows;y++){
          for(let x=view.x;x<view.x+view.cols;x++){
            const tile=aState.tiles[y][x];
            const isPlayer=(x===aState.px&&y===aState.py);
            const cell=document.createElement("div");
            const terrainCls=tile.terrain?` terrain-${tile.terrain}`:"";
            const symbol=isPlayer?MAP_ICONS.player:tileSymbol(tile);
            const dx=x-aState.px;
            const dy=y-aState.py;
            const canClickMove=canMoveToDelta(dx,dy);
            cell.className="tile"+terrainCls+(tile.type==="dungeon"?" dungeon":"")+(tile.revealed?" revealed":" fog")+(tile.home?" home":"")+(isPlayer?" player":"")+(canClickMove?" moveTarget":"")+(!symbol?" tileBlank":"");
            cell.textContent=symbol||"";
            if(canClickMove){
              cell.setAttribute("role","button");
              cell.setAttribute("aria-label",`Move to tile ${x + 1}, ${y + 1}`);
            }
            const terrainName=tile.terrain?(tile.terrain.charAt(0).toUpperCase()+tile.terrain.slice(1)):"Unknown";
            const status=!tile.revealed?"Unrevealed":tile.home?"Home":tile.type==="dungeon"?"Dungeon":(tile.type!=="empty"&&!tile.resolved?formatDamageTypeLabel(tile.type):"Clear");
            const tileTooltipHtml=`
                <div style="font-weight:700; font-size:13px; margin-bottom:6px">Tile [${x + 1}, ${y + 1}]</div>
                <div class="trow"><div class="k">Terrain</div><div class="v">${escapeHtml(terrainName)}</div></div>
                <div class="trow"><div class="k">Status</div><div class="v">${escapeHtml(status)}</div></div>
                ${canClickMove ? `<div class="small muted" style="margin-top:8px; line-height:1.45">Click to move here.</div>` : ``}
                ${isPlayer ? `<div class="badgeWrap" style="margin-top:8px"><span class="badge good">you are here</span></div>` : ``}
              `;
            cell.addEventListener("mouseenter",(e)=>{
              state.ui.selectedTile={x,y};
              if(tileInfoEl)tileInfoEl.innerHTML=renderTileInfo(tile);
              showTooltip(tileTooltipHtml,e.clientX,e.clientY);
            });
            cell.addEventListener("mousemove",(e)=>{showTooltip(tileTooltipHtml,e.clientX,e.clientY);});
            cell.addEventListener("mouseleave",()=>hideTooltip());
            if(canClickMove){
              cell.addEventListener("click",()=>{
                if(state.tab!=="explore"||state.combat||hasBlockingCenterOverlay(state))return;
                movePlayer(state,dx,dy);
              });
            }
            mapEl.appendChild(cell);
          }
        }
      };
      renderMapViewport();
      requestAnimationFrame(()=>{
        if(state.tab==="explore"&&document.getElementById("map")===mapEl)renderMapViewport();
      });
      setExploreViewportSync(renderMapViewport,mapPaneEl,mapViewportEl,mapEl);

      const btnN=document.getElementById("mv_n");
      const btnS=document.getElementById("mv_s");
      const btnW=document.getElementById("mv_w");
      const btnE=document.getElementById("mv_e");
      const syncMoveDisabled=()=>{
        btnN.disabled=isDirectionBlocked(state,0,-1);
        btnS.disabled=isDirectionBlocked(state,0,1);
        btnW.disabled=isDirectionBlocked(state,-1,0);
        btnE.disabled=isDirectionBlocked(state,1,0);
      };
      syncMoveDisabled();
      btnN.addEventListener("click",()=>{if(btnN.disabled)return;movePlayer(state,0,-1);});
      btnS.addEventListener("click",()=>{if(btnS.disabled)return;movePlayer(state,0,1);});
      btnW.addEventListener("click",()=>{if(btnW.disabled)return;movePlayer(state,-1,0);});
      btnE.addEventListener("click",()=>{if(btnE.disabled)return;movePlayer(state,1,0);});

      const btnCameraMode=document.getElementById("btn_map_camera_mode");
      if(btnCameraMode){
        btnCameraMode.addEventListener("click",()=>{
          state.ui.mapCameraMode=state.ui.mapCameraMode===MAP_CAMERA_MODES.fixed?MAP_CAMERA_MODES.follow:MAP_CAMERA_MODES.fixed;
          save(state);
          render();
        });
      }

      const enterBtn=document.getElementById("btn_enter_town");
      if(enterBtn)enterBtn.addEventListener("click",()=>travelTo(state,"town"));
      const enterDungeonBtn=document.getElementById("btn_enter_dungeon");
      const dungeonDestination=currentDungeonDestination(state);
      if(enterDungeonBtn&&dungeonDestination){
        enterDungeonBtn.addEventListener("click",()=>travelTo(state,dungeonDestination.area.id,{bypassTravelRequirement:true,viaDungeon:true,arrivalX:dungeonDestination.arrivalX,arrivalY:dungeonDestination.arrivalY}));
      }
      document.getElementById("btn_gather").addEventListener("click",()=>gatherResource(state));
      document.getElementById("btn_search").addEventListener("click",()=>searchTile(state));

      window.onkeydown=(e)=>{
        if(state.tab!=="explore")return;
        if(state.combat||hasBlockingCenterOverlay(state))return;
        if(isInteractiveField(e))return;
        const move=movementDeltaForKey(e.key);
        if(!move)return;
        e.preventDefault();
        if(canMoveToDelta(move.dx,move.dy))movePlayer(state,move.dx,move.dy);
      };
    }else{
      window.onkeydown=null;
    }
  }

  function renderInventoryTab(){const p=state.player;const inv=calcInventorySlots(p);const inTown=state.world.areaId==="town";const inventorySort=normalizeSortConfig(state.ui.inventorySort,"name");const mhId=p.equipment.mainHand||null;const mhItem=mhId?getItem(mhId):null;const mainTwoHanded=isTwoHandWeapon(mhItem);const eqRows=EQUIP_SLOTS.map(slot=>{if(slot.id==="offHand"&&mainTwoHanded&&mhItem){return`
            <div class="kv">
              <div class="k">${slot.label}</div>
              <div class="v">
                <select disabled style="min-width:180px; background:rgba(17,21,34,.65); color:var(--text); border:1px solid var(--border); border-radius:10px; padding:6px">
                  <option value="${mhId}" selected>${escapeHtml(mhItem.name)} (two-handed)</option>
                </select>
              </div>
            </div>
          `;}const current=p.equipment[slot.id]||"";const options=[{id:"",name:"(empty)"}];if(current){const curItem=getItem(current);options.push({id:current,name:curItem.name});}for(const entry of p.inventory){const it=getItem(entry.itemId);if(!slot.filter(it))continue;if(!canEquipToSlot(p,slot.id,it))continue;if(options.some(o=>o.id===it.id))continue;options.push({id:it.id,name:it.name});}const disabled=(slot.id==="offHand"&&mainTwoHanded)?"disabled":"";return`
          <div class="kv">
            <div class="k">${slot.label}</div>
            <div class="v">
              <select ${disabled} data-eq="${slot.id}" style="min-width:180px; background:rgba(17,21,34,.65); color:var(--text); border:1px solid var(--border); border-radius:10px; padding:6px">
                ${options.map(o => `<option value="${o.id}" ${o.id === current ? "selected" : ""}>${escapeHtml(o.name)}</option>`).join("")}
              </select>
            </div>
          </div>
        `;}).join("");const itemRows=sortRows(p.inventory.map(e=>{const it=getItem(e.itemId);const value=adjustedSellPriceCp(state.player,it);const itemClass=itemTextClass(it,state.player);return{sort:{name:it.name,category:itemCategoryLabel(it),stats:itemDmgOrAC(it),qty:Number(e.qty||0),value},html:`
            <tr>
              <td class="${itemClass}">${itemLinkHtml(it, state.player)}</td>
              <td class="${itemClass}">${escapeHtml(itemCategoryLabel(it))}</td>
              <td class="mono ${itemClass}">${escapeHtml(itemDmgOrAC(it))}</td>
              <td class="mono">${e.qty}</td>
              <td class="mono">${formatCoins(value)}</td>
              <td>
                ${it.type === "consumable" && typeof it.use === "function" ? `<button class="btn" data-use="${it.id}">Use</button>` : ``}
                ${canSellItem(it) ? `<button class="btn" data-sell="${it.id}" ${inTown ? "" : "disabled"}>Sell</button>` : `<span class="small muted">—</span>`}
              </td>
            </tr>
          `};}),inventorySort).map(row=>row.html).join("");return`
        <div class="grid" style="gap:12px">
          <div class="panel">
            <header><h2>Equipment</h2><div class="hint">Carry only what you need</div></header>
            <div class="small muted" style="margin-bottom:10px; line-height:1.5">
            </div>
            <div class="body">
              <div class="kvGrid">${eqRows}</div>
              <div class="small muted" style="margin-top:10px; line-height:1.5">
              </div>
            </div>
          </div>

          <div class="panel">
            <header><h2>Items</h2><div class="hint"><span class="pill">Inventory Slots : ${inv.used} / ${inv.max}</span></div></header>
            <div class="body">
              <div class="tableWrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th>${sortHeaderHtml("inventorySort", inventorySort, "name", "Item")}</th>
                      <th>${sortHeaderHtml("inventorySort", inventorySort, "category", "Category")}</th>
                      <th>${sortHeaderHtml("inventorySort", inventorySort, "stats", "Dmg / AC")}</th>
                      <th>${sortHeaderHtml("inventorySort", inventorySort, "qty", "Qty")}</th>
                      <th>${sortHeaderHtml("inventorySort", inventorySort, "value", "Value")}</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${itemRows || `<tr><td colspan="6" class="muted">(empty)</td></tr>`}
                  </tbody>
                </table>
              </div>
              ${!inTown ? `<div class="small muted" style="margin-top:10px">You can only sell items in town.</div>` : ``}
            </div>
          </div>
        </div>
      `;}

  function wireInventoryTab() {
    document.querySelectorAll("select[data-eq]").forEach(sel=> {
      sel.addEventListener("change", ()=> {
        const slot=sel.getAttribute("data-eq");
        equipItem(state, slot, sel.value);
      });
    });
    document.querySelectorAll("button[data-sell]").forEach(btn=> {
      btn.addEventListener("click", ()=> {
        sellItem(state, btn.getAttribute("data-sell"));
      });
    });
    document.querySelectorAll("button[data-use]").forEach(btn=> {
      btn.addEventListener("click", ()=> {
        const id=btn.getAttribute("data-use");
        useConsumable(state, id);
      });
    });
    const mainBody=document.getElementById("main_body");
    wireItemTooltips(mainBody);
    wireSortButtons(mainBody);
  }

  // ---------------------------------------------------------------------------
  // Crafting, shop, and log presentation
  // ---------------------------------------------------------------------------
  function getCraftingRecipe(recipeId) {
    const recipe=CRAFTING_RECIPES.find(entry=>entry.id===recipeId);
    if(!recipe)throw new Error("Unknown recipe id: "+recipeId);
    return recipe;
  }

  function craftRecipeGroups() {
    return[{
      id:"consumables", title:"Consumables"
    }, {
      id:"gear", title:"Weapons & Gear"
    }, {
      id:"upgrades", title:"+1 Upgrades"
    }];
  }

  function estimateCraftDcFromPrice(priceCp) {
    const price=Math.max(0, Number(priceCp||0));
    if(price<=0)return 10;
    return clamp(10+Math.round(Math.sqrt(price)/10), 10, 30);
  }

  function findCraftUpgradeOption(player, recipe, targetId="") {
    if(!recipe||!recipe.upgradeKind)return null;
    return craftUpgradeOptions(player, recipe.upgradeKind).find(entry=>entry.targetId===targetId)||null;
  }

  function craftRecipePrice(player, recipe, targetId="") {
    if(!recipe)return 0;
    if(recipe.upgradeKind) {
      const option=findCraftUpgradeOption(player, recipe, targetId);
      if(option) {
        const upgraded=plusOneVariantForItem(option.baseItemId);
        if(upgraded)return Math.max(0, Number(upgraded.cost||0));
      }
      return Math.max(0, Number(recipe.priceHint||0));
    }
    if(recipe.resultItemId) {
      const item=getItem(recipe.resultItemId);
      return Math.max(0, Number(item.cost||0));
    }
    return Math.max(0, Number(recipe.priceHint||0));
  }

  function craftRecipeDc(player, recipe, targetId="") {
    const explicit=Math.max(0, Number(recipe&&recipe.dc||0));
    if(recipe&&recipe.upgradeKind) {
      const targetPrice=craftRecipePrice(player, recipe, targetId);
      if(targetPrice>0)return estimateCraftDcFromPrice(targetPrice);
    }
    if(explicit>0)return explicit;
    return estimateCraftDcFromPrice(craftRecipePrice(player, recipe, targetId));
  }

  function craftRecipeDcLabel(player,recipe,targetId=""){return`DC ${craftRecipeDc(player, recipe, targetId)}`;}

  function pickCraftResourceAdjustments(player, recipe, mode="retain") {
    const unitPool=[];
    for(const ingredient of recipe.ingredients||[]) {
      const item=getItem(ingredient.itemId);
      if(item.type!=="resource")continue;
      const requiredQty=Math.max(0, Math.floor(Number(ingredient.qty||0)));
      const availableQty=mode==="lose"?Math.min(requiredQty, itemQuantity(player, ingredient.itemId)):requiredQty;
      for(let i=0;i<availableQty;i++) {
        unitPool.push(ingredient.itemId);
      }
    }
    if(!unitPool.length)return[];
    const shuffled=shuffleCopy(unitPool);
    const pickCount=Math.min(shuffled.length, rollInt(1, Math.min(2, shuffled.length)));
    const totals=new Map();
    for(const itemId of shuffled.slice(0, pickCount)) {
      totals.set(itemId, (totals.get(itemId)||0)+1);
    }
    return Array.from(totals.entries()).map(([itemId, qty])=>({
      itemId, qty
    }));
  }

  function craftResourceAdjustmentsLabel(adjustments){return(Array.isArray(adjustments)?adjustments:[]).map(entry=>`${getItem(entry.itemId).name} ×${Math.max(1, Number(entry.qty || 1))}`).join(", ");}

  function craftExtraConsumableQtyFromSkillFeat(player, recipe, isCriticalSuccess) {
    if(!player||!recipe||!isCriticalSuccess||recipe.upgradeKind||!recipe.resultItemId)return 0;
    if(!hasAbility(player, "skill_feat_crafting_mastery"))return 0;
    let item=null;
    try {
      item=getItem(recipe.resultItemId);
    } catch(_) {
      item=null;
    }
    if(!item||item.type!=="consumable")return 0;
    return Math.random()<0.05?1:0;
  }

  function craftRetainedIngredientsForOutcome(player, recipe, mode) {
    if(mode==="retain"&&player&&recipe&&hasAbility(player, "skill_feat_crafting_masterwork")) {
      const totals=new Map();
      for(const ingredient of recipe.ingredients||[]) {
        let item=null;
        try {
          item=getItem(ingredient.itemId);
        } catch(_) {
          item=null;
        }
        if(!item||item.type!=="resource")continue;
        const qty=Math.max(0, Math.floor(Number(ingredient.qty||0)));
        if(qty<=0)continue;
        totals.set(ingredient.itemId, (totals.get(ingredient.itemId)||0)+qty);
      }
      if(totals.size) {
        return Array.from(totals.entries()).map(function(entry) {
          return {
            itemId:entry[0], qty:entry[1]
          };
        });
      }
    }
    return pickCraftResourceAdjustments(player, recipe, mode);
  }

  function hasRecipeIngredients(player, recipe) {
    return(recipe.ingredients||[]).every(ingredient=>itemQuantity(player, ingredient.itemId)>=Math.max(1, Number(ingredient.qty||0)));
  }

  function recipeIngredientsHtml(player,recipe){return(recipe.ingredients||[]).map(ingredient=>{const item=getItem(ingredient.itemId);const need=Math.max(1,Number(ingredient.qty||0));const have=itemQuantity(player,ingredient.itemId);const cls=have>=need?"":"notProficientText";return`<span class="${cls}">${escapeHtml(item.name)} ×${need} <span class="muted">(${have})</span></span>`;}).join("<br/>");}

  function plusOneVariantForItem(itemId){return ITEM_INDEX.get(`${itemId}_plus1`)||null;}

  function isUpgradeableWeapon(item) {
    return!!(item&&item.type==="weapon"&&!item.plusOne&&plusOneVariantForItem(item.id));
  }

  function isUpgradeableArmor(item) {
    return!!(item&&item.type==="armor"&&item.category!=="unarmored"&&!item.plusOne&&plusOneVariantForItem(item.id));
  }

  function equipSlotLabel(slotId) {
    const slot=EQUIP_SLOTS.find(entry=>entry.id===slotId);
    return slot?slot.label:slotId;
  }

  function craftUpgradeOptions(player,kind){const predicate=kind==="armor"?isUpgradeableArmor:isUpgradeableWeapon;const options=[];for(const slotId of Object.keys(player.equipment||{})){const itemId=player.equipment[slotId];if(!itemId)continue;const item=getItem(itemId);if(!predicate(item))continue;options.push({targetId:`eq:${slotId}`,baseItemId:item.id,label:`${item.name} (equipped: ${equipSlotLabel(slotId)})`,slotId});}for(const entry of player.inventory||[]){const item=getItem(entry.itemId);if(!predicate(item))continue;options.push({targetId:`inv:${item.id}`,baseItemId:item.id,label:`${item.name} (${Math.max(0, Number(entry.qty || 0))} in inventory)`,slotId:null});}return options;}

  function selectedCraftTargetValue(recipe){const field=document.querySelector(`[data-craft-target="${recipe.id}"]`);return field?String(field.value||""):"";}

  function updateCraftRecipeDcLabel(recipeId){const recipe=getCraftingRecipe(recipeId);const targetId=recipe.upgradeKind?selectedCraftTargetValue(recipe):"";const field=document.querySelector(`[data-craft-dc-label="${recipe.id}"]`);if(field)field.textContent=craftRecipeDcLabel(state.player,recipe,targetId);}

  function craftRecipeResultLabel(recipe){if(recipe.resultItemId){const item=getItem(recipe.resultItemId);const qty=Math.max(1,Number(recipe.resultQty||1));return`${item.name}${qty > 1 ? ` ×${qty}` : ""}`;}if(recipe.upgradeKind==="weapon")return"+1 selected weapon";if(recipe.upgradeKind==="armor")return"+1 selected armor";return recipe.name;}

  function canCraftRecipeNow(state, recipe) {
    if(state.combat)return false;
    if(!hasRecipeIngredients(state.player, recipe))return false;
    if(recipe.upgradeKind&&!craftUpgradeOptions(state.player, recipe.upgradeKind).length)return false;
    return true;
  }

  function performCraft(state,recipeId,targetId=""){if(state.combat){log(state,"You cannot craft during combat.");return;}const recipe=getCraftingRecipe(recipeId);if(!hasRecipeIngredients(state.player,recipe)){log(state,`You lack the materials for ${recipe.name}.`);return;}let option=null;let upgraded=null;let craftedName=craftRecipeResultLabel(recipe);if(recipe.upgradeKind){option=findCraftUpgradeOption(state.player,recipe,targetId);if(!option){log(state,`Select a valid ${recipe.upgradeKind} to upgrade.`);return;}upgraded=plusOneVariantForItem(option.baseItemId);if(!upgraded){log(state,"That item has no +1 variant yet.");return;}craftedName=upgraded.name;}const dc=craftRecipeDc(state.player,recipe,targetId);const rollData=rollD20Detailed("crafting_check",{label:recipe.name});const craftParts=[...rollData.parts,...cloneRollParts(skillCheckSourceParts(state.player,"Crafting"))];const total=sumRollParts(craftParts);const margin=total-dc;const isCriticalSuccess=margin>=5;const isSuccess=total>=dc;const isCriticalFailure=margin<=-5;let adjustments=[];let logOutcome="failure";let extraConsumableQty=0;let extraConsumableName="";if(isSuccess){for(const ingredient of recipe.ingredients||[]){removeItem(state.player,ingredient.itemId,ingredient.qty);}if(recipe.upgradeKind){if(option.slotId){state.player.equipment[option.slotId]=upgraded.id;}else{if(!removeItem(state.player,option.baseItemId,1)){log(state,`You no longer have ${getItem(option.baseItemId).name} available.`);return;}addItem(state.player,upgraded.id,1);}craftedName=upgraded.name;}else{addItem(state.player,recipe.resultItemId,Math.max(1,Number(recipe.resultQty||1)));extraConsumableQty=craftExtraConsumableQtyFromSkillFeat(state.player,recipe,isCriticalSuccess);if(extraConsumableQty>0){addItem(state.player,recipe.resultItemId,extraConsumableQty);extraConsumableName=getItem(recipe.resultItemId).name;}craftedName=craftRecipeResultLabel(recipe);}if(isCriticalSuccess){adjustments=craftRetainedIngredientsForOutcome(state.player,recipe,"retain");for(const entry of adjustments){addItem(state.player,entry.itemId,entry.qty);}logOutcome="critical success";}else{logOutcome="success";}}else if(isCriticalFailure){adjustments=pickCraftResourceAdjustments(state.player,recipe,"lose");for(const entry of adjustments){removeItem(state.player,entry.itemId,entry.qty);}logOutcome="critical failure";}const adjustmentsLabel=craftResourceAdjustmentsLabel(adjustments);const extraConsumableLabel=extraConsumableQty>0?` Bonus output: +${extraConsumableQty} ${extraConsumableName}.`:"";const rollGroup=buildLogRollGroup({label:`${recipe.name} Crafting`,parts:craftParts,total,targetLabel:"DC",targetValue:dc,outcome:logOutcome});if(isCriticalSuccess){log(state,`${recipe.name}: critical success. Crafted ${craftedName}.${extraConsumableLabel}${adjustmentsLabel ? ` Retained ${adjustmentsLabel}.` : ""}`,{rollGroups:[rollGroup]});notifyCombatAction(`Critical craft! Crafted ${craftedName}.${extraConsumableLabel}${adjustmentsLabel ? ` Retained ${adjustmentsLabel}.` : ""}`,"good");}else if(isSuccess){log(state,`${recipe.name}: success. Crafted ${craftedName}.${extraConsumableLabel}`,{rollGroups:[rollGroup]});notifyCombatAction(`Crafted ${craftedName}.${extraConsumableLabel}`,"good");}else if(isCriticalFailure){log(state,`${recipe.name}: critical failure. No item crafted.${adjustmentsLabel ? ` Lost ${adjustmentsLabel}.` : ""}`,{rollGroups:[rollGroup]});notifyCombatAction(`Craft failed for ${recipe.name}.${adjustmentsLabel ? ` Lost ${adjustmentsLabel}.` : ""}`,"bad");}else{log(state,`${recipe.name}: failure. No item crafted. Materials preserved.`,{rollGroups:[rollGroup]});notifyCombatAction(`Craft failed for ${recipe.name}.`,"miss");}save(state);render();}

  function renderCraftingRecipeGroup(player,groupId,title){const recipes=CRAFTING_RECIPES.filter(recipe=>recipe.group===groupId);const rows=recipes.map(recipe=>{const resultLabel=craftRecipeResultLabel(recipe);const canCraft=canCraftRecipeNow(state,recipe);const upgradeOptions=recipe.upgradeKind?craftUpgradeOptions(player,recipe.upgradeKind):[];const initialTargetId=recipe.upgradeKind&&upgradeOptions.length?upgradeOptions[0].targetId:"";const selectorHtml=recipe.upgradeKind?`
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:8px">
            <select data-craft-target="${recipe.id}" style="min-width:220px; background:rgba(17,21,34,.65); color:var(--text); border:1px solid var(--border); border-radius:10px; padding:6px" ${upgradeOptions.length ? "" : "disabled"}>
              ${upgradeOptions.length ? upgradeOptions.map(option => `<option value="${escapeHtml(option.targetId)}">${escapeHtml(option.label)}</option>`).join("") : `<option value="">No valid ${escapeHtml(recipe.upgradeKind)} available</option>`}
            </select>
          </div>
        `:``;const upgradeHint=recipe.upgradeKind?`<div class="small muted" style="margin-top:6px">Consumes the selected ${recipe.upgradeKind} as the base item.</div>`:``;const dcHint=recipe.upgradeKind?`<div class="small muted" style="margin-top:6px">Updates with the selected ${escapeHtml(recipe.upgradeKind)}.</div>`:`<div class="small muted" style="margin-top:6px">Crafting skill check required.</div>`;return`
          <tr>
            <td>
              <div style="font-weight:700">${escapeHtml(recipe.name)}</div>
              <div class="small muted" style="margin-top:4px; line-height:1.45">${escapeHtml(recipe.description || resultLabel)}</div>
            </td>
            <td>
              <div>${escapeHtml(resultLabel)}</div>
              ${upgradeHint}
            </td>
            <td>
              <div class="mono" data-craft-dc-label="${recipe.id}">${escapeHtml(craftRecipeDcLabel(player, recipe, initialTargetId))}</div>
              ${dcHint}
            </td>
            <td>${recipeIngredientsHtml(player, recipe)}</td>
            <td>
              ${selectorHtml}
              <button class="btn primary" data-craft="${recipe.id}" ${canCraft ? "" : "disabled"}>Craft</button>
            </td>
          </tr>
        `;}).join("");return`
        <div class="panel">
          <header><h2>${escapeHtml(title)}</h2><div class="hint">${recipes.length} recipe${recipes.length === 1 ? "" : "s"}</div></header>
          <div class="body">
            <div class="tableWrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Recipe</th>
                    <th>Result</th>
                    <th>DC</th>
                    <th>Materials</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>${rows || `<tr><td colspan="5" class="muted">No recipes available.</td></tr>`}</tbody>
              </table>
            </div>
          </div>
        </div>
      `;}

  function renderCraftingTab(){const player=state.player;const materialIds=["herbs","ore","hide","hardwood","linen_cloth","crystal_shard","ember_ore"];const materialBadges=materialIds.map(itemId=>{const item=getItem(itemId);return`<span class="pill"><strong>${escapeHtml(item.name)}</strong> ${itemQuantity(player, itemId)}</span>`;}).join("");const intro=state.combat?`<div class="small muted" style="line-height:1.5">You can inspect recipes right now, but crafting is disabled during combat.</div>`:`<div class="small muted" style="line-height:1.5">To make something on your own requires a successful Crafting check vs a DC. You could even save or lose some materials depending on how you do...</div>`;return`
        <div class="grid" style="gap:12px">
          <div class="panel">
            <header><h2>Materials on Hand</h2><div class="hint">Gathered from maps and loot</div></header>
            <div class="body">
              ${intro}
              <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px">${materialBadges}</div>
            </div>
          </div>
          ${craftRecipeGroups().map(group => renderCraftingRecipeGroup(player, group.id, group.title)).join("")}
        </div>
      `;}

  function wireCraftingTab() {
    document.querySelectorAll("select[data-craft-target]").forEach(field=> {
      field.addEventListener("change", ()=> {
        updateCraftRecipeDcLabel(field.getAttribute("data-craft-target"));
      });
    });
    document.querySelectorAll("button[data-craft]").forEach(btn=> {
      btn.addEventListener("click", ()=> {
        const recipeId=btn.getAttribute("data-craft");
        const recipe=getCraftingRecipe(recipeId);
        const targetId=recipe.upgradeKind?selectedCraftTargetValue(recipe):"";
        performCraft(state, recipeId, targetId);
      });
    });
  }

  function renderShopTab(){if(state.world.areaId!=="town"){return`<div class="small muted">You must be in town to access the shop.</div>`;}const mode=state.ui.shopMode==="sell"?"sell":"buy";const toggleLabel=mode==="buy"?"Show Sell":"Show Buy";const stock=shopStock();const buySort=normalizeSortConfig(state.ui.shopBuySort,"name");const sellSort=normalizeSortConfig(state.ui.shopSellSort,"name");const socialMod=fmtSigned(socialPriceModifier(state.player));const buyRows=sortRows(stock.map(s=>{const it=getItem(s.id);const price=adjustedBuyPriceCp(state.player,s.price);const displayName=s.qty>1?`${it.name} x${s.qty}`:it.name;const itemClass=itemTextClass(it,state.player);return{sort:{name:it.name,category:itemCategoryLabel(it),stats:itemDmgOrAC(it),price,qty:s.qty},html:`
            <tr>
              <td class="${itemClass}">${itemLinkHtml(it, state.player, displayName)}</td>
              <td class="${itemClass}">${escapeHtml(itemCategoryLabel(it))}</td>
              <td class="mono ${itemClass}">${escapeHtml(itemDmgOrAC(it))}</td>
              <td class="mono">${formatCoins(price)}</td>
              <td><button class="btn primary" data-buy="${it.id}">${s.qty > 1 ? `Buy x${s.qty}` : "Buy"}</button></td>
            </tr>
          `};}),buySort).map(row=>row.html).join("");const sellableEntries=state.player.inventory.filter(entry=>canSellItem(getItem(entry.itemId)));const sellRows=sortRows(sellableEntries.map(e=>{const it=getItem(e.itemId);const sellPrice=adjustedSellPriceCp(state.player,it);const itemClass=itemTextClass(it,state.player);return{sort:{name:it.name,category:itemCategoryLabel(it),stats:itemDmgOrAC(it),qty:Number(e.qty||0),price:sellPrice},html:`
            <tr>
              <td class="${itemClass}">${itemLinkHtml(it, state.player)}</td>
              <td class="${itemClass}">${escapeHtml(itemCategoryLabel(it))}</td>
              <td class="mono ${itemClass}">${escapeHtml(itemDmgOrAC(it))}</td>
              <td class="mono">${e.qty}</td>
              <td class="mono">${formatCoins(sellPrice)}</td>
              <td><button class="btn" data-sell="${it.id}">Sell</button></td>
            </tr>
          `};}),sellSort).map(row=>row.html).join("");return`
        <div class="grid" style="gap:12px">
          <div class="panel">
            <header>
              <h2>${mode === "buy" ? "Buy" : "Sell"}</h2>
              <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; justify-content:flex-end">
                <span class="hint">Your Social skill changes prices (1% per point). <span class="pill">Current : ${socialMod}%</span></span>
                <button class="btn" id="btn_shop_mode_toggle">${toggleLabel}</button>
              </div>
            </header>
            <div class="body">
              <div class="tableWrap">
                ${mode === "buy" ? `
                  <table class="table">
                    <thead>
                      <tr>
                        <th>${sortHeaderHtml("shopBuySort", buySort, "name", "Item")}</th>
                        <th>${sortHeaderHtml("shopBuySort", buySort, "category", "Category")}</th>
                        <th>${sortHeaderHtml("shopBuySort", buySort, "stats", "Dmg / AC")}</th>
                        <th>${sortHeaderHtml("shopBuySort", buySort, "price", "Price")}</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>${buyRows}</tbody>
                  </table>
                ` : `
                  <table class="table">
                    <thead>
                      <tr>
                        <th>${sortHeaderHtml("shopSellSort", sellSort, "name", "Item")}</th>
                        <th>${sortHeaderHtml("shopSellSort", sellSort, "category", "Category")}</th>
                        <th>${sortHeaderHtml("shopSellSort", sellSort, "stats", "Dmg / AC")}</th>
                        <th>${sortHeaderHtml("shopSellSort", sellSort, "qty", "Qty")}</th>
                        <th>${sortHeaderHtml("shopSellSort", sellSort, "price", "Sell (each)")}</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>${sellRows || `<tr><td colspan="6" class="muted">Nothing to sell.</td></tr>`}</tbody>
                  </table>
                `}
              </div>
            </div>
          </div>
        </div>
      `;}

  function wireShopTab() {
    if(state.world.areaId!=="town")return;
    const btnMode=document.getElementById("btn_shop_mode_toggle");
    if(btnMode) {
      btnMode.addEventListener("click", ()=> {
        state.ui.shopMode=state.ui.shopMode==="buy"?"sell":"buy";
        render();
      });
    }
    document.querySelectorAll("button[data-buy]").forEach(btn=> {
      btn.addEventListener("click", ()=> {
        const id=btn.getAttribute("data-buy");
        buyItem(state, id);
      });
    });
    document.querySelectorAll("button[data-sell]").forEach(btn=> {
      btn.addEventListener("click", ()=> {
        sellItem(state, btn.getAttribute("data-sell"));
      });
    });
    const mainBody=document.getElementById("main_body");
    wireItemTooltips(mainBody);
    wireSortButtons(mainBody);
  }

  function wireItemTooltips(scope) {
    if(!scope)return;
    scope.querySelectorAll("[data-item]").forEach(el=> {
      const id=el.getAttribute("data-item");
      if(!id)return;
      el.addEventListener("mouseenter", (e)=> {
        try {
          const it=getItem(id);
          showTooltip(itemTooltipHtml(it, state.player), e.clientX, e.clientY);
        } catch(_) {
        }
      });
      el.addEventListener("mousemove", (e)=> {
        if(!$tooltip||$tooltip.classList.contains("hidden"))return;
        showTooltip($tooltip.innerHTML, e.clientX, e.clientY);
      });
      el.addEventListener("mouseleave", ()=>hideTooltip());
    });
  }

  function exportSave() {
    state.version=SAVE_VERSION;
    const data=JSON.stringify(state);
    const blob=new Blob([data], {
      type:"application/json"
    });
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;
    a.download="pf_explorer_save.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    log(state, "Exported save.");
    render();
  }

  function importSave() {
    const input=document.createElement("input");
    input.type="file";
    input.accept="application/json";
    input.addEventListener("change", async()=> {
      const file=input.files&&input.files[0];
      if(!file)return;
      const text=await file.text();
      try {
        const parsed=parseSaveJson(text);
        if(!parsed||!isLikelySaveData(parsed))throw new Error("Not a valid save.");
        const migrated=migrateSaveToCurrent(parsed);
        if(!migrated)throw new Error("Not a valid save.");
        state=migrated;
        save(state);
        log(state, "Imported save and updated it to the current format.");
        render();
      } catch(e) {
        alertDialog({
          title:"Import failed", message:"Failed to import save: "+e.message
        });
      }
    });
    input.click();
  }

  function fullStatName(s) {
    switch(s) {
      case"STR":return"Strength";
      case"DEX":return"Dexterity";
      case"CON":return"Constitution";
      case"INT":return"Intelligence";
      case"WIS":return"Wisdom";
      case"CHA":return"Charisma";
      default:return s;
    }
  }

  function fmtSigned(n) {
    const v=Math.floor(n);
    return(v>=0?"+":"")+v;
  }

  function escapeHtml(str) {
    return String(str).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("'", "&#039;");
  }

  function currentLogMode(state) {
    return state&&state.ui&&state.ui.logMode===LOG_MODES.detail?LOG_MODES.detail:LOG_MODES.compact;
  }

  function logTokenHtml(label,tooltip){const tip=String(tooltip||"").replaceAll("\r\n","\n").replaceAll("\r","\n");return`<span class="logToken" data-tooltip="${escapeHtml(tip).replaceAll("\n", "&#10;")}">${escapeHtml(label)}</span>`;}

  function collectLogDetailMatches(line){const matches=[];const pushMatches=(regex,buildTooltip)=>{regex.lastIndex=0;let match;while((match=regex.exec(line))){matches.push({start:match.index,end:match.index+match[0].length,tooltip:buildTooltip(match)});if(match[0].length===0)regex.lastIndex+=1;}};pushMatches(/rolls\s+(\d+)\/(\d+),\s*kept\s+(\d+)/g,m=>`Two rolls were made (${m[1]} and ${m[2]}). The kept result was ${m[3]}.`);pushMatches(/vs\s+([A-Za-z][A-Za-z -]*)\s+DC\s+(\d+)/g,m=>`This compares the final result against ${m[1].trim()} DC ${m[2]}. Meet or beat the target to succeed.`);pushMatches(/vs\s+AC\s+(\d+)/g,m=>`This compares the final result against Armor Class ${m[1]}. Meet or beat the target to hit.`);pushMatches(/base\s+DC\s+(\d+)/gi,m=>`The base difficulty for this check is ${m[1]} before situational modifiers.`);pushMatches(/\bd(\d+)\((\d+)\)/gi,m=>`A d${m[1]} was rolled and came up ${m[2]} before modifiers.`);pushMatches(/\bd(\d+)\s+(\d+)\b/gi,m=>`A d${m[1]} was rolled and came up ${m[2]}.`);pushMatches(/=\s*(-?\d+)/g,m=>`The final total after modifiers is ${m[1]}.`);pushMatches(/[+-]\s?\d+/g,m=>`This modifier adjusts the running total by ${m[0].replace(/\s+/g, '')}.`);pushMatches(/\b-?\d+(?=\s+vs\s+(?:[A-Za-z][A-Za-z -]*\s+)?(?:AC|DC))/g,()=>`This is the final result being compared against the target number.`);matches.sort((a,b)=>a.start-b.start||(b.end-b.start)-(a.end-a.start));const accepted=[];let cursor=-1;for(const match of matches){if(match.start<cursor)continue;accepted.push(match);cursor=match.end;}return accepted;}

  function formatRollPartTokenText(part){if(!part||typeof part!=="object")return"";if(part.type==="dice"){const expr=String(part.expr||"Roll").trim()||"Roll";const rolls=Array.isArray(part.rolls)?part.rolls:[];return`${expr}[${rolls.join(", ")}]`;}const value=Number(part.value||0);const label=String(part.label||rollSourceLabel(part.sourceKey,"")).trim();return label?`${label} ${fmtSigned(value)}`:fmtSigned(value);}

  function rollPartTooltipText(part){if(!part||typeof part!=="object")return"";const lines=[];const source=rollSourceLabel(part.sourceKey,part.label||(part.type==="dice"?(part.expr||"Roll"):"Modifier"));lines.push(source);if(part.type==="dice"){const expr=String(part.expr||"Roll").trim()||"Roll";const rolls=Array.isArray(part.rolls)?part.rolls:[];lines.push(`Rolled ${expr}: ${rolls.length ? rolls.join(", ") : "-"}.`);lines.push(`Subtotal: ${part.value}.`);}else{if(part.label&&part.label!==source)lines.push(part.label+".");lines.push(`Modifier: ${fmtSigned(Number(part.value || 0))}.`);}if(part.note)lines.push(part.note);return lines.filter(Boolean).join("\n");}

  function rollGroupTotalTooltipText(group){const label=group&&group.label?`${group.label} total`:"Final total";const lines=[label+".",`Final result: ${Number(group && group.total || 0)}.`];if(group&&group.note)lines.push(group.note);return lines.join("\n");}

  function rollGroupTargetTooltipText(group){if(!group||group.targetValue==null)return"";const label=String(group.targetLabel||"Target").trim()||"Target";return`${label}.\nTarget value: ${Number(group.targetValue || 0)}.`;}

  function rollGroupOutcomeTooltipText(group){if(!group||!group.outcome)return"";const label=rollSourceLabel("attack_outcome","Outcome");const lines=[label+".",`Result: ${group.outcome}.`];if(group.targetValue!=null){const targetLabel=String(group.targetLabel||"Target").trim()||"Target";lines.push(`Compared ${Number(group.total || 0)} against ${targetLabel} ${Number(group.targetValue || 0)}.`);}return lines.join("\n");}

  function renderStructuredLogRollGroup(group){if(!group||typeof group!=="object")return"";const parts=Array.isArray(group.parts)?group.parts:[];const tokens=[];parts.forEach((part,index)=>{if(index>0)tokens.push(`<span class="logDetailSep">+</span>`);tokens.push(logTokenHtml(formatRollPartTokenText(part),rollPartTooltipText(part)));});if(parts.length)tokens.push(`<span class="logDetailSep">=</span>`);tokens.push(logTokenHtml(String(Number(group.total||0)),rollGroupTotalTooltipText(group)));if(group.targetValue!=null){tokens.push(`<span class="logDetailSep">•</span>`);tokens.push(logTokenHtml(`vs ${group.targetLabel || "DC"} ${Number(group.targetValue || 0)}`,rollGroupTargetTooltipText(group)));}if(group.outcome){tokens.push(`<span class="logDetailSep">•</span>`);tokens.push(logTokenHtml(group.outcome,rollGroupOutcomeTooltipText(group)));}return`
        <div class="logDetailLine">
          ${group.label ? `<span class="logDetailLabel">${escapeHtml(group.label)}:</span>` : ``}
          <span class="logDetailTokens">${tokens.join("")}</span>
        </div>
      `;}

  function renderLegacyLogLine(raw,detail=false){const messageHtml=escapeHtml(String(raw||"")).replaceAll("\n","<br/>");if(!detail)return`<div class="logLine"><div class="logLineMain">${messageHtml}</div></div>`;const matches=collectLogDetailMatches(String(raw||""));if(!matches.length)return`<div class="logLine"><div class="logLineMain">${messageHtml}</div></div>`;let out="";let cursor=0;const rawText=String(raw||"");for(const match of matches){if(match.start>cursor)out+=escapeHtml(rawText.slice(cursor,match.start));out+=logTokenHtml(rawText.slice(match.start,match.end),match.tooltip);cursor=match.end;}if(cursor<rawText.length)out+=escapeHtml(rawText.slice(cursor));return`<div class="logLine"><div class="logLineMain">${out}</div></div>`;}

  function renderLogLine(entry,{detail=false}={}){const message=logEntryMessageText(entry);const rollGroups=logEntryRollGroups(entry);if(!detail||!rollGroups.length)return renderLegacyLogLine(message,detail);const messageHtml=message?`<div class="logLineMain">${escapeHtml(message).replaceAll("\n", "<br/>")}</div>`:``;const detailHtml=rollGroups.length?`<div class="logDetailBlock">${rollGroups.map(group => renderStructuredLogRollGroup(group)).join("")}</div>`:``;return`<div class="logLine">${messageHtml}${detailHtml}</div>`;}

  function renderLogEntries(entries,{limit=null}={}){const source=Array.isArray(entries)?entries.slice():[];const lines=limit==null?source.reverse():source.slice(-limit).reverse();const detail=currentLogMode(state)===LOG_MODES.detail;return`<div class="logList">${lines.map(line => renderLogLine(line, { detail })).join("")}</div>`;}

  function renderSettingsTab(){const mode=currentLogMode(state);return`
        <div class="grid" style="gap:12px">
          <div class="panel">
            <header><h2>Log Display</h2><div class="hint">Compact or detailed breakdowns</div></header>
            <div class="body">
              <div class="small muted" style="line-height:1.5; margin-bottom:12px">Compact shows the result text only. Detail adds explicit dice, modifiers, and final results for each logged roll, and hovering any part explains where it came from.</div>
              <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px">
                <button class="btn ${mode === LOG_MODES.compact ? 'primary' : ''}" data-log-mode="compact">Compact</button>
                <button class="btn ${mode === LOG_MODES.detail ? 'primary' : ''}" data-log-mode="detail">Detail</button>
              </div>
              <div class="small muted">Current mode: <strong>${mode === LOG_MODES.detail ? 'Detail' : 'Compact'}</strong></div>
            </div>
          </div>

          <div class="panel">
            <header><h2>CHEATS</h2><div class="hint">Debug resources</div></header>
            <div class="body">
              <div class="small muted" style="line-height:1.5; margin-bottom:12px">Use these buttons to add quick test resources to the current character.</div>
              <div style="display:flex; gap:8px; flex-wrap:wrap">
                <button class="btn cheatGlowBlack" data-cheat="xp">Add 100 XP</button>
                <button class="btn cheatGlowBlack" data-cheat="gold">Add 1000 GP</button>
                <button class="btn cheatGlowBlack" data-cheat="resources">Add Resources</button>
              </div>
            </div>
          </div>
        </div>
      `;}

  function wireSettingsTab() {
    document.querySelectorAll('button[data-log-mode]').forEach(btn=> {
      btn.addEventListener('click', ()=> {
        const nextMode=btn.getAttribute('data-log-mode')===LOG_MODES.detail?LOG_MODES.detail:LOG_MODES.compact;
        if(state.ui.logMode===nextMode)return;
        state.ui.logMode=nextMode;
        save(state);
        render();
      });
    });
    document.querySelectorAll('button[data-cheat]').forEach(btn=> {
      btn.addEventListener('click', ()=> {
        if(!state.player)return;
        const cheat=btn.getAttribute('data-cheat');
        if(cheat==='xp') {
          state.player.xp+=100;
          log(state, 'CHEAT: +100 XP added.');
          toast('Added 100 XP.', 'good');
        } else if(cheat==='gold') {
          state.player.moneyCp+=100000;
          log(state, 'CHEAT: +1000 gp added.');
          toast('Added 1000 gp.', 'good');
        } else if(cheat==='resources') {
          const resourceList=Array.isArray(RESOURCES)?RESOURCES.filter(resource=>resource&&resource.id):[];
          if(!resourceList.length) {
            toast('No resource types are loaded.', 'warn');
            return;
          }
          resourceList.forEach(resource=>addItem(state.player, resource.id, 5));
          log(state, 'CHEAT: +5 of each resource added to inventory.');
          toast('Added 5 of each resource type.', 'good');
        } else {
          return;
        }
        save(state);
        render();
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Combat engine
  // ---------------------------------------------------------------------------
  const COMBAT_ALLOWED_TABS=new Set(["combat", "character", "settings"]);

  const COMBAT_ROW_FRONT="front";

  const COMBAT_ROW_BACK="back";

  const COMBAT_MAX_COLUMNS=5;

  const COMBAT_HEALING_ITEM_IDS=["potion_healing", "greater_potion_healing"];

  const COMBAT_TARGETING_MODES={
    single:"single", row:"row", column:"column", all:"all", self:"self"
  };

  const COMBAT_MONSTER_EMOJIS={
    goblin:"👺", wolf:"🐺", skeleton:"💀", bandit:"🗡️", slime:"🟢", crystal_spider:"🕷️", ember_hound:"🐕", cinder_acolyte:"🔥", marsh_troll:"👹", fen_wraith:"👻", storm_drake:"🐉", obsidian_knight:"🛡️"
  };

  const COMBAT_ABILITY_TARGETING={
    second_wind:{
      side:"ally", mode:COMBAT_TARGETING_MODES.self
    }, power_strike:{
      side:"enemy", mode:COMBAT_TARGETING_MODES.single
    }, feint_strike:{
      side:"enemy", mode:COMBAT_TARGETING_MODES.single
    }, guard_strike:{
      side:"ally", mode:COMBAT_TARGETING_MODES.self
    }, enrage:{
      side:"ally", mode:COMBAT_TARGETING_MODES.self
    }, topple:{
      side:"enemy", mode:COMBAT_TARGETING_MODES.single
    }, vicious_strike:{
      side:"enemy", mode:COMBAT_TARGETING_MODES.single
    }, tree_stance:{
      side:"ally", mode:COMBAT_TARGETING_MODES.self
    }, river_stance:{
      side:"ally", mode:COMBAT_TARGETING_MODES.self
    }, mountain_stance:{
      side:"ally", mode:COMBAT_TARGETING_MODES.self
    }, cloud_stance:{
      side:"ally", mode:COMBAT_TARGETING_MODES.self
    }, flame_stance:{
      side:"ally", mode:COMBAT_TARGETING_MODES.self
    }, hunters_mark:{
      side:"enemy", mode:COMBAT_TARGETING_MODES.single
    }, precise_strike:{
      side:"enemy", mode:COMBAT_TARGETING_MODES.single
    }, spike_lure:{
      side:"ally", mode:COMBAT_TARGETING_MODES.self
    }, dirty_trick:{
      side:"enemy", mode:COMBAT_TARGETING_MODES.single
    }, cover_step:{
      side:"enemy", mode:COMBAT_TARGETING_MODES.single
    }, open_wound:{
      side:"enemy", mode:COMBAT_TARGETING_MODES.single
    }
  };

  const COMBAT_ITEM_TARGETING={
    potion_healing:{
      side:"ally", mode:COMBAT_TARGETING_MODES.single, kind:"healing"
    }, greater_potion_healing:{
      side:"ally", mode:COMBAT_TARGETING_MODES.single, kind:"healing"
    }
  };

  let combatGuardInstalled=false;

  function normalizeCombatRow(row) {
    return row===COMBAT_ROW_BACK?COMBAT_ROW_BACK:COMBAT_ROW_FRONT;
  }

  function isCombatAccessibleTab(tabId) {
    return COMBAT_ALLOWED_TABS.has(String(tabId||""));
  }

  function currentAreaDef(state) {
    return AREAS.find(area=>area.id===(state&&state.world?state.world.areaId:null))||null;
  }

  function combatMonsterCountForArea(areaDef) {
    if(!areaDef||!areaDef.map)return 1;
    if(Number(areaDef.level||0)>5)return 1+rollInt(1, 3);
    if(Number(areaDef.level||0)>3)return 1+rollInt(1, 2);
    return 1;
  }

  function combatTargetingRuleForAbility(abilityId) {
    return COMBAT_ABILITY_TARGETING[abilityId]||{
      side:"enemy", mode:COMBAT_TARGETING_MODES.single
    };
  }

  function combatTargetingRuleForItem(itemId) {
    return COMBAT_ITEM_TARGETING[itemId]||null;
  }

  function monsterCombatEmoji(monsterId) {
    return COMBAT_MONSTER_EMOJIS[monsterId]||"👹";
  }

  function buildEncounterMonsterIds(state, primaryMonsterId) {
    const areaDef=currentAreaDef(state);
    const count=combatMonsterCountForArea(areaDef);
    const pool=areaDef&&Array.isArray(areaDef.encounterPool)&&areaDef.encounterPool.length?areaDef.encounterPool.slice():[primaryMonsterId];
    const ids=[primaryMonsterId];
    while(ids.length<count) {
      ids.push(pool[rollInt(0, pool.length-1)]||primaryMonsterId);
    }
    return ids;
  }

  function createEnemyCombatant(monsterId, combatId, row) {
    const monster=getMonster(monsterId);
    return {
      combatId, side:"enemy", row:normalizeCombatRow(row), id:monster.id, name:monster.name, level:monster.level, hp:{
        current:monster.hp, max:monster.hp
      }, ac:monster.ac, attackBonus:monster.attackBonus, damage:monster.damage, damageType:monster.damageType, loot:monster.loot, traits:Array.isArray(monster.traits)?[...monster.traits]:[], status:Array.isArray(monster.status)?monster.status.map(entry=>({
        ...entry, dc:Number(entry.dc||0)
      })):[], statusEffects:[], icon:monster.emoji||monster.icon||monsterCombatEmoji(monster.id), imageUrl:monster.imageUrl||monster.image||null
    };
  }

  function createCombatAlliesFromState() {
    return[{
      combatId:"ally_player", side:"ally", row:COMBAT_ROW_FRONT, actorType:"player", icon:"🧍", imageUrl:null
    }];
  }

  function normalizeEnemyCombatant(enemy,index){if(!enemy||typeof enemy!=="object")return null;enemy.combatId=typeof enemy.combatId==="string"&&enemy.combatId.trim()?enemy.combatId:`enemy_${index + 1}`;enemy.side="enemy";enemy.row=normalizeCombatRow(enemy.row);enemy.traits=Array.isArray(enemy.traits)?enemy.traits:[];enemy.status=Array.isArray(enemy.status)?enemy.status.map(entry=>({...entry,id:normalizeSaveId(entry&&(entry.id||entry.label||entry.saveId||"")),dc:Number(entry&&entry.dc||0),label:entry&&entry.label?entry.label:saveLabel(entry&&(entry.id||entry.label||entry.saveId||""))})):[];enemy.statusEffects=Array.isArray(enemy.statusEffects)?enemy.statusEffects.map(effect=>normalizeStatusEffect(effect)):[];enemy.hp={current:Math.max(0,Number(enemy.hp&&enemy.hp.current!=null?enemy.hp.current:enemy.hp&&enemy.hp.max||enemy.hp||0)),max:Math.max(1,Number(enemy.hp&&enemy.hp.max||enemy.hp||1))};enemy.icon=enemy.icon||monsterCombatEmoji(enemy.id);enemy.imageUrl=enemy.imageUrl||enemy.image||null;return enemy;}

  function normalizeCombatAllyDescriptor(ally,index){const normalized=ally&&typeof ally==="object"?{...ally}:{};normalized.combatId=typeof normalized.combatId==="string"&&normalized.combatId.trim()?normalized.combatId:`ally_${index + 1}`;normalized.side="ally";normalized.row=normalizeCombatRow(normalized.row);normalized.actorType=normalized.actorType||(index===0?"player":"ally");normalized.icon=normalized.icon||(normalized.actorType==="player"?"🧍":"🧑");normalized.imageUrl=normalized.imageUrl||normalized.image||null;return normalized;}

  function isCombatEnemyAlive(enemy) {
    return!!(enemy&&enemy.hp&&Number(enemy.hp.current||0)>0);
  }

  function isCombatAllyDescriptorAlive(st, ally) {
    if(!ally)return false;
    if(ally.actorType==="player")return!!(st&&st.player&&st.player.hp&&Number(st.player.hp.current||0)>0);
    return!!(ally.hp&&Number(ally.hp.current||0)>0);
  }

  function combatEnemyList(st) {
    return st&&st.combat&&Array.isArray(st.combat.enemies)?st.combat.enemies.filter(isCombatEnemyAlive):[];
  }

  function combatAllyDescriptors(st) {
    return st&&st.combat&&Array.isArray(st.combat.allies)?st.combat.allies.filter(ally=>isCombatAllyDescriptorAlive(st, ally)):[];
  }

  function getCombatEnemyById(st, combatId) {
    return st&&st.combat&&Array.isArray(st.combat.enemies)?st.combat.enemies.find(enemy=>enemy&&enemy.combatId===combatId)||null:null;
  }

  function getCombatAllyDescriptorById(st, combatId) {
    return st&&st.combat&&Array.isArray(st.combat.allies)?st.combat.allies.find(ally=>ally&&ally.combatId===combatId)||null:null;
  }

  function combatAllyEntity(st, ally) {
    if(!ally)return null;
    if(ally.actorType==="player")return st.player;
    return ally;
  }

  function combatEnemyInfo(enemy) {
    if(!enemy)return null;
    return {
      id:enemy.combatId, side:"enemy", row:normalizeCombatRow(enemy.row), entity:enemy, name:enemy.name, hp:enemy.hp, ac:effectiveEnemyAC(enemy), baseAc:enemy.ac, attackBonus:effectiveEnemyAttackBonus(enemy), baseAttackBonus:Number(enemy.attackBonus||0), damage:enemy.damage, damageType:enemy.damageType, level:enemy.level, traits:Array.isArray(enemy.traits)?enemy.traits:[], icon:enemy.icon||monsterCombatEmoji(enemy.id), imageUrl:enemy.imageUrl||null, statusEffects:Array.isArray(enemy.statusEffects)?enemy.statusEffects:[], fortDc:creatureSaveDc(enemy, "fort"), reflexDc:creatureSaveDc(enemy, "reflex"), willDc:creatureSaveDc(enemy, "will")
    };
  }

  function combatAllyInfo(st,ally){const entity=combatAllyEntity(st,ally);if(!entity)return null;const playerAttack=attackProfile(st.player);const attackBonus=ally.actorType==="player"?(playerAttack?Number(playerAttack.attackBonus||0):0):Number(ally.attackBonus||0);const damage=ally.actorType==="player"?(playerAttack?`${playerAttack.damageExpr}${Number(playerAttack.attackAbilityMod || 0) ? "+mod" : ""}`:"—"):(ally.damage||"—");const damageType=ally.actorType==="player"?(playerAttack?playerAttack.damageType:"—"):(ally.damageType||"—");const ac=ally.actorType==="player"?calcAC(entity):Math.max(0,Number(ally.ac!=null?ally.ac:10));return{id:ally.combatId,side:"ally",row:normalizeCombatRow(ally.row),entity,name:entity.name||st.player.name,hp:entity.hp,ac,attackBonus,damage,damageType,icon:ally.icon||"🧍",imageUrl:ally.imageUrl||null,statusEffects:Array.isArray(entity.statusEffects)?entity.statusEffects:[],fortDc:creatureSaveDc(entity,"fort"),reflexDc:creatureSaveDc(entity,"reflex"),willDc:creatureSaveDc(entity,"will")};}

  function getCombatParticipantInfo(st, combatId) {
    const enemy=getCombatEnemyById(st, combatId);
    if(enemy)return combatEnemyInfo(enemy);
    const ally=getCombatAllyDescriptorById(st, combatId);
    if(ally)return combatAllyInfo(st, ally);
    return null;
  }

  function combatParticipantsForSide(st, side) {
    if(side==="ally")return combatAllyDescriptors(st).map(ally=>combatAllyInfo(st, ally)).filter(Boolean);
    return combatEnemyList(st).map(enemy=>combatEnemyInfo(enemy)).filter(Boolean);
  }

  function collapseCombatRows(st, side) {
    if(!st||!st.combat)return;
    const list=side==="ally"?(st.combat.allies||[]):(st.combat.enemies||[]);
    if(!Array.isArray(list)||!list.length)return;
    const frontAlive=list.some(entry=>(side==="ally"?isCombatAllyDescriptorAlive(st, entry):isCombatEnemyAlive(entry))&&normalizeCombatRow(entry.row)===COMBAT_ROW_FRONT);
    const backAlive=list.some(entry=>(side==="ally"?isCombatAllyDescriptorAlive(st, entry):isCombatEnemyAlive(entry))&&normalizeCombatRow(entry.row)===COMBAT_ROW_BACK);
    if(!frontAlive&&backAlive) {
      list.forEach(entry=> {
        if((side==="ally"?isCombatAllyDescriptorAlive(st, entry):isCombatEnemyAlive(entry))&&normalizeCombatRow(entry.row)===COMBAT_ROW_BACK) {
          entry.row=COMBAT_ROW_FRONT;
        }
      });
    }
  }

  function preferredCombatEnemy(st) {
    if(!st||!st.combat)return null;
    const enemies=combatEnemyList(st);
    if(!enemies.length)return null;
    if(st.combat.lastSelectedEnemyId) {
      const remembered=enemies.find(enemy=>enemy.combatId===st.combat.lastSelectedEnemyId);
      if(remembered)return remembered;
    }
    if(st.combat.selectedTargetId&&st.combat.selectedTargetSide==="enemy") {
      const selected=enemies.find(enemy=>enemy.combatId===st.combat.selectedTargetId);
      if(selected)return selected;
    }
    return enemies[0]||null;
  }

  function normalizeCombatState(st) {
    if(!st||!st.combat)return;
    const combat=st.combat;
    if(Array.isArray(combat.enemies)&&combat.enemies.length) {
      combat.enemies=combat.enemies.map((enemy, index)=>normalizeEnemyCombatant(enemy, index)).filter(Boolean);
    } else if(combat.enemy) {
      combat.enemies=[normalizeEnemyCombatant(combat.enemy, 0)].filter(Boolean);
    } else {
      combat.enemies=[];
    }
    combat.allies=Array.isArray(combat.allies)&&combat.allies.length?combat.allies.map((ally, index)=>normalizeCombatAllyDescriptor(ally, index)).filter(Boolean):createCombatAlliesFromState();
    combat.defeatedEnemies=Array.isArray(combat.defeatedEnemies)?combat.defeatedEnemies.map((enemy, index)=>normalizeEnemyCombatant(enemy, index)).filter(Boolean):[];
    combat.playerFlags=combat.playerFlags&&typeof combat.playerFlags==="object"?combat.playerFlags:{
    };
    combat.ui=combat.ui&&typeof combat.ui==="object"?combat.ui:{
    };
    combat.ui.panel=combat.ui.panel==="items"?"items":"actions";
    combat.turn=combat.turn==="enemy"?"enemy":"player";
    combat.selectedTargetId=typeof combat.selectedTargetId==="string"?combat.selectedTargetId:null;
    combat.selectedTargetSide=combat.selectedTargetSide==="ally"?"ally":"enemy";
    combat.targeting=normalizeCombatTargetSpec(combat.targeting||{
      side:"enemy", mode:COMBAT_TARGETING_MODES.single
    });
    collapseCombatRows(st, "enemy");
    collapseCombatRows(st, "ally");
    if(!combat.enemies.length) {
      st.combat=null;
      return;
    }
    const selectedInfo=combat.selectedTargetId?getCombatParticipantInfo(st, combat.selectedTargetId):null;
    if(!selectedInfo) {
      const firstEnemy=preferredCombatEnemy(st)||combat.enemies[0];
      combat.selectedTargetId=firstEnemy?firstEnemy.combatId:null;
      combat.selectedTargetSide=firstEnemy?"enemy":"enemy";
    }
    const currentEnemy=preferredCombatEnemy(st)||combat.enemies[0]||null;
    if(currentEnemy) {
      combat.lastSelectedEnemyId=currentEnemy.combatId;
      combat.enemy=currentEnemy;
    } else {
      combat.enemy=null;
    }
  }

  function setSelectedCombatTarget(st, combatId) {
    normalizeCombatState(st);
    if(!st||!st.combat)return;
    const info=getCombatParticipantInfo(st, combatId);
    if(!info)return;
    st.combat.selectedTargetId=info.id;
    st.combat.selectedTargetSide=info.side;
    if(info.side==="enemy") {
      st.combat.lastSelectedEnemyId=info.id;
      st.combat.enemy=info.entity;
    } else {
      const remembered=preferredCombatEnemy(st);
      st.combat.enemy=remembered||null;
    }
    if(st.combat.ui&&st.combat.ui.panel==="items"&&!getCombatUsableItemsForTarget(st, info).length) {
      st.combat.ui.panel="actions";
    }
  }

  function restoreEnemySelectionBetweenRounds(st) {
    normalizeCombatState(st);
    if(!st||!st.combat)return;
    const current=st.combat.selectedTargetId?getCombatParticipantInfo(st, st.combat.selectedTargetId):null;
    if(current&&current.side==="enemy") {
      if(current.entity&&current.entity.hp&&Number(current.entity.hp.current||0)>0) {
        st.combat.lastSelectedEnemyId=current.id;
        st.combat.enemy=current.entity;
        return;
      }
    }
    const nextEnemy=preferredCombatEnemy(st);
    if(nextEnemy) {
      st.combat.selectedTargetId=nextEnemy.combatId;
      st.combat.selectedTargetSide="enemy";
      st.combat.lastSelectedEnemyId=nextEnemy.combatId;
      st.combat.enemy=nextEnemy;
      if(st.combat.ui)st.combat.ui.panel="actions";
    }
  }

  function combatRowMembers(st, side, row) {
    return combatParticipantsForSide(st, side).filter(info=>normalizeCombatRow(info.row)===normalizeCombatRow(row)).slice(0, COMBAT_MAX_COLUMNS);
  }

  function combatParticipantColumnIndex(st, side, combatId) {
    const info=getCombatParticipantInfo(st, combatId);
    if(!info||info.side!==side)return-1;
    const rowMembers=combatRowMembers(st, side, info.row);
    return rowMembers.findIndex(entry=>entry.id===combatId);
  }

  function normalizeCombatTargetSpec(spec) {
    const raw=spec&&typeof spec==="object"?spec:{
    };
    return {
      side:raw.side==="ally"?"ally":"enemy", mode:Object.values(COMBAT_TARGETING_MODES).includes(raw.mode)?raw.mode:COMBAT_TARGETING_MODES.single, row:raw.row===COMBAT_ROW_BACK?COMBAT_ROW_BACK:raw.row===COMBAT_ROW_FRONT?COMBAT_ROW_FRONT:null, column:Number.isFinite(Number(raw.column))?Math.max(0, Math.floor(Number(raw.column))):null
    };
  }

  function resolveCombatTargetsFromSpec(st, spec, {
    selectedTargetId=null
  }
  ={
  }) {
    normalizeCombatState(st);
    if(!st||!st.combat)return[];
    const normalized=normalizeCombatTargetSpec(spec);
    if(normalized.mode===COMBAT_TARGETING_MODES.self) {
      return combatParticipantsForSide(st, "ally").filter(info=>info.entity===st.player);
    }
    const participants=combatParticipantsForSide(st, normalized.side);
    if(!participants.length)return[];
    const baseTarget=getCombatParticipantInfo(st, selectedTargetId||st.combat.selectedTargetId||"");
    if(normalized.mode===COMBAT_TARGETING_MODES.all) {
      return participants;
    }
    if(normalized.mode===COMBAT_TARGETING_MODES.row) {
      const rowId=normalized.row||(baseTarget&&baseTarget.side===normalized.side?baseTarget.row:COMBAT_ROW_FRONT);
      return participants.filter(info=>normalizeCombatRow(info.row)===normalizeCombatRow(rowId));
    }
    if(normalized.mode===COMBAT_TARGETING_MODES.column) {
      const baseColumn=normalized.column!=null?normalized.column:(baseTarget&&baseTarget.side===normalized.side?combatParticipantColumnIndex(st, normalized.side, baseTarget.id):0);
      return participants.filter(info=>combatParticipantColumnIndex(st, normalized.side, info.id)===baseColumn);
    }
    if(!baseTarget||baseTarget.side!==normalized.side)return[];
    return[baseTarget];
  }

  function validateCombatTargetSelection(st, spec) {
    const targets=resolveCombatTargetsFromSpec(st, spec);
    if(Array.isArray(targets)&&targets.length)return {
      ok:true, targets
    };
    const normalized=normalizeCombatTargetSpec(spec);
    if(normalized.mode===COMBAT_TARGETING_MODES.self) {
      return {
        ok:true, targets:combatParticipantsForSide(st, "ally").filter(info=>info.entity===st.player)
      };
    }
    if(normalized.side==="enemy")return {
      ok:false, reason:"Select an enemy target first.", targets:[]
    };
    return {
      ok:false, reason:"Select a party target first.", targets:[]
    };
  }

  function combatantDetailsTooltipHtml(st,combatId){const info=getCombatParticipantInfo(st,combatId);if(!info)return"";const statusText=info.statusEffects.length?info.statusEffects.map(effect=>`${effect.name}${effect.duration != null ? ` (${effect.duration})` : ""}`).join(", "):"None";if(info.side==="enemy"){return`
          <div style="font-weight:700; font-size:13px; margin-bottom:6px">${escapeHtml(info.name)}</div>
          <div class="trow"><div class="k">HP</div><div class="v">${info.hp.current}/${info.hp.max}</div></div>
          <div class="trow"><div class="k">AC</div><div class="v">${info.ac}</div></div>
          <div class="trow"><div class="k">Attack</div><div class="v">${fmtSigned(info.attackBonus)}</div></div>
          <div class="trow"><div class="k">Damage</div><div class="v">${escapeHtml(info.damage)} ${escapeHtml(info.damageType)}</div></div>
          <div class="trow"><div class="k">Fort / Ref / Will</div><div class="v">${info.fortDc} / ${info.reflexDc} / ${info.willDc}</div></div>
          <div class="small muted" style="margin-top:8px; line-height:1.45">Traits: ${escapeHtml(info.traits.length ? info.traits.join(", ") : "None")}</div>
          <div class="small muted" style="margin-top:6px; line-height:1.45">Status: ${escapeHtml(statusText)}</div>
        `;}return`
        <div style="font-weight:700; font-size:13px; margin-bottom:6px">${escapeHtml(info.name)}</div>
        <div class="trow"><div class="k">HP</div><div class="v">${info.hp.current}/${info.hp.max}</div></div>
        <div class="trow"><div class="k">SP</div><div class="v">${st.player.sp.current}/${st.player.sp.max}</div></div>
        <div class="trow"><div class="k">AC</div><div class="v">${info.ac}</div></div>
        <div class="trow"><div class="k">Attack</div><div class="v">${fmtSigned(info.attackBonus)}</div></div>
        <div class="trow"><div class="k">Damage</div><div class="v">${escapeHtml(info.damage)} ${escapeHtml(info.damageType)}</div></div>
        <div class="trow"><div class="k">Fort / Ref / Will</div><div class="v">${info.fortDc} / ${info.reflexDc} / ${info.willDc}</div></div>
        <div class="small muted" style="margin-top:8px; line-height:1.45">Status: ${escapeHtml(statusText)}</div>
      `;}

  function renderCombatMiniHealthBar(hp){const percent=Math.max(0,Math.min(100,Math.round((Number(hp&&hp.current||0)/Math.max(1,Number(hp&&hp.max||1)))*100)));return`<div class="combatMiniHp"><div class="combatMiniHpFill" style="width:${percent}%"></div></div>`;}

  function renderCombatAvatar(info){if(info.imageUrl){return`<img class="combatUnitImage" src="${escapeHtml(info.imageUrl)}" alt="${escapeHtml(info.name)}" loading="lazy"/>`;}return`<span class="combatUnitEmoji">${escapeHtml(info.icon || "❔")}</span>`;}

  function renderCombatUnit(info,{selected=false}={}){return`
        <button class="combatUnit ${selected ? "selected" : ""} ${info.side}" type="button" data-combat-select="${escapeHtml(info.id)}">
          <span class="combatUnitAvatar">${renderCombatAvatar(info)}</span>
          <span class="combatUnitName">${escapeHtml(info.name)}</span>
          ${renderCombatMiniHealthBar(info.hp)}
        </button>
      `;}

  function renderCombatRow(st,side,row){const members=combatRowMembers(st,side,row);if(!members.length)return"";const rowLabel=row===COMBAT_ROW_FRONT?"Front":"Back";const selectedId=st&&st.combat?st.combat.selectedTargetId:null;return`
        <div class="combatRowWrap ${side} ${row}">
          <div class="combatRowLabel">${rowLabel}</div>
          <div class="combatRowGrid">
            ${members.map(info => renderCombatUnit(info, { selected: info.id === selectedId })).join("")}
          </div>
        </div>
      `;}

  function renderCombatFormation(st,side,title){const front=renderCombatRow(st,side,COMBAT_ROW_FRONT);const back=renderCombatRow(st,side,COMBAT_ROW_BACK);if(!front&&!back)return"";const orderedRows=side==="enemy"?`${back ? back : ""}${front ? front : ""}`:`${front ? front : ""}${back ? back : ""}`;return`
        <section class="combatFormation ${side}">
          <div class="combatFormationTitle">${escapeHtml(title)}</div>
          ${orderedRows}
        </section>
      `;}

  function renderTooltipWrappedButton(buttonHtml,tooltip){if(!tooltip)return buttonHtml;return`<span class="combatActionWrap" data-tooltip="${escapeHtml(tooltip)}">${buttonHtml}</span>`;}

  function getCombatUsableItemsForTarget(st, targetInfo=null) {
    if(!st||!st.player)return[];
    const selected=targetInfo||(st.combat&&st.combat.selectedTargetId?getCombatParticipantInfo(st, st.combat.selectedTargetId):null);
    return COMBAT_HEALING_ITEM_IDS.map(itemId=> {
      const item=ITEM_INDEX.has(itemId)?getItem(itemId):null;
      if(!item)return null;
      const qty=itemQuantity(st.player, itemId);
      const validation=canUseCombatItemOnTarget(st, itemId, selected);
      return {
        itemId, item, qty, ok:validation.ok, reason:validation.reason||""
      };
    }).filter(entry=>entry&&entry.qty>0&&entry.ok);
  }

  function canUseCombatItemOnTarget(st,itemId,targetInfo=null){if(!st||!st.combat)return{ok:false,reason:"Combat items can only be used during combat."};if(st.combat.turn!=="player")return{ok:false,reason:"It is not your turn."};const item=ITEM_INDEX.has(itemId)?getItem(itemId):null;if(!item||!COMBAT_HEALING_ITEM_IDS.includes(itemId))return{ok:false,reason:"That item is not usable in combat yet."};if(!hasItem(st.player,itemId,1))return{ok:false,reason:`You have no ${item.name.toLowerCase()}.`};const selected=targetInfo||(st.combat.selectedTargetId?getCombatParticipantInfo(st,st.combat.selectedTargetId):null);const selection=validateCombatTargetSelection(st,combatTargetingRuleForItem(itemId));if(!selection.ok||!selected)return{ok:false,reason:"Select a party target first."};if(selected.side!=="ally")return{ok:false,reason:"Healing items can only target your party."};if(Number(selected.entity&&selected.entity.hp&&selected.entity.hp.current||0)>=Number(selected.entity&&selected.entity.hp&&selected.entity.hp.max||0)){return{ok:false,reason:`${selected.name} is already at full HP.`};}return{ok:true,target:selected};}

  function combatItemsDisabledReason(st,targetInfo=null){if(!st||!st.combat)return"Not in combat.";if(st.combat.turn!=="player")return"It is not your turn.";const selected=targetInfo||(st.combat.selectedTargetId?getCombatParticipantInfo(st,st.combat.selectedTargetId):null);if(!selected)return"Select a target first.";if(selected.side!=="ally")return"Select a party member to use healing items.";if(COMBAT_HEALING_ITEM_IDS.every(itemId=>itemQuantity(st.player,itemId)<=0))return"You have no healing potions that can be used in combat.";if(Number(selected.entity&&selected.entity.hp&&selected.entity.hp.current||0)>=Number(selected.entity&&selected.entity.hp&&selected.entity.hp.max||0)){return`${selected.name} is already at full HP.`;}return"";}

  function rewardEnemyClone(enemy) {
    return JSON.parse(JSON.stringify(enemy));
  }

  function encounterEnemySummary(enemies){const names=(Array.isArray(enemies)?enemies:[]).map(enemy=>enemy&&enemy.name).filter(Boolean);if(!names.length)return"the encounter";if(names.length===1)return`the ${names[0]}`;if(names.length===2)return`${names[0]} and ${names[1]}`;if(names.length===3)return`${names[0]}, ${names[1]}, and ${names[2]}`;return`${names.length} enemies`;}

  function removeEnemyFromCombat(st,enemy){if(!st||!st.combat||!enemy)return{defeated:false,encounterWon:false};const existing=getCombatEnemyById(st,enemy.combatId);if(!existing)return{defeated:false,encounterWon:false};st.combat.defeatedEnemies=Array.isArray(st.combat.defeatedEnemies)?st.combat.defeatedEnemies:[];st.combat.defeatedEnemies.push(rewardEnemyClone(existing));st.combat.enemies=st.combat.enemies.filter(entry=>entry.combatId!==existing.combatId);notifyCombatAction(`${existing.name} falls.`,"good");collapseCombatRows(st,"enemy");if(!Array.isArray(st.combat.enemies)||!st.combat.enemies.length){endCombat(st,true);return{defeated:true,encounterWon:true};}restoreEnemySelectionBetweenRounds(st);return{defeated:true,encounterWon:false};}

  function applyEncounterVictoryRewards(st,enemies){const defeated=Array.isArray(enemies)?enemies.filter(Boolean):[];const rewards=[];const itemTotals=new Map();let totalXp=0;let totalCoins=0;const monsterLootDoubled=hasAbility(st.player,"skill_stealth_monster_plunder")||hasAbility(st.player,"skill_feat_stealth_monster_plunder");defeated.forEach(enemy=>{totalXp+=Number(enemy.level||0)*35;if(enemy.loot&&enemy.loot.coins){const lo=Number(enemy.loot.coins[0]||0);const hi=Number(enemy.loot.coins[1]||0);let coins=rollInt(lo,hi);if(monsterLootDoubled)coins*=2;totalCoins+=coins;}if(enemy.loot&&Array.isArray(enemy.loot.items)){enemy.loot.items.forEach(drop=>{if(Math.random()>Number(drop.chance||0))return;let qty=rollInt(Number(drop.qty&&drop.qty[0]||1),Number(drop.qty&&drop.qty[1]||1));if(monsterLootDoubled)qty*=2;itemTotals.set(drop.id,(itemTotals.get(drop.id)||0)+qty);});}});st.player.xp+=totalXp;rewards.push(`${totalXp} XP`);log(st,`You defeat ${encounterEnemySummary(defeated)} and gain ${totalXp} XP.`);if(totalCoins>0){addCoins(st,totalCoins);rewards.push(formatCoins(totalCoins));log(st,`Loot: ${formatCoins(totalCoins)}${monsterLootDoubled ? " (Monster Plunder doubled it)" : ""}.`);}itemTotals.forEach((qty,itemId)=>{addItem(st.player,itemId,qty);rewards.push(`${qty}× ${getItem(itemId).name}`);log(st,`Loot: ${qty}× ${getItem(itemId).name}${monsterLootDoubled ? " (Monster Plunder doubled it)" : ""}.`);});if((hasAbility(st.player,"skill_survival_field_dressing")||hasAbility(st.player,"skill_feat_survival_field_dressing"))&&defeated.length){const strongestLevel=defeated.reduce((best,enemy)=>Math.max(best,Number(enemy.level||0)),0);const heal=Math.max(1,strongestLevel+statMod(st.player.stats.WIS));const before=st.player.hp.current;st.player.hp.current=clamp(st.player.hp.current+heal,0,st.player.hp.max);const healed=st.player.hp.current-before;rewards.push(`${healed} HP recovered`);log(st,`Field Dressing restores ${healed} HP after the fight.`);}defeated.forEach(enemy=>notifyQuestEvent(st,"kill",{monsterId:enemy.id,count:1}));return rewards;}

  function flashCombatLockTooltip(event,message){if(!message)return;ensureOverlays();let x=0;let y=0;if(event&&Number.isFinite(Number(event.clientX))&&Number.isFinite(Number(event.clientY))){x=Number(event.clientX||0);y=Number(event.clientY||0);}else{const target=event&&event.target&&typeof event.target.closest==="function"?event.target.closest("button, .tabbtn, [role='button']"):null;if(target){const rect=target.getBoundingClientRect();x=rect.left+(rect.width/2);y=rect.top+(rect.height/2);}}showTooltip(`<div class="small muted" style="line-height:1.45">${escapeHtml(message)}</div>`,x,y);window.setTimeout(()=>hideTooltip(),1400);}

  function installCombatGuard() {
    if(combatGuardInstalled)return;
    combatGuardInstalled=true;
    document.addEventListener("click", (event)=> {
      const target=event.target;
      if(!(target instanceof Element))return;
      const button=target.closest("button, [role='button']");
      if(!button||!state||!state.player||!state.combat)return;
      if(button.closest("#modal")||button.closest("[data-ui-action='dismiss-combat-notice']"))return;
      const tab=button.getAttribute("data-tab");
      if(tab&&!isCombatAccessibleTab(tab)) {
        event.preventDefault();
        event.stopPropagation();
        flashCombatLockTooltip(event, "There's still a combat happening.");
        state.tab="combat";
        state.ui.mobileActionsVisible=false;
        render();
        return;
      }
      if(isCombatAccessibleTab(state.tab))return;
      event.preventDefault();
      event.stopPropagation();
      flashCombatLockTooltip(event, "There's still a combat happening.");
      state.tab="combat";
      state.ui.mobileActionsVisible=false;
      render();
    }, true);
  }

  function advanceEntityStatusEffects(state,entity,{excludeTemplateIds=[],isMovement=false}={}){if(!entity||!Array.isArray(entity.statusEffects)||!entity.statusEffects.length)return;const excluded=new Set(excludeTemplateIds||[]);const ended=[];const kept=[];for(const effect of entity.statusEffects){const key=effect.templateId||effect.id;if(effect.duration==null||excluded.has(key)){kept.push(effect);continue;}if(!effectAdvancesOnAction(effect,{isMovement})){kept.push(effect);continue;}if(Number(effect.ongoingDamage||0)>0){const sourceLabel=`${effect.name} deals ${effect.ongoingDamage} ${effect.ongoingDamageType} damage.`;if(entity===state.player){const res=dealDamageToPlayer(state,effect.ongoingDamage,effect.ongoingDamageType||"force",{sourceLabel});if(res.defeated)return;}else if(state.combat&&Array.isArray(state.combat.enemies)&&state.combat.enemies.some(enemy=>enemy===entity)){const res=dealDamageToEnemy(state,effect.ongoingDamage,effect.ongoingDamageType||"force",{sourceLabel,target:entity});if(res.defeated)return;}}if(effect.justApplied){effect.justApplied=false;kept.push(effect);continue;}const nextDuration=Math.max(0,Number(effect.duration||0)-1);effect.duration=nextDuration;if(nextDuration<=0){ended.push(effect);continue;}kept.push(effect);}entity.statusEffects=kept;ended.forEach(effect=>log(state,`${effect.name} ends.`));}

  function startEncounter(state,monsterId){clearCombatToastQueue();const encounterIds=buildEncounterMonsterIds(state,monsterId);const stamp=`${Date.now()}_${rollInt(1000, 9999)}`;const frontCount=Math.min(2,encounterIds.length);const enemies=encounterIds.map((id,index)=>createEnemyCombatant(id,`enemy_${stamp}_${index + 1}`,index<frontCount?COMBAT_ROW_FRONT:COMBAT_ROW_BACK));state.combat={enemies,allies:createCombatAlliesFromState(),defeatedEnemies:[],selectedTargetId:enemies[0]?enemies[0].combatId:null,selectedTargetSide:enemies[0]?"enemy":"enemy",lastSelectedEnemyId:enemies[0]?enemies[0].combatId:null,enemy:enemies[0]||null,targeting:{side:"enemy",mode:COMBAT_TARGETING_MODES.single},ui:{panel:"actions"},turn:"player",lastRolls:[],playerFlags:{}};const encounterNames=enemies.map(enemy=>enemy.name);const encounterLabel=encounterNames.length<=3?encounterNames.join(encounterNames.length===2?" and ":", "):`${encounterNames.length} enemies`;log(state,`Encounter! ${encounterLabel} appear${encounterNames.length === 1 ? "s" : ""}.`);if(hasAbility(state.player,"short_fuse")&&!hasStatusEffect(state.player,"enrage")){const fuseRoll=rollInt(1,4);if(fuseRoll===4){applyEnrageStatus(state,"Short Fuse triggers: you become Enraged just because.");}else{log(state,`Short Fuse does not trigger. (d4 ${fuseRoll})`);}}if(hasAbility(state.player,"ambush")){addOrRefreshStatusEffect(state.combat.enemy,createStatusEffect("off_guard"));log(state,`Ambush leaves ${state.combat.enemy.name} Off-Guard as combat begins.`);}if(state.combat&&(hasAbility(state.player,"skill_social_menacing_presence")||hasAbility(state.player,"skill_feat_social_menacing_presence"))){const roll=rollD20();const total=roll+skillTotal(state.player,"Social");const dc=creatureSaveDc(state.combat.enemy,"will");if(roll===20||total>=dc){addOrRefreshStatusEffect(state.combat.enemy,createStatusEffect("off_guard"));log(state,`Menacing Presence: Social d20(${roll}) + ${skillTotal(state.player, "Social")} = ${total} vs Will DC ${dc} → success. ${state.combat.enemy.name} becomes Off-Guard.`);}else{log(state,`Menacing Presence: Social d20(${roll}) + ${skillTotal(state.player, "Social")} = ${total} vs Will DC ${dc} → failure.`);}}toast(`Encounter! ${encounterNames.length === 1 ? encounterNames[0] : `${encounterNames.length} enemies`}`,"bad");state.tab="combat";save(state);}

  function endCombat(state,victory){const defeatedEnemies=state&&state.combat&&Array.isArray(state.combat.defeatedEnemies)?state.combat.defeatedEnemies.slice():[];const enemySummary=encounterEnemySummary(defeatedEnemies);if(victory){const rewards=applyEncounterVictoryRewards(state,defeatedEnemies);const tile=currentTile(state);if(tile&&tile.type==="monster")tile.resolved=true;setCombatNotice(state,{kind:"good",title:"Victory",summary:`You defeated ${enemySummary}.`,sectionTitle:"Rewards",items:rewards.length?rewards:["No additional rewards."]});}else{log(state,`You escape from ${enemySummary}.`);setCombatNotice(state,{kind:"neutral",title:"Escape",summary:`You escaped from ${enemySummary}.`,sectionTitle:"Outcome",items:["No rewards or losses were applied."]});}state.combat=null;if(state.tab==="combat")state.tab="explore";save(state);}

  function handlePlayerDefeat(state){clearTimedStatusEffectsOnDown(state);log(state,"TESTING MODE, DEATH PENALTIES WILL BE RE-IMPLEMENTED LATER PROBABLY");state.world.areaId="town";state.combat=null;state.tab="explore";state.player.hp.current=state.player.hp.max;state.player.sp.current=state.player.sp.max;setCombatNotice(state,{kind:"neutral",title:"YOU DIED.",summary:"TESTING MODE, DEATH PENALTIES WILL BE RE-IMPLEMENTED LATER PROBABLY",sectionTitle:"Outcome",items:["No death penalties were applied.","Returned to Astaria.",`Recovered to ${state.player.hp.current}/${state.player.hp.max} HP`,`Recovered to ${state.player.sp.current}/${state.player.sp.max} SP`]});save(state);return{defeated:true};}

  function dealDamageToEnemy(state,amount,damageType,{sourceLabel="",target=null}={}){normalizeCombatState(state);const enemy=target||preferredCombatEnemy(state)||(state.combat?state.combat.enemy:null);if(!state.combat||!enemy)return{damage:0,defeated:false};const dmg=Math.max(0,Number(amount||0));enemy.hp.current=clamp(enemy.hp.current-dmg,0,enemy.hp.max);if(sourceLabel){log(state,`${sourceLabel} ${enemy.name} takes ${dmg} ${damageType} damage.`);}if(enemy.hp.current<=0){const res=removeEnemyFromCombat(state,enemy);return{damage:dmg,defeated:true,encounterWon:!!res.encounterWon};}return{damage:dmg,defeated:false,encounterWon:false};}

  function playerAttack(state) {
    normalizeCombatState(state);
    if(!state.combat||state.combat.turn!=="player")return;
    beginCombatToastBatch("player");
    const mainResult=resolvePlayerAttack(state);
    let usedAction=mainResult.usedAction;
    if(state.combat&&!mainResult.enemyDefeated&&hasDualAgileAttack(state.player)) {
      const offHand=offHandAttackProfile(state.player);
      if(offHand) {
        const offResult=resolvePlayerAttack(state, {
          attack:offHand, prefix:"Off-hand follow-up. "
        });
        usedAction=usedAction||offResult.usedAction;
      }
    }
    if(usedAction)advanceStatusEffectsAfterAction(state);
    restoreEnemySelectionBetweenRounds(state);
    if(state.combat)enemyTurn(state);
    else {
      flushCombatToastBatch();
      save(state);
    }
    render();
  }

  function enemyTurn(state){normalizeCombatState(state);if(!state.combat)return;beginCombatToastBatch("enemy");const actingEnemies=combatEnemyList(state).slice();for(const enemy of actingEnemies){if(!state.combat)break;const liveEnemy=getCombatEnemyById(state,enemy.combatId);if(!liveEnemy||!isCombatEnemyAlive(liveEnemy))continue;const rollAsReductionPart=(rollData,sourceKey,label,note,currentValue)=>{const applied=Math.max(0,Math.min(Math.max(0,Number(currentValue||0)),Math.max(0,Number(rollData&&rollData.total||0))));if(!applied)return null;const dicePart=Array.isArray(rollData&&rollData.parts)?rollData.parts.find(part=>part&&part.type==="dice"):null;const expr=dicePart&&dicePart.expr?dicePart.expr:"Roll";const rolls=dicePart&&Array.isArray(dicePart.rolls)?dicePart.rolls.join(", "):"-";const details=Number(rollData&&rollData.total||0)==applied?`${note} Rolled ${expr}: ${rolls}.`:`${note} Rolled ${expr}: ${rolls}; capped to ${applied}.`;return createRollModifierPart(-applied,sourceKey,`${label} ${expr}[${rolls}]`,details);};const ac=calcAC(state.player);const attackRoll=rollD20Detailed("enemy_attack_roll",{label:liveEnemy.name,note:`${liveEnemy.name} makes an attack roll.`});const attackParts=[...cloneRollParts(attackRoll.parts),...cloneRollParts(enemyAttackBonusParts(liveEnemy))];const total=sumRollParts(attackParts);let outcome="miss";if(attackRoll.total===1){outcome="critfail";}else if(attackRoll.total===20||total>=ac){outcome=attackRoll.total===20?"crit":"hit";}const attackGroup=buildLogRollGroup({label:`${liveEnemy.name} attack`,parts:attackParts,total,targetLabel:"AC",targetValue:ac,outcome});const maybeResolveGuardStrike=()=>{if(!state.combat||!hasStatusEffect(state.player,"guard_strike_ready"))return false;removeStatusEffect(state.player,"guard_strike_ready");log(state,"Guard Strike triggers.");const res=resolvePlayerAttack(state,{prefix:"Guard Strike - free counter. ",ignoreFlyingPenalty:true,target:liveEnemy});return!!res.enemyDefeated&&!state.combat;};if(outcome==="miss"||outcome==="critfail"){log(state,`${liveEnemy.name} misses you.`,{rollGroups:[attackGroup]});notifyCombatAction(`${liveEnemy.name} misses you.`,"miss");if(hasAbility(state.player,"parry")&&state.combat){addOrRefreshStatusEffect(liveEnemy,createStatusEffect("off_guard"));log(state,`Parry leaves ${liveEnemy.name} Off-Guard.`);}if(hasStatusEffect(state.player,"spike_lure")&&state.combat){const spikeRoll=rollDiceDetailed("1d4","spike_lure",{label:"Spike Lure",note:"Spike Lure deals 1d4 piercing damage when an enemy misses you."});const spikeGroup=buildLogRollGroup({label:"Spike Lure damage",parts:spikeRoll.parts,total:spikeRoll.total});const res=dealDamageToEnemy(state,spikeRoll.total,"piercing",{sourceLabel:"",target:liveEnemy});log(state,`Spike Lure hits ${liveEnemy.name} for ${res.damage} piercing damage.`,{rollGroups:[spikeGroup]});if(!state.combat){flushCombatToastBatch();save(state);render();return;}if(res.defeated)continue;}if(maybeResolveGuardStrike()){flushCombatToastBatch();save(state);render();return;}if(state.combat&&hasAbility(state.player,"aggressive_block")&&hasEquippedShield(state.player)&&(ac-total)>8){log(state,"Aggressive Block triggers.");const res=resolvePlayerAttack(state,{prefix:"Aggressive Block - free attack. ",target:liveEnemy});if(!state.combat){flushCombatToastBatch();save(state);render();return;}if(res.enemyDefeated)continue;}advanceEntityStatusEffects(state,liveEnemy,{isMovement:false});if(!state.combat){flushCombatToastBatch();save(state);render();return;}continue;}const damageRoll=rollDiceDetailed(liveEnemy.damage,"enemy_damage",{label:liveEnemy.name,note:`${liveEnemy.name} rolls damage.`});const damageParts=cloneRollParts(damageRoll.parts);if(outcome==="crit"){const critPart=createRollModifierPart(damageRoll.total,"critical_hit_bonus","Critical hit","A critical hit adds the base damage again.");if(critPart)damageParts.push(critPart);}let currentDamage=sumRollParts(damageParts);if(hasStatusEffect(state.player,"cloud_stance")){const cloudRoll=rollDiceDetailed("1d4","cloud_stance_reduction",{label:"Cloud Stance",note:"Cloud Stance reduces incoming damage by 1d4."});const cloudPart=rollAsReductionPart(cloudRoll,"cloud_stance_reduction","Cloud Stance","Cloud Stance reduces the damage total.",currentDamage);if(cloudPart){damageParts.push(cloudPart);currentDamage+=Number(cloudPart.value||0);}}if(currentDamage>0&&(hasAbility(state.player,"skill_acrobatics_defensive_roll")||hasAbility(state.player,"skill_feat_acrobatics_defensive_roll"))&&!(state.combat.playerFlags&&state.combat.playerFlags.defensiveRollUsed)){const defensiveRoll=rollDiceDetailed("1d6","defensive_roll_reduction",{label:"Defensive Roll",note:"Defensive Roll reduces incoming damage by 1d6 once per combat."});const defensivePart=rollAsReductionPart(defensiveRoll,"defensive_roll_reduction","Defensive Roll","Defensive Roll reduces the damage total.",currentDamage);if(defensivePart){damageParts.push(defensivePart);currentDamage+=Number(defensivePart.value||0);state.combat.playerFlags=state.combat.playerFlags||{};state.combat.playerFlags.defensiveRollUsed=true;}}const resistance=damageResistanceValue(state.player,liveEnemy.damageType);const reduced=Math.min(Math.max(0,currentDamage),resistance);const resistPart=createRollModifierPart(-reduced,"damage_resistance","Resistance",`Damage resistance against ${formatDamageTypeLabel(liveEnemy.damageType)} damage.`);if(resistPart){damageParts.push(resistPart);currentDamage-=reduced;}const flooredDamage=Math.max(0,currentDamage);const floorPart=createRollModifierPart(flooredDamage-currentDamage,"damage_floor","Minimum 0 damage","Damage cannot be reduced below 0.");if(floorPart)damageParts.push(floorPart);const dmg=Math.max(0,sumRollParts(damageParts));state.player.hp.current=clamp(state.player.hp.current-dmg,0,state.player.hp.max);const damageGroup=buildLogRollGroup({label:`${liveEnemy.name} damage`,parts:damageParts,total:dmg,note:`Final ${formatDamageTypeLabel(liveEnemy.damageType)} damage dealt to you.`});log(state,`${liveEnemy.name} ${outcome === "crit" ? "critically hits" : "hits"} you for ${dmg} ${liveEnemy.damageType} damage.`,{rollGroups:[attackGroup,damageGroup]});notifyCombatAction(`${liveEnemy.name} ${outcome === "crit" ? "critically hits" : "hits"} you for ${dmg} ${liveEnemy.damageType} damage.`,"bad");if(state.player.hp.current<=0){handlePlayerDefeat(state);flushCombatToastBatch();save(state);render();return;}if(hasAbility(state.player,"flight_step")){addOrRefreshStatusEffect(state.player,createStatusEffect("flight_step"));log(state,"Flight Step grants +2 AC for 1 round.");}if(maybeResolveGuardStrike()){flushCombatToastBatch();save(state);render();return;}if(state.combat&&hasAbility(state.player,"retaliate")&&hasStatusEffect(state.player,"enrage")&&state.player.hp.current<=Math.floor(state.player.hp.max/2)){log(state,"Retaliate triggers.");const res=resolvePlayerAttack(state,{prefix:"Retaliate - free attack. ",target:liveEnemy});if(!state.combat){flushCombatToastBatch();save(state);render();return;}if(res.enemyDefeated)continue;}advanceEntityStatusEffects(state,liveEnemy,{isMovement:false});if(!state.combat){flushCombatToastBatch();save(state);render();return;}}if(!state.combat){flushCombatToastBatch();save(state);render();return;}state.combat.turn="player";restoreEnemySelectionBetweenRounds(state);flushCombatToastBatch();save(state);render();}

  function finishPlayerAbilityUse(state) {
    advanceStatusEffectsAfterAction(state);
    restoreEnemySelectionBetweenRounds(state);
    if(state.combat)enemyTurn(state);
    else {
      flushCombatToastBatch();
      save(state);
    }
    render();
  }

  function applyCombatHealingItemToTarget(item,targetInfo){const amountMap={potion_healing:"2d4+2",greater_potion_healing:"4d4+4"};const amount=amountMap[item.id]||"1d1-1";const healRoll=rollDiceDetailed(amount,item.id,{label:item.name});const target=targetInfo.entity;const before=target.hp.current;target.hp.current=clamp(target.hp.current+healRoll.total,0,target.hp.max);const healed=Math.max(0,target.hp.current-before);const wasted=Math.max(0,healRoll.total-healed);const parts=cloneRollParts(healRoll.parts);const capPart=createRollModifierPart(-wasted,"healing_cap","Missing HP cap","Healing beyond the target's missing HP is lost.");if(capPart)parts.push(capPart);return{healed,rollGroup:buildLogRollGroup({label:`${item.name} healing`,note:targetInfo&&targetInfo.name?`Target: ${targetInfo.name}`:"",parts,total:healed})};}

  function useCombatItemOnTarget(state,itemId){const selected=state.combat&&state.combat.selectedTargetId?getCombatParticipantInfo(state,state.combat.selectedTargetId):null;const validation=canUseCombatItemOnTarget(state,itemId,selected);if(!validation.ok){log(state,validation.reason||"That item can't be used right now.");return;}beginCombatToastBatch("player");const item=getItem(itemId);removeItem(state.player,itemId,1);const healing=applyCombatHealingItemToTarget(item,validation.target);log(state,`You use ${item.name} on ${validation.target.name} and recover ${healing.healed} HP.`,{rollGroups:healing.rollGroup?[healing.rollGroup]:[]});notifyCombatAction(`You use ${item.name} on ${validation.target.name} and recover ${healing.healed} HP.`,"good");if(state.combat&&state.combat.ui)state.combat.ui.panel="actions";advanceStatusEffectsAfterAction(state);restoreEnemySelectionBetweenRounds(state);if(state.combat)enemyTurn(state);else{flushCombatToastBatch();save(state);}render();}

  function useConsumable(state,itemId){if(state.combat){useCombatItemOnTarget(state,itemId);return;}const item=getItem(itemId);if(!item||item.type!=="consumable"||typeof item.use!=="function"){log(state,"That item can't be used right now.");return;}if(!hasItem(state.player,itemId,1)){log(state,`You have no ${item.name.toLowerCase()}.`);return;}removeItem(state.player,itemId,1);item.use(state);save(state);render();}

  function flee(state){normalizeCombatState(state);if(!state.combat||state.combat.turn!=="player")return;beginCombatToastBatch("player");const enemies=combatEnemyList(state);const highestLevel=enemies.reduce((best,enemy)=>Math.max(best,Number(enemy.level||0)),0);const rollData=rollD20Detailed("flee_check",{label:"Acrobatics"});const parts=[...rollData.parts,...cloneRollParts(skillCheckSourceParts(state.player,"Acrobatics"))];const total=sumRollParts(parts);const dc=12+highestLevel*2;const rollGroup=buildLogRollGroup({label:"Flee",parts,total,targetLabel:"DC",targetValue:dc,outcome:(rollData.total===20||total>=dc)?"success":"failure"});if(rollData.total===20||total>=dc){log(state,"You flee successfully.",{rollGroups:[rollGroup]});notifyCombatAction(`You escape from ${encounterEnemySummary(enemies)}.`,"neutral");advanceStatusEffectsAfterAction(state);flushCombatToastBatch();endCombat(state,false);}else{log(state,"You fail to flee.",{rollGroups:[rollGroup]});notifyCombatAction(`You fail to escape from ${encounterEnemySummary(enemies)}.`,"miss");advanceStatusEffectsAfterAction(state);enemyTurn(state);}save(state);render();}

  function renderCombatTab(){normalizeCombatState(state);if(!state.combat){return`
          <div class="small muted">You are not currently in combat.</div>
          <div style="margin-top:10px"><button class="btn" id="btn_back">Return to Explore</button></div>
        `;}const selected=state.combat.selectedTargetId?getCombatParticipantInfo(state,state.combat.selectedTargetId):null;const ap=attackProfile(state.player);const offAp=offHandAttackProfile(state.player);const dualAgileAttack=!!(ap&&ap.weapon&&ap.isAgileWeapon&&offAp&&offAp.weapon&&offAp.isAgileWeapon);const offHandPenalty=offAp?offHandAttackPenalty(offAp):0;const dualWieldRank=isOffHandWeaponAttack(offAp)?classFeatRankValue(state.player,"dual_wield_mastery"):0;const offHandNetBonus=offAp?Number(offAp.attackBonus||0)+offHandPenalty:0;const offHandBreakdown=[];if(offHandPenalty!==0)offHandBreakdown.push(`${fmtSigned(offHandPenalty)} off-hand penalty`);if(dualWieldRank>0)offHandBreakdown.push(`Dual Wield Mastery ${fmtSigned(dualWieldRank)}`);const ammoItem=ap&&ap.ammoItemId?getItem(ap.ammoItemId):null;const ammoLine=ap&&ap.needsAmmo?(ap.outOfAmmo?`No ${ammoItem ? ammoItem.name.toLowerCase() : "ammo"} remaining. This weapon currently attacks as an unarmed strike.`:`${ap.ammoCount} ${ammoItem ? ammoItem.name.toLowerCase() : "ammo"} remaining.`):"";const attackDisabledReason=!selected?"Select a target first.":selected.side!=="enemy"?"Select an enemy target first.":state.combat.turn!=="player"?"It is not your turn.":"";const attackButton=renderTooltipWrappedButton(`<button class="btn primary" id="btn_attack" ${attackDisabledReason ? "disabled" : ""}>Attack</button>`,attackDisabledReason);const itemsDisabledReason=combatItemsDisabledReason(state,selected);const itemsButton=renderTooltipWrappedButton(`<button class="btn" id="btn_items_toggle" ${itemsDisabledReason ? "disabled" : ""}>Items</button>`,itemsDisabledReason);const activeCombatAbilities=playerAbilityIds(state.player).filter(id=>getAbility(id).kind==="active"&&(getAbility(id).contexts||[]).includes("combat"));const passiveCombatAbilities=playerAbilityIds(state.player).filter(id=>getAbility(id).kind==="passive"&&(getAbility(id).contexts||[]).includes("combat"));const activeButtons=activeCombatAbilities.length?activeCombatAbilities.map(id=>{const ability=getAbility(id);const availability=canUseActiveAbility(state,id);const button=`<button class="btn" data-ability-use="${ability.id}" data-ability="${ability.id}" ${availability.ok ? "" : "disabled"}>${escapeHtml(ability.name)}</button>`;return renderTooltipWrappedButton(button,availability.ok?"":availability.reason);}).join(""):`<span class="small muted">No active combat feats.</span>`;const itemButtons=getCombatUsableItemsForTarget(state,selected).map(entry=>`
        <button class="btn" type="button" data-combat-item="${escapeHtml(entry.itemId)}">
          ${escapeHtml(entry.item.name)} <span class="muted">×${entry.qty}</span>
        </button>
      `).join("");const detailsHtml=selected?`
        <div class="combatTargetHead">
          <div>
            <div class="combatTargetLabel">Selected ${selected.side === "enemy" ? "Target" : "Party Member"}</div>
            <div class="combatTargetName">${escapeHtml(selected.name)}</div>
          </div>
          <span class="pill combatDetailsPill" data-combat-details="${escapeHtml(selected.id)}">Details</span>
        </div>
        <div class="combatTargetStats">
          <span class="pill"><span class="muted">HP</span> <strong class="mono">${selected.hp.current}/${selected.hp.max}</strong></span>
          <span class="pill"><span class="muted">AC</span> <strong class="mono">${selected.ac}</strong></span>
        </div>
      `:`<div class="small muted">Select a combatant to inspect them.</div>`;return`
        <div class="grid combatTabLayout" style="gap:12px">
          <div class="panel combatBattlefieldPanel">
            <header><h2>Battlefield</h2><div class="hint">Front and back rows collapse forward automatically.</div></header>
            <div class="body combatBattlefieldBody">
              ${renderCombatFormation(state, "enemy", "Enemy Side")}
              <div class="combatTargetCard">
                ${detailsHtml}
                <div class="combatActionButtons">
                  ${attackButton}
                  ${itemsButton}
                  <button class="btn danger" id="btn_flee" ${state.combat.turn !== "player" ? "disabled" : ""}>Flee</button>
                </div>
                ${state.combat.ui && state.combat.ui.panel === "items" ? `
                  <div class="combatItemPanel">
                    <div class="combatSubheading">Combat Items</div>
                    <div class="combatActionButtons">
                      ${itemButtons || `<span class="small muted">No usable combat items for this target.</span>`}
                    </div>
                  </div>
                ` : ""}
                <div class="combatActionMeta small muted" style="line-height:1.5">
                  Attack with <strong>${escapeHtml(ap.weaponName)}</strong> (attack ${fmtSigned(ap.attackBonus)}, damage ${escapeHtml(ap.damageExpr)}+mod).
                  ${dualAgileAttack ? `<br/>Off-hand follow-up with <strong>${escapeHtml(offAp.weaponName)}</strong> at ${fmtSigned(offHandNetBonus)} to hit${offHandBreakdown.length ? ` (${escapeHtml(offHandBreakdown.join(", "))})` : ""}, then normal damage on a hit.` : ``}
                  ${ammoLine ? `<br/>${escapeHtml(ammoLine)}` : ``}
                </div>
                <div style="margin-top:12px">
                  <div class="combatSubheading">Feats</div>
                  <div class="combatActionButtons">${activeButtons}</div>
                </div>
              </div>
              ${renderCombatFormation(state, "ally", "Player Side")}
            </div>
          </div>

          <div class="panel">
            <header><h2>Combat Reference</h2><div class="hint">Compact status</div></header>
            <div class="body">
              <div class="small muted" style="margin-bottom:8px; line-height:1.5">
                Turn: <strong>${escapeHtml(state.combat.turn)}</strong>. Select a monster to attack or an ally to use a healing potion.
              </div>
              <div style="margin-top:12px">
                <div class="small muted" style="margin-bottom:6px">Passive combat feats</div>
                ${renderAbilityBadgeList(passiveCombatAbilities, "No passive combat feats")}
              </div>
              <div style="margin-top:12px">
                <div class="small muted" style="margin-bottom:6px">Your status effects</div>
                ${renderStatusEffectBadges(state.player, "- No active effects")}
              </div>
              <div style="margin-top:12px">
                <div class="small muted" style="margin-bottom:6px">Current resistances</div>
                ${renderResistanceBadgeList(state.player, "- No active resistances")}
              </div>
              <div style="margin-top:12px" class="small muted">
                Multi-target targeting is ready for <span class="mono">single / row / column / all</span> selections when abilities or items opt into it.
              </div>
            </div>
          </div>
        </div>
      `;}

  function wireCombatTab() {
    if(!state.combat) {
      document.getElementById("btn_back").addEventListener("click", ()=> {
        state.tab="explore";
        render();
      });
      return;
    }
    document.querySelectorAll("[data-combat-select]").forEach(btn=> {
      btn.addEventListener("click", ()=> {
        const combatId=btn.getAttribute("data-combat-select");
        setSelectedCombatTarget(state, combatId);
        render();
      });
    });
    const attackBtn=document.getElementById("btn_attack");
    if(attackBtn)attackBtn.addEventListener("click", ()=>playerAttack(state));
    const itemsToggleBtn=document.getElementById("btn_items_toggle");
    if(itemsToggleBtn)itemsToggleBtn.addEventListener("click", ()=> {
      if(!state.combat||!state.combat.ui)return;
      state.combat.ui.panel=state.combat.ui.panel==="items"?"actions":"items";
      render();
    });
    document.querySelectorAll("[data-combat-item]").forEach(btn=> {
      btn.addEventListener("click", ()=> {
        const itemId=btn.getAttribute("data-combat-item");
        useCombatItemOnTarget(state, itemId);
      });
    });
    const fleeBtn=document.getElementById("btn_flee");
    if(fleeBtn)fleeBtn.addEventListener("click", ()=>flee(state));
    document.querySelectorAll("button[data-ability-use]").forEach(btn=> {
      btn.addEventListener("click", ()=> {
        const abilityId=btn.getAttribute("data-ability-use");
        useActiveAbility(state, abilityId);
      });
    });
    const mainBody=document.getElementById("main_body");
    wireResolvedTooltips(mainBody, "[data-combat-details]", el=>combatantDetailsTooltipHtml(state, el.getAttribute("data-combat-details")||""));
  }

  function tabButton(id,label,disabled=false){const active=state.tab===id;const needsLevelAlert=id==="character"&&state&&state.player&&canLevelUp(state.player);const combatAlert=id==="combat"&&!!(state&&state.combat);const combatBlocked=!!(state&&state.combat&&!isCombatAccessibleTab(id));const tooltip=combatBlocked?` data-tooltip="There's still a combat happening."`:"";return`<button class="tabbtn ${active ? "active" : ""} ${needsLevelAlert ? "attention" : ""} ${combatAlert ? "combatAlert" : ""}" data-tab="${id}" ${disabled ? "disabled" : ""}${tooltip}><span>${label}</span>${needsLevelAlert ? '<span class="menuAlertDot">Level Up</span>' : combatAlert ? '<span class="menuAlertDot danger">Active</span>' : ''}</button>`;}

  function render() {
    normalizeCombatState(state);
    if(state&&state.player&&state.combat&&!isCombatAccessibleTab(state.tab)) {
      state.tab="combat";
    }
    const scrollPos=captureWindowScroll();
    clearExploreViewportSync();
    hideTooltip();
    if(!state||!state.player||state.tab!=="explore")window.onkeydown=null;
    if(!state.player) {
      renderCharacterCreator();
    } else {
      renderGame();
    }
    restoreWindowScroll(scrollPos);
    try {
      save(state);
    } catch(_) {
    }
  }

  // ---------------------------------------------------------------------------
  // Feat framework and shared ability flow
  // ---------------------------------------------------------------------------
  const DEFAULT_SHARED_MODAL_HTML=`
      <div class="modalBackdrop" data-modal-backdrop></div>
      <div class="modalCard" role="dialog" aria-modal="true" aria-labelledby="modal_title">
        <div class="modalHeader">
          <div class="modalTitle" id="modal_title">Confirm</div>
        </div>
        <div class="modalBody" id="modal_body"></div>
        <div class="modalActions">
          <button class="btn" id="modal_cancel">Cancel</button>
          <button class="btn primary" id="modal_ok">OK</button>
        </div>
      </div>
    `;

  function featTerminologyText(text){return String(text||"").replace(/\bskill abilities\b/gi,"skill feats").replace(/\bskill ability\b/gi,"skill feat").replace(/\bclass abilities\b/gi,"class feats").replace(/\bclass ability\b/gi,"class feat").replace(/\babilities\b/gi,"feats").replace(/\bability\b/gi,"feat");}

  function classFeatIds() {
    return Object.keys((PF_DATA&&PF_DATA.CLASS_FEATS)||{
    });
  }

  function isClassFeatId(featId) {
    const featData=(PF_DATA&&PF_DATA.CLASS_FEATS)||{
    };
    return!!featData[featId];
  }

  function getClassFeat(featId) {
    const featData=(PF_DATA&&PF_DATA.CLASS_FEATS)||{
    };
    return featData[featId]||null;
  }

  function classFeatMaxRank(featOrId) {
    const feat=typeof featOrId==="string"?getClassFeat(featOrId):featOrId;
    const raw=Number(feat&&feat.maxRank||10);
    return clamp(Number.isFinite(raw)?Math.floor(raw):10, 1, 10);
  }

  function normalizeQuestUnlocks(value) {
    const list=Array.isArray(value)?value:[];
    return[...new Set(list.map(entry=>String(entry||"").trim().toLowerCase()).filter(Boolean))];
  }

  function normalizePlayerClassOrder(player, levelsOverride=null, classOrderOverride=null) {
    const levels=levelsOverride&&typeof levelsOverride==="object"?levelsOverride:(player&&player.levels&&typeof player.levels==="object"?player.levels:{
    });
    const rawOrder=Array.isArray(classOrderOverride)?classOrderOverride:(Array.isArray(player&&player.classOrder)?player.classOrder:[]);
    const seen=new Set();
    const ordered=[];
    const push=(classId)=> {
      if(!CLASSES[classId]||seen.has(classId)||Number(levels[classId]||0)<=0)return;
      seen.add(classId);
      ordered.push(classId);
    };
    const startingClassId=player&&CLASSES[player.startingClassId]?player.startingClassId:null;
    if(startingClassId)push(startingClassId);
    rawOrder.forEach(push);
    Object.keys(CLASSES).forEach(push);
    return ordered;
  }

  function ensurePlayerClassOrder(player) {
    if(!player||typeof player!=="object")return[];
    player.classOrder=normalizePlayerClassOrder(player);
    return player.classOrder;
  }

  function ownedClassIdsInOrder(player, levelsOverride=null) {
    return normalizePlayerClassOrder(player, levelsOverride);
  }

  function classFeatBelongsToClass(featOrId, classId) {
    const feat=typeof featOrId==="string"?getClassFeat(featOrId):featOrId;
    if(!feat||!CLASSES[classId])return false;
    const classes=Array.isArray(feat.classes)?feat.classes.filter(cid=>!!CLASSES[cid]):[];
    if(classes.length)return classes.includes(classId);
    return feat.classId===classId;
  }

  function ensurePlayerFeatContainers(player) {
    if(!player||typeof player!=="object")return;
    const ranks=player.classFeatRanks&&typeof player.classFeatRanks==="object"?player.classFeatRanks:{
    };
    const normalized={
    };
    for(const featId of classFeatIds()) {
      const max=classFeatMaxRank(featId);
      const raw=Math.max(0, Math.floor(Number(ranks[featId]||0)));
      if(raw>0)normalized[featId]=clamp(raw, 0, max);
    }
    player.classFeatRanks=normalized;
    player.questUnlocks=normalizeQuestUnlocks(player.questUnlocks);
    ensurePlayerClassOrder(player);
  }

  function normalizeClassFeatRanks(source) {
    const ranks=source&&typeof source==="object"?source:{
    };
    const normalized={
    };
    for(const featId of classFeatIds()) {
      const max=classFeatMaxRank(featId);
      const raw=Math.max(0, Math.floor(Number(ranks[featId]||0)));
      if(raw>0)normalized[featId]=clamp(raw, 0, max);
    }
    return normalized;
  }

  function classFeatRankValue(playerOrRanks, featId) {
    if(!playerOrRanks)return 0;
    if(playerOrRanks.classFeatRanks)return Math.max(0, Number(playerOrRanks.classFeatRanks[featId]||0));
    return Math.max(0, Number(playerOrRanks[featId]||0));
  }

  function classFeatPointBudgetForTotal(total) {
    return Math.max(0, Math.floor(Number(total||0)))*3;
  }

  function classFeatPointBudget(player, totalLevelOverride=null) {
    return classFeatPointBudgetForTotal(totalLevelOverride==null?totalLevel(player):totalLevelOverride);
  }

  function classFeatPointsSpentFromRanks(ranks) {
    return Object.values(normalizeClassFeatRanks(ranks)).reduce((sum, value)=>sum+Math.max(0, Number(value||0)), 0);
  }

  function classFeatPointsSpent(player, ranksOverride=null) {
    ensurePlayerFeatContainers(player);
    return classFeatPointsSpentFromRanks(ranksOverride||player.classFeatRanks||{
    });
  }

  function classFeatPointsAvailable(player, options={
  }) {
    const ranksOverride=options.ranksOverride||null;
    const totalLevelOverride=options.totalLevelOverride==null?null:options.totalLevelOverride;
    return Math.max(0, classFeatPointBudget(player, totalLevelOverride)-classFeatPointsSpent(player, ranksOverride));
  }

  function sneakAttackTriggerMax(rank) {
    const r=Math.max(0, Number(rank||0));
    return Math.min(6, 1+r);
  }

  function sneakAttackDamageExpr(rank) {
    return Math.max(0, Number(rank||0))>=classFeatMaxRank("sneak_attack")?"2d6":"1d6";
  }

  function huntersMarkDamageExpr(rank) {
    return Math.max(0, Number(rank||0))>=classFeatMaxRank("hunters_mark")?"2d4":"1d4";
  }

  function buildClassFeatContext(player, options={
  }) {
    const levelsOverride=options.levelsOverride||null;
    const ranksOverride=options.ranksOverride||null;
    const totalLevelOverride=options.totalLevelOverride==null?null:options.totalLevelOverride;
    const questUnlocksOverride=options.questUnlocksOverride||null;
    ensurePlayerFeatContainers(player);
    const levels=Object.fromEntries(Object.keys(CLASSES).map(classId=>[classId, Math.max(0, Number(levelsOverride&&levelsOverride[classId]!=null?levelsOverride[classId]:player&&player.levels&&player.levels[classId]||0))]));
    const ranks=normalizeClassFeatRanks(ranksOverride==null?(player&&player.classFeatRanks)||{
    }
    :ranksOverride);
    const questUnlocks=new Set(normalizeQuestUnlocks(questUnlocksOverride!=null?questUnlocksOverride:(player&&player.questUnlocks)||[]));
    const total=totalLevelOverride==null?Object.values(levels).reduce((sum, level)=>sum+level, 0):Math.max(0, Number(totalLevelOverride||0));
    return {
      player, levels, ranks, questUnlocks, totalLevel:total, pointBudget:classFeatPointBudgetForTotal(total), pointsSpent:classFeatPointsSpentFromRanks(ranks)
    };
  }

  function formatClassFeatRequirementLabel(type,payload){if(type==="classAny"||type==="classAll"){const parts=(Array.isArray(payload)?payload:[]).map(entry=>`${entry.classId} ${Math.max(1, Number(entry.level || 1))}`);return parts.join(type==="classAny"?" or ":" and ");}if(type==="featRank"){const feat=getClassFeat(payload.featId);return`${feat ? feat.name : payload.featId} ${Math.max(1, Number(payload.rank || 1))}`;}if(type==="quest"){return`Quest unlock: ${formatDamageTypeLabel(payload.questId || payload)}`;}return String(payload||"Requirement");}

  function evaluateClassFeatRequirements(featOrId, ctx) {
    const feat=typeof featOrId==="string"?getClassFeat(featOrId):featOrId;
    if(!feat)return {
      ok:false, items:[{
        ok:false, label:"Unknown feat."
      }]
    };
    const requirements=feat.requirements||{
    };
    const items=[];
    const classAny=Array.isArray(requirements.classLevelsAnyOf)?requirements.classLevelsAnyOf.filter(entry=>entry&&entry.classId):[];
    if(classAny.length) {
      const ok=classAny.some(entry=>Number(ctx&&ctx.levels&&ctx.levels[entry.classId]||0)>=Math.max(1, Number(entry.level||1)));
      items.push({
        ok, label:formatClassFeatRequirementLabel("classAny", classAny)
      });
    }
    const classAll=Array.isArray(requirements.classLevelsAllOf)?requirements.classLevelsAllOf.filter(entry=>entry&&entry.classId):[];
    for(const entry of classAll) {
      const needed=Math.max(1, Number(entry.level||1));
      const ok=Number(ctx&&ctx.levels&&ctx.levels[entry.classId]||0)>=needed;
      items.push({
        ok, label:formatClassFeatRequirementLabel("classAll", [entry])
      });
    }
    const featRanksAll=Array.isArray(requirements.featRanksAllOf)?requirements.featRanksAllOf.filter(entry=>entry&&entry.featId):[];
    for(const entry of featRanksAll) {
      const needed=Math.max(1, Number(entry.rank||1));
      const ok=Number(ctx&&ctx.ranks&&ctx.ranks[entry.featId]||0)>=needed;
      items.push({
        ok, label:formatClassFeatRequirementLabel("featRank", {
          featId:entry.featId, rank:needed
        })
      });
    }
    const featRanksAny=Array.isArray(requirements.featRanksAnyOf)?requirements.featRanksAnyOf.filter(entry=>entry&&entry.featId):[];
    if(featRanksAny.length) {
      const ok=featRanksAny.some(entry=>Number(ctx&&ctx.ranks&&ctx.ranks[entry.featId]||0)>=Math.max(1, Number(entry.rank||1)));
      items.push({
        ok, label:featRanksAny.map(entry=>formatClassFeatRequirementLabel("featRank", {
          featId:entry.featId, rank:Math.max(1, Number(entry.rank||1))
        })).join(" or ")
      });
    }
    const questAll=Array.isArray(requirements.questUnlocksAllOf)?requirements.questUnlocksAllOf.filter(Boolean):[];
    for(const questId of questAll) {
      const normalizedQuestId=String(questId||"").trim().toLowerCase();
      items.push({
        ok:!!(ctx&&ctx.questUnlocks&&ctx.questUnlocks.has(normalizedQuestId)), label:formatClassFeatRequirementLabel("quest", {
          questId
        })
      });
    }
    const questAny=Array.isArray(requirements.questUnlocksAnyOf)?requirements.questUnlocksAnyOf.filter(Boolean):[];
    if(questAny.length) {
      const ok=questAny.some(questId=>!!(ctx&&ctx.questUnlocks&&ctx.questUnlocks.has(String(questId||"").trim().toLowerCase())));
      items.push({
        ok, label:questAny.map(questId=>formatClassFeatRequirementLabel("quest", {
          questId
        })).join(" or ")
      });
    }
    if(!items.length)items.push({
      ok:true, label:"No special requirements."
    });
    return {
      ok:items.every(item=>item.ok), items
    };
  }

  function unlockedClassFeatIds(ctx) {
    return classFeatIds().filter(featId=>evaluateClassFeatRequirements(featId, ctx).ok);
  }

  function invalidInvestedClassFeatIds(player, ranks, options={
  }) {
    const ctx=buildClassFeatContext(player, {
      levelsOverride:options.levelsOverride||null, ranksOverride:ranks, totalLevelOverride:options.totalLevelOverride==null?null:options.totalLevelOverride, questUnlocksOverride:options.questUnlocksOverride||null
    });
    return classFeatIds().filter(featId=>Number(ctx.ranks[featId]||0)>0&&!evaluateClassFeatRequirements(featId, ctx).ok);
  }

  function sanitizeClassFeatRankDraft(player, rawDraft, options={
  }) {
    ensurePlayerFeatContainers(player);
    const source=rawDraft==null?(player.classFeatRanks||{
    }):rawDraft;
    const merged=normalizeClassFeatRanks(source);
    const budget=classFeatPointBudget(player, options.totalLevelOverride==null?null:options.totalLevelOverride);
    const draft={
    };
    let remaining=budget;
    for(const featId of classFeatIds()) {
      if(remaining<=0)break;
      const requested=Math.max(0, Number(merged[featId]||0));
      if(requested<=0)continue;
      const max=classFeatMaxRank(featId);
      const allowed=clamp(requested, 0, Math.min(max, remaining));
      if(allowed>0) {
        draft[featId]=allowed;
        remaining-=allowed;
      }
    }
    const invalidIds=invalidInvestedClassFeatIds(player, draft, options);
    return {
      draft, spent:budget-remaining, remaining, budget, invalidIds
    };
  }

  function classFeatEffectLines(featId,rank){const r=Math.max(0,Number(rank||0));if(r<=0)return["No ranks invested yet."];if(featId==="sword_mastery")return[`Sword attacks: +${r} to hit.`];if(featId==="mace_mastery")return[`Mace attacks: +${r} to hit.`];if(featId==="axe_mastery")return[`Axe attacks: +${r} to hit.`];if(featId==="polearm_mastery")return[`Polearm attacks: +${r} to hit.`];if(featId==="dagger_mastery")return[`Dagger attacks: +${r} to hit.`];if(featId==="bow_mastery")return[`Bow attacks: +${r} to hit.`];if(featId==="dual_wield_mastery"){const lines=[`Off-hand weapon attacks: +${r} to hit (reduces the normal -4 penalty by ${r}).`];if(r>=classFeatMaxRank(featId))lines.push("While wielding an agile weapon in each hand: +1 AC.");return lines;}if(featId==="enrage")return[`SP cost: ${r}.`,`Duration: 10 rounds.`,`Melee weapon damage: +${r}.`,`Physical resistance: ${r >= classFeatMaxRank(featId) ? 3 : 2}.`,`Concentrate feats are disabled while enraged.`];if(featId==="sneak_attack")return[`Trigger: ${sneakAttackTriggerMax(r)} or lower on 1d6 after a successful agile or ranged attack.`,`Extra damage: ${sneakAttackDamageExpr(r)}.`];if(featId==="hunters_mark")return[`SP cost: 1.`,`Duration: 5 rounds.`,`Marked damage: +${huntersMarkDamageExpr(r)}.`,`Marked targets cannot gain Hidden or Cover.`];if(featId==="second_wind")return[`SP cost: ${r}.`,`Healing: ${r} x (1d6 + CON modifier).`];if(featId==="martial_arts")return[`Unarmed attacks are agile.`,`Unarmed and simple-weapon damage dice are at least 1d6.`,`Unarmed attacks: +${r} to hit.`,`Unarmored AC: 10 + DEX mod + WIS mod.`];return["No effect data available."];}

  function classFeatNextRankPreviewLines(featId,rank){const current=Math.max(0,Number(rank||0));const next=Math.min(classFeatMaxRank(featId),current+1);if(next<=current)return["Already at maximum rank."];if(featId==="sword_mastery")return[`Sword attacks: +${current} -> +${next} to hit.`];if(featId==="mace_mastery")return[`Mace attacks: +${current} -> +${next} to hit.`];if(featId==="axe_mastery")return[`Axe attacks: +${current} -> +${next} to hit.`];if(featId==="polearm_mastery")return[`Polearm attacks: +${current} -> +${next} to hit.`];if(featId==="dagger_mastery")return[`Dagger attacks: +${current} -> +${next} to hit.`];if(featId==="bow_mastery")return[`Bow attacks: +${current} -> +${next} to hit.`];if(featId==="dual_wield_mastery"){const lines=[`Off-hand weapon attacks: +${current} -> +${next} to hit.`];if(next>=classFeatMaxRank(featId))lines.push(`Agile weapon in each hand AC: +${current >= classFeatMaxRank(featId) ? 1 : 0} -> +1.`);else lines.push("At rank 4: while wielding an agile weapon in each hand, gain +1 AC.");return lines;}if(featId==="enrage")return[`SP cost: ${current || 0} -> ${next}.`,`Melee weapon damage: +${current} -> +${next}.`,`Physical resistance: ${current >= classFeatMaxRank(featId) ? 3 : (current > 0 ? 2 : 0)} -> ${next >= classFeatMaxRank(featId) ? 3 : 2}.`,`Duration remains 10 rounds.`];if(featId==="sneak_attack")return[`Trigger: ${current > 0 ? sneakAttackTriggerMax(current) : 0} -> ${sneakAttackTriggerMax(next)} or lower on 1d6.`,`Extra damage: ${current > 0 ? sneakAttackDamageExpr(current) : "0"} -> ${sneakAttackDamageExpr(next)}.`];if(featId==="hunters_mark")return[`Marked damage: +${current > 0 ? huntersMarkDamageExpr(current) : "0"} -> +${huntersMarkDamageExpr(next)}.`,`Duration remains 5 rounds.`,`Hidden/Cover lockout remains active.`];if(featId==="second_wind")return[`SP cost: ${current || 0} -> ${next}.`,`Healing multiplier: x${current || 0} -> x${next}.`];if(featId==="martial_arts")return[`Unarmed attacks: +${current} -> +${next} to hit.`,`Damage-die and AC benefits remain active once you have at least 1 rank.`];return["The next rank improves this feat."];}

  function ensureFeatUiState(st) {
    if(!st||!st.ui)return;
    if(!st.ui.featGroupsCollapsed||typeof st.ui.featGroupsCollapsed!=="object")st.ui.featGroupsCollapsed={
    };
  }

  function buildCreatorClassFeatSnapshot(rawClassId, rawRanks) {
    const classId=CLASSES[rawClassId]?rawClassId:(Object.keys(CLASSES)[0]||"Fighter");
    const levels={
    };
    Object.keys(CLASSES).forEach(cid=>levels[cid]=cid===classId?1:0);
    const previewPlayer={
      startingClassId:classId, classOrder:[classId], levels, classFeatRanks:normalizeClassFeatRanks(rawRanks||{
      }), questUnlocks:[], abilityIds:[]
    };
    const result=sanitizeClassFeatRankDraft(previewPlayer, previewPlayer.classFeatRanks, {
      levelsOverride:levels, totalLevelOverride:1, questUnlocksOverride:[]
    });
    previewPlayer.classFeatRanks=result.draft;
    ensurePlayerFeatContainers(previewPlayer);
    return {
      classId, player:previewPlayer, levels, totalLevel:1, ranks:result.draft, budget:result.budget, spent:result.spent, available:result.remaining, invalidIds:result.invalidIds
    };
  }

  function classFeatTooltipHtml(featId,options={}){const feat=getClassFeat(featId);if(!feat)return"";const player=options.playerOverride||(state&&state.player?state.player:null);const currentRank=options.rank==null?classFeatRankValue(player,featId):Math.max(0,Number(options.rank||0));const baseRanks=normalizeClassFeatRanks(options.ranksOverride==null?(player&&player.classFeatRanks?player.classFeatRanks:{}):options.ranksOverride);const tooltipRanks={...baseRanks};if(currentRank>0)tooltipRanks[featId]=currentRank;else if(options.rank!=null)delete tooltipRanks[featId];const rows=[];const row=(k,v)=>`<div class="trow"><div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(v)}</div></div>`;rows.push(row("Source",`${(feat.classes || [feat.classId || "Class"]).join(" / ")} class feat`));rows.push(row("Rank",`${currentRank}/${classFeatMaxRank(feat)}`));rows.push(row("Type",`${feat.kind || "passive"} feat`));rows.push(row("Scope",Array.isArray(feat.contexts)&&feat.contexts.length?feat.contexts.join(", "):"-"));if(Array.isArray(feat.tags)&&feat.tags.length)rows.push(row("Tags",feat.tags.join(", ")));if(feat.kind==="active"){if(feat.id==="hunters_mark")rows.push(row("Cost",currentRank>0?"1 SP":"1 SP once invested"));else if(currentRank>0)rows.push(row("Cost",`${abilitySpCost(player || { classFeatRanks: tooltipRanks }, feat.id)} SP`));}return`
        <div style="font-weight:700; font-size:13px; margin-bottom:6px">${escapeHtml(`${feat.emoji || "*"} ${feat.name}`)}</div>
        <div class="small muted" style="margin-bottom:8px; line-height:1.45">${escapeHtml(feat.summary || "")}</div>
        ${rows.join("")}
        <div class="small muted" style="margin-top:8px; line-height:1.45">${classFeatEffectLines(featId, currentRank).map(line => `- ${escapeHtml(line)}`).join("<br/>")}</div>
      `;}

  function renderClassFeatGroups(player,options={}){ensurePlayerFeatContainers(player);const context=options.context||"character";const ranks=normalizeClassFeatRanks(options.ranksOverride==null?(player&&player.classFeatRanks)||{}:options.ranksOverride);const levels=Object.fromEntries(Object.keys(CLASSES).map(classId=>[classId,Math.max(0,Number(options.levelsOverride&&options.levelsOverride[classId]!=null?options.levelsOverride[classId]:player&&player.levels&&player.levels[classId]||0))]));const total=options.totalLevelOverride==null?Object.values(levels).reduce((sum,value)=>sum+value,0):Math.max(0,Number(options.totalLevelOverride||0));const visibleClassIds=Array.isArray(options.visibleClassIds)&&options.visibleClassIds.length?options.visibleClassIds.filter(classId=>!!CLASSES[classId]):null;const orderedClassIds=visibleClassIds?normalizePlayerClassOrder(player,levels,visibleClassIds):(Array.isArray(options.classOrderOverride)&&options.classOrderOverride.length?normalizePlayerClassOrder(player,levels,options.classOrderOverride):ownedClassIdsInOrder(player,levels));const ctx=buildClassFeatContext(player,{levelsOverride:levels,ranksOverride:ranks,totalLevelOverride:total});const unlocked=new Set(unlockedClassFeatIds(ctx));const groups=new Map(orderedClassIds.map(classId=>[classId,[]]));for(const featId of classFeatIds()){const feat=getClassFeat(featId);const groupId=orderedClassIds.find(classId=>classFeatBelongsToClass(feat,classId));if(!groupId||!groups.has(groupId))continue;groups.get(groupId).push(featId);}const sections=orderedClassIds.map(classId=>{const featIdsInGroup=groups.get(classId)||[];if(!featIdsInGroup.length)return"";return`
          <div class="classFeatGroup">
            <div class="classFeatGroupHeader">
              <h4>${escapeHtml(classId)}</h4>
            </div>
            <div class="classFeatGroupBody">
              <div class="classFeatGrid">
                ${featIdsInGroup.map(featId => {
                  const feat = getClassFeat(featId);
                  const rank = Math.max(0, Number(ranks[featId] || 0));
                  const maxRank = classFeatMaxRank(feat);
                  const isUnlocked = unlocked.has(featId);
                  const btnClass = ["classFeatBtn", rank > 0 ? "invested" : "", isUnlocked ? "unlocked" : "locked"].filter(Boolean).join(" ");
                  return `
                    <button
                      class="${btnClass}"
                      type="button"
                      data-feat-open="${escapeHtml(featId)}"
                      data-feat-context="${escapeHtml(context)}"
                      data-class-feat="${escapeHtml(featId)}"
                      data-feat-rank="${rank}">
                      <span class="classFeatIcon">${escapeHtml(feat.emoji || "*")}</span>
                      <span class="classFeatText">
                        <span class="classFeatName">${escapeHtml(feat.name)}</span>
                        <span class="classFeatRank">(${rank}/${maxRank})</span>
                      </span>
                    </button>
                  `;
              }).join("")}
              </div>
            </div>
          </div>
        `;}).filter(Boolean);return sections.length?`<div class="classFeatGroupList">${sections.join("")}</div>`:`<div class="classFeatEmpty">No class feats are available for your current class mix.</div>`;}

  function canIncreaseClassFeatRank(player, featId, ranks, options={
  }) {
    const current=Math.max(0, Number(ranks&&ranks[featId]||0));
    const max=classFeatMaxRank(featId);
    if(current>=max)return {
      ok:false, reason:"Already at maximum rank."
    };
    const candidate={
      ...(ranks||{
      }), [featId]:current+1
    };
    const budget=classFeatPointBudget(player, options.totalLevelOverride==null?null:options.totalLevelOverride);
    if(classFeatPointsSpentFromRanks(candidate)>budget)return {
      ok:false, reason:"No class feat points available."
    };
    const ctx=buildClassFeatContext(player, {
      levelsOverride:options.levelsOverride||null, ranksOverride:candidate, totalLevelOverride:options.totalLevelOverride==null?null:options.totalLevelOverride, questUnlocksOverride:options.questUnlocksOverride||null
    });
    const req=evaluateClassFeatRequirements(featId, ctx);
    if(!req.ok)return {
      ok:false, reason:req.items.filter(item=>!item.ok).map(item=>item.label).join(" | ")||"Requirements not met."
    };
    return {
      ok:true, reason:""
    };
  }

  function canDecreaseClassFeatRank(player,featId,ranks,options={}){const current=Math.max(0,Number(ranks&&ranks[featId]||0));if(current<=0)return{ok:false,reason:"No rank to remove."};const candidate={...(ranks||{})};if(current<=1)delete candidate[featId];else candidate[featId]=current-1;const invalidIds=invalidInvestedClassFeatIds(player,candidate,options);if(invalidIds.length){const names=invalidIds.map(id=>getClassFeat(id)?getClassFeat(id).name:id).join(", ");return{ok:false,reason:`Would invalidate: ${names}.`};}return{ok:true,reason:""};}

  function classFeatChangeSummary(beforeRanks,afterRanks){const parts=[];for(const featId of classFeatIds()){const before=Math.max(0,Number(beforeRanks&&beforeRanks[featId]||0));const after=Math.max(0,Number(afterRanks&&afterRanks[featId]||0));if(before===after)continue;const feat=getClassFeat(featId);parts.push(`${feat ? feat.name : featId} ${before}->${after}`);}return parts;}

  function notifyNewlyUnlockedClassFeats(state,beforeCtx,afterCtx,sourceText="New class feats are now available."){const beforeUnlocked=new Set(unlockedClassFeatIds(beforeCtx));const newIds=unlockedClassFeatIds(afterCtx).filter(featId=>!beforeUnlocked.has(featId));if(!newIds.length)return;const names=newIds.map(featId=>getClassFeat(featId)).filter(Boolean).map(feat=>`${feat.emoji || "*"} ${feat.name}`);setCombatNotice(state,{kind:"gold",title:newIds.length===1?"Class Feat Unlocked":"Class Feats Unlocked",summary:sourceText,sectionTitle:"Available feats",items:names});}

  function resetSharedModal() {
    ensureOverlays();
    if(!$modal)return;
    $modal.className="modal hidden";
    $modal.innerHTML=DEFAULT_SHARED_MODAL_HTML;
  }

  function openClassFeatDialog(state,options={}){const featId=options.featId||"";const context=options.context||"character";const creatorSnapshot=context==="creator"?buildCreatorClassFeatSnapshot(state&&state._draft&&state._draft.classId||"Fighter",state&&state._draftClassFeat||{}):null;const player=creatorSnapshot?creatorSnapshot.player:(state&&state.player?state.player:null);const feat=getClassFeat(featId);if(!player||!feat)return;ensureOverlays();resetSharedModal();if(!$modal)return;const preview=context==="levelup"?buildLevelUpPreview(player,state.ui&&state.ui.levelUpDraft||{}):null;const levels=preview?{...preview.levels}:(creatorSnapshot?{...creatorSnapshot.levels}:{...player.levels});const total=preview?preview.nextTotalLevel:(creatorSnapshot?creatorSnapshot.totalLevel:totalLevel(player));let workingRanks=normalizeClassFeatRanks(preview?preview.classFeatDraft:(creatorSnapshot?creatorSnapshot.ranks:player.classFeatRanks||{}));const baseRanks={...workingRanks};const closeFns=[];const close=()=>{while(closeFns.length){const fn=closeFns.pop();try{fn();}catch(_){}}resetSharedModal();};const onKey=(event)=>{if(event.key==="Escape"){event.preventDefault();close();}};document.addEventListener("keydown",onKey);closeFns.push(()=>document.removeEventListener("keydown",onKey));const commit=()=>{if(context==="creator"){state._draftClassFeat=normalizeClassFeatRanks(workingRanks);close();render();return;}if(context==="levelup"){const next=buildLevelUpPreview(player,{...(state.ui&&state.ui.levelUpDraft||{}),classFeatDraft:workingRanks});state.ui.levelUpDraft=levelUpDraftFromPreview(next);close();render();return;}const beforeRanks=normalizeClassFeatRanks(player.classFeatRanks||{});const beforeCtx=buildClassFeatContext(player,{levelsOverride:player.levels,ranksOverride:beforeRanks,totalLevelOverride:totalLevel(player)});player.classFeatRanks=normalizeClassFeatRanks(workingRanks);syncPlayerAbilityIdsForLevels(player);const afterCtx=buildClassFeatContext(player,{levelsOverride:player.levels,ranksOverride:player.classFeatRanks,totalLevelOverride:totalLevel(player)});const changes=classFeatChangeSummary(beforeRanks,player.classFeatRanks);if(changes.length)log(state,`Class feat ranks updated: ${changes.join(", ")}.`);notifyNewlyUnlockedClassFeats(state,beforeCtx,afterCtx,"New class feats are now available after your feat investment.");close();save(state);render();};const renderModal=()=>{const currentRank=Math.max(0,Number(workingRanks[featId]||0));const maxRank=classFeatMaxRank(feat);const budget=classFeatPointBudget(player,total);const spent=classFeatPointsSpentFromRanks(workingRanks);const available=Math.max(0,budget-spent);const ctx=buildClassFeatContext(player,{levelsOverride:levels,ranksOverride:workingRanks,totalLevelOverride:total});const req=evaluateClassFeatRequirements(featId,ctx);const improve=canIncreaseClassFeatRank(player,featId,workingRanks,{levelsOverride:levels,totalLevelOverride:total});const undo=canDecreaseClassFeatRank(player,featId,workingRanks,{levelsOverride:levels,totalLevelOverride:total});const currentLines=classFeatEffectLines(featId,currentRank);const nextLines=classFeatNextRankPreviewLines(featId,currentRank);const reqFailures=req.items.filter(item=>!item.ok);const changed=currentRank!==Math.max(0,Number(baseRanks[featId]||0));const kindLabel=feat.kind==="active"?"Active":"Passive";const primaryActionLabel=changed?(context==="character"?"Apply":"Done"):"Done";const secondaryActionLabel=changed?"Cancel":"Close";const noteText=reqFailures.length?("Locked: "+reqFailures.map(item=>item.label).join(" • ")):(!improve.ok?improve.reason:((!undo.ok&&currentRank>0)?undo.reason:""));const noteClass=reqFailures.length?"bad":(noteText?"warn":"");$modal.className=context==="levelup"?"modal modalAboveLevelUp":"modal";$modal.innerHTML=`
          <div class="modalBackdrop" data-modal-backdrop></div>
          <div class="modalCard classFeatDialogCard" role="dialog" aria-modal="true" aria-labelledby="modal_title">
            <div class="modalHeader classFeatDialogHeader">
              <div>
                <div class="modalTitle" id="modal_title">${escapeHtml(`${feat.emoji || "*"} ${feat.name}`)}</div>
                <div class="simpleFeatRankLine small muted">Rank ${currentRank}/${maxRank} • ${escapeHtml(kindLabel)} • ${available} point${available === 1 ? "" : "s"} available</div>
              </div>
            </div>
            <div class="modalBody classFeatDialogBody">
              <div class="simpleFeatSummary">${escapeHtml(feat.summary || "")}</div>

              <div class="featMenuSection">
                <div class="featMenuSectionTitle">Current effect</div>
                <div class="featDetailList">${currentLines.map(line => `<div class="featDetailItem">${escapeHtml(line)}</div>`).join("")}</div>
              </div>

              <div class="featMenuSection">
                <div class="featMenuSectionTitle">${currentRank >= maxRank ? "Max rank" : "Next rank"}</div>
                <div class="featPreviewList">${nextLines.map(line => `<div class="featPreviewItem ${improve.ok ? "good" : "warn"}">${escapeHtml(line)}</div>`).join("")}</div>
              </div>

              <div class="featMenuSection">
                <div class="featMenuSectionTitle">Requirements</div>
                <div class="featReqList">${req.items.map(item => `<div class="featReqItem ${item.ok ? "good" : "bad"}">${escapeHtml((item.ok ? "OK - " : "Locked - ") + item.label)}</div>`).join("")}</div>
              </div>

              ${Array.isArray(feat.details) && feat.details.length ? `<div class="small muted simpleFeatNotes">${feat.details.map(line => escapeHtml(line)).join("<br/>")}</div>` : ``}
              ${noteText ? `<div class="classFeatInlineNote ${noteClass}">${escapeHtml(noteText)}</div>` : ``}

              <div class="featDialogFooter">
                <div class="featDialogControls featDialogStepper">
                  <button class="btn" type="button" id="feat_undo" ${undo.ok ? "" : "disabled"}>-1</button>
                  <button class="btn primary" type="button" id="feat_improve" ${improve.ok ? "" : "disabled"}>+1</button>
                </div>
                <div class="featDialogControls">
                  <button class="btn" type="button" id="feat_cancel">${secondaryActionLabel}</button>
                  <button class="btn primary" type="button" id="feat_confirm">${primaryActionLabel}</button>
                </div>
              </div>
            </div>
          </div>
        `;const backdrop=$modal.querySelector("[data-modal-backdrop]");const cancelBtn=$modal.querySelector("#feat_cancel");const confirmBtn=$modal.querySelector("#feat_confirm");const improveBtn=$modal.querySelector("#feat_improve");const undoBtn=$modal.querySelector("#feat_undo");if(backdrop)backdrop.addEventListener("click",()=>close(),{once:true});if(cancelBtn)cancelBtn.addEventListener("click",()=>close(),{once:true});if(confirmBtn)confirmBtn.addEventListener("click",()=>commit(),{once:true});if(improveBtn)improveBtn.addEventListener("click",()=>{const next={...workingRanks,[featId]:currentRank+1};workingRanks=normalizeClassFeatRanks(next);renderModal();},{once:true});if(undoBtn)undoBtn.addEventListener("click",()=>{const next={...workingRanks};if(currentRank<=1)delete next[featId];else next[featId]=currentRank-1;workingRanks=normalizeClassFeatRanks(next);renderModal();},{once:true});};renderModal();}

  function bindClassFeatUiHandlers(scope, context) {
    if(!scope)return;
    scope.querySelectorAll("[data-feat-open]").forEach(btn=> {
      btn.addEventListener("click", ()=> {
        const featId=btn.getAttribute("data-feat-open")||"";
        openClassFeatDialog(state, {
          featId, context:context||btn.getAttribute("data-feat-context")||"character"
        });
      });
    });
  }

  function isKnownAbilityId(abilityId) {
    const featData=(typeof PF_DATA!=="undefined"&&PF_DATA&&PF_DATA.CLASS_FEATS)?PF_DATA.CLASS_FEATS:{
    };
    return!!(featData[abilityId]||ABILITIES[abilityId]);
  }

  function defaultStartingAbilityIdForClass(classId) {
    const cls=CLASSES[classId];
    const abilityId=cls&&cls.startingAbility;
    return abilityId&&isKnownAbilityId(abilityId)?abilityId:null;
  }

  function classOptionalAbilityIds(classId) {
    const cls=CLASSES[classId];
    return cls&&Array.isArray(cls.optionalAbilities)?cls.optionalAbilities.filter(id=>isKnownAbilityId(id)):[];
  }

  function normalizeOptionalAbilityChoiceForClass(classId, abilityId) {
    const optionIds=classOptionalAbilityIds(classId);
    if(!optionIds.length)return null;
    return optionIds.includes(abilityId)?abilityId:optionIds[0];
  }

  function startingAbilityPackageForClass(classId, optionalAbilityId) {
    const ids=[];
    const defaultId=defaultStartingAbilityIdForClass(classId);
    const optionalId=normalizeOptionalAbilityChoiceForClass(classId, optionalAbilityId);
    if(defaultId)ids.push(defaultId);
    if(optionalId)ids.push(optionalId);
    return[...new Set(ids.filter(id=>isKnownAbilityId(id)))];
  }

  function syncPlayerAbilityIdsForLevels(player) {
    if(!player)return[];
    ensurePlayerFeatContainers(player);
    ensurePlayerClassOrder(player);
    const rawAbilityIds=Array.isArray(player.abilityIds)?player.abilityIds.filter(Boolean):[];
    const migratedRanks={
      ...(player.classFeatRanks||{
      })
    };
    for(const abilityId of rawAbilityIds) {
      if(isClassFeatId(abilityId)) {
        migratedRanks[abilityId]=Math.max(1, Number(migratedRanks[abilityId]||0));
      }
    }
    player.classFeatRanks=normalizeClassFeatRanks(migratedRanks);
    player.questUnlocks=normalizeQuestUnlocks(player.questUnlocks);
    player.abilityIds=[...new Set(rawAbilityIds.filter(id=>!!ABILITIES[id]&&!isClassFeatId(id)&&!isSkillAbilityId(id)))];
    return playerAbilityIds(player);
  }

  function createNewPlayer(options) {
    const name=options&&options.name||"";
    const raceId=options&&options.raceId||"human";
    const classId=options&&options.classId||"Fighter";
    const stats=options&&options.stats||{
      STR:10, DEX:10, CON:10, INT:10, WIS:10, CHA:10
    };
    const skillDraft=options&&options.skillDraft||null;
    const classFeatDraft=options&&options.classFeatDraft||null;
    const cls=CLASSES[classId];
    const conMod=statMod(stats.CON);
    const baseHp=Math.max(1, cls.hpPerLevel+conMod);
    const baseSp=Math.max(1, cls.spPerLevel+Math.max(0, statMod(stats.WIS)));
    const levels={
    };
    Object.keys(CLASSES).forEach(k=>levels[k]=0);
    levels[classId]=1;
    const player={
      name:String(name||"").trim(), raceId, startingClassId:classId, classOrder:[classId], levels, abilityIds:[], classFeatRanks:{
      }, questUnlocks:[], titles:[], activeTitle:"", xp:0, hp:{
        current:baseHp, max:baseHp
      }, sp:{
        current:baseSp, max:baseSp
      }, stats:{
        ...stats
      }, skillPoints:startingSkillPointPoolForClass(classId, stats), startingSkillId:cls.startingTrainedSkill||null, skillProficiency:Object.fromEntries(SKILLS.map(skill=>[skill.id, 0])), damageResistance:createDamageResistanceMap(), statusEffects:[], moneyCp:2000, inventory:[], equipment:{
        mainHand:null, offHand:null, armor:null, accessory_1:null, accessory_2:null, accessory_3:null, accessory_4:null
      }, discovered:{
      }
    };
    addItem(player, "dagger", 1);
    addItem(player, "potion_healing", 1);
    addItem(player, "leather", 1);
    const equipInitial=(slotId, itemId)=> {
      if(!itemId)return;
      const item=getItem(itemId);
      if(!canEquipToSlot(player, slotId, item))return;
      if(hasItem(player, itemId, 1))removeItem(player, itemId, 1);
      player.equipment[slotId]=itemId;
    };
    if(canUseArmorCategory(player, "light"))equipInitial("armor", "leather");
    equipInitial("mainHand", "dagger");
    if(cls.startingTrainedSkill) {
      player.skillProficiency[cls.startingTrainedSkill]=2;
    }
    applySkillDraftToPlayer(player, skillDraft);
    player.classFeatRanks=sanitizeClassFeatRankDraft(player, classFeatDraft, {
      levelsOverride:levels, totalLevelOverride:1, questUnlocksOverride:[]
    }).draft;
    syncPlayerAbilityIdsForLevels(player);
    return player;
  }

  function getAbility(abilityId) {
    const featData=(PF_DATA&&PF_DATA.CLASS_FEATS)||{
    };
    const ability=featData[abilityId]||ABILITIES[abilityId];
    if(!ability)throw new Error("Unknown ability: "+abilityId);
    return ability;
  }

  function isSkillAbilityId(abilityId) {
    return!!(ABILITIES[abilityId]&&abilitySourceType(ABILITIES[abilityId])==="skill");
  }

  function playerAbilityIds(player) {
    if(!player)return[];
    ensurePlayerFeatContainers(player);
    const featIds=classFeatIds().filter(featId=>Number(player.classFeatRanks[featId]||0)>0);
    const extraIds=Array.isArray(player.abilityIds)?[...new Set(player.abilityIds.filter(id=>!!ABILITIES[id]&&!isClassFeatId(id)&&!isSkillAbilityId(id)))]:[];
    return[...featIds, ...extraIds];
  }

  function hasAbilityUnlocked(player, abilityId) {
    if(isClassFeatId(abilityId))return classFeatRankValue(player, abilityId)>0;
    return playerAbilityIds(player).includes(abilityId);
  }

  function abilityDisabledReason(player, abilityId) {
    if(!hasAbilityUnlocked(player, abilityId))return"You do not have that feat.";
    const ability=getAbility(abilityId);
    const abilityTags=new Set((ability.tags||[]).map(normalizeTagId));
    if(!abilityTags.size)return"";
    for(const effect of player&&player.statusEffects||[]) {
      const disabledTags=Array.isArray(effect&&effect.disabledAbilityTags)?effect.disabledAbilityTags.map(normalizeTagId):[];
      const matched=disabledTags.find(tag=>abilityTags.has(tag));
      if(matched)return effect.name+" prevents using "+formatDamageTypeLabel(matched)+" feats.";
    }
    return"";
  }

  function abilitySourceLabel(ability) {
    if(!ability)return"-";
    if(isClassFeatId(ability.id))return((ability.classes||[ability.classId||"Class"]).join(" / "))+" class feat";
    if(abilitySourceType(ability)==="skill")return(ability.skillId||"Skill")+" skill feat";
    return ability.classId?(ability.classId+" class feat"):"-";
  }

  function abilityBadgeHtml(abilityId,extraClass){const ability=getAbility(abilityId);const label=isClassFeatId(abilityId)?((ability.emoji||"*")+" "+ability.name):ability.name;return`<span class="badge abilityBadge ${escapeHtml(extraClass || "")}" data-ability="${escapeHtml(ability.id)}">${escapeHtml(label)}</span>`;}

  function renderAbilityBadgeList(abilityIds,emptyText){const ids=(abilityIds||[]).filter(Boolean);if(!ids.length)return`<span class="small muted">${escapeHtml(emptyText || "No feats")}</span>`;return`<div class="badgeWrap">${ids.map(id => abilityBadgeHtml(id)).join("")}</div>`;}

  function renderPlayerAbilityBadgeList(player, options) {
    const kind=options&&options.kind||null;
    const sourceType=options&&options.sourceType||null;
    const emptyText=options&&options.emptyText||"No feats";
    const ids=playerAbilityIds(player).filter(id=> {
      const ability=getAbility(id);
      if(kind&&ability.kind!==kind)return false;
      if(sourceType&&abilitySourceType(ability)!==sourceType)return false;
      return true;
    });
    return renderAbilityBadgeList(ids, emptyText);
  }

  function abilitySummaryText(ability){return featTerminologyText(String(ability&&ability.summary||"")).replace(/\s*Cost\s+\d+\s+SP\..*/i,function(match){const tail=match.replace(/^\s*Cost\s+\d+\s+SP\.\s*/i,"");return tail?(" "+tail):"";}).replace(/\bLasts\s+\d+\s+rounds?\.\s*/gi,"").replace(/\s{2,}/g," ").trim();}

  function abilityTooltipSummaryText(ability){return featTerminologyText(String(ability&&ability.summary||"")).replace(/\s{2,}/g," ").trim();}

  function abilitySpCost(player, abilityId) {
    if(isClassFeatId(abilityId)) {
      const rank=Math.max(0, Number(player&&player.classFeatRanks&&player.classFeatRanks[abilityId]||0));
      if(abilityId==="enrage")return rank;
      if(abilityId==="second_wind")return rank;
      if(abilityId==="hunters_mark")return rank>0?1:0;
      const feat=getClassFeat(abilityId);
      return Number(feat&&feat.costSp||0);
    }
    const ability=ABILITIES[abilityId];
    return Number(ability&&ability.costSp||0);
  }

  function abilityTooltipHtml(abilityId){if(isClassFeatId(abilityId))return classFeatTooltipHtml(abilityId);const ability=getAbility(abilityId);const rows=[];const row=(k,v)=>`<div class="trow"><div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(v)}</div></div>`;const costLabel=Number(ability&&ability.costSp||0)>0?(String(Number(ability.costSp))+" SP"):"";const durationLabel=abilityTooltipDurationLabel(ability);rows.push(row("Source",abilitySourceLabel(ability)));if(ability.unlockLevel!=null)rows.push(row("Unlock","Level "+ability.unlockLevel));rows.push(row("Type",(ability.kind||"-")+" feat"));if(costLabel)rows.push(row("Cost",costLabel));if(durationLabel)rows.push(row("Duration",durationLabel));rows.push(row("Scope",(ability.contexts||[]).join(", ")||"-"));if(Array.isArray(ability.tags)&&ability.tags.length)rows.push(row("Tags",ability.tags.join(", ")));return`
        <div style="font-weight:700; font-size:13px; margin-bottom:6px">${escapeHtml(ability.name)}</div>
        <div class="small muted" style="margin-bottom:8px; line-height:1.45">${escapeHtml(abilityTooltipSummaryText(ability))}</div>
        ${rows.join("")}
        ${Array.isArray(ability.details) && ability.details.length ? `<div class="small muted" style="margin-top:8px; line-height:1.45">${ability.details.map(line => `- ${escapeHtml(line)}`).join("<br/>")}</div>` : ``}
      `;}

  function wireAbilityTooltips(scope) {
    wireResolvedTooltips(scope, "[data-ability]", el=>abilityTooltipHtml(el.getAttribute("data-ability")||""));
    wireResolvedTooltips(scope, "[data-class-feat]", el=> {
      const featId=el.getAttribute("data-class-feat")||"";
      const rank=Number(el.getAttribute("data-feat-rank")||0);
      const context=el.getAttribute("data-feat-context")||"";
      if(context==="creator") {
        const snapshot=buildCreatorClassFeatSnapshot(state&&state._draft&&state._draft.classId||"Fighter", state&&state._draftClassFeat||{
        });
        return classFeatTooltipHtml(featId, {
          rank, playerOverride:snapshot.player, ranksOverride:snapshot.ranks, levelsOverride:snapshot.levels, totalLevelOverride:snapshot.totalLevel
        });
      }
      if(context==="levelup") {
        const preview=buildLevelUpPreview(state.player, state.ui&&state.ui.levelUpDraft||{
        });
        return classFeatTooltipHtml(featId, {
          rank, playerOverride:state.player, ranksOverride:preview.classFeatDraft, levelsOverride:preview.levels, totalLevelOverride:preview.nextTotalLevel
        });
      }
      return classFeatTooltipHtml(featId, {
        rank
      });
    });
  }

  function normalizeStatusEffect(effect) {
    const migratedEffect=migrateLegacyStatusEffect(effect);
    const modifiers=migratedEffect.modifiers||{
    };
    return {
      id:migratedEffect.id||migratedEffect.templateId, templateId:migratedEffect.templateId||migratedEffect.id, name:migratedEffect.name||migratedEffect.id||"Effect", description:migratedEffect.description||"", duration:migratedEffect.duration==null?null:Math.max(0, Number(migratedEffect.duration||0)), maxDuration:migratedEffect.maxDuration==null?(migratedEffect.duration==null?null:Math.max(0, Number(migratedEffect.duration||0))):Math.max(0, Number(migratedEffect.maxDuration||0)), durationMode:migratedEffect.durationMode==="move"?"move":"turn", durationUnit:migratedEffect.durationUnit||(migratedEffect.durationMode==="move"?"movements":"turns"), tags:Array.isArray(migratedEffect.tags)?[...migratedEffect.tags]:[], disabledAbilityTags:Array.isArray(migratedEffect.disabledAbilityTags)?migratedEffect.disabledAbilityTags.map(normalizeTagId):[], blockedIncomingStatusTags:Array.isArray(migratedEffect.blockedIncomingStatusTags)?migratedEffect.blockedIncomingStatusTags.map(normalizeTagId):[], ongoingDamage:Math.max(0, Number(migratedEffect.ongoingDamage||0)), ongoingDamageType:String(migratedEffect.ongoingDamageType||"").trim().toLowerCase(), consumeOnAttack:!!migratedEffect.consumeOnAttack, expiresOnDown:migratedEffect.expiresOnDown!==false, justApplied:!!migratedEffect.justApplied, modifiers:{
        acModifier:Number.isFinite(Number(modifiers.acModifier||0))?Number(modifiers.acModifier||0):0, attackRollModifier:Number.isFinite(Number(modifiers.attackRollModifier||0))?Number(modifiers.attackRollModifier||0):0, damageBonusMelee:Number.isFinite(Number(modifiers.damageBonusMelee||0))?Number(modifiers.damageBonusMelee||0):0, resistances:createDamageResistanceMap(modifiers.resistances||{
        })
      }
    };
  }

  function addOrRefreshStatusEffect(entity, effect) {
    entity.statusEffects=Array.isArray(entity.statusEffects)?entity.statusEffects:[];
    const normalized=normalizeStatusEffect(effect);
    if(effect&&effect.justApplied===undefined&&normalized.justApplied!==true&&normalized.ongoingDamage<=0) {
      normalized.justApplied=true;
    }
    const incomingTags=new Set([...(Array.isArray(normalized.tags)?normalized.tags.map(normalizeTagId):[]), normalizeTagId(normalized.templateId||normalized.id)].filter(Boolean));
    const blocked=entity.statusEffects.some(existing=> {
      const blockers=Array.isArray(existing&&existing.blockedIncomingStatusTags)?existing.blockedIncomingStatusTags.map(normalizeTagId):[];
      return blockers.some(tag=>incomingTags.has(tag));
    });
    if(blocked)return null;
    const key=normalized.templateId||normalized.id;
    const idx=entity.statusEffects.findIndex(existing=>(existing.templateId||existing.id)===key);
    if(idx>=0)entity.statusEffects[idx]=normalized;
    else entity.statusEffects.push(normalized);
    return normalized;
  }

  function calcAC(player) {
    const dexVal=statMod(player.stats.DEX);
    const wisVal=statMod(player.stats.WIS);
    const armorId=player.equipment.armor;
    const armor=armorId?getItem(armorId):null;
    const shieldId=player.equipment.offHand;
    const shield=shieldId?getItem(shieldId):null;
    const monkUnarmoredDefense=classFeatRankValue(player, "martial_arts")>0&&(!armor||armor.category==="unarmored");
    let ac=10;
    if(monkUnarmoredDefense) {
      ac+=dexVal+wisVal;
    } else if(armor&&armor.type==="armor") {
      ac+=armor.acBonus||0;
      const cap=dexCapFromArmor(armor);
      ac+=clamp(dexVal, -999, cap);
    } else {
      ac+=dexVal;
    }
    if(shield&&shield.category==="shield")ac+=shield.acBonus||0;
    ac+=dualWieldMasteryAcBonus(player);
    ac+=statusModifierTotal(player, "acModifier");
    return Math.max(0, ac);
  }

  function isOffHandWeaponAttack(attack) {
    return!!(attack&&String(attack.slot||"").trim().toLowerCase()==="off hand"&&attack.weapon&&attack.weapon.type==="weapon"&&attack.weapon.category!=="unarmed");
  }

  function offHandAttackPenalty(attack) {
    return isOffHandWeaponAttack(attack)?-4:0;
  }

  function hasDualAgileWeaponSet(player) {
    if(!player||!player.equipment)return false;
    const mainHandId=player.equipment.mainHand;
    const offHandId=player.equipment.offHand;
    const main=mainHandId&&ITEM_INDEX.has(mainHandId)?getItem(mainHandId):null;
    const off=offHandId&&ITEM_INDEX.has(offHandId)?getItem(offHandId):null;
    return!!(main&&off&&main.type==="weapon"&&off.type==="weapon"&&hasWeaponProperty(main, "agile")&&hasWeaponProperty(off, "agile"));
  }

  function dualWieldMasteryAcBonus(player) {
    return classFeatRankValue(player, "dual_wield_mastery")>=classFeatMaxRank("dual_wield_mastery")&&hasDualAgileWeaponSet(player)?1:0;
  }

  function weaponTypesForItem(weapon) {
    return Array.isArray(weapon&&weapon.weaponTypes)?weapon.weaponTypes.map(value=>String(value||"").trim().toLowerCase()).filter(Boolean):[];
  }

  function weaponHasType(weapon, typeId) {
    const wanted=String(typeId||"").trim().toLowerCase();
    if(!wanted||!weapon)return false;
    return weaponTypesForItem(weapon).includes(wanted);
  }

  function classFeatAttackBonusSourcesForProfile(player, attack) {
    if(!player||!attack)return[];
    const sources=[];
    const addSource=(featId, value, note="")=> {
      const amount=Number(value||0);
      if(!amount)return;
      const feat=getClassFeat(featId);
      sources.push({
        value:amount, sourceKey:featId, label:feat&&feat.name?feat.name:rollSourceLabel(featId, featId), note
      });
    };
    const weapon=attack.weapon;
    if(weapon) {
      if(weaponHasType(weapon, "sword"))addSource("sword_mastery", classFeatRankValue(player, "sword_mastery"), "Sword attacks gain this bonus.");
      if(weaponHasType(weapon, "mace"))addSource("mace_mastery", classFeatRankValue(player, "mace_mastery"), "Mace attacks gain this bonus.");
      if(weaponHasType(weapon, "axe"))addSource("axe_mastery", classFeatRankValue(player, "axe_mastery"), "Axe attacks gain this bonus.");
      if(weaponHasType(weapon, "dagger"))addSource("dagger_mastery", classFeatRankValue(player, "dagger_mastery"), "Dagger attacks gain this bonus.");
      if(weaponHasType(weapon, "bow"))addSource("bow_mastery", classFeatRankValue(player, "bow_mastery"), "Bow attacks gain this bonus.");
      if(hasWeaponProperty(weapon, "polearm")||weaponHasType(weapon, "polearm"))addSource("polearm_mastery", classFeatRankValue(player, "polearm_mastery"), "Polearm attacks gain this bonus.");
    }
    if(Array.isArray(attack.tags)&&attack.tags.includes("unarmed"))addSource("martial_arts", classFeatRankValue(player, "martial_arts"), "Unarmed attacks gain this bonus.");
    if(isOffHandWeaponAttack(attack))addSource("dual_wield_mastery", classFeatRankValue(player, "dual_wield_mastery"), "Reduces the normal -4 off-hand weapon penalty.");
    return sources;
  }

  function attackBonusPartsForProfile(player,profile){const parts=[];const abilityStat=String(profile&&profile.attackAbilityStat||"").trim().toUpperCase();const abilityPart=createRollModifierPart(Number(profile&&profile.attackAbilityMod||0),abilitySourceKeyForStat(abilityStat),abilityStat||"Ability",abilityStat?`${fullStatName(abilityStat)} modifier`:"Attack ability modifier");if(abilityPart)parts.push(abilityPart);for(const source of statusModifierSources(player,"attackRollModifier")){const part=createRollModifierPart(source.value,source.sourceKey,source.label,source.note);if(part)parts.push(part);}const itemPart=createRollModifierPart(Number(profile&&profile.weaponItemBonus||0),"weapon_item_bonus",profile&&profile.weapon?profile.weapon.name:"Weapon","Item bonus from the equipped weapon.");if(itemPart)parts.push(itemPart);const featSources=classFeatAttackBonusSourcesForProfile(player,profile);featSources.forEach(source=>{const part=createRollModifierPart(source.value,source.sourceKey,source.label,source.note);if(part)parts.push(part);});return{parts,featSources};}

  function createUnarmedAttackProfile(player, options) {
    const slotLabel=options&&options.slotLabel||"hand";
    const nameOverride=options&&options.nameOverride||null;
    const sourceWeapon=options&&options.sourceWeapon||null;
    const martialArtsRank=classFeatRankValue(player, "martial_arts");
    const hasMartialArts=martialArtsRank>0;
    const dmg=hasMartialArts?"1d6":"1d4";
    const dex=statMod(player.stats.DEX);
    const str=statMod(player.stats.STR);
    const abilityMod=Math.max(str, dex);
    const attackAbilityStat=dex>=str?"DEX":"STR";
    const statusAttackModifier=statusModifierTotal(player, "attackRollModifier");
    const pseudoWeapon={
      id:"unarmed_strike", name:"Unarmed", type:"weapon", category:"unarmed", properties:hasMartialArts?["agile"]:[], weaponTypes:["unarmed"], "Weapon type":"melee"
    };
    const profile={
      weapon:pseudoWeapon, sourceWeapon, slot:slotLabel, weaponName:nameOverride||(hasMartialArts?"Unarmed (Martial Arts)":"Unarmed"), attackBonus:abilityMod+statusAttackModifier, baseAttackBonus:abilityMod, statusAttackModifier, attackAbilityMod:abilityMod, attackAbilityStat, weaponItemBonus:0, damageExpr:dmg, damageType:"bludgeoning", tags:hasMartialArts?["unarmed", "agile"]:["unarmed"], weaponTypes:["unarmed"], isMeleeWeapon:true, isRangedWeapon:false, isAgileWeapon:hasMartialArts, usesDex:dex>=str, needsAmmo:false, ammoItemId:null, ammoCount:0, outOfAmmo:false, usedWeaponDice:false
    };
    const attackBreakdown=attackBonusPartsForProfile(player, profile);
    profile.classFeatAttackBonusSources=attackBreakdown.featSources;
    profile.featAttackBonus=attackBreakdown.featSources.reduce((sum, source)=>sum+Number(source.value||0), 0);
    profile.attackBonusParts=attackBreakdown.parts;
    profile.attackBonus=sumRollParts(profile.attackBonusParts);
    return profile;
  }

  function buildAttackProfile(player, weapon, options) {
    const fallbackUnarmed=options&&options.fallbackUnarmed||false;
    const slotLabel=options&&options.slotLabel||"hand";
    const martialArtsRank=classFeatRankValue(player, "martial_arts");
    const hasMartialArts=martialArtsRank>0;
    if((!weapon||weapon.type!=="weapon")&&fallbackUnarmed) {
      return createUnarmedAttackProfile(player, {
        slotLabel
      });
    }
    if(!weapon||weapon.type!=="weapon")return null;
    const props=Array.isArray(weapon.properties)?weapon.properties:[];
    const isRanged=weapon["Weapon type"]==="ranged";
    const dex=statMod(player.stats.DEX);
    const str=statMod(player.stats.STR);
    const statusAttackModifier=statusModifierTotal(player, "attackRollModifier");
    const ammoItemId=ammoItemIdForWeapon(weapon);
    const ammoCount=ammoItemId?weaponAmmoCount(player, weapon):0;
    const weaponItemBonus=Math.max(0, Number(weapon.attackBonusItem||0));
    if(ammoItemId&&ammoCount<1&&fallbackUnarmed) {
      return {
        ...createUnarmedAttackProfile(player, {
          slotLabel, nameOverride:weapon.name+" (out of ammo -> Unarmed)", sourceWeapon:weapon
        }), needsAmmo:true, ammoItemId, ammoCount, outOfAmmo:true
      };
    }
    const usesDex=isRanged||props.includes("finesse");
    const abilityMod=usesDex?Math.max(dex, str):str;
    const attackAbilityStat=usesDex&&dex>=str?"DEX":"STR";
    let damageExpr=weapon["Damage"];
    if(hasMartialArts&&weapon.category==="simple") {
      damageExpr=upgradeDamageExprMinimum(damageExpr, 6);
    }
    const profile={
      weapon, sourceWeapon:weapon, slot:slotLabel, weaponName:weapon.name, attackBonus:abilityMod+statusAttackModifier+weaponItemBonus, baseAttackBonus:abilityMod+weaponItemBonus, statusAttackModifier, attackAbilityMod:abilityMod, attackAbilityStat, weaponItemBonus, damageExpr, damageType:weapon["Damage type"], tags:props, weaponTypes:weaponTypesForItem(weapon), isMeleeWeapon:weapon["Weapon type"]==="melee", isRangedWeapon:isRanged, isAgileWeapon:props.includes("agile"), usesDex, needsAmmo:!!ammoItemId, ammoItemId, ammoCount, outOfAmmo:false, usedWeaponDice:true
    };
    const attackBreakdown=attackBonusPartsForProfile(player, profile);
    profile.classFeatAttackBonusSources=attackBreakdown.featSources;
    profile.featAttackBonus=attackBreakdown.featSources.reduce((sum, source)=>sum+Number(source.value||0), 0);
    profile.attackBonusParts=attackBreakdown.parts;
    profile.attackBonus=sumRollParts(profile.attackBonusParts);
    return profile;
  }

  function offHandAttackProfile(player) {
    const offHandId=player&&player.equipment?player.equipment.offHand:null;
    const offHandItem=offHandId?getItem(offHandId):null;
    if(offHandItem&&offHandItem.type==="weapon")return buildAttackProfile(player, offHandItem, {
      fallbackUnarmed:false, slotLabel:"off hand"
    });
    if(!offHandItem&&classFeatRankValue(player, "martial_arts")>0)return createUnarmedAttackProfile(player, {
      slotLabel:"off hand", nameOverride:"Off-hand Unarmed"
    });
    return null;
  }

  function hasDualAgileAttack(player) {
    const main=attackProfile(player);
    const off=offHandAttackProfile(player);
    return!!(main&&main.isAgileWeapon&&off&&off.isAgileWeapon);
  }

  function meleeFlyingPenalty(attack, enemy, options) {
    const ignorePenalty=options&&options.ignorePenalty||false;
    if(ignorePenalty)return 0;
    if(!attack||!attack.isMeleeWeapon)return 0;
    if(!hasEnemyTag(enemy, "flying"))return 0;
    if(attack.weapon&&hasWeaponProperty(attack.weapon, "reach"))return 0;
    return-4;
  }

  function applyEnrageStatus(state, sourceText) {
    const rank=classFeatRankValue(state.player, "enrage");
    const resistance=rank>=classFeatMaxRank("enrage")?3:2;
    addOrRefreshStatusEffect(state.player, {
      id:"enrage", templateId:"enrage", name:"Enrage", description:"For 10 rounds: +"+rank+" melee weapon damage, resistance "+resistance+" to bludgeoning, piercing, and slashing, and no Concentrate feats.", duration:10, maxDuration:10, durationMode:"turn", durationUnit:"rounds", tags:["Rage", "Buff"], disabledAbilityTags:["concentrate"], expiresOnDown:true, justApplied:true, modifiers:{
        damageBonusMelee:rank, resistances:{
          bludgeoning:resistance, piercing:resistance, slashing:resistance
        }
      }
    });
    log(state, sourceText||"You become Enraged for 10 rounds.");
  }

  function spendAbilitySp(state, abilityId) {
    state.player.sp.current=Math.max(0, state.player.sp.current-abilitySpCost(state.player, abilityId));
  }

  function canUseActiveAbility(state, abilityId) {
    const ability=getAbility(abilityId);
    if(ability.kind!=="active")return {
      ok:false, reason:"That is not an active feat."
    };
    if(!hasAbilityUnlocked(state.player, abilityId))return {
      ok:false, reason:"You do not know that feat."
    };
    const disabledReason=abilityDisabledReason(state.player, abilityId);
    if(disabledReason)return {
      ok:false, reason:disabledReason
    };
    const contexts=Array.isArray(ability.contexts)?ability.contexts:[];
    if(state.combat) {
      if(!contexts.includes("combat"))return {
        ok:false, reason:"You can only use that outside combat."
      };
      if(state.combat.turn!=="player")return {
        ok:false, reason:"It is not your turn."
      };
      const targeting=combatTargetingRuleForAbility(abilityId);
      const validation=validateCombatTargetSelection(state, targeting);
      if(!validation.ok)return {
        ok:false, reason:validation.reason||"Select a valid target."
      };
    } else if(!contexts.includes("exploration")) {
      return {
        ok:false, reason:"You can only use that in combat."
      };
    }
    if(abilitySpCost(state.player, abilityId)>state.player.sp.current)return {
      ok:false, reason:"Not enough SP."
    };
    if(abilityId==="enrage"&&hasStatusEffect(state.player, "enrage"))return {
      ok:false, reason:"You are already enraged."
    };
    if(abilityId==="quiet_step"&&hasStatusEffect(state.player, "quiet_step"))return {
      ok:false, reason:"Quiet Step is already active."
    };
    return {
      ok:true, reason:""
    };
  }

  function useEnrage(state) {
    const check=canUseActiveAbility(state, "enrage");
    if(!check.ok) {
      log(state, check.reason);
      return;
    }
    spendAbilitySp(state, "enrage");
    applyEnrageStatus(state, "You become Enraged for 10 rounds.");
    notifyAbilityUse("enrage", {
      message:"You become Enraged."
    });
    finishPlayerAbilityUse(state);
  }

  function useSecondWind(state){const check=canUseActiveAbility(state,"second_wind");if(!check.ok){log(state,check.reason);return;}const rank=classFeatRankValue(state.player,"second_wind");spendAbilitySp(state,"second_wind");const dieRoll=rollDiceDetailed("1d6","second_wind",{label:"Second Wind"});const parts=cloneRollParts(dieRoll.parts);const conMod=statMod(state.player.stats.CON);const conPart=createRollModifierPart(conMod,"constitution_modifier","CON","Constitution modifier applied to the healing roll.");if(conPart)parts.push(conPart);const rawPerRank=dieRoll.total+conMod;const minAdjust=Math.max(0,1-rawPerRank);const minimumPart=createRollModifierPart(minAdjust,"second_wind","Minimum 1","Each rank of Second Wind heals at least 1 HP.");if(minimumPart)parts.push(minimumPart);const perRankTotal=rawPerRank+minAdjust;const extraRanks=Math.max(0,rank-1)*perRankTotal;const rankPart=createRollModifierPart(extraRanks,"second_wind",`Ranks x${rank}`,`Second Wind repeats the per-rank healing package ${rank} time(s).`);if(rankPart)parts.push(rankPart);const heal=Math.max(1,perRankTotal*Math.max(1,rank));const before=state.player.hp.current;state.player.hp.current=clamp(state.player.hp.current+heal,0,state.player.hp.max);const recovered=state.player.hp.current-before;const wasted=Math.max(0,heal-recovered);const capPart=createRollModifierPart(-wasted,"healing_cap","Missing HP cap","Healing beyond your missing HP is lost.");if(capPart)parts.push(capPart);log(state,`You use Second Wind and recover ${recovered} HP.`,{rollGroups:[buildLogRollGroup({label:"Second Wind healing",parts,total:recovered})]});notifyAbilityUse("second_wind",{message:`You use Second Wind and recover ${recovered} HP.`});finishPlayerAbilityUse(state);}

  function useHuntersMark(state) {
    const check=canUseActiveAbility(state, "hunters_mark");
    if(!check.ok) {
      log(state, check.reason);
      return;
    }
    const enemy=preferredCombatEnemy(state);
    if(!enemy) {
      log(state, "Select an enemy target first.");
      return;
    }
    const rank=classFeatRankValue(state.player, "hunters_mark");
    const damageExpr=huntersMarkDamageExpr(rank);
    spendAbilitySp(state, "hunters_mark");
    for(const foe of combatEnemyList(state)) {
      removeStatusEffect(foe, "marked_prey");
    }
    addOrRefreshStatusEffect(enemy, createStatusEffect("marked_prey", {
      duration:5, maxDuration:5, description:"Marked for 5 rounds. This target cannot gain Hidden or Cover and takes an extra "+damageExpr+" damage from your attacks.", blockedIncomingStatusTags:["hidden", "cover"]
    }));
    log(state, enemy.name+" is marked for 5 rounds.");
    notifyAbilityUse("hunters_mark", {
      message:enemy.name+" is marked."
    });
    finishPlayerAbilityUse(state);
  }

  function useActiveAbility(state, abilityId) {
    if(state.combat)beginCombatToastBatch("player");
    if(abilityId==="second_wind")return useSecondWind(state);
    if(abilityId==="power_strike")return useGuardStance(state);
    if(abilityId==="feint_strike")return useFeintStrike(state);
    if(abilityId==="guard_strike")return useGuardStrike(state);
    if(abilityId==="enrage")return useEnrage(state);
    if(abilityId==="topple")return useTopple(state);
    if(abilityId==="vicious_strike")return useViciousStrike(state);
    if(abilityId==="tree_stance")return useTreeStance(state);
    if(abilityId==="river_stance")return useRiverStance(state);
    if(abilityId==="mountain_stance")return useMountainStance(state);
    if(abilityId==="cloud_stance")return useCloudStance(state);
    if(abilityId==="flame_stance")return useFlameStance(state);
    if(abilityId==="hunters_mark")return useHuntersMark(state);
    if(abilityId==="precise_strike")return usePreciseStrike(state);
    if(abilityId==="spike_lure")return useSpikeLure(state);
    if(abilityId==="dirty_trick")return useDirtyTrick(state);
    if(abilityId==="cover_step")return useCoverStep(state);
    if(abilityId==="quiet_step")return useQuietStep(state);
    if(abilityId==="open_wound")return useOpenWound(state);
    log(state, "No handler for feat: "+abilityId+".");
  }

  function buildLevelUpPreview(player, rawDraft) {
    ensurePlayerFeatContainers(player);
    const draft=rawDraft||{
    };
    const nextTotalLevel=totalLevel(player)+1;
    const statChoiceAvailable=STATS.some(stat=>Number(player&&player.stats&&player.stats[stat]||0)<STAT_LEVEL_UP_CAP);
    const statPointBudget=statChoiceAvailable?1:0;
    const statResult=applyLevelUpStatAlloc(player, draft.statAlloc, statPointBudget);
    const previewStats=statResult.stats;
    const eligibleClassIds=Object.keys(CLASSES).filter(classId=>canTakeClassLevel(player, classId, previewStats));
    const fallbackClassId=mainClass(player);
    const requestedClassId=draft&&CLASSES[draft.classId]?draft.classId:fallbackClassId;
    const classId=eligibleClassIds.includes(requestedClassId)?requestedClassId:(eligibleClassIds.includes(fallbackClassId)?fallbackClassId:(eligibleClassIds[0]||Object.keys(CLASSES)[0]));
    const currentClassLevel=Number(player.levels&&player.levels[classId]||0);
    const newClassLevel=currentClassLevel+1;
    const levels={
      ...player.levels, [classId]:newClassLevel
    };
    const skillPointGain=levelUpSkillPointGainForStats(previewStats, classId);
    const skillTrainResult=sanitizeLevelUpSkillTrainDraft(player, draft.skillTrainDraft, skillPointGain);
    const cls=CLASSES[classId];
    const hpGain=Math.max(1, cls.hpPerLevel+statMod(previewStats.CON));
    const spGain=Math.max(1, cls.spPerLevel+Math.max(0, statMod(previewStats.WIS)));
    const classFeatResult=sanitizeClassFeatRankDraft(player, draft.classFeatDraft, {
      levelsOverride:levels, totalLevelOverride:nextTotalLevel, questUnlocksOverride:player.questUnlocks
    });
    const blockers=[];
    if(statPointBudget>0&&statResult.spent<statPointBudget)blockers.push("Choose 1 ability score to increase.");
    if(classFeatResult.invalidIds.length)blockers.push("Resolve feat requirements: "+classFeatResult.invalidIds.map(id=>getClassFeat(id)?getClassFeat(id).name:id).join(", ")+".");
    return {
      currentTotalLevel:totalLevel(player), nextTotalLevel, xpCost:xpToNextLevel(player), statPointBudget, statPointSpent:statResult.spent, statPointsRemaining:Math.max(0, statPointBudget-statResult.spent), statChoiceAvailable, stats:previewStats, statAlloc:statResult.alloc, eligibleClassIds, classId, currentClassLevel, newClassLevel, levels, classRequirementText:classRequirementText(classId), classFeatPointGain:3, classFeatPointBudget:classFeatResult.budget, classFeatDraft:classFeatResult.draft, classFeatPointsSpent:classFeatResult.spent, classFeatPointsAvailable:classFeatResult.remaining, classFeatInvalidIds:classFeatResult.invalidIds, skillPointGain, skillTrainDraft:skillTrainResult.draft, skillTrainSpent:skillTrainResult.spent, skillTrainRemaining:skillTrainResult.remaining, hpGain, spGain, canConfirm:blockers.length===0, blockers
    };
  }

  function levelUpDraftFromPreview(preview) {
    return {
      classId:preview.classId, statAlloc:{
        ...preview.statAlloc
      }, skillTrainDraft:{
        ...preview.skillTrainDraft
      }, classFeatDraft:{
        ...preview.classFeatDraft
      }
    };
  }

  function levelUp(state, rawDraft) {
    if(!state||!state.player||!canLevelUp(state.player))return;
    const preview=buildLevelUpPreview(state.player, rawDraft||state.ui.levelUpDraft||{
    });
    if(!preview.canConfirm) {
      toast(preview.blockers[0]||"Finish your level-up choices first.", "warn");
      return;
    }
    if(!canTakeClassLevel(state.player, preview.classId, preview.stats)) {
      toast("You do not meet the requirements for "+preview.classId+".", "warn");
      return;
    }
    const player=state.player;
    const beforeFeatCtx=buildClassFeatContext(player, {
      levelsOverride:player.levels, ranksOverride:player.classFeatRanks, totalLevelOverride:totalLevel(player)
    });
    const beforeFeatRanks=normalizeClassFeatRanks(player.classFeatRanks||{
    });
    const nextTotalLevel=preview.nextTotalLevel;
    player.xp-=preview.xpCost;
    player.stats={
      ...preview.stats
    };
    const wasNewClass=Number(player.levels[preview.classId]||0)<=0;
    player.levels[preview.classId]=preview.newClassLevel;
    if(wasNewClass) {
      ensurePlayerClassOrder(player);
      player.classOrder=[...player.classOrder.filter(classId=>classId!==preview.classId), preview.classId];
    }
    player.hp.max+=preview.hpGain;
    player.hp.current+=preview.hpGain;
    player.sp.max+=preview.spGain;
    player.sp.current+=preview.spGain;
    player.classFeatRanks=normalizeClassFeatRanks(preview.classFeatDraft);
    const training=applySkillTrainingWithBudget(player, preview.skillTrainDraft, preview.skillPointGain);
    if(training.remaining>0)player.skillPoints+=training.remaining;
    syncPlayerAbilityIdsForLevels(player);
    const statSummary=STATS.filter(stat=>Number(preview.statAlloc[stat]||0)>0).map(stat=>stat+" +"+preview.statAlloc[stat]).join(", ");
    const trainedSummary=summarizeSkillDraft(training.applied).join(", ");
    const featChanges=classFeatChangeSummary(beforeFeatRanks, player.classFeatRanks);
    log(state, "Level up! "+player.name+" reaches total level "+nextTotalLevel+" by taking "+preview.classId+" "+preview.newClassLevel+" (+"+preview.hpGain+" HP, +"+preview.spGain+" SP, +"+preview.skillPointGain+" skill point"+(preview.skillPointGain===1?"":"s")+", +3 class feat points).");
    if(statSummary)log(state, "Ability score increases applied: "+statSummary+".");
    if(featChanges.length) {
      log(state, "Class feat ranks updated: "+featChanges.join(", ")+".");
    } else {
      log(state, "Class feat points gained: +3. Unspent class feat points remain available from the Character tab.");
    }
    if(training.spent>0||training.remaining>0) {
      const parts=[];
      if(training.spent>0)parts.push("locked in "+(trainedSummary||(training.spent+" skill point"+(training.spent===1?"":"s"))));
      if(training.remaining>0)parts.push(training.remaining+" unspent added to your Character tab training pool");
      log(state, "Skill training gained: "+parts.join("; ")+".");
    }
    const afterFeatCtx=buildClassFeatContext(player, {
      levelsOverride:player.levels, ranksOverride:player.classFeatRanks, totalLevelOverride:totalLevel(player)
    });
    notifyNewlyUnlockedClassFeats(state, beforeFeatCtx, afterFeatCtx, "A class level and your updated feat ranks unlocked new class feats.");
    state.ui.levelUpOpen=false;
    state.ui.levelUpDraft={
    };
    save(state);
    render();
  }

  function resolvePlayerAttack(state,options){const prefix=options&&options.prefix||"";const attack=options&&options.attack||null;const attackBonusModifier=Number(options&&options.attackBonusModifier||0);const extraDamageOnHit=Number(options&&options.extraDamageOnHit||0);const ignoreFlyingPenalty=options&&options.ignoreFlyingPenalty||false;const target=options&&options.target||null;const attackBonusSourceKey=options&&options.attackBonusSourceKey||"extra_attack_bonus";const attackBonusSourceLabel=options&&options.attackBonusSourceLabel||"";const extraDamageSourceKey=options&&options.extraDamageSourceKey||"extra_damage_on_hit";const extraDamageSourceLabel=options&&options.extraDamageSourceLabel||"";normalizeCombatState(state);if(!state.combat)return{usedAction:false,enemyDefeated:false,hit:false,outcome:null,damage:0,attack:null};const enemy=target||preferredCombatEnemy(state)||state.combat.enemy;if(!enemy)return{usedAction:false,enemyDefeated:false,hit:false,outcome:null,damage:0,attack:null};const ap=attack||attackProfile(state.player);if(!ap)return{usedAction:false,enemyDefeated:false,hit:false,outcome:null,damage:0,attack:null};consumeAmmoForAttack(state,ap);const attackRoll=rollD20Detailed("attack_roll",{label:ap.weaponName,note:`${ap.weaponName} makes an attack roll.`});const baseAttackParts=Array.isArray(ap.attackBonusParts)&&ap.attackBonusParts.length?cloneRollParts(ap.attackBonusParts):[createRollModifierPart(Number(ap.attackBonus||0),"extra_attack_bonus",ap.weaponName,"Attack bonus from the attack profile.")].filter(Boolean);const attackParts=[...cloneRollParts(attackRoll.parts),...baseAttackParts];const attackBonusLabel=attackBonusSourceLabel||rollSourceLabel(attackBonusSourceKey,"Attack bonus");const extraAttackPart=createRollModifierPart(attackBonusModifier,attackBonusSourceKey,attackBonusLabel,`${attackBonusLabel} changes this attack roll.`);if(extraAttackPart)attackParts.push(extraAttackPart);const offHandPenalty=offHandAttackPenalty(ap);const offHandPart=createRollModifierPart(offHandPenalty,"off_hand_penalty","Off-hand penalty","Weapon attacks made with the off hand take a -4 penalty before feats or other bonuses are applied.");if(offHandPart)attackParts.push(offHandPart);const flyingPenalty=meleeFlyingPenalty(ap,enemy,{ignorePenalty:ignoreFlyingPenalty});const flyingPart=createRollModifierPart(flyingPenalty,"flying_penalty","Flying target","Non-reach melee attacks take a -4 penalty against flying enemies.");if(flyingPart)attackParts.push(flyingPart);const enemyAc=effectiveEnemyAC(enemy);const total=sumRollParts(attackParts);const attackBonus=total-attackRoll.total;let outcome="miss";if(attackRoll.total===1){outcome="critfail";}else if(attackRoll.total===20||total>=enemyAc){outcome=attackRoll.total===20?"crit":"hit";}const hit=outcome==="hit"||outcome==="crit";const rollGroups=[buildLogRollGroup({label:`${ap.weaponName} attack`,parts:attackParts,total,targetLabel:"AC",targetValue:enemyAc,outcome})];const extras=[];let dmg=0;if(hit){const damageParts=[];const weaponDamageRoll=rollDiceDetailed(ap.damageExpr,"weapon_damage",{label:ap.weaponName,note:`${ap.weaponName} rolls base weapon damage.`});damageParts.push(...cloneRollParts(weaponDamageRoll.parts));const abilityStat=String(ap.attackAbilityStat||"").trim().toUpperCase();const abilityLabel=abilityStat||"Ability";const abilityNote=abilityStat?`${fullStatName(abilityStat)} modifier added to weapon damage.`:"Attack ability modifier added to weapon damage.";const abilityPart=createRollModifierPart(Number(ap.attackAbilityMod||0),abilitySourceKeyForStat(abilityStat),abilityLabel,abilityNote);if(abilityPart)damageParts.push(abilityPart);if(ap.isMeleeWeapon){for(const source of statusModifierSources(state.player,"damageBonusMelee")){const part=createRollModifierPart(source.value,source.sourceKey,source.label,source.note||"Melee damage bonus from an active status.");if(part)damageParts.push(part);}}const overpowerBonus=(hasAbility(state.player,"skill_athletics_overpower")||hasAbility(state.player,"skill_feat_athletics_overpower"))&&(ap.isMeleeWeapon||(Array.isArray(ap.tags)&&ap.tags.includes("unarmed")))&&(hasStatusEffect(enemy,"off_guard")||hasStatusEffect(enemy,"prone"))?2:0;const overpowerPart=createRollModifierPart(overpowerBonus,"skill_athletics_overpower","Overpower","Overpower adds +2 damage against Off-Guard or Prone enemies.");if(overpowerPart)damageParts.push(overpowerPart);if(hasStatusEffect(enemy,"marked_prey")){const hunterRoll=rollDiceDetailed(huntersMarkDamageExpr(classFeatRankValue(state.player,"hunters_mark")),"hunters_mark",{label:"Hunter's Mark",note:"Hunter's Mark adds extra damage against the marked target."});damageParts.push(...cloneRollParts(hunterRoll.parts));}const extraDamageLabel=extraDamageSourceLabel||rollSourceLabel(extraDamageSourceKey,"Additional damage");const extraDamagePart=createRollModifierPart(extraDamageOnHit,extraDamageSourceKey,extraDamageLabel,`${extraDamageLabel} adds direct damage on a hit.`);if(extraDamagePart)damageParts.push(extraDamagePart);const sneakRank=classFeatRankValue(state.player,"sneak_attack");if(sneakRank>0&&(ap.isAgileWeapon||ap.isRangedWeapon)){const triggerRoll=rollDiceDetailed("1d6","sneak_attack_trigger",{label:"Sneak Attack",note:"Sneak Attack triggers on a low 1d6 result after a successful agile or ranged attack."});const triggerMax=sneakAttackTriggerMax(sneakRank);const triggerSuccess=triggerRoll.total<=triggerMax;rollGroups.push(buildLogRollGroup({label:"Sneak Attack trigger",parts:cloneRollParts(triggerRoll.parts),total:triggerRoll.total,targetLabel:"Max",targetValue:triggerMax,outcome:triggerSuccess?"success":"failure",note:`Sneak Attack triggers on ${triggerMax} or lower.`}));if(triggerSuccess){const sneakRoll=rollDiceDetailed(sneakAttackDamageExpr(sneakRank),"sneak_attack_damage",{label:"Sneak Attack",note:"Extra damage from Sneak Attack."});damageParts.push(...cloneRollParts(sneakRoll.parts));rollGroups.push(buildLogRollGroup({label:"Sneak Attack damage",parts:cloneRollParts(sneakRoll.parts),total:sneakRoll.total}));extras.push("Sneak Attack triggers");}else{extras.push("Sneak Attack does not trigger");}}if(outcome==="crit"){const preCritTotal=sumRollParts(damageParts);const critPart=createRollModifierPart(preCritTotal,"critical_hit_bonus","Critical hit","A critical hit adds the full pre-critical damage total again.");if(critPart)damageParts.push(critPart);}const rawDamage=sumRollParts(damageParts);const flooredDamage=Math.max(0,rawDamage);const floorPart=createRollModifierPart(flooredDamage-rawDamage,"damage_floor","Minimum 0 damage","Damage cannot go below 0.");if(floorPart)damageParts.push(floorPart);dmg=Math.max(0,sumRollParts(damageParts));rollGroups.push(buildLogRollGroup({label:`${ap.weaponName} damage`,parts:damageParts,total:dmg,note:`Final ${formatDamageTypeLabel(ap.damageType)} damage dealt to ${enemy.name}.`}));enemy.hp.current=clamp(enemy.hp.current-dmg,0,enemy.hp.max);}if(state.combat&&enemy&&hasAbility(state.player,"frothing_rage")&&hasStatusEffect(state.player,"enrage")){const frothRoll=rollD20Detailed("frothing_rage",{label:"Frothing Rage",note:"Frothing Rage uses a Social check. Lower than the target's Will DC succeeds unless you roll a natural 20."});const frothParts=[...cloneRollParts(frothRoll.parts),...cloneRollParts(skillCheckSourceParts(state.player,"Social"))];const frothTotal=sumRollParts(frothParts);const frothDc=creatureSaveDc(enemy,"will");const frothSuccess=frothRoll.total!==20&&frothTotal<frothDc;rollGroups.push(buildLogRollGroup({label:"Frothing Rage",parts:frothParts,total:frothTotal,targetLabel:"Will DC",targetValue:frothDc,outcome:frothSuccess?"success":"failure",note:"Frothing Rage succeeds when the Social total is below the target's Will DC unless the d20 is a natural 20."}));if(frothSuccess){addOrRefreshStatusEffect(enemy,createStatusEffect("off_guard"));extras.push("Frothing Rage leaves the target Off-Guard");}}if(hit&&enemy&&hasStatusEffect(state.player,"river_stance")&&(ap.tags||[]).includes("unarmed")){const riverRoll=rollD20Detailed("river_stance",{label:"River Stance",note:"River Stance uses an Acrobatics check against Reflex DC on a successful unarmed hit."});const riverParts=[...cloneRollParts(riverRoll.parts),...cloneRollParts(skillCheckSourceParts(state.player,"Acrobatics"))];const riverTotal=sumRollParts(riverParts);const riverDc=creatureSaveDc(enemy,"reflex");const riverSuccess=riverRoll.total===20||riverTotal>=riverDc;rollGroups.push(buildLogRollGroup({label:"River Stance",parts:riverParts,total:riverTotal,targetLabel:"Reflex DC",targetValue:riverDc,outcome:riverSuccess?"success":"failure"}));if(riverSuccess){addOrRefreshStatusEffect(enemy,createStatusEffect("off_guard"));extras.push("River Stance leaves the target Off-Guard");}}if(hasStatusEffect(state.player,"cover_step")){removeStatusEffect(state.player,"cover_step");extras.push("Cover Step is consumed");}const extraText=extras.length?` (${extras.join("; ")})`:"";if(!hit){log(state,`${prefix}You attack with ${ap.weaponName} and miss ${enemy.name}.${extraText}`,{rollGroups});notifyCombatAction(`You miss ${enemy.name} with ${ap.weaponName}.`,"miss");return{usedAction:true,enemyDefeated:false,hit:false,outcome,damage:0,attack:ap,roll:attackRoll.total,attackBonus,total,enemyAc};}log(state,`${prefix}You ${outcome === "crit" ? "critically hit" : "hit"} ${enemy.name} with ${ap.weaponName} for ${dmg} ${ap.damageType} damage.${extraText}`,{rollGroups});notifyCombatAction(`You ${outcome === "crit" ? "critically hit" : "hit"} ${enemy.name} with ${ap.weaponName} for ${dmg} ${ap.damageType} damage.`,"good");if(enemy.hp.current<=0){const removal=removeEnemyFromCombat(state,enemy);return{usedAction:true,enemyDefeated:true,encounterWon:!!removal.encounterWon,hit:true,outcome,damage:dmg,attack:ap,roll:attackRoll.total,attackBonus,total,enemyAc};}return{usedAction:true,enemyDefeated:false,hit:true,outcome,damage:dmg,attack:ap,roll:attackRoll.total,attackBonus,total,enemyAc};}

  function renderClassPreview(classId,stats){const cls=CLASSES[classId];const conMod=statMod(stats.CON);const wisMod=statMod(stats.WIS);const hp=Math.max(1,cls.hpPerLevel+conMod);const sp=Math.max(1,cls.spPerLevel+Math.max(0,wisMod));const weap=cls.proficiencies.weapons;const arm=cls.proficiencies.armor;const weaponList=Object.entries(weap).filter(function(entry){return hasTrainingFlag(entry[1]);}).map(function(entry){return formatDamageTypeLabel(entry[0]);}).join(", ")||"none";const armorList=Object.entries(arm).filter(function(entry){return hasTrainingFlag(entry[1]);}).map(function(entry){return formatDamageTypeLabel(entry[0]);}).join(", ")||"none";const relatedFeats=classFeatIds().filter(function(featId){const feat=getClassFeat(featId);return Array.isArray(feat&&feat.classes)&&feat.classes.includes(classId);});const saveLine=function(id,label){return label+" (+<span class=\"mono\">"+Number(cls.proficiencies.saves[id]||0)+"</span>)";};return`
        <div class="kv"><div class="k">Key Ability</div><div class="v">${cls.keyAbilities.join(" / ")}</div></div>
        <div class="kv"><div class="k">Multiclass Requirement</div><div class="v">${escapeHtml(classRequirementText(classId))}</div></div>
        <div class="kv"><div class="k">Starting Skill</div><div class="v">${cls.startingTrainedSkill} <span class="muted">(+2 proficiency)</span></div></div>
        <div class="kv"><div class="k">HP at level 1</div><div class="v">${hp}</div></div>
        <div class="kv"><div class="k">SP at level 1</div><div class="v">${sp}</div></div>
        <div class="kv"><div class="k">Saving Throws</div><div class="v">${saveLine("fort", "Fortitude")} | ${saveLine("reflex", "Reflex")} | ${saveLine("will", "Will")}</div></div>
        <div class="kv"><div class="k">Weapon Proficiency</div><div class="v">${escapeHtml(weaponList)}</div></div>
        <div class="kv"><div class="k">Armor Proficiency</div><div class="v">${escapeHtml(armorList)}</div></div>
        <div class="kv" style="align-items:flex-start"><div class="k">Class Feats</div><div class="v" style="max-width:420px">${relatedFeats.length ? relatedFeats.map(function (featId) { return abilityBadgeHtml(featId); }).join("") : `<span class="small muted">No class feats listed.</span>`}</div></div>
        <div class="small muted" style="margin-top:12px; line-height:1.5">Every level a character gains <strong>3 class feat points</strong> to improve your feats. Spend them on the Character tab after creation. </div>
      `;}

  function renderExplorationAbilitiesPanel(){const activeExploreAbilities=playerAbilityIds(state.player).filter(id=>getAbility(id).kind==="active"&&(getAbility(id).contexts||[]).includes("exploration"));const passiveExploreAbilities=playerAbilityIds(state.player).filter(id=>getAbility(id).kind==="passive"&&(getAbility(id).contexts||[]).includes("exploration"));const activeButtons=activeExploreAbilities.map(id=>{const ability=getAbility(id);const availability=canUseActiveAbility(state,id);const disabled=availability.ok?"":"disabled";return`<button class="btn" data-ability-use="${ability.id}" data-ability="${ability.id}" ${disabled}>${escapeHtml(isClassFeatId(id) ? ((ability.emoji || "*") + " " + ability.name) : ability.name)}</button>`;}).join("");const sections=[];if(activeExploreAbilities.length){sections.push(`
          <div style="margin-bottom:${passiveExploreAbilities.length ? "12px" : "0"}">
            <div class="small muted" style="margin-bottom:6px">Active exploration feats</div>
            <div style="display:flex; gap:8px; flex-wrap:wrap">${activeButtons}</div>
          </div>
        `);}if(passiveExploreAbilities.length){sections.push(`
          <div>
            <div class="small muted" style="margin-bottom:6px">Passive exploration feats</div>
            ${renderAbilityBadgeList(passiveExploreAbilities, "")}
          </div>
        `);}return`
        <div class="panel">
          <header><h2>Exploration Feats</h2><div class="hint">Movement, scouting, and utility outside combat.</div></header>
          <div class="body">
            <div class="small muted" style="line-height:1.45; margin-bottom:${sections.length ? "10px" : "0"}">An Adventurer should be good at this kinda stuff, yeah? </div>
            ${sections.length ? sections.join("") : `<div class="small muted">• You currently have no exploration feats.</div>`}
          </div>
        </div>
      `;}

  function renderLevelUpOverlay(preview){const player=state.player;const selectedClass=CLASSES[preview.classId];const selectedStatId=STATS.find(stat=>Number(preview.statAlloc[stat]||0)>0)||null;const levelSummaryPills=["+"+preview.hpGain+" HP","+"+preview.spGain+" SP","+"+preview.skillPointGain+" skill point"+(preview.skillPointGain===1?"":"s"),"+1 ability score","+3 class feat points"];const asiStatusText=!preview.statChoiceAvailable?"All ability scores are already at the current cap of "+STAT_LEVEL_UP_CAP+".":(selectedStatId?(fullStatName(selectedStatId)+" selected for +1 this level."):"Choose 1 ability score to increase by 1.");const asiChoiceButtons=STATS.map(stat=>{const current=Number(player.stats[stat]||0);const next=Math.min(STAT_LEVEL_UP_CAP,current+1);const selected=Number(preview.statAlloc[stat]||0)>0;const atCap=current>=STAT_LEVEL_UP_CAP;const currentMod=statMod(current);const nextMod=statMod(next);const modifierNote=(selected&&nextMod!==currentMod)?("Mod "+fmtSigned(currentMod)+" -> "+fmtSigned(nextMod)):(atCap?"Maxed":"");return`
          <button class="asiChoiceBtn ${selected ? "selected" : ""}" type="button" data-levelup-asi="${stat}" ${atCap ? "disabled" : ""}>
            <div class="asiChoiceTop">
              <span class="asiChoiceStat statHint" data-stat-tip="${stat}">${fullStatName(stat)}</span>
              <span class="asiChoiceDelta mono">${current} -> ${next}</span>
            </div>
            ${modifierNote ? `<div class="asiChoiceMeta small muted">${escapeHtml(modifierNote)}</div>` : ``}
          </button>
        `;}).join("");const skillRows=SKILLS.map(sk=>{const base=statMod(preview.stats[sk.stat]);const proficiency=player.skillProficiency[sk.id]||0;const pending=preview.skillTrainDraft[sk.id]||0;const total=base+proficiency+pending;const cap=skillProficiencyCap(player,sk.id);const canDec=pending>0;const canInc=preview.skillTrainRemaining>0&&(proficiency+pending)<cap;return`
          <tr>
            <td class="skillHint" data-skill-tip="${sk.id}">${sk.id}</td>
            <td class="mono">${fmtSigned(base)}</td>
            <td class="mono">${proficiency}</td>
            <td class="mono">${fmtSigned(total)}</td>
            <td>
              <div class="trainControls">
                <button class="btn ghost" type="button" data-levelup-skill="${sk.id}" data-dir="dec" ${canDec ? "" : "disabled"}>-</button>
                <span class="pendingBadge ${pending ? "active" : ""}">${pending > 0 ? ("+" + pending) : "0"}</span>
                <button class="btn ghost" type="button" data-levelup-skill="${sk.id}" data-dir="inc" ${canInc ? "" : "disabled"}>+</button>
              </div>
            </td>
          </tr>
        `;}).join("");const blockerText=preview.canConfirm?"Everything is ready. Confirm to level up.":preview.blockers.join(" ");return`
        <div class="levelUpOverlay" id="levelup_overlay">
          <div class="levelUpBackdrop" data-levelup-close></div>
          <div class="levelUpCard" role="dialog" aria-modal="true" aria-labelledby="levelup_title">
            <div class="levelUpHeader">
              <div>
                <div class="levelUpEyebrow">Level up available</div>
                <h2 id="levelup_title">${escapeHtml(player.name)} - Level ${preview.currentTotalLevel} -> ${preview.nextTotalLevel}</h2>
                <!-- <div class="small muted" style="line-height:1.45">Choose your next class level, pick one ability score to raise by 1, spend this level's skill training, and adjust your class feat points before confirming. Multiclassing uses simple stat requirements and never grants extra starting proficiencies.</div>-->
              </div>
              <button class="btn ghost" type="button" data-levelup-close>X</button>
            </div>

            <div class="levelUpSummaryGrid">
              <div class="levelUpSummaryCard"><div class="label">XP Cost</div><div class="value mono">${preview.xpCost}</div></div>
              <div class="levelUpSummaryCard"><div class="label">Class Advance</div><div class="value">${escapeHtml(preview.classId)} ${preview.currentClassLevel} -> ${preview.newClassLevel}</div></div>
              <div class="levelUpSummaryCard levelUpSummaryCardWide">
                <div class="label">This Level</div>
                <div class="value">
                  <div class="levelUpSummaryPills">
                    ${levelSummaryPills.map(function (text) { return `<span class="pill levelUpGainPill">${escapeHtml(text)}</span>`; }).join("")}
                  </div>
                </div>
              </div>
            </div>

            <div class="levelUpMainGrid">
              <div class="levelUpColumn levelUpColumnLeft">
                <div class="levelUpSection" id="levelup_class_feat_section">
                  <header>
                    <h3>Class Feats</h3>
                    <div class="hint">${preview.classFeatPointsAvailable} available</div>
                  </header>
                  <div class="body">
                    <div class="classFeatSummaryRow">
                      <span class="pill"><span class="muted">This level</span> <strong class="mono">+${preview.classFeatPointGain}</strong></span>
                      <span class="pill"><span class="muted">Available</span> <strong class="mono">${preview.classFeatPointsAvailable}</strong></span>
                    </div>
                    <div class="small muted" style="line-height:1.45; margin-bottom:8px">Unspent class feat points stay banked if you want to save them for later.</div>
                    ${renderClassFeatGroups(player, { context: "levelup", ranksOverride: preview.classFeatDraft, levelsOverride: preview.levels, totalLevelOverride: preview.nextTotalLevel, visibleClassIds: ownedClassIdsInOrder(player) })}
                  </div>
                </div>

                <div class="levelUpSection">
                  <header>
                    <h3>Class Choice</h3>
                    <div class="hint">Feel free to take multiple classes.</div>
                  </header>
                  <div class="body">
                    <div class="field">
                      <!--<label for="levelup_class">Take a level in</label>-->
                      <select id="levelup_class">
                        ${Object.keys(CLASSES).map(cid => {
              const current = Number(player.levels[cid] || 0);
              const eligible = canTakeClassLevel(player, cid, preview.stats);
              const reqText = classRequirementText(cid);
              const levelText = current + " -> " + (current + 1);
              return `<option value="${cid}" ${cid === preview.classId ? "selected" : ""} ${eligible ? "" : "disabled"}>${escapeHtml(cid)} (${levelText})${current < 1 ? (" - Req: " + escapeHtml(reqText)) : ""}${eligible ? "" : " - Locked"}</option>`;
          }).join("")}
                      </select>
                    </div>
                    <div class="small muted" style="margin-top:10px; line-height:1.45">Requirement: <strong>${escapeHtml(preview.classRequirementText)}</strong>. This class level grants <strong>+${preview.hpGain} HP</strong>, <strong>+${preview.spGain} SP</strong>, and <strong>${preview.skillPointGain} skill point${preview.skillPointGain === 1 ? "" : "s"}</strong>.</div>
                    <div class="small muted" style="margin-top:8px; line-height:1.45">Key abilities: ${escapeHtml(selectedClass.keyAbilities.join(" / "))}</div>
                  </div>
                </div>
              </div>

              <div class="levelUpColumn levelUpColumnRight">
                <div class="levelUpSection">
                  <header>
                    <h3>Ability Score Increase</h3>
                    <!--<div class="hint">Choose 1 score to raise by 1</div>-->
                  </header>
                  <div class="body">
                    <div class="small muted" style="line-height:1.45; margin-bottom:10px">${escapeHtml(asiStatusText)}</div>
                    <div class="asiChoiceGrid">${asiChoiceButtons}</div>
                  </div>
                </div>

                <div class="levelUpSection">
                  <header>
                    <h3>Skill Training</h3>
                    <div class="hint">${preview.skillTrainRemaining} point${preview.skillTrainRemaining === 1 ? "" : "s"} remaining</div>
                  </header>
                  <div class="body">
                    <div class="tableWrap">
                      <table class="table">
                        <thead>
                          <tr>
                            <th>Skill</th><th>Base</th><th>Prof</th><th>Total</th><th>Train</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${skillRows}
                        </tbody>
                      </table>
                    </div>
                    <div class="small muted" style="margin-top:10px; line-height:1.5">Unspent skill points are saved if you want to spend it later.</div>
                  </div>
                </div>
              </div>
            </div>

            <div class="levelUpFooter">
              <div class="small muted" style="line-height:1.45">${escapeHtml(blockerText)}</div>
              <div style="display:flex; gap:10px; flex-wrap:wrap">
                <button class="btn" type="button" data-levelup-close>Cancel</button>
                <button class="btn primary" type="button" id="btn_levelup_confirm" ${preview.canConfirm ? "" : "disabled"}>Confirm Level Up</button>
              </div>
            </div>
          </div>
        </div>
      `;}

  function wireLevelUpOverlay() {
    const overlay=document.getElementById("levelup_overlay");
    if(!overlay)return;
    overlay.querySelectorAll("[data-levelup-close]").forEach(btn=> {
      btn.addEventListener("click", ()=>closeLevelUpOverlay(state));
    });
    const classEl=document.getElementById("levelup_class");
    if(classEl) {
      classEl.addEventListener("change", ()=> {
        const next=buildLevelUpPreview(state.player, {
          ...(state.ui.levelUpDraft||{
          }), classId:classEl.value, classFeatDraft:{
            ...((state.ui.levelUpDraft&&state.ui.levelUpDraft.classFeatDraft)||{
            })
          }, skillFeatDraft:{
            ...((state.ui.levelUpDraft&&state.ui.levelUpDraft.skillFeatDraft)||{
            })
          }, generalFeatDraft:{
            ...((state.ui.levelUpDraft&&state.ui.levelUpDraft.generalFeatDraft)||{
            })
          }
        });
        state.ui.levelUpDraft=levelUpDraftFromPreview(next);
        render();
      });
    }
    overlay.querySelectorAll("button[data-levelup-asi]").forEach(btn=> {
      btn.addEventListener("click", ()=> {
        if(btn.disabled)return;
        const stat=btn.getAttribute("data-levelup-asi");
        const next=buildLevelUpPreview(state.player, {
          ...(state.ui.levelUpDraft||{
          }), statAlloc:stat?{
            [stat]:1
          }
          :{
          }, classFeatDraft:{
            ...((state.ui.levelUpDraft&&state.ui.levelUpDraft.classFeatDraft)||{
            })
          }, skillFeatDraft:{
            ...((state.ui.levelUpDraft&&state.ui.levelUpDraft.skillFeatDraft)||{
            })
          }, generalFeatDraft:{
            ...((state.ui.levelUpDraft&&state.ui.levelUpDraft.generalFeatDraft)||{
            })
          }
        });
        state.ui.levelUpDraft=levelUpDraftFromPreview(next);
        render();
      });
    });
    overlay.querySelectorAll("button[data-levelup-skill]").forEach(btn=> {
      btn.addEventListener("click", ()=> {
        const skillId=btn.getAttribute("data-levelup-skill");
        const dir=btn.getAttribute("data-dir");
        const draft={
          ...(state.ui.levelUpDraft||{
          }), skillTrainDraft:{
            ...((state.ui.levelUpDraft&&state.ui.levelUpDraft.skillTrainDraft)||{
            })
          }, classFeatDraft:{
            ...((state.ui.levelUpDraft&&state.ui.levelUpDraft.classFeatDraft)||{
            })
          }, skillFeatDraft:{
            ...((state.ui.levelUpDraft&&state.ui.levelUpDraft.skillFeatDraft)||{
            })
          }, generalFeatDraft:{
            ...((state.ui.levelUpDraft&&state.ui.levelUpDraft.generalFeatDraft)||{
            })
          }
        };
        const current=Number(draft.skillTrainDraft[skillId]||0);
        if(dir==="inc")draft.skillTrainDraft[skillId]=current+1;
        else if(current<=1)delete draft.skillTrainDraft[skillId];
        else draft.skillTrainDraft[skillId]=current-1;
        const next=buildLevelUpPreview(state.player, draft);
        state.ui.levelUpDraft=levelUpDraftFromPreview(next);
        render();
      });
    });
    bindClassFeatUiHandlers(document.getElementById("levelup_class_feat_section"), "levelup");
    const featUndoBtn=overlay.querySelector("[data-levelup-feat-undo]");
    if(featUndoBtn) {
      featUndoBtn.addEventListener("click", ()=> {
        ResetLevelUpFeatDrafts(state);
        render();
      });
    }
    const confirmBtn=document.getElementById("btn_levelup_confirm");
    if(confirmBtn) {
      confirmBtn.addEventListener("click", ()=> {
        levelUp(state, state.ui.levelUpDraft||{
        });
      });
    }
  }

  function renderCharacterTab(){const p=state.player;ensurePlayerFeatContainers(p);ensureFeatUiState(state);const tl=totalLevel(p);const cls=mainClass(p);const ac=calcAC(p);const inv=calcInventorySlots(p);const featAvailable=classFeatPointsAvailable(p);const statRows=STATS.map(s=>`
        <div class="kv">
          <div class="k statHint" data-stat-tip="${s}">${fullStatName(s)}</div>
          <div class="v">${p.stats[s]} <span class="muted">(${fmtSigned(statMod(p.stats[s]))})</span></div>
        </div>
      `).join("");const draft=sanitizeSkillDraft((state.ui&&state.ui.skillDraft)?state.ui.skillDraft:{});state.ui=state.ui||{};state.ui.skillDraft={...draft};const draftSpent=Object.values(draft).reduce((a,b)=>a+(b||0),0);const available=Math.max(0,p.skillPoints-draftSpent);const saveRows=`
        <div class="kv"><div class="k">Fortitude</div><div class="v">${fmtSigned(saveTotal(p, "fort"))}</div></div>
        <div class="kv"><div class="k">Reflex</div><div class="v">${fmtSigned(saveTotal(p, "reflex"))}</div></div>
        <div class="kv"><div class="k">Will</div><div class="v">${fmtSigned(saveTotal(p, "will"))}</div></div>
      `;const skillRows=SKILLS.map(sk=>{const base=statMod(p.stats[sk.stat]);const proficiency=p.skillProficiency[sk.id]||0;const pending=draft[sk.id]||0;const total=base+proficiency+pending;const cap=skillProficiencyCap(p,sk.id);const canDec=pending>0;const canInc=available>0&&(proficiency+pending)<cap;const pendingLabel=pending>0?("+"+pending):"0";return`
          <tr>
            <td class="skillHint" data-skill-tip="${sk.id}">${sk.id}</td>
            <td class="mono">${fmtSigned(base)}</td>
            <td class="mono">${proficiency}</td>
            <td class="mono">${fmtSigned(total)}</td>
            <td>
              <div class="trainControls">
                <button class="btn ghost" data-skill="${sk.id}" data-dir="dec" ${canDec ? "" : "disabled"}>-</button>
                <span class="pendingBadge ${pending ? "active" : ""}">${pendingLabel}</span>
                <button class="btn ghost" data-skill="${sk.id}" data-dir="inc" ${canInc ? "" : "disabled"}>+</button>
              </div>
            </td>
          </tr>
        `;}).join("");const levelBanner=canLevelUp(p)?`
        <div class="levelReadyBanner">
          <div>
            <div class="levelReadyTitle">Level Up Ready</div>
            <div class="small muted" style="line-height:1.45">You have ${p.xp} XP and can advance to level ${tl + 1}! Open the level-up screen to get your next class, a +1 to your ability scores, +3 feat points, and your class' skill points for this level.</div>
          </div>
          <button class="btn primary levelReadyBtn" id="btn_open_levelup">Level Up</button>
        </div>
      `:``;return`
        <div class="grid characterGrid" style="gap:12px">

          ${levelBanner}
          
          <div class="characterTopGrid">
            <div class="panel characterPanel overviewPanel">
              <header><h2>Overview</h2><div class="hint">${cls} - Total level ${tl}</div></header>
              <div class="body">
                <div class="kv"><div class="k">Name</div><div class="v">${escapeHtml(p.name)}</div></div>
                <div class="kv"><div class="k">Title</div><div class="v">${activePlayerTitle(p) ? escapeHtml(activePlayerTitle(p)) : "—"}</div></div>
                <div class="kv"><div class="k">Race</div><div class="v">${RACES.find(r => r.id === p.raceId)?.name || "Human"}</div></div>
                <div class="kv"><div class="k">Total Level</div><div class="v">${tl}</div></div>
                <div class="kv"><div class="k">Class Levels</div><div class="v">${renderLevels(p)}</div></div>
                <div class="kv"><div class="k">Armor Class</div><div class="v">${ac}</div></div>
                <div class="kv"><div class="k">Inventory</div><div class="v">${inv.used}/${inv.max} slots <span class="muted small">(base ${inv.baseMax}${inv.bonus ? (", +" + inv.bonus + " carry") : ""})</span></div></div>
              </div>
            </div>

            <div class="panel characterPanel abilityPanel">
              <header><h2>Ability Scores</h2><div class="hint">Base scores and modifiers</div></header>
              <div class="body">${statRows}</div>
            </div>
          </div>

          <div class="panel characterPanel">
            <header><h2>Class Feats</h2><div class="hint"><span class="pill classFeatHeaderPill"><span class="muted">Available points</span> <strong class="mono">${featAvailable}</strong></span></div></header>
            <div class="body" id="character_class_feat_section">
              ${renderClassFeatGroups(p, { context: "character", visibleClassIds: ownedClassIdsInOrder(p) })}
            </div>
          </div>

          <div class="characterBottomGrid">
            <div class="panel characterPanel savePanel">
              <header><h2>Saving Throws, Status & Resistances</h2><div class="hint">Defenses and active effects</div></header>
              <div class="body">
                ${saveRows}
                <div class="small muted" style="margin:12px 0 8px">Current status effects</div>
                ${renderStatusEffectBadges(p, "- No active effects")}
                <div class="small muted" style="margin:12px 0 8px">Damage resistance</div>
                ${renderResistanceBadgeList(p, "- No active resistances")}
              </div>
            </div>
          </div>

          <div class="panel characterPanel">
            <header><h2>Skills</h2><div class="hint"><span class="pill">Skill points available: ${available}</span></div></header>
            <div class="body">
              <div class="tableWrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Skill</th><th>Base</th><th>Prof</th><th>Total</th><th>Train</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${skillRows}
                  </tbody>
                </table>
              </div>

              <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-top:10px">
                <button class="btn primary" id="btn_skill_lock" ${draftSpent > 0 ? "" : "disabled"}>Lock In Training</button>
                <div class="small muted" style="line-height:1.4">Pending points are <strong>not</strong> spent until you lock them in.</div>
              </div>

              <div class="small muted" style="margin-top:10px; line-height:1.5"></div>
            </div>
          </div>
        </div>
      `;}

  function wireCharacterTab() {
    state.ui=state.ui||{
    };
    state.ui.skillDraft=sanitizeSkillDraft(state.ui.skillDraft||{
    });
    const recalc=()=> {
      const draft=sanitizeSkillDraft(state.ui.skillDraft||{
      });
      state.ui.skillDraft=draft;
      const spent=Object.values(draft).reduce((a, b)=>a+(b||0), 0);
      const available=Math.max(0, state.player.skillPoints-spent);
      return {
        draft, spent, available
      };
    };
    document.querySelectorAll("button[data-skill]").forEach(btn=> {
      btn.addEventListener("click", ()=> {
        const skill=btn.getAttribute("data-skill");
        const dir=btn.getAttribute("data-dir");
        const recalcState=recalc();
        const draft=recalcState.draft;
        const available=recalcState.available;
        const pending=draft[skill]||0;
        const proficiency=state.player.skillProficiency[skill]||0;
        const cap=skillProficiencyCap(state.player, skill);
        if(dir==="inc") {
          if(available<=0)return;
          if((proficiency+pending)>=cap) {
            toast("You cannot raise "+skill+" above "+cap+" proficiency.", "warn");
            return;
          }
          draft[skill]=pending+1;
          render();
          return;
        }
        if(pending<=0)return;
        if(pending===1)delete draft[skill];
        else draft[skill]=pending-1;
        render();
      });
    });
    bindClassFeatUiHandlers(document.getElementById("character_class_feat_section"), "character");
    const levelBtn=document.getElementById("btn_open_levelup");
    if(levelBtn) {
      levelBtn.addEventListener("click", ()=>openLevelUpOverlay(state));
    }
    const lockBtn=document.getElementById("btn_skill_lock");
    if(lockBtn) {
      lockBtn.addEventListener("click", async()=> {
        const recalcState=recalc();
        const draft=recalcState.draft;
        const spent=recalcState.spent;
        if(spent<=0)return;
        const parts=summarizeSkillDraft(draft);
        const summary=parts.join(", ");
        const ok=await confirmDialog({
          title:"Lock in skill training?", message:"Spend "+spent+" skill point(s): "+summary, okText:"Lock In", cancelText:"Cancel"
        });
        if(!ok)return;
        const result=applySkillDraftToPlayer(state.player, draft);
        state.ui.skillDraft={
        };
        const appliedSummary=summarizeSkillDraft(result.applied).join(", ");
        if(result.spent>0) {
          log(state, "Skill training locked in: "+(appliedSummary||summary)+".");
        }
        save(state);
        render();
      });
    }
  }

  function itemTooltipHtml(it,player){const rows=[];const row=(k,v)=>`<div class="trow"><div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(v)}</div></div>`;const usesProficiency=itemUsesProficiency(it);const isProficient=usesProficiency?isProficientWithItem(player,it):true;rows.push(row("Type",it.type||"-"));if(it.category)rows.push(row("Category",it.category));if(it["Weapon type"])rows.push(row("Weapon",it["Weapon type"]));if(usesProficiency)rows.push(row("Training",isProficient?"Proficient":"Not proficient"));if(it.type==="weapon"){rows.push(row("Damage",((it.Damage||it["Damage"]||"-")+" "+(it["Damage type"]||it.damageType||"")).trim()));if(Array.isArray(it.weaponTypes)&&it.weaponTypes.length)rows.push(row("Weapon types",it.weaponTypes.map(formatDamageTypeLabel).join(", ")));if(Number(it.attackBonusItem||0)>0)rows.push(row("Attack bonus","+"+Number(it.attackBonusItem||0)));const ammoItemId=ammoItemIdForWeapon(it);if(ammoItemId)rows.push(row("Ammo",getItem(ammoItemId).name));if(Array.isArray(it.properties)&&it.properties.length)rows.push(row("Props",it.properties.map(formatPropertyLabel).join(", ")));}if(it.type==="ammo"){rows.push(row("Ammo key",it.ammoKey||"-"));rows.push(row("Bundle",String(Math.max(1,Number(it.purchaseQty||1)))));}if(it.type==="armor"){rows.push(row("AC bonus","+"+(it.acBonus||0)));const cap=dexCapFromArmor(it);rows.push(row("Dex cap",cap>=99?"-":("+"+cap)));}if(it.category==="shield"){rows.push(row("AC bonus","+"+(it.acBonus||0)));}if(it.type==="accessory"&&Number(it.carryBonus||0)>0){rows.push(row("Carry bonus","+"+it.carryBonus+" slots"));}if(typeof it.cost==="number")rows.push(row("Base cost",formatCoins(it.cost)));if(it.buyable){const buyBase=Math.max(0,Number(it.purchasePrice!=null?it.purchasePrice:it.cost||0));rows.push(row("Buy",buyBase>0?formatCoins(adjustedBuyPriceCp(player,buyBase)):"-"));}rows.push(row("Sell",canSellItem(it)?formatCoins(adjustedSellPriceCp(player,it)):"-"));return`
        <div style="font-weight:700; font-size:13px; margin-bottom:6px">${escapeHtml(it.name)}</div>
        ${usesProficiency && !isProficient ? `<div class="badgeWrap" style="margin-bottom:8px"><span class="badge bad">not proficient</span></div>` : ``}
        ${rows.join("")}
      `;}

  function renderCombatNoticeOverlay(){const notice=state&&state.ui?state.ui.combatNotice:null;if(!notice)return"";const kindClass=notice.kind==="good"?"good":notice.kind==="bad"?"bad":notice.kind==="gold"?"gold":"neutral";const items=Array.isArray(notice.items)&&notice.items.length?notice.items:["Nothing else changes."];return`
        <div class="centerOverlay">
          <div class="centerOverlayBackdrop" data-ui-action="dismiss-combat-notice"></div>
          <div class="centerCard noticeCard ${kindClass}" role="dialog" aria-modal="true" aria-labelledby="combat_notice_title">
            <div class="centerCardHeader">
              <div>
                <div class="centerCardEyebrow">Notice</div>
                <h3 class="centerCardTitle" id="combat_notice_title">${escapeHtml(notice.title || "Notice")}</h3>
              </div>
            </div>
            <div class="centerCardBody">
              <div class="centerCardSummary">${escapeHtml(notice.summary || "")}</div>
              <div class="centerCardSectionLabel">${escapeHtml(notice.sectionTitle || "Outcome")}</div>
              <div class="centerCardList">${items.map(item => `<div class="centerCardListItem">${escapeHtml(item)}</div>`).join("")}</div>
            </div>
            <div class="centerCardActions">
              <button class="btn primary" data-ui-action="dismiss-combat-notice">Dismiss</button>
            </div>
          </div>
        </div>
      `;}

  if(state) {
    ensureFeatUiState(state);
    if(state.player) {
      ensurePlayerFeatContainers(state.player);
      syncPlayerAbilityIdsForLevels(state.player);
    }
  }

  installCombatGuard();

  let resizeRenderTimer=null;

  let lastWindowWidth=window.innerWidth;

  let lastWindowHeight=window.innerHeight;

  function activeElementUsesKeyboard() {
    const active=document.activeElement;
    if(!active||!(active instanceof HTMLElement))return false;
    if(active.isContentEditable)return true;
    const tag=active.tagName;
    if(tag==="TEXTAREA"||tag==="SELECT")return true;
    if(tag!=="INPUT")return false;
    const type=String(active.getAttribute("type")||"text").toLowerCase();
    return!["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"].includes(type);
  }

  window.addEventListener("resize", ()=> {
    if(typeof activeExploreViewportRefresh==="function")activeExploreViewportRefresh();
    const width=window.innerWidth;
    const height=window.innerHeight;
    const widthChanged=width!==lastWindowWidth;
    const heightDelta=Math.abs(height-lastWindowHeight);
    const keyboardResize=!widthChanged&&heightDelta>0&&activeElementUsesKeyboard();
    const creatorViewportResize=!state.player&&!widthChanged&&heightDelta>0;
    lastWindowWidth=width;
    lastWindowHeight=height;
    if(keyboardResize||creatorViewportResize)return;
    if(resizeRenderTimer)clearTimeout(resizeRenderTimer);
    resizeRenderTimer=setTimeout(()=> {
      if(!state||!state.player||state.tab!=="explore")render();
    }, 80);
  });

  // ---------------------------------------------------------------------------
  // Feat patches and progression updates
  // ---------------------------------------------------------------------------
  function levelsGrantArmorTraining(levels, category) {
    return Object.keys(CLASSES).some(function(classId) {
      if(Number(levels&&levels[classId]||0)<=0)return false;
      const cls=CLASSES[classId];
      return!!(cls&&cls.proficiencies&&cls.proficiencies.armor&&hasTrainingFlag(cls.proficiencies.armor[category]));
    });
  }

  function hasShieldEquippedForFeat(player) {
    return!!(player&&typeof hasEquippedShield==="function"&&hasEquippedShield(player));
  }

  function shieldMasteryAcBonus(player) {
    return classFeatRankValue(player, "shield_mastery")>0&&hasShieldEquippedForFeat(player)?1:0;
  }

  function shieldMasteryResistanceBonus(entity) {
    const rank=classFeatRankValue(entity, "shield_mastery");
    if(rank<2||!hasShieldEquippedForFeat(entity))return 0;
    return rank>=3?2:1;
  }

  const BaseEvaluateClassFeatRequirements=evaluateClassFeatRequirements;

  evaluateClassFeatRequirements=function(featOrId, ctx) {
    const feat=typeof featOrId==="string"?getClassFeat(featOrId):featOrId;
    const result=BaseEvaluateClassFeatRequirements(featOrId, ctx);
    if(!feat)return result;
    const requirements=feat.requirements||{
    };
    const items=Array.isArray(result&&result.items)?result.items.slice():[];
    if(requirements.shieldProficiency) {
      const filtered=items.filter(function(item) {
        return String(item&&item.label||"")!=="No special requirements.";
      });
      filtered.push({
        ok:levelsGrantArmorTraining(ctx&&ctx.levels, "shields"), label:"Shield proficiency"
      });
      return {
        ok:filtered.every(function(item) {
          return!!item.ok;
        }), items:filtered
      };
    }
    return result;
  };

  const BaseTotalDamageResistances=totalDamageResistances;

  totalDamageResistances=function(entity) {
    const total=BaseTotalDamageResistances(entity);
    const bonus=shieldMasteryResistanceBonus(entity);
    if(bonus>0) {
      total.bludgeoning+=bonus;
      total.piercing+=bonus;
      total.slashing+=bonus;
    }
    return total;
  };

  const BaseCalcAC=calcAC;

  calcAC=function(player) {
    return Math.max(0, BaseCalcAC(player)+shieldMasteryAcBonus(player));
  };

  const BaseAbilitySpCost=abilitySpCost;

  abilitySpCost=function(player, abilityId) {
    if(isClassFeatId(abilityId)) {
      const rank=Math.max(0, Number(player&&player.classFeatRanks&&player.classFeatRanks[abilityId]||0));
      if(abilityId==="feint_strike")return rank;
      if(abilityId==="power_strike")return rank>0?(rank+1):0;
    }
    return BaseAbilitySpCost(player, abilityId);
  };

  const BaseClassFeatEffectLines=classFeatEffectLines;

  classFeatEffectLines=function(featId, rank) {
    const r=Math.max(0, Number(rank||0));
    if(featId==="shield_mastery") {
      if(r<=0)return["No ranks invested yet."];
      const lines=["While a shield is equipped: +1 AC."];
      if(r>=3)lines.push("Gain Damage Resistance to bludgeoning / piercing / slashing 2.");
      else if(r>=2)lines.push("Gain Damage Resistance to bludgeoning / piercing / slashing 1.");
      return lines;
    }
    if(featId==="feint_strike") {
      if(r<=0)return["No ranks invested yet."];
      return["SP cost: "+r+".", "Regular attack: +"+r+" to hit and damage.", "If the final attack total beats Reflex DC, the target becomes Off-Guard."];
    }
    if(featId==="power_strike") {
      if(r<=0)return["No ranks invested yet."];
      return["SP cost: "+(r+1)+".", "Regular attack: -2 to hit.", "On a hit: +"+(3+r)+" damage."];
    }
    return BaseClassFeatEffectLines(featId, rank);
  };

  const BaseClassFeatNextRankPreviewLines=classFeatNextRankPreviewLines;

  classFeatNextRankPreviewLines=function(featId, rank) {
    const current=Math.max(0, Number(rank||0));
    const next=Math.min(classFeatMaxRank(featId), current+1);
    if(next<=current)return["Already at maximum rank."];
    if(featId==="shield_mastery") {
      const currentDr=current>=3?2:current>=2?1:0;
      const nextDr=next>=3?2:next>=2?1:0;
      return["Shield AC bonus remains +1 while a shield is equipped.", "Physical resistance: "+currentDr+" -> "+nextDr+"."];
    }
    if(featId==="feint_strike") {
      return["SP cost: "+current+" -> "+next+".", "Regular attack: +"+current+" -> +"+next+" to hit and damage.", "Off-Guard still applies when the final attack total beats Reflex DC."];
    }
    if(featId==="power_strike") {
      const currentCost=current>0?current+1:0;
      const nextCost=next+1;
      const currentDmg=current>0?3+current:0;
      const nextDmg=3+next;
      return["SP cost: "+currentCost+" -> "+nextCost+".", "Attack roll modifier remains -2.", "Hit damage bonus: +"+currentDmg+" -> +"+nextDmg+"."];
    }
    return BaseClassFeatNextRankPreviewLines(featId, rank);
  };

  function featNoticeLabel(featId) {
    const classFeat=getClassFeat(featId);
    if(classFeat)return(classFeat.emoji||"*")+" "+classFeat.name;
    const skillFeat=getSkillFeat(featId);
    if(skillFeat)return(skillFeat.emoji||"*")+" "+skillFeat.name;
    return String(featId||"Feat");
  }

  function showUnlockedFeatNotice(state, featIds, sourceText) {
    const uniqueIds=[...new Set((Array.isArray(featIds)?featIds:[]).filter(Boolean))];
    if(!uniqueIds.length)return[];
    setCombatNotice(state, {
      kind:"gold", title:uniqueIds.length===1?"Feat Unlocked":"Feats Unlocked", summary:featTerminologyText(sourceText||"New feats are now available."), sectionTitle:"Available feats", items:uniqueIds.map(featNoticeLabel)
    });
    return uniqueIds;
  }

  function collectNewUnlockedClassFeatIds(beforeCtx, afterCtx) {
    const beforeUnlocked=new Set(unlockedClassFeatIds(beforeCtx));
    return unlockedClassFeatIds(afterCtx).filter(function(featId) {
      return!beforeUnlocked.has(featId);
    });
  }

  notifyNewlyUnlockedClassFeats=function(state, beforeCtx, afterCtx, sourceText) {
    const newIds=collectNewUnlockedClassFeatIds(beforeCtx, afterCtx);
    showUnlockedFeatNotice(state, newIds, sourceText||"New feats are now available.");
    return newIds;
  };

  renderClassFeatGroups = function (player, options) {
    options = options || {};
    ensurePlayerFeatContainers(player);
    const context = options.context || "character";
    const ranks = normalizeClassFeatRanks(options.ranksOverride == null ? (player && player.classFeatRanks) || {} : options.ranksOverride);
    const levels = Object.fromEntries(Object.keys(CLASSES).map(function (classId) {
      return [classId, Math.max(0, Number(options.levelsOverride && options.levelsOverride[classId] != null ? options.levelsOverride[classId] : player && player.levels && player.levels[classId] || 0))];
    }));
    const total = options.totalLevelOverride == null ? Object.values(levels).reduce(function (sum, level) {
      return sum + level;
    }, 0) : Math.max(0, Number(options.totalLevelOverride || 0));
    const visibleClassIds = Array.isArray(options.visibleClassIds) && options.visibleClassIds.length ? options.visibleClassIds.filter(function (classId) {
      return !!CLASSES[classId];
    }) : null;
    const orderedClassIds = visibleClassIds ? normalizePlayerClassOrder(player, levels, visibleClassIds) : normalizePlayerClassOrder(player, levels, options.classOrderOverride || null);
    const ctx = buildClassFeatContext(player, {
      levelsOverride: levels,
      ranksOverride: ranks,
      totalLevelOverride: total
    });
    const unlocked = new Set(unlockedClassFeatIds(ctx));
    const groups = new Map(orderedClassIds.map(function (classId) {
      return [classId, []];
    }));
    for (const featId of classFeatIds()) {
      const feat = getClassFeat(featId);
      const groupId = orderedClassIds.find(function (classId) {
        return classFeatBelongsToClass(feat, classId);
      });
      if (!groupId || !groups.has(groupId)) continue;
      if (Number(ranks[featId] || 0) <= 0 && !unlocked.has(featId)) continue;
      groups.get(groupId).push(featId);
    }
    const sections = orderedClassIds.map(function (classId) {
      const featIdsInGroup = groups.get(classId) || [];
      if (!featIdsInGroup.length) return "";
      return `
          <div class="classFeatGroup">
            <div class="classFeatGroupHeader">
              <h4>${escapeHtml(classId)}</h4>
            </div>
            <div class="classFeatGroupBody">
              <div class="classFeatGrid">
                ${featIdsInGroup.map(function (featId) {
                  const feat = getClassFeat(featId);
                  const rank = Math.max(0, Number(ranks[featId] || 0));
                  const maxRank = classFeatMaxRank(feat);
                  const btnClass = ["classFeatBtn", rank > 0 ? "invested" : "", unlocked.has(featId) ? "unlocked" : "locked"].filter(Boolean).join(" ");
                  return `
                    <button class="${btnClass}" type="button" data-feat-open="${escapeHtml(featId)}" data-feat-context="${escapeHtml(context)}" data-class-feat="${escapeHtml(featId)}" data-feat-rank="${rank}">
                      <span class="classFeatIcon">${escapeHtml(feat.emoji || "*")}</span>
                      <span class="classFeatText">
                        <span class="classFeatName">${escapeHtml(feat.name)}</span>
                        <span class="classFeatRank">(${rank}/${maxRank})</span>
                      </span>
                    </button>
                  `;
                }).join("")}
              </div>
            </div>
          </div>
        `;
    }).filter(Boolean);
    return sections.length ? `<div class="classFeatGroupList">${sections.join("")}</div>` : `<div class="classFeatEmpty">No feats are currently unlocked for your class mix.</div>`;
  };

  const BaseUseActiveAbility=useActiveAbility;

  useActiveAbility=function(state, abilityId) {
    if(abilityId==="power_strike")return usePowerStrike(state);
    if(abilityId==="feint_strike")return useFeintStrike(state);
    return BaseUseActiveAbility(state, abilityId);
  };

  function skillFeatIds() {
    return Object.keys((PF_DATA&&PF_DATA.SKILL_FEATS)||{
    });
  }

  function getSkillFeat(featId) {
    const data=(PF_DATA&&PF_DATA.SKILL_FEATS)||{
    };
    return data[featId]||null;
  }

  function skillFeatMaxRank(featOrId) {
    const feat=typeof featOrId==="string"?getSkillFeat(featOrId):featOrId;
    const raw=Number(feat&&feat.maxRank||5);
    return clamp(Number.isFinite(raw)?Math.floor(raw):5, 1, 5);
  }

  function skillFeatIdForSkill(skillId) {
    return skillFeatIds().find(function(featId) {
      const feat=getSkillFeat(featId);
      return feat&&feat.skillId===skillId;
    })||null;
  }

  function mergeSkillProficiencies(player, additions) {
    return Object.fromEntries(SKILLS.map(function(skill) {
      return[skill.id, Math.max(0, Number(player&&player.skillProficiency&&player.skillProficiency[skill.id]||0)+Math.max(0, Number(additions&&additions[skill.id]||0)))];
    }));
  }

  function rawSkillTotalFromValues(stats, skillProficiency, skillId) {
    const skill=SKILLS.find(function(entry) {
      return entry.id===skillId;
    });
    if(!skill)return 0;
    return statMod(Number(stats&&stats[skill.stat]||0))+Math.max(0, Number(skillProficiency&&skillProficiency[skillId]||0));
  }

  function skillFeatRankFromRawTotal(feat, rawTotal) {
    const required=Math.max(1, Number(feat&&feat.requiredSkillTotal||5));
    if(Number(rawTotal||0)<required)return 0;
    return clamp(Math.floor(Number(rawTotal||0)/required), 0, skillFeatMaxRank(feat));
  }

  function buildSkillFeatContext(player, options) {
    options=options||{
    };
    const stats={
    };
    for(const stat of STATS) {
      stats[stat]=Number(options.statsOverride&&options.statsOverride[stat]!=null?options.statsOverride[stat]:player&&player.stats&&player.stats[stat]||10);
    }
    const skillProficiency=Object.fromEntries(SKILLS.map(function(skill) {
      return[skill.id, Math.max(0, Number(options.skillProficiencyOverride&&options.skillProficiencyOverride[skill.id]!=null?options.skillProficiencyOverride[skill.id]:player&&player.skillProficiency&&player.skillProficiency[skill.id]||0))];
    }));
    const rawTotals={
    };
    const ranks={
    };
    for(const featId of skillFeatIds()) {
      const feat=getSkillFeat(featId);
      if(!feat)continue;
      const total=rawSkillTotalFromValues(stats, skillProficiency, feat.skillId);
      rawTotals[feat.skillId]=total;
      ranks[featId]=skillFeatRankFromRawTotal(feat, total);
    }
    return {
      player, stats, skillProficiency, rawTotals, ranks
    };
  }

  function skillFeatRankValue(playerOrCtx, featId) {
    if(!playerOrCtx)return 0;
    if(playerOrCtx.ranks&&Object.prototype.hasOwnProperty.call(playerOrCtx.ranks, featId)) {
      return Math.max(0, Number(playerOrCtx.ranks[featId]||0));
    }
    return Math.max(0, Number(buildSkillFeatContext(playerOrCtx).ranks[featId]||0));
  }

  function unlockedSkillFeatIds(ctx) {
    return skillFeatIds().filter(function(featId) {
      return skillFeatRankValue(ctx, featId)>0;
    });
  }

  function collectNewUnlockedSkillFeatIds(beforeCtx, afterCtx) {
    const beforeUnlocked=new Set(unlockedSkillFeatIds(beforeCtx));
    return unlockedSkillFeatIds(afterCtx).filter(function(featId) {
      return!beforeUnlocked.has(featId);
    });
  }

  function notifyNewlyUnlockedSkillFeats(state, beforeCtx, afterCtx, sourceText) {
    const newIds=collectNewUnlockedSkillFeatIds(beforeCtx, afterCtx);
    showUnlockedFeatNotice(state, newIds, sourceText||"New skill feats are now available.");
    return newIds;
  }

  function skillFeatSearchRadiusBonus(rankOrPlayer) {
    const rank=typeof rankOrPlayer==="number"?rankOrPlayer:skillFeatRankValue(rankOrPlayer, "skill_feat_perception_mastery");
    return rank>=1?1:0;
  }

  function skillFeatStealthRestRollCount(rankOrPlayer) {
    const rank=typeof rankOrPlayer==="number"?rankOrPlayer:skillFeatRankValue(rankOrPlayer, "skill_feat_stealth_mastery");
    return rank>=1?2:1;
  }

  function skillFeatEffectLines(featId, rank) {
    const r=Math.max(0, Number(rank||0));
    if(r<=0)return["No ranks unlocked yet."];
    if(featId==="skill_feat_acrobatics_mastery")return["Flee checks are made with advantage."];
    if(featId==="skill_feat_acrobatics_defensive_roll")return["The first time each combat you would take damage, reduce it by 1d6."];
    if(featId==="skill_feat_athletics_mastery")return["Inventory capacity: +5 slots."];
    if(featId==="skill_feat_athletics_overpower")return["Melee and unarmed attacks vs Off-Guard or Prone: +2 damage."];
    if(featId==="skill_feat_crafting_mastery")return["Critical successes on consumable crafts have a 5% chance to produce +1 extra consumable."];
    if(featId==="skill_feat_crafting_masterwork")return["Critical crafting successes retain all resource ingredients used in the recipe."];
    if(featId==="skill_feat_perception_mastery")return["Search radius: +1."];
    if(featId==="skill_feat_perception_treasure_hunter")return["Search radius: +1.", "Treasure cache coin rewards are doubled."];
    if(featId==="skill_feat_social_mastery")return["Quest rewards: +5%."];
    if(featId==="skill_feat_social_menacing_presence")return["At the start of combat, make a Social check vs Will DC.", "On a success, the enemy becomes Off-Guard."];
    if(featId==="skill_feat_stealth_mastery")return["Wilderness short-rest ambush checks roll twice and keep the best result."];
    if(featId==="skill_feat_stealth_monster_plunder")return["Monster coin loot is doubled.", "Monster item drop quantities are doubled."];
    if(featId==="skill_feat_survival_mastery")return["Successful non-ore gathers: +1 resource.", "After combat victories: recover 1 HP."];
    if(featId==="skill_feat_survival_field_dressing")return["After winning combat, recover HP equal to the enemy's level + your Wisdom modifier (minimum 1)."];
    return["The current rank improves this skill feat."];
  }

  function skillFeatTooltipHtml(featId,options){options=options||{};const feat=getSkillFeat(featId);if(!feat)return"";const player=options.playerOverride||(state&&state.player?state.player:null);const ctx=buildSkillFeatContext(player,{statsOverride:options.statsOverride||null,skillProficiencyOverride:options.skillProficiencyOverride||null});const currentRank=skillFeatRankValue(ctx,featId);const rawTotal=Number(ctx.rawTotals[feat.skillId]||0);const required=Math.max(1,Number(feat.requiredSkillTotal||5));const nextThreshold=currentRank>=skillFeatMaxRank(feat)?null:required*(currentRank+1);const row=function(k,v){return`<div class="trow"><div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(v)}</div></div>`;};const rows=[row("Source",(feat.skillId||"Skill")+" skill feat"),row("Rank",currentRank+"/"+skillFeatMaxRank(feat)),row("Requirement",feat.skillId+" "+fmtSigned(rawTotal)+" (needs +"+required+")")];if(nextThreshold!=null)rows.push(row("Next rank","+"+nextThreshold));rows.push(row("Type",(feat.kind||"passive")+" feat"));rows.push(row("Scope",Array.isArray(feat.contexts)&&feat.contexts.length?feat.contexts.join(", "):"-"));if(Array.isArray(feat.tags)&&feat.tags.length)rows.push(row("Tags",feat.tags.join(", ")));return`
        <div style="font-weight:700; font-size:13px; margin-bottom:6px">${escapeHtml((feat.emoji || "*") + " " + feat.name)}</div>
        <div class="small muted" style="margin-bottom:8px; line-height:1.45">${escapeHtml(feat.summary || "")}</div>
        ${rows.join("")}
        <div class="small muted" style="margin-top:8px; line-height:1.45">${skillFeatEffectLines(featId, currentRank).map(function (line) { return "- " + escapeHtml(line); }).join("<br/>")}</div>
        ${Array.isArray(feat.details) && feat.details.length ? `<div class="small muted" style="margin-top:8px; line-height:1.45">${feat.details.map(function (line) { return "- " + escapeHtml(line); }).join("<br/>")}</div>` : ``}
      `;}

  function renderSkillFeatGroups(player,options){options=options||{};const context=options.context||"character";const ctx=buildSkillFeatContext(player,{statsOverride:options.statsOverride||null,skillProficiencyOverride:options.skillProficiencyOverride||null});const visibleIds=SKILLS.map(function(skill){return skillFeatIdForSkill(skill.id);}).filter(Boolean).filter(function(featId){return skillFeatRankValue(ctx,featId)>0;});if(!visibleIds.length){return`<div class="classFeatEmpty">No skill feats unlocked yet.</div>`;}return`
        <div class="classFeatGrid">
          ${visibleIds.map(function (featId) {
              const feat = getSkillFeat(featId);
              const rank = skillFeatRankValue(ctx, featId);
              const maxRank = skillFeatMaxRank(feat);
              return `
              <button class="classFeatBtn invested unlocked" type="button" data-skill-feat="${escapeHtml(featId)}" data-skill-feat-context="${escapeHtml(context)}" data-skill-feat-rank="${rank}">
                <span class="classFeatIcon">${escapeHtml(feat.emoji || "*")}</span>
                <span class="classFeatText">
                  <span class="classFeatName">${escapeHtml(feat.name)}</span>
                  <span class="classFeatRank">(${rank}/${maxRank})</span>
                </span>
              </button>
            `;
          }).join("")}
        </div>
      `;}

  const BaseWireAbilityTooltips=wireAbilityTooltips;

  wireAbilityTooltips=function(scope) {
    BaseWireAbilityTooltips(scope);
    wireResolvedTooltips(scope, "[data-skill-feat]", function(el) {
      const featId=el.getAttribute("data-skill-feat")||"";
      const context=el.getAttribute("data-skill-feat-context")||"character";
      if(context==="levelup"&&state&&state.player) {
        const preview=buildLevelUpPreview(state.player, state.ui&&state.ui.levelUpDraft||{
        });
        return skillFeatTooltipHtml(featId, {
          playerOverride:state.player, statsOverride:preview.stats, skillProficiencyOverride:mergeSkillProficiencies(state.player, preview.skillTrainDraft)
        });
      }
      return skillFeatTooltipHtml(featId, {
        playerOverride:state&&state.player?state.player:null
      });
    });
  };

  const BaseSkillCheckSourceParts=skillCheckSourceParts;

  skillCheckSourceParts=function(player, skillId) {
    return BaseSkillCheckSourceParts(player, skillId);
  };

  const BaseSkillTotal=skillTotal;

  skillTotal=function(player, skillId) {
    return BaseSkillTotal(player, skillId);
  };

  const BaseCalcInventorySlots=calcInventorySlots;

  calcInventorySlots=function(player, options) {
    const result=BaseCalcInventorySlots(player, options||{
    });
    const extra=hasAbility(player, "skill_feat_athletics_mastery")?5:0;
    if(!extra)return result;
    return {
      ...result, max:Number(result.max||0)+extra, bonus:Number(result.bonus||0)+extra
    };
  };

  const BaseSocialPriceModifier=socialPriceModifier;

  socialPriceModifier=function(player) {
    return BaseSocialPriceModifier(player);
  };

  const BaseCraftRecipeDc=craftRecipeDc;

  craftRecipeDc=function(player, recipe, targetId) {
    return Math.max(0, BaseCraftRecipeDc(player, recipe, targetId||""));
  };

  const BaseResolvePlayerAttack=resolvePlayerAttack;

  resolvePlayerAttack=function(state, options) {
    return BaseResolvePlayerAttack(state, options||{
    });
  };

  gatherResource=function(state){if(state.combat||hasBlockingCenterOverlay(state))return;const tile=currentTile(state);if(!tile||tile.type!=="resource"||tile.resolved)return;if(state.player.sp.current<=0){log(state,"You are too exhausted to gather resources. (Need SP)");return;}state.player.sp.current-=1;const resId=tile.content;const res=getItem(resId);const skill=res&&res.gatherSkill?res.gatherSkill:((resId==="ore")?"Crafting":"Survival");const rollData=rollD20Detailed("gather_check",{label:skill});const skillParts=skillCheckSourceParts(state.player,skill);const bonus=skillTotal(state.player,skill);const derivedBonus=sumRollParts(skillParts);const miscPart=createRollModifierPart(bonus-derivedBonus,"status_check",skill,`${skill} modifier`);const checkParts=[...rollData.parts,...cloneRollParts(skillParts)];if(miscPart)checkParts.push(miscPart);const check=sumRollParts(checkParts);const dc=12+getArea(state.world.areaId).level*2;let qty=(check>=dc+10)?rollInt(2,3):(check>=dc)?rollInt(1,2):1;const doubled=hasAbility(state.player,"skill_survival_gatherers_bounty");if(doubled)qty*=2;const survivalBonus=resId!=="ore"&&check>=dc?skillFeatRankValue(state.player,"skill_feat_survival_mastery"):0;if(survivalBonus>0)qty+=survivalBonus;addItem(state.player,resId,qty);tile.resolved=true;log(state,`You gather ${qty}x ${res.name}.${doubled ? " Gatherer's Bounty doubles the haul." : ""}${survivalBonus > 0 ? " Survival Mastery adds extra resources." : ""}`,{rollGroups:[buildLogRollGroup({label:`${skill} gather`,parts:checkParts,total:check,targetLabel:"DC",targetValue:dc,outcome:check>=dc+10?"critical success":(check>=dc?"success":"failure")})]});advanceStatusEffectsAfterAction(state);save(state);render();};

  searchTile=function(state){if(hasBlockingCenterOverlay(state))return;const areaDef=getArea(state.world.areaId);if(!areaDef.map)return;if(state.player.sp.current<=0){log(state,"Not enough SP.");return;}state.player.sp.current-=1;const aState=state.world.areas[state.world.areaId];const baseDc=11+areaDef.level*2;const huntingBonus=hasAbility(state.player,"hunting")?2:0;const keenSearchBonus=hasAbility(state.player,"skill_perception_keen_search")?4:0;const treasureHunterRadiusBonus=(hasAbility(state.player,"skill_perception_treasure_hunter")||hasAbility(state.player,"skill_feat_perception_treasure_hunter"))?1:0;const perceptionRadiusBonus=skillFeatSearchRadiusBonus(state.player);const searchRadius=(hasAbility(state.player,"eagle_eye")?2:1)+treasureHunterRadiusBonus+perceptionRadiusBonus;const perceptionPartsBase=skillCheckSourceParts(state.player,"Perception");let checks=0;let newlyRevealed=0;const rollGroups=[];for(let dy=-searchRadius;dy<=searchRadius;dy++){for(let dx=-searchRadius;dx<=searchRadius;dx++){const x=aState.px+dx;const y=aState.py+dy;if(x<0||y<0||x>=aState.size||y>=aState.size)continue;const t=aState.tiles[y][x];const dc=baseDc+(t.terrain==="forest"?1:0);const rollData=rollD20Detailed("search_check",{label:`Tile ${x},${y}`});const parts=[...rollData.parts,...cloneRollParts(perceptionPartsBase)];const huntingPart=createRollModifierPart(huntingBonus,"hunting_bonus","Hunting","Hunting adds +2 to search checks.");const keenPart=createRollModifierPart(keenSearchBonus,"keen_search_bonus","Keen Search","Keen Search adds +4 to search checks.");if(huntingPart)parts.push(huntingPart);if(keenPart)parts.push(keenPart);const total=sumRollParts(parts);checks++;const revealedNow=!t.revealed&&(rollData.total===20||total>=dc);if(revealedNow){t.revealed=true;newlyRevealed++;}rollGroups.push(buildLogRollGroup({label:`Search tile ${x},${y}`,note:t.terrain==="forest"?"Forest tiles add +1 DC.":"",parts,total,targetLabel:"DC",targetValue:dc,outcome:revealedNow?"revealed":(total>=dc||rollData.total===20?"success":"failure")}));}}if(newlyRevealed>0){log(state,`You search nearby tiles (radius ${searchRadius}) and reveal ${newlyRevealed} new tile(s) across ${checks} check(s).`,{rollGroups});}else{log(state,`You search nearby tiles (radius ${searchRadius}) but reveal nothing new across ${checks} check(s).`,{rollGroups});}advanceStatusEffectsAfterAction(state);save(state);render();};

  shortRest=function(state){if(hasBlockingCenterOverlay(state))return;if(state.combat){log(state,"You can't rest during combat.");return;}const now=Date.now();if(now<state.cooldowns.shortRestReadyAt){const s=Math.ceil((state.cooldowns.shortRestReadyAt-now)/1000);log(state,`Short rest is on cooldown (${s}s).`);return;}const areaDef=getArea(state.world.areaId);const inTown=state.world.areaId==="town";state.cooldowns.shortRestReadyAt=now+60000;if(!inTown&&areaDef.map){const cautiousCamp=hasAbility(state.player,"skill_stealth_cautious_camp");const featRollCount=skillFeatStealthRestRollCount(state.player);const totalRolls=Math.max(cautiousCamp?2:1,featRollCount);const rawRolls=[];for(let i=0;i<totalRolls;i++)rawRolls.push(rollD20());const keptRoll=rawRolls.reduce(function(best,value){return Math.max(best,value);},0);const total=keptRoll+skillTotal(state.player,"Stealth");const dc=12+areaDef.level*2;const rollSummary=rawRolls.join("/");if(keptRoll!==20&&total<dc){log(state,`While you try to rest, you're ambushed! (Stealth ${total} vs DC ${dc}${totalRolls > 1 ? `; rolls ${rollSummary}, kept ${keptRoll}` : ``})`);const mId=areaDef.encounterPool[rollInt(0,areaDef.encounterPool.length-1)];startEncounter(state,mId);save(state);render();return;}else{log(state,`You manage to rest quietly. (Stealth ${total} vs DC ${dc}${totalRolls > 1 ? `; rolls ${rollSummary}, kept ${keptRoll}` : ``})`);}}const heal=Math.max(1,rollDice("1d8")+statMod(state.player.stats.CON));const beforeHp=state.player.hp.current;state.player.hp.current=clamp(state.player.hp.current+heal,0,state.player.hp.max);const spGain=Math.max(1,rollDice("1d6")+statMod(state.player.stats.WIS));const beforeSp=state.player.sp.current;state.player.sp.current=clamp(state.player.sp.current+spGain,0,state.player.sp.max);log(state,`You take a short rest: +${state.player.hp.current - beforeHp} HP, +${state.player.sp.current - beforeSp} SP. (Cooldown 60s)`);save(state);render();};

  const BaseApplyEncounterVictoryRewards=applyEncounterVictoryRewards;

  applyEncounterVictoryRewards=function(st,enemies){const rewards=BaseApplyEncounterVictoryRewards(st,enemies);const rank=skillFeatRankValue(st&&st.player,"skill_feat_survival_mastery");if(rank>0&&Array.isArray(enemies)&&enemies.filter(Boolean).length){const before=st.player.hp.current;st.player.hp.current=clamp(st.player.hp.current+rank,0,st.player.hp.max);const healed=st.player.hp.current-before;if(healed>0){if(Array.isArray(rewards))rewards.push(`${healed} HP recovered`);log(st,`Survival Mastery restores ${healed} HP after the fight.`);}}return rewards;};

  flee=function(state){normalizeCombatState(state);if(!state.combat||state.combat.turn!=="player")return;beginCombatToastBatch("player");const enemies=combatEnemyList(state);const highestLevel=enemies.reduce(function(best,enemy){return Math.max(best,Number(enemy.level||0));},0);const hasAdvantage=hasAbility(state.player,"skill_feat_acrobatics_mastery");const fleeRolls=hasAdvantage?[rollD20(),rollD20()]:[rollD20()];const keptRoll=fleeRolls.reduce(function(best,value){return Math.max(best,Number(value||0));},0);const parts=[{type:"dice",sourceKey:"flee_check",label:"Acrobatics",note:hasAdvantage?"Agility grants advantage on flee checks.":"",expr:hasAdvantage?"2d20kh1":"1d20",rolls:fleeRolls,value:keptRoll},...cloneRollParts(skillCheckSourceParts(state.player,"Acrobatics"))];const total=sumRollParts(parts);const dc=12+highestLevel*2;const success=keptRoll===20||total>=dc;const rollGroup=buildLogRollGroup({label:"Flee",parts,total,targetLabel:"DC",targetValue:dc,outcome:success?"success":"failure"});if(success){log(state,"You flee successfully.",{rollGroups:[rollGroup]});notifyCombatAction(`You escape from ${encounterEnemySummary(enemies)}.`,"neutral");advanceStatusEffectsAfterAction(state);flushCombatToastBatch();endCombat(state,false);}else{log(state,"You fail to flee.",{rollGroups:[rollGroup]});notifyCombatAction(`You fail to escape from ${encounterEnemySummary(enemies)}.`,"miss");advanceStatusEffectsAfterAction(state);enemyTurn(state);}save(state);render();};

  const BaseRenderClassPreview=renderClassPreview;

  renderClassPreview=function(classId,stats,selectedAbilityId){const cls=CLASSES[classId];if(!cls)return BaseRenderClassPreview(classId,stats,selectedAbilityId);const conMod=statMod(stats.CON);const wisMod=statMod(stats.WIS);const hp=Math.max(1,cls.hpPerLevel+conMod);const sp=Math.max(1,cls.spPerLevel+Math.max(0,wisMod));const weap=cls.proficiencies.weapons;const arm=cls.proficiencies.armor;const weaponList=Object.entries(weap).filter(function(entry){return hasTrainingFlag(entry[1]);}).map(function(entry){return formatDamageTypeLabel(entry[0]);}).join(", ")||"none";const armorList=Object.entries(arm).filter(function(entry){return hasTrainingFlag(entry[1]);}).map(function(entry){return formatDamageTypeLabel(entry[0]);}).join(", ")||"none";const saveLine=function(id,label){return label+" (+<span class=\"mono\">"+Number(cls.proficiencies.saves[id]||0)+"</span>)";};const snapshot=buildCreatorClassFeatSnapshot(classId,{});const ctx=buildClassFeatContext(snapshot.player,{levelsOverride:snapshot.levels,ranksOverride:snapshot.ranks,totalLevelOverride:snapshot.totalLevel});const relatedFeats=unlockedClassFeatIds(ctx).filter(function(featId){return classFeatBelongsToClass(featId,classId);});return`
        <div class="kv"><div class="k">Key Ability</div><div class="v">${cls.keyAbilities.join(" / ")}</div></div>
        <div class="kv"><div class="k">Multiclass Requirement</div><div class="v">${escapeHtml(classRequirementText(classId))}</div></div>
        <div class="kv"><div class="k">Starting Skill</div><div class="v">${cls.startingTrainedSkill} <span class="muted">(+2 proficiency)</span></div></div>
        <div class="kv"><div class="k">HP at level 1</div><div class="v">${hp}</div></div>
        <div class="kv"><div class="k">SP at level 1</div><div class="v">${sp}</div></div>
        <div class="kv"><div class="k">Saving Throws</div><div class="v">${saveLine("fort", "Fortitude")} | ${saveLine("reflex", "Reflex")} | ${saveLine("will", "Will")}</div></div>
        <div class="kv"><div class="k">Weapon Proficiency</div><div class="v">${escapeHtml(weaponList)}</div></div>
        <div class="kv"><div class="k">Armor Proficiency</div><div class="v">${escapeHtml(armorList)}</div></div>
        <div class="kv" style="align-items:flex-start"><div class="k">Feats</div><div class="v" style="max-width:420px">${relatedFeats.length ? relatedFeats.map(function (featId) { return abilityBadgeHtml(featId); }).join("") : `<span class="small muted">No feats unlocked at level 1.</span>`}</div></div>
        <div class="small muted" style="margin-top:12px; line-height:1.5">Every level a character gains <strong>3 feat points</strong>. Spend them wisely to improve your character after creation.</div>
      `;};

  levelUp=function(state, rawDraft) {
    if(!state||!state.player||!canLevelUp(state.player))return;
    const preview=buildLevelUpPreview(state.player, rawDraft||state.ui.levelUpDraft||{
    });
    if(!preview.canConfirm) {
      toast(preview.blockers[0]||"Finish your level-up choices first.", "warn");
      return;
    }
    if(!canTakeClassLevel(state.player, preview.classId, preview.stats)) {
      toast("You do not meet the requirements for "+preview.classId+".", "warn");
      return;
    }
    const player=state.player;
    const beforeFeatCtx=buildClassFeatContext(player, {
      levelsOverride:player.levels, ranksOverride:player.classFeatRanks, totalLevelOverride:totalLevel(player)
    });
    const beforeSkillCtx=buildSkillFeatContext(player);
    const beforeFeatRanks=normalizeClassFeatRanks(player.classFeatRanks||{
    });
    const nextTotalLevel=preview.nextTotalLevel;
    player.xp-=preview.xpCost;
    player.stats={
      ...preview.stats
    };
    const wasNewClass=Number(player.levels[preview.classId]||0)<=0;
    player.levels[preview.classId]=preview.newClassLevel;
    if(wasNewClass) {
      ensurePlayerClassOrder(player);
      player.classOrder=[...player.classOrder.filter(function(classId) {
        return classId!==preview.classId;
      }), preview.classId];
    }
    player.hp.max+=preview.hpGain;
    player.hp.current+=preview.hpGain;
    player.sp.max+=preview.spGain;
    player.sp.current+=preview.spGain;
    player.classFeatRanks=normalizeClassFeatRanks(preview.classFeatDraft);
    const training=applySkillTrainingWithBudget(player, preview.skillTrainDraft, preview.skillPointGain);
    if(training.remaining>0)player.skillPoints+=training.remaining;
    syncPlayerAbilityIdsForLevels(player);
    const statSummary=STATS.filter(function(stat) {
      return Number(preview.statAlloc[stat]||0)>0;
    }).map(function(stat) {
      return stat+" +"+preview.statAlloc[stat];
    }).join(", ");
    const trainedSummary=summarizeSkillDraft(training.applied).join(", ");
    const featChanges=classFeatChangeSummary(beforeFeatRanks, player.classFeatRanks);
    log(state, "Level up! "+player.name+" reaches total level "+nextTotalLevel+" by taking "+preview.classId+" "+preview.newClassLevel+" (+"+preview.hpGain+" HP, +"+preview.spGain+" SP, +"+preview.skillPointGain+" skill point"+(preview.skillPointGain===1?"":"s")+", +3 feat points).");
    if(statSummary)log(state, "Ability score increases applied: "+statSummary+".");
    if(featChanges.length) {
      log(state, "Feat ranks updated: "+featChanges.join(", ")+".");
    } else {
      log(state, "Feat points gained: +3. Unspent feat points remain available from the Character tab.");
    }
    if(training.spent>0||training.remaining>0) {
      const parts=[];
      if(training.spent>0)parts.push("locked in "+(trainedSummary||(training.spent+" skill point"+(training.spent===1?"":"s"))));
      if(training.remaining>0)parts.push(training.remaining+" unspent added to your Character tab training pool");
      log(state, "Skill training gained: "+parts.join("; ")+".");
    }
    const afterFeatCtx=buildClassFeatContext(player, {
      levelsOverride:player.levels, ranksOverride:player.classFeatRanks, totalLevelOverride:totalLevel(player)
    });
    const afterSkillCtx=buildSkillFeatContext(player);
    showUnlockedFeatNotice(state, [...collectNewUnlockedClassFeatIds(beforeFeatCtx, afterFeatCtx), ...collectNewUnlockedSkillFeatIds(beforeSkillCtx, afterSkillCtx)], "Your level-up choices unlocked new feats.");
    state.ui.levelUpOpen=false;
    state.ui.levelUpDraft={
    };
    save(state);
    render();
  };

  renderLevelUpOverlay=function(preview){const player=state.player;const selectedClass=CLASSES[preview.classId];const selectedStatId=STATS.find(function(stat){return Number(preview.statAlloc[stat]||0)>0;})||null;const levelSummaryPills=["+"+preview.hpGain+" HP","+"+preview.spGain+" SP","+"+preview.skillPointGain+" skill point"+(preview.skillPointGain===1?"":"s"),"+1 ability score","+3 feat points"];const previewSkillProficiency=mergeSkillProficiencies(player,preview.skillTrainDraft);const visibleFeatClasses=ownedClassIdsInOrder(player,preview.levels);const asiStatusText=!preview.statChoiceAvailable?"All ability scores are already at the current cap of "+STAT_LEVEL_UP_CAP+".":(selectedStatId?(fullStatName(selectedStatId)+" selected for +1 this level."):"");const asiChoiceButtons=STATS.map(function(stat){const current=Number(player.stats[stat]||0);const next=Math.min(STAT_LEVEL_UP_CAP,current+1);const selected=Number(preview.statAlloc[stat]||0)>0;const atCap=current>=STAT_LEVEL_UP_CAP;const currentMod=statMod(current);const nextMod=statMod(next);const modifierNote=(selected&&nextMod!==currentMod)?("Mod "+fmtSigned(currentMod)+" -> "+fmtSigned(nextMod)):(atCap?"Maxed":"");return`
          <button class="asiChoiceBtn ${selected ? "selected" : ""}" type="button" data-levelup-asi="${stat}" ${atCap ? "disabled" : ""}>
            <div class="asiChoiceTop">
              <span class="asiChoiceStat statHint" data-stat-tip="${stat}">${fullStatName(stat)}</span>
              <span class="asiChoiceDelta mono">${current} -> ${next}</span>
            </div>
            ${modifierNote ? `<div class="asiChoiceMeta small muted">${escapeHtml(modifierNote)}</div>` : ``}
          </button>
        `;}).join("");const skillRows=SKILLS.map(function(sk){const base=statMod(preview.stats[sk.stat]);const proficiency=player.skillProficiency[sk.id]||0;const pending=preview.skillTrainDraft[sk.id]||0;const total=base+proficiency+pending;const cap=skillProficiencyCap(player,sk.id);const canDec=pending>0;const canInc=preview.skillTrainRemaining>0&&(proficiency+pending)<cap;return`
          <tr>
            <td class="skillHint" data-skill-tip="${sk.id}">${sk.id}</td>
            <td class="mono">${fmtSigned(base)}</td>
            <td class="mono">${proficiency}</td>
            <td class="mono">${fmtSigned(total)}</td>
            <td>
              <div class="trainControls">
                <button class="btn ghost" type="button" data-levelup-skill="${sk.id}" data-dir="dec" ${canDec ? "" : "disabled"}>-</button>
                <span class="pendingBadge ${pending ? "active" : ""}">${pending > 0 ? ("+" + pending) : "0"}</span>
                <button class="btn ghost" type="button" data-levelup-skill="${sk.id}" data-dir="inc" ${canInc ? "" : "disabled"}>+</button>
              </div>
            </td>
          </tr>
        `;}).join("");const blockerText=preview.canConfirm?"Everything is ready. Confirm to level up.":preview.blockers.join(" ");return`
        <div class="levelUpOverlay" id="levelup_overlay">
          <div class="levelUpBackdrop" data-levelup-close></div>
          <div class="levelUpCard" role="dialog" aria-modal="true" aria-labelledby="levelup_title">
            <div class="levelUpHeader">
              <div>
                <div class="levelUpEyebrow">Level up available</div>
                <h2 id="levelup_title">${escapeHtml(player.name)} - Level ${preview.currentTotalLevel} -> ${preview.nextTotalLevel}</h2>
                <!--<div class="small muted" style="line-height:1.45">Choose your next class level, pick one ability score to raise by 1, spend this level's skill training, and adjust your feat points before confirming. Multiclassing uses simple stat requirements and never grants extra starting proficiencies.</div>-->
              </div>
              <button class="btn ghost" type="button" data-levelup-close>X</button>
            </div>

            <div class="levelUpSummaryGrid">
              <div class="levelUpSummaryCard"><div class="label">XP Cost</div><div class="value mono">${preview.xpCost}</div></div>
              <div class="levelUpSummaryCard"><div class="label">Class Advance</div><div class="value">${escapeHtml(preview.classId)} ${preview.currentClassLevel} -> ${preview.newClassLevel}</div></div>
              <div class="levelUpSummaryCard levelUpSummaryCardWide">
                <div class="label">This Level</div>
                <div class="value">
                  <div class="levelUpSummaryPills">
                    ${levelSummaryPills.map(function (text) { return `<span class="pill levelUpGainPill">${escapeHtml(text)}</span>`; }).join("")}
                  </div>
                </div>
              </div>
            </div>

            <div class="levelUpMainGrid">
              <div class="levelUpColumn levelUpColumnLeft">
                <div class="levelUpSection" id="levelup_class_feat_section">
                  <header>
                    <h3>Feats</h3>
                    <div class="hint">${preview.classFeatPointsAvailable} available</div>
                  </header>
                  <div class="body">
                    <div class="classFeatSummaryRow">
                      <span class="pill"><span class="muted">This level</span> <strong class="mono">+${preview.classFeatPointGain}</strong></span>
                      <span class="pill"><span class="muted">Available</span> <strong class="mono">${preview.classFeatPointsAvailable}</strong></span>
                    </div>
                    <div class="small muted" style="line-height:1.45; margin-bottom:8px">Unspent feat points stay banked if you want to save them for later.</div>
                    ${renderClassFeatGroups(player, { context: "levelup", ranksOverride: preview.classFeatDraft, levelsOverride: preview.levels, totalLevelOverride: preview.nextTotalLevel, visibleClassIds: visibleFeatClasses })}
                  </div>
                </div>

                <div class="levelUpSection" id="levelup_skill_feat_section">
                  <header>
                    <h3>Skill Feats</h3>
                    <div class="hint">Auto-unlocked by skill totals</div>
                  </header>
                  <div class="body">
                    <div class="small muted" style="line-height:1.45; margin-bottom:8px">Each skill grants a feat at +5 total modifier and improves it every +5 beyond that. This preview uses your current stat and skill-training choices for this level.</div>
                    ${renderSkillFeatGroups(player, { context: "levelup", statsOverride: preview.stats, skillProficiencyOverride: previewSkillProficiency })}
                  </div>
                </div>

                <div class="levelUpSection">
                  <header>
                    <h3>Class Choice</h3>
                    <div class="hint">First level in a class requires the listed stats.</div>
                  </header>
                  <div class="body">
                    <div class="field">
                      <!--<label for="levelup_class">Take a level in</label>-->
                      <select id="levelup_class">
                        ${Object.keys(CLASSES).map(function (cid) {
              const current = Number(player.levels[cid] || 0);
              const eligible = canTakeClassLevel(player, cid, preview.stats);
              const reqText = classRequirementText(cid);
              const levelText = current + " -> " + (current + 1);
              return `<option value="${cid}" ${cid === preview.classId ? "selected" : ""} ${eligible ? "" : "disabled"}>${escapeHtml(cid)} (${levelText})${current < 1 ? (" - Req: " + escapeHtml(reqText)) : ""}${eligible ? "" : " - Locked"}</option>`;
          }).join("")}
                      </select>
                    </div>
                    <div class="small muted" style="margin-top:10px; line-height:1.45">Requirement: <strong>${escapeHtml(preview.classRequirementText)}</strong>. This class level grants <strong>+${preview.hpGain} HP</strong>, <strong>+${preview.spGain} SP</strong>, and <strong>${preview.skillPointGain} skill point${preview.skillPointGain === 1 ? "" : "s"}</strong>.</div>
                    <div class="small muted" style="margin-top:8px; line-height:1.45">Key abilities: <strong>${escapeHtml(selectedClass.keyAbilities.join(" / "))}</strong></div>
                  </div>
                </div>
              </div>

              <div class="levelUpColumn levelUpColumnRight">
                <div class="levelUpSection">
                  <header>
                    <h3>Ability Score Increase</h3>
                    <div class="hint"><span class="pill">Choose 1 stat to increase</span></div>
                  </header>
                  <div class="body">
                    <div class="small muted" style="line-height:1.45; margin-bottom:10px">${escapeHtml(asiStatusText)}</div>
                    <div class="asiChoiceGrid">${asiChoiceButtons}</div>
                  </div>
                </div>

                <div class="levelUpSection">
                  <header>
                    <h3>Skill Training</h3>
                    <div class="hint"><span class="pill">${preview.skillTrainRemaining} point${preview.skillTrainRemaining === 1 ? "" : "s"} remaining</span></div>
                  </header>
                  <div class="body">
                    <div class="tableWrap">
                      <table class="table">
                        <thead>
                          <tr>
                            <th>Skill</th><th>Base</th><th>Prof</th><th>Total</th><th>Train</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${skillRows}
                        </tbody>
                      </table>
                    </div>
                    <div class="small muted" style="margin-top:10px; line-height:1.5">Unspent skill points are saved if you want to spend it later.</div>
                  </div>
                </div>
              </div>
            </div>

            <div class="levelUpFooter">
              <div class="small muted" style="line-height:1.45">${escapeHtml(blockerText)}</div>
              <div style="display:flex; gap:10px; flex-wrap:wrap">
                <button class="btn" type="button" data-levelup-close>Cancel</button>
                <button class="btn primary" type="button" id="btn_levelup_confirm" ${preview.canConfirm ? "" : "disabled"}>Confirm Level Up</button>
              </div>
            </div>
          </div>
        </div>
      `;};

  renderCharacterTab=function(){const p=state.player;ensurePlayerFeatContainers(p);ensureFeatUiState(state);const tl=totalLevel(p);const cls=mainClass(p);const ac=calcAC(p);const inv=calcInventorySlots(p);const featAvailable=classFeatPointsAvailable(p);const statRows=STATS.map(function(s){return`
          <div class="kv">
            <div class="k statHint" data-stat-tip="${s}">${fullStatName(s)}</div>
            <div class="v">${p.stats[s]} <span class="muted">(${fmtSigned(statMod(p.stats[s]))})</span></div>
          </div>
        `;}).join("");const draft=sanitizeSkillDraft((state.ui&&state.ui.skillDraft)?state.ui.skillDraft:{});state.ui=state.ui||{};state.ui.skillDraft={...draft};const draftSpent=Object.values(draft).reduce(function(a,b){return a+(b||0);},0);const available=Math.max(0,p.skillPoints-draftSpent);const saveRows=`
        <div class="kv"><div class="k">Fortitude</div><div class="v">${fmtSigned(saveTotal(p, "fort"))}</div></div>
        <div class="kv"><div class="k">Reflex</div><div class="v">${fmtSigned(saveTotal(p, "reflex"))}</div></div>
        <div class="kv"><div class="k">Will</div><div class="v">${fmtSigned(saveTotal(p, "will"))}</div></div>
      `;const skillRows=SKILLS.map(function(sk){const base=statMod(p.stats[sk.stat]);const proficiency=p.skillProficiency[sk.id]||0;const pending=draft[sk.id]||0;const total=base+proficiency+pending;const cap=skillProficiencyCap(p,sk.id);const canDec=pending>0;const canInc=available>0&&(proficiency+pending)<cap;const pendingLabel=pending>0?("+"+pending):"0";return`
          <tr>
            <td class="skillHint" data-skill-tip="${sk.id}">${sk.id}</td>
            <td class="mono">${fmtSigned(base)}</td>
            <td class="mono">${proficiency}</td>
            <td class="mono">${fmtSigned(total)}</td>
            <td>
              <div class="trainControls">
                <button class="btn ghost" type="button" data-skill="${sk.id}" data-dir="dec" ${canDec ? "" : "disabled"}>-</button>
                <span class="pendingBadge ${pending ? "active" : ""}">${pendingLabel}</span>
                <button class="btn ghost" type="button" data-skill="${sk.id}" data-dir="inc" ${canInc ? "" : "disabled"}>+</button>
              </div>
            </td>
          </tr>
        `;}).join("");const levelBanner=canLevelUp(p)?`
        <div class="levelReadyBanner">
          <div>
            <div class="levelReadyTitle">Level Up Ready</div>
            <div class="small muted" style="line-height:1.45">You have ${p.xp} XP and can advance to level ${tl + 1}! Open the level-up screen to get your next class, a +1 to your ability scores, +3 feat points, and your class' skill points for this level.</div>
          </div>
          <button class="btn primary levelReadyBtn" type="button" id="btn_open_levelup">Level Up</button>
        </div>
      `:``;return`
        <div class="grid characterGrid" style="gap:12px">
          ${levelBanner}

          <div class="characterTopGrid">
            <div class="panel characterPanel overviewPanel">
              <header><h2>Overview</h2><div class="hint">${cls} - Total level ${tl}</div></header>
              <div class="body">
                <div class="kv"><div class="k">Name</div><div class="v">${escapeHtml(p.name)}</div></div>
                <div class="kv"><div class="k">Race</div><div class="v">${RACES.find(function (r) { return r.id === p.raceId; }) && RACES.find(function (r) { return r.id === p.raceId; }).name || "Human"}</div></div>
                <div class="kv"><div class="k">Total Level</div><div class="v">${tl}</div></div>
                <div class="kv"><div class="k">Class Levels</div><div class="v">${renderLevels(p)}</div></div>
                <div class="kv"><div class="k">Armor Class</div><div class="v">${ac}</div></div>
                <div class="kv"><div class="k">Inventory</div><div class="v">${inv.used}/${inv.max} slots <span class="muted small">(base ${inv.baseMax}${inv.bonus ? (", +" + inv.bonus + " carry") : ""})</span></div></div>
              </div>
            </div>

            <div class="panel characterPanel abilityPanel">
              <header><h2>Ability Scores</h2><div class="hint">Base scores and modifiers</div></header>
              <div class="body">${statRows}</div>
            </div>
          </div>

          <div class="panel characterPanel">
            <header><h2>Feats</h2><div class="hint"><span class="pill classFeatHeaderPill"><span class="muted">Available points</span> <strong class="mono">${featAvailable}</strong></span></div></header>
            <div class="body" id="character_class_feat_section">
              ${renderClassFeatGroups(p, { context: "character", visibleClassIds: ownedClassIdsInOrder(p) })}
            </div>
          </div>

          <div class="panel characterPanel">
            <header><h2>Skill Feats</h2><div class="hint">Auto-scaled from your current skill totals</div></header>
            <div class="body" id="character_skill_feat_section">
              ${renderSkillFeatGroups(p, { context: "character" })}
            </div>
          </div>

          <div class="characterBottomGrid">
            <div class="panel characterPanel savePanel">
              <header><h2>Saving Throws, Status & Resistances</h2><div class="hint">Defenses and active effects</div></header>
              <div class="body">
                ${saveRows}
                <div class="small muted" style="margin:12px 0 8px">Current status effects</div>
                ${renderStatusEffectBadges(p, "- No active effects")}
                <div class="small muted" style="margin:12px 0 8px">Damage resistance</div>
                ${renderResistanceBadgeList(p, "- No active resistances")}
              </div>
            </div>
          </div>

          <div class="panel characterPanel">
            <header><h2>Skills</h2><div class="hint"><span class="pill">Skill points available: ${available}</span></div></header>
            <div class="body">
              <div class="tableWrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Skill</th><th>Base</th><th>Prof</th><th>Total</th><th>Training</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${skillRows}
                  </tbody>
                </table>
              </div>

              <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-top:10px">
                <button class="btn primary" type="button" id="btn_skill_lock" ${draftSpent > 0 ? "" : "disabled"}>Lock In Training</button>
                <div class="small muted" style="line-height:1.4">Pending points are <strong>not</strong> spent until you lock them in.</div>
              </div>
            </div>
          </div>
        </div>
      `;};

  wireCharacterTab=function() {
    state.ui=state.ui||{
    };
    state.ui.skillDraft=sanitizeSkillDraft(state.ui.skillDraft||{
    });
    const recalc=function() {
      const draft=sanitizeSkillDraft(state.ui.skillDraft||{
      });
      state.ui.skillDraft=draft;
      const spent=Object.values(draft).reduce(function(a, b) {
        return a+(b||0);
      }, 0);
      const available=Math.max(0, state.player.skillPoints-spent);
      return {
        draft, spent, available
      };
    };
    document.querySelectorAll("button[data-skill]").forEach(function(btn) {
      btn.addEventListener("click", function() {
        const skill=btn.getAttribute("data-skill");
        const dir=btn.getAttribute("data-dir");
        const recalcState=recalc();
        const draft=recalcState.draft;
        const available=recalcState.available;
        const pending=draft[skill]||0;
        const proficiency=state.player.skillProficiency[skill]||0;
        const cap=skillProficiencyCap(state.player, skill);
        if(dir==="inc") {
          if(available<=0)return;
          if((proficiency+pending)>=cap) {
            toast("You cannot raise "+skill+" above "+cap+" proficiency.", "warn");
            return;
          }
          draft[skill]=pending+1;
          render();
          return;
        }
        if(pending<=0)return;
        if(pending===1)delete draft[skill];
        else draft[skill]=pending-1;
        render();
      });
    });
    bindClassFeatUiHandlers(document.getElementById("character_class_feat_section"), "character");
    const levelBtn=document.getElementById("btn_open_levelup");
    if(levelBtn) {
      levelBtn.addEventListener("click", function() {
        openLevelUpOverlay(state);
      });
    }
    const lockBtn=document.getElementById("btn_skill_lock");
    if(lockBtn) {
      lockBtn.addEventListener("click", async function() {
        const recalcState=recalc();
        const draft=recalcState.draft;
        const spent=recalcState.spent;
        if(spent<=0)return;
        const parts=summarizeSkillDraft(draft);
        const summary=parts.join(", ");
        const ok=await confirmDialog({
          title:"Lock in skill training?", message:"Spend "+spent+" skill point(s): "+summary, okText:"Lock In", cancelText:"Cancel"
        });
        if(!ok)return;
        const beforeSkillCtx=buildSkillFeatContext(state.player);
        const result=applySkillDraftToPlayer(state.player, draft);
        state.ui.skillDraft={
        };
        const appliedSummary=summarizeSkillDraft(result.applied).join(", ");
        if(result.spent>0) {
          log(state, "Skill training locked in: "+(appliedSummary||summary)+".");
        }
        const afterSkillCtx=buildSkillFeatContext(state.player);
        notifyNewlyUnlockedSkillFeats(state, beforeSkillCtx, afterSkillCtx, "Your skill training unlocked new feats.");
        save(state);
        render();
      });
    }
  };

  const BaseRender=render;

  render=function() {
    const overlay=document.getElementById("levelup_overlay");
    const card=overlay?overlay.querySelector(".levelUpCard"):null;
    const scrollState=card?{
      top:card.scrollTop, left:card.scrollLeft
    }
    :null;
    BaseRender();
    if(scrollState&&state&&state.ui&&state.ui.levelUpOpen) {
      const nextCard=document.querySelector("#levelup_overlay .levelUpCard");
      if(nextCard) {
        nextCard.scrollTop=scrollState.top;
        nextCard.scrollLeft=scrollState.left;
      }
    }
  };

  function abilityHasRequirements(ability) {
    return!!(ability&&ability.requirements&&typeof ability.requirements==="object"&&Object.keys(ability.requirements).length);
  }

  function generalFeatIds() {
    return Object.keys((PF_DATA&&PF_DATA.GENERAL_FEATS)||{
    });
  }

  function getGeneralFeat(featId) {
    const data=(PF_DATA&&PF_DATA.GENERAL_FEATS)||{
    };
    return data[featId]||null;
  }

  function isGeneralFeatId(featId) {
    return!!getGeneralFeat(featId);
  }

  function isSkillFeatId(featId) {
    return!!getSkillFeat(featId);
  }

  function getFeatDefinition(featId) {
    return getClassFeat(featId)||getSkillFeat(featId)||getGeneralFeat(featId)||null;
  }

  function featCategoryForId(featId) {
    if(isClassFeatId(featId))return"class";
    if(isSkillFeatId(featId))return"skill";
    if(isGeneralFeatId(featId))return"general";
    return"ability";
  }

  function featName(featId) {
    const feat=getFeatDefinition(featId)||((ABILITIES&&ABILITIES[featId]&&abilityHasRequirements(ABILITIES[featId]))?ABILITIES[featId]:null);
    return feat?feat.name:String(featId||"Feat");
  }

  function generalFeatMaxRank(featOrId) {
    const feat=typeof featOrId==="string"?getGeneralFeat(featOrId):featOrId;
    const raw=Number(feat&&feat.maxRank||1);
    return clamp(Number.isFinite(raw)?Math.floor(raw):1, 1, 10);
  }

  function normalizeSkillFeatRanks(source) {
    const ranks=source&&typeof source==="object"?source:{
    };
    const normalized={
    };
    for(const featId of skillFeatIds()) {
      const max=skillFeatMaxRank(featId);
      const raw=Math.max(0, Math.floor(Number(ranks[featId]||0)));
      if(raw>0)normalized[featId]=clamp(raw, 0, max);
    }
    return normalized;
  }

  function normalizeGeneralFeatRanks(source) {
    const ranks=source&&typeof source==="object"?source:{
    };
    const normalized={
    };
    for(const featId of generalFeatIds()) {
      const max=generalFeatMaxRank(featId);
      const raw=Math.max(0, Math.floor(Number(ranks[featId]||0)));
      if(raw>0)normalized[featId]=clamp(raw, 0, max);
    }
    return normalized;
  }

  function totalFeatPointsSpentFromDrafts(rankState) {
    const classRanks=normalizeClassFeatRanks(rankState&&rankState.classRanks||{
    });
    const skillRanks=normalizeSkillFeatRanks(rankState&&rankState.skillRanks||{
    });
    const generalRanks=normalizeGeneralFeatRanks(rankState&&rankState.generalRanks||{
    });
    const sumValues=function(obj) {
      return Object.values(obj||{
      }).reduce(function(sum, value) {
        return sum+Math.max(0, Number(value||0));
      }, 0);
    };
    return sumValues(classRanks)+sumValues(skillRanks)+sumValues(generalRanks);
  }

  ensurePlayerFeatContainers=function(player) {
    if(!player||typeof player!=="object")return;
    player.classFeatRanks=normalizeClassFeatRanks(player.classFeatRanks||{
    });
    player.skillFeatRanks=normalizeSkillFeatRanks(player.skillFeatRanks||{
    });
    player.generalFeatRanks=normalizeGeneralFeatRanks(player.generalFeatRanks||{
    });
    player.questUnlocks=normalizeQuestUnlocks(player.questUnlocks);
    ensurePlayerClassOrder(player);
  };

  function buildFeatContext(player, options) {
    options=options||{
    };
    ensurePlayerFeatContainers(player);
    const levels=Object.fromEntries(Object.keys(CLASSES).map(function(classId) {
      return[classId, Math.max(0, Number(options.levelsOverride&&options.levelsOverride[classId]!=null?options.levelsOverride[classId]:player&&player.levels&&player.levels[classId]||0))];
    }));
    const total=options.totalLevelOverride==null?Object.values(levels).reduce(function(sum, level) {
      return sum+level;
    }, 0):Math.max(0, Number(options.totalLevelOverride||0));
    const stats={
    };
    for(const stat of STATS) {
      stats[stat]=Number(options.statsOverride&&options.statsOverride[stat]!=null?options.statsOverride[stat]:player&&player.stats&&player.stats[stat]||10);
    }
    const skillProficiency=Object.fromEntries(SKILLS.map(function(skill) {
      return[skill.id, Math.max(0, Number(options.skillProficiencyOverride&&options.skillProficiencyOverride[skill.id]!=null?options.skillProficiencyOverride[skill.id]:player&&player.skillProficiency&&player.skillProficiency[skill.id]||0))];
    }));
    const classRanks=normalizeClassFeatRanks(options.classFeatRanksOverride==null?(player&&player.classFeatRanks)||{
    }
    :options.classFeatRanksOverride);
    const skillRanks=normalizeSkillFeatRanks(options.skillFeatRanksOverride==null?(player&&player.skillFeatRanks)||{
    }
    :options.skillFeatRanksOverride);
    const generalRanks=normalizeGeneralFeatRanks(options.generalFeatRanksOverride==null?(player&&player.generalFeatRanks)||{
    }
    :options.generalFeatRanksOverride);
    const rawSkillTotals={
    };
    for(const skill of SKILLS) {
      rawSkillTotals[skill.id]=rawSkillTotalFromValues(stats, skillProficiency, skill.id);
    }
    return {
      player, levels, totalLevel:total, stats, skillProficiency, rawSkillTotals, rawTotals:rawSkillTotals, classRanks, skillRanks, generalRanks, ranks:{
        ...classRanks, ...skillRanks, ...generalRanks
      }, questUnlocks:new Set(normalizeQuestUnlocks(options.questUnlocksOverride!=null?options.questUnlocksOverride:(player&&player.questUnlocks)||[])), pointBudget:classFeatPointBudgetForTotal(total), pointsSpent:totalFeatPointsSpentFromDrafts({
        classRanks, skillRanks, generalRanks
      })
    };
  }

  buildClassFeatContext=function(player, options) {
    options=options||{
    };
    return buildFeatContext(player, {
      levelsOverride:options.levelsOverride||null, totalLevelOverride:options.totalLevelOverride==null?null:options.totalLevelOverride, questUnlocksOverride:options.questUnlocksOverride||null, statsOverride:options.statsOverride||null, skillProficiencyOverride:options.skillProficiencyOverride||null, classFeatRanksOverride:options.ranksOverride==null?options.classFeatRanksOverride||null:options.ranksOverride, skillFeatRanksOverride:options.skillFeatRanksOverride||null, generalFeatRanksOverride:options.generalFeatRanksOverride||null
    });
  };

  buildSkillFeatContext=function(player, options) {
    options=options||{
    };
    const ctx=buildFeatContext(player, {
      levelsOverride:options.levelsOverride||null, totalLevelOverride:options.totalLevelOverride==null?null:options.totalLevelOverride, questUnlocksOverride:options.questUnlocksOverride||null, statsOverride:options.statsOverride||null, skillProficiencyOverride:options.skillProficiencyOverride||null, classFeatRanksOverride:options.classFeatRanksOverride||null, skillFeatRanksOverride:options.ranksOverride==null?options.skillFeatRanksOverride||null:options.ranksOverride, generalFeatRanksOverride:options.generalFeatRanksOverride||null
    });
    return {
      ...ctx, ranks:{
        ...ctx.skillRanks
      }
    };
  };

  function buildGeneralFeatContext(player, options) {
    options=options||{
    };
    return buildFeatContext(player, {
      levelsOverride:options.levelsOverride||null, totalLevelOverride:options.totalLevelOverride==null?null:options.totalLevelOverride, questUnlocksOverride:options.questUnlocksOverride||null, statsOverride:options.statsOverride||null, skillProficiencyOverride:options.skillProficiencyOverride||null, classFeatRanksOverride:options.classFeatRanksOverride||null, skillFeatRanksOverride:options.skillFeatRanksOverride||null, generalFeatRanksOverride:options.ranksOverride==null?options.generalFeatRanksOverride||null:options.ranksOverride
    });
  }

  function formatFeatRequirementLabel(type, payload) {
    if(type==="classAny"||type==="classAll") {
      const parts=(Array.isArray(payload)?payload:[]).map(function(entry) {
        return entry.classId+" "+Math.max(1, Number(entry.level||1));
      });
      return parts.join(type==="classAny"?" or ":" and ");
    }
    if(type==="featRank") {
      return featName(payload.featId)+" "+Math.max(1, Number(payload.rank||1));
    }
    if(type==="quest") {
      return"Quest unlock: "+formatDamageTypeLabel(payload.questId||payload);
    }
    if(type==="skillTotal") {
      return payload.skillId+" +"+Math.max(1, Number(payload.total||1));
    }
    if(type==="totalLevel") {
      return"Total level "+Math.max(1, Number(payload.total||payload||1));
    }
    if(type==="shieldProficiency") {
      return"Shield proficiency";
    }
    return String(payload||"Requirement");
  }

  function evaluateFeatRequirements(featOrId, ctx) {
    const feat=typeof featOrId==="string"?getFeatDefinition(featOrId):featOrId;
    if(!feat)return {
      ok:false, items:[{
        ok:false, label:"Unknown feat."
      }]
    };
    const requirements=feat.requirements||{
    };
    const items=[];
    const classAny=Array.isArray(requirements.classLevelsAnyOf)?requirements.classLevelsAnyOf.filter(function(entry) {
      return entry&&entry.classId;
    }):[];
    if(classAny.length) {
      const ok=classAny.some(function(entry) {
        return Number(ctx&&ctx.levels&&ctx.levels[entry.classId]||0)>=Math.max(1, Number(entry.level||1));
      });
      items.push({
        ok, label:formatFeatRequirementLabel("classAny", classAny)
      });
    }
    const classAll=Array.isArray(requirements.classLevelsAllOf)?requirements.classLevelsAllOf.filter(function(entry) {
      return entry&&entry.classId;
    }):[];
    for(const entry of classAll) {
      const needed=Math.max(1, Number(entry.level||1));
      const ok=Number(ctx&&ctx.levels&&ctx.levels[entry.classId]||0)>=needed;
      items.push({
        ok, label:formatFeatRequirementLabel("classAll", [entry])
      });
    }
    const skillAll=Array.isArray(requirements.skillTotalsAllOf)?requirements.skillTotalsAllOf.filter(function(entry) {
      return entry&&entry.skillId;
    }):[];
    for(const entry of skillAll) {
      const needed=Math.max(1, Number(entry.total||entry.value||1));
      const ok=Number(ctx&&ctx.rawSkillTotals&&ctx.rawSkillTotals[entry.skillId]||0)>=needed;
      items.push({
        ok, label:formatFeatRequirementLabel("skillTotal", {
          skillId:entry.skillId, total:needed
        })
      });
    }
    const skillAny=Array.isArray(requirements.skillTotalsAnyOf)?requirements.skillTotalsAnyOf.filter(function(entry) {
      return entry&&entry.skillId;
    }):[];
    if(skillAny.length) {
      const ok=skillAny.some(function(entry) {
        return Number(ctx&&ctx.rawSkillTotals&&ctx.rawSkillTotals[entry.skillId]||0)>=Math.max(1, Number(entry.total||entry.value||1));
      });
      items.push({
        ok, label:skillAny.map(function(entry) {
          return formatFeatRequirementLabel("skillTotal", {
            skillId:entry.skillId, total:Math.max(1, Number(entry.total||entry.value||1))
          });
        }).join(" or ")
      });
    }
    const featRanksAll=Array.isArray(requirements.featRanksAllOf)?requirements.featRanksAllOf.filter(function(entry) {
      return entry&&entry.featId;
    }):[];
    for(const entry of featRanksAll) {
      const needed=Math.max(1, Number(entry.rank||1));
      const ok=Number(ctx&&ctx.ranks&&ctx.ranks[entry.featId]||0)>=needed;
      items.push({
        ok, label:formatFeatRequirementLabel("featRank", {
          featId:entry.featId, rank:needed
        })
      });
    }
    const featRanksAny=Array.isArray(requirements.featRanksAnyOf)?requirements.featRanksAnyOf.filter(function(entry) {
      return entry&&entry.featId;
    }):[];
    if(featRanksAny.length) {
      const ok=featRanksAny.some(function(entry) {
        return Number(ctx&&ctx.ranks&&ctx.ranks[entry.featId]||0)>=Math.max(1, Number(entry.rank||1));
      });
      items.push({
        ok, label:featRanksAny.map(function(entry) {
          return formatFeatRequirementLabel("featRank", {
            featId:entry.featId, rank:Math.max(1, Number(entry.rank||1))
          });
        }).join(" or ")
      });
    }
    const questAll=Array.isArray(requirements.questUnlocksAllOf)?requirements.questUnlocksAllOf.filter(Boolean):[];
    for(const questId of questAll) {
      const normalizedQuestId=String(questId||"").trim().toLowerCase();
      items.push({
        ok:!!(ctx&&ctx.questUnlocks&&ctx.questUnlocks.has(normalizedQuestId)), label:formatFeatRequirementLabel("quest", {
          questId
        })
      });
    }
    const questAny=Array.isArray(requirements.questUnlocksAnyOf)?requirements.questUnlocksAnyOf.filter(Boolean):[];
    if(questAny.length) {
      const ok=questAny.some(function(questId) {
        return!!(ctx&&ctx.questUnlocks&&ctx.questUnlocks.has(String(questId||"").trim().toLowerCase()));
      });
      items.push({
        ok, label:questAny.map(function(questId) {
          return formatFeatRequirementLabel("quest", {
            questId
          });
        }).join(" or ")
      });
    }
    if(requirements.totalLevelMin!=null) {
      const needed=Math.max(1, Number(requirements.totalLevelMin||1));
      const ok=Number(ctx&&ctx.totalLevel||0)>=needed;
      items.push({
        ok, label:formatFeatRequirementLabel("totalLevel", {
          total:needed
        })
      });
    }
    if(requirements.shieldProficiency) {
      items.push({
        ok:levelsGrantArmorTraining(ctx&&ctx.levels, "shields"), label:formatFeatRequirementLabel("shieldProficiency", true)
      });
    }
    if(!items.length)items.push({
      ok:true, label:"No special requirements."
    });
    return {
      ok:items.every(function(item) {
        return!!item.ok;
      }), items
    };
  }

  evaluateClassFeatRequirements=function(featOrId, ctx) {
    const feat=typeof featOrId==="string"?getClassFeat(featOrId):featOrId;
    return evaluateFeatRequirements(feat, ctx);
  };

  function evaluateSkillFeatRequirements(featOrId, ctx) {
    const feat=typeof featOrId==="string"?getSkillFeat(featOrId):featOrId;
    return evaluateFeatRequirements(feat, ctx);
  }

  function evaluateGeneralFeatRequirements(featOrId, ctx) {
    const feat=typeof featOrId==="string"?getGeneralFeat(featOrId):featOrId;
    return evaluateFeatRequirements(feat, ctx);
  }

  function invalidInvestedFeatIds(player, options) {
    options=options||{
    };
    const ctx=buildFeatContext(player, {
      levelsOverride:options.levelsOverride||null, totalLevelOverride:options.totalLevelOverride==null?null:options.totalLevelOverride, questUnlocksOverride:options.questUnlocksOverride||null, statsOverride:options.statsOverride||null, skillProficiencyOverride:options.skillProficiencyOverride||null, classFeatRanksOverride:options.classFeatRanksOverride||null, skillFeatRanksOverride:options.skillFeatRanksOverride||null, generalFeatRanksOverride:options.generalFeatRanksOverride||null
    });
    const invalid=[];
    for(const featId of classFeatIds()) {
      if(Number(ctx.classRanks[featId]||0)>0&&!evaluateClassFeatRequirements(featId, ctx).ok)invalid.push(featId);
    }
    for(const featId of skillFeatIds()) {
      if(Number(ctx.skillRanks[featId]||0)>0&&!evaluateSkillFeatRequirements(featId, ctx).ok)invalid.push(featId);
    }
    for(const featId of generalFeatIds()) {
      if(Number(ctx.generalRanks[featId]||0)>0&&!evaluateGeneralFeatRequirements(featId, ctx).ok)invalid.push(featId);
    }
    return invalid;
  }

  skillFeatRankValue=function(playerOrCtx, featId) {
    if(!playerOrCtx)return 0;
    if(playerOrCtx.skillFeatRanks)return Math.max(0, Number(playerOrCtx.skillFeatRanks[featId]||0));
    if(playerOrCtx.skillRanks)return Math.max(0, Number(playerOrCtx.skillRanks[featId]||0));
    if(playerOrCtx.ranks&&Object.prototype.hasOwnProperty.call(playerOrCtx.ranks, featId))return Math.max(0, Number(playerOrCtx.ranks[featId]||0));
    return Math.max(0, Number(buildSkillFeatContext(playerOrCtx).ranks[featId]||0));
  };

  function generalFeatRankValue(playerOrCtx, featId) {
    if(!playerOrCtx)return 0;
    if(playerOrCtx.generalFeatRanks)return Math.max(0, Number(playerOrCtx.generalFeatRanks[featId]||0));
    if(playerOrCtx.generalRanks)return Math.max(0, Number(playerOrCtx.generalRanks[featId]||0));
    if(playerOrCtx.ranks&&Object.prototype.hasOwnProperty.call(playerOrCtx.ranks, featId))return Math.max(0, Number(playerOrCtx.ranks[featId]||0));
    return Math.max(0, Number(buildGeneralFeatContext(playerOrCtx).generalRanks[featId]||0));
  }

  unlockedSkillFeatIds=function(ctx) {
    return skillFeatIds().filter(function(featId) {
      return evaluateSkillFeatRequirements(featId, ctx).ok;
    });
  };

  collectNewUnlockedSkillFeatIds=function(beforeCtx, afterCtx) {
    const beforeUnlocked=new Set(unlockedSkillFeatIds(beforeCtx));
    return unlockedSkillFeatIds(afterCtx).filter(function(featId) {
      return!beforeUnlocked.has(featId);
    });
  };

  notifyNewlyUnlockedSkillFeats=function(state, beforeCtx, afterCtx, sourceText) {
    const newIds=collectNewUnlockedSkillFeatIds(beforeCtx, afterCtx);
    showUnlockedFeatNotice(state, newIds, sourceText||"New skill feats are now available.");
    return newIds;
  };

  function unlockedGeneralFeatIds(ctx) {
    return generalFeatIds().filter(function(featId) {
      return evaluateGeneralFeatRequirements(featId, ctx).ok;
    });
  }

  function collectNewUnlockedGeneralFeatIds(beforeCtx, afterCtx) {
    const beforeUnlocked=new Set(unlockedGeneralFeatIds(beforeCtx));
    return unlockedGeneralFeatIds(afterCtx).filter(function(featId) {
      return!beforeUnlocked.has(featId);
    });
  }

  featNoticeLabel=function(featId) {
    const feat=getFeatDefinition(featId);
    return feat?((feat.emoji||"*")+" "+feat.name):String(featId||"Feat");
  };

  function featRanksState(playerOrState) {
    if(!playerOrState)return {
      classRanks:{
      }, skillRanks:{
      }, generalRanks:{
      }
    };
    ensurePlayerFeatContainers(playerOrState);
    return {
      classRanks:normalizeClassFeatRanks(playerOrState.classFeatRanks||{
      }), skillRanks:normalizeSkillFeatRanks(playerOrState.skillFeatRanks||{
      }), generalRanks:normalizeGeneralFeatRanks(playerOrState.generalFeatRanks||{
      })
    };
  }

  function featRankForState(rankState, featId) {
    const category=featCategoryForId(featId);
    if(category==="class")return Math.max(0, Number(rankState&&rankState.classRanks&&rankState.classRanks[featId]||0));
    if(category==="skill")return Math.max(0, Number(rankState&&rankState.skillRanks&&rankState.skillRanks[featId]||0));
    if(category==="general")return Math.max(0, Number(rankState&&rankState.generalRanks&&rankState.generalRanks[featId]||0));
    return 0;
  }

  function setFeatRankOnState(rankState, featId, nextRank) {
    const normalized={
      classRanks:normalizeClassFeatRanks(rankState&&rankState.classRanks||{
      }), skillRanks:normalizeSkillFeatRanks(rankState&&rankState.skillRanks||{
      }), generalRanks:normalizeGeneralFeatRanks(rankState&&rankState.generalRanks||{
      })
    };
    const category=featCategoryForId(featId);
    const key=category==="class"?"classRanks":(category==="skill"?"skillRanks":"generalRanks");
    const next={
      ...normalized[key]
    };
    if(nextRank>0)next[featId]=nextRank;
    else delete next[featId];
    normalized[key]=category==="class"?normalizeClassFeatRanks(next):(category==="skill"?normalizeSkillFeatRanks(next):normalizeGeneralFeatRanks(next));
    return normalized;
  }

  function featContextFromRankState(player, rankState, options) {
    options=options||{
    };
    return buildFeatContext(player, {
      levelsOverride:options.levelsOverride||null, totalLevelOverride:options.totalLevelOverride==null?null:options.totalLevelOverride, questUnlocksOverride:options.questUnlocksOverride||null, statsOverride:options.statsOverride||null, skillProficiencyOverride:options.skillProficiencyOverride||null, classFeatRanksOverride:rankState.classRanks, skillFeatRanksOverride:rankState.skillRanks, generalFeatRanksOverride:rankState.generalRanks
    });
  }

  function canIncreaseFeatRank(player, featId, rankState, options) {
    const current=featRankForState(rankState, featId);
    const feat=getFeatDefinition(featId);
    const max=isClassFeatId(featId)?classFeatMaxRank(feat):(isSkillFeatId(featId)?skillFeatMaxRank(feat):generalFeatMaxRank(feat));
    if(current>=max)return {
      ok:false, reason:"Already at maximum rank."
    };
    const candidate=setFeatRankOnState(rankState, featId, current+1);
    const totalLevelOverride=options&&options.totalLevelOverride!=null?options.totalLevelOverride:null;
    const budget=classFeatPointBudget(player, totalLevelOverride);
    if(totalFeatPointsSpentFromDrafts(candidate)>budget)return {
      ok:false, reason:"No feat points available."
    };
    const ctx=featContextFromRankState(player, candidate, options);
    const req=evaluateFeatRequirements(featId, ctx);
    if(!req.ok)return {
      ok:false, reason:req.items.filter(function(item) {
        return!item.ok;
      }).map(function(item) {
        return item.label;
      }).join(" | ")||"Requirements not met."
    };
    return {
      ok:true, reason:""
    };
  }

  function canDecreaseFeatRank(player, featId, rankState, options) {
    const current=featRankForState(rankState, featId);
    if(current<=0)return {
      ok:false, reason:"No rank to remove."
    };
    const candidate=setFeatRankOnState(rankState, featId, current-1);
    const invalid=invalidInvestedFeatIds(player, {
      levelsOverride:options&&options.levelsOverride||null, totalLevelOverride:options&&options.totalLevelOverride!=null?options.totalLevelOverride:null, questUnlocksOverride:options&&options.questUnlocksOverride||null, statsOverride:options&&options.statsOverride||null, skillProficiencyOverride:options&&options.skillProficiencyOverride||null, classFeatRanksOverride:candidate.classRanks, skillFeatRanksOverride:candidate.skillRanks, generalFeatRanksOverride:candidate.generalRanks
    });
    if(invalid.length) {
      return {
        ok:false, reason:"Would invalidate: "+invalid.map(featName).join(", ")+"."
      };
    }
    return {
      ok:true, reason:""
    };
  }

  function combinedFeatChangeSummary(beforeState, afterState) {
    const ids=[...new Set([...classFeatIds(), ...skillFeatIds(), ...generalFeatIds()])];
    const parts=[];
    for(const featId of ids) {
      const before=featRankForState(beforeState, featId);
      const after=featRankForState(afterState, featId);
      if(before===after)continue;
      parts.push(featName(featId)+" "+before+"->"+after);
    }
    return parts;
  }

  isKnownAbilityId=function(abilityId) {
    return!!(getFeatDefinition(abilityId)||(ABILITIES[abilityId]&&abilityHasRequirements(ABILITIES[abilityId])));
  };

  syncPlayerAbilityIdsForLevels=function(player) {
    if(!player)return[];
    ensurePlayerFeatContainers(player);
    ensurePlayerClassOrder(player);
    const rawAbilityIds=Array.isArray(player.abilityIds)?player.abilityIds.filter(Boolean):[];
    const migratedClassRanks={
      ...(player.classFeatRanks||{
      })
    };
    const migratedSkillRanks={
      ...(player.skillFeatRanks||{
      })
    };
    const migratedGeneralRanks={
      ...(player.generalFeatRanks||{
      })
    };
    for(const abilityId of rawAbilityIds) {
      if(isClassFeatId(abilityId))migratedClassRanks[abilityId]=Math.max(1, Number(migratedClassRanks[abilityId]||0));
      else if(isSkillFeatId(abilityId))migratedSkillRanks[abilityId]=Math.max(1, Number(migratedSkillRanks[abilityId]||0));
      else if(isGeneralFeatId(abilityId))migratedGeneralRanks[abilityId]=Math.max(1, Number(migratedGeneralRanks[abilityId]||0));
    }
    player.classFeatRanks=normalizeClassFeatRanks(migratedClassRanks);
    player.skillFeatRanks=normalizeSkillFeatRanks(migratedSkillRanks);
    player.generalFeatRanks=normalizeGeneralFeatRanks(migratedGeneralRanks);
    player.questUnlocks=normalizeQuestUnlocks(player.questUnlocks);
    player.abilityIds=[...new Set(rawAbilityIds.filter(function(id) {
      return!!(ABILITIES[id]&&abilityHasRequirements(ABILITIES[id])&&!isClassFeatId(id)&&!isSkillFeatId(id)&&!isGeneralFeatId(id)&&!isSkillAbilityId(id));
    }))];
    return playerAbilityIds(player);
  };

  getAbility=function(abilityId) {
    const ability=getFeatDefinition(abilityId)||ABILITIES[abilityId];
    if(!ability)throw new Error("Unknown ability: "+abilityId);
    return ability;
  };

  playerAbilityIds=function(player) {
    if(!player)return[];
    ensurePlayerFeatContainers(player);
    const classIds=classFeatIds().filter(function(featId) {
      return Number(player.classFeatRanks[featId]||0)>0;
    });
    const skillIds=skillFeatIds().filter(function(featId) {
      return Number(player.skillFeatRanks[featId]||0)>0;
    });
    const generalIds=generalFeatIds().filter(function(featId) {
      return Number(player.generalFeatRanks[featId]||0)>0;
    });
    const extraIds=Array.isArray(player.abilityIds)?[...new Set(player.abilityIds.filter(function(id) {
      return!!(ABILITIES[id]&&abilityHasRequirements(ABILITIES[id])&&!isClassFeatId(id)&&!isSkillFeatId(id)&&!isGeneralFeatId(id)&&!isSkillAbilityId(id));
    }))]:[];
    return[...classIds, ...skillIds, ...generalIds, ...extraIds];
  };

  hasAbilityUnlocked=function(player, abilityId) {
    if(isClassFeatId(abilityId))return classFeatRankValue(player, abilityId)>0;
    if(isSkillFeatId(abilityId))return skillFeatRankValue(player, abilityId)>0;
    if(isGeneralFeatId(abilityId))return generalFeatRankValue(player, abilityId)>0;
    return playerAbilityIds(player).includes(abilityId);
  };

  abilitySourceLabel=function(ability) {
    if(!ability)return"-";
    if(isClassFeatId(ability.id))return((ability.classes||[ability.classId||"Class"]).join(" / "))+" class feat";
    if(isSkillFeatId(ability.id))return(ability.skillId||"Skill")+" skill feat";
    if(isGeneralFeatId(ability.id))return"General feat";
    if(abilitySourceType(ability)==="skill")return(ability.skillId||"Skill")+" skill feat";
    return ability.classId?(ability.classId+" class feat"):"-";
  };

  abilityBadgeHtml=function(abilityId,extraClass){const ability=getAbility(abilityId);const isFeat=isClassFeatId(abilityId)||isSkillFeatId(abilityId)||isGeneralFeatId(abilityId);const label=isFeat?((ability.emoji||"*")+" "+ability.name):ability.name;return`<span class="badge abilityBadge ${escapeHtml(extraClass || "")}" data-ability="${escapeHtml(ability.id)}">${escapeHtml(label)}</span>`;};

  abilitySpCost=function(player, abilityId) {
    if(isClassFeatId(abilityId)) {
      const rank=Math.max(0, Number(player&&player.classFeatRanks&&player.classFeatRanks[abilityId]||0));
      if(abilityId==="enrage")return rank;
      if(abilityId==="second_wind")return rank;
      if(abilityId==="hunters_mark")return rank>0?1:0;
      const feat=getClassFeat(abilityId);
      return Number(feat&&feat.costSp||0);
    }
    const ability=getAbility(abilityId);
    return Number(ability&&ability.costSp||0);
  };

  function generalFeatEffectLines(featId, rank) {
    const feat=getGeneralFeat(featId);
    const r=Math.max(0, Number(rank||0));
    if(r<=0)return["No ranks invested yet."];
    const summary=abilitySummaryText(feat||{
    });
    return[summary||"This general feat is active."];
  }

  function generalFeatNextRankPreviewLines(featId, rank) {
    const feat=getGeneralFeat(featId);
    const current=Math.max(0, Number(rank||0));
    const max=generalFeatMaxRank(feat);
    if(current>=max)return["Already at maximum rank."];
    return generalFeatEffectLines(featId, current+1);
  }

  skillFeatSearchRadiusBonus=function(rankOrPlayer) {
    const rank=typeof rankOrPlayer==="number"?rankOrPlayer:skillFeatRankValue(rankOrPlayer, "skill_feat_perception_mastery");
    return rank>=1?1:0;
  };

  skillFeatStealthRestRollCount=function(rankOrPlayer) {
    const rank=typeof rankOrPlayer==="number"?rankOrPlayer:skillFeatRankValue(rankOrPlayer, "skill_feat_stealth_mastery");
    return rank>=1?2:1;
  };

  skillFeatEffectLines=function(featId, rank) {
    const r=Math.max(0, Number(rank||0));
    if(r<=0)return["No ranks invested yet."];
    if(featId==="skill_feat_acrobatics_mastery")return["Flee checks are made with advantage."];
    if(featId==="skill_feat_acrobatics_defensive_roll")return["The first time each combat you would take damage, reduce it by 1d6."];
    if(featId==="skill_feat_athletics_mastery")return["Inventory capacity: +5 slots."];
    if(featId==="skill_feat_athletics_overpower")return["Melee and unarmed attacks vs Off-Guard or Prone: +2 damage."];
    if(featId==="skill_feat_crafting_mastery")return["Critical successes on consumable crafts have a 5% chance to produce +1 extra consumable."];
    if(featId==="skill_feat_crafting_masterwork")return["Critical crafting successes retain all resource ingredients used in the recipe."];
    if(featId==="skill_feat_perception_mastery")return["Search radius: +1."];
    if(featId==="skill_feat_perception_treasure_hunter")return["Search radius: +1.", "Treasure cache coin rewards are doubled."];
    if(featId==="skill_feat_social_mastery")return["Quest rewards: +5%."];
    if(featId==="skill_feat_social_menacing_presence")return["At the start of combat, make a Social check vs Will DC.", "On a success, the enemy becomes Off-Guard."];
    if(featId==="skill_feat_stealth_mastery")return["Wilderness short-rest ambush checks roll twice and keep the best result."];
    if(featId==="skill_feat_stealth_monster_plunder")return["Monster coin loot is doubled.", "Monster item drop quantities are doubled."];
    if(featId==="skill_feat_survival_mastery")return["Successful non-ore gathers: +1 resource.", "After combat victories: recover 1 HP."];
    if(featId==="skill_feat_survival_field_dressing")return["After winning combat, recover HP equal to the enemy's level + your Wisdom modifier (minimum 1)."];
    return["The current rank improves this skill feat."];
  };

  function skillFeatNextRankPreviewLines(featId, rank) {
    const current=Math.max(0, Number(rank||0));
    const max=skillFeatMaxRank(featId);
    if(current>=max)return["Already at maximum rank."];
    return skillFeatEffectLines(featId, current+1);
  }

  function featEffectLines(featId, rank) {
    if(isClassFeatId(featId))return classFeatEffectLines(featId, rank);
    if(isSkillFeatId(featId))return skillFeatEffectLines(featId, rank);
    if(isGeneralFeatId(featId))return generalFeatEffectLines(featId, rank);
    return["No effect data available."];
  }

  function featNextRankPreviewLines(featId, rank) {
    if(isClassFeatId(featId))return classFeatNextRankPreviewLines(featId, rank);
    if(isSkillFeatId(featId))return skillFeatNextRankPreviewLines(featId, rank);
    if(isGeneralFeatId(featId))return generalFeatNextRankPreviewLines(featId, rank);
    return["The next rank improves this feat."];
  }

  skillFeatTooltipHtml=function(featId,options){options=options||{};const feat=getSkillFeat(featId);if(!feat)return"";const player=options.playerOverride||(state&&state.player?state.player:null);const ctx=buildFeatContext(player,{levelsOverride:options.levelsOverride||null,totalLevelOverride:options.totalLevelOverride==null?null:options.totalLevelOverride,statsOverride:options.statsOverride||null,skillProficiencyOverride:options.skillProficiencyOverride||null,classFeatRanksOverride:options.classFeatRanksOverride||null,skillFeatRanksOverride:options.skillFeatRanksOverride||null,generalFeatRanksOverride:options.generalFeatRanksOverride||null,questUnlocksOverride:options.questUnlocksOverride||null});const currentRank=skillFeatRankValue(ctx,featId);const req=evaluateSkillFeatRequirements(featId,ctx);const rawTotal=Number(ctx.rawSkillTotals[feat.skillId]||0);const row=function(k,v){return`<div class="trow"><div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(v)}</div></div>`;};const rows=[row("Source",(feat.skillId||"Skill")+" skill feat"),row("Rank",currentRank+"/"+skillFeatMaxRank(feat)),row("Requirement",req.items.map(function(item){return item.label;}).join(" • ")),row("Current total",feat.skillId+" "+fmtSigned(rawTotal)),row("Status",currentRank>0?"Invested":(req.ok?"Unlocked - spend 1 feat point":"Locked")),row("Type",(feat.kind||"passive")+" feat")];return`
        <div style="font-weight:700; font-size:13px; margin-bottom:6px">${escapeHtml((feat.emoji || "*") + " " + feat.name)}</div>
        <div class="small muted" style="margin-bottom:8px; line-height:1.45">${escapeHtml(feat.summary || "")}</div>
        ${rows.join("")}
        <div class="small muted" style="margin-top:8px; line-height:1.45">${(currentRank > 0 ? featEffectLines(featId, currentRank) : featNextRankPreviewLines(featId, currentRank)).map(function (line) { return "- " + escapeHtml(line); }).join("<br/>")}</div>
        ${Array.isArray(feat.details) && feat.details.length ? `<div class="small muted" style="margin-top:8px; line-height:1.45">${feat.details.map(function (line) { return "- " + escapeHtml(line); }).join("<br/>")}</div>` : ``}
      `;};

  function generalFeatTooltipHtml(featId,options){options=options||{};const feat=getGeneralFeat(featId);if(!feat)return"";const player=options.playerOverride||(state&&state.player?state.player:null);const ctx=buildFeatContext(player,{levelsOverride:options.levelsOverride||null,totalLevelOverride:options.totalLevelOverride==null?null:options.totalLevelOverride,statsOverride:options.statsOverride||null,skillProficiencyOverride:options.skillProficiencyOverride||null,classFeatRanksOverride:options.classFeatRanksOverride||null,skillFeatRanksOverride:options.skillFeatRanksOverride||null,generalFeatRanksOverride:options.generalFeatRanksOverride||null,questUnlocksOverride:options.questUnlocksOverride||null});const currentRank=generalFeatRankValue(ctx,featId);const req=evaluateGeneralFeatRequirements(featId,ctx);const row=function(k,v){return`<div class="trow"><div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(v)}</div></div>`;};const rows=[row("Source","General feat"),row("Rank",currentRank+"/"+generalFeatMaxRank(feat)),row("Requirement",req.items.map(function(item){return item.label;}).join(" • ")),row("Status",currentRank>0?"Invested":(req.ok?"Unlocked - spend feat points":"Locked")),row("Type",(feat.kind||"passive")+" feat")];return`
        <div style="font-weight:700; font-size:13px; margin-bottom:6px">${escapeHtml((feat.emoji || "*") + " " + feat.name)}</div>
        <div class="small muted" style="margin-bottom:8px; line-height:1.45">${escapeHtml(feat.summary || "")}</div>
        ${rows.join("")}
        <div class="small muted" style="margin-top:8px; line-height:1.45">${(currentRank > 0 ? featEffectLines(featId, currentRank) : featNextRankPreviewLines(featId, currentRank)).map(function (line) { return "- " + escapeHtml(line); }).join("<br/>")}</div>
        ${Array.isArray(feat.details) && feat.details.length ? `<div class="small muted" style="margin-top:8px; line-height:1.45">${feat.details.map(function (line) { return "- " + escapeHtml(line); }).join("<br/>")}</div>` : ``}
      `;}

  abilityTooltipHtml=function(abilityId){if(isClassFeatId(abilityId))return classFeatTooltipHtml(abilityId);if(isSkillFeatId(abilityId))return skillFeatTooltipHtml(abilityId);if(isGeneralFeatId(abilityId))return generalFeatTooltipHtml(abilityId);const ability=getAbility(abilityId);const rows=[];const row=function(k,v){return`<div class="trow"><div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(v)}</div></div>`;};const costLabel=Number(ability&&ability.costSp||0)>0?(String(Number(ability.costSp))+" SP"):"";const durationLabel=abilityTooltipDurationLabel(ability);rows.push(row("Source",abilitySourceLabel(ability)));if(ability.unlockLevel!=null)rows.push(row("Unlock","Level "+ability.unlockLevel));rows.push(row("Type",(ability.kind||"-")+" feat"));if(costLabel)rows.push(row("Cost",costLabel));if(durationLabel)rows.push(row("Duration",durationLabel));rows.push(row("Scope",(ability.contexts||[]).join(", ")||"-"));if(Array.isArray(ability.tags)&&ability.tags.length)rows.push(row("Tags",ability.tags.join(", ")));return`
        <div style="font-weight:700; font-size:13px; margin-bottom:6px">${escapeHtml(ability.name)}</div>
        <div class="small muted" style="margin-bottom:8px; line-height:1.45">${escapeHtml(abilityTooltipSummaryText(ability))}</div>
        ${rows.join("")}
        ${Array.isArray(ability.details) && ability.details.length ? `<div class="small muted" style="margin-top:8px; line-height:1.45">${ability.details.map(function (line) { return `- ${escapeHtml(line)}`; }).join("<br/>")}</div>` : ``}
      `;};

  function extractClassFeatSectionsHtml(groupHtml){const match=String(groupHtml||"").match(/^<div class="classFeatGroupList">([\s\S]*)<\/div>$/);return match?match[1]:"";}

  function renderSkillFeatGroupSection(player,options){options=options||{};const context=options.context||"character";const ctx=buildFeatContext(player,{levelsOverride:options.levelsOverride||null,totalLevelOverride:options.totalLevelOverride==null?null:options.totalLevelOverride,statsOverride:options.statsOverride||null,skillProficiencyOverride:options.skillProficiencyOverride||null,classFeatRanksOverride:options.classFeatRanksOverride||null,skillFeatRanksOverride:options.skillFeatRanksOverride||null,generalFeatRanksOverride:options.generalFeatRanksOverride||null,questUnlocksOverride:options.questUnlocksOverride||null});const visibleIds=skillFeatIds().filter(function(featId){return skillFeatRankValue(ctx,featId)>0||evaluateSkillFeatRequirements(featId,ctx).ok;});const body=visibleIds.length?`<div class="classFeatGrid">${visibleIds.map(function (featId) {
                  const feat = getSkillFeat(featId);
                  const rank = skillFeatRankValue(ctx, featId);
                  const maxRank = skillFeatMaxRank(feat);
                  const unlocked = evaluateSkillFeatRequirements(featId, ctx).ok;
                  const btnClass = ["classFeatBtn", rank > 0 ? "invested" : "", unlocked ? "unlocked" : "locked"].filter(Boolean).join(" ");
                  return `
              <button class="${btnClass}" type="button" data-feat-open="${escapeHtml(featId)}" data-feat-context="${escapeHtml(context)}" data-feat-rank="${rank}" data-skill-feat="${escapeHtml(featId)}" data-skill-feat-context="${escapeHtml(context)}">
                <span class="classFeatIcon">${escapeHtml(feat.emoji || "*")}</span>
                <span class="classFeatText">
                  <span class="classFeatName">${escapeHtml(feat.name)}</span>
                  <span class="classFeatRank">(${rank}/${maxRank})</span>
                </span>
              </button>
            `;
              }).join("")}</div>`:`<div class="classFeatEmpty">No skill feats unlocked yet. Reach +5 total in a skill to unlock its first feat.</div>`;return`
        <div class="classFeatGroup">
          <div class="classFeatGroupHeader"><h4>Skill</h4></div>
          <div class="classFeatGroupBody">${body}</div>
        </div>
      `;}

  function renderGeneralFeatGroupSection(player,options){options=options||{};const context=options.context||"character";const ctx=buildFeatContext(player,{levelsOverride:options.levelsOverride||null,totalLevelOverride:options.totalLevelOverride==null?null:options.totalLevelOverride,statsOverride:options.statsOverride||null,skillProficiencyOverride:options.skillProficiencyOverride||null,classFeatRanksOverride:options.classFeatRanksOverride||null,skillFeatRanksOverride:options.skillFeatRanksOverride||null,generalFeatRanksOverride:options.generalFeatRanksOverride||null,questUnlocksOverride:options.questUnlocksOverride||null});const visibleIds=generalFeatIds().filter(function(featId){return generalFeatRankValue(ctx,featId)>0||evaluateGeneralFeatRequirements(featId,ctx).ok;});const body=visibleIds.length?`<div class="classFeatGrid">${visibleIds.map(function (featId) {
                  const feat = getGeneralFeat(featId);
                  const rank = generalFeatRankValue(ctx, featId);
                  const maxRank = generalFeatMaxRank(feat);
                  const unlocked = evaluateGeneralFeatRequirements(featId, ctx).ok;
                  const btnClass = ["classFeatBtn", rank > 0 ? "invested" : "", unlocked ? "unlocked" : "locked"].filter(Boolean).join(" ");
                  return `
              <button class="${btnClass}" type="button" data-feat-open="${escapeHtml(featId)}" data-feat-context="${escapeHtml(context)}" data-feat-rank="${rank}" data-general-feat="${escapeHtml(featId)}" data-general-feat-context="${escapeHtml(context)}">
                <span class="classFeatIcon">${escapeHtml(feat.emoji || "*")}</span>
                <span class="classFeatText">
                  <span class="classFeatName">${escapeHtml(feat.name)}</span>
                  <span class="classFeatRank">(${rank}/${maxRank})</span>
                </span>
              </button>
            `;
              }).join("")}</div>`:`<div class="classFeatEmpty">No general feats available yet.</div>`;return`
        <div class="classFeatGroup">
          <div class="classFeatGroupHeader"><h4>General</h4></div>
          <div class="classFeatGroupBody">${body}</div>
        </div>
      `;}

  function renderCombinedFeatGroups(player,options){options=options||{};const classHtml=renderClassFeatGroups(player,{context:options.context||"character",ranksOverride:options.classFeatRanksOverride||null,levelsOverride:options.levelsOverride||null,totalLevelOverride:options.totalLevelOverride==null?null:options.totalLevelOverride,visibleClassIds:options.visibleClassIds||null,classOrderOverride:options.classOrderOverride||null});const sections=[extractClassFeatSectionsHtml(classHtml),renderSkillFeatGroupSection(player,options),renderGeneralFeatGroupSection(player,options)].filter(Boolean).join("");return`<div class="classFeatGroupList">${sections}</div>`;}

  function openFeatDialog(state,options){options=options||{};const featId=options.featId||"";const context=options.context||"character";const feat=getFeatDefinition(featId);const creatorSnapshot=context==="creator"?buildCreatorClassFeatSnapshot(state&&state._draft&&state._draft.classId||"Fighter",state&&state._draftClassFeat||{}):null;const player=creatorSnapshot?creatorSnapshot.player:(state&&state.player?state.player:null);if(!feat||!player)return;ensureOverlays();resetSharedModal();if(!$modal)return;const preview=context==="levelup"?buildLevelUpPreview(player,state.ui&&state.ui.levelUpDraft||{}):null;const levels=preview?{...preview.levels}:(creatorSnapshot?{...creatorSnapshot.levels}:{...player.levels});const total=preview?preview.nextTotalLevel:(creatorSnapshot?creatorSnapshot.totalLevel:totalLevel(player));const skillProficiency=preview?mergeSkillProficiencies(player,preview.skillTrainDraft):(player&&player.skillProficiency?player.skillProficiency:{});let workingRanks=preview?{classRanks:normalizeClassFeatRanks(preview.classFeatDraft||{}),skillRanks:normalizeSkillFeatRanks(preview.skillFeatDraft||{}),generalRanks:normalizeGeneralFeatRanks(preview.generalFeatDraft||{})}:(creatorSnapshot?{classRanks:normalizeClassFeatRanks((state&&state._draftClassFeat)||creatorSnapshot.ranks||{}),skillRanks:normalizeSkillFeatRanks((state&&state._draftSkillFeat)||{}),generalRanks:normalizeGeneralFeatRanks((state&&state._draftGeneralFeat)||{})}:featRanksState(player));const baseRanks={classRanks:{...workingRanks.classRanks},skillRanks:{...workingRanks.skillRanks},generalRanks:{...workingRanks.generalRanks}};const closeFns=[];const close=function(){while(closeFns.length){const fn=closeFns.pop();try{fn();}catch(_){}}resetSharedModal();};const onKey=function(event){if(event.key==="Escape"){event.preventDefault();close();}};document.addEventListener("keydown",onKey);closeFns.push(function(){document.removeEventListener("keydown",onKey);});const dialogOptions={levelsOverride:levels,totalLevelOverride:total,questUnlocksOverride:player.questUnlocks||[],statsOverride:preview?preview.stats:(player&&player.stats?player.stats:null),skillProficiencyOverride:skillProficiency};const commit=function(){if(context==="creator"){state._draftClassFeat=normalizeClassFeatRanks(workingRanks.classRanks);state._draftSkillFeat=normalizeSkillFeatRanks(workingRanks.skillRanks);state._draftGeneralFeat=normalizeGeneralFeatRanks(workingRanks.generalRanks);close();render();return;}if(context==="levelup"){const next=buildLevelUpPreview(player,{...(state.ui&&state.ui.levelUpDraft||{}),classFeatDraft:workingRanks.classRanks,skillFeatDraft:workingRanks.skillRanks,generalFeatDraft:workingRanks.generalRanks});state.ui.levelUpDraft=levelUpDraftFromPreview(next);close();render();return;}const beforeRanks=featRanksState(player);const beforeCtx=buildFeatContext(player,{levelsOverride:player.levels,totalLevelOverride:totalLevel(player),questUnlocksOverride:player.questUnlocks,statsOverride:player.stats,skillProficiencyOverride:player.skillProficiency,classFeatRanksOverride:player.classFeatRanks,skillFeatRanksOverride:player.skillFeatRanks,generalFeatRanksOverride:player.generalFeatRanks});player.classFeatRanks=normalizeClassFeatRanks(workingRanks.classRanks);player.skillFeatRanks=normalizeSkillFeatRanks(workingRanks.skillRanks);player.generalFeatRanks=normalizeGeneralFeatRanks(workingRanks.generalRanks);syncPlayerAbilityIdsForLevels(player);const afterRanks=featRanksState(player);const afterCtx=buildFeatContext(player,{levelsOverride:player.levels,totalLevelOverride:totalLevel(player),questUnlocksOverride:player.questUnlocks,statsOverride:player.stats,skillProficiencyOverride:player.skillProficiency,classFeatRanksOverride:player.classFeatRanks,skillFeatRanksOverride:player.skillFeatRanks,generalFeatRanksOverride:player.generalFeatRanks});const changes=combinedFeatChangeSummary(beforeRanks,afterRanks);if(changes.length)log(state,"Feat ranks updated: "+changes.join(", ")+".");showUnlockedFeatNotice(state,[...collectNewUnlockedClassFeatIds(beforeCtx,afterCtx),...collectNewUnlockedSkillFeatIds(beforeCtx,afterCtx),...collectNewUnlockedGeneralFeatIds(beforeCtx,afterCtx)],"New feats are now available after your feat investment.");close();save(state);render();};const renderModal=function(){const currentRank=featRankForState(workingRanks,featId);const maxRank=isClassFeatId(featId)?classFeatMaxRank(feat):(isSkillFeatId(featId)?skillFeatMaxRank(feat):generalFeatMaxRank(feat));const ctx=featContextFromRankState(player,workingRanks,dialogOptions);const req=evaluateFeatRequirements(featId,ctx);const available=Math.max(0,ctx.pointBudget-ctx.pointsSpent);const improve=canIncreaseFeatRank(player,featId,workingRanks,dialogOptions);const undo=canDecreaseFeatRank(player,featId,workingRanks,dialogOptions);const currentLines=featEffectLines(featId,currentRank);const nextLines=featNextRankPreviewLines(featId,currentRank);const reqFailures=req.items.filter(function(item){return!item.ok;});const changed=currentRank!==featRankForState(baseRanks,featId);const kindLabel=feat.kind==="active"?"Active":"Passive";const primaryActionLabel=changed?(context==="character"?"Apply":"Done"):"Done";const secondaryActionLabel=changed?"Cancel":"Close";const noteText=reqFailures.length?("Locked: "+reqFailures.map(function(item){return item.label;}).join(" • ")):(!improve.ok?improve.reason:((!undo.ok&&currentRank>0)?undo.reason:""));const noteClass=reqFailures.length?"bad":(noteText?"warn":"");$modal.className=context==="levelup"?"modal modalAboveLevelUp":"modal";$modal.innerHTML=`
          <div class="modalBackdrop" data-modal-backdrop></div>
          <div class="modalCard classFeatDialogCard" role="dialog" aria-modal="true" aria-labelledby="modal_title">
            <div class="modalHeader classFeatDialogHeader">
              <div>
                <div class="modalTitle" id="modal_title">${escapeHtml(`${feat.emoji || "*"} ${feat.name}`)}</div>
                <div class="simpleFeatRankLine small muted">Rank ${currentRank}/${maxRank} • ${escapeHtml(kindLabel)} • ${available} point${available === 1 ? "" : "s"} available</div>
              </div>
            </div>
            <div class="modalBody classFeatDialogBody">
              <!-- <div class="simpleFeatSummary">${escapeHtml(feat.summary || "")}</div> -->

              <div class="featMenuSection">
                <div class="featMenuSectionTitle">Current effect</div>
                <div class="featDetailList">${currentLines.map(function (line) { return `<div class="featDetailItem">${escapeHtml(line)}</div>`; }).join("")}</div>
              </div>

              <div class="featMenuSection">
                <div class="featMenuSectionTitle">${currentRank >= maxRank ? "Max rank" : "Next rank"}</div>
                <div class="featPreviewList">${nextLines.map(function (line) { return `<div class="featPreviewItem ${improve.ok ? "good" : "warn"}">${escapeHtml(line)}</div>`; }).join("")}</div>
              </div>

              <div class="featMenuSection">
                <div class="featMenuSectionTitle">Requirements</div>
                <div class="featReqList">${req.items.map(function (item) { return `<div class="featReqItem ${item.ok ? "good" : "bad"}">${escapeHtml((item.ok ? "OK - " : "Locked - ") + item.label)}</div>`; }).join("")}</div>
              </div>

              <!--${Array.isArray(feat.details) && feat.details.length ? `<div class="small muted simpleFeatNotes">${feat.details.map(function (line) { return escapeHtml(line); }).join("<br/>")}</div>` : ``}
              ${noteText ? `<div class="classFeatInlineNote ${noteClass}">${escapeHtml(noteText)}</div>` : ``} -->

              <div class="featDialogFooter">
                <div class="featDialogControls featDialogStepper">
                  <button class="btn" type="button" id="feat_undo" ${undo.ok ? "" : "disabled"}>-1</button>
                  <button class="btn primary" type="button" id="feat_improve" ${improve.ok ? "" : "disabled"}>+1</button>
                </div>
                <div class="featDialogControls">
                  <button class="btn" type="button" id="feat_cancel">${secondaryActionLabel}</button>
                  <button class="btn primary" type="button" id="feat_confirm">${primaryActionLabel}</button>
                </div>
              </div>
            </div>
          </div>
        `;const backdrop=$modal.querySelector("[data-modal-backdrop]");const cancelBtn=$modal.querySelector("#feat_cancel");const confirmBtn=$modal.querySelector("#feat_confirm");const improveBtn=$modal.querySelector("#feat_improve");const undoBtn=$modal.querySelector("#feat_undo");if(backdrop)backdrop.addEventListener("click",function(){close();},{once:true});if(cancelBtn)cancelBtn.addEventListener("click",function(){close();},{once:true});if(confirmBtn)confirmBtn.addEventListener("click",function(){commit();},{once:true});if(improveBtn)improveBtn.addEventListener("click",function(){workingRanks=setFeatRankOnState(workingRanks,featId,currentRank+1);renderModal();},{once:true});if(undoBtn)undoBtn.addEventListener("click",function(){workingRanks=setFeatRankOnState(workingRanks,featId,currentRank-1);renderModal();},{once:true});};renderModal();}

  const SharedFeatWireAbilityTooltips=wireAbilityTooltips;

  wireAbilityTooltips=function(scope) {
    SharedFeatWireAbilityTooltips(scope);
    wireResolvedTooltips(scope, "[data-general-feat]", function(el) {
      const featId=el.getAttribute("data-general-feat")||"";
      const context=el.getAttribute("data-general-feat-context")||"character";
      if(context==="creator") {
        const snapshot=buildCreatorClassFeatSnapshot(state&&state._draft&&state._draft.classId||"Fighter", state&&state._draftClassFeat||{
        });
        return generalFeatTooltipHtml(featId, {
          playerOverride:snapshot.player, classFeatRanksOverride:normalizeClassFeatRanks((state&&state._draftClassFeat)||snapshot.ranks||{
          }), skillFeatRanksOverride:normalizeSkillFeatRanks((state&&state._draftSkillFeat)||{
          }), generalFeatRanksOverride:normalizeGeneralFeatRanks((state&&state._draftGeneralFeat)||{
          }), levelsOverride:snapshot.levels, totalLevelOverride:snapshot.totalLevel
        });
      }
      if(context==="levelup"&&state&&state.player) {
        const preview=buildLevelUpPreview(state.player, state.ui&&state.ui.levelUpDraft||{
        });
        return generalFeatTooltipHtml(featId, {
          playerOverride:state.player, statsOverride:preview.stats, levelsOverride:preview.levels, totalLevelOverride:preview.nextTotalLevel, skillProficiencyOverride:mergeSkillProficiencies(state.player, preview.skillTrainDraft), classFeatRanksOverride:preview.classFeatDraft, skillFeatRanksOverride:preview.skillFeatDraft, generalFeatRanksOverride:preview.generalFeatDraft
        });
      }
      return generalFeatTooltipHtml(featId, {
        playerOverride:state&&state.player?state.player:null
      });
    });
  };

  bindClassFeatUiHandlers=function(scope, context) {
    if(!scope)return;
    scope.querySelectorAll("[data-feat-open]").forEach(function(btn) {
      btn.addEventListener("click", function() {
        const featId=btn.getAttribute("data-feat-open")||"";
        openFeatDialog(state, {
          featId, context:context||btn.getAttribute("data-feat-context")||"character"
        });
      });
    });
  };

  const SharedFeatBuildLevelUpPreview=buildLevelUpPreview;

  buildLevelUpPreview=function(player, rawDraft) {
    const preview=SharedFeatBuildLevelUpPreview(player, rawDraft);
    const draft=rawDraft||{
    };
    const classRanks=normalizeClassFeatRanks(draft.classFeatDraft==null?preview.classFeatDraft||{
    }
    :draft.classFeatDraft);
    const skillRanks=normalizeSkillFeatRanks(draft.skillFeatDraft==null?(player&&player.skillFeatRanks)||{
    }
    :draft.skillFeatDraft);
    const generalRanks=normalizeGeneralFeatRanks(draft.generalFeatDraft==null?(player&&player.generalFeatRanks)||{
    }
    :draft.generalFeatDraft);
    const previewSkillProficiency=mergeSkillProficiencies(player, preview.skillTrainDraft);
    const ctx=buildFeatContext(player, {
      levelsOverride:preview.levels, totalLevelOverride:preview.nextTotalLevel, questUnlocksOverride:player.questUnlocks, statsOverride:preview.stats, skillProficiencyOverride:previewSkillProficiency, classFeatRanksOverride:classRanks, skillFeatRanksOverride:skillRanks, generalFeatRanksOverride:generalRanks
    });
    const invalidIds=invalidInvestedFeatIds(player, {
      levelsOverride:preview.levels, totalLevelOverride:preview.nextTotalLevel, questUnlocksOverride:player.questUnlocks, statsOverride:preview.stats, skillProficiencyOverride:previewSkillProficiency, classFeatRanksOverride:classRanks, skillFeatRanksOverride:skillRanks, generalFeatRanksOverride:generalRanks
    });
    const blockers=(preview.blockers||[]).filter(function(text) {
      return String(text||"").indexOf("Resolve feat requirements:")!==0;
    });
    if(ctx.pointsSpent>ctx.pointBudget)blockers.push("Spend no more than your available feat points.");
    if(invalidIds.length)blockers.push("Resolve feat requirements: "+invalidIds.map(featName).join(", ")+".");
    return {
      ...preview, classFeatPointBudget:ctx.pointBudget, classFeatDraft:classRanks, skillFeatDraft:skillRanks, generalFeatDraft:generalRanks, classFeatPointsSpent:ctx.pointsSpent, classFeatPointsAvailable:Math.max(0, ctx.pointBudget-ctx.pointsSpent), classFeatInvalidIds:invalidIds.filter(isClassFeatId), skillFeatInvalidIds:invalidIds.filter(isSkillFeatId), generalFeatInvalidIds:invalidIds.filter(isGeneralFeatId), canConfirm:blockers.length===0, blockers
    };
  };

  const SharedFeatLevelUpDraftFromPreview=levelUpDraftFromPreview;

  levelUpDraftFromPreview=function(preview) {
    const draft=SharedFeatLevelUpDraftFromPreview(preview);
    draft.skillFeatDraft={
      ...(preview.skillFeatDraft||{
      })
    };
    draft.generalFeatDraft={
      ...(preview.generalFeatDraft||{
      })
    };
    return draft;
  };

  levelUp=function(state, rawDraft) {
    if(!state||!state.player||!canLevelUp(state.player))return;
    const preview=buildLevelUpPreview(state.player, rawDraft||state.ui.levelUpDraft||{
    });
    if(!preview.canConfirm) {
      toast(preview.blockers[0]||"Finish your level-up choices first.", "warn");
      return;
    }
    if(!canTakeClassLevel(state.player, preview.classId, preview.stats)) {
      toast("You do not meet the requirements for "+preview.classId+".", "warn");
      return;
    }
    const player=state.player;
    const beforeRanks=featRanksState(player);
    const beforeCtx=buildFeatContext(player, {
      levelsOverride:player.levels, totalLevelOverride:totalLevel(player), questUnlocksOverride:player.questUnlocks, statsOverride:player.stats, skillProficiencyOverride:player.skillProficiency, classFeatRanksOverride:player.classFeatRanks, skillFeatRanksOverride:player.skillFeatRanks, generalFeatRanksOverride:player.generalFeatRanks
    });
    player.xp=Math.max(0, player.xp-preview.xpCost);
    player.levels[preview.classId]=preview.newClassLevel;
    player.classOrder=normalizePlayerClassOrder(player, preview.levels, [...(Array.isArray(player.classOrder)?player.classOrder:[]), preview.classId]);
    player.stats={
      ...preview.stats
    };
    player.hp.max+=preview.hpGain;
    player.hp.current+=preview.hpGain;
    player.sp.max+=preview.spGain;
    player.sp.current+=preview.spGain;
    player.classFeatRanks=normalizeClassFeatRanks(preview.classFeatDraft);
    player.skillFeatRanks=normalizeSkillFeatRanks(preview.skillFeatDraft);
    player.generalFeatRanks=normalizeGeneralFeatRanks(preview.generalFeatDraft);
    const training=applySkillTrainingWithBudget(player, preview.skillTrainDraft, preview.skillPointGain);
    if(training.remaining>0)player.skillPoints+=training.remaining;
    syncPlayerAbilityIdsForLevels(player);
    const statSummary=STATS.filter(function(stat) {
      return Number(preview.statAlloc[stat]||0)>0;
    }).map(function(stat) {
      return stat+" +"+preview.statAlloc[stat];
    }).join(", ");
    const trainedSummary=summarizeSkillDraft(training.applied).join(", ");
    const featChanges=combinedFeatChangeSummary(beforeRanks, featRanksState(player));
    log(state, "Level up! "+player.name+" reaches total level "+preview.nextTotalLevel+" by taking "+preview.classId+" "+preview.newClassLevel+" (+"+preview.hpGain+" HP, +"+preview.spGain+" SP, +"+preview.skillPointGain+" skill point"+(preview.skillPointGain===1?"":"s")+", +3 feat points).");
    if(statSummary)log(state, "Ability score increases applied: "+statSummary+".");
    if(featChanges.length) {
      log(state, "Feat ranks updated: "+featChanges.join(", ")+".");
    } else {
      log(state, "Feat points gained: +3. Unspent feat points remain available from the Character tab.");
    }
    if(training.spent>0||training.remaining>0) {
      const parts=[];
      if(training.spent>0)parts.push("locked in "+(trainedSummary||(training.spent+" skill point"+(training.spent===1?"":"s"))));
      if(training.remaining>0)parts.push(training.remaining+" unspent added to your Character tab training pool");
      log(state, "Skill training gained: "+parts.join("; ")+".");
    }
    const afterCtx=buildFeatContext(player, {
      levelsOverride:player.levels, totalLevelOverride:totalLevel(player), questUnlocksOverride:player.questUnlocks, statsOverride:player.stats, skillProficiencyOverride:player.skillProficiency, classFeatRanksOverride:player.classFeatRanks, skillFeatRanksOverride:player.skillFeatRanks, generalFeatRanksOverride:player.generalFeatRanks
    });
    showUnlockedFeatNotice(state, [...collectNewUnlockedClassFeatIds(beforeCtx, afterCtx), ...collectNewUnlockedSkillFeatIds(beforeCtx, afterCtx), ...collectNewUnlockedGeneralFeatIds(beforeCtx, afterCtx)], "Your level-up choices unlocked new feats.");
    state.ui.levelUpOpen=false;
    state.ui.levelUpDraft={
    };
    save(state);
    render();
  };

  const SharedFeatRenderCharacterTab=renderCharacterTab;

  renderCharacterTab=function(){const html=SharedFeatRenderCharacterTab();const p=state.player;const featCtx=buildFeatContext(p,{levelsOverride:p.levels,totalLevelOverride:totalLevel(p),questUnlocksOverride:p.questUnlocks,statsOverride:p.stats,skillProficiencyOverride:p.skillProficiency,classFeatRanksOverride:p.classFeatRanks,skillFeatRanksOverride:p.skillFeatRanks,generalFeatRanksOverride:p.generalFeatRanks});const featPanel=`
          <div class="panel characterPanel">
            <header><h2>Feats</h2><div class="hint"><span class="pill classFeatHeaderPill"><span class="muted">Available points</span> <strong class="mono">${Math.max(0, featCtx.pointBudget - featCtx.pointsSpent)}</strong></span></div></header>
            <div class="body" id="character_class_feat_section">
              <div class="small muted" style="line-height:1.45; margin-bottom:8px"></div>
              ${renderCombinedFeatGroups(p, {
              context: "character",
              visibleClassIds: ownedClassIdsInOrder(p),
              levelsOverride: p.levels,
              totalLevelOverride: totalLevel(p),
              statsOverride: p.stats,
              skillProficiencyOverride: p.skillProficiency,
              classFeatRanksOverride: p.classFeatRanks,
              skillFeatRanksOverride: p.skillFeatRanks,
              generalFeatRanksOverride: p.generalFeatRanks,
              questUnlocksOverride: p.questUnlocks
          })}
            </div>
          </div>

  `;return html.replace(/<div class="panel characterPanel">\s*<header><h2>Feats<\/h2>[\s\S]*?(?=<div class="characterBottomGrid">)/,featPanel);};

  const SharedFeatRenderLevelUpOverlay=renderLevelUpOverlay;

  renderLevelUpOverlay=function(preview){const html=SharedFeatRenderLevelUpOverlay(preview);const player=state.player;const previewSkillProficiency=mergeSkillProficiencies(player,preview.skillTrainDraft);const visibleFeatClasses=ownedClassIdsInOrder(player,preview.levels);const levelUpBaseRanks=LevelUpBaseFeatState(state);const levelUpCurrentRanks={classRanks:normalizeClassFeatRanks(preview.classFeatDraft||{}),skillRanks:normalizeSkillFeatRanks(preview.skillFeatDraft||{}),generalRanks:normalizeGeneralFeatRanks(preview.generalFeatDraft||{})};const canUndoLevelUpFeatRanks=combinedFeatChangeSummary(levelUpBaseRanks,levelUpCurrentRanks).length>0;const featSection=`
                <div class="levelUpSection" id="levelup_class_feat_section">
                  <header>
                    <h3>Feats</h3>
                    <div class="hint"><span class="pill"><span class="muted">This level</span> <strong class="mono">+${preview.classFeatPointGain}</strong></span> <span class="pill">${preview.classFeatPointsAvailable} points available</span></div>
                  </header>
                  <div class="body">
                    <!-- <div class="small muted" style="line-height:1.45; margin-bottom:8px">Class feats, skill feats, and future general feats 	share the same point pool. Each skill unlocks one feat at +5 total and another at +15 total, but both still need feat points invested. Unspent feat points stay banked if you want to save them for later.</div>-->
                    ${renderCombinedFeatGroups(player, {
              context: "levelup",
              visibleClassIds: visibleFeatClasses,
              levelsOverride: preview.levels,
              totalLevelOverride: preview.nextTotalLevel,
              statsOverride: preview.stats,
              skillProficiencyOverride: previewSkillProficiency,
              classFeatRanksOverride: preview.classFeatDraft,
              skillFeatRanksOverride: preview.skillFeatDraft,
              generalFeatRanksOverride: preview.generalFeatDraft,
              questUnlocksOverride: player.questUnlocks
          })}
  				  <div class="levelUpSectionActionRow">
                      <div class="small muted" style="line-height:1.5">Unspent feat points are saved if you want to spend them later.</div>
                      <button class="btn" type="button" data-levelup-feat-undo ${canUndoLevelUpFeatRanks ? "" : "disabled"}>Undo</button>
                    </div>
                  </div>
                </div>

  `;return html.replace(/<div class="levelUpSection" id="levelup_class_feat_section">[\s\S]*?(?=<div class="levelUpSection">\s*<header>\s*<h3>Class Choice<\/h3>)/,featSection);};

  // ---------------------------------------------------------------------------
  // Weapon techniques and combat feedback
  // ---------------------------------------------------------------------------
  const WEAPON_TECHNIQUE_STYLE_BY_ABILITY=Object.freeze({
    feint_strike:"sword", blade_dance:"sword", stunning_palm:"unarmed", hundred_fists:"unarmed", hamstring_cut:"dagger", shadow_flurry:"dagger", pinning_shot:"bow", volley_fire:"bow", power_strike:"mace", concussive_blow:"mace", rending_chop:"axe", executioners_swing:"axe"
  });

  Object.assign(COMBAT_ABILITY_TARGETING, {
    blade_dance:{
      side:"enemy", mode:COMBAT_TARGETING_MODES.row
    }, stunning_palm:{
      side:"enemy", mode:COMBAT_TARGETING_MODES.single
    }, hundred_fists:{
      side:"enemy", mode:COMBAT_TARGETING_MODES.single
    }, hamstring_cut:{
      side:"enemy", mode:COMBAT_TARGETING_MODES.single
    }, shadow_flurry:{
      side:"enemy", mode:COMBAT_TARGETING_MODES.single
    }, pinning_shot:{
      side:"enemy", mode:COMBAT_TARGETING_MODES.single
    }, volley_fire:{
      side:"enemy", mode:COMBAT_TARGETING_MODES.row
    }, concussive_blow:{
      side:"enemy", mode:COMBAT_TARGETING_MODES.single
    }, rending_chop:{
      side:"enemy", mode:COMBAT_TARGETING_MODES.single
    }, executioners_swing:{
      side:"enemy", mode:COMBAT_TARGETING_MODES.single
    }
  });

  function techniqueHalfDown(rank) {
    return Math.floor(Math.max(0, Number(rank||0))/2);
  }

  function techniqueHalfUp(rank) {
    return Math.ceil(Math.max(0, Number(rank||0))/2);
  }

  function techniqueTieredCost(rank) {
    const r=Math.max(0, Number(rank||0));
    return r>0?(2+Math.floor((r-1)/2)):0;
  }

  function weaponTechniqueStyleLabel(styleId) {
    if(styleId==="unarmed")return"an unarmed stance";
    if(styleId==="bow")return"a bow with arrows";
    return"a "+String(styleId||"weapon")+" weapon";
  }

  function weaponTechniqueAttackMatches(attack, styleId) {
    if(!attack)return false;
    if(styleId==="unarmed")return Array.isArray(attack.tags)&&attack.tags.includes("unarmed");
    return!!(attack.weapon&&weaponHasType(attack.weapon, styleId));
  }

  function weaponTechniqueRequirementReason(abilityId) {
    const styleId=WEAPON_TECHNIQUE_STYLE_BY_ABILITY[abilityId];
    if(!styleId)return"You do not meet the weapon requirement for that feat.";
    if(styleId==="unarmed")return"You need to fight unarmed to use that feat.";
    if(styleId==="bow")return"You need a bow with arrows equipped in your main hand.";
    return"You need "+weaponTechniqueStyleLabel(styleId)+" equipped in your main hand.";
  }

  function weaponTechniqueAttackProfile(state, abilityId) {
    const styleId=WEAPON_TECHNIQUE_STYLE_BY_ABILITY[abilityId];
    const ap=attackProfile(state.player);
    return weaponTechniqueAttackMatches(ap, styleId)?ap:null;
  }

  function createWeaponTechniqueStatusEffect(id, name, description, {
    duration=1, tags=["Debuff"], acModifier=0, attackRollModifier=0
  }
  ={
  }) {
    return normalizeStatusEffect({
      id, templateId:id, name, description, duration, maxDuration:duration, durationMode:"turn", durationUnit:"rounds", tags, justApplied:true, modifiers:{
        acModifier, attackRollModifier, damageBonusMelee:0, resistances:{
        }
      }
    });
  }

  function applyWeaponTechniqueStatus(state, enemy, effect, message) {
    if(!state||!state.combat||!enemy||!effect)return false;
    const applied=addOrRefreshStatusEffect(enemy, effect);
    if(!applied)return false;
    log(state, message||(enemy.name+" gains "+applied.name+"."));
    notifyCombatAction(message||(enemy.name+" gains "+applied.name+"."), "buff");
    return true;
  }

  function useTechniqueRowAttack(state, abilityId, options) {
    if(state.combat)beginCombatToastBatch("player");
    const check=canUseActiveAbility(state, abilityId);
    if(!check.ok) {
      log(state, check.reason);
      return;
    }
    const selection=validateCombatTargetSelection(state, combatTargetingRuleForAbility(abilityId));
    if(!selection.ok) {
      log(state, selection.reason||"Select an enemy target first.");
      return;
    }
    const rank=classFeatRankValue(state.player, abilityId);
    const ability=getAbility(abilityId);
    const targets=Array.isArray(selection.targets)?selection.targets.slice():[];
    spendAbilitySp(state, abilityId);
    for(const info of targets) {
      if(!state.combat)break;
      const enemy=info&&info.entity||null;
      if(!enemy||!isCombatEnemyAlive(enemy))continue;
      const ap=weaponTechniqueAttackProfile(state, abilityId);
      if(!ap) {
        log(state, weaponTechniqueRequirementReason(abilityId));
        break;
      }
      const built=typeof options==="function"?(options(rank, enemy)||{
      }):(options||{
      });
      resolvePlayerAttack(state, {
        prefix:(ability.name||"Technique")+": ", attack:ap, target:enemy, attackBonusModifier:Number(built.attackBonusModifier||0), extraDamageOnHit:Number(built.extraDamageOnHit||0), attackBonusSourceKey:abilityId, attackBonusSourceLabel:ability.name, extraDamageSourceKey:abilityId, extraDamageSourceLabel:ability.name
      });
    }
    finishPlayerAbilityUse(state);
  }

  function useFeintStrike(state) {
    if(state.combat)beginCombatToastBatch("player");
    const check=canUseActiveAbility(state, "feint_strike");
    if(!check.ok) {
      log(state, check.reason);
      return;
    }
    const enemy=preferredCombatEnemy(state);
    if(!enemy) {
      log(state, "Select an enemy target first.");
      return;
    }
    const ap=weaponTechniqueAttackProfile(state, "feint_strike");
    if(!ap) {
      log(state, weaponTechniqueRequirementReason("feint_strike"));
      return;
    }
    const rank=classFeatRankValue(state.player, "feint_strike");
    spendAbilitySp(state, "feint_strike");
    const result=resolvePlayerAttack(state, {
      prefix:"Feint Strike: ", attack:ap, target:enemy, attackBonusModifier:rank, extraDamageOnHit:rank, attackBonusSourceKey:"feint_strike", attackBonusSourceLabel:"Feint Strike", extraDamageSourceKey:"feint_strike", extraDamageSourceLabel:"Feint Strike"
    });
    const reflexDc=creatureSaveDc(enemy, "reflex");
    if(result&&Number(result.total||0)>reflexDc&&enemy&&enemy.hp&&enemy.hp.current>0) {
      applyWeaponTechniqueStatus(state, enemy, createStatusEffect("off_guard"), enemy.name+" becomes Off-Guard from Feint Strike.");
    }
    finishPlayerAbilityUse(state);
  }

  function useBladeDance(state) {
    useTechniqueRowAttack(state, "blade_dance", function(rank) {
      return {
        attackBonusModifier:techniqueHalfDown(rank), extraDamageOnHit:rank
      };
    });
  }

  function useStunningPalm(state) {
    if(state.combat)beginCombatToastBatch("player");
    const check=canUseActiveAbility(state, "stunning_palm");
    if(!check.ok) {
      log(state, check.reason);
      return;
    }
    const enemy=preferredCombatEnemy(state);
    if(!enemy) {
      log(state, "Select an enemy target first.");
      return;
    }
    const ap=weaponTechniqueAttackProfile(state, "stunning_palm");
    if(!ap) {
      log(state, weaponTechniqueRequirementReason("stunning_palm"));
      return;
    }
    const rank=classFeatRankValue(state.player, "stunning_palm");
    spendAbilitySp(state, "stunning_palm");
    const result=resolvePlayerAttack(state, {
      prefix:"Stunning Palm: ", attack:ap, target:enemy, attackBonusModifier:rank, attackBonusSourceKey:"stunning_palm", attackBonusSourceLabel:"Stunning Palm"
    });
    const fortDc=creatureSaveDc(enemy, "fort");
    if(result&&result.hit&&Number(result.total||0)>=fortDc&&enemy&&enemy.hp&&enemy.hp.current>0) {
      const attackPenalty=techniqueHalfUp(rank);
      applyWeaponTechniqueStatus(state, enemy, createWeaponTechniqueStatusEffect("stunning_palm_staggered", "Staggered", "Staggered by Stunning Palm for 1 round: -1 AC and -"+attackPenalty+" to attack rolls.", {
        duration:1, tags:["Debuff", "Stagger"], acModifier:-1, attackRollModifier:-attackPenalty
      }), enemy.name+" is staggered by Stunning Palm.");
    }
    finishPlayerAbilityUse(state);
  }

  function useHundredFists(state) {
    if(state.combat)beginCombatToastBatch("player");
    const check=canUseActiveAbility(state, "hundred_fists");
    if(!check.ok) {
      log(state, check.reason);
      return;
    }
    const enemy=preferredCombatEnemy(state);
    if(!enemy) {
      log(state, "Select an enemy target first.");
      return;
    }
    const rank=classFeatRankValue(state.player, "hundred_fists");
    spendAbilitySp(state, "hundred_fists");
    let ap=weaponTechniqueAttackProfile(state, "hundred_fists");
    if(!ap) {
      log(state, weaponTechniqueRequirementReason("hundred_fists"));
      return;
    }
    const first=resolvePlayerAttack(state, {
      prefix:"Hundred Fists: ", attack:ap, target:enemy, attackBonusModifier:techniqueHalfDown(rank), attackBonusSourceKey:"hundred_fists", attackBonusSourceLabel:"Hundred Fists"
    });
    if(state.combat&&enemy&&enemy.hp&&enemy.hp.current>0) {
      ap=weaponTechniqueAttackProfile(state, "hundred_fists");
      if(ap) {
        resolvePlayerAttack(state, {
          prefix:"Hundred Fists: ", attack:ap, target:enemy, attackBonusModifier:techniqueHalfDown(rank), extraDamageOnHit:first&&first.hit?rank:0, attackBonusSourceKey:"hundred_fists", attackBonusSourceLabel:"Hundred Fists", extraDamageSourceKey:"hundred_fists", extraDamageSourceLabel:"Hundred Fists"
        });
      }
    }
    finishPlayerAbilityUse(state);
  }

  function useHamstringCut(state) {
    if(state.combat)beginCombatToastBatch("player");
    const check=canUseActiveAbility(state, "hamstring_cut");
    if(!check.ok) {
      log(state, check.reason);
      return;
    }
    const enemy=preferredCombatEnemy(state);
    if(!enemy) {
      log(state, "Select an enemy target first.");
      return;
    }
    const ap=weaponTechniqueAttackProfile(state, "hamstring_cut");
    if(!ap) {
      log(state, weaponTechniqueRequirementReason("hamstring_cut"));
      return;
    }
    const rank=classFeatRankValue(state.player, "hamstring_cut");
    spendAbilitySp(state, "hamstring_cut");
    const result=resolvePlayerAttack(state, {
      prefix:"Hamstring Cut: ", attack:ap, target:enemy, attackBonusModifier:rank, attackBonusSourceKey:"hamstring_cut", attackBonusSourceLabel:"Hamstring Cut"
    });
    if(result&&result.hit&&enemy&&enemy.hp&&enemy.hp.current>0) {
      applyWeaponTechniqueStatus(state, enemy, createBleedStatusEffect(rank, 2), enemy.name+" begins bleeding from Hamstring Cut.");
      if(Number(result.total||0)>=creatureSaveDc(enemy, "reflex")) {
        applyWeaponTechniqueStatus(state, enemy, createStatusEffect("off_guard"), enemy.name+" becomes Off-Guard from Hamstring Cut.");
      }
    }
    finishPlayerAbilityUse(state);
  }

  function useShadowFlurry(state) {
    if(state.combat)beginCombatToastBatch("player");
    const check=canUseActiveAbility(state, "shadow_flurry");
    if(!check.ok) {
      log(state, check.reason);
      return;
    }
    const enemy=preferredCombatEnemy(state);
    if(!enemy) {
      log(state, "Select an enemy target first.");
      return;
    }
    const rank=classFeatRankValue(state.player, "shadow_flurry");
    spendAbilitySp(state, "shadow_flurry");
    let ap=weaponTechniqueAttackProfile(state, "shadow_flurry");
    if(!ap) {
      log(state, weaponTechniqueRequirementReason("shadow_flurry"));
      return;
    }
    const first=resolvePlayerAttack(state, {
      prefix:"Shadow Flurry: ", attack:ap, target:enemy, attackBonusModifier:techniqueHalfDown(rank), attackBonusSourceKey:"shadow_flurry", attackBonusSourceLabel:"Shadow Flurry"
    });
    if(state.combat&&enemy&&enemy.hp&&enemy.hp.current>0) {
      if(first&&first.hit) {
        applyWeaponTechniqueStatus(state, enemy, createStatusEffect("off_guard"), enemy.name+" is opened up by Shadow Flurry.");
      }
      ap=weaponTechniqueAttackProfile(state, "shadow_flurry");
      if(ap) {
        resolvePlayerAttack(state, {
          prefix:"Shadow Flurry: ", attack:ap, target:enemy, attackBonusModifier:techniqueHalfDown(rank), extraDamageOnHit:rank, attackBonusSourceKey:"shadow_flurry", attackBonusSourceLabel:"Shadow Flurry", extraDamageSourceKey:"shadow_flurry", extraDamageSourceLabel:"Shadow Flurry"
        });
      }
    }
    finishPlayerAbilityUse(state);
  }

  function usePinningShot(state) {
    if(state.combat)beginCombatToastBatch("player");
    const check=canUseActiveAbility(state, "pinning_shot");
    if(!check.ok) {
      log(state, check.reason);
      return;
    }
    const enemy=preferredCombatEnemy(state);
    if(!enemy) {
      log(state, "Select an enemy target first.");
      return;
    }
    const ap=weaponTechniqueAttackProfile(state, "pinning_shot");
    if(!ap) {
      log(state, weaponTechniqueRequirementReason("pinning_shot"));
      return;
    }
    const rank=classFeatRankValue(state.player, "pinning_shot");
    spendAbilitySp(state, "pinning_shot");
    const result=resolvePlayerAttack(state, {
      prefix:"Pinning Shot: ", attack:ap, target:enemy, attackBonusModifier:rank, attackBonusSourceKey:"pinning_shot", attackBonusSourceLabel:"Pinning Shot"
    });
    if(result&&result.hit&&Number(result.total||0)>=creatureSaveDc(enemy, "reflex")&&enemy&&enemy.hp&&enemy.hp.current>0) {
      const attackPenalty=techniqueHalfUp(rank);
      applyWeaponTechniqueStatus(state, enemy, createWeaponTechniqueStatusEffect("pinning_shot_pinned", "Pinned", "Pinned for 1 round by Pinning Shot: -1 AC and -"+attackPenalty+" to attack rolls.", {
        duration:1, tags:["Debuff", "Pinned"], acModifier:-1, attackRollModifier:-attackPenalty
      }), enemy.name+" is pinned in place by Pinning Shot.");
    }
    finishPlayerAbilityUse(state);
  }

  function useVolleyFire(state) {
    useTechniqueRowAttack(state, "volley_fire", function(rank) {
      return {
        attackBonusModifier:techniqueHalfDown(rank), extraDamageOnHit:Math.max(1, rank-1)
      };
    });
  }

  function usePowerStrike(state) {
    if(state.combat)beginCombatToastBatch("player");
    const check=canUseActiveAbility(state, "power_strike");
    if(!check.ok) {
      log(state, check.reason);
      return;
    }
    const enemy=preferredCombatEnemy(state);
    if(!enemy) {
      log(state, "Select an enemy target first.");
      return;
    }
    const ap=weaponTechniqueAttackProfile(state, "power_strike");
    if(!ap) {
      log(state, weaponTechniqueRequirementReason("power_strike"));
      return;
    }
    const rank=classFeatRankValue(state.player, "power_strike");
    spendAbilitySp(state, "power_strike");
    resolvePlayerAttack(state, {
      prefix:"Power Strike: ", attack:ap, target:enemy, attackBonusModifier:-2, extraDamageOnHit:3+rank, attackBonusSourceKey:"power_strike", attackBonusSourceLabel:"Power Strike", extraDamageSourceKey:"power_strike", extraDamageSourceLabel:"Power Strike"
    });
    finishPlayerAbilityUse(state);
  }

  function useConcussiveBlow(state) {
    if(state.combat)beginCombatToastBatch("player");
    const check=canUseActiveAbility(state, "concussive_blow");
    if(!check.ok) {
      log(state, check.reason);
      return;
    }
    const enemy=preferredCombatEnemy(state);
    if(!enemy) {
      log(state, "Select an enemy target first.");
      return;
    }
    const ap=weaponTechniqueAttackProfile(state, "concussive_blow");
    if(!ap) {
      log(state, weaponTechniqueRequirementReason("concussive_blow"));
      return;
    }
    const rank=classFeatRankValue(state.player, "concussive_blow");
    spendAbilitySp(state, "concussive_blow");
    const result=resolvePlayerAttack(state, {
      prefix:"Concussive Blow: ", attack:ap, target:enemy, attackBonusModifier:techniqueHalfDown(rank), extraDamageOnHit:rank, attackBonusSourceKey:"concussive_blow", attackBonusSourceLabel:"Concussive Blow", extraDamageSourceKey:"concussive_blow", extraDamageSourceLabel:"Concussive Blow"
    });
    if(result&&result.hit&&Number(result.total||0)>=creatureSaveDc(enemy, "fort")&&enemy&&enemy.hp&&enemy.hp.current>0) {
      const attackPenalty=techniqueHalfUp(rank);
      applyWeaponTechniqueStatus(state, enemy, createWeaponTechniqueStatusEffect("concussive_blow_concussed", "Concussed", "Concussed for 1 round: -1 AC and -"+attackPenalty+" to attack rolls.", {
        duration:1, tags:["Debuff", "Concussed"], acModifier:-1, attackRollModifier:-attackPenalty
      }), enemy.name+" is concussed by the blow.");
    }
    finishPlayerAbilityUse(state);
  }

  function useRendingChop(state) {
    if(state.combat)beginCombatToastBatch("player");
    const check=canUseActiveAbility(state, "rending_chop");
    if(!check.ok) {
      log(state, check.reason);
      return;
    }
    const enemy=preferredCombatEnemy(state);
    if(!enemy) {
      log(state, "Select an enemy target first.");
      return;
    }
    const ap=weaponTechniqueAttackProfile(state, "rending_chop");
    if(!ap) {
      log(state, weaponTechniqueRequirementReason("rending_chop"));
      return;
    }
    const rank=classFeatRankValue(state.player, "rending_chop");
    spendAbilitySp(state, "rending_chop");
    const result=resolvePlayerAttack(state, {
      prefix:"Rending Chop: ", attack:ap, target:enemy, attackBonusModifier:techniqueHalfDown(rank), extraDamageOnHit:rank, attackBonusSourceKey:"rending_chop", attackBonusSourceLabel:"Rending Chop", extraDamageSourceKey:"rending_chop", extraDamageSourceLabel:"Rending Chop"
    });
    if(result&&result.hit&&enemy&&enemy.hp&&enemy.hp.current>0) {
      const acPenalty=1+techniqueHalfDown(rank);
      applyWeaponTechniqueStatus(state, enemy, createWeaponTechniqueStatusEffect("rending_chop_rent_armor", "Rent Armor", "Armor is split open for 2 rounds: -"+acPenalty+" AC.", {
        duration:2, tags:["Debuff", "Armor"], acModifier:-acPenalty, attackRollModifier:0
      }), enemy.name+"'s armor is rent by the axe blow.");
    }
    finishPlayerAbilityUse(state);
  }

  function useExecutionersSwing(state) {
    if(state.combat)beginCombatToastBatch("player");
    const check=canUseActiveAbility(state, "executioners_swing");
    if(!check.ok) {
      log(state, check.reason);
      return;
    }
    const enemy=preferredCombatEnemy(state);
    if(!enemy) {
      log(state, "Select an enemy target first.");
      return;
    }
    const ap=weaponTechniqueAttackProfile(state, "executioners_swing");
    if(!ap) {
      log(state, weaponTechniqueRequirementReason("executioners_swing"));
      return;
    }
    const rank=classFeatRankValue(state.player, "executioners_swing");
    const wounded=enemy.hp.current<=Math.floor(enemy.hp.max/2);
    spendAbilitySp(state, "executioners_swing");
    resolvePlayerAttack(state, {
      prefix:wounded?"Executioner's Swing (finisher): ":"Executioner's Swing: ", attack:ap, target:enemy, attackBonusModifier:-1, extraDamageOnHit:(rank*2)+(wounded?rank:0), attackBonusSourceKey:"executioners_swing", attackBonusSourceLabel:"Executioner's Swing", extraDamageSourceKey:"executioners_swing", extraDamageSourceLabel:wounded?"Executioner's Swing finisher":"Executioner's Swing"
    });
    finishPlayerAbilityUse(state);
  }

  const WeaponTechniqueCanUseActiveAbility=canUseActiveAbility;

  canUseActiveAbility=function(state, abilityId) {
    const base=WeaponTechniqueCanUseActiveAbility(state, abilityId);
    if(!base.ok)return base;
    const styleId=WEAPON_TECHNIQUE_STYLE_BY_ABILITY[abilityId];
    if(!styleId||!state||!state.player)return base;
    const ap=attackProfile(state.player);
    if(weaponTechniqueAttackMatches(ap, styleId))return base;
    return {
      ok:false, reason:weaponTechniqueRequirementReason(abilityId)
    };
  };

  function weaponTechniqueFeatCostAtRank(featId, rank) {
    const r=Math.max(0, Number(rank||0));
    if(r<=0)return 0;
    if(featId==="feint_strike")return r;
    if(featId==="power_strike")return r+1;
    if(featId==="stunning_palm")return 1;
    if(featId==="hamstring_cut")return 1;
    if(featId==="pinning_shot")return 1;
    if(featId==="rending_chop")return 1;
    if(["blade_dance", "hundred_fists", "shadow_flurry", "volley_fire", "concussive_blow", "executioners_swing"].includes(featId))return techniqueTieredCost(r);
    return 0;
  }

  const WeaponTechniqueAbilitySpCost=abilitySpCost;

  abilitySpCost=function(player, abilityId) {
    if(isClassFeatId(abilityId)) {
      const rank=Math.max(0, Number(player&&player.classFeatRanks&&player.classFeatRanks[abilityId]||0));
      const custom=weaponTechniqueFeatCostAtRank(abilityId, rank);
      if(custom>0||Object.prototype.hasOwnProperty.call(WEAPON_TECHNIQUE_STYLE_BY_ABILITY, abilityId))return custom;
    }
    return WeaponTechniqueAbilitySpCost(player, abilityId);
  };

  const WeaponTechniqueClassFeatEffectLines=classFeatEffectLines;

  classFeatEffectLines=function(featId, rank) {
    const r=Math.max(0, Number(rank||0));
    if(r<=0&&Object.prototype.hasOwnProperty.call(WEAPON_TECHNIQUE_STYLE_BY_ABILITY, featId))return["No ranks invested yet."];
    if(featId==="feint_strike")return["Requires a sword.", "SP cost: "+weaponTechniqueFeatCostAtRank(featId, r)+".", "Attack bonus: +"+r+".", "Damage on hit: +"+r+".", "If attack total beats Reflex DC: apply Off-Guard."];
    if(featId==="blade_dance")return["Requires a sword.", "SP cost: "+weaponTechniqueFeatCostAtRank(featId, r)+".", "Targeting: selected enemy row.", "Attack bonus to each strike: +"+techniqueHalfDown(r)+".", "Damage on each hit: +"+r+"."];
    if(featId==="stunning_palm")return["Requires an unarmed attack.", "SP cost: 1.", "Attack bonus: +"+r+".", "On hit vs Fort DC: Staggered for 1 round (AC -1, attacks -"+techniqueHalfUp(r)+")."];
    if(featId==="hundred_fists")return["Requires an unarmed attack.", "SP cost: "+weaponTechniqueFeatCostAtRank(featId, r)+".", "Two attacks against one target.", "Attack bonus each: +"+techniqueHalfDown(r)+".", "If strike 1 hits: strike 2 gains +"+r+" damage."];
    if(featId==="hamstring_cut")return["Requires a dagger.", "SP cost: 1.", "Attack bonus: +"+r+".", "On hit: Bleed "+r+" for 2 rounds.", "If attack total meets Reflex DC: apply Off-Guard."];
    if(featId==="shadow_flurry")return["Requires a dagger.", "SP cost: "+weaponTechniqueFeatCostAtRank(featId, r)+".", "Two attacks against one target.", "Attack bonus each: +"+techniqueHalfDown(r)+".", "If strike 1 hits: target becomes Off-Guard before strike 2.", "Strike 2 damage bonus: +"+r+"."];
    if(featId==="pinning_shot")return["Requires a bow.", "SP cost: 1.", "Attack bonus: +"+r+".", "On hit vs Reflex DC: Pinned for 1 round (AC -1, attacks -"+techniqueHalfUp(r)+")."];
    if(featId==="volley_fire")return["Requires a bow.", "SP cost: "+weaponTechniqueFeatCostAtRank(featId, r)+".", "Targeting: selected enemy row.", "Attack bonus to each shot: +"+techniqueHalfDown(r)+".", "Damage on each hit: +"+Math.max(1, r-1)+"."];
    if(featId==="power_strike")return["Requires a mace.", "SP cost: "+weaponTechniqueFeatCostAtRank(featId, r)+".", "Attack modifier: -2.", "Damage on hit: +"+(3+r)+"."];
    if(featId==="concussive_blow")return["Requires a mace.", "SP cost: "+weaponTechniqueFeatCostAtRank(featId, r)+".", "Attack bonus: +"+techniqueHalfDown(r)+".", "Damage on hit: +"+r+".", "On hit vs Fort DC: Concussed for 1 round (AC -1, attacks -"+techniqueHalfUp(r)+")."];
    if(featId==="rending_chop")return["Requires an axe.", "SP cost: 1.", "Attack bonus: +"+techniqueHalfDown(r)+".", "Damage on hit: +"+r+".", "On hit: Rent Armor for 2 rounds (AC -"+(1+techniqueHalfDown(r))+")."];
    if(featId==="executioners_swing")return["Requires an axe.", "SP cost: "+weaponTechniqueFeatCostAtRank(featId, r)+".", "Attack modifier: -1.", "Damage on hit: +"+(r*2)+".", "If target is at or below half HP before the swing: +"+r+" more damage."];
    return WeaponTechniqueClassFeatEffectLines(featId, rank);
  };

  const WeaponTechniqueClassFeatNextRankPreviewLines=classFeatNextRankPreviewLines;

  classFeatNextRankPreviewLines=function(featId, rank) {
    const current=Math.max(0, Number(rank||0));
    const next=Math.min(classFeatMaxRank(featId), current+1);
    if(next<=current)return["Already at maximum rank."];
    if(featId==="feint_strike")return["SP cost: "+weaponTechniqueFeatCostAtRank(featId, current)+" -> "+weaponTechniqueFeatCostAtRank(featId, next)+".", "Attack bonus: +"+current+" -> +"+next+".", "Damage on hit: +"+current+" -> +"+next+"."];
    if(featId==="blade_dance")return["SP cost: "+weaponTechniqueFeatCostAtRank(featId, current)+" -> "+weaponTechniqueFeatCostAtRank(featId, next)+".", "Attack bonus to each strike: +"+techniqueHalfDown(current)+" -> +"+techniqueHalfDown(next)+".", "Damage on each hit: +"+current+" -> +"+next+"."];
    if(featId==="stunning_palm")return["Attack bonus: +"+current+" -> +"+next+".", "Staggered attack penalty: -"+techniqueHalfUp(current)+" -> -"+techniqueHalfUp(next)+"."];
    if(featId==="hundred_fists")return["SP cost: "+weaponTechniqueFeatCostAtRank(featId, current)+" -> "+weaponTechniqueFeatCostAtRank(featId, next)+".", "Attack bonus each: +"+techniqueHalfDown(current)+" -> +"+techniqueHalfDown(next)+".", "Second-strike damage bonus: +"+current+" -> +"+next+"."];
    if(featId==="hamstring_cut")return["Attack bonus: +"+current+" -> +"+next+".", "Bleed on hit: "+current+" -> "+next+"."];
    if(featId==="shadow_flurry")return["SP cost: "+weaponTechniqueFeatCostAtRank(featId, current)+" -> "+weaponTechniqueFeatCostAtRank(featId, next)+".", "Attack bonus each: +"+techniqueHalfDown(current)+" -> +"+techniqueHalfDown(next)+".", "Second-strike damage bonus: +"+current+" -> +"+next+"."];
    if(featId==="pinning_shot")return["Attack bonus: +"+current+" -> +"+next+".", "Pinned attack penalty: -"+techniqueHalfUp(current)+" -> -"+techniqueHalfUp(next)+"."];
    if(featId==="volley_fire")return["SP cost: "+weaponTechniqueFeatCostAtRank(featId, current)+" -> "+weaponTechniqueFeatCostAtRank(featId, next)+".", "Attack bonus to each shot: +"+techniqueHalfDown(current)+" -> +"+techniqueHalfDown(next)+".", "Damage on each hit: +"+Math.max(1, current-1)+" -> +"+Math.max(1, next-1)+"."];
    if(featId==="power_strike")return["SP cost: "+weaponTechniqueFeatCostAtRank(featId, current)+" -> "+weaponTechniqueFeatCostAtRank(featId, next)+".", "Damage on hit: +"+(3+current)+" -> +"+(3+next)+".", "Attack modifier remains -2."];
    if(featId==="concussive_blow")return["SP cost: "+weaponTechniqueFeatCostAtRank(featId, current)+" -> "+weaponTechniqueFeatCostAtRank(featId, next)+".", "Attack bonus: +"+techniqueHalfDown(current)+" -> +"+techniqueHalfDown(next)+".", "Damage on hit: +"+current+" -> +"+next+".", "Concussed attack penalty: -"+techniqueHalfUp(current)+" -> -"+techniqueHalfUp(next)+"."];
    if(featId==="rending_chop")return["Attack bonus: +"+techniqueHalfDown(current)+" -> +"+techniqueHalfDown(next)+".", "Damage on hit: +"+current+" -> +"+next+".", "Rent Armor AC penalty: -"+(1+techniqueHalfDown(current))+" -> -"+(1+techniqueHalfDown(next))+"."];
    if(featId==="executioners_swing")return["SP cost: "+weaponTechniqueFeatCostAtRank(featId, current)+" -> "+weaponTechniqueFeatCostAtRank(featId, next)+".", "Base damage on hit: +"+(current*2)+" -> +"+(next*2)+".", "Finisher bonus vs half-HP targets: +"+current+" -> +"+next+"."];
    return WeaponTechniqueClassFeatNextRankPreviewLines(featId, rank);
  };

  const WeaponTechniqueUseActiveAbility=useActiveAbility;

  useActiveAbility=function(state, abilityId) {
    if(abilityId==="feint_strike")return useFeintStrike(state);
    if(abilityId==="blade_dance")return useBladeDance(state);
    if(abilityId==="stunning_palm")return useStunningPalm(state);
    if(abilityId==="hundred_fists")return useHundredFists(state);
    if(abilityId==="hamstring_cut")return useHamstringCut(state);
    if(abilityId==="shadow_flurry")return useShadowFlurry(state);
    if(abilityId==="pinning_shot")return usePinningShot(state);
    if(abilityId==="volley_fire")return useVolleyFire(state);
    if(abilityId==="power_strike")return usePowerStrike(state);
    if(abilityId==="concussive_blow")return useConcussiveBlow(state);
    if(abilityId==="rending_chop")return useRendingChop(state);
    if(abilityId==="executioners_swing")return useExecutionersSwing(state);
    return WeaponTechniqueUseActiveAbility(state, abilityId);
  };

  if(state&&state.player) {
    ensurePlayerFeatContainers(state.player);
    syncPlayerAbilityIdsForLevels(state.player);
  }

  const PLAYER_ACTION_TO_ENEMY_DELAY_MS=500;

  const COMBAT_ICON_FX_BATCH_MS=450;

  const COMBAT_ICON_FX_NODE_MS=650;

  let combatIconFxBatch=null;

  const combatIconFxQueue=[];

  let combatIconFxPlaying=false;

  let combatIconFxFrameHandle=0;

  let combatIconFxAdvanceTimer=null;

  let pendingEnemyTurnTimer=null;

  let runningDelayedEnemyTurn=false;

  function ensureCombatIconFxStyles(){if(document.getElementById("combat_icon_fx_styles"))return;const style=document.createElement("style");style.id="combat_icon_fx_styles";style.textContent=`
        .combatUnitAvatarFxWrap{
          position:relative;
          display:inline-flex;
          align-items:center;
          justify-content:center;
          isolation:isolate;
        }
        .combatUnitAvatarFxWrap > .combatUnitImage,
        .combatUnitAvatarFxWrap > .combatUnitEmoji{
          position:relative;
          z-index:1;
        }
        .combatUnitAvatarFxWrap::after{
          content:"";
          position:absolute;
          inset:-8px;
          border-radius:999px;
          opacity:0;
          transform:scale(0.72);
          pointer-events:none;
          z-index:0;
        }
        .combatUnitAvatarFxWrap.fxFlashDamage::after{
          background:rgba(220, 38, 38, 0.34);
          animation:combatUnitFxFlashDamage 220ms ease-out;
        }
        .combatUnitAvatarFxWrap.fxFlashHeal::after{
          background:rgba(34, 197, 94, 0.28);
          animation:combatUnitFxFlashHeal 220ms ease-out;
        }
        .combatFloatingFx{
          position:absolute;
          left:50%;
          top:-6px;
          transform:translate(-50%, calc(2px - (var(--combat-fx-stack, 0) * 18px))) scale(0.92);
          transform-origin:center bottom;
          pointer-events:none;
          white-space:nowrap;
          z-index:2;
          padding:2px 8px;
          border-radius:999px;
          font-size:12px;
          line-height:1.2;
          font-weight:800;
          letter-spacing:0.01em;
          color:#fff;
          background:rgba(15, 23, 42, 0.92);
          box-shadow:0 8px 18px rgba(15, 23, 42, 0.32);
          animation:combatFloatingFxRise 650ms ease-out forwards;
        }
        .combatFloatingFx.damage{
          background:rgba(153, 27, 27, 0.94);
        }
        .combatFloatingFx.heal{
          background:rgba(20, 83, 45, 0.94);
        }
        .combatFloatingFx.miss{
          background:rgba(51, 65, 85, 0.94);
        }
        .combatFloatingFx.condition{
          background:rgba(91, 33, 182, 0.94);
        }
        @keyframes combatFloatingFxRise{
          0%{
            opacity:0;
            transform:translate(-50%, calc(8px - (var(--combat-fx-stack, 0) * 18px))) scale(0.9);
          }
          18%{
            opacity:1;
          }
          100%{
            opacity:0;
            transform:translate(-50%, calc(-32px - (var(--combat-fx-stack, 0) * 18px))) scale(1.03);
          }
        }
        @keyframes combatUnitFxFlashDamage{
          0%{
            opacity:0;
            transform:scale(0.72);
          }
          35%{
            opacity:1;
            transform:scale(1.08);
          }
          100%{
            opacity:0;
            transform:scale(1.22);
          }
        }
        @keyframes combatUnitFxFlashHeal{
          0%{
            opacity:0;
            transform:scale(0.72);
          }
          35%{
            opacity:1;
            transform:scale(1.06);
          }
          100%{
            opacity:0;
            transform:scale(1.18);
          }
        }
      `;document.head.appendChild(style);}

  function combatActionToastKind(kind) {
    if(kind==="bad")return"bad";
    if(kind==="good"||kind==="buff")return"good";
    return"info";
  }

  function clearCombatIconFxQueue() {
    combatIconFxQueue.length=0;
    combatIconFxBatch=null;
    combatIconFxPlaying=false;
    if(combatIconFxFrameHandle)cancelAnimationFrame(combatIconFxFrameHandle);
    if(combatIconFxAdvanceTimer)clearTimeout(combatIconFxAdvanceTimer);
    if(pendingEnemyTurnTimer)clearTimeout(pendingEnemyTurnTimer);
    combatIconFxFrameHandle=0;
    combatIconFxAdvanceTimer=null;
    pendingEnemyTurnTimer=null;
  }

  function combatIconFxEntityId(entity) {
    if(!entity||!state||!state.combat)return null;
    if(entity===state.player)return"ally_player";
    const enemy=Array.isArray(state.combat.enemies)?state.combat.enemies.find(entry=>entry===entity||entry.combatId===entity.combatId):null;
    if(enemy&&enemy.combatId)return enemy.combatId;
    const ally=Array.isArray(state.combat.allies)?state.combat.allies.find(entry=>entry===entity||entry.combatId===entity.combatId||combatAllyEntity(state, entry)===entity):null;
    if(ally&&ally.combatId)return ally.combatId;
    return typeof entity.combatId==="string"&&entity.combatId.trim()?entity.combatId:null;
  }

  function normalizeCombatIconFxKind(kind) {
    return["damage", "heal", "miss", "condition", "neutral"].includes(kind)?kind:"neutral";
  }

  function normalizeCombatIconFx(effect) {
    const combatId=effect&&typeof effect.combatId==="string"?effect.combatId.trim():"";
    const text=String(effect&&effect.text||"").trim();
    if(!combatId||!text)return null;
    return {
      combatId, text, kind:normalizeCombatIconFxKind(effect&&effect.kind), flash:effect&&effect.flash==="heal"?"heal":effect&&effect.flash==="damage"?"damage":""
    };
  }

  function requestCombatIconFxPlayback() {
    if(combatIconFxPlaying||combatIconFxFrameHandle)return;
    combatIconFxFrameHandle=requestAnimationFrame(()=> {
      combatIconFxFrameHandle=0;
      playNextCombatIconFxBatch();
    });
  }

  function queueCombatIconFx(effect) {
    const normalized=normalizeCombatIconFx(effect);
    if(!normalized)return;
    if(combatIconFxBatch) {
      combatIconFxBatch.effects.push(normalized);
      return;
    }
    combatIconFxQueue.push({
      effects:[normalized]
    });
    requestCombatIconFxPlayback();
  }

  function queueCombatIconFxForEntity(entity, text, {
    kind="neutral", flash=""
  }
  ={
  }) {
    const combatId=combatIconFxEntityId(entity);
    if(!combatId)return;
    queueCombatIconFx({
      combatId, text, kind, flash
    });
  }

  function queueCombatDamageFx(entity,amount,{critical=false}={}){const value=Math.max(0,Number(amount||0));if(!value)return;queueCombatIconFxForEntity(entity,`-${value}${critical ? "!" : ""}`,{kind:"damage",flash:"damage"});}

  function queueCombatHealFx(entity,amount){const value=Math.max(0,Number(amount||0));if(!value)return;queueCombatIconFxForEntity(entity,`+${value}`,{kind:"heal",flash:"heal"});}

  function queueCombatConditionFx(entity,label){const text=String(label||"").trim();if(!text)return;queueCombatIconFxForEntity(entity,`+${text}`,{kind:"condition"});}

  function beginCombatIconFxBatch(phase="round") {
    const normalizedPhase=normalizeCombatToastPhase(phase);
    if(!combatIconFxBatch) {
      combatIconFxBatch={
        phase:normalizedPhase, effects:[]
      };
      return;
    }
    if(combatIconFxBatch.phase!==normalizedPhase&&combatIconFxBatch.effects.length) {
      combatIconFxQueue.push({
        phase:combatIconFxBatch.phase, effects:combatIconFxBatch.effects.slice()
      });
      combatIconFxBatch.effects.length=0;
      requestCombatIconFxPlayback();
    }
    combatIconFxBatch.phase=normalizedPhase;
  }

  function flushCombatIconFxBatch() {
    if(!combatIconFxBatch)return;
    if(combatIconFxBatch.effects.length) {
      combatIconFxQueue.push({
        phase:combatIconFxBatch.phase, effects:combatIconFxBatch.effects.slice()
      });
      combatIconFxBatch.effects.length=0;
      requestCombatIconFxPlayback();
    }
    combatIconFxBatch=null;
  }

  function spawnCombatIconFx(host,effect,stackIndex){const node=document.createElement("span");node.className=`combatFloatingFx ${normalizeCombatIconFxKind(effect.kind)}`;node.style.setProperty("--combat-fx-stack",String(stackIndex));node.textContent=effect.text;host.appendChild(node);if(effect.flash==="damage"||effect.flash==="heal"){const flashClass=effect.flash==="heal"?"fxFlashHeal":"fxFlashDamage";host.classList.remove("fxFlashDamage","fxFlashHeal");void host.offsetWidth;host.classList.add(flashClass);setTimeout(()=>{host.classList.remove(flashClass);},220);}setTimeout(()=>{if(node.parentNode)node.parentNode.removeChild(node);},COMBAT_ICON_FX_NODE_MS);}

  function playNextCombatIconFxBatch(){if(combatIconFxPlaying)return;if(!combatIconFxQueue.length)return;if(!state||!state.combat||state.tab!=="combat"){combatIconFxQueue.length=0;return;}ensureCombatIconFxStyles();const next=combatIconFxQueue.shift();const effects=Array.isArray(next&&next.effects)?next.effects:[];if(!effects.length){requestCombatIconFxPlayback();return;}combatIconFxPlaying=true;const stackByCombatId=new Map();let displayed=0;for(const effect of effects){const host=document.querySelector(`[data-combat-fx-host="${effect.combatId}"]`);if(!host)continue;displayed+=1;const stackIndex=stackByCombatId.get(effect.combatId)||0;stackByCombatId.set(effect.combatId,stackIndex+1);spawnCombatIconFx(host,effect,stackIndex);}if(combatIconFxAdvanceTimer)clearTimeout(combatIconFxAdvanceTimer);combatIconFxAdvanceTimer=setTimeout(()=>{combatIconFxAdvanceTimer=null;combatIconFxPlaying=false;requestCombatIconFxPlayback();},displayed?COMBAT_ICON_FX_BATCH_MS:0);}

  const CombatFeedbackClearCombatToastQueue=clearCombatToastQueue;

  clearCombatToastQueue=function() {
    clearCombatIconFxQueue();
    CombatFeedbackClearCombatToastQueue();
  };

  const CombatFeedbackBeginCombatToastBatch=beginCombatToastBatch;

  beginCombatToastBatch=function(phase="round") {
    beginCombatIconFxBatch(phase);
    CombatFeedbackBeginCombatToastBatch(phase);
  };

  const CombatFeedbackFlushCombatToastBatch=flushCombatToastBatch;

  flushCombatToastBatch=function() {
    flushCombatIconFxBatch();
    CombatFeedbackFlushCombatToastBatch();
  };

  const CombatFeedbackEndCombat=endCombat;

  endCombat=function(state, victory) {
    clearCombatIconFxQueue();
    return CombatFeedbackEndCombat(state, victory);
  };

  const CombatFeedbackHandlePlayerDefeat=handlePlayerDefeat;

  handlePlayerDefeat=function(state) {
    clearCombatIconFxQueue();
    return CombatFeedbackHandlePlayerDefeat(state);
  };

  notifyCombatAction=function(message,kind="neutral"){const text=String(message||"").trim();if(text&&state&&state.combat&&combatIconFxBatch){if(/\bmisses you\b/i.test(text)){queueCombatIconFxForEntity(state.player,"Miss",{kind:"miss"});}else if(/\b(?:critically hits|hits) you for (\d+)\b/i.test(text)){const match=text.match(/\b(?:critically hits|hits) you for (\d+)\b/i);queueCombatDamageFx(state.player,Number(match&&match[1]||0),{critical:/\bcritically hits\b/i.test(text)});}else if(/^You fail to escape\b/i.test(text)){queueCombatIconFxForEntity(state.player,"Fail",{kind:"miss"});}else if(/^You escape\b/i.test(text)){queueCombatIconFxForEntity(state.player,"Escape",{kind:"neutral"});}}if(text)toast(text,combatActionToastKind(kind));};

  const CombatFeedbackNotifyAbilityUse=notifyAbilityUse;

  notifyAbilityUse=function(abilityId,options={}){if(state&&state.combat&&combatIconFxBatch){if(options&&options.success===false){const selected=state.combat&&state.combat.selectedTargetId?getCombatParticipantInfo(state,state.combat.selectedTargetId):null;if(selected&&selected.side==="enemy"){queueCombatIconFxForEntity(selected.entity,"Fail",{kind:"miss"});}}else if(abilityHasTag(abilityId,"Heal")){const message=String(options&&options.message||"").trim();const healMatch=message.match(/\brecover(?:s)? (\d+) HP\b/i);if(healMatch){queueCombatHealFx(state.player,Number(healMatch[1]||0));}}}return CombatFeedbackNotifyAbilityUse(abilityId,options);};

  const CombatFeedbackAddOrRefreshStatusEffect=addOrRefreshStatusEffect;

  addOrRefreshStatusEffect=function(entity, effect) {
    const key=effect?(effect.templateId||effect.id):"";
    const before=entity&&Array.isArray(entity.statusEffects)?entity.statusEffects.find(existing=>(existing.templateId||existing.id)===key)||null:null;
    const result=CombatFeedbackAddOrRefreshStatusEffect(entity, effect);
    if(result&&combatIconFxBatch&&state&&state.combat&&!before) {
      queueCombatConditionFx(entity, result.name||key);
    }
    return result;
  };

  const CombatFeedbackApplyCombatHealingItemToTarget=applyCombatHealingItemToTarget;

  applyCombatHealingItemToTarget=function(state, item, targetInfo) {
    const result=CombatFeedbackApplyCombatHealingItemToTarget(state, item, targetInfo);
    if(state&&state.combat&&combatIconFxBatch&&targetInfo&&targetInfo.entity&&Number(result&&result.healed||0)>0) {
      queueCombatHealFx(targetInfo.entity, Number(result.healed||0));
    }
    return result;
  };

  const CombatFeedbackResolvePlayerAttack=resolvePlayerAttack;

  resolvePlayerAttack=function(state, options) {
    const target=options&&options.target||preferredCombatEnemy(state)||(state&&state.combat?state.combat.enemy:null);
    const result=CombatFeedbackResolvePlayerAttack(state, options);
    if(state&&state.combat&&target&&result&&result.usedAction) {
      if(result.hit) {
        if(Number(result.damage||0)>0) {
          queueCombatDamageFx(target, Number(result.damage||0), {
            critical:result.outcome==="crit"
          });
        } else {
          queueCombatIconFxForEntity(target, result.outcome==="crit"?"Crit":"Hit", {
            kind:"neutral"
          });
        }
      } else {
        queueCombatIconFxForEntity(target, "Miss", {
          kind:"miss"
        });
      }
    }
    return result;
  };

  const CombatFeedbackDealDamageToEnemy=dealDamageToEnemy;

  dealDamageToEnemy=function(state, amount, damageType, {
    sourceLabel="", target=null
  }
  ={
  }) {
    const enemy=target||preferredCombatEnemy(state)||(state&&state.combat?state.combat.enemy:null);
    const before=enemy&&enemy.hp?Number(enemy.hp.current||0):0;
    const result=CombatFeedbackDealDamageToEnemy(state, amount, damageType, {
      sourceLabel, target
    });
    if(state&&state.combat&&combatIconFxBatch&&enemy) {
      const after=enemy&&enemy.hp?Number(enemy.hp.current||0):Math.max(0, before-Number(result&&result.damage||0));
      const applied=Math.max(0, before-after);
      if(applied>0)queueCombatDamageFx(enemy, applied);
    }
    return result;
  };

  const CombatFeedbackDealDamageToPlayer=dealDamageToPlayer;

  dealDamageToPlayer=function(state, amount, damageType, {
    sourceLabel="", applyResistance=true
  }
  ={
  }) {
    const before=state&&state.player&&state.player.hp?Number(state.player.hp.current||0):0;
    const result=CombatFeedbackDealDamageToPlayer(state, amount, damageType, {
      sourceLabel, applyResistance
    });
    if(state&&state.combat&&combatIconFxBatch) {
      const after=state&&state.player&&state.player.hp?Number(state.player.hp.current||0):0;
      const applied=Math.max(0, before-after);
      if(applied>0)queueCombatDamageFx(state.player, applied);
    }
    return result;
  };

  const CombatFeedbackEnemyTurn=enemyTurn;

  enemyTurn=function(state) {
    if(runningDelayedEnemyTurn)return CombatFeedbackEnemyTurn(state);
    if(!state||!state.combat)return;
    flushCombatIconFxBatch();
    if(pendingEnemyTurnTimer)clearTimeout(pendingEnemyTurnTimer);
    state.combat.turn="enemy";
    pendingEnemyTurnTimer=setTimeout(()=> {
      pendingEnemyTurnTimer=null;
      if(!state||!state.combat)return;
      runningDelayedEnemyTurn=true;
      try {
        CombatFeedbackEnemyTurn(state);
      } finally {
        runningDelayedEnemyTurn=false;
      }
    }, PLAYER_ACTION_TO_ENEMY_DELAY_MS);
  };

  renderCombatUnit=function(info,{selected=false}={}){return`
        <button class="combatUnit ${selected ? "selected" : ""} ${info.side}" type="button" data-combat-select="${escapeHtml(info.id)}">
          <span class="combatUnitAvatar">
            <span class="combatUnitAvatarFxWrap" data-combat-fx-host="${escapeHtml(info.id)}">${renderCombatAvatar(info)}</span>
          </span>
          <span class="combatUnitName">${escapeHtml(info.name)}</span>
          ${renderCombatMiniHealthBar(info.hp)}
        </button>
      `;};

  const CombatFeedbackRender=render;

  render=function() {
    CombatFeedbackRender();
    requestCombatIconFxPlayback();
  };

  // ---------------------------------------------------------------------------
  // Advanced combat actions and monster behavior
  // ---------------------------------------------------------------------------
  function pfNormalizeTagList(tags) {
    const list=Array.isArray(tags)?tags:(tags==null?[]:[tags]);
    return[...new Set(list.map(normalizeTagId).filter(Boolean))];
  }

  function pfAppendActionTagList(tags, extras) {
    return pfNormalizeTagList([...(Array.isArray(tags)?tags:[]), ...(Array.isArray(extras)?extras:[extras])]);
  }

  function pfActionDisabledReason(entity,tags){const needed=new Set(pfNormalizeTagList(tags));if(!entity||!needed.size)return"";for(const effect of entity.statusEffects||[]){const disabled=pfNormalizeTagList(effect&&effect.disabledAbilityTags);const matched=disabled.find(tag=>needed.has(tag));if(matched)return`${effect.name} prevents using ${formatDamageTypeLabel(matched)} actions.`;}return"";}

  function createConcussedStatusEffect(turns){const dur=Math.max(1,Number(turns||1));return createStatusEffect("concussed",{name:`Concussed ${dur}`,description:`Head-tag feats and actions are disabled for ${dur} turn${dur === 1 ? "" : "s"}.`,duration:dur,maxDuration:dur});}

  function createPinnedStatusEffect(turns){const dur=Math.max(1,Number(turns||1));return createStatusEffect("pinned",{name:`Pinned ${dur}`,description:`Leg-tag feats and actions are disabled for ${dur} turn${dur === 1 ? "" : "s"}.`,duration:dur,maxDuration:dur});}

  function createDisarmedStatusEffect(turns){const dur=Math.max(1,Number(turns||1));return createStatusEffect("disarmed",{name:`Disarmed ${dur}`,description:`Arm-tag feats and actions are disabled for ${dur} turn${dur === 1 ? "" : "s"}.`,duration:dur,maxDuration:dur});}

  function createHiddenStatusEffect(turns){const dur=Math.max(1,Number(turns||1));return createStatusEffect("hidden",{name:`Hidden ${dur}`,description:`+4 AC for ${dur} turn${dur === 1 ? "" : "s"}. Non-sneaky actions remove Hidden.`,duration:dur,maxDuration:dur});}

  function pfHighestEnemyWillDc(st) {
    return combatEnemyList(st).reduce(function(best, enemy) {
      if(!enemy||!isCombatEnemyAlive(enemy))return best;
      return Math.max(best, creatureSaveDc(enemy, "will"));
    }, 0);
  }

  function pfSetPendingPlayerAction(st, abilityId, tags) {
    if(!st||!st.combat)return;
    st.combat.playerFlags=st.combat.playerFlags||{
    };
    st.combat.playerFlags.__pendingAction={
      abilityId:String(abilityId||""), tags:pfNormalizeTagList(tags), hiddenBefore:hasStatusEffect(st.player, "hidden")
    };
  }

  function pfConsumePendingPlayerAction(st) {
    if(!st||!st.combat||!st.combat.playerFlags)return null;
    const pending=st.combat.playerFlags.__pendingAction||null;
    st.combat.playerFlags.__pendingAction=null;
    return pending;
  }

  function pfClearPendingPlayerAction(st, abilityId) {
    if(!st||!st.combat||!st.combat.playerFlags||!st.combat.playerFlags.__pendingAction)return;
    if(!abilityId||st.combat.playerFlags.__pendingAction.abilityId===abilityId) {
      st.combat.playerFlags.__pendingAction=null;
    }
  }

  function pfProcessHiddenAfterAction(st, pending) {
    if(!st||!st.player||!pending||!pending.hiddenBefore)return;
    if(!hasStatusEffect(st.player, "hidden"))return;
    const tags=new Set(pfNormalizeTagList(pending.tags));
    if(!tags.has("sneaky")) {
      removeStatusEffect(st.player, "hidden");
      log(st, "Hidden ends because you used a non-sneaky action.");
      notifyCombatAction("You are revealed.", "neutral");
      return;
    }
    if(!st.combat)return;
    const dc=pfHighestEnemyWillDc(st);
    if(!(dc>0))return;
    const rollData=rollD20Detailed("hidden_retention", {
      label:"Stealth", note:"Sneaky actions can preserve Hidden with a Stealth check."
    });
    const parts=[...cloneRollParts(rollData.parts), ...cloneRollParts(skillCheckSourceParts(st.player, "Stealth"))];
    const total=sumRollParts(parts);
    const success=rollData.total===20||total>=dc;
    log(st, success?"You stay hidden.":"You are revealed after acting.", {
      rollGroups:[buildLogRollGroup({
        label:"Hidden retention", parts, total, targetLabel:"Will DC", targetValue:dc, outcome:success?"success":"failure"
      })]
    });
    if(!success) {
      removeStatusEffect(st.player, "hidden");
      notifyCombatAction("You are revealed.", "neutral");
    } else {
      notifyCombatAction("You remain hidden.", "good");
    }
  }

  function pfActionDetailBlock(lines){const filtered=(Array.isArray(lines)?lines:[]).filter(function(line){return!/\b(?:sp cost|requires?|needs?)\b/i.test(String(line||""));});return filtered;}

  function pfScalingDetailLinesForFeat(featId){const max=isClassFeatId(featId)?classFeatMaxRank(featId):isSkillFeatId(featId)?skillFeatMaxRank(featId):isGeneralFeatId(featId)?generalFeatMaxRank(featId):1;const out=[];for(let rank=1;rank<=max;rank+=1){const lines=pfActionDetailBlock(featEffectLines(featId,rank));if(lines.length)out.push(`Rank ${rank}: ${lines.join(" | ")}`);}return out.length?out:["No effect data available."];}

  const UserPatchCreateUnarmedAttackProfile=createUnarmedAttackProfile;

  createUnarmedAttackProfile=function(player, options) {
    const profile=UserPatchCreateUnarmedAttackProfile(player, options);
    if(profile)profile.tags=pfAppendActionTagList(profile.tags, ["arm"]);
    return profile;
  };

  const UserPatchBuildAttackProfile=buildAttackProfile;

  buildAttackProfile=function(player, weapon, options) {
    const profile=UserPatchBuildAttackProfile(player, weapon, options);
    if(profile)profile.tags=pfAppendActionTagList(profile.tags, ["arm"]);
    return profile;
  };

  const UserPatchCreateEnemyCombatant=createEnemyCombatant;

  createEnemyCombatant=function(monsterId, combatId, row) {
    const enemy=UserPatchCreateEnemyCombatant(monsterId, combatId, row);
    let monster=null;
    try {
      monster=getMonster(monsterId);
    } catch(_) {
      monster=null;
    }
    enemy.basicAttackTags=pfNormalizeTagList((monster&&monster.basicAttackTags)||enemy.basicAttackTags||["arm"]);
    enemy.aiFlags=enemy.aiFlags&&typeof enemy.aiFlags==="object"?enemy.aiFlags:{
    };
    enemy.aiFlags.specialActionsUsed=enemy.aiFlags.specialActionsUsed&&typeof enemy.aiFlags.specialActionsUsed==="object"?enemy.aiFlags.specialActionsUsed:{
    };
    return enemy;
  };

  const UserPatchNormalizeEnemyCombatant=normalizeEnemyCombatant;

  normalizeEnemyCombatant=function(enemy, index) {
    const normalized=UserPatchNormalizeEnemyCombatant(enemy, index);
    let monster=null;
    try {
      monster=getMonster(normalized&&normalized.id);
    } catch(_) {
      monster=null;
    }
    normalized.basicAttackTags=pfNormalizeTagList((monster&&monster.basicAttackTags)||normalized.basicAttackTags||["arm"]);
    normalized.aiFlags=normalized.aiFlags&&typeof normalized.aiFlags==="object"?normalized.aiFlags:{
    };
    normalized.aiFlags.specialActionsUsed=normalized.aiFlags.specialActionsUsed&&typeof normalized.aiFlags.specialActionsUsed==="object"?normalized.aiFlags.specialActionsUsed:{
    };
    return normalized;
  };

  const UserPatchCombatTargetingRuleForAbility=combatTargetingRuleForAbility;

  combatTargetingRuleForAbility=function(abilityId) {
    if(abilityId==="hide")return {
      side:"ally", mode:COMBAT_TARGETING_MODES.self
    };
    if(abilityId==="skill_feat_stealth_monster_plunder")return {
      side:"enemy", mode:COMBAT_TARGETING_MODES.single
    };
    if(abilityId==="sweep_strike")return {
      side:"enemy", mode:COMBAT_TARGETING_MODES.row
    };
    if(abilityId==="leg_sweep")return {
      side:"enemy", mode:COMBAT_TARGETING_MODES.row
    };
    return UserPatchCombatTargetingRuleForAbility(abilityId);
  };

  const UserPatchAbilitySpCost=abilitySpCost;

  abilitySpCost=function(player, abilityId) {
    if(abilityId==="hide") {
      const rank=classFeatRankValue(player, "hide");
      return rank>0?1:0;
    }
    if(abilityId==="executioners_swing") {
      const rank=classFeatRankValue(player, "executioners_swing");
      return rank>0?1+rank:0;
    }
    if(abilityId==="sweep_strike") {
      const rank=classFeatRankValue(player, "sweep_strike");
      return rank>0?1+rank:0;
    }
    if(abilityId==="leg_sweep") {
      const rank=classFeatRankValue(player, "leg_sweep");
      return rank>0?1+rank:0;
    }
    if(abilityId==="skill_feat_stealth_monster_plunder")return 0;
    return UserPatchAbilitySpCost(player, abilityId);
  };

  const UserPatchCanUseActiveAbility=canUseActiveAbility;

  canUseActiveAbility=function(st, abilityId) {
    const base=UserPatchCanUseActiveAbility(st, abilityId);
    if(!base.ok)return base;
    if(abilityId==="sweep_strike"||abilityId==="leg_sweep") {
      const ap=attackProfile(st.player);
      if(!weaponTechniqueAttackMatches(ap, "polearm"))return {
        ok:false, reason:"Requires a polearm."
      };
    }
    if(abilityId==="skill_feat_stealth_monster_plunder") {
      const enemy=preferredCombatEnemy(st);
      if(enemy&&enemy.stolen)return {
        ok:false, reason:"You already stole from that monster."
      };
    }
    return base;
  };

  function pfCombatActionDisabledReason(st, tags, options) {
    const opts=options||{
    };
    const selected=st&&st.combat&&st.combat.selectedTargetId?getCombatParticipantInfo(st, st.combat.selectedTargetId):null;
    if(!st||!st.combat)return"You are not currently in combat.";
    if(opts.needsEnemyTarget) {
      if(!selected)return"Select a target first.";
      if(selected.side!=="enemy")return"Select an enemy target first.";
    }
    if(st.combat.turn!=="player")return"It is not your turn.";
    return pfActionDisabledReason(st.player, tags);
  }

  renderCombatTab=function(){normalizeCombatState(state);if(!state.combat){return`
          <div class="small muted">You are not currently in combat.</div>
          <div style="margin-top:10px"><button class="btn" id="btn_back">Return to Explore</button></div>
        `;}const selected=state.combat.selectedTargetId?getCombatParticipantInfo(state,state.combat.selectedTargetId):null;const ap=attackProfile(state.player);const offAp=offHandAttackProfile(state.player);const dualAgileAttack=!!(ap&&ap.weapon&&ap.isAgileWeapon&&offAp&&offAp.weapon&&offAp.isAgileWeapon);const offHandPenalty=offAp?offHandAttackPenalty(offAp):0;const dualWieldRank=isOffHandWeaponAttack(offAp)?classFeatRankValue(state.player,"dual_wield_mastery"):0;const offHandNetBonus=offAp?Number(offAp.attackBonus||0)+offHandPenalty:0;const offHandBreakdown=[];if(offHandPenalty!==0)offHandBreakdown.push(`${fmtSigned(offHandPenalty)} off-hand penalty`);if(dualWieldRank>0)offHandBreakdown.push(`Dual Wield Mastery ${fmtSigned(dualWieldRank)}`);const ammoItem=ap&&ap.ammoItemId?getItem(ap.ammoItemId):null;const ammoLine=ap&&ap.needsAmmo?(ap.outOfAmmo?`No ${ammoItem ? ammoItem.name.toLowerCase() : "ammo"} remaining. This weapon currently attacks as an unarmed strike.`:`${ap.ammoCount} ${ammoItem ? ammoItem.name.toLowerCase() : "ammo"} remaining.`):"";const attackDisabledReason=pfCombatActionDisabledReason(state,["arm"],{needsEnemyTarget:true});const guardDisabledReason=pfCombatActionDisabledReason(state,["arm"],{needsEnemyTarget:false});const fleeDisabledReason=pfCombatActionDisabledReason(state,["leg"],{needsEnemyTarget:false});const attackButton=renderTooltipWrappedButton(`<button class="btn primary" id="btn_attack" ${attackDisabledReason ? "disabled" : ""}>Attack</button>`,attackDisabledReason);const guardButton=renderTooltipWrappedButton(`<button class="btn" id="btn_guard" ${guardDisabledReason ? "disabled" : ""}>Guard</button>`,guardDisabledReason);const itemsDisabledReason=combatItemsDisabledReason(state,selected);const itemsButton=renderTooltipWrappedButton(`<button class="btn" id="btn_items_toggle" ${itemsDisabledReason ? "disabled" : ""}>Items</button>`,itemsDisabledReason);const fleeButton=renderTooltipWrappedButton(`<button class="btn danger" id="btn_flee" ${fleeDisabledReason ? "disabled" : ""}>Flee</button>`,fleeDisabledReason);const activeCombatAbilities=playerAbilityIds(state.player).filter(id=>getAbility(id).kind==="active"&&(getAbility(id).contexts||[]).includes("combat"));const passiveCombatAbilities=playerAbilityIds(state.player).filter(id=>getAbility(id).kind==="passive"&&(getAbility(id).contexts||[]).includes("combat"));const activeButtons=activeCombatAbilities.length?activeCombatAbilities.map(id=>{const ability=getAbility(id);const availability=canUseActiveAbility(state,id);const button=`<button class="btn" data-ability-use="${ability.id}" data-ability="${ability.id}" ${availability.ok ? "" : "disabled"}>${escapeHtml(ability.name)}</button>`;return renderTooltipWrappedButton(button,availability.ok?"":availability.reason);}).join(""):`<span class="small muted">No active combat feats.</span>`;const itemButtons=getCombatUsableItemsForTarget(state,selected).map(entry=>`
        <button class="btn" type="button" data-combat-item="${escapeHtml(entry.itemId)}">
          ${escapeHtml(entry.item.name)} <span class="muted">×${entry.qty}</span>
        </button>
      `).join("");const detailsHtml=selected?`
        <div class="combatTargetHead">
          <div>
            <div class="combatTargetLabel">Selected ${selected.side === "enemy" ? "Target" : "Party Member"}</div>
            <div class="combatTargetName">${escapeHtml(selected.name)}</div>
          </div>
          <span class="pill combatDetailsPill" data-combat-details="${escapeHtml(selected.id)}">Details</span>
        </div>
        <div class="combatTargetStats">
          <span class="pill"><span class="muted">HP</span> <strong class="mono">${selected.hp.current}/${selected.hp.max}</strong></span>
          <span class="pill"><span class="muted">AC</span> <strong class="mono">${selected.ac}</strong></span>
        </div>
      `:`<div class="small muted">Select a combatant to inspect them.</div>`;return`
        <div class="grid combatTabLayout" style="gap:12px">
          <div class="panel combatBattlefieldPanel">
            <header><h2>Battlefield</h2><div class="hint">Front and back rows collapse forward automatically.</div></header>
            <div class="body combatBattlefieldBody">
              ${renderCombatFormation(state, "enemy", "Enemy Side")}
              <div class="combatTargetCard">
                ${detailsHtml}
                <div class="combatActionButtons">
                  ${attackButton}
                  ${guardButton}
                  ${itemsButton}
                  ${fleeButton}
                </div>
                ${state.combat.ui && state.combat.ui.panel === "items" ? `
                  <div class="combatItemPanel">
                    <div class="combatSubheading">Combat Items</div>
                    <div class="combatActionButtons">
                      ${itemButtons || `<span class="small muted">No usable combat items for this target.</span>`}
                    </div>
                  </div>
                ` : ""}
                <div class="combatActionMeta small muted" style="line-height:1.5">
                  Attack with <strong>${escapeHtml(ap.weaponName)}</strong> (attack ${fmtSigned(ap.attackBonus)}, damage ${escapeHtml(ap.damageExpr)}+mod).
                  ${dualAgileAttack ? `<br/>Off-hand follow-up with <strong>${escapeHtml(offAp.weaponName)}</strong> at ${fmtSigned(offHandNetBonus)} to hit${offHandBreakdown.length ? ` (${escapeHtml(offHandBreakdown.join(", "))})` : ""}, then normal damage on a hit.` : ``}
                  ${ammoLine ? `<br/>${escapeHtml(ammoLine)}` : ``}
                </div>
                <div style="margin-top:12px">
                  <div class="combatSubheading">Feats</div>
                  <div class="combatActionButtons">${activeButtons}</div>
                </div>
              </div>
              ${renderCombatFormation(state, "ally", "Player Side")}
            </div>
          </div>

          <div class="panel">
            <header><h2>Combat Reference</h2><div class="hint">Compact status</div></header>
            <div class="body">
              <div class="small muted" style="margin-bottom:8px; line-height:1.5">
                Turn: <strong>${escapeHtml(state.combat.turn)}</strong>. Select a monster to attack or an ally to use a healing potion.
              </div>
              <div style="margin-top:12px">
                <div class="small muted" style="margin-bottom:6px">Passive combat feats</div>
                ${renderAbilityBadgeList(passiveCombatAbilities, "No passive combat feats")}
              </div>
              <div style="margin-top:12px">
                <div class="small muted" style="margin-bottom:6px">Your status effects</div>
                ${renderStatusEffectBadges(state.player, "No active effects")}
              </div>
              <div style="margin-top:12px">
                <div class="small muted" style="margin-bottom:6px">Current resistances</div>
                ${renderResistanceBadgeList(state.player, "No active resistances")}
              </div>
              <div style="margin-top:12px" class="small muted">
              </div>
            </div>
          </div>
        </div>
      `;};

  wireCombatTab=function() {
    if(!state.combat) {
      document.getElementById("btn_back").addEventListener("click", ()=> {
        state.tab="explore";
        render();
      });
      return;
    }
    document.querySelectorAll("[data-combat-select]").forEach(btn=> {
      btn.addEventListener("click", ()=> {
        const combatId=btn.getAttribute("data-combat-select");
        setSelectedCombatTarget(state, combatId);
        render();
      });
    });
    const attackBtn=document.getElementById("btn_attack");
    if(attackBtn)attackBtn.addEventListener("click", ()=>playerAttack(state));
    const guardBtn=document.getElementById("btn_guard");
    if(guardBtn)guardBtn.addEventListener("click", ()=>guardAction(state));
    const itemsToggleBtn=document.getElementById("btn_items_toggle");
    if(itemsToggleBtn)itemsToggleBtn.addEventListener("click", ()=> {
      if(!state.combat||!state.combat.ui)return;
      state.combat.ui.panel=state.combat.ui.panel==="items"?"actions":"items";
      render();
    });
    document.querySelectorAll("[data-combat-item]").forEach(btn=> {
      btn.addEventListener("click", ()=> {
        const itemId=btn.getAttribute("data-combat-item");
        useCombatItemOnTarget(state, itemId);
      });
    });
    const fleeBtn=document.getElementById("btn_flee");
    if(fleeBtn)fleeBtn.addEventListener("click", ()=>flee(state));
    document.querySelectorAll("button[data-ability-use]").forEach(btn=> {
      btn.addEventListener("click", ()=> {
        const abilityId=btn.getAttribute("data-ability-use");
        useActiveAbility(state, abilityId);
      });
    });
    const mainBody=document.getElementById("main_body");
    wireResolvedTooltips(mainBody, "[data-combat-details]", el=>combatantDetailsTooltipHtml(state, el.getAttribute("data-combat-details")||""));
  };

  function guardAction(st) {
    normalizeCombatState(st);
    if(!st.combat||st.combat.turn!=="player")return;
    const disabledReason=pfActionDisabledReason(st.player, ["arm"]);
    if(disabledReason) {
      log(st, disabledReason);
      return;
    }
    beginCombatToastBatch("player");
    pfSetPendingPlayerAction(st, "guard_action", ["arm"]);
    addOrRefreshStatusEffect(st.player, createStatusEffect("guarded", {
      duration:1, maxDuration:1
    }));
    log(st, "You guard and become Guarded for 1 round.");
    notifyCombatAction("You guard.", "good");
    const pending=pfConsumePendingPlayerAction(st);
    pfProcessHiddenAfterAction(st, pending);
    advanceStatusEffectsAfterAction(st);
    restoreEnemySelectionBetweenRounds(st);
    if(st.combat)enemyTurn(st);
    else {
      flushCombatToastBatch();
      save(st);
    }
    render();
  }

  playerAttack=function(st) {
    normalizeCombatState(st);
    if(!st.combat||st.combat.turn!=="player")return;
    const disabledReason=pfActionDisabledReason(st.player, ["arm"]);
    if(disabledReason) {
      log(st, disabledReason);
      return;
    }
    beginCombatToastBatch("player");
    pfSetPendingPlayerAction(st, "basic_attack", ["arm"]);
    const mainResult=resolvePlayerAttack(st);
    let usedAction=mainResult.usedAction;
    if(st.combat&&!mainResult.enemyDefeated&&hasDualAgileAttack(st.player)) {
      const offHand=offHandAttackProfile(st.player);
      if(offHand) {
        const offResult=resolvePlayerAttack(st, {
          attack:offHand, prefix:"Off-hand follow-up. "
        });
        usedAction=usedAction||offResult.usedAction;
      }
    }
    if(usedAction) {
      const pending=pfConsumePendingPlayerAction(st);
      pfProcessHiddenAfterAction(st, pending);
      advanceStatusEffectsAfterAction(st);
    } else {
      pfClearPendingPlayerAction(st, "basic_attack");
    }
    restoreEnemySelectionBetweenRounds(st);
    if(st.combat)enemyTurn(st);
    else {
      flushCombatToastBatch();
      save(st);
    }
    render();
  };

  useCombatItemOnTarget=function(st,itemId){const selected=st.combat&&st.combat.selectedTargetId?getCombatParticipantInfo(st,st.combat.selectedTargetId):null;const validation=canUseCombatItemOnTarget(st,itemId,selected);if(!validation.ok){log(st,validation.reason||"That item can't be used right now.");return;}beginCombatToastBatch("player");pfSetPendingPlayerAction(st,itemId,["item"]);const item=getItem(itemId);removeItem(st.player,itemId,1);const healing=applyCombatHealingItemToTarget(item,validation.target);log(st,`You use ${item.name} on ${validation.target.name} and recover ${healing.healed} HP.`,{rollGroups:healing.rollGroup?[healing.rollGroup]:[]});notifyCombatAction(`You use ${item.name} on ${validation.target.name} and recover ${healing.healed} HP.`,"good");if(st.combat&&st.combat.ui)st.combat.ui.panel="actions";const pending=pfConsumePendingPlayerAction(st);pfProcessHiddenAfterAction(st,pending);advanceStatusEffectsAfterAction(st);restoreEnemySelectionBetweenRounds(st);if(st.combat)enemyTurn(st);else{flushCombatToastBatch();save(st);}render();};

  flee=function(st){normalizeCombatState(st);if(!st.combat||st.combat.turn!=="player")return;const disabledReason=pfActionDisabledReason(st.player,["leg"]);if(disabledReason){log(st,disabledReason);return;}beginCombatToastBatch("player");pfSetPendingPlayerAction(st,"flee",["leg"]);const enemies=combatEnemyList(st);const highestLevel=enemies.reduce(function(best,enemy){return Math.max(best,Number(enemy.level||0));},0);const hasAdvantage=hasAbility(st.player,"skill_feat_acrobatics_mastery");const fleeRolls=hasAdvantage?[rollD20(),rollD20()]:[rollD20()];const keptRoll=fleeRolls.reduce(function(best,value){return Math.max(best,Number(value||0));},0);const parts=[{type:"dice",sourceKey:"flee_check",label:"Acrobatics",note:hasAdvantage?"Agility grants advantage on flee checks.":"",expr:hasAdvantage?"2d20kh1":"1d20",rolls:fleeRolls,value:keptRoll},...cloneRollParts(skillCheckSourceParts(st.player,"Acrobatics"))];const total=sumRollParts(parts);const dc=12+highestLevel*2;const success=keptRoll===20||total>=dc;const rollGroup=buildLogRollGroup({label:"Flee",parts,total,targetLabel:"DC",targetValue:dc,outcome:success?"success":"failure"});const pending=pfConsumePendingPlayerAction(st);pfProcessHiddenAfterAction(st,pending);if(success){log(st,"You flee successfully.",{rollGroups:[rollGroup]});notifyCombatAction(`You escape from ${encounterEnemySummary(enemies)}.`,"neutral");advanceStatusEffectsAfterAction(st);if(st.combat)st.combat.defeatedEnemies=enemies.slice();flushCombatToastBatch();endCombat(st,false);}else{log(st,"You fail to flee.",{rollGroups:[rollGroup]});notifyCombatAction(`You fail to escape from ${encounterEnemySummary(enemies)}.`,"miss");advanceStatusEffectsAfterAction(st);enemyTurn(st);}save(st);render();};

  const UserPatchFinishPlayerAbilityUse=finishPlayerAbilityUse;

  finishPlayerAbilityUse=function(st) {
    const pending=pfConsumePendingPlayerAction(st);
    pfProcessHiddenAfterAction(st, pending);
    return UserPatchFinishPlayerAbilityUse(st);
  };

  function pfDispatchCustomActiveAbility(st, abilityId, handler) {
    const ability=getAbility(abilityId);
    pfSetPendingPlayerAction(st, abilityId, ability&&ability.tags||[]);
    const result=handler(st);
    pfClearPendingPlayerAction(st, abilityId);
    return result;
  }

  function pfPolearmTechniqueAttackProfile(st) {
    const ap=attackProfile(st.player);
    return weaponTechniqueAttackMatches(ap, "polearm")?ap:null;
  }

  function useHide(st){if(st.combat)beginCombatToastBatch("player");const check=canUseActiveAbility(st,"hide");if(!check.ok){log(st,check.reason);return;}const rank=classFeatRankValue(st.player,"hide");const dc=pfHighestEnemyWillDc(st);spendAbilitySp(st,"hide");const rollData=rollD20Detailed("hide_check",{label:"Stealth",note:"Hide uses Stealth against the highest enemy Will DC."});const parts=[...cloneRollParts(rollData.parts),...cloneRollParts(skillCheckSourceParts(st.player,"Stealth"))];const total=sumRollParts(parts);const success=rollData.total===20||total>=dc;if(success){addOrRefreshStatusEffect(st.player,createHiddenStatusEffect(rank));log(st,`Hide succeeds. You gain Hidden for ${rank} round${rank === 1 ? "" : "s"}.`,{rollGroups:[buildLogRollGroup({label:"Hide",parts,total,targetLabel:"Will DC",targetValue:dc,outcome:"success"})]});notifyCombatAction("You slip out of sight.","good");}else{log(st,"Hide fails.",{rollGroups:[buildLogRollGroup({label:"Hide",parts,total,targetLabel:"Will DC",targetValue:dc,outcome:"failure"})]});notifyCombatAction("Hide fails.","miss");}finishPlayerAbilityUse(st);}

  function useMonsterPlunder(st){if(st.combat)beginCombatToastBatch("player");const check=canUseActiveAbility(st,"skill_feat_stealth_monster_plunder");if(!check.ok){log(st,check.reason);return;}const enemy=preferredCombatEnemy(st);if(!enemy){log(st,"Select an enemy target first.");return;}const dc=creatureSaveDc(enemy,"will");const rollData=rollD20Detailed("steal_check",{label:"Stealth",note:"Steal uses Stealth against the target's Will DC."});const parts=[...cloneRollParts(rollData.parts),...cloneRollParts(skillCheckSourceParts(st.player,"Stealth"))];const total=sumRollParts(parts);const success=rollData.total===20||total>=dc;if(success){enemy.stolen=true;let rewardText="Nothing worth taking.";if(enemy.loot&&Array.isArray(enemy.loot.items)&&enemy.loot.items.length){const drop=enemy.loot.items[rollInt(0,enemy.loot.items.length-1)];const qty=rollInt(Number(drop.qty&&drop.qty[0]||1),Number(drop.qty&&drop.qty[1]||1));addItem(st.player,drop.id,qty);rewardText=`${qty}× ${getItem(drop.id).name}`;}else if(enemy.loot&&enemy.loot.coins){const coins=rollInt(Number(enemy.loot.coins[0]||0),Number(enemy.loot.coins[1]||0));addCoins(st,coins);rewardText=formatCoins(coins);}log(st,`Steal succeeds against ${enemy.name}. You take ${rewardText}.`,{rollGroups:[buildLogRollGroup({label:"Steal",parts,total,targetLabel:"Will DC",targetValue:dc,outcome:"success"})]});notifyCombatAction(`You steal ${rewardText}.`,"good");}else{log(st,`Steal fails against ${enemy.name}.`,{rollGroups:[buildLogRollGroup({label:"Steal",parts,total,targetLabel:"Will DC",targetValue:dc,outcome:"failure"})]});notifyCombatAction(`You fail to steal from ${enemy.name}.`,"miss");}finishPlayerAbilityUse(st);}

  function useSweepStrike(st) {
    if(st.combat)beginCombatToastBatch("player");
    const check=canUseActiveAbility(st, "sweep_strike");
    if(!check.ok) {
      log(st, check.reason);
      return;
    }
    const selection=validateCombatTargetSelection(st, combatTargetingRuleForAbility("sweep_strike"));
    if(!selection.ok) {
      log(st, selection.reason||"Select an enemy target first.");
      return;
    }
    const rank=classFeatRankValue(st.player, "sweep_strike");
    spendAbilitySp(st, "sweep_strike");
    for(const info of selection.targets||[]) {
      if(!st.combat)break;
      const enemy=info&&info.entity||null;
      if(!enemy||!isCombatEnemyAlive(enemy))continue;
      const ap=pfPolearmTechniqueAttackProfile(st);
      if(!ap) {
        log(st, "Requires a polearm.");
        break;
      }
      const result=resolvePlayerAttack(st, {
        prefix:"Sweep Strike: ", attack:ap, target:enemy
      });
      if(result&&result.hit&&enemy&&enemy.hp&&enemy.hp.current>0&&(Number(result.total||0)+rank)>=creatureSaveDc(enemy, "reflex")) {
        applyWeaponTechniqueStatus(st, enemy, createStatusEffect("off_guard"), enemy.name+" becomes Off-Guard from Sweep Strike.");
      }
    }
    finishPlayerAbilityUse(st);
  }

  function useLegSweep(st) {
    if(st.combat)beginCombatToastBatch("player");
    const check=canUseActiveAbility(st, "leg_sweep");
    if(!check.ok) {
      log(st, check.reason);
      return;
    }
    const selection=validateCombatTargetSelection(st, combatTargetingRuleForAbility("leg_sweep"));
    if(!selection.ok) {
      log(st, selection.reason||"Select an enemy target first.");
      return;
    }
    const rank=classFeatRankValue(st.player, "leg_sweep");
    spendAbilitySp(st, "leg_sweep");
    for(const info of selection.targets||[]) {
      if(!st.combat)break;
      const enemy=info&&info.entity||null;
      if(!enemy||!isCombatEnemyAlive(enemy))continue;
      const ap=pfPolearmTechniqueAttackProfile(st);
      if(!ap) {
        log(st, "Requires a polearm.");
        break;
      }
      const result=resolvePlayerAttack(st, {
        prefix:"Leg Sweep: ", attack:ap, target:enemy
      });
      if(result&&result.hit&&enemy&&enemy.hp&&enemy.hp.current>0&&(Number(result.total||0)+rank)>=creatureSaveDc(enemy, "reflex")) {
        applyWeaponTechniqueStatus(st, enemy, createPinnedStatusEffect(rank), enemy.name+" is pinned by Leg Sweep.");
      }
    }
    finishPlayerAbilityUse(st);
  }

  const UserPatchUseActiveAbility=useActiveAbility;

  useActiveAbility=function(st, abilityId) {
    if(abilityId==="hide")return pfDispatchCustomActiveAbility(st, abilityId, useHide);
    if(abilityId==="skill_feat_stealth_monster_plunder")return pfDispatchCustomActiveAbility(st, abilityId, useMonsterPlunder);
    if(abilityId==="sweep_strike")return pfDispatchCustomActiveAbility(st, abilityId, useSweepStrike);
    if(abilityId==="leg_sweep")return pfDispatchCustomActiveAbility(st, abilityId, useLegSweep);
    let ability=null;
    try {
      ability=getAbility(abilityId);
    } catch(_) {
      ability=null;
    }
    pfSetPendingPlayerAction(st, abilityId, ability&&ability.tags||[]);
    const result=UserPatchUseActiveAbility(st, abilityId);
    pfClearPendingPlayerAction(st, abilityId);
    return result;
  };

  calcAC=function(player) {
    const dexVal=statMod(player.stats.DEX);
    const wisVal=statMod(player.stats.WIS);
    const armorId=player.equipment.armor;
    const armor=armorId?getItem(armorId):null;
    const shieldId=player.equipment.offHand;
    const shield=shieldId?getItem(shieldId):null;
    const martialBodyRank=classFeatRankValue(player, "martial_body");
    const monkUnarmoredDefense=martialBodyRank>0&&(!armor||armor.category==="unarmored");
    let ac=10;
    if(monkUnarmoredDefense) {
      ac=9+martialBodyRank;
      ac+=dexVal+wisVal;
    } else if(armor&&armor.type==="armor") {
      ac+=armor.acBonus||0;
      const cap=dexCapFromArmor(armor);
      ac+=clamp(dexVal, -999, cap);
    } else {
      ac+=dexVal;
    }
    if(shield&&shield.category==="shield")ac+=shield.acBonus||0;
    if(hasEquippedShield(player)&&classFeatRankValue(player, "guard_strike")>=classFeatMaxRank("guard_strike")&&hasStatusEffect(player, "guarded"))ac+=1;
    ac+=dualWieldMasteryAcBonus(player);
    ac+=statusModifierTotal(player, "acModifier");
    return Math.max(0, ac);
  };

  const UserPatchMeleeFlyingPenalty=meleeFlyingPenalty;

  meleeFlyingPenalty=function(attack, enemy, options) {
    if(enemy&&hasStatusEffect(enemy, "off_guard"))return 0;
    return UserPatchMeleeFlyingPenalty(attack, enemy, options);
  };

  craftRetainedIngredientsForOutcome=function(player, recipe, mode) {
    if(mode==="retain"&&player&&recipe&&hasAbility(player, "skill_feat_crafting_masterwork")) {
      const totals=new Map();
      for(const ingredient of recipe.ingredients||[]) {
        let item=null;
        try {
          item=getItem(ingredient.itemId);
        } catch(_) {
          item=null;
        }
        if(!item||item.type!=="resource")continue;
        const qty=Math.max(0, Math.floor(Number(ingredient.qty||0)));
        const retained=Math.ceil(qty/2);
        if(retained<=0)continue;
        totals.set(ingredient.itemId, (totals.get(ingredient.itemId)||0)+retained);
      }
      if(totals.size) {
        return Array.from(totals.entries()).map(function(entry) {
          return {
            itemId:entry[0], qty:entry[1]
          };
        });
      }
    }
    return pickCraftResourceAdjustments(player, recipe, mode);
  };

  applyEncounterVictoryRewards=function(st,enemies){const defeated=Array.isArray(enemies)?enemies.filter(Boolean):[];const rewards=[];let totalXp=0;let totalCoins=0;const itemTotals=new Map();defeated.forEach(enemy=>{totalXp+=Number(enemy.level||0)*35;if(enemy.loot&&enemy.loot.coins){const lo=Number(enemy.loot.coins[0]||0);const hi=Number(enemy.loot.coins[1]||0);totalCoins+=rollInt(lo,hi);}if(enemy.loot&&Array.isArray(enemy.loot.items)){enemy.loot.items.forEach(drop=>{if(Math.random()>Number(drop.chance||0))return;const qty=rollInt(Number(drop.qty&&drop.qty[0]||1),Number(drop.qty&&drop.qty[1]||1));itemTotals.set(drop.id,(itemTotals.get(drop.id)||0)+qty);});}});st.player.xp+=totalXp;rewards.push(`${totalXp} XP`);log(st,`You defeat ${encounterEnemySummary(defeated)} and gain ${totalXp} XP.`);if(totalCoins>0){addCoins(st,totalCoins);rewards.push(formatCoins(totalCoins));log(st,`Loot: ${formatCoins(totalCoins)}.`);}itemTotals.forEach((qty,itemId)=>{addItem(st.player,itemId,qty);rewards.push(`${qty}× ${getItem(itemId).name}`);log(st,`Loot: ${qty}× ${getItem(itemId).name}.`);});if((hasAbility(st.player,"skill_survival_field_dressing")||hasAbility(st.player,"skill_feat_survival_field_dressing"))&&defeated.length){const healRoll=rollDiceDetailed("1d6","field_dressing",{label:"Field Dressing"});const before=st.player.hp.current;st.player.hp.current=clamp(st.player.hp.current+healRoll.total,0,st.player.hp.max);const healed=st.player.hp.current-before;rewards.push(`${healed} HP recovered`);log(st,`Field Dressing restores ${healed} HP after the fight.`,{rollGroups:[buildLogRollGroup({label:"Field Dressing",parts:cloneRollParts(healRoll.parts),total:healRoll.total})]});}defeated.forEach(enemy=>notifyQuestEvent(st,"kill",{monsterId:enemy.id,count:1}));return rewards;};

  const UserPatchClassFeatEffectLines=classFeatEffectLines;

  classFeatEffectLines=function(featId,rank){const r=Math.max(0,Number(rank||0));if(r<=0&&["martial_body","hide","sweep_strike","leg_sweep","parry","guard_strike","retaliate"].includes(featId))return["No ranks invested yet."];if(featId==="martial_arts")return[`Unarmed attacks become agile.`,`Unarmed and simple-weapon damage dice become a minimum of 1d6.`,`Unarmed attacks: +${r} to hit.`];if(featId==="martial_body")return[`Unarmored AC: ${9 + r} + DEX mod + WIS mod.`];if(featId==="hide")return[`Stealth vs highest enemy Will DC.`,`On success: Hidden for ${r} round${r === 1 ? "" : "s"}.`];if(featId==="feint_strike")return[`Sword Attack.`,`+${r} to Damage.`,`If the total attack +${r} beats Reflex DC: apply Off-Guard.`];if(featId==="blade_dance")return[`Sword Attack target enemy row.`,`+${r} to Damage.`];if(featId==="stunning_palm")return[`Unarmed attack.`,`If final attack total +${r} beats Fortitude DC: apply Staggered for 1 round.`];if(featId==="hundred_fists")return[`Two unarmed attacks.`,`If First attack hits: Second attack gains +${r} damage.`];if(featId==="hamstring_cut")return[`Dagger attack.`,`On hit: Bleed ${r} for 2 rounds.`,`If total attack +${r} beats Reflex DC: apply Off-Guard.`];if(featId==="shadow_flurry")return[`Two dagger attacks.`,`If strike 1 hits: target becomes Off-Guard before strike 2.`,`If you are Hidden: both attacks gain +${r} damage.`];if(featId==="pinning_shot")return[`Bow attack.`,`If final attack total +${r} beats Reflex DC: apply Pinned for ${r} round${r === 1 ? "" : "s"}.`];if(featId==="volley_fire")return[`Bow attack target enemy row.`,`Damage on each hit: +${Math.max(1, r - 1)}.`];if(featId==="concussive_blow")return[`Mace attack.`,`Damage on hit: +${r}.`,`If total attack +${r} beats Fortitude DC: apply Concussed for ${r} round${r === 1 ? "" : "s"}.`];if(featId==="rending_chop")return[`Axe attack.`,`Damage on hit: +${r}.`,`If total attack +${r} beats Fortitude DC: apply Disarmed for ${r} round${r === 1 ? "" : "s"}.`];if(featId==="executioners_swing")return[`Axe attack.`,`Damage on hit: +${r}.`,`If the target is below 50% HP before the hit: double the damage dealt.`];if(featId==="sweep_strike")return[`Polearm attack target enemy row.`,`If total attack +${r} beats Reflex DC: apply Off-Guard.`];if(featId==="leg_sweep")return[`Polearm attack target enemy row.`,`If total attack +${r} beats Reflex DC: apply Pinned for ${r} round${r === 1 ? "" : "s"}.`];if(featId==="parry")return[`If an enemy misses your AC by more than ${10 - r}: that enemy becomes Off-Guard.`];if(featId==="guard_strike"){const lines=[`While Guarded, the first enemy that attacks you each round triggers a free counterattack.`,`+${r} to Counterattack damage.`];if(r>=classFeatMaxRank(featId))lines.push(`While Guarded: +1 AC.`);else lines.push(`At rank ${classFeatMaxRank(featId)}: while Guarded, gain +1 AC.`);return lines;}if(featId==="retaliate")return[`Once per round while below 50% HP, counterattack the first enemy that hits you for free.`];return UserPatchClassFeatEffectLines(featId,rank);};

  const UserPatchClassFeatNextRankPreviewLines=classFeatNextRankPreviewLines;

  classFeatNextRankPreviewLines=function(featId, rank) {
    if(["martial_arts", "martial_body", "hide", "feint_strike", "blade_dance", "stunning_palm", "hundred_fists", "hamstring_cut", "shadow_flurry", "pinning_shot", "volley_fire", "concussive_blow", "rending_chop", "executioners_swing", "sweep_strike", "leg_sweep", "parry", "guard_strike", "retaliate"].includes(featId)) {
      const current=Math.max(0, Number(rank||0));
      const next=Math.min(classFeatMaxRank(featId), current+1);
      if(next<=current)return["Already at maximum rank."];
      return pfActionDetailBlock(classFeatEffectLines(featId, next));
    }
    return UserPatchClassFeatNextRankPreviewLines(featId, rank);
  };

  const UserPatchSkillFeatEffectLines=skillFeatEffectLines;

  skillFeatEffectLines=function(featId, rank) {
    const r=Math.max(0, Number(rank||0));
    if(r<=0&&["skill_feat_crafting_masterwork", "skill_feat_stealth_monster_plunder", "skill_feat_survival_mastery", "skill_feat_survival_field_dressing"].includes(featId))return["No ranks invested yet."];
    if(featId==="skill_feat_crafting_masterwork")return["Critical crafting successes retain half of the resource ingredients spent."];
    if(featId==="skill_feat_stealth_monster_plunder")return["Active combat action.", "Stealth vs the target's Will DC.", "On success: steal one monster drop, or coins if it has no item loot."];
    if(featId==="skill_feat_survival_mastery")return["Successful non-ore gathers: +1 resource."];
    if(featId==="skill_feat_survival_field_dressing")return["After winning combat: recover 1d6 HP."];
    return UserPatchSkillFeatEffectLines(featId, rank);
  };

  const UserPatchSkillFeatNextRankPreviewLines=skillFeatNextRankPreviewLines;

  skillFeatNextRankPreviewLines=function(featId, rank) {
    if(["skill_feat_crafting_masterwork", "skill_feat_stealth_monster_plunder", "skill_feat_survival_mastery", "skill_feat_survival_field_dressing"].includes(featId)) {
      const current=Math.max(0, Number(rank||0));
      const next=Math.min(skillFeatMaxRank(featId), current+1);
      if(next<=current)return["Already at maximum rank."];
      return pfActionDetailBlock(skillFeatEffectLines(featId, next));
    }
    return UserPatchSkillFeatNextRankPreviewLines(featId, rank);
  };

  classFeatTooltipHtml=function(featId,options){options=options||{};const feat=getClassFeat(featId);if(!feat)return"";const player=options.playerOverride||(state&&state.player?state.player:null);const currentRank=options.rank==null?classFeatRankValue(player,featId):Math.max(0,Number(options.rank||0));const baseRanks=normalizeClassFeatRanks(options.ranksOverride==null?(player&&player.classFeatRanks?player.classFeatRanks:{}):options.ranksOverride);const tooltipRanks={...baseRanks};if(currentRank>0)tooltipRanks[featId]=currentRank;else if(options.rank!=null)delete tooltipRanks[featId];const rows=[];const row=(k,v)=>`<div class="trow"><div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(v)}</div></div>`;rows.push(row("Source",`${(feat.classes || [feat.classId || "Class"]).join(" / ")} class feat`));rows.push(row("Rank",`${currentRank}/${classFeatMaxRank(feat)}`));rows.push(row("Type",`${feat.kind || "passive"} feat`));rows.push(row("Scope",Array.isArray(feat.contexts)&&feat.contexts.length?feat.contexts.join(", "):"-"));if(Array.isArray(feat.tags)&&feat.tags.length)rows.push(row("Tags",feat.tags.join(", ")));if(feat.kind==="active"){if(feat.id==="hunters_mark")rows.push(row("Cost",currentRank>0?"1 SP":"1 SP once invested"));else if(currentRank>0)rows.push(row("Cost",`${abilitySpCost(player || { classFeatRanks: tooltipRanks }, feat.id)} SP`));}const scalingLines=pfScalingDetailLinesForFeat(featId);return`
        <div style="font-weight:700; font-size:13px; margin-bottom:6px">${escapeHtml(`${feat.emoji || "*"} ${feat.name}`)}</div>
        <div class="small muted" style="margin-bottom:8px; line-height:1.45">${escapeHtml(feat.summary || "")}</div>
        ${rows.join("")}
        <div class="small muted" style="margin-top:8px; line-height:1.45">${scalingLines.map(line => `- ${escapeHtml(line)}`).join("<br/>")}</div>
      `;};

  skillFeatTooltipHtml=function(featId,options){options=options||{};const feat=getSkillFeat(featId);if(!feat)return"";const player=options.playerOverride||(state&&state.player?state.player:null);const ctx=buildFeatContext(player,{levelsOverride:options.levelsOverride||null,totalLevelOverride:options.totalLevelOverride==null?null:options.totalLevelOverride,statsOverride:options.statsOverride||null,skillProficiencyOverride:options.skillProficiencyOverride||null,classFeatRanksOverride:options.classFeatRanksOverride||null,skillFeatRanksOverride:options.skillFeatRanksOverride||null,generalFeatRanksOverride:options.generalFeatRanksOverride||null,questUnlocksOverride:options.questUnlocksOverride||null});const currentRank=skillFeatRankValue(ctx,featId);const req=evaluateSkillFeatRequirements(featId,ctx);const rawTotal=Number(ctx.rawSkillTotals[feat.skillId]||0);const row=function(k,v){return`<div class="trow"><div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(v)}</div></div>`;};const rows=[row("Source",(feat.skillId||"Skill")+" skill feat"),row("Rank",currentRank+"/"+skillFeatMaxRank(feat)),row("Requirement",req.items.map(function(item){return item.label;}).join(" • ")),row("Current total",feat.skillId+" "+fmtSigned(rawTotal)),row("Status",currentRank>0?"Invested":(req.ok?"Unlocked - spend 1 feat point":"Locked")),row("Type",(feat.kind||"passive")+" feat")];const scalingLines=pfScalingDetailLinesForFeat(featId);return`
        <div style="font-weight:700; font-size:13px; margin-bottom:6px">${escapeHtml((feat.emoji || "*") + " " + feat.name)}</div>
        <div class="small muted" style="margin-bottom:8px; line-height:1.45">${escapeHtml(feat.summary || "")}</div>
        ${rows.join("")}
        <div class="small muted" style="margin-top:8px; line-height:1.45">${scalingLines.map(function (line) { return "- " + escapeHtml(line); }).join("<br/>")}</div>
      `;};

  generalFeatTooltipHtml=function(featId,options){options=options||{};const feat=getGeneralFeat(featId);if(!feat)return"";const player=options.playerOverride||(state&&state.player?state.player:null);const ctx=buildFeatContext(player,{levelsOverride:options.levelsOverride||null,totalLevelOverride:options.totalLevelOverride==null?null:options.totalLevelOverride,statsOverride:options.statsOverride||null,skillProficiencyOverride:options.skillProficiencyOverride||null,classFeatRanksOverride:options.classFeatRanksOverride||null,skillFeatRanksOverride:options.skillFeatRanksOverride||null,generalFeatRanksOverride:options.generalFeatRanksOverride||null,questUnlocksOverride:options.questUnlocksOverride||null});const currentRank=generalFeatRankValue(ctx,featId);const req=evaluateGeneralFeatRequirements(featId,ctx);const row=function(k,v){return`<div class="trow"><div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(v)}</div></div>`;};const rows=[row("Source","General feat"),row("Rank",currentRank+"/"+generalFeatMaxRank(feat)),row("Requirement",req.items.map(function(item){return item.label;}).join(" • ")),row("Status",currentRank>0?"Invested":(req.ok?"Unlocked - spend feat points":"Locked")),row("Type",(feat.kind||"passive")+" feat")];const scalingLines=pfScalingDetailLinesForFeat(featId);return`
        <div style="font-weight:700; font-size:13px; margin-bottom:6px">${escapeHtml((feat.emoji || "*") + " " + feat.name)}</div>
        <div class="small muted" style="margin-bottom:8px; line-height:1.45">${escapeHtml(feat.summary || "")}</div>
        ${rows.join("")}
        <div class="small muted" style="margin-top:8px; line-height:1.45">${scalingLines.map(function (line) { return "- " + escapeHtml(line); }).join("<br/>")}</div>
      `;};

  abilityTooltipHtml=function(abilityId){if(isClassFeatId(abilityId))return classFeatTooltipHtml(abilityId);if(isSkillFeatId(abilityId))return skillFeatTooltipHtml(abilityId);if(isGeneralFeatId(abilityId))return generalFeatTooltipHtml(abilityId);const ability=getAbility(abilityId);const rows=[];const row=function(k,v){return`<div class="trow"><div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(v)}</div></div>`;};const costLabel=Number(ability&&ability.costSp||0)>0?(String(Number(ability.costSp))+" SP"):"";const durationLabel=abilityTooltipDurationLabel(ability);rows.push(row("Source",abilitySourceLabel(ability)));if(ability.unlockLevel!=null)rows.push(row("Unlock","Level "+ability.unlockLevel));rows.push(row("Type",(ability.kind||"-")+" feat"));if(costLabel)rows.push(row("Cost",costLabel));if(durationLabel)rows.push(row("Duration",durationLabel));rows.push(row("Scope",(ability.contexts||[]).join(", ")||"-"));if(Array.isArray(ability.tags)&&ability.tags.length)rows.push(row("Tags",ability.tags.join(", ")));return`
        <div style="font-weight:700; font-size:13px; margin-bottom:6px">${escapeHtml(ability.name)}</div>
        <div class="small muted" style="margin-bottom:8px; line-height:1.45">${escapeHtml(abilityTooltipSummaryText(ability))}</div>
        ${rows.join("")}
        ${Array.isArray(ability.details) && ability.details.length ? `<div class="small muted" style="margin-top:8px; line-height:1.45">${ability.details.map(function (line) { return `- ${escapeHtml(line)}`; }).join("<br/>")}</div>` : ``}
      `;};

  function pfPlayerCounterattackAllowed(st) {
    return!pfActionDisabledReason(st.player, ["arm"]);
  }

  function pfConsumeHiddenForCounterattack(st) {
    if(hasStatusEffect(st.player, "hidden")) {
      removeStatusEffect(st.player, "hidden");
      log(st, "Hidden ends when you make a counterattack.");
    }
  }

  function pfResolveFreeCounterattack(st, enemy, prefix, options) {
    if(!st||!st.combat||!enemy||!isCombatEnemyAlive(enemy))return {
      enemyDefeated:false
    };
    if(!pfPlayerCounterattackAllowed(st))return {
      enemyDefeated:false
    };
    pfConsumeHiddenForCounterattack(st);
    return resolvePlayerAttack(st, {
      prefix, target:enemy, ignoreFlyingPenalty:true, extraDamageOnHit:Number(options&&options.extraDamageOnHit||0), extraDamageSourceKey:options&&options.sourceKey||"counterattack_bonus", extraDamageSourceLabel:options&&options.sourceLabel||"Counterattack"
    });
  }

  function pfMonsterSpawnRow(st, preferredRow) {
    const prefer=normalizeCombatRow(preferredRow);
    const other=prefer===COMBAT_ROW_FRONT?COMBAT_ROW_BACK:COMBAT_ROW_FRONT;
    if(combatRowMembers(st, "enemy", prefer).length<COMBAT_MAX_COLUMNS)return prefer;
    if(combatRowMembers(st, "enemy", other).length<COMBAT_MAX_COLUMNS)return other;
    return null;
  }

  function pfSpawnEnemyCombatant(st,monsterId,preferredRow){if(!st||!st.combat)return null;const row=pfMonsterSpawnRow(st,preferredRow);if(!row)return null;const combatId=`enemy_spawn_${Date.now()}_${Math.floor(Math.random() * 100000)}`;const enemy=createEnemyCombatant(monsterId,combatId,row);st.combat.enemies=Array.isArray(st.combat.enemies)?st.combat.enemies:[];st.combat.enemies.push(enemy);return enemy;}

  const PF_MONSTER_TRAIT_ACTION_BUILDERS=Object.freeze({pack_hunter:function(){return[{id:"pack_hunter_call",name:"Pack Hunter",tags:["head"],execute:function(state,actingEnemy){actingEnemy.aiFlags=actingEnemy.aiFlags||{};actingEnemy.aiFlags.specialActionsUsed=actingEnemy.aiFlags.specialActionsUsed||{};if(actingEnemy.aiFlags.specialActionsUsed.pack_hunter_call){log(state,`${actingEnemy.name} has already called for backup.`);return{usedAction:false};}actingEnemy.aiFlags.specialActionsUsed.pack_hunter_call=true;const success=Math.random()<0.5;if(!success){log(state,`${actingEnemy.name} howls for backup, but no ally answers.`);notifyCombatAction(`${actingEnemy.name} calls for backup!`,"neutral");return{usedAction:true};}const spawned=pfSpawnEnemyCombatant(state,"wolf",actingEnemy.row);if(spawned){log(state,`${actingEnemy.name} howls and another wolf joins the battle.`);notifyCombatAction(`Another wolf joins the battle!`,"bad");}else{log(state,`${actingEnemy.name} howls for backup, but there is no room for another ally.`);notifyCombatAction(`${actingEnemy.name} calls for backup!`,"neutral");}return{usedAction:true};}}];}});

  function pfMonsterSpecialActions(st, enemy) {
    const actions=[];
    for(const trait of enemy&&enemy.traits||[]) {
      const builder=PF_MONSTER_TRAIT_ACTION_BUILDERS[normalizeTagId(trait)];
      if(typeof builder!=="function")continue;
      const built=builder(st, enemy);
      if(Array.isArray(built)&&built.length)actions.push(...built);
    }
    return actions;
  }

  function pfMonsterFlee(st,enemy){const disabledReason=pfActionDisabledReason(enemy,["leg"]);if(disabledReason){log(st,`${enemy.name} cannot flee: ${disabledReason}`);return{usedAction:true,endedCombat:false};}const rollData=rollD20Detailed("monster_flee_reflex",{label:"Reflex",note:`${enemy.name} forces a Reflex save as it tries to escape.`});const parts=[...cloneRollParts(rollData.parts)];const bonusPart=createRollModifierPart(saveTotal(st.player,"reflex"),"reflex_save","Reflex save","Your Reflex save bonus.");if(bonusPart)parts.push(bonusPart);const total=sumRollParts(parts);const dc=creatureSaveDc(enemy,"reflex");const success=rollData.total===20||total>=dc;log(st,success?`You stop ${enemy.name} from fleeing.`:`${enemy.name} flees and the encounter ends with no rewards.`,{rollGroups:[buildLogRollGroup({label:`${enemy.name} flee`,parts,total,targetLabel:"Reflex DC",targetValue:dc,outcome:success?"success":"failure"})]});if(success){notifyCombatAction(`${enemy.name} fails to escape.`,"good");return{usedAction:true,endedCombat:false};}const tile=currentTile(st);if(tile&&tile.type==="monster")tile.resolved=true;const summary=encounterEnemySummary(combatEnemyList(st));setCombatNotice(st,{kind:"neutral",title:"Escape",summary:`${summary} fled the encounter.`,sectionTitle:"Outcome",items:["No rewards were gained."]});st.combat=null;if(st.tab==="combat")st.tab="explore";notifyCombatAction(`${enemy.name} escapes.`,"neutral");return{usedAction:true,endedCombat:true};}

  function pfResolveEnemyAction(st,enemy){const rollAsReductionPart=function(rollData,sourceKey,label,note,currentValue){const applied=Math.max(0,Math.min(Math.max(0,Number(currentValue||0)),Math.max(0,Number(rollData&&rollData.total||0))));if(!applied)return null;const dicePart=Array.isArray(rollData&&rollData.parts)?rollData.parts.find(part=>part&&part.type==="dice"):null;const expr=dicePart&&dicePart.expr?dicePart.expr:"Roll";const rolls=dicePart&&Array.isArray(dicePart.rolls)?dicePart.rolls.join(", "):"-";const details=Number(rollData&&rollData.total||0)==applied?`${note} Rolled ${expr}: ${rolls}.`:`${note} Rolled ${expr}: ${rolls}; capped to ${applied}.`;return createRollModifierPart(-applied,sourceKey,`${label} ${expr}[${rolls}]`,details);};const maybeGuardStrike=function(){if(!st.combat)return false;if(!hasEquippedShield(st.player))return false;if(!hasAbility(st.player,"guard_strike"))return false;if(!hasStatusEffect(st.player,"guarded"))return false;st.combat.playerFlags=st.combat.playerFlags||{};if(st.combat.playerFlags.guardStrikeTriggeredRound)return false;st.combat.playerFlags.guardStrikeTriggeredRound=true;const rank=classFeatRankValue(st.player,"guard_strike");log(st,"Guard Strike triggers.");const res=pfResolveFreeCounterattack(st,enemy,"Guard Strike - free counter. ",{extraDamageOnHit:rank,sourceKey:"guard_strike",sourceLabel:"Guard Strike"});return!!res.enemyDefeated&&!st.combat;};const maybeRetaliate=function(){if(!st.combat)return false;if(!hasAbility(st.player,"retaliate"))return false;st.combat.playerFlags=st.combat.playerFlags||{};if(st.combat.playerFlags.retaliateTriggeredRound)return false;if(st.player.hp.current>Math.floor(st.player.hp.max/2))return false;st.combat.playerFlags.retaliateTriggeredRound=true;log(st,"Retaliate triggers.");const res=pfResolveFreeCounterattack(st,enemy,"Retaliate - free attack. ",{sourceKey:"retaliate",sourceLabel:"Retaliate"});return!!res.enemyDefeated&&!st.combat;};const ac=calcAC(st.player);const attackRoll=rollD20Detailed("enemy_attack_roll",{label:enemy.name,note:`${enemy.name} makes an attack roll.`});const attackParts=[...cloneRollParts(attackRoll.parts),...cloneRollParts(enemyAttackBonusParts(enemy))];const total=sumRollParts(attackParts);let outcome="miss";if(attackRoll.total===1)outcome="critfail";else if(attackRoll.total===20||total>=ac)outcome=attackRoll.total===20?"crit":"hit";const attackGroup=buildLogRollGroup({label:`${enemy.name} attack`,parts:attackParts,total,targetLabel:"AC",targetValue:ac,outcome});if(outcome==="miss"||outcome==="critfail"){log(st,`${enemy.name} misses you.`,{rollGroups:[attackGroup]});notifyCombatAction(`${enemy.name} misses you.`,"miss");if(hasEquippedShield(st.player)&&hasAbility(st.player,"parry")&&st.combat&&(ac-total)>(10-classFeatRankValue(st.player,"parry"))){addOrRefreshStatusEffect(enemy,createStatusEffect("off_guard"));log(st,`Parry leaves ${enemy.name} Off-Guard.`);}if(hasStatusEffect(st.player,"spike_lure")&&st.combat){const spikeRoll=rollDiceDetailed("1d4","spike_lure",{label:"Spike Lure",note:"Spike Lure deals 1d4 piercing damage when an enemy misses you."});const spikeGroup=buildLogRollGroup({label:"Spike Lure damage",parts:cloneRollParts(spikeRoll.parts),total:spikeRoll.total});const res=dealDamageToEnemy(st,spikeRoll.total,"piercing",{sourceLabel:"",target:enemy});log(st,`Spike Lure hits ${enemy.name} for ${res.damage} piercing damage.`,{rollGroups:[spikeGroup]});if(!st.combat)return{endedCombat:true};if(res.defeated)return{usedAction:true,endedCombat:false};}if(maybeGuardStrike())return{endedCombat:true};if(st.combat&&hasAbility(st.player,"aggressive_block")&&hasEquippedShield(st.player)&&(ac-total)>8){log(st,"Aggressive Block triggers.");const res=pfResolveFreeCounterattack(st,enemy,"Aggressive Block - free attack. ",{sourceKey:"aggressive_block",sourceLabel:"Aggressive Block"});if(!st.combat)return{endedCombat:true};if(res.enemyDefeated)return{usedAction:true,endedCombat:false};}advanceEntityStatusEffects(st,enemy,{isMovement:false});return{usedAction:true,endedCombat:!st.combat};}const damageRoll=rollDiceDetailed(enemy.damage,"enemy_damage",{label:enemy.name,note:`${enemy.name} rolls damage.`});const damageParts=cloneRollParts(damageRoll.parts);if(outcome==="crit"){const critPart=createRollModifierPart(damageRoll.total,"critical_hit_bonus","Critical hit","A critical hit adds the base damage again.");if(critPart)damageParts.push(critPart);}let currentDamage=sumRollParts(damageParts);if(hasStatusEffect(st.player,"cloud_stance")){const cloudRoll=rollDiceDetailed("1d4","cloud_stance_reduction",{label:"Cloud Stance",note:"Cloud Stance reduces incoming damage by 1d4."});const cloudPart=rollAsReductionPart(cloudRoll,"cloud_stance_reduction","Cloud Stance","Cloud Stance reduces the damage total.",currentDamage);if(cloudPart){damageParts.push(cloudPart);currentDamage+=Number(cloudPart.value||0);}}if(currentDamage>0&&(hasAbility(st.player,"skill_acrobatics_defensive_roll")||hasAbility(st.player,"skill_feat_acrobatics_defensive_roll"))&&!(st.combat.playerFlags&&st.combat.playerFlags.defensiveRollUsed)){const defensiveRoll=rollDiceDetailed("1d6","defensive_roll_reduction",{label:"Defensive Roll",note:"Defensive Roll reduces incoming damage by 1d6 once per combat."});const defensivePart=rollAsReductionPart(defensiveRoll,"defensive_roll_reduction","Defensive Roll","Defensive Roll reduces the damage total.",currentDamage);if(defensivePart){damageParts.push(defensivePart);currentDamage+=Number(defensivePart.value||0);st.combat.playerFlags=st.combat.playerFlags||{};st.combat.playerFlags.defensiveRollUsed=true;}}const resistance=damageResistanceValue(st.player,enemy.damageType);const reduced=Math.min(Math.max(0,currentDamage),resistance);const resistPart=createRollModifierPart(-reduced,"damage_resistance","Resistance",`Damage resistance against ${formatDamageTypeLabel(enemy.damageType)} damage.`);if(resistPart){damageParts.push(resistPart);currentDamage-=reduced;}const flooredDamage=Math.max(0,currentDamage);const floorPart=createRollModifierPart(flooredDamage-currentDamage,"damage_floor","Minimum 0 damage","Damage cannot be reduced below 0.");if(floorPart)damageParts.push(floorPart);const dmg=Math.max(0,sumRollParts(damageParts));st.player.hp.current=clamp(st.player.hp.current-dmg,0,st.player.hp.max);if(st.combat&&combatIconFxBatch&&dmg>0)queueCombatDamageFx(st.player,dmg,{critical:outcome==="crit"});const damageGroup=buildLogRollGroup({label:`${enemy.name} damage`,parts:damageParts,total:dmg,note:`Final ${formatDamageTypeLabel(enemy.damageType)} damage dealt to you.`});log(st,`${enemy.name} ${outcome === "crit" ? "critically hits" : "hits"} you for ${dmg} ${enemy.damageType} damage.`,{rollGroups:[attackGroup,damageGroup]});notifyCombatAction(`${enemy.name} ${outcome === "crit" ? "critically hits" : "hits"} you for ${dmg} ${enemy.damageType} damage.`,"bad");if(st.player.hp.current<=0){handlePlayerDefeat(st);return{endedCombat:true};}if(hasAbility(st.player,"flight_step")){addOrRefreshStatusEffect(st.player,createStatusEffect("flight_step"));log(st,"Flight Step grants +2 AC for 1 round.");}if(maybeGuardStrike())return{endedCombat:true};if(maybeRetaliate())return{endedCombat:true};advanceEntityStatusEffects(st,enemy,{isMovement:false});return{usedAction:true,endedCombat:!st.combat};}

  function pfChooseMonsterAction(st, enemy) {
    const cowardly=hasEnemyTag(enemy, "cowardly");
    if(cowardly&&enemy.hp.current<=Math.max(1, Math.floor(enemy.hp.max*0.1))) {
      return {
        kind:"flee", tags:["leg"]
      };
    }
    const specials=pfMonsterSpecialActions(st, enemy).filter(function(action) {
      return!pfActionDisabledReason(enemy, action.tags||[]);
    });
    if(specials.length&&Math.random()<0.5) {
      return specials[rollInt(0, specials.length-1)];
    }
    return {
      kind:"attack", tags:enemy.basicAttackTags||["arm"]
    };
  }

  function pfRunCustomEnemyTurn(st){normalizeCombatState(st);if(!st.combat)return;beginCombatToastBatch("enemy");st.combat.playerFlags=st.combat.playerFlags||{};st.combat.playerFlags.guardStrikeTriggeredRound=false;st.combat.playerFlags.retaliateTriggeredRound=false;const actingEnemies=combatEnemyList(st).slice();for(const enemy of actingEnemies){if(!st.combat)break;const liveEnemy=getCombatEnemyById(st,enemy.combatId);if(!liveEnemy||!isCombatEnemyAlive(liveEnemy))continue;const chosen=pfChooseMonsterAction(st,liveEnemy);if(chosen.kind==="flee"){const result=pfMonsterFlee(st,liveEnemy);if(result&&result.endedCombat)break;advanceEntityStatusEffects(st,liveEnemy,{isMovement:false});if(!st.combat)break;continue;}if(chosen.kind==="attack"){const disabledReason=pfActionDisabledReason(liveEnemy,chosen.tags||[]);if(disabledReason){log(st,`${liveEnemy.name} cannot attack: ${disabledReason}`);notifyCombatAction(`${liveEnemy.name} loses the action.`,"neutral");advanceEntityStatusEffects(st,liveEnemy,{isMovement:false});if(!st.combat)break;continue;}const result=pfResolveEnemyAction(st,liveEnemy);if(result&&result.endedCombat)break;if(!st.combat)break;continue;}const disabledReason=pfActionDisabledReason(liveEnemy,chosen.tags||[]);if(disabledReason){log(st,`${liveEnemy.name} cannot use ${chosen.name}: ${disabledReason}`);advanceEntityStatusEffects(st,liveEnemy,{isMovement:false});if(!st.combat)break;continue;}const specialResult=typeof chosen.execute==="function"?chosen.execute(st,liveEnemy):{usedAction:false};advanceEntityStatusEffects(st,liveEnemy,{isMovement:false});if((specialResult&&specialResult.endedCombat)||!st.combat)break;}if(!st.combat){flushCombatToastBatch();save(st);render();return;}st.combat.turn="player";restoreEnemySelectionBetweenRounds(st);flushCombatToastBatch();save(st);render();}

  enemyTurn=function(st) {
    if(runningDelayedEnemyTurn)return pfRunCustomEnemyTurn(st);
    if(!st||!st.combat)return;
    flushCombatIconFxBatch();
    if(pendingEnemyTurnTimer)clearTimeout(pendingEnemyTurnTimer);
    st.combat.turn="enemy";
    pendingEnemyTurnTimer=setTimeout(()=> {
      pendingEnemyTurnTimer=null;
      if(!st||!st.combat)return;
      runningDelayedEnemyTurn=true;
      try {
        pfRunCustomEnemyTurn(st);
      } finally {
        runningDelayedEnemyTurn=false;
      }
    }, PLAYER_ACTION_TO_ENEMY_DELAY_MS);
  };

  useFeintStrike=function(st) {
    if(st.combat)beginCombatToastBatch("player");
    const check=canUseActiveAbility(st, "feint_strike");
    if(!check.ok) {
      log(st, check.reason);
      return;
    }
    const enemy=preferredCombatEnemy(st);
    if(!enemy) {
      log(st, "Select an enemy target first.");
      return;
    }
    const ap=weaponTechniqueAttackProfile(st, "feint_strike");
    if(!ap) {
      log(st, weaponTechniqueRequirementReason("feint_strike"));
      return;
    }
    const rank=classFeatRankValue(st.player, "feint_strike");
    spendAbilitySp(st, "feint_strike");
    const result=resolvePlayerAttack(st, {
      prefix:"Feint Strike: ", attack:ap, target:enemy, extraDamageOnHit:rank, extraDamageSourceKey:"feint_strike", extraDamageSourceLabel:"Feint Strike"
    });
    if(result&&Number(result.total||0)+rank>creatureSaveDc(enemy, "reflex")&&enemy&&enemy.hp&&enemy.hp.current>0) {
      applyWeaponTechniqueStatus(st, enemy, createStatusEffect("off_guard"), enemy.name+" becomes Off-Guard from Feint Strike.");
    }
    finishPlayerAbilityUse(st);
  };

  useBladeDance=function(st) {
    useTechniqueRowAttack(st, "blade_dance", function(rank) {
      return {
        extraDamageOnHit:rank
      };
    });
  };

  useStunningPalm=function(st) {
    if(st.combat)beginCombatToastBatch("player");
    const check=canUseActiveAbility(st, "stunning_palm");
    if(!check.ok) {
      log(st, check.reason);
      return;
    }
    const enemy=preferredCombatEnemy(st);
    if(!enemy) {
      log(st, "Select an enemy target first.");
      return;
    }
    const ap=weaponTechniqueAttackProfile(st, "stunning_palm");
    if(!ap) {
      log(st, weaponTechniqueRequirementReason("stunning_palm"));
      return;
    }
    const rank=classFeatRankValue(st.player, "stunning_palm");
    spendAbilitySp(st, "stunning_palm");
    const result=resolvePlayerAttack(st, {
      prefix:"Stunning Palm: ", attack:ap, target:enemy
    });
    if(result&&result.hit&&Number(result.total||0)+rank>=creatureSaveDc(enemy, "fort")&&enemy&&enemy.hp&&enemy.hp.current>0) {
      applyWeaponTechniqueStatus(st, enemy, createStatusEffect("staggered", {
        duration:1, maxDuration:1, description:"Staggered for 1 round: -2 to attack rolls."
      }), enemy.name+" is staggered by Stunning Palm.");
    }
    finishPlayerAbilityUse(st);
  };

  useHundredFists=function(st) {
    if(st.combat)beginCombatToastBatch("player");
    const check=canUseActiveAbility(st, "hundred_fists");
    if(!check.ok) {
      log(st, check.reason);
      return;
    }
    const enemy=preferredCombatEnemy(st);
    if(!enemy) {
      log(st, "Select an enemy target first.");
      return;
    }
    const rank=classFeatRankValue(st.player, "hundred_fists");
    spendAbilitySp(st, "hundred_fists");
    let ap=weaponTechniqueAttackProfile(st, "hundred_fists");
    if(!ap) {
      log(st, weaponTechniqueRequirementReason("hundred_fists"));
      return;
    }
    const first=resolvePlayerAttack(st, {
      prefix:"Hundred Fists: ", attack:ap, target:enemy
    });
    if(st.combat&&enemy&&enemy.hp&&enemy.hp.current>0) {
      ap=weaponTechniqueAttackProfile(st, "hundred_fists");
      if(ap) {
        resolvePlayerAttack(st, {
          prefix:"Hundred Fists: ", attack:ap, target:enemy, extraDamageOnHit:first&&first.hit?rank:0, extraDamageSourceKey:"hundred_fists", extraDamageSourceLabel:"Hundred Fists"
        });
      }
    }
    finishPlayerAbilityUse(st);
  };

  useHamstringCut=function(st) {
    if(st.combat)beginCombatToastBatch("player");
    const check=canUseActiveAbility(st, "hamstring_cut");
    if(!check.ok) {
      log(st, check.reason);
      return;
    }
    const enemy=preferredCombatEnemy(st);
    if(!enemy) {
      log(st, "Select an enemy target first.");
      return;
    }
    const ap=weaponTechniqueAttackProfile(st, "hamstring_cut");
    if(!ap) {
      log(st, weaponTechniqueRequirementReason("hamstring_cut"));
      return;
    }
    const rank=classFeatRankValue(st.player, "hamstring_cut");
    spendAbilitySp(st, "hamstring_cut");
    const result=resolvePlayerAttack(st, {
      prefix:"Hamstring Cut: ", attack:ap, target:enemy
    });
    if(result&&result.hit&&enemy&&enemy.hp&&enemy.hp.current>0) {
      applyWeaponTechniqueStatus(st, enemy, createBleedStatusEffect(rank, 2), enemy.name+" begins bleeding from Hamstring Cut.");
      if(Number(result.total||0)+rank>=creatureSaveDc(enemy, "reflex")) {
        applyWeaponTechniqueStatus(st, enemy, createStatusEffect("off_guard"), enemy.name+" becomes Off-Guard from Hamstring Cut.");
      }
    }
    finishPlayerAbilityUse(st);
  };

  useShadowFlurry=function(st) {
    if(st.combat)beginCombatToastBatch("player");
    const check=canUseActiveAbility(st, "shadow_flurry");
    if(!check.ok) {
      log(st, check.reason);
      return;
    }
    const enemy=preferredCombatEnemy(st);
    if(!enemy) {
      log(st, "Select an enemy target first.");
      return;
    }
    const rank=classFeatRankValue(st.player, "shadow_flurry");
    const hiddenBonus=hasStatusEffect(st.player, "hidden")?rank:0;
    spendAbilitySp(st, "shadow_flurry");
    let ap=weaponTechniqueAttackProfile(st, "shadow_flurry");
    if(!ap) {
      log(st, weaponTechniqueRequirementReason("shadow_flurry"));
      return;
    }
    const first=resolvePlayerAttack(st, {
      prefix:"Shadow Flurry: ", attack:ap, target:enemy, extraDamageOnHit:hiddenBonus, extraDamageSourceKey:"shadow_flurry", extraDamageSourceLabel:"Shadow Flurry"
    });
    if(st.combat&&enemy&&enemy.hp&&enemy.hp.current>0) {
      if(first&&first.hit) {
        applyWeaponTechniqueStatus(st, enemy, createStatusEffect("off_guard"), enemy.name+" is opened up by Shadow Flurry.");
      }
      ap=weaponTechniqueAttackProfile(st, "shadow_flurry");
      if(ap) {
        resolvePlayerAttack(st, {
          prefix:"Shadow Flurry: ", attack:ap, target:enemy, extraDamageOnHit:hiddenBonus, extraDamageSourceKey:"shadow_flurry", extraDamageSourceLabel:"Shadow Flurry"
        });
      }
    }
    finishPlayerAbilityUse(st);
  };

  usePinningShot=function(st) {
    if(st.combat)beginCombatToastBatch("player");
    const check=canUseActiveAbility(st, "pinning_shot");
    if(!check.ok) {
      log(st, check.reason);
      return;
    }
    const enemy=preferredCombatEnemy(st);
    if(!enemy) {
      log(st, "Select an enemy target first.");
      return;
    }
    const ap=weaponTechniqueAttackProfile(st, "pinning_shot");
    if(!ap) {
      log(st, weaponTechniqueRequirementReason("pinning_shot"));
      return;
    }
    const rank=classFeatRankValue(st.player, "pinning_shot");
    spendAbilitySp(st, "pinning_shot");
    const result=resolvePlayerAttack(st, {
      prefix:"Pinning Shot: ", attack:ap, target:enemy
    });
    if(result&&result.hit&&Number(result.total||0)+rank>=creatureSaveDc(enemy, "reflex")&&enemy&&enemy.hp&&enemy.hp.current>0) {
      applyWeaponTechniqueStatus(st, enemy, createPinnedStatusEffect(rank), enemy.name+" is pinned in place by Pinning Shot.");
    }
    finishPlayerAbilityUse(st);
  };

  useVolleyFire=function(st) {
    useTechniqueRowAttack(st, "volley_fire", function(rank) {
      return {
        extraDamageOnHit:Math.max(1, rank-1)
      };
    });
  };

  useConcussiveBlow=function(st) {
    if(st.combat)beginCombatToastBatch("player");
    const check=canUseActiveAbility(st, "concussive_blow");
    if(!check.ok) {
      log(st, check.reason);
      return;
    }
    const enemy=preferredCombatEnemy(st);
    if(!enemy) {
      log(st, "Select an enemy target first.");
      return;
    }
    const ap=weaponTechniqueAttackProfile(st, "concussive_blow");
    if(!ap) {
      log(st, weaponTechniqueRequirementReason("concussive_blow"));
      return;
    }
    const rank=classFeatRankValue(st.player, "concussive_blow");
    spendAbilitySp(st, "concussive_blow");
    const result=resolvePlayerAttack(st, {
      prefix:"Concussive Blow: ", attack:ap, target:enemy, extraDamageOnHit:rank, extraDamageSourceKey:"concussive_blow", extraDamageSourceLabel:"Concussive Blow"
    });
    if(result&&result.hit&&Number(result.total||0)+rank>=creatureSaveDc(enemy, "fort")&&enemy&&enemy.hp&&enemy.hp.current>0) {
      applyWeaponTechniqueStatus(st, enemy, createConcussedStatusEffect(rank), enemy.name+" is concussed by the blow.");
    }
    finishPlayerAbilityUse(st);
  };

  useRendingChop=function(st) {
    if(st.combat)beginCombatToastBatch("player");
    const check=canUseActiveAbility(st, "rending_chop");
    if(!check.ok) {
      log(st, check.reason);
      return;
    }
    const enemy=preferredCombatEnemy(st);
    if(!enemy) {
      log(st, "Select an enemy target first.");
      return;
    }
    const ap=weaponTechniqueAttackProfile(st, "rending_chop");
    if(!ap) {
      log(st, weaponTechniqueRequirementReason("rending_chop"));
      return;
    }
    const rank=classFeatRankValue(st.player, "rending_chop");
    spendAbilitySp(st, "rending_chop");
    const result=resolvePlayerAttack(st, {
      prefix:"Rending Chop: ", attack:ap, target:enemy, extraDamageOnHit:rank, extraDamageSourceKey:"rending_chop", extraDamageSourceLabel:"Rending Chop"
    });
    if(result&&result.hit&&Number(result.total||0)+rank>=creatureSaveDc(enemy, "fort")&&enemy&&enemy.hp&&enemy.hp.current>0) {
      applyWeaponTechniqueStatus(st, enemy, createDisarmedStatusEffect(rank), enemy.name+" is disarmed by the chop.");
    }
    finishPlayerAbilityUse(st);
  };

  useExecutionersSwing=function(st){if(st.combat)beginCombatToastBatch("player");const check=canUseActiveAbility(st,"executioners_swing");if(!check.ok){log(st,check.reason);return;}const enemy=preferredCombatEnemy(st);if(!enemy){log(st,"Select an enemy target first.");return;}const ap=weaponTechniqueAttackProfile(st,"executioners_swing");if(!ap){log(st,weaponTechniqueRequirementReason("executioners_swing"));return;}const rank=classFeatRankValue(st.player,"executioners_swing");const wounded=enemy.hp.current<Math.ceil(enemy.hp.max/2);spendAbilitySp(st,"executioners_swing");const result=resolvePlayerAttack(st,{prefix:wounded?"Executioner's Chop (finisher): ":"Executioner's Chop: ",attack:ap,target:enemy,extraDamageOnHit:rank,extraDamageSourceKey:"executioners_swing",extraDamageSourceLabel:"Executioner's Chop"});if(result&&result.hit&&wounded&&result.damage>0&&st.combat&&enemy&&enemy.hp&&enemy.hp.current>0){const bonus=dealDamageToEnemy(st,result.damage,ap.damageType,{sourceLabel:"Executioner's Chop:",target:enemy});log(st,`Executioner's Chop deals ${bonus.damage} additional ${ap.damageType} damage because the target was below half HP.`);}finishPlayerAbilityUse(st);};

  function ParryMissThreshold(rank) {
    const value=Math.max(0, Math.min(5, Math.floor(Number(rank||0))));
    const table=[0, 10, 9, 8, 7, 5];
    return table[value]||0;
  }

  function RetaliateThresholdPercent(rank) {
    const value=Math.max(0, Math.min(3, Math.floor(Number(rank||0))));
    const table=[0, 20, 40, 60];
    return table[value]||0;
  }

  function AtOrBelowPercent(entity, percent) {
    const maxHp=Number(entity&&entity.hp&&entity.hp.max||0);
    const currentHp=Number(entity&&entity.hp&&entity.hp.current||0);
    if(maxHp<=0||percent<=0)return false;
    return currentHp<=Math.ceil(maxHp*percent/100);
  }

  function EquippedWeapon(player, slot) {
    const itemId=player&&player.equipment?player.equipment[slot]:null;
    const item=itemId&&ITEM_INDEX.has(itemId)?getItem(itemId):null;
    return item&&item.type==='weapon'?item:null;
  }

  function DamageText(itemOrProfile) {
    const damageExpr=itemOrProfile&&itemOrProfile.damageExpr?itemOrProfile.damageExpr:(itemOrProfile&&itemOrProfile['Damage']?itemOrProfile['Damage']:'');
    const damageType=itemOrProfile&&itemOrProfile.damageType?itemOrProfile.damageType:(itemOrProfile&&itemOrProfile['Damage type']?itemOrProfile['Damage type']:'');
    return[damageExpr, damageType].filter(Boolean).map(escapeHtml).join(' ');
  }

  function OffHandDisplayState(player) {
    const mainWeapon=EquippedWeapon(player, 'mainHand');
    const offWeapon=EquippedWeapon(player, 'offHand');
    if(!mainWeapon||!offWeapon)return {
      visible:false
    };
    const mainAgile=hasWeaponProperty(mainWeapon, 'agile');
    const offAgile=hasWeaponProperty(offWeapon, 'agile');
    if(!mainAgile) {
      return {
        visible:true, canAttack:false, weaponName:offWeapon.name||'Off-hand weapon', damageText:DamageText(offWeapon), tooltip:'Main hand weapon is not agile enough to follow up with off hand'
      };
    }
    if(!offAgile)return {
      visible:false
    };
    const offAp=buildAttackProfile(player, offWeapon, {
      fallbackUnarmed:false, slotLabel:'off hand'
    });
    if(!offAp)return {
      visible:false
    };
    return {
      visible:true, canAttack:true, weaponName:offAp.weaponName||offWeapon.name||'Off-hand weapon', damageText:DamageText(offAp), attackBonus:Number(offAp.attackBonus||0)+offHandAttackPenalty(offAp)
    };
  }

  function DamageSectionHtml(player) {
    const ap=attackProfile(player);
    const mainLabel=ap?escapeHtml(ap.weaponName||'Attack'):'Attack';
    const mainDamage=ap?DamageText(ap):'';
    let html='<div>Main-hand: '+mainLabel+(mainDamage?' '+mainDamage:'')+'</div>';
    const offState=OffHandDisplayState(player);
    if(offState.visible) {
      const offLabel=escapeHtml(offState.weaponName||'Off-hand');
      const offDamage=offState.damageText?' '+offState.damageText:'';
      if(offState.canAttack) {
        html+='<div>Off-hand: '+offLabel+offDamage+' <span class="muted">(attack '+fmtSigned(offState.attackBonus)+')</span></div>';
      } else {
        html+='<div>Off-hand: '+offLabel+offDamage+' — <span data-tooltip="'+escapeHtml(offState.tooltip||'')+'">cannot attack</span></div>';
      }
    }
    return html;
  }

  const CalcInventorySlots=calcInventorySlots;

  calcInventorySlots=function(player, options) {
    const result=CalcInventorySlots(player, options||{
    });
    const inv=Array.isArray(options&&options.inventory)?options.inventory:(Array.isArray(player&&player.inventory)?player.inventory:[]);
    let used=0;
    const ammoTypes=new Set();
    for(const entry of inv) {
      const qty=Math.max(0, Number(entry&&entry.qty||0));
      if(qty<=0)continue;
      const itemId=entry&&entry.itemId?entry.itemId:null;
      const item=itemId&&ITEM_INDEX.has(itemId)?getItem(itemId):null;
      if(item&&item.type==='ammo')ammoTypes.add(item.id);
      else used+=qty;
    }
    used+=ammoTypes.size;
    return {
      ...result, used
    };
  };

  offHandAttackProfile=function(player) {
    const offWeapon=EquippedWeapon(player, 'offHand');
    return offWeapon?buildAttackProfile(player, offWeapon, {
      fallbackUnarmed:false, slotLabel:'off hand'
    }):null;
  };

  hasDualAgileAttack=function(player) {
    return hasDualAgileWeaponSet(player);
  };

  movePlayer=function(state, dx, dy) {
    if(state.combat||hasBlockingCenterOverlay(state))return;
    const areaId=state.world.areaId;
    const aDef=getArea(areaId);
    if(!aDef.map)return;
    const aState=state.world.areas[areaId];
    const nx=aState.px+dx;
    const ny=aState.py+dy;
    if(nx<0||ny<0||nx>=aState.size||ny>=aState.size)return;
    const nextTile=aState.tiles[ny][nx];
    const wasRevealed=!!nextTile.revealed;
    if(isImpassableTerrain(nextTile.terrain)) {
      log(state, 'That way is blocked by impassable terrain.');
      return;
    }
    aState.px=nx;
    aState.py=ny;
    const tile=aState.tiles[ny][nx];
    tile.revealed=true;
    state.ui.selectedTile={
      x:nx, y:ny
    };
    notifyQuestEvent(state, 'visit_tile', {
      areaId, x:nx, y:ny
    });
    const quietStepActive=hasStatusEffect(state.player, 'quiet_step')||hasAbility(state.player, 'quiet_step');
    if(tile.type==='monster'&&!tile.resolved) {
      if(quietStepActive) {
        const monster=getMonster(tile.content);
        log(state, 'Quiet Step lets you slip into '+monster.name+"'s tile without triggering combat.");
      } else {
        startEncounter(state, tile.content);
        if(state.combat&&wasRevealed&&hasAbility(state.player, 'hunting')) {
          log(state, 'Hunting lets you strike first against the '+state.combat.enemy.name+'.');
          resolvePlayerAttack(state, {
            prefix:'Hunting — free attack. '
          });
          if(state.combat)state.combat.turn='player';
        }
      }
    } else if(tile.type==='treasure'&&!tile.resolved) {
      openTreasure(state, aDef, tile);
    }
    advanceStatusEffectsAfterAction(state, {
      isMovement:true
    });
    maybeTriggerRandomEvent(state);
    save(state);
    render();
  };

  startEncounter=function(state, monsterId) {
    clearCombatToastQueue();
    const encounterIds=buildEncounterMonsterIds(state, monsterId);
    const stamp=String(Date.now())+'_'+String(rollInt(1000, 9999));
    const frontCount=Math.min(2, encounterIds.length);
    const enemies=encounterIds.map(function(id, index) {
      return createEnemyCombatant(id, 'enemy_'+stamp+'_'+String(index+1), index<frontCount?COMBAT_ROW_FRONT:COMBAT_ROW_BACK);
    });
    state.combat={
      enemies, allies:createCombatAlliesFromState(), defeatedEnemies:[], selectedTargetId:enemies[0]?enemies[0].combatId:null, selectedTargetSide:enemies[0]?'enemy':'enemy', lastSelectedEnemyId:enemies[0]?enemies[0].combatId:null, enemy:enemies[0]||null, targeting:{
        side:'enemy', mode:COMBAT_TARGETING_MODES.single
      }, ui:{
        panel:'actions'
      }, turn:'player', lastRolls:[], playerFlags:{
      }
    };
    const encounterNames=enemies.map(function(enemy) {
      return enemy.name;
    });
    const encounterLabel=encounterNames.length<=3?encounterNames.join(encounterNames.length===2?' and ':', '):String(encounterNames.length)+' enemies';
    log(state, 'Encounter! '+encounterLabel+' appear'+(encounterNames.length===1?'s':'')+'.');
    const shortFuseRank=Math.max(0, classFeatRankValue(state.player, 'short_fuse'));
    if(shortFuseRank>0&&!hasStatusEffect(state.player, 'enrage')) {
      const fuseRoll=rollInt(1, 4);
      if(fuseRoll<=shortFuseRank) {
        applyEnrageStatus(state, 'Short Fuse triggers: you become Enraged at the start of combat.');
      } else {
        log(state, 'Short Fuse does not trigger. (d4 '+String(fuseRoll)+')');
      }
    }
    if(hasAbility(state.player, 'ambush')) {
      addOrRefreshStatusEffect(state.combat.enemy, createStatusEffect('off_guard'));
      log(state, 'Ambush leaves '+state.combat.enemy.name+' Off-Guard as combat begins.');
    }
    if(state.combat&&(hasAbility(state.player, 'skill_social_menacing_presence')||hasAbility(state.player, 'skill_feat_social_menacing_presence'))) {
      const roll=rollD20();
      const total=roll+skillTotal(state.player, 'Social');
      const dc=creatureSaveDc(state.combat.enemy, 'will');
      if(roll===20||total>=dc) {
        addOrRefreshStatusEffect(state.combat.enemy, createStatusEffect('off_guard'));
        log(state, 'Menacing Presence: Social d20('+String(roll)+') + '+String(skillTotal(state.player, 'Social'))+' = '+String(total)+' vs Will DC '+String(dc)+' → success. '+state.combat.enemy.name+' becomes Off-Guard.');
      } else {
        log(state, 'Menacing Presence: Social d20('+String(roll)+') + '+String(skillTotal(state.player, 'Social'))+' = '+String(total)+' vs Will DC '+String(dc)+' → failure.');
      }
    }
    toast('Encounter! '+(encounterNames.length===1?encounterNames[0]:String(encounterNames.length)+' enemies'), 'bad');
    state.tab='combat';
    save(state);
  };

  pfResolveEnemyAction=function(st, enemy) {
    const rollAsReductionPart=function(rollData, sourceKey, label, note, currentValue) {
      const applied=Math.max(0, Math.min(Math.max(0, Number(currentValue||0)), Math.max(0, Number(rollData&&rollData.total||0))));
      if(!applied)return null;
      const dicePart=Array.isArray(rollData&&rollData.parts)?rollData.parts.find(function(part) {
        return part&&part.type==='dice';
      }):null;
      const expr=dicePart&&dicePart.expr?dicePart.expr:'Roll';
      const rolls=dicePart&&Array.isArray(dicePart.rolls)?dicePart.rolls.join(', '):'-';
      const details=Number(rollData&&rollData.total||0)==applied?note+' Rolled '+expr+': '+rolls+'.':note+' Rolled '+expr+': '+rolls+'; capped to '+String(applied)+'.';
      return createRollModifierPart(-applied, sourceKey, label+' '+expr+'['+rolls+']', details);
    };
    const maybeGuardStrike=function() {
      if(!st.combat)return false;
      if(!hasEquippedShield(st.player))return false;
      if(!hasAbility(st.player, 'guard_strike'))return false;
      if(!hasStatusEffect(st.player, 'guarded'))return false;
      st.combat.playerFlags=st.combat.playerFlags||{
      };
      if(st.combat.playerFlags.guardStrikeTriggeredRound)return false;
      st.combat.playerFlags.guardStrikeTriggeredRound=true;
      const rank=classFeatRankValue(st.player, 'guard_strike');
      log(st, 'Guard Strike triggers.');
      const res=pfResolveFreeCounterattack(st, enemy, 'Guard Strike - free counter. ', {
        extraDamageOnHit:rank, sourceKey:'guard_strike', sourceLabel:'Guard Strike'
      });
      return!!res.enemyDefeated&&!st.combat;
    };
    const maybeRetaliate=function() {
      if(!st.combat)return false;
      if(!hasAbility(st.player, 'retaliate'))return false;
      st.combat.playerFlags=st.combat.playerFlags||{
      };
      if(st.combat.playerFlags.retaliateTriggeredRound)return false;
      const rank=Math.max(0, classFeatRankValue(st.player, 'retaliate'));
      const threshold=RetaliateThresholdPercent(rank);
      if(!AtOrBelowPercent(st.player, threshold))return false;
      st.combat.playerFlags.retaliateTriggeredRound=true;
      log(st, 'Retaliate triggers.');
      const res=pfResolveFreeCounterattack(st, enemy, 'Retaliate - free attack. ', {
        sourceKey:'retaliate', sourceLabel:'Retaliate'
      });
      return!!res.enemyDefeated&&!st.combat;
    };
    const ac=calcAC(st.player);
    const attackRoll=rollD20Detailed('enemy_attack_roll', {
      label:enemy.name, note:enemy.name+' makes an attack roll.'
    });
    const attackParts=[...cloneRollParts(attackRoll.parts), ...cloneRollParts(enemyAttackBonusParts(enemy))];
    const total=sumRollParts(attackParts);
    let outcome='miss';
    if(attackRoll.total===1)outcome='critfail';
    else if(attackRoll.total===20||total>=ac)outcome=attackRoll.total===20?'crit':'hit';
    const attackGroup=buildLogRollGroup({
      label:enemy.name+' attack', parts:attackParts, total, targetLabel:'AC', targetValue:ac, outcome
    });
    if(outcome==='miss'||outcome==='critfail') {
      log(st, enemy.name+' misses you.', {
        rollGroups:[attackGroup]
      });
      notifyCombatAction(enemy.name+' misses you.', 'miss');
      if(hasEquippedShield(st.player)&&hasAbility(st.player, 'parry')&&st.combat&&(ac-total)>=ParryMissThreshold(classFeatRankValue(st.player, 'parry'))) {
        addOrRefreshStatusEffect(enemy, createStatusEffect('off_guard'));
        log(st, 'Parry leaves '+enemy.name+' Off-Guard.');
      }
      if(hasStatusEffect(st.player, 'spike_lure')&&st.combat) {
        const spikeRoll=rollDiceDetailed('1d4', 'spike_lure', {
          label:'Spike Lure', note:'Spike Lure deals 1d4 piercing damage when an enemy misses you.'
        });
        const spikeGroup=buildLogRollGroup({
          label:'Spike Lure damage', parts:cloneRollParts(spikeRoll.parts), total:spikeRoll.total
        });
        const res=dealDamageToEnemy(st, spikeRoll.total, 'piercing', {
          sourceLabel:'', target:enemy
        });
        log(st, 'Spike Lure hits '+enemy.name+' for '+String(res.damage)+' piercing damage.', {
          rollGroups:[spikeGroup]
        });
        if(!st.combat)return {
          endedCombat:true
        };
        if(res.defeated)return {
          usedAction:true, endedCombat:false
        };
      }
      if(maybeGuardStrike())return {
        endedCombat:true
      };
      if(st.combat&&hasAbility(st.player, 'aggressive_block')&&hasEquippedShield(st.player)&&(ac-total)>8) {
        log(st, 'Aggressive Block triggers.');
        const res=pfResolveFreeCounterattack(st, enemy, 'Aggressive Block - free attack. ', {
          sourceKey:'aggressive_block', sourceLabel:'Aggressive Block'
        });
        if(!st.combat)return {
          endedCombat:true
        };
        if(res.enemyDefeated)return {
          usedAction:true, endedCombat:false
        };
      }
      advanceEntityStatusEffects(st, enemy, {
        isMovement:false
      });
      return {
        usedAction:true, endedCombat:!st.combat
      };
    }
    const damageRoll=rollDiceDetailed(enemy.damage, 'enemy_damage', {
      label:enemy.name, note:enemy.name+' rolls damage.'
    });
    const damageParts=cloneRollParts(damageRoll.parts);
    if(outcome==='crit') {
      const critPart=createRollModifierPart(damageRoll.total, 'critical_hit_bonus', 'Critical hit', 'A critical hit adds the base damage again.');
      if(critPart)damageParts.push(critPart);
    }
    let currentDamage=sumRollParts(damageParts);
    if(hasStatusEffect(st.player, 'cloud_stance')) {
      const cloudRoll=rollDiceDetailed('1d4', 'cloud_stance_reduction', {
        label:'Cloud Stance', note:'Cloud Stance reduces incoming damage by 1d4.'
      });
      const cloudPart=rollAsReductionPart(cloudRoll, 'cloud_stance_reduction', 'Cloud Stance', 'Cloud Stance reduces the damage total.', currentDamage);
      if(cloudPart) {
        damageParts.push(cloudPart);
        currentDamage+=Number(cloudPart.value||0);
      }
    }
    if(currentDamage>0&&(hasAbility(st.player, 'skill_acrobatics_defensive_roll')||hasAbility(st.player, 'skill_feat_acrobatics_defensive_roll'))&&!(st.combat.playerFlags&&st.combat.playerFlags.defensiveRollUsed)) {
      const defensiveRoll=rollDiceDetailed('1d6', 'defensive_roll_reduction', {
        label:'Defensive Roll', note:'Defensive Roll reduces incoming damage by 1d6 once per combat.'
      });
      const defensivePart=rollAsReductionPart(defensiveRoll, 'defensive_roll_reduction', 'Defensive Roll', 'Defensive Roll reduces the damage total.', currentDamage);
      if(defensivePart) {
        damageParts.push(defensivePart);
        currentDamage+=Number(defensivePart.value||0);
        st.combat.playerFlags=st.combat.playerFlags||{
        };
        st.combat.playerFlags.defensiveRollUsed=true;
      }
    }
    const resistance=damageResistanceValue(st.player, enemy.damageType);
    const reduced=Math.min(Math.max(0, currentDamage), resistance);
    const resistPart=createRollModifierPart(-reduced, 'damage_resistance', 'Resistance', 'Damage resistance against '+formatDamageTypeLabel(enemy.damageType)+' damage.');
    if(resistPart) {
      damageParts.push(resistPart);
      currentDamage-=reduced;
    }
    const flooredDamage=Math.max(0, currentDamage);
    const floorPart=createRollModifierPart(flooredDamage-currentDamage, 'damage_floor', 'Minimum 0 damage', 'Damage cannot be reduced below 0.');
    if(floorPart)damageParts.push(floorPart);
    const dmg=Math.max(0, sumRollParts(damageParts));
    st.player.hp.current=clamp(st.player.hp.current-dmg, 0, st.player.hp.max);
    if(st.combat&&combatIconFxBatch&&dmg>0)queueCombatDamageFx(st.player, dmg, {
      critical:outcome==='crit'
    });
    const damageGroup=buildLogRollGroup({
      label:enemy.name+' damage', parts:damageParts, total:dmg, note:'Final '+formatDamageTypeLabel(enemy.damageType)+' damage dealt to you.'
    });
    log(st, enemy.name+' '+(outcome==='crit'?'critically hits':'hits')+' you for '+String(dmg)+' '+enemy.damageType+' damage.', {
      rollGroups:[attackGroup, damageGroup]
    });
    notifyCombatAction(enemy.name+' '+(outcome==='crit'?'critically hits':'hits')+' you for '+String(dmg)+' '+enemy.damageType+' damage.', 'bad');
    if(st.player.hp.current<=0) {
      handlePlayerDefeat(st);
      return {
        endedCombat:true
      };
    }
    if(hasAbility(st.player, 'flight_step')) {
      addOrRefreshStatusEffect(st.player, createStatusEffect('flight_step'));
      log(st, 'Flight Step grants +2 AC for 1 round.');
    }
    if(maybeGuardStrike())return {
      endedCombat:true
    };
    if(maybeRetaliate())return {
      endedCombat:true
    };
    advanceEntityStatusEffects(st, enemy, {
      isMovement:false
    });
    return {
      usedAction:true, endedCombat:!st.combat
    };
  };

  useDirtyTrick=function(st) {
    const rank=Math.max(1, classFeatRankValue(st.player, 'dirty_trick'));
    useCheckAbilityAgainstEnemyDc(st, 'dirty_trick', {
      checkLabel:'Stealth', skillId:'Stealth', getBonus:function(innerState) {
        return skillTotal(innerState.player, 'Stealth')+rank;
      }, dcId:'reflex', statusId:'blinded', successText:((preferredCombatEnemy(st)||{
        name:'Target'
      }).name+' becomes Blinded for 1 round.')
    });
  };

  useHamstringCut=function(st) {
    if(st.combat)beginCombatToastBatch('player');
    const check=canUseActiveAbility(st, 'hamstring_cut');
    if(!check.ok) {
      log(st, check.reason);
      return;
    }
    const enemy=preferredCombatEnemy(st);
    if(!enemy) {
      log(st, 'Select an enemy target first.');
      return;
    }
    const ap=weaponTechniqueAttackProfile(st, 'hamstring_cut');
    if(!ap) {
      log(st, weaponTechniqueRequirementReason('hamstring_cut'));
      return;
    }
    const rank=classFeatRankValue(st.player, 'hamstring_cut');
    spendAbilitySp(st, 'hamstring_cut');
    const result=resolvePlayerAttack(st, {
      prefix:'Hamstring Cut: ', attack:ap, target:enemy, attackBonusModifier:rank, attackBonusSourceKey:'hamstring_cut', attackBonusSourceLabel:'Hamstring Cut'
    });
    if(result&&result.hit&&Number(result.total||0)+rank>=creatureSaveDc(enemy, 'fort')&&enemy&&enemy.hp&&enemy.hp.current>0) {
      applyWeaponTechniqueStatus(st, enemy, createBleedStatusEffect(rank, 3), enemy.name+' begins bleeding from Hamstring Cut.');
    }
    finishPlayerAbilityUse(st);
  };

  useExecutionersSwing=function(st) {
    if(st.combat)beginCombatToastBatch('player');
    const check=canUseActiveAbility(st, 'executioners_swing');
    if(!check.ok) {
      log(st, check.reason);
      return;
    }
    const enemy=preferredCombatEnemy(st);
    if(!enemy) {
      log(st, 'Select an enemy target first.');
      return;
    }
    const ap=weaponTechniqueAttackProfile(st, 'executioners_swing');
    if(!ap) {
      log(st, weaponTechniqueRequirementReason('executioners_swing'));
      return;
    }
    const rank=classFeatRankValue(st.player, 'executioners_swing');
    const wounded=enemy.hp.current<Math.ceil(enemy.hp.max/2);
    spendAbilitySp(st, 'executioners_swing');
    resolvePlayerAttack(st, {
      prefix:wounded?"Executioner's Chop (finisher): ":"Executioner's Chop: ", attack:ap, target:enemy, extraDamageOnHit:wounded?rank*2:rank, extraDamageSourceKey:'executioners_swing', extraDamageSourceLabel:"Executioner's Chop"
    });
    finishPlayerAbilityUse(st);
  };

  const RenderCharacterTab=renderCharacterTab;

  renderCharacterTab=function() {
    const html=RenderCharacterTab();
    const ap=attackProfile(state.player);
    if(!ap)return html;
    const attackRow='<div class="kv"><div class="k">Attack</div><div class="v">'+escapeHtml(ap.weaponName)+' <span class="muted">('+fmtSigned(ap.attackBonus)+')</span></div></div>';
    const damageRow='<div class="kv" style="align-items:flex-start"><div class="k">Damage</div><div class="v">'+DamageSectionHtml(state.player)+'</div></div>';
    const armorClassPattern=new RegExp('(<div class=\"kv\"><div class=\"k\">Armor Class<\\/div><div class=\"v\">[^<]*<\\/div><\\/div>)');
    return html.replace(armorClassPattern, '$1\n              '+attackRow+'\n              '+damageRow);
  };

  const Render=render;

  render=function() {
    Render();
    try {
      const rightPanel=Array.from(document.querySelectorAll('.panel.right')).find(function(panel) {
        const heading=panel.querySelector('header h2');
        return heading&&heading.textContent.trim()==='Character Sheet';
      });
      const body=rightPanel?rightPanel.querySelector('.body'):null;
      if(body) {
        const damageRow=Array.from(body.querySelectorAll('.kv')).find(function(row) {
          const key=row.querySelector('.k');
          return key&&key.textContent.trim()==='Damage';
        });
        const value=damageRow?damageRow.querySelector('.v'):null;
        if(value)value.innerHTML=DamageSectionHtml(state.player);
        wireTextTooltips(body);
      }
    } catch(_err) {
    }
  };

  const ClassFeatEffectLines=classFeatEffectLines;

  classFeatEffectLines=function(featId, rank) {
    const r=Math.max(0, Number(rank||0));
    if(r<=0&&['hamstring_cut', 'executioners_swing', 'parry', 'retaliate', 'short_fuse', 'dirty_trick'].includes(featId))return['No ranks invested yet.'];
    if(featId==='hamstring_cut')return['Dagger attack.', 'Attack bonus: +'+r+'.', 'On hit, if final attack total +'+r+' beats Fortitude DC: apply Bleed '+r+' for 3 rounds.'];
    if(featId==='executioners_swing')return['Axe attack.', 'Damage on hit: +'+r+'.', 'If the target is below 50% HP before the hit: bonus damage becomes +'+(r*2)+'.'];
    if(featId==='parry')return['If an enemy misses your AC by '+ParryMissThreshold(r)+' or more: that enemy becomes Off-Guard.'];
    if(featId==='retaliate')return['Once per round while at or below '+RetaliateThresholdPercent(r)+'% HP, counterattack the first enemy that hits you for free.'];
    if(featId==='short_fuse')return['At the start of combat: '+(r*25)+'% chance to trigger Enrage automatically.'];
    if(featId==='dirty_trick')return['Stealth vs Reflex DC.', 'Check bonus: +'+r+'.', 'On success: Blinded for 1 round.'];
    return ClassFeatEffectLines(featId, rank);
  };

  const ClassFeatNextRankPreviewLines=classFeatNextRankPreviewLines;

  classFeatNextRankPreviewLines=function(featId, rank) {
    if(['hamstring_cut', 'executioners_swing', 'parry', 'retaliate', 'short_fuse', 'dirty_trick'].includes(featId)) {
      const current=Math.max(0, Number(rank||0));
      const next=Math.min(classFeatMaxRank(featId), current+1);
      if(next<=current)return['Already at maximum rank.'];
      return pfActionDetailBlock(classFeatEffectLines(featId, next));
    }
    return ClassFeatNextRankPreviewLines(featId, rank);
  };

  const SkillFeatEffectLines=skillFeatEffectLines;

  skillFeatEffectLines=function(featId, rank) {
    const r=Math.max(0, Number(rank||0));
    if(featId==='quiet_step') {
      if(r<=0)return['No ranks invested yet.'];
      return['Passive exploration feat.', 'Stepping into an enemy tile does not start combat.'];
    }
    return SkillFeatEffectLines(featId, rank);
  };

  const SkillFeatNextRankPreviewLines=skillFeatNextRankPreviewLines;

  skillFeatNextRankPreviewLines=function(featId, rank) {
    if(featId==='quiet_step') {
      const current=Math.max(0, Number(rank||0));
      const next=Math.min(skillFeatMaxRank(featId), current+1);
      if(next<=current)return['Already at maximum rank.'];
      return pfActionDetailBlock(skillFeatEffectLines(featId, next));
    }
    return SkillFeatNextRankPreviewLines(featId, rank);
  };

  // ---------------------------------------------------------------------------
  // Level-up UI patch layer
  // ---------------------------------------------------------------------------
  const TrainingNpcId='training_master';

  let FeatUndoLock=null;

  let LevelUpUnlockCache=null;

  let ShortRestIntervalStarted=false;

  function ShortRestCooldownState(st) {
    const readyAt=Math.max(0, Number(st&&st.cooldowns&&st.cooldowns.shortRestReadyAt||0));
    const remainingMs=Math.max(0, readyAt-Date.now());
    return {
      readyAt, remainingMs, active:remainingMs>0, seconds:Math.ceil(remainingMs/1000), scale:clamp(remainingMs/60000, 0, 1)
    };
  }

  function SyncShortRestButtons() {
    const cooldown=ShortRestCooldownState(state);
    document.querySelectorAll('[data-ui-action="short-rest"]').forEach(function(btn) {
      if(!btn)return;
      const baseLabel=btn.getAttribute('data-short-rest-label')||'Short Rest';
      if(!btn.hasAttribute('data-short-rest-label'))btn.setAttribute('data-short-rest-label', baseLabel);
      const nextLabel=cooldown.active?(baseLabel+' ('+cooldown.seconds+'s)'):baseLabel;
      btn.disabled=cooldown.active;
      btn.textContent=nextLabel;
      btn.classList.toggle('shortRestCooldown', cooldown.active);
      btn.style.setProperty('--short-rest-cooldown-scale', cooldown.active?String(cooldown.scale):'0');
      btn.setAttribute('aria-label', nextLabel);
      if(cooldown.active)btn.title='Short rest is on cooldown for '+cooldown.seconds+'s.';
      else btn.removeAttribute('title');
    });
  }

  function EnsureShortRestInterval() {
    if(ShortRestIntervalStarted)return;
    ShortRestIntervalStarted=true;
    setInterval(function() {
      try {
        SyncShortRestButtons();
      } catch(_) {
      }
    }, 500);
  }

  function ValidOffHandSummary(player) {
    const offAttack=offHandAttackProfile(player);
    if(!offAttack||!hasDualAgileAttack(player)||!isOffHandWeaponAttack(offAttack))return null;
    return {
      weaponName:String(offAttack.weaponName||offAttack.name||'Off-hand'), attackBonus:Number(offAttack.attackBonus||0)+offHandAttackPenalty(offAttack), damageExpr:String(offAttack.damageExpr||''), damageType:String(offAttack.damageType||'')
    };
  }

  function CombatSummaryRowsHtml(player) {
    const mainAttack=attackProfile(player);
    if(!mainAttack)return'';
    const row=function(label, valueHtml) {
      return'<div class="kv"><div class="k">'+escapeHtml(label)+'</div><div class="v">'+valueHtml+'</div></div>';
    };
    const rows=[];
    rows.push(row('Attack', escapeHtml(mainAttack.weaponName||'Attack')+' <span class="muted">('+fmtSigned(Number(mainAttack.attackBonus||0))+')</span>'));
    rows.push(row('Damage', escapeHtml(mainAttack.damageExpr||'—')+(mainAttack.damageType?(' '+escapeHtml(mainAttack.damageType)):'')));
    const offhand=ValidOffHandSummary(player);
    if(offhand) {
      rows.push(row('Offhand Attack', escapeHtml(offhand.weaponName)+' <span class="muted">('+fmtSigned(offhand.attackBonus)+')</span>'));
      rows.push(row('Offhand Damage', escapeHtml(offhand.damageExpr||'—')+(offhand.damageType?(' '+escapeHtml(offhand.damageType)):'')));
    }
    return rows.join('');
  }

  function PanelByHeading(headingText, root) {
    const scope=root||document;
    return Array.from(scope.querySelectorAll('.panel')).find(function(panel) {
      const heading=panel.querySelector('header h2');
      return heading&&heading.textContent.trim()===headingText;
    })||null;
  }

  function UpsertCombatSummaryRows(panel) {
    if(!panel)return;
    const body=panel.querySelector('.body');
    if(!body)return;
    Array.from(body.querySelectorAll('.kv')).forEach(function(row) {
      const key=row.querySelector('.k');
      const label=key&&key.textContent?key.textContent.trim():'';
      if(['Attack', 'Damage', 'Offhand Attack', 'Offhand Damage'].includes(label))row.remove();
    });
    const inventoryRow=Array.from(body.querySelectorAll('.kv')).find(function(row) {
      const key=row.querySelector('.k');
      return key&&key.textContent.trim()==='Inventory';
    })||null;
    const rowsHtml=CombatSummaryRowsHtml(state.player);
    if(!rowsHtml)return;
    const frag=document.createRange().createContextualFragment(rowsHtml);
    body.insertBefore(frag, inventoryRow);
  }

  function RefreshCombatSummaryPanels() {
    const rightPanel=PanelByHeading('Character Sheet');
    if(rightPanel)UpsertCombatSummaryRows(rightPanel);
    const mainBody=document.getElementById('main_body');
    if(mainBody&&state&&state.tab==='character') {
      const overviewPanel=PanelByHeading('Overview', mainBody);
      if(overviewPanel)UpsertCombatSummaryRows(overviewPanel);
    }
  }

  function CloneFeatRankState(rankState) {
    return {
      classRanks:normalizeClassFeatRanks(rankState&&rankState.classRanks||{
      }), skillRanks:normalizeSkillFeatRanks(rankState&&rankState.skillRanks||{
      }), generalRanks:normalizeGeneralFeatRanks(rankState&&rankState.generalRanks||{
      })
    };
  }

  function LevelUpBaseFeatState(st) {
    const stored=st&&st.ui&&st.ui.levelUpBaseFeatRanks&&typeof st.ui.levelUpBaseFeatRanks==="object"?st.ui.levelUpBaseFeatRanks:(st&&st.player?featRanksState(st.player):null);
    return CloneFeatRankState(stored||{
      classRanks:{
      }, skillRanks:{
      }, generalRanks:{
      }
    });
  }

  function SetLevelUpBaseFeatState(st) {
    if(!st||!st.ui||!st.player)return;
    st.ui.levelUpBaseFeatRanks=CloneFeatRankState(featRanksState(st.player));
  }

  function ClearLevelUpBaseFeatState(st) {
    if(st&&st.ui&&Object.prototype.hasOwnProperty.call(st.ui, "levelUpBaseFeatRanks")) {
      delete st.ui.levelUpBaseFeatRanks;
    }
  }

  function ResetLevelUpFeatDrafts(st) {
    if(!st||!st.player||!st.ui)return;
    const baseRanks=LevelUpBaseFeatState(st);
    const next=buildLevelUpPreview(st.player, {
      ...(st.ui.levelUpDraft||{
      }), classFeatDraft:{
        ...baseRanks.classRanks
      }, skillFeatDraft:{
        ...baseRanks.skillRanks
      }, generalFeatDraft:{
        ...baseRanks.generalRanks
      }
    });
    st.ui.levelUpDraft=levelUpDraftFromPreview(next);
  }

  function CommittedFeatStateForContext(st, context) {
    if(context==='levelup'&&st&&st.player) {
      return LevelUpBaseFeatState(st);
    }
    if(context==='creator') {
      return {
        classRanks:normalizeClassFeatRanks((st&&st._draftClassFeat)||{
        }), skillRanks:normalizeSkillFeatRanks((st&&st._draftSkillFeat)||{
        }), generalRanks:normalizeGeneralFeatRanks((st&&st._draftGeneralFeat)||{
        })
      };
    }
    if(st&&st.player)return featRanksState(st.player);
    return {
      classRanks:{
      }, skillRanks:{
      }, generalRanks:{
      }
    };
  }

  const BaseOpenFeatDialog=openFeatDialog;

  openFeatDialog=function(st, options) {
    const context=options&&options.context||'character';
    FeatUndoLock={
      context, committedState:CommittedFeatStateForContext(st||state, context)
    };
    return BaseOpenFeatDialog(st, options);
  };

  const BaseCanDecreaseFeatRank=canDecreaseFeatRank;

  canDecreaseFeatRank=function(player, featId, rankState, options) {
    const result=BaseCanDecreaseFeatRank(player, featId, rankState, options);
    if(!result.ok)return result;
    const lock=FeatUndoLock;
    const context=options&&options.context||(lock&&lock.context)||'';
    if(context!=='character'&&context!=='levelup')return result;
    const committedState=options&&options.committedState||(lock&&lock.committedState);
    if(!committedState)return result;
    const current=featRankForState(rankState, featId);
    const floor=featRankForState(committedState, featId);
    if(current<=floor) {
      return {
        ok:false, reason:context==='levelup'?'Already back to your pre-level feat ranks.':'Invested feat ranks are locked after Done. Visit Training to reset them.'
      };
    }
    return result;
  };

  function CurrentLevelUpUnlockSnapshot(st) {
    if(!st||!st.player||!st.ui||!st.ui.levelUpOpen)return null;
    const preview=buildLevelUpPreview(st.player, st.ui.levelUpDraft||{
    });
    const ctx=buildFeatContext(st.player, {
      levelsOverride:preview.levels, totalLevelOverride:preview.nextTotalLevel, questUnlocksOverride:st.player.questUnlocks, statsOverride:preview.stats, skillProficiencyOverride:mergeSkillProficiencies(st.player, preview.skillTrainDraft), classFeatRanksOverride:preview.classFeatDraft, skillFeatRanksOverride:preview.skillFeatDraft, generalFeatRanksOverride:preview.generalFeatDraft
    });
    return {
      signature:JSON.stringify({
        classId:preview.classId, statAlloc:preview.statAlloc, skillTrainDraft:preview.skillTrainDraft, classFeatDraft:preview.classFeatDraft, skillFeatDraft:preview.skillFeatDraft, generalFeatDraft:preview.generalFeatDraft
      }), unlockedIds:[...new Set([...unlockedClassFeatIds(ctx), ...unlockedSkillFeatIds(ctx), ...unlockedGeneralFeatIds(ctx)])]
    };
  }

  function MaybeQueueLevelUpUnlockNotice(st) {
    const snapshot=CurrentLevelUpUnlockSnapshot(st);
    if(!snapshot) {
      LevelUpUnlockCache=null;
      return;
    }
    if(LevelUpUnlockCache&&LevelUpUnlockCache.signature!==snapshot.signature) {
      const previous=new Set(LevelUpUnlockCache.unlockedIds||[]);
      const newIds=snapshot.unlockedIds.filter(function(featId) {
        return!previous.has(featId);
      });
      if(newIds.length)showUnlockedFeatNotice(st, newIds, 'Your current level-up choices unlocked new feats.');
    }
    LevelUpUnlockCache=snapshot;
  }

  function BaseSkillProficiencyMap(player) {
    const base=Object.fromEntries(SKILLS.map(function(skill) {
      return[skill.id, 0];
    }));
    const startingSkillId=player&&player.startingSkillId?player.startingSkillId:null;
    if(startingSkillId&&Object.prototype.hasOwnProperty.call(base, startingSkillId))base[startingSkillId]=2;
    return base;
  }

  function RemoveInvalidFeatRanks(player) {
    const invalidIds=invalidInvestedFeatIds(player, {
      levelsOverride:player.levels, totalLevelOverride:totalLevel(player), questUnlocksOverride:player.questUnlocks, statsOverride:player.stats, skillProficiencyOverride:player.skillProficiency, classFeatRanksOverride:player.classFeatRanks, skillFeatRanksOverride:player.skillFeatRanks, generalFeatRanksOverride:player.generalFeatRanks
    });
    const removed=[];
    invalidIds.forEach(function(featId) {
      const category=featCategoryForId(featId);
      let rank=0;
      if(category==='class')rank=Number(player.classFeatRanks&&player.classFeatRanks[featId]||0);
      else if(category==='skill')rank=Number(player.skillFeatRanks&&player.skillFeatRanks[featId]||0);
      else if(category==='general')rank=Number(player.generalFeatRanks&&player.generalFeatRanks[featId]||0);
      if(rank<=0)return;
      removed.push(featName(featId)+' '+rank);
      if(category==='class')delete player.classFeatRanks[featId];
      else if(category==='skill')delete player.skillFeatRanks[featId];
      else if(category==='general')delete player.generalFeatRanks[featId];
    });
    return removed;
  }

  function ResetAllFeatRanks(st) {
    if(!st||!st.player)return;
    const spent=totalFeatPointsSpentFromDrafts(featRanksState(st.player));
    st.player.classFeatRanks={
    };
    st.player.skillFeatRanks={
    };
    st.player.generalFeatRanks={
    };
    syncPlayerAbilityIdsForLevels(st.player);
    if(st.ui&&st.ui.levelUpDraft) {
      st.ui.levelUpDraft.classFeatDraft={
      };
      st.ui.levelUpDraft.skillFeatDraft={
      };
      st.ui.levelUpDraft.generalFeatDraft={
      };
    }
    log(st, 'Training reset: all invested feat ranks were cleared'+(spent>0?(' ('+spent+' point'+(spent===1?'':'s')+' returned to your feat pool).'):'.'));
    toast('All feat ranks reset.', 'good');
    save(st);
    render();
  }

  function ResetAllSkillTraining(st) {
    if(!st||!st.player)return;
    const base=BaseSkillProficiencyMap(st.player);
    let refunded=0;
    SKILLS.forEach(function(skill) {
      const current=Math.max(0, Number(st.player.skillProficiency&&st.player.skillProficiency[skill.id]||0));
      const floor=Math.max(0, Number(base[skill.id]||0));
      refunded+=Math.max(0, current-floor);
    });
    st.player.skillProficiency=base;
    st.player.skillPoints=Math.max(0, Number(st.player.skillPoints||0))+refunded;
    if(st.ui) {
      st.ui.skillDraft={
      };
      if(st.ui.levelUpDraft)st.ui.levelUpDraft.skillTrainDraft={
      };
    }
    const removedFeats=RemoveInvalidFeatRanks(st.player);
    syncPlayerAbilityIdsForLevels(st.player);
    let message='Training reset: '+refunded+' skill point'+(refunded===1?'':'s')+' returned to your training pool.';
    if(removedFeats.length)message+=' Feat ranks removed because their requirements are no longer met: '+removedFeats.join(', ')+'.';
    log(st, message);
    toast('Skill training reset.', 'good');
    save(st);
    render();
  }

  function EnhanceLevelUpFeatTooltips() {
    return;
  }

  function InjectTrainingNpcActions() {
    if(!state||state.tab!=='town'||state.world.areaId!=='town'||state.ui.selectedTownNpcId!==TrainingNpcId)return;
    const mainBody=document.getElementById('main_body');
    if(!mainBody)return;
    const talkBtn=mainBody.querySelector('button[data-talk-npc="'+TrainingNpcId+'"]');
    const actionRow=talkBtn?talkBtn.parentElement:null;
    if(!actionRow)return;
    if(!actionRow.querySelector('[data-training-reset-feats]')) {
      const featBtn=document.createElement('button');
      featBtn.className='btn';
      featBtn.type='button';
      featBtn.textContent='Reset Feats';
      featBtn.setAttribute('data-training-reset-feats', '1');
      featBtn.addEventListener('click', async function() {
        const ok=await confirmDialog({
          title:'Reset all feat ranks?', message:'This clears every invested class, skill, and general feat rank and returns all spent feat points to your pool.', okText:'Reset Feats', cancelText:'Keep Feats', okKind:'danger'
        });
        if(!ok)return;
        ResetAllFeatRanks(state);
      });
      actionRow.appendChild(featBtn);
    }
    if(!actionRow.querySelector('[data-training-reset-skills]')) {
      const skillBtn=document.createElement('button');
      skillBtn.className='btn';
      skillBtn.type='button';
      skillBtn.textContent='Reset Skill Training';
      skillBtn.setAttribute('data-training-reset-skills', '1');
      skillBtn.addEventListener('click', async function() {
        const ok=await confirmDialog({
          title:'Reset all skill training?', message:'This refunds all invested skill training points. Feat ranks that no longer meet their requirements will also be removed.', okText:'Reset Skills', cancelText:'Keep Training', okKind:'danger'
        });
        if(!ok)return;
        ResetAllSkillTraining(state);
      });
      actionRow.appendChild(skillBtn);
    }
    if(!mainBody.querySelector('.trainingNpcActionsNote')) {
      const note=document.createElement('div');
      note.className='small muted trainingNpcActionsNote';
      note.textContent='Training resets refund invested points. Skill resets also remove feat ranks that no longer meet their requirements.';
      actionRow.insertAdjacentElement('afterend', note);
    }
  }

  const FinalLevelUp=levelUp;

  levelUp=function(st, rawDraft) {
    const result=FinalLevelUp(st, rawDraft);
    if(st&&st.ui&&!st.ui.levelUpOpen) {
      ClearLevelUpBaseFeatState(st);
    }
    return result;
  };

  const UserFinalRender=render;

  render=function() {
    MaybeQueueLevelUpUnlockNotice(state);
    UserFinalRender();
    EnsureShortRestInterval();
    SyncShortRestButtons();
    RefreshCombatSummaryPanels();
    EnhanceLevelUpFeatTooltips();
    InjectTrainingNpcActions();
  };

  // ---------------------------------------------------------------------------
  // Statistics and telemetry
  // ---------------------------------------------------------------------------
  const __statsCounterTemplate=Object.freeze({
    combatsStarted:0, combatsWon:0, combatsLost:0, combatsEscaped:0, deaths:0, monstersDefeated:0, attacksMade:0, attacksHit:0, attacksMissed:0, criticalHits:0, enemyAttacksMade:0, enemyAttacksHit:0, enemyAttacksMissed:0, enemyCriticalHits:0, damageDealt:0, damageTaken:0, healingDone:0, healingReceived:0, spSpent:0, spRecovered:0, consumablesUsed:0, potionsUsed:0, shortRests:0, longRests:0, xpGained:0, xpSpentOnLevelUps:0, levelUps:0, questsAccepted:0, questsCompleted:0, moneyGainedCp:0, moneySpentCp:0, shopPurchases:0, shopSales:0, itemsBought:0, itemsSold:0, movementSteps:0, scoutActions:0, tilesRevealed:0, gatherAttempts:0, resourcesGathered:0, treasuresOpened:0, craftAttempts:0, craftSuccesses:0, craftFailures:0, criticalCrafts:0, itemsCrafted:0
  });

  const __statsMaximaTemplate=Object.freeze({
    biggestHitDealt:0, biggestHitTaken:0, biggestHealDone:0, biggestMoneyGainCp:0, biggestMoneySpendCp:0, highestLevel:0, highestDay:1
  });

  const __statisticsSummaryCards=[{
    key:'combatsWon', label:'Combats won'
  }, {
    key:'questsCompleted', label:'Quests completed'
  }, {
    key:'damageDealt', label:'Damage dealt'
  }, {
    key:'healingReceived', label:'Healing received'
  }, {
    key:'moneyGainedCp', label:'Money gained', format:'coins'
  }, {
    key:'itemsCrafted', label:'Items crafted'
  }];

  const __statisticsSections=[{
    title:'Combat', items:[{
      key:'combatsStarted', label:'Combats started'
    }, {
      key:'combatsWon', label:'Combats won'
    }, {
      key:'combatsLost', label:'Combats lost'
    }, {
      key:'combatsEscaped', label:'Combats escaped'
    }, {
      key:'monstersDefeated', label:'Monsters defeated'
    }, {
      key:'attacksMade', label:'Player attacks made'
    }, {
      key:'attacksHit', label:'Player attacks hit'
    }, {
      key:'attacksMissed', label:'Player attacks missed'
    }, {
      key:'criticalHits', label:'Player critical hits'
    }, {
      label:'Player hit rate', format:'text', value:function(st) {
        const stats=__ensureStatisticsState(st);
        const made=Number(stats.counters.attacksMade||0);
        const hit=Number(stats.counters.attacksHit||0);
        return made>0?(((hit/made)*100).toFixed(1)+'% ('+hit+'/'+made+')'):'—';
      }
    }, {
      key:'enemyAttacksMade', label:'Enemy attacks made'
    }, {
      key:'enemyAttacksHit', label:'Enemy attacks hit'
    }, {
      key:'enemyAttacksMissed', label:'Enemy attacks missed'
    }, {
      key:'enemyCriticalHits', label:'Enemy critical hits'
    }, {
      label:'Enemy hit rate', format:'text', value:function(st) {
        const stats=__ensureStatisticsState(st);
        const made=Number(stats.counters.enemyAttacksMade||0);
        const hit=Number(stats.counters.enemyAttacksHit||0);
        return made>0?(((hit/made)*100).toFixed(1)+'% ('+hit+'/'+made+')'):'—';
      }
    }]
  }, {
    title:'Damage & Recovery', items:[{
      key:'damageDealt', label:'Damage dealt'
    }, {
      key:'damageTaken', label:'Damage taken'
    }, {
      key:'healingDone', label:'Healing done'
    }, {
      key:'healingReceived', label:'Healing received'
    }, {
      key:'spSpent', label:'SP spent'
    }, {
      key:'spRecovered', label:'SP recovered'
    }, {
      key:'consumablesUsed', label:'Consumables used'
    }, {
      key:'potionsUsed', label:'Potions used'
    }, {
      key:'shortRests', label:'Short rests taken'
    }, {
      key:'longRests', label:'Long rests taken'
    }, {
      key:'deaths', label:'Deaths'
    }]
  }, {
    title:'Progress & Quests', items:[{
      key:'xpGained', label:'XP gained'
    }, {
      key:'xpSpentOnLevelUps', label:'XP spent on level-ups'
    }, {
      key:'levelUps', label:'Level-ups completed'
    }, {
      key:'highestLevel', scope:'maxima', label:'Highest level reached'
    }, {
      key:'highestDay', scope:'maxima', label:'Highest day reached'
    }, {
      key:'questsAccepted', label:'Quests accepted'
    }, {
      key:'questsCompleted', label:'Quests completed'
    }]
  }, {
    title:'Economy', items:[{
      key:'moneyGainedCp', label:'Money gained', format:'coins'
    }, {
      key:'moneySpentCp', label:'Money spent', format:'coins'
    }, {
      key:'shopPurchases', label:'Shop purchases'
    }, {
      key:'shopSales', label:'Shop sales'
    }, {
      key:'itemsBought', label:'Items bought'
    }, {
      key:'itemsSold', label:'Items sold'
    }, {
      key:'biggestMoneyGainCp', scope:'maxima', label:'Biggest single money gain', format:'coins'
    }, {
      key:'biggestMoneySpendCp', scope:'maxima', label:'Biggest single spend', format:'coins'
    }]
  }, {
    title:'Exploration & Crafting', items:[{
      key:'movementSteps', label:'Movement steps taken'
    }, {
      key:'scoutActions', label:'Scout actions used'
    }, {
      key:'tilesRevealed', label:'Tiles revealed'
    }, {
      key:'gatherAttempts', label:'Gather attempts'
    }, {
      key:'resourcesGathered', label:'Resources gathered'
    }, {
      key:'treasuresOpened', label:'Treasure caches opened'
    }, {
      key:'craftAttempts', label:'Craft attempts'
    }, {
      key:'craftSuccesses', label:'Craft successes'
    }, {
      key:'craftFailures', label:'Craft failures'
    }, {
      key:'criticalCrafts', label:'Critical crafts'
    }, {
      key:'itemsCrafted', label:'Items crafted'
    }]
  }, {
    title:'Records', items:[{
      key:'biggestHitDealt', scope:'maxima', label:'Biggest single hit dealt'
    }, {
      key:'biggestHitTaken', scope:'maxima', label:'Biggest single hit taken'
    }, {
      key:'biggestHealDone', scope:'maxima', label:'Biggest single heal'
    }]
  }];

  function __createStatisticsState() {
    return {
      counters:{
        ...__statsCounterTemplate
      }, maxima:{
        ...__statsMaximaTemplate
      }
    };
  }

  function __normalizeStatisticsBucket(raw, template) {
    const source=raw&&typeof raw==='object'?raw:{
    };
    const normalized={
    };
    Object.keys(template).forEach(function(key) {
      const value=Number(source[key]||0);
      normalized[key]=Math.max(0, Number.isFinite(value)?value:0);
    });
    return normalized;
  }

  function __ensureStatisticsState(st) {
    if(!st||typeof st!=='object')return __createStatisticsState();
    const raw=st.statistics&&typeof st.statistics==='object'?st.statistics:{
    };
    const rawCounters=raw.counters&&typeof raw.counters==='object'?raw.counters:raw;
    const rawMaxima=raw.maxima&&typeof raw.maxima==='object'?raw.maxima:{
    };
    st.statistics={
      counters:__normalizeStatisticsBucket(rawCounters, __statsCounterTemplate), maxima:__normalizeStatisticsBucket(rawMaxima, __statsMaximaTemplate)
    };
    if(st.player)st.statistics.maxima.highestLevel=Math.max(st.statistics.maxima.highestLevel, totalLevel(st.player));
    if(st.world)st.statistics.maxima.highestDay=Math.max(st.statistics.maxima.highestDay, Math.max(1, Number(st.world.day||1)));
    return st.statistics;
  }

  function __statisticsTextValue(value, format) {
    if(format==='coins')return formatCoins(Math.max(0, Math.floor(Number(value||0))));
    if(format==='text')return String(value==null||value===''?'—':value);
    return Number(value||0).toLocaleString();
  }

  function __statisticsRawValue(st, item) {
    if(typeof item.value==='function')return item.value(st);
    const stats=__ensureStatisticsState(st);
    const bucket=item.scope==='maxima'?stats.maxima:stats.counters;
    return bucket[item.key]||0;
  }

  function __statisticsValueHtml(st, item, extraClass) {
    const className=extraClass?(' '+extraClass):'';
    const text=__statisticsTextValue(__statisticsRawValue(st, item), item.format||'number');
    return'<span class="statisticsValue'+className+'">'+escapeHtml(text)+'</span>';
  }

  function __statisticsRowHtml(st, item) {
    return'<tr><td class="statisticsLabel">'+escapeHtml(item.label)+'</td><td class="statisticsValueCell">'+__statisticsValueHtml(st, item, item.format==='text'?'':'mono')+'</td></tr>';
  }

  function __statisticsCardHtml(st,item){return`
        <div class="statisticsCard">
          <div class="statisticsCardLabel">${escapeHtml(item.label)}</div>
          <div class="statisticsCardValue">${__statisticsValueHtml(st, item, item.format === 'text' ? '' : 'mono')}</div>
        </div>
      `;}

  function __renderStatisticsTab(){const stats=__ensureStatisticsState(state);const summaryCards=__statisticsSummaryCards.map(function(item){return __statisticsCardHtml(state,item);}).join('');const sections=__statisticsSections.map(function(section){return`
          <div class="statisticsSection">
            <div class="statisticsSectionHeader">
              <h3>${escapeHtml(section.title)}</h3>
            </div>
            <div class="statisticsSectionBody">
              <div class="tableWrap">
                <table class="statisticsTable">
                  <tbody>${section.items.map(function (item) { return __statisticsRowHtml(state, item); }).join('')}</tbody>
                </table>
              </div>
            </div>
          </div>
        `;}).join('');return`
        <div class="statisticsPage">
          <div class="small muted statisticsIntro">These counters persist with the save and continue climbing as you play. Current run highlights: level ${escapeHtml(String(stats.maxima.highestLevel || 0))}, day ${escapeHtml(String(stats.maxima.highestDay || 1))}.</div>
          <div class="statisticsSummaryGrid">${summaryCards}</div>
          ${sections}
        </div>
      `;}

  function __incStat(st, key, amount) {
    const value=Number(amount||0);
    if(!st||!key||!Number.isFinite(value)||value<=0)return 0;
    const stats=__ensureStatisticsState(st);
    stats.counters[key]=Math.max(0, Number(stats.counters[key]||0)+value);
    return value;
  }

  function __maxStat(st, key, value) {
    const next=Number(value||0);
    if(!st||!key||!Number.isFinite(next)||next<=0)return 0;
    const stats=__ensureStatisticsState(st);
    stats.maxima[key]=Math.max(Number(stats.maxima[key]||0), next);
    return stats.maxima[key];
  }

  function __recordMoneyGain(st, cp) {
    const value=Math.max(0, Math.floor(Number(cp||0)));
    if(!value)return;
    __incStat(st, 'moneyGainedCp', value);
    __maxStat(st, 'biggestMoneyGainCp', value);
  }

  function __recordMoneySpend(st, cp) {
    const value=Math.max(0, Math.floor(Number(cp||0)));
    if(!value)return;
    __incStat(st, 'moneySpentCp', value);
    __maxStat(st, 'biggestMoneySpendCp', value);
  }

  function __recordDamageDealt(st, amount) {
    const value=Math.max(0, Math.floor(Number(amount||0)));
    if(!value)return;
    __incStat(st, 'damageDealt', value);
    __maxStat(st, 'biggestHitDealt', value);
  }

  function __recordDamageTaken(st, amount) {
    const value=Math.max(0, Math.floor(Number(amount||0)));
    if(!value)return;
    __incStat(st, 'damageTaken', value);
    __maxStat(st, 'biggestHitTaken', value);
  }

  function __recordHealing(st, amount, options) {
    const value=Math.max(0, Math.floor(Number(amount||0)));
    if(!value)return;
    __incStat(st, 'healingDone', value);
    __maxStat(st, 'biggestHealDone', value);
    if(options&&options.target==='player')__incStat(st, 'healingReceived', value);
  }

  function __recordSpRecovered(st, amount) {
    const value=Math.max(0, Math.floor(Number(amount||0)));
    if(!value)return;
    __incStat(st, 'spRecovered', value);
  }

  function __countInventoryQuantity(player, itemId) {
    if(!player||!Array.isArray(player.inventory)||!itemId)return 0;
    const entry=player.inventory.find(function(row) {
      return row&&row.itemId===itemId;
    });
    return Math.max(0, Number(entry&&entry.qty||0));
  }

  function __countRevealedTiles(areaState) {
    if(!areaState||!Array.isArray(areaState.tiles))return 0;
    return areaState.tiles.reduce(function(total, row) {
      return total+(Array.isArray(row)?row.reduce(function(rowTotal, tile) {
        return rowTotal+(tile&&tile.revealed?1:0);
      }, 0):0);
    }, 0);
  }

  function __logEntryTextSafe(entry) {
    if(typeof logEntryText==='function') {
      try {
        return logEntryText(entry);
      } catch(_) {
      }
    }
    if(typeof entry==='string')return entry;
    if(entry&&typeof entry==='object'&&!Array.isArray(entry))return String(entry.message||'');
    return String(entry||'');
  }

  const __statsBaseDefaultState=defaultState;

  defaultState=function() {
    const st=__statsBaseDefaultState();
    st.statistics=__createStatisticsState();
    return st;
  };

  const __statsBaseNormalizeState=normalizeState;

  normalizeState=function(st) {
    const requestedTab=st&&st.tab;
    const normalized=__statsBaseNormalizeState(st);
    __ensureStatisticsState(normalized);
    if(requestedTab==='statistics')normalized.tab='statistics';
    return normalized;
  };

  renderActionsMenu=function(){return`
	<div class="actionsMenu">
	  <div class="actionsNav">
		${tabButton('explore', '🗺️Explore')}
		${tabButton('combat', '⚔️Combat', !state.combat)}
		${tabButton('character', '🧝🏻Character')}
		${tabButton('inventory', '💼Inventory')}
		${tabButton('town', '🏘️Town', (state.world.areaId !== 'town'))}
		${tabButton('quests', '📜Quests')}
		${tabButton('crafting', '⚒️Crafting')}
		${tabButton('shop', '💰Shop', (state.world.areaId !== 'town'))}
		${tabButton('statistics', 'ℹ️Statistics')}
		${tabButton('settings', '⚙️Settings')}
	  </div>
	  <div class="sidebarDivider"></div>
	  <div class="saveToolsWrap">
		<button class="tabbtn mini saveToggleBtn" data-ui-action="toggle-save-tools">${state.ui.saveToolsVisible ? 'Hide Save Menu' : 'Save Menu'}</button>
		${state.ui.saveToolsVisible ? `
		  <div class="saveToolsGrid">
			<button class="tabbtn mini filledGrey" data-ui-action="save">Save</button>
			<button class="tabbtn mini filledGrey" data-ui-action="export">Export Save</button>
			<button class="tabbtn mini filledGrey" data-ui-action="import">Import Save</button>
			<button class="tabbtn mini filledDanger" data-ui-action="new">New Game</button>
		  </div>
		` : ''}
	  </div>
	</div>
  `;};

  const __statsBaseRenderActiveTab=renderActiveTab;

  renderActiveTab=function() {
    if(state&&state.tab==='statistics') {
      const title=document.getElementById('main_title');
      const hint=document.getElementById('main_hint');
      const body=document.getElementById('main_body');
      if(title)title.textContent='Statistics';
      if(hint)hint.textContent='Track combat, recovery, quests, economy, exploration, and crafting totals.';
      if(body)body.innerHTML=__renderStatisticsTab();
      return;
    }
    return __statsBaseRenderActiveTab();
  };

  const __statsBaseIsCombatAccessibleTab=isCombatAccessibleTab;

  isCombatAccessibleTab=function(tabId) {
    return String(tabId||'')==='statistics'||__statsBaseIsCombatAccessibleTab(tabId);
  };

  const __statsBaseAddCoins=addCoins;

  addCoins=function(st, cp) {
    const result=__statsBaseAddCoins(st, cp);
    __recordMoneyGain(st, cp);
    return result;
  };

  const __statsBaseSpendCoins=spendCoins;

  spendCoins=function(st, costCp) {
    const before=st&&st.player?Math.max(0, Math.floor(Number(st.player.moneyCp||0))):0;
    const ok=__statsBaseSpendCoins(st, costCp);
    if(ok&&st&&st.player) {
      const after=Math.max(0, Math.floor(Number(st.player.moneyCp||0)));
      __recordMoneySpend(st, Math.max(0, before-after));
    }
    return ok;
  };

  const __statsBaseResolvePlayerAttack=resolvePlayerAttack;

  resolvePlayerAttack=function(st, options) {
    const result=__statsBaseResolvePlayerAttack(st, options);
    if(result&&result.usedAction&&st) {
      __incStat(st, 'attacksMade', 1);
      if(result.hit) {
        __incStat(st, 'attacksHit', 1);
        if(result.outcome==='crit')__incStat(st, 'criticalHits', 1);
        __recordDamageDealt(st, result.damage||0);
      } else {
        __incStat(st, 'attacksMissed', 1);
      }
    }
    return result;
  };

  const __statsBaseDealDamageToEnemy=dealDamageToEnemy;

  dealDamageToEnemy=function(st, amount, damageType, options) {
    const result=__statsBaseDealDamageToEnemy(st, amount, damageType, options||{
    });
    __recordDamageDealt(st, result&&result.damage||0);
    return result;
  };

  const __statsBaseDealDamageToPlayer=dealDamageToPlayer;

  dealDamageToPlayer=function(st, amount, damageType, options) {
    const before=st&&st.player&&st.player.hp?Number(st.player.hp.current||0):0;
    const result=__statsBaseDealDamageToPlayer(st, amount, damageType, options||{
    });
    const after=st&&st.player&&st.player.hp?Number(st.player.hp.current||0):0;
    __recordDamageTaken(st, Math.max(0, before-after));
    return result;
  };

  const __statsBasePfResolveEnemyAction=pfResolveEnemyAction;

  pfResolveEnemyAction=function(st,enemy){const beforeHp=st&&st.player&&st.player.hp?Number(st.player.hp.current||0):0;const beforeLogLen=st&&Array.isArray(st.log)?st.log.length:0;const result=__statsBasePfResolveEnemyAction(st,enemy);if(st){__incStat(st,'enemyAttacksMade',1);const afterHp=st.player&&st.player.hp?Number(st.player.hp.current||0):0;const newText=(Array.isArray(st.log)?st.log.slice(beforeLogLen):[]).map(__logEntryTextSafe).join(' ');const didCrit=/critically hits you/i.test(newText);const didHit=didCrit||/hits you for/i.test(newText);const didMiss=/misses you/i.test(newText);if(didHit){__incStat(st,'enemyAttacksHit',1);if(didCrit)__incStat(st,'enemyCriticalHits',1);}else if(didMiss||(result&&result.usedAction)){__incStat(st,'enemyAttacksMissed',1);}__recordDamageTaken(st,Math.max(0,beforeHp-afterHp));}return result;};

  const __statsBaseApplyCombatHealingItemToTarget=applyCombatHealingItemToTarget;

  applyCombatHealingItemToTarget=function(st, item, targetInfo) {
    const result=__statsBaseApplyCombatHealingItemToTarget(st, item, targetInfo);
    const healed=Math.max(0, Number(result&&result.healed||0));
    if(healed>0) {
      const isPlayerTarget=!!(targetInfo&&targetInfo.entity&&st&&st.player&&targetInfo.entity===st.player);
      __recordHealing(st, healed, {
        target:isPlayerTarget?'player':'other'
      });
    }
    return result;
  };

  const __statsBaseUseCombatItemOnTarget=useCombatItemOnTarget;

  useCombatItemOnTarget=function(st,itemId){const beforeQty=st&&st.player?__countInventoryQuantity(st.player,itemId):0;const result=__statsBaseUseCombatItemOnTarget(st,itemId);const afterQty=st&&st.player?__countInventoryQuantity(st.player,itemId):0;if(beforeQty>afterQty){__incStat(st,'consumablesUsed',beforeQty-afterQty);if(/potion/i.test(String(itemId||'')))__incStat(st,'potionsUsed',beforeQty-afterQty);}return result;};

  const __statsBaseUseConsumable=useConsumable;

  useConsumable=function(st,itemId){const inCombat=!!(st&&st.combat);const beforeQty=st&&st.player?__countInventoryQuantity(st.player,itemId):0;const beforeHp=st&&st.player&&st.player.hp?Number(st.player.hp.current||0):0;const beforeSp=st&&st.player&&st.player.sp?Number(st.player.sp.current||0):0;const result=__statsBaseUseConsumable(st,itemId);if(!inCombat&&st&&st.player){const afterQty=__countInventoryQuantity(st.player,itemId);if(beforeQty>afterQty){const used=beforeQty-afterQty;__incStat(st,'consumablesUsed',used);if(/potion/i.test(String(itemId||'')))__incStat(st,'potionsUsed',used);}const afterHp=st.player.hp?Number(st.player.hp.current||0):0;const afterSp=st.player.sp?Number(st.player.sp.current||0):0;__recordHealing(st,Math.max(0,afterHp-beforeHp),{target:'player'});__recordSpRecovered(st,Math.max(0,afterSp-beforeSp));}return result;};

  const __statsBaseSpendAbilitySp=spendAbilitySp;

  spendAbilitySp=function(st, abilityId) {
    const before=st&&st.player&&st.player.sp?Number(st.player.sp.current||0):0;
    const result=__statsBaseSpendAbilitySp(st, abilityId);
    const after=st&&st.player&&st.player.sp?Number(st.player.sp.current||0):0;
    __incStat(st, 'spSpent', Math.max(0, before-after));
    return result;
  };

  const __statsBaseShortRest=shortRest;

  shortRest=function(st){const beforeHp=st&&st.player&&st.player.hp?Number(st.player.hp.current||0):0;const beforeSp=st&&st.player&&st.player.sp?Number(st.player.sp.current||0):0;const beforeLogLen=st&&Array.isArray(st.log)?st.log.length:0;const result=__statsBaseShortRest(st);const newText=(st&&Array.isArray(st.log)?st.log.slice(beforeLogLen):[]).map(__logEntryTextSafe).join(' ');if(/You take a short rest:/i.test(newText)){__incStat(st,'shortRests',1);const afterHp=st&&st.player&&st.player.hp?Number(st.player.hp.current||0):0;const afterSp=st&&st.player&&st.player.sp?Number(st.player.sp.current||0):0;__recordHealing(st,Math.max(0,afterHp-beforeHp),{target:'player'});__recordSpRecovered(st,Math.max(0,afterSp-beforeSp));}return result;};

  const __statsBaseLongRest=longRest;

  longRest=function(st) {
    const beforeHp=st&&st.player&&st.player.hp?Number(st.player.hp.current||0):0;
    const beforeSp=st&&st.player&&st.player.sp?Number(st.player.sp.current||0):0;
    const beforeDay=st&&st.world?Number(st.world.day||1):1;
    const result=__statsBaseLongRest(st);
    const afterDay=st&&st.world?Number(st.world.day||1):beforeDay;
    if(afterDay>beforeDay) {
      __incStat(st, 'longRests', 1);
      const afterHp=st&&st.player&&st.player.hp?Number(st.player.hp.current||0):0;
      const afterSp=st&&st.player&&st.player.sp?Number(st.player.sp.current||0):0;
      __recordHealing(st, Math.max(0, afterHp-beforeHp), {
        target:'player'
      });
      __recordSpRecovered(st, Math.max(0, afterSp-beforeSp));
      __maxStat(st, 'highestDay', afterDay);
    }
    return result;
  };

  const __statsBaseStartEncounter=startEncounter;

  startEncounter=function(st, monsterId) {
    const result=__statsBaseStartEncounter(st, monsterId);
    __incStat(st, 'combatsStarted', 1);
    return result;
  };

  const __statsBaseEndCombat=endCombat;

  endCombat=function(st, victory) {
    const hadCombat=!!(st&&st.combat);
    const result=__statsBaseEndCombat(st, victory);
    if(hadCombat) {
      if(victory)__incStat(st, 'combatsWon', 1);
      else __incStat(st, 'combatsEscaped', 1);
    }
    return result;
  };

  const __statsBaseHandlePlayerDefeat=handlePlayerDefeat;

  handlePlayerDefeat=function(st) {
    const hadCombat=!!(st&&st.combat);
    const result=__statsBaseHandlePlayerDefeat(st);
    __incStat(st, 'deaths', 1);
    if(hadCombat)__incStat(st, 'combatsLost', 1);
    return result;
  };

  const __statsBaseRemoveEnemyFromCombat=removeEnemyFromCombat;

  removeEnemyFromCombat=function(st, enemy) {
    const result=__statsBaseRemoveEnemyFromCombat(st, enemy);
    if(result&&result.defeated)__incStat(st, 'monstersDefeated', 1);
    return result;
  };

  const __statsBaseApplyEncounterVictoryRewards=applyEncounterVictoryRewards;

  applyEncounterVictoryRewards=function(st, enemies) {
    const beforeXp=st&&st.player?Number(st.player.xp||0):0;
    const beforeHp=st&&st.player&&st.player.hp?Number(st.player.hp.current||0):0;
    const rewards=__statsBaseApplyEncounterVictoryRewards(st, enemies);
    const afterXp=st&&st.player?Number(st.player.xp||0):beforeXp;
    const afterHp=st&&st.player&&st.player.hp?Number(st.player.hp.current||0):beforeHp;
    __incStat(st, 'xpGained', Math.max(0, afterXp-beforeXp));
    __recordHealing(st, Math.max(0, afterHp-beforeHp), {
      target:'player'
    });
    return rewards;
  };

  const __statsBaseAcceptQuest=acceptQuest;

  acceptQuest=function(st, questId, npcId) {
    const before=st&&st.quests&&st.quests.active?Object.keys(st.quests.active).length:0;
    const result=__statsBaseAcceptQuest(st, questId, npcId);
    const after=st&&st.quests&&st.quests.active?Object.keys(st.quests.active).length:before;
    if(after>before)__incStat(st, 'questsAccepted', after-before);
    return result;
  };

  const __statsBaseTurnInQuest=turnInQuest;

  turnInQuest=function(st, questId, npcId) {
    const before=st&&st.quests&&st.quests.completed?Object.keys(st.quests.completed).length:0;
    const result=__statsBaseTurnInQuest(st, questId, npcId);
    const after=st&&st.quests&&st.quests.completed?Object.keys(st.quests.completed).length:before;
    if(after>before)__incStat(st, 'questsCompleted', after-before);
    return result;
  };

  const __statsBaseBuyItem=buyItem;

  buyItem=function(st, itemId) {
    const item=ITEM_INDEX.has(itemId)?getItem(itemId):null;
    const beforeQty=st&&st.player?__countInventoryQuantity(st.player, itemId):0;
    const result=__statsBaseBuyItem(st, itemId);
    const afterQty=st&&st.player?__countInventoryQuantity(st.player, itemId):beforeQty;
    if(item&&afterQty>beforeQty) {
      __incStat(st, 'shopPurchases', 1);
      __incStat(st, 'itemsBought', afterQty-beforeQty);
    }
    return result;
  };

  const __statsBaseSellItem=sellItem;

  sellItem=function(st, itemId) {
    const beforeQty=st&&st.player?__countInventoryQuantity(st.player, itemId):0;
    const result=__statsBaseSellItem(st, itemId);
    const afterQty=st&&st.player?__countInventoryQuantity(st.player, itemId):beforeQty;
    if(beforeQty>afterQty) {
      __incStat(st, 'shopSales', 1);
      __incStat(st, 'itemsSold', beforeQty-afterQty);
    }
    return result;
  };

  const __statsBasePerformCraft=performCraft;

  performCraft=function(st, recipeId, targetId) {
    const recipe=getCraftingRecipe(recipeId);
    const beforeLogLen=st&&Array.isArray(st.log)?st.log.length:0;
    const beforeQty=recipe&&recipe.resultItemId&&st&&st.player?__countInventoryQuantity(st.player, recipe.resultItemId):0;
    const result=__statsBasePerformCraft(st, recipeId, targetId||'');
    const newText=(st&&Array.isArray(st.log)?st.log.slice(beforeLogLen):[]).map(__logEntryTextSafe).join(' ');
    const criticalSuccess=newText.indexOf(recipe.name+': critical success.')!==-1;
    const success=criticalSuccess||newText.indexOf(recipe.name+': success.')!==-1;
    const failure=newText.indexOf(recipe.name+': failure.')!==-1||newText.indexOf(recipe.name+': critical failure.')!==-1;
    if(success||failure) {
      __incStat(st, 'craftAttempts', 1);
      if(success) {
        __incStat(st, 'craftSuccesses', 1);
        if(criticalSuccess)__incStat(st, 'criticalCrafts', 1);
        let craftedQty=0;
        if(recipe.upgradeKind) {
          craftedQty=1;
        } else if(recipe.resultItemId&&st&&st.player) {
          const afterQty=__countInventoryQuantity(st.player, recipe.resultItemId);
          craftedQty=Math.max(0, afterQty-beforeQty);
          if(craftedQty<=0)craftedQty=Math.max(1, Number(recipe.resultQty||1));
        }
        __incStat(st, 'itemsCrafted', craftedQty);
      } else if(failure) {
        __incStat(st, 'craftFailures', 1);
      }
    }
    return result;
  };

  const __statsBaseGatherResource=gatherResource;

  gatherResource=function(st) {
    const tile=typeof currentTile==='function'?currentTile(st):null;
    const itemId=tile&&tile.type==='resource'?tile.content:null;
    const beforeQty=itemId&&st&&st.player?__countInventoryQuantity(st.player, itemId):0;
    const beforeSp=st&&st.player&&st.player.sp?Number(st.player.sp.current||0):0;
    const result=__statsBaseGatherResource(st);
    const afterQty=itemId&&st&&st.player?__countInventoryQuantity(st.player, itemId):beforeQty;
    const afterSp=st&&st.player&&st.player.sp?Number(st.player.sp.current||0):beforeSp;
    const spentSp=Math.max(0, beforeSp-afterSp);
    if(spentSp>0) {
      __incStat(st, 'gatherAttempts', 1);
      __incStat(st, 'spSpent', spentSp);
      __incStat(st, 'resourcesGathered', Math.max(0, afterQty-beforeQty));
    }
    return result;
  };

  const __statsBaseSearchTile=searchTile;

  searchTile=function(st) {
    const areaState=st&&st.world&&st.world.areas?st.world.areas[st.world.areaId]:null;
    const beforeRevealed=__countRevealedTiles(areaState);
    const beforeSp=st&&st.player&&st.player.sp?Number(st.player.sp.current||0):0;
    const result=__statsBaseSearchTile(st);
    const afterRevealed=__countRevealedTiles(areaState);
    const afterSp=st&&st.player&&st.player.sp?Number(st.player.sp.current||0):beforeSp;
    const spentSp=Math.max(0, beforeSp-afterSp);
    if(spentSp>0) {
      __incStat(st, 'scoutActions', 1);
      __incStat(st, 'spSpent', spentSp);
      __incStat(st, 'tilesRevealed', Math.max(0, afterRevealed-beforeRevealed));
    }
    return result;
  };

  const __statsBaseMovePlayer=movePlayer;

  movePlayer=function(st, dx, dy) {
    const areaState=st&&st.world&&st.world.areas?st.world.areas[st.world.areaId]:null;
    const beforeX=areaState?Number(areaState.px||0):0;
    const beforeY=areaState?Number(areaState.py||0):0;
    const beforeRevealed=__countRevealedTiles(areaState);
    const result=__statsBaseMovePlayer(st, dx, dy);
    const afterX=areaState?Number(areaState.px||0):beforeX;
    const afterY=areaState?Number(areaState.py||0):beforeY;
    const afterRevealed=__countRevealedTiles(areaState);
    if(afterX!==beforeX||afterY!==beforeY) {
      __incStat(st, 'movementSteps', 1);
      __incStat(st, 'tilesRevealed', Math.max(0, afterRevealed-beforeRevealed));
    }
    return result;
  };

  const __statsBaseOpenTreasure=openTreasure;

  openTreasure=function(st, areaDef, tile) {
    const unresolved=!!(tile&&!tile.resolved);
    const result=__statsBaseOpenTreasure(st, areaDef, tile);
    if(unresolved&&tile&&tile.resolved)__incStat(st, 'treasuresOpened', 1);
    return result;
  };

  const __statsBaseLevelUp=levelUp;

  levelUp=function(st, rawDraft) {
    const beforeLevel=st&&st.player?totalLevel(st.player):0;
    const beforeXp=st&&st.player?Number(st.player.xp||0):0;
    const result=__statsBaseLevelUp(st, rawDraft);
    const afterLevel=st&&st.player?totalLevel(st.player):beforeLevel;
    const afterXp=st&&st.player?Number(st.player.xp||0):beforeXp;
    if(afterLevel>beforeLevel) {
      __incStat(st, 'levelUps', afterLevel-beforeLevel);
      __incStat(st, 'xpSpentOnLevelUps', Math.max(0, beforeXp-afterXp));
      __maxStat(st, 'highestLevel', afterLevel);
    }
    return result;
  };

  EnhanceLevelUpFeatTooltips=function() {
    const sectionsToBind=[document.getElementById('levelup_skill_feat_section'), document.getElementById('levelup_general_feat_section'), document.getElementById('character_skill_feat_section'), document.getElementById('character_general_feat_section')].filter(Boolean);
    sectionsToBind.forEach(function(section) {
      section.querySelectorAll('[data-feat-open]').forEach(function(btn) {
        if(btn.dataset.sharedFeatBound==='1')return;
        btn.dataset.sharedFeatBound='1';
        btn.addEventListener('click', function() {
          const featId=btn.getAttribute('data-feat-open')||'';
          const context=btn.getAttribute('data-feat-context')||'character';
          openFeatDialog(state, {
            featId:featId, context:context
          });
        });
      });
    });
    const needsAlert=!!(state&&state.player&&(state.combat||canLevelUp(state.player)));
    const alertLabel=state&&state.combat?'Show menu. Combat is active.':'Show menu. Level up is ready.';
    document.querySelectorAll('[data-ui-action="toggle-mobile-actions"]').forEach(function(btn) {
      btn.classList.toggle('mobileMenuAlert', needsAlert);
      let badge=btn.querySelector('.mobileMenuAlertBadge');
      if(needsAlert) {
        if(!badge) {
          badge=document.createElement('span');
          badge.className='mobileMenuAlertBadge';
          badge.textContent='!';
          btn.appendChild(badge);
        }
        btn.setAttribute('aria-label', alertLabel);
      } else {
        if(badge)badge.remove();
        btn.setAttribute('aria-label', state&&state.ui&&state.ui.mobileActionsVisible?'Hide menu':'Show menu');
      }
    });
  };

  __ensureStatisticsState(state);

  render();

})();
