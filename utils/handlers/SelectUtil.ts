import { promisify } from 'util';
import { glob } from 'glob';
import Logger from '../Logger';

const pGlob = promisify(glob);

export default async function SelectUtil(client: any): Promise<void> {
  // Support both TS (dev) and JS (dist or legacy) select menus
  const isDist = __dirname.includes('dist');
  const base = isDist ? 'dist' : '.';
  const pattern = `${process.cwd()}/${base}/selects/*/*.{ts,js}`;

  const files = await pGlob(pattern);
  for (const selectMenuFile of files) {
    let selectMenu: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const raw = require(selectMenuFile);
      selectMenu = raw?.default ?? raw;
    } catch (e: any) {
      Logger.error(`failed to require select ${selectMenuFile}: ${e?.message || e}`);
      continue;
    }

    if (!selectMenu.name)
      {
        Logger.warn(`Select menu non-fonctionnel: ajouter un nom à votre menu ↓\nFichier → ${selectMenuFile}`);
        continue;
      }
    client.selects.set(selectMenu.name, selectMenu);
  }
}
