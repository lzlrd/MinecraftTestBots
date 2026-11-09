// Joins through Geyser as a Bedrock player and checks what Geyser sends for Jodek's mob heads, tropical fish heads and
// Player Drops Head heads. GeyserPlayerHeads registers one custom skull per mob from GeyserPacks' skull aliases: a head's
// item icon is its mob's skull, and a placed head keeps its own skin. Each step runs in a fresh session and is retried
// if the session breaks.
// Usage: node tests/bedrock/heads.js [join] [cow] [fish] [placed] [pvp] [player-head]  (no steps runs them all)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const config = require('../../lib/config');
const { rcon, check, summary, close, sleep } = require('../../lib/common');
const { session, stand, end, wireUuid } = require('../../lib/bedrock');
const { Client } = require('../../lib/java');

const SKULL = 'geyser_custom:player_skull_';
const GEYSER = path.join(config.serverDir, 'plugins', 'Geyser-Spigot');
// "skin target" lines alias a skin to a registered one; a line with one skin registers it.
const registered = new Set();
const targetOf = new Map();
for (const line of fs.readFileSync(path.join(GEYSER, 'extensions', 'geyserplayerheads', 'skull-aliases.txt'), 'utf8').split('\n')) {
	if (!line.trim() || line.startsWith('#')) continue;
	const [skin, target] = line.trim().split(/\s+/);
	if (target) targetOf.set(skin, target);
	registered.add(target || skin);
}
// The skull Bedrock should show for a head with this skin.
const skullOf = (skin) => SKULL + (targetOf.get(skin) || skin);
const steps = process.argv.slice(2);
const want = (step) => steps.length === 0 || steps.includes(step);

// The skin hash of the head in the Bedrock player's Java inventory. Asks for the profile alone, as the server shortens
// long command output.
async function javaSkin() {
	const profile = await rcon('data get entity BedrockBot Inventory[{id:"minecraft:player_head"}].components."minecraft:profile"');
	const value = (profile.match(/value: ?"([A-Za-z0-9+/=]+)"/) || [])[1];
	try {
		const url = JSON.parse(Buffer.from(value, 'base64').toString('utf8')).textures.SKIN.url;
		return url.slice(url.lastIndexOf('/') + 1);
	} catch {
		return null;
	}
}

// Rolls a loot table as if the Bedrock player made the kill and returns what Bedrock received and the head's skin.
async function headStep(label, summon, selector) {
	for (let attempt = 1; attempt <= 8; attempt++) {
		const s = await session();
		await rcon('clear BedrockBot');
		await sleep(500);
		await rcon(summon);
		await sleep(300);
		s.received.length = 0;
		console.log(`> ${label}:`, (await rcon(`execute as BedrockBot run loot give BedrockBot kill ${selector}`)).trim());
		await sleep(2000);
		const broken = s.broken;
		const got = [...s.received];
		const skin = await javaSkin();
		await end(s);
		if (!broken) return { got, skin };
	}
	return { got: [], skin: null };
}

// Places a head with this skin three blocks from the Bedrock player and returns how many skull entities Geyser spawned
// for it, or -1 without a stable session.
async function placeStep(label, skin) {
	const textures = Buffer.from(JSON.stringify({ textures: { SKIN: { url: `http://textures.minecraft.net/texture/${skin}` } } })).toString('base64');
	for (let attempt = 1; attempt <= 6; attempt++) {
		const s = await session();
		stand(s);
		await sleep(2500);
		const pos = (await rcon('data get entity BedrockBot Pos')).match(/\[(-?[\d.]+)d, (-?[\d.]+)d, (-?[\d.]+)d\]/);
		const [x, y, z] = [Math.floor(Number(pos[1])) + 3, Math.floor(Number(pos[2])), Math.floor(Number(pos[3]))];
		s.players.length = 0;
		console.log(`> place ${label}:`, (await rcon(`setblock ${x} ${y} ${z} minecraft:player_head{profile:{properties:[{name:"textures",value:"${textures}"}]}}`)).trim());
		await sleep(3000);
		const broken = s.broken;
		const entities = s.players.length;
		await rcon(`setblock ${x} ${y} ${z} minecraft:air`);
		await end(s);
		if (!broken) return entities;
	}
	return -1;
}

