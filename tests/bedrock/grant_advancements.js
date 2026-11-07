// Grants the Bedrock player every advancement, which makes the advancement packet as large as it gets. Run join.js
// afterwards to check the player can still join.
const { rcon, close, sleep } = require('../../lib/common');
const { createClient, spawned } = require('../../lib/bedrock');

(async () => {
	for (let attempt = 1; attempt <= 6; attempt++) {
		const client = createClient();
		client.on('error', () => {});
		if (!(await spawned(client))) {
			try { client.close(); } catch {}
			await sleep(3000);
			continue;
		}
		await sleep(2000);
		if (!/BedrockBot/.test(await rcon('list'))) {
			try { client.close(); } catch {}
			await sleep(3000);
			continue;
		}
		console.log('grant:', (await rcon('advancement grant BedrockBot everything')).slice(0, 100));
		await sleep(3000);
		try { client.close(); } catch {}
		await close();
		process.exit(0);
	}
	console.log('could not get the Bedrock player online');
	await close();
	process.exit(2);
})();
