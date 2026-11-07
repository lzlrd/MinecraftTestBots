// Checks the Jodek packs added in November 2026: Totem Shield, Mineable Reinforced Deepslate, Sleep Anytime You Want
// with Sleep, Too Expensive Removed, Name Tag, Trident All Weather Channeling, Dragon Egg Respawns, Killer Bunny Name
// Tag and Mob Heads Powers. Run it on a superflat test server that has all of them.
const { rcon, count, check, summary, close, sleep } = require('../../lib/common');
const { Client } = require('../../lib/java');

const TOTEM_SHIELD = 'minecraft:shield[minecraft:item_name="Totem Shield",minecraft:rarity="rare",minecraft:item_model="totem_shield:totem_shield",'
	+ 'minecraft:death_protection={death_effects:[{type:"minecraft:clear_all_effects"},{type:"minecraft:apply_effects",effects:[{id:"minecraft:regeneration",amplifier:1,duration:900}]}]}]';

// True when the advancement exists; revoking one the player doesn't have still proves that.
async function hasAdvancement(id) {
	return !/Unknown|Incorrect|Can't find|not found/i.test(await rcon(`advancement revoke Tester only ${id}`));
}

async function hasRecipe(id) {
	await rcon(`recipe take Tester ${id}`);
	return /Unlocked 1 recipe/.test(await rcon(`recipe give Tester ${id}`));
}

const has = async (command) => /passed|Count: [1-9]/.test(await rcon(command));

