// End-to-end furniture tests. Stage a runs on CutebearFurniture 1.6, stage b on 1.7.
const { rcon, isBlock, count, check, summary, close, sleep } = require('../../lib/common');
const { Client } = require('../../lib/java');

const stage = process.argv[2];
const item = (model) => `minecraft:poisonous_potato[minecraft:item_model="cutebear_furniture:${model}"]`;
const YAW = { east: -90, south: 0, west: 90, north: 180 };
const STEP = { east: [1, 0], south: [0, 1], west: [-1, 0], north: [0, -1] };

let c;

async function tp(x, z, facing) {
	await rcon(`tp Tester ${x + 0.5} -60 ${z + 0.5} ${YAW[facing]} 30`);
	await c.waitFor(new RegExp(`^TELEPORT ${x + 0.5} -60\\.0 ${z + 0.5}`), 5000).catch(() => {});
	c.events = [];
	await sleep(300);
}

// Stands two blocks behind the target, facing it, and right-clicks the ground below it.
async function place(model, x, z, facing) {
	const [dx, dz] = STEP[facing];
	await tp(x - 2 * dx, z - 2 * dz, facing);
	await rcon('clear Tester');
	await rcon(`give Tester ${item(model)} 1`);
	await sleep(400);
	await c.send(`useon ${x} -61 ${z} UP`);
	await sleep(600);
}

const display = (x, z) => `@e[type=item_display,x=${x + 0.5},y=-59.5,z=${z + 0.5},distance=..0.6]`;
const barrier = (x, z) => isBlock(x, -60, z, 'minecraft:barrier');

async function stageA() {
	await rcon('fill 0 -60 -10 40 -55 20 minecraft:air');
	await place('chair', 10, 0, 'east');
	await place('bathtub', 10, 4, 'east');
	check('1.6 placed a chair', (await count(display(10, 0))) === 1);
	check('1.6 placed a bathtub', (await count(display(10, 4))) === 1);
	check('1.6 placed no barriers', !(await barrier(10, 0)) && !(await barrier(10, 4)));
}

async function stageB() {
	await sleep(1500);
	check('upgrade: old chair got a barrier', await barrier(10, 0));
	check('upgrade: old bathtub got both barriers', (await barrier(10, 4)) && (await barrier(11, 4)));
	check('upgrade: nothing else became a barrier', !(await barrier(9, 4)) && !(await barrier(10, 5)) && !(await barrier(10, 3)));

	// A bathtub covers its own block and the next one in the direction the player faced.
	const tubs = { east: [20, -6], south: [24, -6], west: [28, -6], north: [32, -4] };
	for (const [facing, [x, z]] of Object.entries(tubs)) {
		await place('gold_bathtub', x, z, facing);
		const [dx, dz] = STEP[facing];
		check(`gold bathtub facing ${facing}: display placed`, (await count(display(x, z))) === 1);
		check(`gold bathtub facing ${facing}: barriers at ${x},${z} and ${x + dx},${z + dz}`, (await barrier(x, z)) && (await barrier(x + dx, z + dz)));
		check(`gold bathtub facing ${facing}: none behind`, !(await barrier(x - dx, z - dz)));
	}
	const model = await rcon(`data get entity @e[type=item_display,x=20.5,y=-59.5,z=-5.5,distance=..0.6,limit=1] item.components."minecraft:item_model"`);
	check('gold bathtub keeps its gold model', model.includes('cutebear_furniture:gold_bathtub'), model.trim());

	// Walking into a barrier is refused: the server snaps the player back.
	await tp(18, -6, 'east');
	await c.send('move 19.9 -60 -5.5');
	await sleep(800);
	const pos = await rcon('data get entity Tester Pos[0]');
	const x = Number((pos.match(/(-?[\d.]+)d/) || [])[1]);
	check('player cannot walk into the bathtub', x < 19.7, `x=${x}`);

	// Left-clicking the second half of a bathtub breaks the whole piece and drops it in survival.
	await rcon('clear Tester');
	await tp(18, -6, 'east');
	await c.send('dig 21 -60 -6');
	await sleep(800);
	check('dig on barrier removed the display', (await count(display(20, -6))) === 0);
	check('dig on barrier removed both barriers', !(await barrier(20, -6)) && !(await barrier(21, -6)));
	const drop = await count('@e[type=item,x=20.5,y=-60,z=-5.5,distance=..3]');
	const held = await rcon('clear Tester minecraft:poisonous_potato 0');
	check('survival break dropped the gold bathtub', drop === 1 || held.includes('Found 1'), `item entities ${drop}, inventory: ${held.trim()}`);

	// Right-clicking a toilet's barrier sits the player down.
	await place('gold_toilet', 36, 0, 'east');
	check('gold toilet has a barrier', await barrier(36, 0));
	await rcon('clear Tester');
	await c.send('useon 36 -60 0 UP');
	await sleep(600);
	const vehicle = await c.send('vehicle');
	check('right-click on a toilet barrier seats the player', vehicle !== 'VEHICLE -1', vehicle);
	await rcon('ride Tester dismount');
	await sleep(400);
	check('seat is removed after dismount', (await count('@e[type=armor_stand,x=36.5,y=-59.2,z=0.5,distance=..1]')) === 0);

	// Building against a furniture barrier still works like any block.
	await place('gold_basic_sink', 36, 4, 'east');
	await rcon('give Tester minecraft:dirt 1');
	await sleep(300);
	await c.send('useon 36 -60 4 UP');
	await sleep(600);
	check('a block can be placed on top of a sink', await isBlock(36, -59, 4, 'minecraft:dirt'));
	await rcon('setblock 36 -59 4 minecraft:air');

	// Hitting the interaction entity, the old way, still removes the piece and its barrier.
	await place('chair', 36, 8, 'east');
	const interactions = await c.entities('interaction');
	const hit = interactions.find((e) => Math.abs(e.x - 36.5) < 0.1 && Math.abs(e.z - 8.5) < 0.1);
	await c.send(`attack ${hit ? hit.id : -1}`);
	await sleep(600);
	check('attacking the interaction removes the chair and its barrier', (await count(display(36, 8))) === 0 && !(await barrier(36, 8)));

	// Creative breaking removes the piece without a drop.
	await rcon('gamemode creative Tester');
	await place('gold_bathtub', 36, 12, 'east');
	await rcon('kill @e[type=item]');
	await c.send('dig 36 -60 12');
	await sleep(800);
	check('creative break removes the bathtub and its barriers', (await count(display(36, 12))) === 0 && !(await barrier(36, 12)) && !(await barrier(37, 12)));
	check('creative break drops nothing', (await count('@e[type=item,x=36.5,y=-60,z=12.5,distance=..3]')) === 0);
	await rcon('gamemode survival Tester');

	// An orphaned interaction (display killed) still clears its barrier when hit.
	await place('chair', 36, 16, 'east');
	await rcon(`kill ${display(36, 16)}`);
	await rcon('clear Tester');
	await c.send('dig 36 -60 16');
	await sleep(600);
	check('an orphaned piece loses its barrier when hit', !(await barrier(36, 16)));
}

(async () => {
	await rcon('op Tester');
	c = new Client('Tester');
	await c.waitFor(/^LOGIN/);
	await sleep(2000);
	await rcon('gamemode survival Tester');
	await rcon('difficulty peaceful');
	if (stage === 'a') await stageA();
	else await stageB();
	await c.quit();
	await close();
	process.exit(summary() ? 0 : 1);
})().catch(async (error) => {
	console.error(error);
	process.exit(2);
});
