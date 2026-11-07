// Checks Bedrock players see Dungeons and Taverns' item names: its special potions are named only in its lang files,
// which reach Geyser as locale overrides, and its keys carry fallback names.
// Needs Dungeons and Taverns and the merged overrides from GeyserPacks in Geyser's folder.
const { rcon, check, summary, close, sleep } = require('../../lib/common');
const { session, end } = require('../../lib/bedrock');

(async () => {
	let got = [];
	for (let attempt = 1; attempt <= 4; attempt++) {
		const s = await session();
		await rcon('clear BedrockBot');
		await sleep(500);
		s.received.length = 0;
		await rcon('loot give BedrockBot loot nova_structures:special_items/levitation_potion');
		await rcon('give BedrockBot minecraft:trial_key[minecraft:item_name={"translate":"item.dnt.citadel_key","fallback":"Citadel Key"}]');
		await sleep(2500);
		const broken = s.broken;
		got = [...s.received];
		await end(s);
		if (!broken) break;
	}
	console.log('  Bedrock received:', JSON.stringify(got));
	const name = (item) => (got.find((d) => d.name === item) || {}).displayName || '';
	check('a special potion shows its name, not its translation key', /Potion of Levitation/.test(name('minecraft:potion')), name('minecraft:potion'));
	check('a key shows its fallback name', /Citadel Key/.test(name('minecraft:trial_key')), name('minecraft:trial_key'));
	await close();
	process.exit(summary() ? 0 : 1);
})().catch((error) => {
	console.error(error);
	process.exit(2);
});