let c;
(async () => {
	await rcon('op Tester');
	c = new Client('Tester');
	await c.waitFor(/^LOGIN/);
	await sleep(3000);
	await rcon('gamemode survival Tester');
	await rcon('weather clear');
	await rcon('fill 40 -60 40 56 -50 56 minecraft:air');
	await rcon('tp Tester 48.5 -60 48.5');
	await rcon('effect clear Tester');
	await rcon('clear Tester');
	await sleep(500);

	// Recipes and advancements that prove each pack loaded.
	check('Totem Shield recipe exists', await hasRecipe('totem_shield:totem_shield'));
	check('Name Tag recipe exists', await hasRecipe('name_tag:name_tag'));
	check('Too Expensive Removed is loaded', await hasAdvancement('too_expensive_removed:inventory_changed'));
	check('Trident All Weather Channeling is loaded', await hasAdvancement('trident_all_weather_channeling:trident_hit_entity'));
	check('Dragon Egg Respawns is loaded', await hasAdvancement('dragon_egg_respawns:killed_ender_dragon'));

	// Mineable Reinforced Deepslate: pickaxes mine it and it drops itself.
	await rcon('setblock 44 -60 44 minecraft:reinforced_deepslate');
	check('reinforced deepslate counts as pickaxe-mineable', await has('execute if block 44 -60 44 #minecraft:mineable/pickaxe'));
	const drop = await rcon('loot spawn 44 -59 44 mine 44 -60 44 minecraft:netherite_pickaxe');
	check('mining reinforced deepslate drops it', /reinforced_deepslate|Reinforced Deepslate|Dropped 1/.test(drop), drop.trim());
	await rcon('kill @e[type=item]');
	await rcon('setblock 44 -60 44 minecraft:air');

	// Totem Shield: it saves the player like a totem, then turns back into a plain shield.
	await rcon(`item replace entity Tester weapon.offhand with ${TOTEM_SHIELD}`);
	await sleep(1500);
	await rcon('damage Tester 1000 minecraft:generic');
	await sleep(1500);
	const health = Number(((await rcon('data get entity Tester Health')).match(/(-?[\d.]+)f/) || [])[1]);
	check('the Totem Shield keeps the player alive', health > 0, `health ${health}`);
	check('the player got the Totem Shield\'s regeneration', await has('execute if entity @a[name=Tester,nbt={active_effects:[{id:"minecraft:regeneration"}]}]'));
	const plain = await has('execute if items entity Tester weapon.offhand minecraft:shield');
	const stillTotem = await has('execute if items entity Tester weapon.offhand minecraft:shield[minecraft:item_model="totem_shield:totem_shield"]');
	check('the used Totem Shield becomes a plain shield', plain && !stillTotem, `shield ${plain}, still totem ${stillTotem}`);
	await rcon('clear Tester');
	await rcon('effect clear Tester');

	// Mob Heads Powers: a blaze head gives fire resistance.
	await rcon('item replace entity Tester armor.head with minecraft:player_head[minecraft:note_block_sound="minecraft:entity.blaze.ambient"]');
	await sleep(1500);
	check('wearing a blaze head gives fire resistance', await has('execute if entity @a[name=Tester,nbt={active_effects:[{id:"minecraft:fire_resistance"}]}]'));
	await rcon('item replace entity Tester armor.head with minecraft:air');
	await rcon('effect clear Tester');

	// Killer Bunny Name Tag: naming a rabbit "The Killer Bunny" makes it the killer bunny.
	await rcon('kill @e[type=rabbit]');
	await rcon('summon minecraft:rabbit 50.5 -60 48.5 {NoAI:1b,Silent:1b,Tags:["kb"]}');
	await rcon('item replace entity Tester weapon.mainhand with minecraft:name_tag[minecraft:custom_name="The Killer Bunny"]');
	await sleep(800);
	const rabbit = (await c.entities('rabbit'))[0];
	if (rabbit) await c.send(`interact ${rabbit.id}`);
	await sleep(1500);
	check('the named rabbit turns into the killer bunny', (await count('@e[type=rabbit,tag=kb,nbt={RabbitType:99}]')) === 1);
	await rcon('kill @e[type=rabbit]');

	// Name Tag: a mob a player named with a name tag drops one when a player kills it.
	await rcon('kill @e[type=item]');
	await rcon('kill @e[type=pig]');
	await rcon('summon minecraft:pig 52.5 -60 48.5 {NoAI:1b,Silent:1b,Tags:["nt"]}');
	await rcon('tp Tester 50.5 -60 48.5 -90 0');
	await rcon('item replace entity Tester weapon.mainhand with minecraft:name_tag[minecraft:custom_name="Porkchop"]');
	await sleep(800);
	const pig = (await c.entities('pig'))[0];
	if (pig) await c.send(`interact ${pig.id}`);
	await sleep(800);
	await rcon('item replace entity Tester weapon.mainhand with minecraft:netherite_sword[minecraft:enchantments={"minecraft:sharpness":5}]');
	await sleep(500);
	if (pig) {
		await c.send(`attack ${pig.id}`);
		await sleep(700);
		await c.send(`attack ${pig.id}`);
	}
	await sleep(1500);
	const tags = await count('@e[type=item,nbt={Item:{id:"minecraft:name_tag"}}]') + Number(((await rcon('clear Tester minecraft:name_tag 0')).match(/Found (\d+)/) || [0, '0'])[1]);
	check('a mob named with a name tag drops one when a player kills it', tags === 1, `${tags} name tags`);
	await rcon('kill @e[type=item]');
	await rcon('kill @e[type=pig]');
	await rcon('clear Tester');

	// Trident All Weather Channeling: a player's channeling trident calls lightning when it hits, in clear weather.
	const uuid = (await rcon('data get entity Tester UUID')).match(/\[I;[^\]]+\]/);
	await rcon('kill @e[type=lightning_bolt]');
	await rcon('summon minecraft:iron_golem 48.5 -60 52.5 {NoAI:1b,Silent:1b,Tags:["tc"]}');
	await sleep(300);
	await rcon(`summon minecraft:trident 48.5 -56 52.5 {Owner:${uuid ? uuid[0] : '[I;0,0,0,0]'},Motion:[0.0,-1.5,0.0],item:{id:"minecraft:trident",count:1,components:{"minecraft:enchantments":{"minecraft:channeling":1}}}}`);
	let lightning = false;
	for (let i = 0; i < 12 && !lightning; i++) {
		await sleep(150);
		lightning = (await count('@e[type=lightning_bolt]')) > 0;
	}
	check('a channeling trident calls lightning in clear weather', lightning);
	await rcon('kill @e[type=iron_golem]');
	await rcon('kill @e[type=trident]');

	// Sleep Anytime You Want with Sleep: a player can sleep at noon, and that skips to night.
	await rcon('time set noon');
	await rcon('setblock 46 -60 48 minecraft:red_bed[facing=east,part=foot]');
	await rcon('setblock 47 -60 48 minecraft:red_bed[facing=east,part=head]');
	await rcon('tp Tester 45.5 -60 48.5 -90 0');
	await sleep(800);
	await c.send('useon 46 -60 48 UP');
	await sleep(1000);
	const sleeping = /\[I;/.test(await rcon('data get entity Tester sleeping_pos'));
	check('a player can get into bed at noon', sleeping);
	let night = false;
	for (let i = 0; i < 20 && !night; i++) {
		await sleep(1000);
		const time = Number(((await rcon('time query day')).match(/is at (\d+)/) || [])[1]) % 24000;
		night = time >= 12500 && time < 23000;
	}
	check('sleeping during the day skips to night', night);
	await rcon('fill 46 -60 48 47 -60 48 minecraft:air');
	await rcon('time set day');

	await c.quit();
	await close();
	process.exit(summary() ? 0 : 1);
})().catch(async (error) => {
	console.error(error);
	process.exit(2);
});
