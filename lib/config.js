// Where the test server is. Every value can be overridden with the environment variable next to it.
const path = require('path');

module.exports = {
	host: process.env.MC_HOST || '127.0.0.1',
	javaPort: Number(process.env.MC_PORT || 25566),
	bedrockPort: Number(process.env.BEDROCK_PORT || 19132),
	bedrockVersion: process.env.BEDROCK_VERSION || '1.26.60',
	rconPort: Number(process.env.RCON_PORT || 25576),
	rconPassword: process.env.RCON_PASSWORD || 'testpass',
	// The test server's folder, for tests that read its files.
	serverDir: process.env.SERVER_DIR || path.join(__dirname, '..', 'server'),
	// For tests that restart the server: a command that stops it if it runs, starts it and returns once it's up, given
	// a log file name; and the server jar's name, to kill it by.
	restartScript: process.env.RESTART_SCRIPT || '',
	serverJar: process.env.SERVER_JAR || 'leaf-26.3-9.jar',
	javaClient: path.join(__dirname, '..', 'java-client', 'build', 'install', 'testclient', 'bin', process.platform === 'win32' ? 'testclient.bat' : 'testclient'),
};
