// Checks From the Fog works for Bedrock players: Geyser offers the sounds pack, passes a jump scare sound on under its
// Java name, shows sinister sign text from the locale overrides, and shows a mannequin Herobrine as a player.
// Needs the From the Fog datapack, and from_the_fog.mcpack and the merged overrides from GeyserPacks in Geyser's folder.
const { rcon, check, summary, close, sleep } = require('../../lib/common');
const { session, end, wireUuid } = require('../../lib/bedrock');

const PACK_UUID = 'be0a92b9-169c-4652-b538-db9e6eaacffc';
const SOUND = 'lunareclipse.watching:events.sudden_scare.jumpscare';
const SIGN_TEXT = "I'm watching...";

(async () => {
	let sounds = [], signs = [], players = [], packs = [];
	for (let attempt = 1; attempt <= 4; attempt++) {
		const s = await session();
		packs = s.packs;
		sounds = [], signs = [], players = [];
		s.client.on('play_sound', (p) => sounds.push(p.name));
		s.client.on('block_entity_data', (p) => {
			const front = p.nbt && p.nbt.value && p.nbt.value.FrontText;
			if (front) signs.push(front.value.Text.value);
		});
		s.client.on('add_player', (p) => players.push(p.username));
		await rcon(`execute as BedrockBot at @s run playsound ${SOUND} ambient @s ~ ~ ~`);
		const lines = [1, 2, 3, 4].map((n) => `{"translate":"sinister_signs.local.message.1.line${n}"}`).join(',');
		await rcon(`execute at BedrockBot run setblock ~2 ~1 ~ minecraft:oak_sign{front_text:{messages:[${lines}]}}`);
		await rcon('execute at BedrockBot positioned ~-2 ~ ~ run function lunareclipse.watching:sightings/models/mannequin/summon {yaw:0,pitch:0}');
		await sleep(3000);
		const broken = s.broken;
		await rcon('kill @e[type=minecraft:mannequin]');
		await rcon('execute at BedrockBot run setblock ~2 ~1 ~ minecraft:air');
		await end(s);
		if (!broken) break;
	}
	check('Geyser offers the From the Fog pack', packs.some((p) => p.uuid === PACK_UUID || p.uuid === wireUuid(PACK_UUID)), JSON.stringify(packs.map((p) => p.uuid)));
	check('the jump scare reaches Bedrock under its Java name', sounds.includes(SOUND), JSON.stringify(sounds));
	check('a sinister sign shows its text, not its translation keys', signs.some((text) => text.includes(SIGN_TEXT)), JSON.stringify(signs));
	check('a mannequin Herobrine reaches Bedrock as a player', players.length > 0, JSON.stringify(players));
	await close();
	process.exit(summary() ? 0 : 1);
})().catch((error) => {
	console.error(error);
	process.exit(2);
});
