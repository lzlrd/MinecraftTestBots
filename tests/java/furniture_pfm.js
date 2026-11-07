// Checks the pieces CutebearFurniture 1.8 adds from Paladin's Furniture: their recipes, floor, wall and ceiling
// placement, the yaw each gets, barriers only where a piece is solid, light from lamps, and seats.
const { rcon, isBlock, count, check, summary, close, sleep } = require('../../lib/common');
const { Client } = require('../../lib/java');

const item = (model) => `minecraft:poisonous_potato[minecraft:item_model="cutebear_furniture:${model}"]`;
const YAW = { east: -90, south: 0, west: 90, north: 180 };
// Everything happens along this row, away from the other furniture tests.
const Z = 60;

let c;

async function tp(x, facing) {
	await rcon(`tp Tester ${x + 0.5} -60 ${Z + 0.5} ${YAW[facing]} 30`);
	await c.waitFor(new RegExp(`^TELEPORT ${x + 0.5} -60\\.0 ${Z + 0.5}`), 5000).catch(() => {});
	c.events = [];
	await sleep(300);
}

async function hold(model) {
	await rcon('clear Tester');
	await rcon(`give Tester ${item(model)} 1`);
	await sleep(400);
}

// Stands two blocks west of the target, facing east, and clicks the ground below it.
async function placeFloor(model, x) {
	await tp(x - 2, 'east');
	await hold(model);
	await c.send(`useon ${x} -61 ${Z} UP`);
	await sleep(600);
}

const display = (x, y) => `@e[type=item_display,x=${x + 0.5},y=${y + 0.5},z=${Z + 0.5},distance=..0.6]`;
const barrier = (x, y) => isBlock(x, y, Z, 'minecraft:barrier');
const interactionAt = async (x) => (await c.entities('interaction')).find((e) => Math.abs(e.x - (x + 0.5)) < 0.1 && Math.abs(e.z - (Z + 0.5)) < 0.1);

// The display's yaw from 0 to 360.
async function yaw(x, y) {
	const reply = await rcon(`data get entity @e[type=item_display,x=${x + 0.5},y=${y + 0.5},z=${Z + 0.5},distance=..0.6,limit=1] Rotation[0]`);
	const value = Number((reply.match(/(-?[\d.]+)f/) || [])[1]);
	return ((value % 360) + 360) % 360;
}

(async () => {
	await rcon('op Tester');
	c = new Client('Tester');
	await c.waitFor(/^LOGIN/);
	await sleep(2000);
	await rcon('gamemode survival Tester');
	await rcon('difficulty peaceful');
	// Standing on the row loads it for the clean-up.
	await tp(20, 'east');
	await rcon(`fill 0 -60 ${Z - 5} 40 -55 ${Z + 5} minecraft:air`);
	await rcon(`kill @e[type=!player,x=0,y=-64,z=${Z - 5},dx=40,dy=10,dz=10]`);

	// Each imported piece has a stonecutter recipe.
	await rcon('recipe take Tester *');
	for (const id of ['white_simple_sofa', 'xbox_fridge', 'light_switch', 'simple_light']) {
		const reply = await rcon(`recipe give Tester cutebear_furniture:${id}`);
		check(`${id} has a recipe`, /Unlocked 1 recipe/.test(reply), reply.trim());
	}

	// A sofa faces the player like the first chairs, is solid and seats you.
	await placeFloor('white_simple_sofa', 10);
	check('sofa placed', (await count(display(10, -60))) === 1);
	check('sofa yaw is the one the first chairs get facing east (0)', (await yaw(10, -60)) === 0, String(await yaw(10, -60)));
	check('sofa is solid', await barrier(10, -60));
	await rcon('clear Tester');
	await c.send(`useon 10 -60 ${Z} UP`);
	await sleep(600);
	const seated = await c.send('vehicle');
	check('right-clicking the sofa seats the player', seated !== 'VEHICLE -1', seated);
	await rcon('ride Tester dismount');
	await sleep(400);

	// A fridge's door is on its model's north side, so it is turned a quarter more to face the player.
	await placeFloor('white_fridge', 14);
	check('fridge yaw is 90', (await yaw(14, -60)) === 90, String(await yaw(14, -60)));
	check('fridge is solid', await barrier(14, -60));

	// The Xbox fridge is two blocks tall, and breaking its top half removes it all.
	await placeFloor('xbox_fridge', 18);
	check('Xbox fridge has barriers in both blocks', (await barrier(18, -60)) && (await barrier(18, -59)));
	await rcon('clear Tester');
	await c.send(`dig 18 -59 ${Z}`);
	await sleep(800);
	check('breaking its top half removes the Xbox fridge and both barriers', (await count(display(18, -60))) === 0 && !(await barrier(18, -60)) && !(await barrier(18, -59)));

	// A microwave sits on a counter, so it is not solid.
	await placeFloor('iron_microwave', 22);
	check('microwave placed without a barrier', (await count(display(22, -60))) === 1 && !(await barrier(22, -60)));

	// Floor pieces need the top of a block and wall pieces the side of one.
	await rcon(`setblock 26 -60 ${Z} minecraft:stone`);
	await tp(23, 'east');
	await hold('white_simple_sofa');
	await c.send(`useon 26 -60 ${Z} WEST`);
	await sleep(600);
	check('a sofa is not placed on the side of a block', (await count(display(25, -60))) === 0);
	await hold('light_switch');
	await c.send(`useon 26 -60 ${Z} WEST`);
	await sleep(600);
	check('light switch placed in front of the wall', (await count(display(25, -60))) === 1);
	check('light switch yaw is 90', (await yaw(25, -60)) === 90, String(await yaw(25, -60)));
	check('light switch is not solid', !(await barrier(25, -60)));
	await hold('light_switch');
	await c.send(`useon 26 -60 ${Z} UP`);
	await sleep(600);
	check('a light switch is not placed on top of a block', (await count(display(26, -59))) === 0);

	// A ceiling light hangs under a block and lights its own block until it is broken.
	await rcon(`setblock 30 -57 ${Z} minecraft:stone`);
	await tp(28, 'east');
	await hold('simple_light');
	await c.send(`useon 30 -57 ${Z} DOWN`);
	await sleep(600);
	check('ceiling light placed under the block', (await count(display(30, -58))) === 1);
	check('ceiling light gives light level 15', await isBlock(30, -58, Z, 'minecraft:light[level=15]'));
	const lamp = await interactionAt(30);
	await c.send(`attack ${lamp ? lamp.id : -1}`);
	await sleep(600);
	check('breaking the light removes it and its light block', (await count(display(30, -58))) === 0 && (await isBlock(30, -58, Z, 'minecraft:air')));

	// Toilet paper has "toilet" in its name, which made the first pieces seats, but is no seat.
	await rcon(`setblock 34 -60 ${Z} minecraft:stone`);
	await tp(31, 'east');
	await hold('wall_toilet_paper');
	await c.send(`useon 34 -60 ${Z} WEST`);
	await sleep(600);
	const paper = await interactionAt(33);
	await rcon('clear Tester');
	await c.send(`interact ${paper ? paper.id : -1}`);
	await sleep(600);
	check('toilet paper placed', !!paper);
	check('toilet paper does not seat the player', (await c.send('vehicle')) === 'VEHICLE -1');

	await c.quit();
	await close();
	process.exit(summary() ? 0 : 1);
})().catch(async (error) => {
	console.error(error);
	process.exit(2);
});
