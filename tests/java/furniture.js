// End-to-end furniture tests. Stage a runs on CutebearFurniture 1.6, stage b on 1.7 and stage c on 1.8, each on the
// world the stage before left.
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

// Places bathtubs and checks their barriers, then breaking, sitting and building against pieces, all shifted dz
// blocks south. A bathtub's second barrier is one block along the player's facing: ahead in 1.7 (side 1), which put
// it under the empty side, and back towards the player, under the rest of the model, from 1.8 (side -1).
async function behaviour(side, dz) {
	const tubs = { east: [20, -6], south: [24, -6], west: [28, -6], north: [32, -4] };
	for (const [facing, [x, z0]] of Object.entries(tubs)) {
		const z = z0 + dz;
		await place('gold_bathtub', x, z, facing);
		const [sx, sz] = STEP[facing].map((step) => step * side);
		check(`gold bathtub facing ${facing}: display placed`, (await count(display(x, z))) === 1);
		check(`gold bathtub facing ${facing}: barriers at ${x},${z} and ${x + sx},${z + sz}`, (await barrier(x, z)) && (await barrier(x + sx, z + sz)));
		check(`gold bathtub facing ${facing}: none on the other side`, !(await barrier(x - sx, z - sz)));
	}
	const model = await rcon(`data get entity @e[type=item_display,x=20.5,y=-59.5,z=${dz - 5.5},distance=..0.6,limit=1] item.components."minecraft:item_model"`);
	check('gold bathtub keeps its gold model', model.includes('cutebear_furniture:gold_bathtub'), model.trim());

	// Walking into a barrier is refused: the server snaps the player back.
	await tp(18, dz - 6, 'east');
	await c.send(`move 19.9 -60 ${dz - 5.5}`);
	await sleep(800);
	const pos = await rcon('data get entity Tester Pos[0]');
	const x = Number((pos.match(/(-?[\d.]+)d/) || [])[1]);
	check('player cannot walk into the bathtub', x < 19.7, `x=${x}`);

	// Left-clicking the second half of a bathtub breaks the whole piece and drops it in survival.
	await rcon('clear Tester');
	await tp(18, dz - 6, 'east');
	await c.send(`dig ${20 + side} -60 ${dz - 6}`);
	await sleep(800);
	check('dig on barrier removed the display', (await count(display(20, dz - 6))) === 0);
	check('dig on barrier removed both barriers', !(await barrier(20, dz - 6)) && !(await barrier(20 + side, dz - 6)));
	const drop = await count(`@e[type=item,x=20.5,y=-60,z=${dz - 5.5},distance=..3]`);
	const held = await rcon('clear Tester minecraft:poisonous_potato 0');
	check('survival break dropped the gold bathtub', drop === 1 || held.includes('Found 1'), `item entities ${drop}, inventory: ${held.trim()}`);

	// Right-clicking a toilet's barrier sits the player down.
	await place('gold_toilet', 36, dz, 'east');
	check('gold toilet has a barrier', await barrier(36, dz));
	await rcon('clear Tester');
	await c.send(`useon 36 -60 ${dz} UP`);
	await sleep(600);
	const vehicle = await c.send('vehicle');
	check('right-click on a toilet barrier seats the player', vehicle !== 'VEHICLE -1', vehicle);
	await rcon('ride Tester dismount');
	await sleep(400);
	check('seat is removed after dismount', (await count(`@e[type=armor_stand,x=36.5,y=-59.2,z=${dz + 0.5},distance=..1]`)) === 0);

	// Building against a furniture barrier still works like any block.
	await place('gold_basic_sink', 36, dz + 4, 'east');
	await rcon('give Tester minecraft:dirt 1');
	await sleep(300);
	await c.send(`useon 36 -60 ${dz + 4} UP`);
	await sleep(600);
	check('a block can be placed on top of a sink', await isBlock(36, -59, dz + 4, 'minecraft:dirt'));
	await rcon(`setblock 36 -59 ${dz + 4} minecraft:air`);

	// Hitting the interaction entity, the old way, still removes the piece and its barrier.
	await place('chair', 36, dz + 8, 'east');
	const interactions = await c.entities('interaction');
	const hit = interactions.find((e) => Math.abs(e.x - 36.5) < 0.1 && Math.abs(e.z - (dz + 8.5)) < 0.1);
	await c.send(`attack ${hit ? hit.id : -1}`);
	await sleep(600);
	check('attacking the interaction removes the chair and its barrier', (await count(display(36, dz + 8))) === 0 && !(await barrier(36, dz + 8)));

	// Creative breaking removes the piece without a drop.
	await rcon('gamemode creative Tester');
	await place('gold_bathtub', 36, dz + 12, 'east');
	await rcon('kill @e[type=item]');
	await c.send(`dig 36 -60 ${dz + 12}`);
	await sleep(800);
	check('creative break removes the bathtub and its barriers', (await count(display(36, dz + 12))) === 0 && !(await barrier(36, dz + 12)) && !(await barrier(36 + side, dz + 12)));
	check('creative break drops nothing', (await count(`@e[type=item,x=36.5,y=-60,z=${dz + 12.5},distance=..3]`)) === 0);
	await rcon('gamemode survival Tester');

	// An orphaned interaction (display killed) still clears its barrier when hit.
	await place('chair', 36, dz + 16, 'east');
	await rcon(`kill ${display(36, dz + 16)}`);
	await rcon('clear Tester');
	await c.send(`dig 36 -60 ${dz + 16}`);
	await sleep(600);
	check('an orphaned piece loses its barrier when hit', !(await barrier(36, dz + 16)));
}

