// Checks the pieces CutebearFurniture 1.8 adds from Paladin's Furniture: their recipes, floor, wall and ceiling
// placement, the yaw each gets, barriers only where a piece is solid, two-block beds, light from lamps, and seats.
// Solidity and lamps are as 1.10 has them.
const { rcon, isBlock, count, check, summary, close, sleep } = require('../../lib/common');
const { Client } = require('../../lib/java');

const item = (model) => `minecraft:poisonous_potato[minecraft:item_model="cutebear_furniture:${model}"]`;
const YAW = { east: -90, south: 0, west: 90, north: 180 };
// Everything happens along two rows, away from the other furniture tests: the single pieces along z = 60, and the
// pieces that come in each wood or colour along z = 68.
const Z = 60;
const FAMILIES = 68;

let c;

async function tp(x, z, facing) {
	await rcon(`tp Tester ${x + 0.5} -60 ${z + 0.5} ${YAW[facing]} 30`);
	await c.waitFor(new RegExp(`^TELEPORT ${x + 0.5} -60\\.0 ${z + 0.5}`), 5000).catch(() => {});
	c.events = [];
	await sleep(300);
}

async function hold(model) {
	await rcon('clear Tester');
	await rcon(`give Tester ${item(model)} 1`);
	await sleep(400);
}

// Stands two blocks west of the target, facing east, and clicks the ground below it.
async function placeFloor(model, x, z = Z) {
	await tp(x - 2, z, 'east');
	await hold(model);
	await c.send(`useon ${x} -61 ${z} UP`);
	await sleep(600);
}

const display = (x, y, z = Z) => `@e[type=item_display,x=${x + 0.5},y=${y + 0.5},z=${z + 0.5},distance=..0.6]`;
const barrier = (x, y, z = Z) => isBlock(x, y, z, 'minecraft:barrier');
const interactionAt = async (x, z = Z) => (await c.entities('interaction')).find((e) => Math.abs(e.x - (x + 0.5)) < 0.1 && Math.abs(e.z - (z + 0.5)) < 0.1);

// The display's yaw from 0 to 360.
async function yaw(x, y, z = Z) {
	const reply = await rcon(`data get entity @e[type=item_display,x=${x + 0.5},y=${y + 0.5},z=${z + 0.5},distance=..0.6,limit=1] Rotation[0]`);
	const value = Number((reply.match(/(-?[\d.]+)f/) || [])[1]);
	return ((value % 360) + 360) % 360;
}

// Right-clicks the top of a piece's barrier, reports whether that seated the player, and stands up again.
async function sits(x, z = Z) {
	await rcon('clear Tester');
	await c.send(`useon ${x} -60 ${z} UP`);
	await sleep(600);
	const vehicle = await c.send('vehicle');
	await rcon('ride Tester dismount');
	await sleep(400);
	return vehicle !== 'VEHICLE -1';
}

