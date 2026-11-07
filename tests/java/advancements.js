// Grants a player every advancement, then checks the player can still join (the advancement packet grows with progress).
const { rcon, close, sleep } = require('../../lib/common');
const { Client } = require('../../lib/java');
(async () => {
	let c = new Client('Tester');
	await c.waitFor(/^LOGIN/);
	await sleep(2000);
	console.log('grant:', (await rcon('advancement grant Tester everything')).slice(0, 120));
	await sleep(3000);
	await c.quit();
	await sleep(2000);
	c = new Client('Tester');
	await c.waitFor(/^LOGIN/);
	await sleep(8000);
	const gone = c.events.some((l) => l.startsWith('DISCONNECTED'));
	console.log(gone ? 'JAVA CLIENT DISCONNECTED after rejoin' : 'Java client stayed connected after rejoin with every advancement done');
	await c.quit();
	await close();
	process.exit(0);
})().catch((e) => { console.error(e); process.exit(2); });
