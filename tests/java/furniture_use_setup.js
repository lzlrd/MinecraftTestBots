// Places one of each kind of piece CutebearFurniture 1.10 changes, with 1.9, along z = 76: a kitchen counter and a
// wall cabinet that store things, a lamp, a bed, a bunk ladder, the first pieces' chair, trash can and bathtub, and
// the furniture workbench. furniture_use.js then checks 1.10 brings them up to date.
const { rcon, isBlock, count, check, summary, close, sleep } = require('../../lib/common');
const { Client } = require('../../lib/java');

const item = (model) => `minecraft:poisonous_potato[minecraft:item_model="cutebear_furniture:${model}"]`;
const YAW = { east: -90, south: 0, west: 90, north: 180 };
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

// Hangs a wall piece on the north side of a stone block just south of the row, standing north of it.
async function placeWall(model, x, y) {
	await rcon(`setblock ${x} ${y} ${Z + 1} minecraft:stone`);
	await tp(x, Z - 2, 'south');
	await hold(model);
	await c.send(`useon ${x} ${y} ${Z + 1} NORTH`);
	await sleep(600);
}

const display = (x, y) => `@e[type=item_display,x=${x + 0.5},y=${y + 0.5},z=${Z + 0.5},distance=..0.6]`;

(async () => {
	await rcon('op Tester');
	c = new Client('Tester');
	await c.waitFor(/^LOGIN/);
	await sleep(2000);
	await rcon('gamemode survival Tester');
	await rcon('difficulty peaceful');
	await tp(20, Z - 3, 'east');
	await rcon(`fill 0 -60 ${Z - 5} 40 -55 ${Z + 5} minecraft:air`);
	await rcon(`kill @e[type=!player,x=0,y=-64,z=${Z - 5},dx=40,dy=10,dz=10]`);

	await placeFloor('oak_kitchen_counter', 10);
	await placeWall('oak_kitchen_cabinet', 12, -59);
	await placeFloor('basic_red_oak_lamp', 14);
	await placeFloor('oak_red_simple_bed', 16);
	await placeWall('oak_simple_bunk_ladder', 20, -60);
	await placeFloor('chair', 22);
	await placeFloor('trash_can', 24);
	await placeFloor('bathtub', 26);
	await placeFloor('working_table', 30);

	for (const [name, x, y] of [['counter', 10, -60], ['wall cabinet', 12, -59], ['lamp', 14, -60], ['bed', 16, -60],
		['ladder', 20, -60], ['chair', 22, -60], ['trash can', 24, -60], ['bathtub', 26, -60], ['workbench', 30, -60]])
		check(`1.9 placed the ${name}`, (await count(display(x, y))) === 1);
	check('1.9 lit the lamp from its own block', await isBlock(14, -60, Z, 'minecraft:light[level=15]'));
	check('1.9 left the lamp open', !(await isBlock(14, -60, Z, 'minecraft:barrier')));
	const interaction = await rcon(`data get entity @e[type=interaction,x=10.5,y=-59.5,z=${Z + 0.5},distance=..0.6,limit=1] Pos`);
	check('1.9 put the counter\'s interaction half a block up', /-59\.5d/.test(interaction), interaction.trim());

	await c.quit();
	await close();
	process.exit(summary() ? 0 : 1);
})().catch(async (error) => {
	console.error(error);
	process.exit(2);
});
