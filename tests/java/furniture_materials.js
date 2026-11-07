// Checks the pieces CutebearFurniture 1.9 adds from Paladin's Furniture: stripped wood, the raw log table, stone,
// and the two-material kitchens and modern stools. Each has a stonecutter recipe, keeps its family's yaw, barriers and
// seat, and shows its own model.
const { rcon, count, check, summary, close, sleep, isBlock } = require('../../lib/common');
const { Client } = require('../../lib/java');

const item = (model) => `minecraft:poisonous_potato[minecraft:item_model="cutebear_furniture:${model}"]`;
const YAW = { east: -90, south: 0, west: 90, north: 180 };
// One row along z = 76, away from the other furniture tests.
const Z = 76;

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
async function placeFloor(model, x) {
	await tp(x - 2, Z, 'east');
	await hold(model);
	await c.send(`useon ${x} -61 ${Z} UP`);
	await sleep(600);
}

const display = (x, y) => `@e[type=item_display,x=${x + 0.5},y=${y + 0.5},z=${Z + 0.5},distance=..0.6]`;
const barrier = (x, y) => isBlock(x, y, Z, 'minecraft:barrier');

async function yaw(x, y) {
	const reply = await rcon(`data get entity @e[type=item_display,x=${x + 0.5},y=${y + 0.5},z=${Z + 0.5},distance=..0.6,limit=1] Rotation[0]`);
	const value = Number((reply.match(/(-?[\d.]+)f/) || [])[1]);
	return ((value % 360) + 360) % 360;
}

async function model(x, y) {
	return rcon(`data get entity @e[type=item_display,x=${x + 0.5},y=${y + 0.5},z=${Z + 0.5},distance=..0.6,limit=1] item.components."minecraft:item_model"`);
}

async function sits(x) {
	await rcon('clear Tester');
	await c.send(`useon ${x} -60 ${Z} UP`);
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
	await tp(20, Z + 4, 'east');
	await rcon(`fill 0 -60 ${Z - 3} 44 -55 ${Z + 3} minecraft:air`);
	await rcon(`kill @e[type=!player,x=0,y=-64,z=${Z - 3},dx=44,dy=10,dz=6]`);

	// Every kind of new piece has a recipe; quartz kitchens don't exist, as in Paladin's.
	await rcon('recipe take Tester *');
	const ids = ['stripped_oak_chair', 'stripped_warped_kitchen_counter', 'stripped_pale_oak_classic_desk_all',
		'oak_raw_log_table', 'stripped_birch_raw_log_table', 'granite_table_basic', 'granite_natural_table',
		'cinnabar_chair_modern', 'sulfur_kitchen_sink', 'quartz_chair', 'light_wood_kitchen_counter',
		'netherite_classic_stool', 'calcite_kitchen_cabinet', 'dark_concrete_kitchen_counter',
		'blackstone_crimson_kitchen_wall_drawer', 'gray_modern_stool', 'light_gray_dark_oak_modern_stool'];
	for (const id of ids) {
		const reply = await rcon(`recipe give Tester cutebear_furniture:${id}`);
		check(`${id} has a recipe`, /Unlocked 1 recipe/.test(reply), reply.trim());
	}
	const quartz = await rcon('recipe give Tester cutebear_furniture:quartz_kitchen_counter');
	check('there is no quartz kitchen counter', !/Unlocked 1 recipe/.test(quartz), quartz.trim());

	// A stripped chair behaves like the plugin's own chairs: same yaw, solid, a seat.
	await placeFloor('stripped_oak_chair', 6);
	check('stripped oak chair placed with its model', (await model(6, -60)).includes('cutebear_furniture:stripped_oak_chair'));
	check('stripped oak chair yaw is 0 like the oak chair', (await yaw(6, -60)) === 0, String(await yaw(6, -60)));
	check('stripped oak chair is solid', await barrier(6, -60));
	check('right-clicking the stripped oak chair seats the player', await sits(6));

	// A stone kitchen counter turns like the wooden ones and is solid.
	await placeFloor('granite_kitchen_counter', 10);
	check('granite kitchen counter placed with its model', (await model(10, -60)).includes('cutebear_furniture:granite_kitchen_counter'));
	check('granite kitchen counter yaw is 270 like the wooden ones', (await yaw(10, -60)) === 270, String(await yaw(10, -60)));
	check('granite kitchen counter is solid', await barrier(10, -60));

	// The raw log table and a netherite table are solid tables.
	await placeFloor('oak_raw_log_table', 14);
	check('raw log table placed and solid', (await count(display(14, -60))) === 1 && (await barrier(14, -60)));
	await placeFloor('netherite_table_basic', 18);
	check('netherite table placed and solid', (await count(display(18, -60))) === 1 && (await barrier(18, -60)));

	// Two-tone modern stools seat you.
	await placeFloor('gray_dark_oak_modern_stool', 22);
	check('gray dark oak modern stool placed with its model', (await model(22, -60)).includes('cutebear_furniture:gray_dark_oak_modern_stool'));
	check('right-clicking the gray dark oak modern stool seats the player', await sits(22));

	// A calcite wall cabinet hangs on the side of a block, backed against it, and is solid.
	await rcon(`setblock 28 -59 ${Z} minecraft:stone`);
	await tp(25, Z, 'east');
	await hold('calcite_kitchen_cabinet');
	await c.send(`useon 28 -59 ${Z} WEST`);
	await sleep(600);
	check('calcite wall cabinet placed in front of the wall', (await count(display(27, -59))) === 1);
	check('calcite wall cabinet yaw is 270', (await yaw(27, -59)) === 270, String(await yaw(27, -59)));
	check('calcite wall cabinet is solid', await barrier(27, -59));

	// A two-material kitchen piece breaks like any other.
	await placeFloor('dark_concrete_kitchen_counter_oven', 32);
	check('dark concrete oven placed and solid', (await count(display(32, -60))) === 1 && (await barrier(32, -60)));
	await rcon('clear Tester');
	await c.send(`dig 32 -60 ${Z}`);
	await sleep(800);
	check('breaking the oven removes it and its barrier', (await count(display(32, -60))) === 0 && !(await barrier(32, -60)));

	await c.quit();
	await close();
	process.exit(summary() ? 0 : 1);
})().catch(async (error) => {
	console.error(error);
	process.exit(2);
});
