const { sleep } = require('../../lib/common');
const { Client } = require('../../lib/java');
(async () => {
	const c = new Client(process.argv[2] || 'Tester');
	await c.waitFor(/^LOGIN/);
	await sleep(10000);
	const gone = c.events.find((l) => l.startsWith('DISCONNECTED'));
	console.log(gone ? 'JAVA CLIENT ' + gone.slice(0, 300) : 'Java client stayed connected for 10 s');
	if (!gone) await c.quit();
	process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(2); });
