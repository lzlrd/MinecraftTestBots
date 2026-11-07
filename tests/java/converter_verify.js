// Checks MobHeadsConverter turned every old Vanilla Tweaks head into the right Jodek head, left unmatched heads alone,
// and that a converted head is identical to one Jodek's loot table drops. Uses item predicates, because RCON cuts long
// outputs short.
const fs = require('fs');
const { rcon, check, summary, close, sleep } = require('../../lib/common');
const { Client } = require('../../lib/java');
const fx = JSON.parse(fs.readFileSync(__dirname + '/converter_fixtures.json', 'utf8'));
const by = (n) => fx.find((f) => f.name === n);
const profile = (textures) => `minecraft:profile={properties:[{name:"textures",value:"${textures}"}]}`;

async function count(where, textures, extra = '') {
	const reply = await rcon(`execute if items ${where} minecraft:player_head[${profile(textures)}${extra}]`);
	const m = reply.match(/count: (\d+)/i);
	return m ? Number(m[1]) : 0;
}
// Every item has a default item_name and lore, so a predicate cannot test that they are unset; old names are counted separately.
const NEW = ',minecraft:custom_name';

(async () => {
	const c = new Client('Tester');
	await c.waitFor(/^LOGIN/);
	await sleep(3000);

	for (const f of fx) {
		if (!f.target) {
			check(`${f.name}: no Jodek match, left as it was`, (await count('entity Tester container.*', f.textures, `,minecraft:item_name="${f.name}"`)) === 2);
			continue;
		}
		const converted = await count('entity Tester container.*', f.target.textures, NEW);
		const old = await count('entity Tester container.*', f.textures, `,minecraft:item_name="${f.name}"`);
		check(`${f.name} -> ${f.target.table.replace('entities/', '')}`, converted >= 2 && old === 0, `converted ${converted}, old left ${old}`);
	}
	check('ender chest head converted', (await count('entity Tester enderchest.*', by('Tabby Cat Head').target.textures, NEW)) === 1);

	// A converted cow head and a cow head from Jodek's loot table match the same exact-component predicate.
	const cow = by('Temperate Cow Head').target;
	const tier = Number(((await rcon('scoreboard players get &cow mob_heads.rarity')).match(/has (\d+)/) || [0, 0])[1]);
	const exact = `,minecraft:custom_name=${cow.names[tier]},minecraft:note_block_sound="${cow.sound}",!minecraft:custom_data`;
	const jodekCow = await count('block 38 -60 30 container.*', cow.textures, exact);
	const mineCow = await count('entity Tester container.*', cow.textures, exact);
	check('converted cow head has exactly the components of a Jodek drop', jodekCow === 1 && mineCow === 2, `rarity tier ${tier}; Jodek drop ${jodekCow}, converted ${mineCow}`);

	const near = await rcon('data get block 30 -60 30 profile.properties[0].value');
	const nearName = await rcon('data get block 30 -60 30 custom_name');
	check('placed head near spawn converted', near.includes(by('Temperate Cow Head').target.textures) && !/no element/i.test(nearName), nearName.slice(0, 120));
	await rcon('forceload add 600 600');
	await sleep(2500);
	const far = await rcon('data get block 600 -60 600 profile.properties[0].value');
	check('placed head in a chunk loaded later converted', far.includes(by('Tabby Cat Head').target.textures));
	await rcon('forceload remove 600 600');

	check('item frame head converted', (await count('entity @e[type=item_frame,x=33,y=-60,z=30,distance=..2,limit=1] contents', by('Charged Creeper Head').target.textures, NEW)) === 1);

	check('chest untouched before anyone opens it', (await count('block 36 -60 30 container.*', by('Temperate Cow Head').textures, ',minecraft:item_name="Temperate Cow Head"')) === 3);
	await rcon('tp Tester 36.5 -60 32.5 180 30');
	await sleep(800);
	await c.send('useon 36 -60 30 SOUTH');
	await sleep(1200);
	check('chest heads converted when opened', (await count('block 36 -60 30 container.*', cow.textures, NEW)) === 3);
	const inner = await rcon('data get block 36 -60 30 Items[{Slot:1b}].components."minecraft:container"[0].item.components."minecraft:profile".properties[0].value');
	const innerName = await rcon('data get block 36 -60 30 Items[{Slot:1b}].components."minecraft:container"[0].item.components."minecraft:item_name"');
	check('head inside a shulker box in the chest converted', inner.includes(by('Zombie Mason Head').target.textures) && /no element/i.test(innerName), innerName.slice(0, 100));

	await rcon('clear Tester');
	await rcon('tp Tester 20.5 -60 20.5');
	await sleep(500);
	const mason = by('Mason Villager Head');
	await rcon(`summon minecraft:item 20.5 -59.5 20.5 {PickupDelay:10s,Item:{id:"minecraft:player_head",count:1,components:{${profile(mason.textures).replace('minecraft:profile=', '"minecraft:profile":')},"minecraft:item_name":"Mason Villager Head","minecraft:note_block_sound":"${mason.sound}"}}}`);
	await sleep(2500);
	check('picked-up head converted to the right profession', (await count('entity Tester container.*', mason.target.textures, NEW)) === 1);

	await c.quit();
	await close();
	process.exit(summary() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
