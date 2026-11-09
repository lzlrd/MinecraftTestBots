// Checks Bedrock players climb CutebearFurniture 1.10's bunk ladders: they are shown a vanilla ladder, facing the same
// way, in each ladder's block, both for a ladder that was there when they joined and for one placed while they play,
// and lose it when the ladder breaks. Needs Floodgate, as on the real server, so the plugin can tell the Bedrock player
// apart. Works along z = 100.
const { rcon, check, summary, close, sleep } = require('../../lib/common');
const { createClient, spawned } = require('../../lib/bedrock');
const { Client } = require('../../lib/java');

const item = (model) => `minecraft:poisonous_potato[minecraft:item_model="cutebear_furniture:${model}"]`;
const Z = 100;

// The runtime IDs the Bedrock player has been sent for each block position, newest last, whether one at a time or
// several to a sub-chunk at once. Layer 1 holds water in a block, and Geyser updates it alongside, so only layer 0
// counts.
function watch(client) {
	const blocks = new Map();
	const add = (position, id) => {
		const key = `${position.x},${position.y},${position.z}`;
		blocks.set(key, [...(blocks.get(key) || []), id]);
	};
	client.on('update_block', (p) => { if (p.layer === 0) add(p.position, p.block_runtime_id); });
	client.on('update_subchunk_blocks', (p) => { for (const b of p.blocks || []) add(b.position, b.runtime_id); });
	return blocks;
}

const seen = (blocks, x) => blocks.get(`${x},-60,${Z}`) || [];
const last = (blocks, x) => seen(blocks, x).at(-1);

// Hangs a bunk ladder on the north side of a stone block, as the Java player.
async function hang(tester, model, x) {
	await rcon(`setblock ${x} -60 ${Z + 1} minecraft:stone`);
	await rcon(`tp Tester ${x + 0.5} -60 ${Z - 2}.5 0 30`);
	await sleep(800);
	await rcon('clear Tester');
	await rcon(`give Tester ${item(model)} 1`);
	await sleep(400);
	await tester.send(`useon ${x} -60 ${Z + 1} NORTH`);
	await sleep(1500);
}

(async () => {
	const tester = new Client('Tester');
	await tester.waitFor(/^LOGIN/, 60000);
	await sleep(2000);
	await rcon('gamemode survival Tester');
	await rcon(`tp Tester 20.5 -60 ${Z - 4}.5`);
	await sleep(1000);
	await rcon(`fill 0 -60 ${Z - 3} 40 -55 ${Z + 3} minecraft:air`);
	await rcon(`kill @e[type=!player,x=0,y=-64,z=${Z - 3},dx=40,dy=10,dz=6]`);
	await hang(tester, 'oak_simple_bunk_ladder', 10);
	const placed = (await rcon(`execute if block 10 -60 ${Z} minecraft:structure_void`)).includes('passed');
	check('the Java player hung a ladder before the Bedrock player joins', placed);
	await rcon(`tp Tester 20.5 -60 ${Z - 4}.5`);

	let client = null;
	let blocks = null;
	for (let attempt = 1; attempt <= 6 && !client; attempt++) {
		const candidate = createClient('BedrockBot');
		const watched = watch(candidate);
		if (await spawned(candidate)) {
			client = candidate;
			blocks = watched;
		} else {
			try { candidate.close(); } catch {}
			await sleep(3000);
		}
	}
	if (!client) throw new Error('could not join as BedrockBot');
	await rcon(`tp BedrockBot 20.5 -60 ${Z - 4}.5`);
	await sleep(6000);

	// A vanilla ladder facing north, as the bunk ladders do, to learn its Bedrock ID.
	await rcon(`setblock 30 -60 ${Z + 1} minecraft:stone`);
	await rcon(`setblock 30 -60 ${Z} minecraft:ladder[facing=north]`);
	await sleep(1500);
	const ladder = last(blocks, 30);
	check('Bedrock is sent the vanilla ladder', ladder !== undefined, String(ladder));

	check('a bunk ladder that was there at join shows as a vanilla ladder', last(blocks, 10) === ladder, JSON.stringify(seen(blocks, 10)));

	await hang(tester, 'birch_simple_bunk_ladder', 20);
	check('a bunk ladder placed now shows as a vanilla ladder', last(blocks, 20) === ladder, JSON.stringify(seen(blocks, 20)));

	const before = seen(blocks, 20).length;
	const hit = (await tester.entities('interaction')).find((e) => Math.abs(e.x - 20.5) < 0.1 && Math.abs(e.z - (Z + 0.5)) < 0.1);
	await tester.send(`attack ${hit ? hit.id : -1}`);
	await sleep(1500);
	check('breaking it takes the ladder away for Bedrock', seen(blocks, 20).length > before && last(blocks, 20) !== ladder, JSON.stringify(seen(blocks, 20)));

	await tester.quit();
	try { client.close(); } catch {}
	await close();
	process.exit(summary() ? 0 : 1);
})().catch((error) => {
	console.error(error);
	process.exit(2);
});
