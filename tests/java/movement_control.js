const { rcon, close, sleep, check, summary } = require('../../lib/common');
const { Client } = require('../../lib/java');
(async () => {
	const c = new Client('Tester');
	await c.waitFor(/^LOGIN/);
	await sleep(2000);
	await rcon('tp Tester 18.5 -60 -0.5 -90 0');
	await sleep(600);
	await c.send('move 19.3 -60 -0.5');
	await sleep(800);
	const pos = await rcon('data get entity Tester Pos[0]');
	const x = Number((pos.match(/(-?[\d.]+)d/) || [])[1]);
	check('control: the same move with no barrier is accepted', Math.abs(x - 19.3) < 0.05, `x=${x}`);
	await c.quit(); await close(); process.exit(summary() ? 0 : 1);
})();
