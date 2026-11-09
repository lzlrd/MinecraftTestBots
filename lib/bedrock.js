// Bedrock players for the test server, joining through Geyser with bedrock-protocol.
// The JavaScript RakNet client occasionally fails decryption under Geyser's join burst, so sessions are retried, and
// a late decryption error from a session that already closed is ignored.
const bedrock = require('bedrock-protocol');
const config = require('./config');
const { sleep } = require('./common');

process.on('uncaughtException', (error) => {
	if (/Checksum mismatch/.test(error.message)) return;
	console.error(error);
	process.exit(2);
});

// Geyser must run with auth-type offline and validate-bedrock-login false for these offline logins.
function createClient(username = 'BedrockBot') {
	return bedrock.createClient({
		host: config.host, port: config.bedrockPort, username, offline: true, version: config.bedrockVersion,
		raknetBackend: 'jsp-raknet', useRaknetWorkers: false, skipPing: true, connectTimeout: 60000,
	});
}

// Resolves true once the client spawns, false if it closes or takes over a minute.
function spawned(client) {
	return new Promise((resolve) => {
		const timer = setTimeout(() => resolve(false), 60000);
		client.once('spawn', () => (clearTimeout(timer), resolve(true)));
		client.once('close', () => (clearTimeout(timer), resolve(false)));
	});
}

// The item's Bedrock name, metadata, count and display name, or null for an empty slot.
function describe(items, item) {
	if (!item || !item.network_id) return null;
	const nbt = item.extra && item.extra.nbt && item.extra.nbt.nbt ? item.extra.nbt.nbt : null;
	const display = nbt && nbt.value && nbt.value.display ? nbt.value.display.value : null;
	return {
		name: items.get(item.network_id) || `#${item.network_id}`,
		metadata: item.metadata,
		count: item.count,
		displayName: display && display.Name ? display.Name.value : null,
	};
}

// Joins, waits out the join burst and returns the session: offered packs, custom blocks, every item Geyser sends
// to the inventory in `received`, and the names of players (skull entities included) it spawns in `players`.
// Retries a session that breaks.
async function session(username = 'BedrockBot') {
	for (let attempt = 1; attempt <= 6; attempt++) {
		const s = { items: new Map(), received: [], players: [], packs: [], customBlocks: [], broken: false, health: 20 };
		const client = createClient(username);
		s.client = client;
		client.on('error', (error) => { s.broken = true; console.log(`  (session ${attempt} broke: ${error.message})`); });
		client.on('close', () => { s.broken = true; });
		client.on('resource_packs_info', (p) => { s.packs = p.texture_packs.map((t) => ({ uuid: t.uuid, size: Number(t.size) })); });
		client.on('start_game', (p) => {
			s.entityId = p.runtime_entity_id;
			s.position = p.player_position;
			s.customBlocks = (p.block_properties || []).map((b) => b.name);
			for (const i of p.itemstates || []) s.items.set(i.runtime_id, i.name);
		});
		client.on('item_registry', (p) => { for (const i of p.itemstates || []) s.items.set(i.runtime_id, i.name); });
		client.on('inventory_slot', (p) => { const d = describe(s.items, p.item); if (d) s.received.push(d); });
		client.on('inventory_content', (p) => { for (const i of p.input || []) { const d = describe(s.items, i); if (d) s.received.push(d); } });
		client.on('move_player', (p) => { if (String(p.runtime_id) === String(s.entityId)) s.position = p.position; });
		client.on('add_player', (p) => s.players.push(p.username));
		client.on('update_attributes', (p) => { for (const a of p.attributes || []) if (a.name === 'minecraft:health') s.health = a.current; });
		client.on('respawn', (p) => { if (p.state !== 2) client.write('respawn', { position: p.position, state: 2, runtime_entity_id: s.entityId }); });
		const joined = await spawned(client);
		if (joined) await sleep(6000);
		if (joined && !s.broken) return s;
		try { client.close(); } catch {}
		await sleep(3000);
	}
	throw new Error('could not get a stable Bedrock session');
}

// bedrock-protocol reads UUIDs in resource_packs_info with each 8-byte half reversed; this turns a pack's manifest UUID
// into that form so the two can be compared.
function wireUuid(uuid) {
	const hex = uuid.replace(/-/g, '');
	const flip = (half) => half.match(/../g).reverse().join('');
	const out = flip(hex.slice(0, 16)) + flip(hex.slice(16));
	return `${out.slice(0, 8)}-${out.slice(8, 12)}-${out.slice(12, 16)}-${out.slice(16, 20)}-${out.slice(20)}`;
}

// Sends the player_auth_input packet a real client sends every tick, standing still, until the session ends. Geyser
// only draws placed heads that aren't custom skulls once it has had a position from the player.
function stand(s) {
	let tick = 0n;
	s.stander = setInterval(() => {
		if (!s.position || s.broken) return;
		try {
			s.client.write('player_auth_input', {
				pitch: 0, yaw: 0, position: s.position, move_vector: { x: 0, z: 0 }, head_yaw: 0,
				input_data: [], input_mode: 'mouse', play_mode: 'normal', interaction_model: 'crosshair',
				interact_rotation: { x: 0, z: 0 }, tick: tick++, delta: { x: 0, y: 0, z: 0 },
				transaction: undefined, item_stack_request: undefined, block_action: undefined,
				vehicle_rotation: undefined, predicted_vehicle: undefined,
				analogue_move_vector: { x: 0, z: 0 }, camera_orientation: { x: 0, y: 0, z: 1 }, raw_move_vector: { x: 0, z: 0 },
			});
		} catch (error) {
			console.log(`  (player_auth_input failed: ${error.message})`);
			clearInterval(s.stander);
		}
	}, 50);
}

async function end(s) {
	clearInterval(s.stander);
	try { s.client.close(); } catch {}
	await sleep(3000);
}

module.exports = { createClient, spawned, session, stand, end, wireUuid };
