// Gives the Bedrock player a head with one skin and checks Geyser sends it as that skin's custom skull, as it does
// for skins registered by a custom skull mapping or GeyserPlayerHeads.
// Usage: node tests/bedrock/skin.js SKIN_HASH
const { rcon, check, summary, close, sleep } = require('../../lib/common');
const { session, end } = require('../../lib/bedrock');

const SKULL = 'geyser_custom:player_skull_';

(async () => {
	const hash = process.argv[2];
	if (!hash) throw new Error('usage: node tests/bedrock/skin.js SKIN_HASH');
	const textures = Buffer.from(JSON.stringify({ textures: { SKIN: { url: `http://textures.minecraft.net/texture/${hash}` } } })).toString('base64');
	let got = [];
	for (let attempt = 1; attempt <= 8 && !got.length; attempt++) {
		const s = await session();
		await rcon('clear BedrockBot');
		await sleep(500);
		s.received.length = 0;
		console.log('> give:', (await rcon(`give BedrockBot minecraft:player_head[minecraft:profile={properties:[{name:"textures",value:"${textures}"}]}] 1`)).trim());
		await sleep(2000);
		if (!s.broken) got = [...s.received];
		await end(s);
	}
	console.log('  Bedrock received:', JSON.stringify(got));
	check(`a head with skin ${hash.slice(0, 12)} reaches Bedrock as its custom skull`, got.some((d) => d.name === SKULL + hash));
	await close();
	process.exit(summary() ? 0 : 1);
})().catch((error) => {
	console.error(error);
	process.exit(2);
});
