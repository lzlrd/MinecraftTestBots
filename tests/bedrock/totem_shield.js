// Checks Geyser serves the Totem Shield to Bedrock players: the pack is offered, and a Totem Shield arrives as the
// totem_shield:shield custom item while a plain shield stays a shield.
const { rcon, check, summary, close, sleep } = require('../../lib/common');
const { session, end, wireUuid } = require('../../lib/bedrock');

const PACK_UUID = 'b37c9e90-432c-4370-bf4d-72cde8790631';
const TOTEM_SHIELD = 'minecraft:shield[minecraft:item_name="Totem Shield",minecraft:rarity="rare",minecraft:item_model="totem_shield:totem_shield",minecraft:death_protection={}]';

(async () => {
	let got = null;
	for (let attempt = 1; attempt <= 6 && !got; attempt++) {
		const s = await session();
		if (attempt === 1) check('Geyser offers the Totem Shield pack', s.packs.some((p) => p.uuid === PACK_UUID || p.uuid === wireUuid(PACK_UUID)), JSON.stringify(s.packs.map((p) => p.uuid)));
		await rcon('clear BedrockBot');
		await sleep(500);
		s.received.length = 0;
		await rcon(`give BedrockBot ${TOTEM_SHIELD}`);
		await rcon('give BedrockBot minecraft:shield');
		await sleep(2000);
		if (!s.broken && s.received.length) got = [...s.received];
		await end(s);
	}
	console.log('  Bedrock received:', JSON.stringify(got));
	check('a Totem Shield reaches Bedrock as totem_shield:shield', !!got && got.some((d) => d.name === 'totem_shield:shield'));
	check('a plain shield stays a shield', !!got && got.some((d) => d.name === 'minecraft:shield'));
	await close();
	process.exit(summary() ? 0 : 1);
})().catch((error) => {
	console.error(error);
	process.exit(2);
});
