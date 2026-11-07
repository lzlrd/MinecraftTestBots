// Joins as a Bedrock player and reports whether the server keeps the player connected for 20 seconds.
// Exits 0 when the player stays, 1 when kicked (the reason is printed) and 2 when no session could be made.
const { sleep } = require('../../lib/common');
const { createClient, spawned } = require('../../lib/bedrock');

(async () => {
	for (let attempt = 1; attempt <= 5; attempt++) {
		let kicked = null;
		let broken = false;
		const client = createClient();
		client.on('kick', (packet) => { kicked = packet.message; });
		client.on('error', () => { broken = true; });
		const joined = await spawned(client);
		for (let i = 0; i < 20 && !kicked; i++) await sleep(1000);
		try { client.close(); } catch {}
		if (kicked) {
			console.log('KICKED:', kicked);
			process.exit(1);
		}
		if (joined && !broken) {
			console.log('STAYED CONNECTED for 20 s');
			process.exit(0);
		}
		console.log(`attempt ${attempt}: the session broke on the client side, retrying`);
		await sleep(3000);
	}
	console.log('INCONCLUSIVE');
	process.exit(2);
})();
