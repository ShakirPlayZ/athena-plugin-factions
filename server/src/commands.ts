import * as alt from 'alt-server';
import * as Athena from '@AthenaServer/api';
import { FACTION_EVENTS } from '../../shared/factionEvents';
import { FactionFuncs } from './funcs';
import { FactionHandler } from './handler';
import { FactionPlayerFuncs } from './playerFuncs';

const lastInvite: { [character: string]: string } = {};

/**
 * It creates a new faction.
 * @param player - alt.Player - The player who created the faction.
 * @param {string[]} name - The name of the faction.
 * @returns The result of the add function.
 */
Athena.systems.messenger.commands.register(
    'fcreate',
    '/fcreate [type: (Neutral, State, Gang)] [name] - Open faction panel if in faction.',
    ['admin'],
    async (player: alt.Player, type: string, ...name: string[]) => {
        const playerData = Athena.document.character.get(player);
        const factionName = name.join(' ');
        if (!playerData._id) {
            Athena.player.emit.message(player, 'playerData._id is: ' + playerData._id);
            return;
        }
        const result = await FactionHandler.add(playerData._id, {
            bank: 0,
            canDisband: true,
            name: factionName,
            type: type.toUpperCase(),
        });

        if (!result.status) {
            Athena.player.emit.message(player, result.response);
            return;
        }

        const id = result.response;
        Athena.player.emit.message(player, `Created Faction with ID: ${id}`);
    },
);

Athena.systems.messenger.commands.register(
    'fadmincreate',
    '/fadmincreate [type: (Neutral, State, Gang)] [ownerId] [name] - Create faction for playerId.',
    ['admin'],
    async (player: alt.Player, type: string, ownerId: any, ...name: string[]) => {
        const factionName = name.join(' ');

        const target = Athena.systems.identifier.getPlayer(ownerId);
        if (!target) {
            Athena.player.emit.message(player, 'Cannot find player with that ID.');
            return;
        }

        const result = await FactionHandler.add(target.id.toString(), {
            bank: 0,
            canDisband: true,
            name: factionName,
            type: type.toUpperCase(),
        });

        if (!result.status) {
            Athena.player.emit.message(player, result.response);
            return;
        }

        const id = result.response;
        Athena.player.emit.message(player, `Created Faction with ID: ${id}`);
    },
);

Athena.systems.messenger.commands.register(
    'fopen',
    '/fopen - Open faction panel if in faction.',
    [],
    (player: alt.Player) => {
        const playerData = Athena.document.character.get(player);
        if (!playerData.faction) {
            Athena.player.emit.message(player, 'You are not in a faction.');
            return;
        }

        const faction = FactionHandler.get(playerData.faction);
        if (!faction) {
            Athena.player.emit.message(player, 'You are not in a faction.');
            return;
        }

        alt.emitClient(player, FACTION_EVENTS.PROTOCOL.OPEN, faction);
    },
);

Athena.systems.messenger.commands.register(
    'fjoin',
    '/fjoin [uid] - Quits Current Faction & Joins Another',
    ['admin'],
    async (player: alt.Player, uid: string) => {
        const playerData = Athena.document.character.get(player);
        if (!uid) {
            Athena.player.emit.message(player, `You must specify a faction UID to join.`);
            return;
        }

        const faction = FactionHandler.get(uid);
        if (!faction) {
            Athena.player.emit.message(player, `That faction does not exist.`);
            return;
        }

        if (playerData.faction) {
            const currentFaction = FactionHandler.get(playerData.faction);
            if (currentFaction) {
                await FactionFuncs.kickMember(currentFaction, playerData._id);
            }
        }

        FactionFuncs.addMember(faction, playerData._id);
        Athena.player.emit.message(player, `Moved to Faction: ${faction.name}`);
    },
);

Athena.systems.messenger.commands.register(
    'finvite',
    '/finvite [id] - Invite to faction',
    [],
    (player: alt.Player, playerId: any) => {
        const playerData = Athena.document.character.get(player);
        const faction = FactionHandler.get(playerData.faction);
        if (!faction) {
            Athena.player.emit.message(player, `You are not in a faction.`);
            return;
        }

        const rank = FactionPlayerFuncs.getPlayerFactionRank(player);
        if (!rank) {
            Athena.player.emit.message(player, `You have no rank in the faction?`);
            return;
        }

        if (!rank.rankPermissions.addMembers) {
            Athena.player.emit.message(player, `No permission to invite members to faction.`);
            return;
        }

        if (isNaN(playerId)) {
            Athena.player.emit.message(player, `ID is not a number`);
            return;
        }

        let target = Athena.document.character.get(alt.Player.all.find((p) => p.id === playerId));

        if (!target || !target.data || !target.valid || target === playerData) {
            Athena.player.emit.message(player, `/finvite [id]`);
            return;
        }

        if (target.data.faction) {
            Athena.player.emit.message(player, `${target.data.name} is already in a faction.`);
            return;
        }

        lastInvite[target.data._id] = playerData.faction;
        Athena.player.emit.message(player, `${target.data.name} was invited to the faction.`);
        Athena.player.emit.message(target.player, `${playerData.name} invited you to faction ${faction.name}.`);
        Athena.player.emit.message(target.player, `Type '/faccept' to join`);
    },
);

Athena.systems.messenger.commands.register(
    'faccept',
    '/faccept - Join last invited to faction',
    [],
    (player: alt.Player) => {
        const playerData = Athena.document.character.get(player);
        if (playerData.faction) {
            Athena.player.emit.message(player, `Already in a faction.`);
            delete lastInvite[playerData._id];
            return;
        }

        if (!lastInvite[playerData._id]) {
            Athena.player.emit.message(player, `Faction invite expired.`);
            delete lastInvite[playerData._id];
            return;
        }

        const faction = FactionHandler.get(lastInvite[playerData._id]);
        if (!faction) {
            Athena.player.emit.message(player, `Faction invite expired.`);
            delete lastInvite[playerData._id];
            return;
        }

        delete lastInvite[playerData._id];
        const result = FactionFuncs.addMember(faction, playerData._id);
        if (!result) {
            Athena.player.emit.message(player, `Failed to join faction.`);
            return;
        }

        Athena.player.emit.message(player, `Joined faction ${faction.name}`);
    },
);

Athena.systems.messenger.commands.register(
    'fsetowner',
    '/fsetowner <player_id> - Set a member inside a faction to the owner of their faction.',
    ['admin'],
    async (player: alt.Player, id: string) => {
        const target = Athena.systems.identifier.getPlayer(id);
        const targetData = Athena.document.character.get(alt.Player.all.find((p) => p.id === target.id));
        if (!target) {
            Athena.player.emit.message(player, 'Cannot find player with that ID.');
            return;
        }

        const faction = FactionHandler.get(targetData.faction);
        if (!faction) {
            Athena.player.emit.message(player, `Target player is not in a faction.`);
            return;
        }

        const didUpdate = await FactionFuncs.setOwner(faction, targetData._id.toString());
        if (!didUpdate) {
            Athena.player.emit.message(player, `${targetData.name} could not be set the owner of ${faction.name}.`);
            return;
        }

        Athena.player.emit.message(player, `${targetData.name} was set to owner of ${faction.name}`);
    },
);

export class FactionCommands {
    static init() {
        // leave empty
    }
}
