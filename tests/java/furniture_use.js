// Checks CutebearFurniture 1.10: pieces placed with 1.9 (furniture_use_setup.js) brought up to date, blocks placed on
// top of furniture, storage that works like a chest and survives a crash, the furniture workbench's stonecutter, beds
// that sleep and set the spawn like vanilla beds, solid lamps, and climbable bunk ladders. Restarts the server twice,
// once by killing it, so run it on the test server only. Needs Floodgate, as on the real server.
const { execSync } = require('child_process');
const config = require('../../lib/config');
const { rcon, isBlock, count, check, summary, close, sleep } = require('../../lib/common');
const { Client } = require('../../lib/java');

const item = (model) => `minecraft:poisonous_potato[minecraft:item_model="cutebear_furniture:${model}"]`;
const YAW = { east: -90, south: 0, west: 90, north: 180 };
// The pieces from furniture_use_setup.js along z = 76, and new ones along z = 84.
const OLD = 76;
const NEW = 84;

let c;

async function connect() {
	c = new Client('Tester');
	await c.waitFor(/^LOGIN/, 60000);
	await sleep(2000);
	await rcon('gamemode survival Tester');
}

async function tp(x, z, facing) {
	await rcon(`tp Tester ${x + 0.5} -60 ${z + 0.5} ${YAW[facing]} 30`);
	await c.waitFor(new RegExp(`^TELEPORT ${x + 0.5} -60\\.0 ${z + 0.5}`), 5000).catch(() => {});
	c.events = [];
	await sleep(300);
}

async function hold(what) {
	await rcon('clear Tester');
	await rcon(`give Tester ${what} 1`);
	await sleep(400);
}

// Stands two blocks west of the target, facing east, and clicks the ground below it.
async function placeFloor(model, x, z = NEW) {
	await tp(x - 2, z, 'east');
	await hold(item(model));
	await c.send(`useon ${x} -61 ${z} UP`);
	await sleep(600);
}

const display = (x, y, z) => `@e[type=item_display,x=${x + 0.5},y=${y + 0.5},z=${z + 0.5},distance=..0.6]`;
// data get takes one entity.
const oneDisplay = (x, y, z) => `@e[type=item_display,x=${x + 0.5},y=${y + 0.5},z=${z + 0.5},distance=..0.6,limit=1]`;
const interaction = (x, y, z) => `@e[type=interaction,x=${x + 0.5},y=${y},z=${z + 0.5},distance=..0.6,limit=1]`;
const barrier = (x, y, z) => isBlock(x, y, z, 'minecraft:barrier');

// The value a data get reply ends with.
async function data(target, path) {
	const reply = await rcon(`data get entity ${target} ${path}`);
	return reply.includes('has the following') ? reply.split(': ').slice(1).join(': ').trim() : null;
}

// Right-clicks the top of a piece's block and returns the container it opened, or null, once its items are in.
async function open(x, y, z) {
	c.events = [];
	await c.send(`useon ${x} ${y} ${z} UP`);
	const opened = await c.waitFor(/^OPENED/, 2000).catch(() => null);
	await sleep(300);
	return opened;
}

async function closeContainer() {
	await c.send('close');
	await sleep(300);
}

// The ID the client knows diamonds by, from its own inventory.
async function diamondId() {
	await rcon('clear Tester');
	await rcon('give Tester minecraft:diamond 5');
	await sleep(500);
	const slot = (await c.send('inv')).split(' ').slice(1).find((s) => s.startsWith('36:'));
	return slot ? Number(slot.split(':')[1]) : -1;
}

// Waits for a piece's entities to load after a restart, which they do after its blocks.
async function loaded(x, y, z) {
	for (let tries = 0; tries < 50 && (await count(display(x, y, z))) === 0; tries++) await sleep(200);
	await sleep(500);
}

async function sleeping() {
	return (await data('Tester', 'sleeping_pos')) !== null;
}

async function restart(kill) {
	if (kill) {
		await rcon('save-all flush');
		await sleep(3000);
		await close();
		// The brackets stop pkill matching its own shell, whose command line holds the pattern too.
		execSync(`pkill -9 -f '[${config.serverJar[0]}]${config.serverJar.slice(1)}' || true`);
		await sleep(3000);
	} else {
		await c.quit();
		await close();
	}
	execSync(`${config.restartScript} use-${kill ? 'crash' : 'restart'}.log`, { stdio: 'ignore', timeout: 400000 });
	await connect();
}

