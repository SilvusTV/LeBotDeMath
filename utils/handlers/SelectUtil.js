const { promisify } = require('util');
const { glob } = require('glob');
const pGlob = promisify(glob);
const Logger = require('../Logger');

module.exports = async (client)=>{
    const isDist = __dirname.includes('dist');
    const base = isDist ? 'dist' : '.';
    const pattern = `${process.cwd()}/${base}/selects/*/*.{ts,js}`;

    const files = await pGlob(pattern);
    for (const selectMenuFile of files) {
        let selectMenu;
        try {
            const raw = require(selectMenuFile);
            selectMenu = raw?.default ?? raw;
        } catch (e) {
            Logger.error(`failed to require select ${selectMenuFile}: ${e?.message || e}`);
            continue;
        }

        if (!selectMenu.name) {
            Logger.warn(`Select menu non-fonctionnel: ajouter un nom à votre menu ↓\nFichier → ${selectMenuFile}`);
            continue;
        }

        client.selects.set(selectMenu.name, selectMenu);
    }
};
