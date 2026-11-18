# Idle Lumberjack 3D — static teardown / benchmark report

**Target:** `by.hitbox.magicwoods` — "Idle Lumberjack 3D" (APK `app_name` and XAPK manifest still say *Idle Lumberjack 3D*; the current Play listing and the in-game `app_store_game_name_2` term say *Idle Lumberjack 2*). Publisher: Hitbox / Playphoria, originally VOODOO.
**Build analysed:** versionName **2.4.7**, versionCode **109** (`minSdk 26`, `targetSdk 36`).
**Date:** 2026-11-18. Everything below is from a real APK on disk, not from memory.

Legend for every number: **[V]** verified in an extracted file · **[I]** inferred by arithmetic from verified values · **[U]** unknown / not recovered.

---

## 0. Provenance and method (so this can be re-checked)

| Item | Value |
|---|---|
| Base APK | `idle-lumberjack-2_2.4.7.apk` — 45,710,367 B, md5 `cf7d3a23921ae353ea8d6025ffe3fab9` |
| XAPK (APKPure bundle) | `idle-lumberjack-2_2.4.7.xapk` — 69,735,531 B, contains `by.hitbox.magicwoods.apk` (base) + `config.arm64_v8a.apk` (native libs) |
| Source | APKPure mirror `d.apkpure.com/b/{APK,XAPK}/by.hitbox.magicwoods?versionCode=109` (APKPure's own CDN, no bot wall) |
| Workspace | `C:/Users/hp/AppData/Local/hermes/cache/scratch/idle-lumberjack/` |

Tools actually used, all local: `unzip`, `apktool 2.11.1` (manifest decode), `Il2CppDumper-net8 v6.7.46` (IL2CPP metadata → `dump.cs`, `stringliteral.json`, 24.8 MB), **UnityPy 1.25.4** (UnityPy parsed `data.unity3d` fine — 19,492 objects), `capstone 5.0.9` (ARM64 disassembly of individual methods), Python 3.14 for the binary parsers.

Key extracted artefacts:

```
extracted/AndroidManifest.xml                      (apktool_out/AndroidManifest.xml, readable)
extracted/assets/bin/Data/Managed/Metadata/global-metadata.dat   11,304,220 B  (metadata v31)
extracted/lib/arm64-v8a/libil2cpp.so              58,489,616 B
extracted/assets/bin/Data/data.unity3d            29,312,360 B  → resources.assets / level1 / sharedassets*
il2cpp_out/dump.cs                                705,671 lines (all types, fields+offsets, RVAs)
unity_out/raw/resources.assets_<path_id>.bin      raw MonoBehaviour bytes per object
tables/axe_upgrades.csv  tables/sawmill_upgrades.csv  tables/trees.csv  tables/loc_terms.tsv
```

**Honest limitation up front:** the bundle's serialized files have **type trees stripped** (UnityPy could only read the generic `m_Name`). I therefore deserialised the ScriptableObjects **by hand** from raw bytes, using field order + class offsets out of `dump.cs`. Each table parse consumed *exactly* 100 % of its object's byte payload (e.g. axe: `4 + 1761×24 = 42268` = payload size, remainder 0), and the resulting values are internally consistent (levels 1…1761, monotonic, clean powers), so the numbers are trustworthy — but the column→field-name mapping is a reconstruction, and I flag where that matters.

---

## 1. Engine / stack

| Question | Answer | Evidence |
|---|---|---|
| Engine | **Unity 2022.3.62f3, IL2CPP** scripting backend, ARM64 only | serialized-file header `2022.3.62f3` inside `data.unity3d`; `lib/arm64-v8a/libil2cpp.so`; `boot.config` |
| Managed code | 1,726 types in `Assembly-CSharp` + `MagicWoods.StateMachine` (12) — **627 game types** under `MagicWoodsGame.*` (522 classes, 90 interfaces, 10 enums, 5 structs) | `il2cpp_out/dump.cs` **[V]** |
| Metadata | IL2CPP metadata **version 31**, `stringliteral.json` = 14,764 string literals **[V]** | Il2CppDumper |
| Notable packages | Odin Inspector (`Sirenix.*`), I2 Localization (62 UI terms × 4 locales), DOTween, Cinemachine, Malbers Animations (animal/pet controller), CsvHelper, Newtonsoft.Json, PlayFab, Unity IAP 5.2.1, Unity Notifications, GameAnalytics, Unity Remote Config | `ScriptingAssemblies.json`, `MonoScript` table **[V]** |
| Sizing | base APK 43.6 MiB; total install 66.5 MiB; code (`classes.dex` 2.7 MB + `libil2cpp.so` 55.8 MB) is ~85 % of it; art is only 29 MB of `data.unity3d` | unzip sizes **[V]** |
| Orientation | portrait, single `UnityPlayerActivity`, `hardwareAccelerated=false`, adaptive-performance enabled | `AndroidManifest.xml` **[V]** |
| Permissions | INTERNET, VIBRATE, ACCESS_NETWORK_STATE, WAKE_LOCK, POST_NOTIFICATIONS, RECEIVE_BOOT_COMPLETED, BILLING | `AndroidManifest.xml` **[V]** |
| Monetised? | **Scaffolding yes, live config no.** Full ad stack in C# (`InterstitialAdsHandler`, `RewardedAdsHandler`, `BannerAdsHandler`, `ForceInterstitialAdsHandler`, `MaxAdsController`, `CrossPromo`), IAP with 5 products, weekly subscription — **but** `AdsSettings.showAds = 0`, `adTags` list empty (0 interstitial triggers), and **no third-party ad SDK is bundled** (0 hits for applovin/maxadsdk/unityads/vungle/admob SDK classes in `classes.dex`; only `libAndroidCpuUsage.so`, `libil2cpp.so`, `libmain.so`, `libunity.so` in `lib/`) | `resources.assets` AdsSettings (path_id 10927), `classes.dex` scan **[V]** |

Two things worth stealing from the stack alone: the ad config is **data + remote config** (`showAds`, `defaultInterstitialsInterval = 35 s`, AB cohort `AB1_ads_timing_1.6.1`), so ads can be turned off/tuned server-side without a client update; and analytics is GameAnalytics + PlayFab with a hand-rolled `AnalyticsEvent`/`EventFilter` layer (frequency filters, per-event params).

---

## 2. Core loop, step by step

The loop is a **physical fetch loop with an auto-attack**, not a tap-the-button idler. Evidence: `PlayerMeleeWeapon`, `Player.States.Attack.*`, `FuryAttack`, `MovementDirectionTracker`, `CollectablesCollector`, `TreeInventoryData`, `ShopBuilding`, `GrindstoneBuilding`, `SawmillBuilding`.

1. **Move** — virtual joystick, "DRAG FINGER TO MOVE" (`I2Languages joystick_tutorial`) **[V]**. Player runs at `minRunSpeed`→`maxRunSpeed` with `timeOfAccelerationToMaxSpeed` (`PlayerSettings` fields exist; **numeric values [U]**, see §3.5).
2. **Chop** — walk into a tree; the axe auto-swings (`PlayerMeleeWeapon`, `IdleAttackState`, `AttackTriggerBehaviour`). Damage per hit = `AxeUpgradeSetting.damage`; tree dies when cumulative damage ≥ `TreeSetting.lives`. **Tree 1 = 5 HP, axe level 1 = 1 damage → 5 hits [V/I]**.
3. **Collect** — the felled tree is added to `TreeInventoryData` as a **per-tree-type amount** (`Dictionary<int,float>` persisted in PlayerPrefs, `treesAmountPrefixedKey`), multiplied by `treesAmountMultiplierPerk` **[V]**. There is **no visible carry limit / backpack cap**: only the sawmill has a capacity (§4).
4. **Carry/sell** — walk to the shop ("MAGIC WOOD SALE" billboard, `magic_wood_sale_billboard`); logs fly in (`ShopSettings.treeFlyTime = 0.15 s`, `expectedBetweenTreesDaley = 0.05 s`) and convert over `maxBuyoutProcessTime = 1.0 s` **[V]**. Payout = `coinsIncomePerWholeTree` per unit **[V]**.
5. **Upgrade** — two buildings: **Grindstone** (axe damage) and **Sawmill** (idle income + capacity). Both open the same `UpgradeUI` pattern: `UpgradeButton` + a dialog with `Weapon Damage LVL. {0}` / `upgrade weapon: + {0} damage` / `damage: {0}` and `Idle Income LVL. {0}` / `+ {0} capacity` / `production per hour:` **[V]**.
6. **Push deeper** — walk further into the forest → next zone (`zone {0}` billboard, `ZoneEntranceTrigger`, "Do you wish to move your home here?"), where tree types are worth 5× more. A **teleport artifact** lets you move your "home" forward (`teleport_title`, `TeleportStone`) **[V]**.
7. **Automation** — this game's "automation" is not workers on the map, it is **the sawmill's passive production** (§4) plus **pets** (fox digs up hidden goods, bear tanks/harvests — `MagicWoodsGame.Pets.Fox/Bear/Ent`, `UpgradablePetsSettings` = 2 pets) **[V]**.

**Timing feel (all [V], from `Sawmill Settings` / `Shop Settings` assets):**

| Beat | Seconds |
|---|---|
| Log flight from tree to building | 0.15 |
| Gap between consecutive logs in a batch | 0.05 |
| Converting one batch to money/capacity | 1.0 |
| Interstitial pacing (default) | 35.0 (only if enabled) |

So a "chop → sell" batch is ~1.2 s of animation for the transfer. Swing cadence itself is Animator-driven → **[U]** (no scalar literal; `attackSpeedCurve` is an AnimationCurve reference).

---

## 3. Progression and balance — the actual tables

All three tables are plain ScriptableObject lists with **no code-side curve** — the designers shipped 1,761 + 1,761 + 440 literal rows. This is the single most useful finding: the curve shape is *readable*, not guessed.

### 3.1 Axe (grindstone) — 1,761 levels

`resources.assets → "Default Axe Levels Settings"` (AxeUpgradesSettings, path_id **11083**), element `{int level, double cost, double damage, bool}` stride 24, count 1761, consumed 42,268/42,268 bytes.

| Level | Cost | Damage | Cost ratio |
|---|---|---|---|
| 1 | 1 | 1 | — |
| 2 | 1 | 2 | ×1.00 |
| 3 | 3 | 3 | ×3.00 |
| 4 | 5 | 4 | ×1.67 |
| 5 | 10 | 5 | ×2.00 |
| 6 | 30 | 10 | ×3.00 |
| 9 | 125 | 25 | ×1.25 |
| 10 | 250 | 50 | ×2.00 |
| 13 | 625 | 125 | ×1.25 |
| 14 | 1,250 | 250 | ×2.00 |
| 30 | 781,250 | 156,250 | — |
| 1,761 | 1.76e308 | 3.52e307 | — |

* **Damage ×1.5 per level, exactly** (median ratio over levels 100–1760 = 1.4999999).
* **Cost ×1.5 per level on average**, but issued as a 4-step stutter **×2.0 → ×1.5 → ×1.3333 → ×1.25** (product = **×5.0 per 4 levels**).
* From level 8 the relationship is dead simple: **cost = 5 × damage** (holds to 1e308). One clean constant to reason with.
* Max level 1,761 is a real terminal value (`upgrade_button_max_lvl_msg = "Max LVL"`).

### 3.2 Sawmill (idle income + capacity) — 1,761 levels

`"Default Sawmill Upgrades Settings"` (path_id **11085**), element `{int level, int treeTypeIndex, double cost, float maxCapacity, float idleIncomePerHour, bool}` stride 28, count 1761, consumed 49,308/49,308 bytes.

| Level | Tree type | Cost | maxCapacity | idleIncomePerHour |
|---|---|---|---|---|
| 1 | 1 | 5 | 150 | 30 |
| 2 | 1 | 10 | 300 | 60 |
| 3 | 1 | 15 | 450 | 90 |
| 4 | 1 | 20 | 600 | 120 |
| 5 | 1 | 25 | 750 | 150 |
| 6 | 2 | 30 | 300 | 60 |
| 10 | 3 | 50 | 300 | 60 |
| 11 | 3 | 90 | 450 | 90 |
| 14 | 4 | 312.5 | 300 | 60 |
| 30 | 8 | 195,312.5 | — | — |

* **4 sawmill levels per tree type** (5 for type 1): 5 + 439×4 = 1,761 exactly.
* Capacity ladder **150 / 300 / 450 / 600 / 750** and production ladder **30 / 60 / 90 / 120 / 150** reset **per tree type**.
* Cost growth ×1.5/level (same ×1.5,×1.5,×1.333,×1.25 stutter), **and** a step up at every new tree type.

### 3.3 Trees — 440 types

`"Default Common Trees Settings"` (path_id **11084**), `DictionarySerialized<int,TreeSetting>` `{int treeTypeNumber, double lives, double coinsIncomePerWholeTree, Vector2 growTimeRange}`, count 440, consumed 12,336/12,336 bytes.

| Tree type | HP (`lives`) | Coins per tree |
|---|---|---|
| 1 | 5 | 1 |
| 2 | 25 | 5 |
| 3 | 125 | 25 |
| 4 | 625 | 125 |
| 5 | 3,125 | 625 |
| 10 | 9,765,625 | 1,953,125 |
| 440 | 3.52e307 | 7.04e306 |

* **HP = 5^type, coins = 5^(type−1)** — one rule for the whole game. **[V]** (exact to every row)
* `growTimeRange` is `(999999, 1e8)` on **all 440 rows** — i.e. trees do not regrow on a timer in this asset; respawn is handled by `TreesGenerationSettings` / spawners.
* 440 tree types × 4 sawmill levels each is why the sawmill table has 1,761 rows.

### 3.4 The design invariant (this is the bit to copy)

Because axe damage ×1.5/level and tree HP ×5/type, **ln(5)/ln(1.5) = 3.97 ≈ 4 axe levels per tree type** — exactly the 4 sawmill levels granted per tree type. And because `cost = 5 × damage`:

| Metric | Value | Status |
|---|---|---|
| Hits to fell tree #1 with a level-1 axe | 5 | **[I]** ceil(5/1) |
| Axe levels needed to hold "hits per tree" constant across a tree type | 3.97 | **[I]** |
| Trees of the *current* type needed to afford a one-shot axe for that type | **25** (types 2–12, flat) | **[I]** |
| Trees needed to afford a "5 hits per tree" axe | **5** (flat) | **[I]** |
| Sawmill cost expressed in current-type trees | 5,6,7,8,9 (types 1–2); ~2–5 (type 3+) | **[I]** |

In other words the economy is **self-similar**: every tree type costs the player the same number of trees of that type. There is no exponential wall and no "grind 200 trees" cliff — difficulty is flat in *relative* terms and grows only through absolute numbers (and the 1e308 float ceiling at type ~440). This is the opposite of the usual idle design (cost ratio > income ratio), and it is why the game can run 440 tiers with a 45-minute-ish session cadence.

### 3.5 Movement speed, carry, workers
* **Movement speed:** `PlayerSettings` exposes `minRunSpeed`, `maxRunSpeed`, `minAttackRunSpeed`, `attackAccelerationToMinSpeed`, `timeOfAccelerationToMaxSpeed`, plus bonus variants and `bonusTimeOfAccelerationToMaxSpeed`, and `maxTreePartsAmountForAttackSpeed = 250` **[V]**. The float payload (`0.3333, 0.3333, 1, 1, 2, 2, 0, 0.3333, …`, `8, 15, 7, 7, 10, 10, 17, 3`, `30, 10, 7.5, 0.99, 6.5`) could not be mapped field-by-field with confidence → **numeric speeds [U]**. Steal the *structure*: speed is a curve with an attack-speed penalty tied to how many tree parts are around you (250 = the cap where the penalty saturates).
* **Carry capacity:** none for the player — the tree inventory is an unbounded `Dictionary<int,float>` **[V]**; the only capacity in the game is the sawmill's (§4). This is a deliberate removal of a friction point vs. "carry 5 logs" designs.
* **Workers/helpers:** **pets**, not hired workers — `fox` (digs up hidden goods) and `bear` **[V]** from `Upgradable Pets Settings` (path_id 11074, 2 entries `Pets/fox_name`, `Pets/bear_name`). Per-pet levels live in `PetsUpgradeData : SavedPetsData<float>`; the cost table itself was not decoded → **[U]**.

### 3.6 Zones / area unlocks
* `Tree Fields Settings` (path_id **11053**): `isZoningEnabled = 1`, **`fieldsInZone = 4`**, **48 tree fields** total, field length 50–65 m (`fieldLength = 60`) **[V]**.
* → **12 zones** of 4 fields ≈ 240 m each **[I]**. Each field pins a tree preset (`GuidReference treePresetID`) — i.e. zone N contains tree types ~N·k, which is how "walk further → 5× more valuable trees" is authored.
* Zone transitions: `ZoneEntranceTrigger`, `ActivateBuildingsTrigger`, `BuildingsChunk`, dialog "Do you wish to move your home here?" **[V]**.
* 5 ambient-audio zones are authored (`Forest Ambient zone 1..5`) — visuals/audio re-theme roughly every 2–3 zones **[V]**.

---

## 4. Idle / offline system

**Yes, it is a real idle system, and it is capacity-capped rather than time-capped.**

| Element | Value | Evidence |
|---|---|---|
| Production rate | `SawmillUpgradeSetting.idleIncomePerHour` (30…150, resets per tree type) | field @ 0x24; **disassembly of `SawmillUpgradeData.get_CapacityPerHours()` shows it returns `[x0+0x24]` of `CurrentUpgradeSetting`** — i.e. "capacity per hour" *is* the production rate **[V]** |
| Storage | `maxCapacity` (150…750) | `get_MaxCapacity()` returns `[x0+0x20]` **[V]** |
| Offline cap | **5.0 hours at every level** (150/30 = 300/60 = 450/90 = 600/120 = 750/150) | **[I]** — capacity ÷ rate |
| Offline clock | `Utilities.OfflineTimeTracker`: `ApplicationOfflineTimeHours/Seconds`, `OnApplicationPause`, persisted close time | `dump.cs` TypeDefIndex 4202 **[V]** |
| Persistence | `SawmillUpgradeData.SavedCapacity`, `SaveCapacity()/RestoreCapacity()`, `savedCapacityPrefsKey` (PlayerPrefs) | `dump.cs` **[V]** |
| Accrual cadence | `CapacityPerSecond = rate/3600`, recomputed in `UpdateCapacity(deltaTime)`; no periodic "collect" timer | `SawmillUpgradeUI.UpdateCapacity` **[V]** |
| UI surfacing | Sawmill dialog = **"Idle Income LVL. {n}"**, "+ {x} capacity", "production per hour: {x}", with a capacity label row (`capacityLabels`, `capacityLabelFormat`) | `I2Languages` + `SawmillUpgradeUI` fields **[V]** |
| Welcome-back popup | **not found** — no "while you were away" string in 14,764 literals or 62 loc terms. Offline value is simply found in the sawmill's filled bar when you return | **[V] absence** |

Design read: the offline cap is expressed as **storage**, not as a time multiplier, so the UI can show a filling bar ("+150 capacity, 150/h → full in 5 h") instead of a modal that pays out. It also means offline never pays out *money* directly — you still walk to the sawmill/shop to convert. **Cheap, elegant, and no dark pattern.**

---

## 5. First-session onboarding

Evidence: `I2Languages` terms, `TutorialUI`, `JoystickTutorialUI`, `PreloaderSceneController`, PlayerPrefs flags `UserHasSeenTutorial` and `PlayerPassedJoySttickTutorial` **[V]**.

Sequence as authored (order derived from `tutorial_row_1..3` + state names):

1. **Load → single-objective banner**: one full-width banner pinned bottom-centre reading **"CHOP WOOD!"** (screenshot 0 shows exactly this). One verb, one target, zero text box.
2. **Joystick hint**: "DRAG FINGER TO MOVE" appears over the joystick zone while `PlayerPassedJoySttickTutorial == false`; it dismisses on first drag.
3. **First tree is adjacent** — no navigation needed; the player swings automatically on contact, so the first success is ~2 s in.
4. **Banner flips to "SELL WOOD"** once the inventory holds a tree; the shop has a "MAGIC WOOD SALE" billboard so the destination reads at a glance.
5. **Banner flips to "POWER UP!"** after the first sale; the grindstone opens `Weapon Damage LVL. 1` + "upgrade weapon: + {0} damage" and the first upgrade is affordable by construction (level 2 costs **1** coin = exactly one tree) **[V]**.
6. **Escape hatch**: a persistent "**LET ME PLAY!!**" button closes the tutorial — an unusual, deliberately blunt opt-out that probably protects D1 by not trapping returning players.

UI affordances used: a **3-row objective stack** (not arrows, not ghost hands) + world-space billboards. No hand-pointer sprite class exists in the build; the "juice" is the banner text swap. Arrows **[U]** (none found in classes, so probably absent).

---

## 6. Juice / feedback inventory

| Channel | What fires | Evidence |
|---|---|---|
| **Haptics** | chop = `LightImpact`, sell = `LightImpact`, collectable pickup = **`None`** (deliberately silent) — `VibroController` (path_id 10995) ints `[4, 7, 4]`, enum `Selection=0,Success=1,Warning=2,Failure=3,LightImpact=4,MediumImpact=5,HeavyImpact=6,None=7` | **[V]** |
| **Sound families** | **57 `Sound` ScriptableObjects**, incl. **17 impact sounds** — 16 weapon-specific (Axe, Axe Splitted, Sword, WarAxe, SilverAxe, Hammer, Scythe, Machete, Mace1, Mace2, Greatsword, Hook, Crucible, Berdysh, Kubikiribocho, Lostvayne) + Super Hit — plus Tree Сhop / Tree Demolition / Tree Sell / Tree Get, Bonus Collect ×5 (apple, leaf, mushroom, seed, coins), Bonus Tree Grow ×3, UI Click / UI Buy Item / UI Axe level / UI Close Tab / UI Inactive Tab, Fury Attack, Whirl Attack, Fox Hole Dig, Ent_spawn, Buildings Activate, River, Forest Ambient zone 1–5, Step zone 1/3/4 | **[V]** `resources.assets` Sound SOs; 54 AudioClips in bundle |
| **Particles** | **171 ParticleSystem + 171 ParticleSystemRenderer** in the bundle; `ParticlesContainer`, `AlphaAnimatedParticles`, `EnvironmentEffectsSystem` | **[V]** object census |
| **Camera** | Cinemachine with **67 impulse references** + `ECCameraShake`, `ECCameraShakeCaller`, `CameraShakeSimpleScript` → screen shake on hit/sell | **[V]** |
| **Number popups** | `MagicWoodsGame.Effects.PopUpSystem`, `PopupObject`, `PopupSpawner`, `FormattableTextField`, `MoneyUI`; money shown with **letter suffixes** ("186.9AB", "1.43A" in store screenshots) | **[V]** classes + screenshots |
| **Scene complexity** | 19,492 serialized objects total; in a gameplay scene: 3,896 GameObjects, 560 meshes, 204 materials, 5 canvases, 92 `Button`, 337 `Image`, 193 `TextMeshProUGUI` | **[V]** UnityPy census |
| **Per-frame budget proxy** | `PlayerSettings.maxTreePartsAmountForAttackSpeed = 250` — the game explicitly tracks up to 250 flying/lying tree parts before it stops charging attack speed | **[V]** |

Same-frame object count (draw calls) **[U]** — no build-time profiler data in the APK.

---

## 7. Copy / don't copy

### Copy (cheap, high value)
1. **Self-similar economy.** One rule (`cost = k × power`) instead of hand-tuned tables: axe cost = 5 × damage, trees = 5^t HP / 5^(t−1) coins. Result: a flat "**25 trees per upgrade**" ratio forever. Your pharmacy game can use `cost = m × throughput` and never rebalance a tier again.
2. **Two-branch upgrade UI, one component.** Grindstone (power) and Sawmill (idle) share `UpgradeUI<T>` with one big button + one "+X" line + a level title. Two buildings, one screen.
3. **Capacity-based offline**, not time-based: production/hour + storage hours (5 h) → the UI is a filling bar, no "welcome back" modal, no fake urgency.
4. **One-verb objective banner** that swaps words ("CHOP WOOD" → "SELL WOOD" → "POWER UP!"). Zero tutorial text, zero arrows, works in 3 localisations.
5. **"LET ME PLAY!!"** tutorial escape button. Cheap; removes the #1 reason returning players bounce.
6. **Sound family per weapon tier** (19 impact variants) — the "juice per upgrade" that makes a ×1.5 damage step *feel* like something.
7. **Number formatting with letter suffixes** ("186.9AB") from day one; it is load-bearing once you pass 1e6.

### Do NOT copy
1. **`showAds` remote kill-switch + 35 s interstitial floor** is fine, but the `forceInterstitialShowOnInterval` flag exists precisely to make interstitials unavoidable; don't ship that flag on.
2. **440 tree types of `5^t`** — numbers hit the IEEE-754 float ceiling (`3.5e307` at type 440, cost `1.76e308`). The table literally cannot grow past ~441; the last ~15 tiers are numerically degenerate. Use a log/exponent currency instead.
3. **Dead `growTimeRange = (999999, 1e8)` on all 440 rows** — a whole regrow system authored then neutered. Ship a real regrow curve or delete the field.
4. **Tutorial that gates the first upgrade behind an `UpgradeLevel` abstraction with `PurchaseFreeUpgrade()`** — the "FREE" rewarded-ad button sits adjacent to the paid upgrade. That adjacency (paid button + ad button, same size, same place) is the classic accidental-tap pattern; separate them.
5. **A subscription ("become a wizard", weekly, 3-day trial) that bundles no-ads + pet + daily seeds + permanent weapon** — it makes the reward loop and the paywall indistinguishable. Keep cosmetics/utility in a sub, never core income.
6. **Silent `None` haptic on pickup** while chop *and* sell both buzz `LightImpact` — the most frequent event is the only one without feedback. Invert it: pickup should be the tappiest.
7. **`AdTag`-driven interstitial slots with 0 tags wired** — dead config paths that make QA/telemetry meaningless. Either wire them or remove them.

---

## 8. What is *not* verified (be honest with the team)

| Gap | Why | Impact |
|---|---|---|
| Swing cadence (seconds per axe hit) | Animator clips + AnimationCurve, no scalar literal; clip sampling would need a full asset pipeline run | Affects "seconds per tree" feel estimate only |
| Numeric run speed values | `PlayerSettings` float block not confidently field-mapped | Low — structure is known |
| Pet upgrade costs | `UpgradablePetsSettings` holds Guids → separate pet assets | Medium — pets are the "worker" analogue |
| Zone→tree-type mapping table | Encoded in `TreesFieldView.treePresetID` Guids → 440 `CommonTreePreset` assets | Medium |
| Ad SDK actually used in production | Not bundled in this build; likely remote/publisher-side | High for monetisation benchmarking — do not claim "no ads", claim "**no ad SDK in this APK**" |
| Real draw calls / FPS | No profiler data in APK | Low |

Screenshots used for UI corroboration are Play-Store marketing stills (`screenshots/screen-0..4.jpg`, 1080×1920) — they show the real HUD vocabulary ("CHOP WOOD!", "X2 RANGE 0:53", "186.9AB", `use` buttons, `EXPAND`) but are staged, not device captures.

---

## 9. One-paragraph verdict

Idle Lumberjack 3D is a **Unity 2022 IL2CPP, portrait, single-scene, ~44 MB hyper-casual idler whose entire balance lives in three flat ScriptableObject tables** — 1,761 axe levels (damage ×1.5, cost ×1.5), 1,761 sawmill levels (capacity 150–750, production 30–150/h, 4 levels per tree type), 440 tree types (HP 5^t, coins 5^(t−1)) — which together produce a **self-similar "25 trees per upgrade" economy with a 5-hour capacity-capped offline loop and a three-word tutorial**. Its monetisation is scaffolded (interstitial/rewarded/banner handlers, 5 IAP products, weekly subscription) but **switched off in this build's config and missing any third-party ad SDK**. The transferable lessons for a pharmacy idler are the cost-parity invariant, the capacity-cap offline design, the one-verb objective banner, and the per-tier impact-sound family.

---

## 10. What Pharm Chris took from this teardown

Applied in this build:

| Finding | Change in Pharm Chris |
|---|---|
| Cost grows at the same ratio as power (axe cost = 5 × damage, ×1.5/level) | Every upgrade track now grows **×1.5 per level** (was ×2.2–2.4 against linear effects), so time-to-afford stays flat instead of walling up. |
| 1,761 levels per track — money always has a sink | Upgrade caps raised to 20–30 levels each; a day-90 run now finishes with ~₦0.4M in the till instead of ₦6M with nothing left to buy. |
| Capacity-capped offline (production/hour × storage hours), not a time multiplier | Offline cap is now staff-derived: **4 h base + 2 h per staffed role, max 8 h**, paid from a real headless simulation. |
| One-verb objective banner that swaps words (CHOP → SELL → POWER UP) | Objective banner tightened to `COLLECT CASH / SERVE THE QUEUE / STOCK THE SHELVES / BUY STOCK / UPGRADE / LICENCE DESK / PUSH SALES`. |
| "LET ME PLAY!!" tutorial escape hatch | `LET ME PLAY` button inline on the objective banner; skipping is telemetered. |
| Money with letter suffixes (186.9AB) once past 1e6 | HUD chips show `₦4.2m` / `₦950k` (full numbers in the drawer and on hover). |
| 440 tiers of 5^t hit the float ceiling; dead `growTimeRange` field on every row | Deliberately **not** copied: our tiers are bounded (5 licences, 20–30 upgrade levels, 2 expansions) and every config field is read by code. |
| `forceInterstitialShowOnInterval` + paid/FREE buttons adjacent | Deliberately **not** copied: no ads, no monetisation surfaces in this build at all. |

The teardown's own "do not copy" list (§7) was followed: no forced interstitials, no
float-ceiling economy, no dead config, no ad-adjacent purchase buttons, no subscription
bundling the reward loop.