(async () => {
	if (!config.restartScript) throw new Error('set RESTART_SCRIPT to a command that restarts the server');
	await rcon('op Tester');
	await connect();
	await rcon('difficulty peaceful');
	await tp(20, OLD - 3, 'east');
	await rcon(`fill 0 -60 ${NEW - 3} 40 -55 ${NEW + 5} minecraft:air`);
	await rcon(`kill @e[type=!player,x=0,y=-64,z=${NEW - 3},dx=40,dy=10,dz=8]`);

	// 1.9's pieces now have their interaction on the floor, with no size where a barrier fills the piece's block.
	for (const [name, x, y] of [['counter', 10, -60], ['wall cabinet', 12, -59], ['lamp', 14, -60], ['bed', 16, -60],
		['chair', 22, -60], ['trash can', 24, -60], ['bathtub', 26, -60], ['workbench', 30, -60]]) {
		const pos = await data(interaction(x, y, OLD), 'Pos');
		check(`${name}'s interaction moved to the floor of its block`, pos === `[${x + 0.5}d, ${y}.0d, ${OLD + 0.5}d]`, pos);
		check(`${name}'s interaction has no size`, (await data(interaction(x, y, OLD), 'width')) === '0.0f' && (await data(interaction(x, y, OLD), 'height')) === '0.0f');
	}
	check('the ladder keeps a one-block interaction', (await data(interaction(20, -60, OLD), 'width')) === '1.0f');
	check('1.9\'s lamp is solid now', await barrier(14, -60, OLD));
	check('1.9\'s lamp shines from the block above it', await isBlock(14, -59, OLD, 'minecraft:light[level=15]'));
	check('1.9\'s ladder has a structure void', await isBlock(20, -60, OLD, 'minecraft:structure_void'));
	check('the data pack makes that climbable', await isBlock(20, -60, OLD, '#minecraft:climbable'));

	// A chair from 1.9 still seats you at the same height.
	await tp(22, OLD - 2, 'south');
	await rcon('clear Tester');
	await c.send(`useon 22 -60 ${OLD} UP`);
	await sleep(600);
	check('1.9\'s chair seats the player', (await c.send('vehicle')) !== 'VEHICLE -1');
	check('the seat is where it was', (await count(`@e[type=armor_stand,x=22.5,y=-59.2,z=${OLD + 0.5},distance=..0.01]`)) === 1);
	await rcon('ride Tester dismount');
	await sleep(400);

	// A block in hand opens a storage piece rather than going on top; sneaking puts it on top.
	await tp(8, OLD, 'east');
	await hold('minecraft:stone');
	const opened = await open(10, -60, OLD);
	check('right-clicking the counter with a block opens it', !!opened, opened);
	check('the counter is a chest\'s 27 slots, with its name', !!opened && /GENERIC_9X3 Oak Kitchen Counter$/.test(opened), opened);
	check('the block isn\'t placed', !(await isBlock(10, -59, OLD, 'minecraft:stone')));
	await closeContainer();
	await c.send('sneak on');
	await sleep(200);
	await c.send(`useon 10 -60 ${OLD} UP`);
	await sleep(600);
	check('sneaking puts the block on top of the counter', await isBlock(10, -59, OLD, 'minecraft:stone'));
	await rcon(`setblock 10 -59 ${OLD} minecraft:air`);
	await hold(item('basic_red_oak_lamp'));
	await c.send(`useon 10 -60 ${OLD} UP`);
	await sleep(600);
	check('sneaking puts a lamp on top of the counter', (await count(display(10, -59, OLD))) === 1);
	check('that lamp is solid and shines from above', (await barrier(10, -59, OLD)) && (await isBlock(10, -58, OLD, 'minecraft:light[level=15]')));
	await c.send('sneak off');
	await sleep(200);

	// A table has nothing to open, so a block goes on top without sneaking.
	await placeFloor('oak_table_basic', 14);
	await hold('minecraft:stone');
	await c.send(`useon 14 -60 ${NEW} UP`);
	await sleep(600);
	check('a block goes on top of a table', await isBlock(14, -59, NEW, 'minecraft:stone'));

	// A lamp under a low ceiling shines from its own block and stays see-through.
	await rcon(`setblock 18 -59 ${NEW} minecraft:stone`);
	await placeFloor('basic_red_oak_lamp', 18);
	check('a lamp with a block above it shines from its own block', await isBlock(18, -60, NEW, 'minecraft:light[level=15]'));

	// Storage keeps what's put in it.
	const diamond = await diamondId();
	check('the client knows diamonds', diamond > 0, String(diamond));
	await tp(8, OLD, 'east');
	await open(10, -60, OLD);
	await c.send('shift 54');
	await sleep(500);
	check('shift-clicking diamonds puts them in the counter', (await c.send('container')).includes(` 0:${diamond}:5`), await c.send('container'));
	await closeContainer();
	await sleep(300);
	await open(10, -60, OLD);
	check('the diamonds are there when it opens again', (await c.send('container')).includes(` 0:${diamond}:5`));
	await closeContainer();

	// Each size of storage, and the first pieces' trash can.
	await placeFloor('oak_classic_nightstand', 22);
	check('a nightstand holds 9', /GENERIC_9X1/.test(await open(22, -60, NEW) || ''));
	await closeContainer();
	await placeFloor('white_fridge', 26);
	check('a fridge holds 54', /GENERIC_9X6/.test(await open(26, -60, NEW) || ''));
	await closeContainer();
	await tp(24, OLD - 2, 'south');
	check('the first pieces\' trash can holds 27 and keeps its name', /GENERIC_9X3 Trash Can$/.test(await open(24, -60, OLD) || ''));
	await closeContainer();

	// Walking off with a piece open closes it, as a chest would.
	await tp(8, OLD, 'east');
	await open(10, -60, OLD);
	c.events = [];
	await rcon(`tp Tester 30.5 -60 ${OLD - 10}.5`);
	check('teleporting away closes the counter', !!(await c.waitFor(/^CLOSED/, 2000).catch(() => null)));

	// The furniture workbench opens a stonecutter.
	await tp(28, OLD, 'east');
	await rcon('clear Tester');
	check('the workbench opens a stonecutter', /STONECUTTER/.test(await open(30, -60, OLD) || ''));
	await closeContainer();

	// A bed does what a vanilla bed does at the same time of day, here with Sleep Anytime You Want installed.
	await rcon('time set 1000');
	await rcon(`setblock 30 -60 ${NEW} minecraft:red_bed[part=foot,facing=east]`);
	await rcon(`setblock 31 -60 ${NEW} minecraft:red_bed[part=head,facing=east]`);
	await tp(28, NEW, 'east');
	await c.send(`useon 30 -60 ${NEW} UP`);
	await sleep(800);
	const vanillaDay = await sleeping();
	if (vanillaDay) await c.send('leavebed');
	await sleep(500);
	await tp(16, OLD - 2, 'south');
	await rcon('clear Tester');
	await c.send(`useon 16 -60 ${OLD} UP`);
	await sleep(800);
	check('by day the bed does what a vanilla bed does', (await sleeping()) === vanillaDay, `vanilla ${vanillaDay}`);
	if (await sleeping()) await c.send('leavebed');
	await sleep(500);
	check('by day the bed sets the spawn beside it, forced', /forced: 1b/.test((await rcon('data get entity Tester respawn')) || ''), (await rcon('data get entity Tester respawn')).trim());

	await rcon('time set 18000');
	await c.send(`useon 16 -60 ${OLD} UP`);
	await sleep(800);
	check('at night the player sleeps in the bed', await sleeping());
	check('the bed is a red vanilla bed while they sleep', (await isBlock(16, -60, OLD, 'minecraft:red_bed[part=foot,facing=east]')) && (await isBlock(17, -60, OLD, 'minecraft:red_bed[part=head,facing=east,occupied=true]')));
	check('its model is hidden', (await count(display(16, -60, OLD))) === 1 && (await data(oneDisplay(16, -60, OLD), 'item')) === null);
	await c.send('leavebed');
	await sleep(600);
	check('getting up wakes the player', !(await sleeping()));
	check('the bed is barriers again', (await barrier(16, -60, OLD)) && (await barrier(17, -60, OLD)));
	check('its model is back', /oak_red_simple_bed/.test((await data(oneDisplay(16, -60, OLD), 'item.components."minecraft:item_model"')) || ''));

	// Dying sends the player back to the bed.
	await rcon(`tp Tester 30.5 -60 ${OLD - 10}.5`);
	await sleep(500);
	c.events = [];
	await rcon('kill Tester');
	await c.waitFor(/^RESPAWNED/, 10000).catch(() => {});
	await sleep(1500);
	const back = await data('Tester', 'Pos');
	const [bx, , bz] = (back || '').replace(/[[\]d]/g, '').split(', ').map(Number);
	check('the player respawns beside the bed', Math.abs(bx - 17.5) <= 1.5 && Math.abs(bz - (OLD + 0.5)) <= 1.5, back);

	// Breaking the bed loses the spawn, as with a vanilla bed.
	await tp(16, OLD - 2, 'south');
	await rcon('clear Tester');
	await c.send(`dig 16 -60 ${OLD}`);
	await sleep(800);
	check('the bed breaks', (await count(display(16, -60, OLD))) === 0 && !(await barrier(17, -60, OLD)));
	c.events = [];
	await rcon('kill Tester');
	await c.waitFor(/^RESPAWNED/, 10000).catch(() => {});
	await sleep(1500);
	const away = await data('Tester', 'Pos');
	const [ax, , az] = (away || '').replace(/[[\]d]/g, '').split(', ').map(Number);
	check('without the bed the player respawns elsewhere', Math.hypot(ax - 17.5, az - (OLD + 0.5)) > 4, away);
	check('and has no spawn left', !/forced/.test(await rcon('data get entity Tester respawn')), (await rcon('data get entity Tester respawn')).trim());
	await rcon('time set 1000');

	// The ladder's structure void stays put: water doesn't wash it away and blocks aren't placed into it.
	await rcon(`setblock 21 -60 ${OLD} minecraft:water`);
	await sleep(2500);
	check('water doesn\'t flow into the ladder', await isBlock(20, -60, OLD, 'minecraft:structure_void'));
	await rcon(`fill 19 -60 ${OLD - 1} 23 -60 ${OLD + 1} minecraft:air replace minecraft:water`);
	await tp(20, OLD - 2, 'south');
	await hold('minecraft:stone');
	await c.send(`useon 20 -61 ${OLD} UP`);
	await sleep(600);
	check('a block isn\'t placed into the ladder', await isBlock(20, -60, OLD, 'minecraft:structure_void'));
	check('Java players still see the ladder\'s model', (await c.entities('item_display')).some((e) => Math.abs(e.x - 20.5) < 0.1 && Math.abs(e.z - (OLD + 0.5)) < 0.1));

	// Storage survives a restart, and a crash after the world saves.
	await restart(false);
	await tp(8, OLD, 'east');
	await loaded(10, -60, OLD);
	await rcon('clear Tester');
	await open(10, -60, OLD);
	check('the diamonds are there after a restart', (await c.send('container')).includes(` 0:${diamond}:5`), await c.send('container'));
	await rcon('give Tester minecraft:diamond 3');
	await sleep(500);
	await c.send('shift 54');
	await sleep(500);
	await closeContainer();
	await restart(true);
	await tp(8, OLD, 'east');
	await loaded(10, -60, OLD);
	await rcon('clear Tester');
	await open(10, -60, OLD);
	check('the diamonds added before a crash are there after it', (await c.send('container')).includes(` 0:${diamond}:8`), await c.send('container'));
	await closeContainer();

	// Breaking a storage piece drops what it holds.
	await rcon('kill @e[type=item]');
	await c.send(`dig 10 -60 ${OLD}`);
	await sleep(800);
	check('breaking the counter removes it', (await count(display(10, -60, OLD))) === 0 && !(await barrier(10, -60, OLD)));
	check('and drops its 8 diamonds', (await count(`@e[type=item,x=10.5,y=-60,z=${OLD + 0.5},distance=..3,nbt={Item:{id:"minecraft:diamond",count:8}}]`)) === 1);

	await c.quit();
	await close();
	process.exit(summary() ? 0 : 1);
})().catch(async (error) => {
	console.error(error);
	process.exit(2);
});
