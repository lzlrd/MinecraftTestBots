# MinecraftTestBots

Scripted clients for testing plugins and datapacks on a local Paper or Leaf 26.3 server: a Java client that tests drive line by line, and Bedrock players that join through Geyser. Tests set things up and read results over RCON, then print `PASS` or `FAIL` for each check.

| Path | What it is |
| --- | --- |
| `java-client/` | Java Edition 26.3 client on MCProtocolLib. Takes `useon X Y Z FACE`, `dig X Y Z`, `attack ID`, `interact ID`, `slot N`, `move X Y Z`, `entities TYPE`, `vehicle` and `quit` on stdin, and prints `LOGIN`, `TELEPORT`, `DIED`, `RESPAWNED` and `DISCONNECTED` events |
| `lib/java.js` | Starts the Java client and waits for its events |
| `lib/bedrock.js` | Bedrock players through Geyser with bedrock-protocol |
| `lib/common.js` | RCON and the `PASS`/`FAIL` bookkeeping |
| `lib/config.js` | Server address, ports and RCON password |
| `tests/java/` | Furniture, Looting, Player Drops Head, the mob head converter, Jodek's smaller packs, MoreBosses, and joining with every advancement |
| `tests/bedrock/` | Mob heads, player heads, skins and the Totem Shield as Bedrock players see them, and joining |
| `patches/` | Fixes that let jsp-raknet join Geyser |

## Set up

1. Run a Paper or Leaf 26.3 server on a superflat world (the tests build around y = -60) with these in `server.properties`:

   ```properties
   online-mode=false
   server-port=25566
   enable-rcon=true
   rcon.port=25576
   rcon.password=testpass
   ```

2. For the Bedrock tests, add Geyser with `transport: raknet`, `auth-type: offline` and `validate-bedrock-login: false`. Use these only on a test server.
3. Build the Java client with JDK 25:

   ```sh
   cd java-client && ./gradlew installDist
   ```

4. Install the Node packages and apply the patch:

   ```sh
   npm install --ignore-scripts && npx patch-package
   ```

   `--ignore-scripts` skips raknet-native's build, which fails without its prebuilt binaries and isn't used: the bots run on jsp-raknet. Bun can't install this tree where `api.github.com` is blocked, because bedrock-protocol pulls one package straight from GitHub.

## Run

```sh
node tests/java/rejoin.js
node tests/bedrock/heads.js cow fish
```

| Test | Needs | Arguments |
| --- | --- | --- |
| `java/furniture.js` | CutebearFurniture | `a` on 1.6, `b` on 1.7 |
| `java/movement_control.js` | | |
| `java/looting.js` | MobHeadsLooting, Mob Heads | cow kills with and without Looting III, default 150 each |
| `java/player_drops_head.js` | Player Drops Head, MobHeadsLooting | `on` or `off`: whether PaperTweaks' player-head-drops module is on |
| `java/converter_setup.js`, `java/converter_verify.js` | Mob Heads | Run setup without MobHeadsConverter, restart with it, then verify |
| `java/jodek_packs.js` | Totem Shield, Mineable Reinforced Deepslate, Sleep Anytime You Want, Sleep, Too Expensive Removed, Name Tag, Trident All Weather Channeling, Dragon Egg Respawns, Killer Bunny Name Tag, Mob Heads Powers | |
| `java/morebosses.js` | MoreBosses, FastAsyncWorldEdit, `SpawnFrequency: 1` in MoreBosses' config | |
| `java/advancements.js`, `java/rejoin.js` | | `rejoin.js` takes a player name |
| `bedrock/heads.js` | Mob Heads, Player Drops Head, a skull mapping in `SERVER_DIR` | steps: `join`, `cow`, `fish`, `pvp`, `player-head` (default all) |
| `bedrock/skin.js` | | a skin hash |
| `bedrock/totem_shield.js` | Totem Shield, its Geyser mapping and pack | |
| `bedrock/join.js`, `bedrock/grant_advancements.js` | | |

The JavaScript RakNet client sometimes breaks during Geyser's join burst. The Bedrock helpers retry with a fresh session, so lines such as `session 2 broke: Checksum mismatch` are expected.

Settings come from the environment:

| Variable | Default |
| --- | --- |
| `MC_HOST` | `127.0.0.1` |
| `MC_PORT` | `25566` |
| `BEDROCK_PORT` | `19132` |
| `BEDROCK_VERSION` | `1.26.60` |
| `RCON_PORT` | `25576` |
| `RCON_PASSWORD` | `testpass` |
| `SERVER_DIR` | `server/` in this repo |
| `JAVA_HOME` | the `java` on your `PATH`, which must be 25 or later |

## Licence

[PolyForm Noncommercial 1.0.0](LICENSE.md).
