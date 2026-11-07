// Checks MoreBosses on a 26.3 test server with FastAsyncWorldEdit: every boss spawns from the console and survives a
// fight without errors, and structures are built in new chunks but never in chunks that already existed. Set
// SpawnFrequency: 1 in the test server's plugins/MoreBosses/config.yml first, so about one new chunk in a hundred
// gets a structure.
const fs = require('fs');
const path = require('path');
const config = require('../../lib/config');
const { rcon, count, check, summary, close, sleep } = require('../../lib/common');
const { Client } = require('../../lib/java');

const LOG = path.join(config.serverDir, 'logs', 'latest.log');
const BOSSES = [
	['oswaldo', 'zombie', 'Oswaldo'],
	['bigboy', 'giant', 'Big Boy'],
	['timmothy', 'skeleton', 'Timmothy'],
	['bartholomew', 'wither_skeleton', 'Bartholomew'],
	['piggy', 'zombified_piglin', 'PiGgY'],
	['gort', 'vindicator', 'Gort The Serf'],
	['drstrange', 'enderman', 'Dr. Strange'],
];
const logLength = () => fs.statSync(LOG).size;
const logSince = (start) => fs.readFileSync(LOG, 'utf8').slice(start);
const pluginErrors = (text) => text.split('\n').filter((line) => /net\.ddns\.vcccd|MoreBosses.*(Exception|Error)/.test(line));

let c;
// Bosses kill the player or throw it high enough to be kicked for flying, so each fight starts with a fresh,
// well-protected player.
async function freshPlayer() {
	if (c) await c.quit();
	c = new Client('Tester');
	await c.waitFor(/^LOGIN/);
	await sleep(2500);
	await rcon('gamemode survival Tester');
	await rcon('clear Tester');
	await rcon('effect give Tester minecraft:resistance infinite 4 true');
	await rcon('effect give Tester minecraft:regeneration infinite 4 true');
	await rcon('give Tester minecraft:netherite_sword[minecraft:enchantments={"minecraft:sharpness":5}]');
}

(async () => {
	await rcon('op Tester');
	await rcon('difficulty normal');
	await freshPlayer();

	const start = logLength();
	for (const [boss, type, name] of BOSSES) {
		await freshPlayer();
		await rcon(`kill @e[type=${type}]`);
		await rcon('fill 70 -60 70 90 -50 90 minecraft:air');
		await rcon('tp Tester 76.5 -60 80.5 -90 0');
		await sleep(500);
		const reply = await rcon(`spawnboss ${boss} world 80.5 -60 80.5`);
		await sleep(1000);
		const named = (await rcon(`execute as @e[type=${type}] run data get entity @s CustomName`)).includes(name);
		check(`/spawnboss ${boss} spawns a ${type} named ${name}`, (await count(`@e[type=${type}]`)) >= 1 && named, reply.trim().slice(0, 80));
		// A short fight runs the boss's damage handlers and abilities.
		const target = (await c.entities(type))[0];
		for (let i = 0; target && i < 3; i++) {
			await c.send(`attack ${target.id}`);
			await sleep(700);
		}
		await sleep(3000);
		await rcon(`kill @e[type=${type}]`);
		await rcon('kill @e[type=!player]');
	}
	const fightErrors = pluginErrors(logSince(start));
	check('fighting every boss logs no plugin errors', fightErrors.length === 0, fightErrors.slice(0, 2).join(' | '));

	// Structures: about one new chunk in a hundred gets one; 512 new chunks make a miss very unlikely.
	await freshPlayer();
	// A random far-off area, so every run generates chunks that never existed.
	const x = 16 * (1000 + Math.floor(Math.random() * 50000));
	const z = 16 * (1000 + Math.floor(Math.random() * 50000));
	let before = logLength();
	await rcon(`forceload add ${x} ${z} ${x + 255} ${z + 255}`);
	await rcon(`forceload add ${x + 256} ${z} ${x + 511} ${z + 255}`);
	await sleep(15000);
	let text = logSince(before);
	const pasted = (text.match(/Building pasted\./g) || []).length;
	const spawned = (text.match(/Boss spawned at/g) || []).length;
	check('new chunks get structures with bosses', pasted >= 1 && spawned === pasted, `${pasted} pasted, ${spawned} bosses`);
	check('building structures logs no plugin errors', pluginErrors(text).length === 0, pluginErrors(text).slice(0, 2).join(' | '));
	await rcon('forceload remove all');
	await sleep(5000);

	// The same chunks loaded again are not new, so nothing may be built over them.
	before = logLength();
	await rcon(`forceload add ${x} ${z} ${x + 255} ${z + 255}`);
	await sleep(8000);
	text = logSince(before);
	check('chunks that already existed get no structures', !/Attempting to paste schematic/.test(text));
	await rcon('forceload remove all');

	await rcon('kill @e[type=!player]');
	await c.quit();
	await close();
	process.exit(summary() ? 0 : 1);
})().catch((error) => {
	console.error(error);
	process.exit(2);
});
