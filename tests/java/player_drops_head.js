// End-to-end test for Jodek's Player Drops Head next to PaperTweaks' player-head-drops and MobHeadsLooting.
// Usage: node pdh_test.js on|off  (whether PaperTweaks' player-head-drops module is enabled on the server)
const { rcon, count, check, summary, close, sleep } = require('../../lib/common');
const { Client } = require('../../lib/java');

const paperTweaksOn = process.argv[2] === 'on';
const HEADS = '@e[type=item,x=10.5,y=-60,z=40.5,distance=..4,nbt={Item:{id:"minecraft:player_head"}}]';
let killer;
let victim;
let victimEntity;

const sword = (looting) =>
	`minecraft:netherite_sword[minecraft:enchantments={"minecraft:sharpness":5${looting ? `,"minecraft:looting":${looting}` : ''}}]`;

// Waits for a new line matching pattern after index from in the victim's events.
async function newEvent(pattern, from, timeout = 3000) {
	const end = Date.now() + timeout;
	while (Date.now() < end) {
		if (victim.events.slice(from).some((line) => pattern.test(line))) return true;
		await sleep(50);
	}
	return false;
}

async function arena() {
	await rcon('kill @e[type=item]');
	await rcon('tp Victim 10.5 -60 40.5 90 0');
	await rcon('tp Tester 8.5 -60 40.5 -90 0');
	await rcon('effect clear Victim');
	await sleep(500);
}

// After a death: wait for the respawn, then out the 3 s of spawn protection.
async function afterDeath(from) {
	await newEvent(/^RESPAWNED/, from);
	await sleep(3500);
}

// Kills the victim with a real attack packet from the killer and returns the player heads dropped.
async function pvpKill() {
	await arena();
	await rcon('damage Victim 19 minecraft:generic');
	// Wait out the hurt cooldown, or the sword hit counts as less than the 19 just taken and is ignored.
	await sleep(700);
	const from = victim.events.length;
	await killer.send(`attack ${victimEntity}`);
	const died = await newEvent(/^DIED/, from);
	await sleep(400);
	const onGround = await count(HEADS);
	const item = onGround ? await rcon(`data get entity ${HEADS.replace(']', ',limit=1]')} Item`) : '';
	// The killer stands 2 blocks away and can pick a head up before it is counted.
	const picked = Number(((await rcon('clear Tester minecraft:player_head 0')).match(/Found (\d+)/) || [0, 0])[1]);
	await rcon('clear Tester minecraft:player_head');
	await rcon('kill @e[type=item]');
	if (died) await afterDeath(from);
	return { died, heads: onGround + picked, picked, item };
}

// Kills the victim with no player involved.
async function plainDeath() {
	await arena();
	const from = victim.events.length;
	await rcon('damage Victim 100 minecraft:generic');
	const died = await newEvent(/^DIED/, from);
	await sleep(400);
	const heads = await count(HEADS);
	await rcon('kill @e[type=item]');
	if (died) await afterDeath(from);
	return { died, heads };
}

(async () => {
	await rcon('op Tester');
	killer = new Client('Tester');
	await killer.waitFor(/^LOGIN/);
	victim = new Client('Victim');
	await victim.waitFor(/^LOGIN/);
	await sleep(4000);
	await rcon('gamemode survival Tester');
	await rcon('gamemode survival Victim');
	await rcon('clear Victim');
	await rcon('difficulty peaceful');
	await rcon('fill 5 -60 36 15 -55 45 minecraft:air');
	await arena();
	await sleep(1000);
	const seen = await killer.entities('player');
	victimEntity = seen.length === 1 ? seen[0].id : null;
	check('killer sees the victim', victimEntity !== null, JSON.stringify(seen));
	await rcon('clear Tester');
	await rcon(`give Tester ${sword(0)} 1`);
	console.log('datapacks:', (await rcon('datapack list enabled')).replace(/\s+/g, ' '));

	const plain = [];
	for (let i = 0; i < 3; i++) plain.push(await pvpKill());
	const expected = paperTweaksOn ? 2 : 1;
	check(`PaperTweaks module ${paperTweaksOn ? 'on' : 'off'}: each PvP kill drops ${expected} head(s)`,
		plain.every((r) => r.died && r.heads === expected), plain.map((r) => `${r.died ? "died" : "alive"}:${r.heads}(picked ${r.picked})`).join(" "));

	if (!paperTweaksOn) {
		const named = plain.find((r) => r.item);
		check('the head is the victim\'s, named after them', named && /Victim/.test(named.item), named ? named.item.slice(0, 300) : 'no head on the ground to inspect');

		const fall = await plainDeath();
		check('a death with no player killer drops no head (default setting)', fall.died && fall.heads === 0, JSON.stringify(fall));

		await rcon('clear Tester');
		await rcon(`give Tester ${sword(3)} 1`);
		await sleep(400);
		const looting = [];
		for (let i = 0; i < 5; i++) looting.push(await pvpKill());
		check('Looting III PvP kills still drop exactly one head each', looting.every((r) => r.died && r.heads === 1),
			looting.map((r) => `${r.died ? 'died' : 'alive'}:${r.heads}`).join(' '));

		await rcon('clear Victim');
		await rcon('execute as Victim run trigger give_own_head');
		await sleep(600);
		const own = await rcon('execute if items entity Victim container.* minecraft:player_head');
		check('/trigger give_own_head gives the player their own head', /passed/.test(own), own.trim());
	}

	await killer.quit();
	await victim.quit();
	await close();
	process.exit(summary() ? 0 : 1);
})().catch((error) => {
	console.error(error);
	process.exit(2);
});
