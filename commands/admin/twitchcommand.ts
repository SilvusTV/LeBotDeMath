import { ApplicationCommandOptionType, PermissionFlagsBits } from 'discord.js';
import { TwitchCommandRepository } from '../../utils/db';

export = {
  name: 'twitchcommand',
  category: 'admin',
  ownerOnly: false,
  usage: 'twitchcommand [add|view|edit|delete]',
  examples: ['twitchcommand add', 'twitchcommand view', 'twitchcommand edit', 'twitchcommand delete'],
  defaultMemberPermissions: PermissionFlagsBits.Administrator,
  description: 'Gérer les commandes Twitch du serveur.',
  options: [
    {
      name: 'add',
      description: 'Ajouter une commande Twitch',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: 'title',
          description: 'Titre lisible',
          type: ApplicationCommandOptionType.String,
          required: true,
        },
        {
          name: 'command',
          description: 'Commande préfixe (sans le prefix, ex: planning)',
          type: ApplicationCommandOptionType.String,
          required: true,
        },
        {
          name: 'description',
          description: 'Description interne',
          type: ApplicationCommandOptionType.String,
          required: true,
        },
        {
          name: 'response',
          description: 'Réponse envoyée par le bot',
          type: ApplicationCommandOptionType.String,
          required: true,
        },
      ],
    },
    {
      name: 'view',
      description: 'Voir les commandes Twitch',
      type: ApplicationCommandOptionType.Subcommand,
    },
    {
      name: 'edit',
      description: 'Modifier une commande Twitch existante',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: 'command',
          description: 'Commande cible',
          type: ApplicationCommandOptionType.String,
          required: true,
        },
        {
          name: 'title',
          description: 'Nouveau titre',
          type: ApplicationCommandOptionType.String,
          required: false,
        },
        {
          name: 'description',
          description: 'Nouvelle description',
          type: ApplicationCommandOptionType.String,
          required: false,
        },
        {
          name: 'response',
          description: 'Nouvelle réponse',
          type: ApplicationCommandOptionType.String,
          required: false,
        },
        {
          name: 'active',
          description: 'Activer/Désactiver la commande',
          type: ApplicationCommandOptionType.Boolean,
          required: false,
        },
      ],
    },
    {
      name: 'delete',
      description: 'Supprimer une commande Twitch',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: 'command',
          description: 'Commande à supprimer',
          type: ApplicationCommandOptionType.String,
          required: true,
        },
      ],
    },
  ],
  async runInteraction(client: any, interaction: any) {
    if (!interaction.guildId) {
      return interaction.reply({ content: 'Cette commande doit être utilisée dans un serveur.', ephemeral: true });
    }

    const repository = new TwitchCommandRepository();
    const subcommand = interaction.options.getSubcommand(true);

    if (subcommand === 'add') {
      const title = interaction.options.getString('title', true).trim();
      const command = interaction.options.getString('command', true).trim();
      const description = interaction.options.getString('description', true).trim();
      const response = interaction.options.getString('response', true);

      if (!/^[a-zA-Z0-9_-]{1,32}$/.test(command)) {
        return interaction.reply({
          content: 'Le nom de commande doit contenir uniquement lettres/chiffres/_/- (32 max).',
          ephemeral: true,
        });
      }

      const exists = repository.findByCommand(interaction.guildId, command);
      if (exists) {
        return interaction.reply({ content: 'Cette commande Twitch existe déjà.', ephemeral: true });
      }

      const created = repository.create({
        guildId: interaction.guildId,
        title,
        command,
        description,
        response,
      });

      return interaction.reply({
        content: `Commande Twitch créée: \`${created?.command}\` (${created?.title})`,
        ephemeral: true,
      });
    }

    if (subcommand === 'view') {
      const rows = repository.listByGuild(interaction.guildId);
      if (!rows.length) {
        return interaction.reply({ content: 'Aucune commande Twitch pour ce serveur.', ephemeral: true });
      }

      const content = rows
        .slice(0, 25)
        .map((row) => `- \`${row.command}\` | ${row.title} | active: ${row.isActive ? 'oui' : 'non'}`)
        .join('\n');

      return interaction.reply({ content, ephemeral: true });
    }

    if (subcommand === 'edit') {
      const command = interaction.options.getString('command', true);
      const title = interaction.options.getString('title');
      const description = interaction.options.getString('description');
      const response = interaction.options.getString('response');
      const isActive = interaction.options.getBoolean('active');

      if (!title && !description && !response && isActive === null) {
        return interaction.reply({
          content: 'Aucune modification fournie. Donne au moins un champ à mettre à jour.',
          ephemeral: true,
        });
      }

      const changes = repository.update(interaction.guildId, command, {
        title: title || undefined,
        description: description || undefined,
        response: response || undefined,
        isActive: isActive === null ? undefined : isActive,
      });

      if (!changes) {
        return interaction.reply({ content: 'Commande Twitch introuvable.', ephemeral: true });
      }

      return interaction.reply({ content: 'Commande Twitch mise à jour.', ephemeral: true });
    }

    if (subcommand === 'delete') {
      const command = interaction.options.getString('command', true);
      const changes = repository.delete(interaction.guildId, command);
      if (!changes) {
        return interaction.reply({ content: 'Commande Twitch introuvable.', ephemeral: true });
      }

      return interaction.reply({ content: 'Commande Twitch supprimée.', ephemeral: true });
    }

    return interaction.reply({ content: 'Sous-commande invalide.', ephemeral: true });
  },
};
