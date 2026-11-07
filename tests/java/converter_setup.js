// Puts old Vanilla Tweaks heads everywhere the converter should find them: inventory, ender chest, a placed head near
// spawn and one in a far chunk, an item frame, a chest with a shulker box inside, plus one of Jodek's own heads.
const fs = require('fs');
const { rcon, close, sleep } = require('../../lib/common');
const { Client } = require('../../lib/java');
const fx = JSON.parse(fs.readFileSync(__dirname + '/converter_fixtures.json', 'utf8'));
const by = (n) => fx.find((f) => f.name === n);
const comps = (f) => `{"minecraft:profile":{properties:[{name:"textures",value:"${f.textures}"}]},"minecraft:item_name":"${f.name}","minecraft:note_block_sound":"${f.sound}"}`;
const block = (f) => `{profile:{properties:[{name:"textures",value:"${f.textures}"}]},note_block_sound:"${f.sound}"}`;

(async () => {
	await rcon('op Tester');
	const c = new Client('Tester');
	await c.waitFor(/^LOGIN/);
	await sleep(3000);
	await rcon('clear Tester');
	await rcon('item replace entity Tester enderchest.0 with air');
	for (const f of fx) console.log(f.name, '->', (await rcon(`give Tester ${f.spec} 2`)).trim());
	console.log('ender chest:', (await rcon(`item replace entity Tester enderchest.0 with ${by('Tabby Cat Head').spec} 1`)).trim());
	// One of Jodek's own heads with a face Vanilla Tweaks also used: it must stay exactly as it is.
	await rcon('data modify storage mob_heads:root data.pig set value 1.0');
	await rcon('kill @e[type=pig]');
	await rcon('summon minecraft:pig 2.5 -60 30.5 {NoAI:1b,Silent:1b,variant:"minecraft:warm",Tags:["vt"]}');
	await sleep(300);
	console.log('jodek pig:', (await rcon('execute as Tester run loot give Tester kill @e[type=pig,tag=vt,limit=1]')).trim());
	await rcon('kill @e[type=pig]');
	await rcon('fill 28 -60 28 40 -57 34 minecraft:air');
	console.log('placed near:', (await rcon(`setblock 30 -60 30 minecraft:player_head${block(by('Temperate Cow Head'))}`)).trim());
	await rcon('forceload add 600 600');
	await sleep(1500);
	console.log('placed far:', (await rcon(`setblock 600 -60 600 minecraft:player_head${block(by('Tabby Cat Head'))}`)).trim());
	await rcon('forceload remove 600 600');
	await rcon('setblock 33 -60 31 minecraft:stone');
	console.log('frame:', (await rcon(`summon minecraft:item_frame 33 -60 30 {Facing:2b,Item:{id:"minecraft:player_head",count:1,components:${comps(by('Charged Creeper Head'))}}}`)).trim());
	console.log('chest:', (await rcon(`setblock 36 -60 30 minecraft:chest{Items:[{Slot:0b,id:"minecraft:player_head",count:3,components:${comps(by('Temperate Cow Head'))}},{Slot:1b,id:"minecraft:shulker_box",count:1,components:{"minecraft:container":[{slot:0,item:{id:"minecraft:player_head",count:1,components:${comps(by('Zombie Mason Head'))}}}]}}]}`)).trim());
	// A Jodek temperate cow head to compare the converted one against.
	await rcon('data modify storage mob_heads:root data.cow set value 1.0');
	await rcon('kill @e[type=cow]');
	await rcon('summon minecraft:cow 2.5 -60 30.5 {NoAI:1b,Silent:1b,variant:"minecraft:temperate",Tags:["vt"]}');
	await sleep(300);
	await rcon('setblock 38 -60 30 minecraft:chest');
	console.log('jodek cow:', (await rcon('execute as Tester run loot insert 38 -60 30 kill @e[type=cow,tag=vt,limit=1]')).trim());
	await rcon('kill @e[type=cow]');
	await sleep(500);
	await c.quit();
	await rcon('save-all flush');
	await sleep(1500);
	await close();
	process.exit(0);
})().catch((e) => { console.error(e); process.exit(2); });
