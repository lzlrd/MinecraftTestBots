// Checks Geyser serves the furniture to Bedrock players: FurnitureResource's pack is offered, and furniture, the first
// pieces and those from Paladin's Furniture alike, arrives as its custom item with its name.
// Needs CutebearFurniture, and FurnitureResource's cutebear_furniture.mcpack and cutebear_furniture.json in Geyser's
// packs and custom_mappings folders under SERVER_DIR.
const fs = require('fs');
const path = require('path');
const config = require('../../lib/config');
const { rcon, check, summary, close, sleep } = require('../../lib/common');
const { session, end } = require('../../lib/bedrock');

// What the stonecutter makes: the plugin names each piece and drops the potato's food component.
const PIECES = {
	chair: 'Oak Chair',
	white_simple_sofa: 'Simple White Sofa',
	light_switch: 'Light Switch',
	simple_light: 'Simple Ceiling Light',
	oak_red_simple_bed: 'Oak Red Simple Bed',
	basic_red_oak_lamp: 'Basic Red Oak Lamp',
	stripped_oak_chair: 'Stripped Oak Chair',
	granite_kitchen_counter: 'Granite Kitchen Counter',
	dark_concrete_kitchen_counter_oven: 'Dark Concrete Kitchen Oven',
};
const item = (id, name) => `minecraft:poisonous_potato[minecraft:item_model="cutebear_furniture:${id}",minecraft:custom_name="${name}",!minecraft:consumable]`;

(async () => {
	// Geyser offers a pack by UUID and size; FurnitureResource gives each build a new UUID, so the size identifies it.
	const pack = fs.statSync(path.join(config.serverDir, 'plugins', 'Geyser-Spigot', 'packs', 'cutebear_furniture.mcpack')).size;
	let got = null;
	for (let attempt = 1; attempt <= 6 && !got; attempt++) {
		const s = await session();
		if (attempt === 1) check('Geyser offers the furniture pack', s.packs.some((p) => p.size === pack), `${pack} bytes in ${JSON.stringify(s.packs)}`);
		await rcon('clear BedrockBot');
		await sleep(500);
		s.received.length = 0;
		for (const [id, name] of Object.entries(PIECES)) await rcon(`give BedrockBot ${item(id, name)}`);
		await sleep(2000);
		if (!s.broken && s.received.length) got = [...s.received];
		await end(s);
	}
	console.log('  Bedrock received:', JSON.stringify(got));
	for (const [id, name] of Object.entries(PIECES)) {
		const piece = (got || []).find((d) => d.name === `cutebear_furniture:${id}`);
		check(`${id} reaches Bedrock as cutebear_furniture:${id}`, !!piece);
		check(`${id} keeps its name`, !!piece && (piece.displayName || '').includes(name), piece ? piece.displayName : '');
	}
	await close();
	process.exit(summary() ? 0 : 1);
})().catch((error) => {
	console.error(error);
	process.exit(2);
});