(async () => {
	await rcon('op Tester');
	c = new Client('Tester');
	await c.waitFor(/^LOGIN/);
	await sleep(2000);
	await rcon('gamemode survival Tester');
	await rcon('difficulty peaceful');
	// Standing on the rows loads them for the clean-up.
	await tp(20, Z + 4, 'east');
	await rcon(`fill 0 -60 ${Z - 5} 40 -55 ${FAMILIES + 5} minecraft:air`);
	await rcon(`kill @e[type=!player,x=0,y=-64,z=${Z - 5},dx=40,dy=10,dz=${FAMILIES - Z + 10}]`);

	// Each imported piece has a stonecutter recipe, the wooden ones from any log of their wood.
	await rcon('recipe take Tester *');
	for (const id of ['white_simple_sofa', 'xbox_fridge', 'light_switch', 'simple_light', 'oak_table_basic', 'warped_kitchen_counter', 'oak_red_simple_bed', 'basic_red_oak_lamp', 'blue_office_chair']) {
		const reply = await rcon(`recipe give Tester cutebear_furniture:${id}`);
		check(`${id} has a recipe`, /Unlocked 1 recipe/.test(reply), reply.trim());
	}

	// A sofa faces the player like the first chairs, is solid and seats you.
	await placeFloor('white_simple_sofa', 10);
	check('sofa placed', (await count(display(10, -60))) === 1);
	check('sofa yaw is the one the first chairs get facing east (0)', (await yaw(10, -60)) === 0, String(await yaw(10, -60)));
	check('sofa is solid', await barrier(10, -60));
	check('right-clicking the sofa seats the player', await sits(10));

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

	// A microwave is solid, so things can go on top of it.
	await placeFloor('iron_microwave', 22);
	check('microwave placed with a barrier', (await count(display(22, -60))) === 1 && (await barrier(22, -60)));

	// Floor pieces need the top of a block and wall pieces the side of one.
	await rcon(`setblock 26 -60 ${Z} minecraft:stone`);
	await tp(23, Z, 'east');
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
	await tp(28, Z, 'east');
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
	await tp(31, Z, 'east');
	await hold('wall_toilet_paper');
	await c.send(`useon 34 -60 ${Z} WEST`);
	await sleep(600);
	const paper = await interactionAt(33);
	await rcon('clear Tester');
	await c.send(`interact ${paper ? paper.id : -1}`);
	await sleep(600);
	check('toilet paper placed', !!paper);
	check('toilet paper does not seat the player', (await c.send('vehicle')) === 'VEHICLE -1');

	// A bed starts at the clicked block, its foot towards the player, and its head takes the block beyond.
	await placeFloor('oak_red_simple_bed', 10, FAMILIES);
	check('bed placed', (await count(display(10, -60, FAMILIES))) === 1);
	check('bed yaw is 180', (await yaw(10, -60, FAMILIES)) === 180, String(await yaw(10, -60, FAMILIES)));
	check('bed has barriers at 10 and 11', (await barrier(10, -60, FAMILIES)) && (await barrier(11, -60, FAMILIES)));
	check('bed has no barrier towards the player', !(await barrier(9, -60, FAMILIES)));

	// Stools and office chairs seat you; an office chair's seat faces the player.
	await placeFloor('oak_log_stool', 16, FAMILIES);
	check('log stool is solid', await barrier(16, -60, FAMILIES));
	check('right-clicking the log stool seats the player', await sits(16, FAMILIES));
	await placeFloor('blue_office_chair', 20, FAMILIES);
	check('office chair yaw is 90', (await yaw(20, -60, FAMILIES)) === 90, String(await yaw(20, -60, FAMILIES)));
	check('right-clicking the office chair seats the player', await sits(20, FAMILIES));

	// A floor lamp is solid and lights the block above it.
	await placeFloor('basic_red_oak_lamp', 24, FAMILIES);
	check('lamp placed', (await count(display(24, -60, FAMILIES))) === 1);
	check('lamp is solid', await barrier(24, -60, FAMILIES));
	check('lamp gives light level 15 above it', await isBlock(24, -59, FAMILIES, 'minecraft:light[level=15]'));

	// A wall cabinet hangs on the side of a block, backed against it, and is solid.
	await rcon(`setblock 30 -59 ${FAMILIES} minecraft:stone`);
	await tp(27, FAMILIES, 'east');
	await hold('oak_kitchen_cabinet');
	await c.send(`useon 30 -59 ${FAMILIES} WEST`);
	await sleep(600);
	check('wall cabinet placed in front of the wall', (await count(display(29, -59, FAMILIES))) === 1);
	check('wall cabinet yaw is 270', (await yaw(29, -59, FAMILIES)) === 270, String(await yaw(29, -59, FAMILIES)));
	check('wall cabinet is solid', await barrier(29, -59, FAMILIES));

	// A desk is put together from Paladin's top and four legs.
	await placeFloor('acacia_desk_basic', 34, FAMILIES);
	const model = await rcon(`data get entity @e[type=item_display,x=34.5,y=-59.5,z=${FAMILIES + 0.5},distance=..0.6,limit=1] item.components."minecraft:item_model"`);
	check('desk placed with its model', model.includes('cutebear_furniture:acacia_desk_basic'), model.trim());
	check('desk is solid', await barrier(34, -60, FAMILIES));

	await c.quit();
	await close();
	process.exit(summary() ? 0 : 1);
})().catch(async (error) => {
	console.error(error);
	process.exit(2);
});
