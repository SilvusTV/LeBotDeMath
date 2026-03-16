import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { exec } from 'child_process';

export = {
  name: 'updatebot',
  category: 'moderation',
  defaultMemberPermissions: PermissionFlagsBits.Administrator,
  ownerOnly: false,
  usage: 'updatebot',
  examples: 'updatebot',
  description: 'Mettre à jour le bot',
  async runInteraction(client: any, interaction: any) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    await new Promise<void>((resolve) => {
      exec(
        'git pull && npm install && npm run build',
        { maxBuffer: 10 * 1024 * 1024 },
        async (err, stdout, stderr) => {
          const output = [stdout, stderr].filter(Boolean).join('\n').trim();
          const trimmedOutput = output.length ? output.slice(0, 1800) : 'Aucune sortie.';

          if (err) {
            await interaction
              .editReply({
                content: `Mise à jour échouée.\n\`\`\`\n${trimmedOutput}\n\`\`\``,
              })
              .catch(() => null);
            resolve();
            return;
          }

          await interaction
            .editReply({
              content: `Mise à jour terminée.\n\`\`\`\n${trimmedOutput}\n\`\`\``,
            })
            .catch(() => null);
          resolve();
        },
      );
    });
  },
};
