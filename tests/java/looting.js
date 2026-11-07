// End-to-end Looting test for MobHeadsLooting with Jodek's Mob Heads and the Tropical Fish add-on.
const { rcon, count, check, summary, close, sleep } = require('../../lib/common');
const { Client } = require('../../lib/java');

const N = Number(process.argv[2] || 150);
let c;

const sword = (looting) =>
	`minecraft:netherite_sword[minecraft:enchantments={"minecraft:sharpness":5${looting ? `,"minecraft:looting":${looting}` : ''}}]`;

// Kills one mob at 2.5 -60 30.5 and returns how many heads it dropped, or null if it survived.
async function killOne(type) {
	await rcon(`summon minecraft:${type} 2.5 -60 30.5 {NoAI:1b,Silent:1b}`);
	await sleep(250);
	const mobs = await c.entities(type);
	// The newest entity there: a mob killed a moment ago can still be in the client's list.
	const mob = mobs
		.filter((e) => Math.abs(e.x - 2.5) < 0.2 && Math.abs(e.z - 30.5) < 0.2)
		.sort((a, b) => b.id - a.id)[0];
	if (!mob) return null;
	await c.send(`attack ${mob.id}`);
	await sleep(450);
	const alive = await count(`@e[type=minecraft:${type},x=2.5,y=-60,z=30.5,distance=..1]`);
	const heads = await count('@e[type=item,x=2.5,y=-60,z=30.5,distance=..3,nbt={Item:{id:"minecraft:player_head"}}]');
	await rcon(`kill @e[type=minecraft:${type},x=2.5,y=-60,z=30.5,distance=..2]`);
	await rcon('kill @e[type=item]');
	await sleep(150);
	return alive ? null : heads;
}

async function run(type, looting, kills) {
	await rcon('clear Tester');
	await rcon(`give Tester ${sword(looting)} 1`);
	await sleep(400);
	let heads = 0;
	let counted = 0;
	let most = 0;
	for (let i = 0; i < kills; i++) {
		const dropped = await killOne(type);
		if (dropped === null) continue;
		counted++;
		heads += dropped;
		most = Math.max(most, dropped);
	}
	return { heads, counted, most, rate: counted ? heads / counted : 0 };
}

(async () => {
	await rcon('op Tester');
	c = new Client('Tester');
	await c.waitFor(/^LOGIN/);
	await sleep(2000);
	await rcon('gamemode survival Tester');
	await rcon('difficulty peaceful');
	await rcon('fill -2 -60 28 6 -55 33 minecraft:air');
	await rcon('tp Tester 0.5 -60 30.5 -90 0');
	await sleep(800);
	console.log('datapacks:', (await rcon('datapack list enabled')).replace(/\s+/g, ' ').slice(0, 300));

	// Sanity: at a 100% rate every player kill drops exactly one head, Looting or not.
	await rcon('data modify storage mob_heads:root data.cow set value 1.0');
	const sure = await run('cow', 3, 10);
	check('100% rate: every kill drops one head, never two', sure.counted === 10 && sure.heads === 10 && sure.most === 1, JSON.stringify(sure));

	await rcon('data modify storage mob_heads:root data.cow set value 0.2');
	const plain = await run('cow', 0, N);
	const looting = await run('cow', 3, N);
	const sd = (p, n) => Math.sqrt((p * (1 - p)) / n);
	console.log(`no Looting: ${plain.heads}/${plain.counted} = ${(plain.rate * 100).toFixed(1)}% (expected 20%)`);
	console.log(`Looting III: ${looting.heads}/${looting.counted} = ${(looting.rate * 100).toFixed(1)}% (expected ${((1 - 0.8 ** 4) * 100).toFixed(1)}%)`);
	check('no Looting stays near Jodek\'s 20%', Math.abs(plain.rate - 0.2) < 4 * sd(0.2, plain.counted), `${(plain.rate * 100).toFixed(1)}%`);
	check('Looting III re-rolls up to 1-(0.8^4) = 59%', Math.abs(looting.rate - 0.5904) < 4 * sd(0.5904, looting.counted), `${(looting.rate * 100).toFixed(1)}%`);
	check('Looting never drops a second head', plain.most <= 1 && looting.most <= 1);

	// Charged-creeper mode: player kills give nothing, and Looting must not change that.
	await rcon('data modify storage mob_heads:root data.cow set value 1.0');
	await rcon('scoreboard players set &killed_by_player mob_heads.config 0');
	const creeperMode = await run('cow', 3, 10);
	check('charged-creeper mode: no heads from player kills, even with Looting', creeperMode.counted === 10 && creeperMode.heads === 0, JSON.stringify(creeperMode));
	await rcon('scoreboard players set &killed_by_player mob_heads.config 1');

	// The Tropical Fish add-on drops through the same rules.
	await rcon('data modify storage mob_heads:root data.tropical_fish set value 1.0');
	const fish = await run('tropical_fish', 0, 3);
	check('tropical fish heads drop from player kills', fish.counted === 3 && fish.heads === 3, JSON.stringify(fish));

	await rcon('data modify storage mob_heads:root data.cow set value 0.02');
	await rcon('data modify storage mob_heads:root data.tropical_fish set value 0.05');
	await c.quit();
	await close();
	process.exit(summary() ? 0 : 1);
})().catch((error) => {
	console.error(error);
	process.exit(2);
});
