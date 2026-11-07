// Test helpers: RCON to the test server and PASS/FAIL bookkeeping.
const { Rcon } = require('rcon-client');
const config = require('./config');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let rconClient = null;
// Runs a server command and returns its reply without colour codes. Slow commands such as granting every
// advancement get two minutes.
async function rcon(command) {
	if (!rconClient) rconClient = await Rcon.connect({ host: config.host, port: config.rconPort, password: config.rconPassword, timeout: 120000 });
	const reply = await rconClient.send(command);
	return reply.replace(/§./g, '');
}

// Passes when the block at x y z is the given block.
async function isBlock(x, y, z, block) {
	return (await rcon(`execute if block ${x} ${y} ${z} ${block}`)).includes('passed');
}

async function count(selector) {
	const reply = await rcon(`execute if entity ${selector}`);
	const match = reply.match(/Count: (\d+)/);
	return match ? Number(match[1]) : 0;
}

const results = [];
function check(name, ok, detail = '') {
	results.push({ name, ok });
	console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' (' + detail + ')' : ''}`);
}

function summary() {
	const failed = results.filter((r) => !r.ok);
	console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
	return failed.length === 0;
}

async function close() {
	if (rconClient) await rconClient.end();
	rconClient = null;
}

module.exports = { rcon, isBlock, count, check, summary, close, sleep };
