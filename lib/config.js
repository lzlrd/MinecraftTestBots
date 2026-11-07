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
	javaClient: path.join(__dirname, '..', 'java-client', 'build', 'install', 'testclient', 'bin', process.platform === 'win32' ? 'testclient.bat' : 'testclient'),
};
