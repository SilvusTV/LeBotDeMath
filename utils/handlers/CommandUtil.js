const { ApplicationCommandType } = require("discord.js");
const { promisify } = require('util');
const { glob } = require('glob');
const pGlob = promisify(glob);
const Logger = require('../Logger');

module.exports = async (client) => {
    const isDist = __dirname.includes('dist');
    const base = isDist ? 'dist' : '.';
    const ext = isDist ? 'js' : 'ts';
    const pattern = `${process.cwd()}/${base}/commands/*/*.${ext}`;

    const files = await pGlob(pattern);
    for (const cmdFile of files) {
        let cmd;
        try {
            const raw = require(cmdFile);
            cmd = raw?.default ?? raw;
        } catch (e) {
            Logger.error(`failed to require command ${cmdFile}: ${e?.message || e}`);
            continue;
        }

        if (!cmd.name) {
            Logger.warn(`no command name : ${cmdFile}`);
            continue;
        }

        if (!cmd.description && cmd.type !== ApplicationCommandType.User) {
            Logger.warn(`no command description : ${cmdFile}`);
            continue;
        }

        if (!cmd.category) {
            Logger.warn(`no command category : ${cmdFile}`);
            continue;
        }

        if (cmd.ownerOnly === undefined) {
            Logger.warn(`no command ownerOnly : ${cmdFile}`);
            continue;
        }

        if (!cmd.usage) {
            Logger.warn(`no command usage : ${cmdFile}`);
            continue;
        }

        if (!cmd.examples) {
            Logger.warn(`no command examples : ${cmdFile}`);
            continue;
        }

        client.commands.set(cmd.name, cmd);
        Logger.command(`/${cmd.name} loaded`);
    }
};