(async () => {
	await rcon('fill 15 -60 15 25 -55 25 minecraft:air');

	if (want('join')) {
		const first = await session();
		console.log('resource packs offered:', JSON.stringify(first.packs));
		const manifest = JSON.parse(execFileSync('unzip', ['-p', path.join(GEYSER, 'cache', 'player_skulls.mcpack'), 'skull_resource_pack/manifest.json']));
		const skullPack = first.packs.find((p) => p.uuid === wireUuid(manifest.header.uuid));
		check('Geyser offers the skull resource pack', !!skullPack, skullPack ? `${(skullPack.size / 1e3).toFixed(0)} KB` : '');
		const blocks = new Set(first.customBlocks);
		const missing = [...registered].filter((hash) => !blocks.has(SKULL + hash));
		check('start_game carries a custom skull block for every registered skin', missing.length === 0, `${registered.size - missing.length} of ${registered.size}`);
		check('start_game carries no custom skull block for an aliased skin', ![...targetOf.keys()].some((hash) => blocks.has(SKULL + hash)));
		// Set while the player is online, so the server saves it for the later sessions.
		await rcon('gamemode survival BedrockBot');
		await rcon('tp BedrockBot 20.5 -60 20.5');
		await end(first);
	}

	if (want('cow')) {
		await rcon('data modify storage mob_heads:root data.cow set value 1.0');
		for (const [label, variant] of [['temperate', 'temperate'], ['cold', 'cold']]) {
			await rcon('kill @e[type=cow]');
			const cow = await headStep(`loot ${label} cow`, `summon minecraft:cow 22.5 -60 22.5 {NoAI:1b,Silent:1b,Tags:["bt"],variant:"minecraft:${variant}"}`, '@e[type=cow,tag=bt,limit=1]');
			console.log('  Bedrock received:', JSON.stringify(cow.got));
			const cowSkull = cow.got.find((d) => d.name.startsWith(SKULL));
			check(`the ${label} cow's head has a skin from the skull aliases`, registered.has(cow.skin) || targetOf.has(cow.skin), String(cow.skin));
			check(`Bedrock shows the ${label} cow head as the cow's custom skull`, !!cowSkull && !!cow.skin && cowSkull.name === skullOf(cow.skin), cowSkull ? cowSkull.name : '');
			check(`the ${label} cow head is named "Cow Head" on Bedrock`, !!cowSkull && /Cow Head/.test(cowSkull.displayName || ''), cowSkull ? JSON.stringify(cowSkull.displayName) : '');
		}
	}

	if (want('fish')) {
		await rcon('data modify storage mob_heads:root data.tropical_fish set value 1.0');
		await rcon('kill @e[type=tropical_fish]');
		// Variant = size | pattern << 8 | base colour << 16 | pattern colour << 24: an orange kob with white stripes.
		const fish = await headStep('loot fish', 'summon minecraft:tropical_fish 22.5 -60 22.5 {NoAI:1b,Silent:1b,Tags:["bt"],Variant:65536}', '@e[type=tropical_fish,tag=bt,limit=1]');
		console.log('  Bedrock received:', JSON.stringify(fish.got));
		const fishSkull = fish.got.find((d) => d.name.startsWith(SKULL));
		check('the tropical fish head is aliased to the tropical fish skull', targetOf.has(fish.skin), String(fish.skin));
		check('Bedrock shows the tropical fish head as the tropical fish skull', !!fishSkull && !!fish.skin && fishSkull.name === skullOf(fish.skin), fishSkull ? fishSkull.name : '');
		check('the tropical fish head keeps its own name on Bedrock', !!fishSkull && /Kob Orange White Head/.test(fishSkull.displayName || ''), fishSkull ? JSON.stringify(fishSkull.displayName) : '');
	}

	if (want('placed')) {
		const alias = targetOf.keys().next().value;
		const aliased = await placeStep('an aliased head', alias);
		check('a placed aliased head shows its own skin (a skull entity)', aliased >= 1, `${aliased} skull entities`);
		const own = await placeStep('a registered head', targetOf.get(alias));
		check('a placed registered head shows its custom skull block (no skull entity)', own === 0, `${own} skull entities`);
	}

	if (want('pvp') || want('player-head')) {
		// Player Drops Head: a Java player kills the Bedrock player.
		const tester = new Client('Tester');
		await tester.waitFor(/^LOGIN/);
		await sleep(3000);
		await rcon('op Tester');
		await rcon('gamemode survival Tester');
		await rcon('clear Tester');
		await rcon('give Tester minecraft:netherite_sword[minecraft:enchantments={"minecraft:sharpness":5}] 1');
		if (want('pvp')) {
			let pvp = null;
			for (let attempt = 1; attempt <= 4 && !pvp; attempt++) {
				const s = await session();
				await rcon('kill @e[type=item]');
				await rcon('clear BedrockBot');
				await rcon('tp BedrockBot 20.5 -60 20.5');
				await rcon('tp Tester 18.5 -60 20.5 -90 0');
				await sleep(1500);
				const target = (await tester.entities('player'))[0];
				// Leave the Bedrock player on one health, so the Java player's hit is the kill.
				const health = Number(((await rcon('data get entity BedrockBot Health')).match(/([\d.]+)f/) || [0, '20'])[1]);
				if (health > 1) await rcon(`damage BedrockBot ${health - 1} minecraft:generic`);
				await sleep(700);
				if (target) await tester.send(`attack ${target.id}`);
				await sleep(1200);
				const onGround = Number(((await rcon('execute if entity @e[type=item,x=20.5,y=-60,z=20.5,distance=..4,nbt={Item:{id:"minecraft:player_head"}}]')).match(/Count: (\d+)/) || [0, '0'])[1]);
				const picked = Number(((await rcon('clear Tester minecraft:player_head 0')).match(/Found (\d+)/) || [0, '0'])[1]);
				const item = onGround ? await rcon('data get entity @e[type=item,x=20.5,y=-60,z=20.5,distance=..4,nbt={Item:{id:"minecraft:player_head"}},limit=1] Item.components') : '';
				if (onGround + picked > 0 || !s.broken) pvp = { heads: onGround + picked, item };
				await rcon('kill @e[type=item]');
				await rcon('clear Tester minecraft:player_head');
				await end(s);
			}
			check('a Java player killing the Bedrock player drops exactly one head', !!pvp && pvp.heads === 1, pvp ? `${pvp.heads} head(s): ${pvp.item.slice(0, 120)}` : 'no stable session');
		}
		if (want('player-head')) {
			// Offline-mode profiles carry no skin, so this only checks the head arrives as a player skull.
			const ph = (await headStep('loot player head', 'say ready', 'Tester')).got;
			console.log('  Bedrock received:', JSON.stringify(ph));
			const playerHead = ph.find((d) => /skull|player_head/.test(d.name));
			check('a player head reaches Bedrock as a player skull', !!playerHead, playerHead ? `${playerHead.name} metadata ${playerHead.metadata} ${JSON.stringify(playerHead.displayName)}` : '');
		}
		await tester.quit();
	}

	await close();
	process.exit(summary() ? 0 : 1);
})().catch((error) => {
	console.error(error);
	process.exit(2);
});