async function stageB() {
	await sleep(1500);
	check('upgrade: old chair got a barrier', await barrier(10, 0));
	check('upgrade: old bathtub got both barriers', (await barrier(10, 4)) && (await barrier(11, 4)));
	check('upgrade: nothing else became a barrier', !(await barrier(9, 4)) && !(await barrier(10, 5)) && !(await barrier(10, 3)));
	await behaviour(1, 0);
}

// 1.8 moves the second barrier of every bathtub placed before it, by 1.6 or 1.7, to the side the model covers, and
// leaves other pieces' barriers alone.
async function stageC() {
	await sleep(1500);
	check('upgrade: the 1.6 bathtub has barriers at 10,4 and 9,4', (await barrier(10, 4)) && (await barrier(9, 4)));
	check('upgrade: the 1.6 bathtub lost the barrier at 11,4', !(await barrier(11, 4)));
	const tubs = { south: [24, -6], west: [28, -6], north: [32, -4] };
	for (const [facing, [x, z]] of Object.entries(tubs)) {
		const [dx, dz] = STEP[facing];
		check(`upgrade: the 1.7 bathtub facing ${facing} has barriers at ${x},${z} and ${x - dx},${z - dz}`, (await barrier(x, z)) && (await barrier(x - dx, z - dz)));
		check(`upgrade: the 1.7 bathtub facing ${facing} lost the barrier at ${x + dx},${z + dz}`, !(await barrier(x + dx, z + dz)));
	}
	check('upgrade: the chair, toilet and sink keep their barriers', (await barrier(10, 0)) && (await barrier(36, 0)) && (await barrier(36, 4)));
	await tp(20, 36, 'east');
	await rcon('fill 0 -60 21 40 -55 50 minecraft:air');
	await rcon('kill @e[type=!player,x=0,y=-64,z=21,dx=40,dy=10,dz=29]');
	await behaviour(-1, 30);
}

(async () => {
	await rcon('op Tester');
	c = new Client('Tester');
	await c.waitFor(/^LOGIN/);
	await sleep(2000);
	await rcon('gamemode survival Tester');
	await rcon('difficulty peaceful');
	if (stage === 'a') await stageA();
	else if (stage === 'b') await stageB();
	else await stageC();
	await c.quit();
	await close();
	process.exit(summary() ? 0 : 1);
})().catch(async (error) => {
	console.error(error);
	process.exit(2);
});
