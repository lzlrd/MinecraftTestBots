// Checks DatapackCompat's silverfish merge: Nether silverfish a player kills drop both Incendium's gravel and the
// Mob Heads head. Needs Incendium, 5555ff lib, Mob Heads and DatapackCompat loaded above them.
const { rcon, check, summary, close, sleep } = require('../../lib/common');
const { Client } = require('../../lib/java');

(async () => {
	const tester = new Client('Tester');
	await tester.waitFor(/^LOGIN/);
	await sleep(2000);
	await rcon('data modify storage mob_heads:root data.silverfish set value 1.0');
	await rcon('execute in minecraft:the_nether run forceload add 0 0');
	await rcon('execute in minecraft:the_nether run kill @e[type=minecraft:item]');
	await sleep(1500);
	for (let i = 0; i < 8; i++) {
		await rcon('execute in minecraft:the_nether run summon minecraft:silverfish 0 120 0 {NoAI:1b,Tags:["compat"]}');
		await rcon('execute as Tester in minecraft:the_nether positioned 0 120 0 run loot spawn ~ ~ ~ kill @e[type=minecraft:silverfish,tag=compat,limit=1]');
		await rcon('execute in minecraft:the_nether run kill @e[type=minecraft:silverfish,tag=compat]');
	}
	await sleep(500);
	const items = await rcon('execute in minecraft:the_nether positioned 0 120 0 as @e[type=minecraft:item,distance=..4] run data get entity @s Item.id');
	check('Nether silverfish drop Incendium\'s gravel', items.includes('"minecraft:gravel"'), items.slice(0, 160));
	check('silverfish drop their Mob Heads head', items.includes('"minecraft:player_head"'), items.slice(0, 160));
	await rcon('execute in minecraft:the_nether run kill @e[type=minecraft:item]');
	await rcon('execute in minecraft:the_nether run forceload remove 0 0');
	await tester.quit();
	await close();
	process.exit(summary() ? 0 : 1);
})().catch((error) => {
	console.error(error);
	process.exit(2);
});
