// Joins through Geyser as a Bedrock player and checks what Geyser sends for Jodek's mob heads, tropical fish heads and
// Player Drops Head heads. Each step runs in a fresh session and is retried if the session breaks.
// Usage: node tests/bedrock/heads.js [join] [cow] [fish] [pvp] [player-head]  (no steps runs them all)
const fs = require('fs');
const path = require('path');
const config = require('../../lib/config');
const { rcon, check, summary, close, sleep } = require('../../lib/common');
const { session, end } = require('../../lib/bedrock');
const { Client } = require('../../lib/java');

const SKULL = 'geyser_custom:player_skull_';
const MAPPING = path.join(config.serverDir, 'plugins', 'Geyser-Spigot', 'custom_mappings', 'mob_heads_skulls.json');
const mappedHashes = new Set(JSON.parse(fs.readFileSync(MAPPING, 'utf8')).skulls.skin_hash);
const steps = process.argv.slice(2);
const want = (step) => steps.length === 0 || steps.includes(step);

// Rolls a loot table as if the Bedrock player made the kill and returns what Bedrock received.
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
		await end(s);
		if (!broken) return got;
	}
	return [];
}

(async () => {
	await rcon('fill 15 -60 15 25 -55 25 minecraft:air');

	if (want('join')) {
		const first = await session();
		console.log('resource packs offered:', JSON.stringify(first.packs));
		const skullPack = first.packs.find((p) => p.size > 5_000_000);
		check('Geyser offers the skull resource pack', !!skullPack, skullPack ? `${(skullPack.size / 1e6).toFixed(1)} MB` : '');
		const blocks = new Set(first.customBlocks);
		const missing = [...mappedHashes].filter((hash) => !blocks.has(SKULL + hash));
		check('start_game carries a custom skull block for every mapped skin', missing.length === 0, `${mappedHashes.size - missing.length} of ${mappedHashes.size}`);
		// Set while the player is online, so the server saves it for the later sessions.
		await rcon('gamemode survival BedrockBot');
		await rcon('tp BedrockBot 20.5 -60 20.5');
		await end(first);
	}

	if (want('cow')) {
		await rcon('data modify storage mob_heads:root data.cow set value 1.0');
		await rcon('kill @e[type=cow]');
		const cow = await headStep('loot cow', 'summon minecraft:cow 22.5 -60 22.5 {NoAI:1b,Silent:1b,Tags:["bt"]}', '@e[type=cow,tag=bt,limit=1]');
		console.log('  Bedrock received:', JSON.stringify(cow));
		const cowSkull = cow.find((d) => d.name.startsWith(SKULL));
		check('Bedrock gets the cow head as its custom skull block', !!cowSkull && mappedHashes.has(cowSkull.name.slice(SKULL.length)), cowSkull ? cowSkull.name : '');
		check('the cow head is named "Cow Head" on Bedrock', !!cowSkull && /Cow Head/.test(cowSkull.displayName || ''), cowSkull ? JSON.stringify(cowSkull.displayName) : '');
	}

	if (want('fish')) {
		await rcon('data modify storage mob_heads:root data.tropical_fish set value 1.0');
		await rcon('kill @e[type=tropical_fish]');
		const fish = await headStep('loot fish', 'summon minecraft:tropical_fish 22.5 -60 22.5 {NoAI:1b,Silent:1b,Tags:["bt"],Variant:65536}', '@e[type=tropical_fish,tag=bt,limit=1]');
		console.log('  Bedrock received:', JSON.stringify(fish));
		const fishSkull = fish.find((d) => d.name.startsWith(SKULL));
		check('Bedrock gets the tropical fish head as a custom skull block', !!fishSkull && mappedHashes.has(fishSkull.name.slice(SKULL.length)), fishSkull ? `${fishSkull.name} ${JSON.stringify(fishSkull.displayName)}` : '');
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
				await rcon('damage BedrockBot 19 minecraft:generic');
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
			const ph = await headStep('loot player head', 'say ready', 'Tester');
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
