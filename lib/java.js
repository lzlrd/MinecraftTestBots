// Drives the native 26.3 test client (java-client, built on MCProtocolLib) over stdin and stdout.
// Build it first with ./gradlew installDist in java-client/. It needs JDK 25 on JAVA_HOME or PATH.
const { spawn } = require('child_process');
const readline = require('readline');
const config = require('./config');

class Client {
	constructor(name, port = config.javaPort) {
		this.proc = spawn(config.javaClient, [name, String(port), config.host]);
		this.replies = [];
		this.events = [];
		this.eventWaiters = [];
		readline.createInterface({ input: this.proc.stdout }).on('line', (line) => this.onLine(line));
		readline.createInterface({ input: this.proc.stderr }).on('line', (line) => {
			if (!/JAVA_TOOL_OPTIONS|SLF4J/.test(line)) console.log('[client err]', line);
		});
	}

	onLine(line) {
		if (/^(LOGIN|TELEPORT|DISCONNECTED|DIED|RESPAWNED|OPENED|CLOSED)/.test(line)) {
			this.events.push(line);
			if (line.startsWith('DISCONNECTED')) console.log('[client]', line);
			this.eventWaiters = this.eventWaiters.filter((waiter) => !(waiter.pattern.test(line) && (waiter.resolve(line), true)));
			return;
		}
		const reply = this.replies.shift();
		if (reply) reply(line);
	}

	send(command) {
		return new Promise((resolve) => {
			this.replies.push(resolve);
			this.proc.stdin.write(command + '\n');
		});
	}

	waitFor(pattern, timeout = 15000) {
		const seen = this.events.find((line) => pattern.test(line));
		if (seen) return Promise.resolve(seen);
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error('timed out waiting for ' + pattern)), timeout);
			this.eventWaiters.push({ pattern, resolve: (line) => (clearTimeout(timer), resolve(line)) });
		});
	}

	async entities(type) {
		const reply = await this.send(`entities ${type}`);
		return reply
			.split(' ')
			.slice(1)
			.map((entry) => {
				const [id, pos] = entry.split(':');
				const [x, y, z] = pos.split(',').map(Number);
				return { id: Number(id), x, y, z };
			});
	}

	async quit() {
		if (this.proc.exitCode !== null || this.proc.signalCode !== null) return;
		const exited = new Promise((resolve) => this.proc.once('exit', resolve));
		this.proc.stdin.write('quit\n');
		await exited;
	}
}

module.exports = { Client };
