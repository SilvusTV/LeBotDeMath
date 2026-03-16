const { promisify } = require("util");
const { glob} = require("glob");
const pGlob = promisify(glob);

module.exports = async (client) => {
  const isDist = __dirname.includes('dist');
  const base = isDist ? 'dist' : '.';
  const ext = isDist ? 'js' : 'ts';
  const pattern = `${process.cwd()}/${base}/events/*/*.${ext}`;

  const files = await pGlob(pattern);
  for (const eventFile of files) {
    let event;
    try {
      const raw = require(eventFile);
      event = raw?.default ?? raw;
    } catch {
      continue;
    }

    if (!event?.name || typeof event.execute !== 'function') {
      continue;
    }

    if (event.once) {
      client.once(event.name, (...args) => event.execute(client, ...args));
    } else {
      client.on(event.name, (...args) => event.execute(client, ...args));
    }
  }
};
