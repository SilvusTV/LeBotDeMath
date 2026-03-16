import { ApplicationCommandOptionType, EmbedBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { CustomCommandRepository } from '../../utils/db';

export = {
  name: 'customcommand',
  category: 'admin',
  ownerOnly: false,
  usage: 'customcommand [create|list|update|delete]',
  examples: [
    'customcommand create',
    'customcommand list',
    'customcommand update',
    'customcommand delete',
  ],
  defaultMemberPermissions: PermissionFlagsBits.Administrator,
  description: 'Gérer les commandes custom du serveur.',
  options: [
    {
      name: 'create',
      description: 'Créer une commande custom',
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
          description: 'Commande préfixe (sans le prefix, ex: regles)',
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
      name: 'list',
      description: 'Lister les commandes custom',
      type: ApplicationCommandOptionType.Subcommand,
    },
    {
      name: 'update',
      description: 'Modifier une commande custom existante',
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
      description: 'Supprimer une commande custom',
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
      return interaction.reply({ content: 'Cette commande doit être utilisée dans un serveur.', flags: MessageFlags.Ephemeral });
    }

    const repository = new CustomCommandRepository();
    const subcommand = interaction.options.getSubcommand(true);

    if (subcommand === 'create') {
      const title = interaction.options.getString('title', true).trim();
      const command = interaction.options.getString('command', true).trim();
      const description = interaction.options.getString('description', true).trim();
      const response = interaction.options.getString('response', true);

      if (!/^[a-zA-Z0-9_-]{1,32}$/.test(command)) {
        return interaction.reply({
          content: 'Le nom de commande doit contenir uniquement lettres/chiffres/_/- (32 max).',
          flags: MessageFlags.Ephemeral,
        });
      }

      const exists = repository.findByCommand(interaction.guildId, command);
      if (exists) {
        return interaction.reply({ content: 'Cette commande existe déjà.', flags: MessageFlags.Ephemeral });
      }

      const created = repository.create({
        guildId: interaction.guildId,
        title,
        command,
        description,
        response,
      });

      return interaction.reply({
        content: `Commande créée: \`${created?.command}\` (${created?.title})`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === 'list') {
      const rows = repository.listByGuild(interaction.guildId);
      if (!rows.length) {
        const emptyEmbed = new EmbedBuilder()
          .setColor('#735B8B')
          .setTitle('Liste des commandes custom')
          .setDescription('Aucune commande custom pour ce serveur.')
          .setTimestamp()
          .setFooter({ text: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() });

        return interaction.reply({ embeds: [emptyEmbed] });
      }

      const displayedRows = rows.slice(0, 25);
      const activeCount = rows.filter((row) => row.isActive).length;
      const listValue = displayedRows
        .map((row, index) => `${index + 1}. \`${row.command}\` • ${row.title} • ${row.isActive ? 'actif' : 'inactif'}`)
        .join('\n');

      const embed = new EmbedBuilder()
        .setColor('#735B8B')
        .setTitle('Liste des commandes custom')
        .setDescription(
          displayedRows.length < rows.length
            ? `Affichage des 25 premières commandes sur ${rows.length}.`
            : `Total des commandes: ${rows.length}.`,
        )
        .addFields(
          { name: 'Actives', value: `${activeCount}`, inline: true },
          { name: 'Inactives', value: `${rows.length - activeCount}`, inline: true },
          { name: 'Commandes', value: listValue || 'Aucune', inline: false },
        )
        .setTimestamp()
        .setFooter({ text: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() });

      return interaction.reply({ embeds: [embed] });
    }

    if (subcommand === 'update') {
      const command = interaction.options.getString('command', true);
      const title = interaction.options.getString('title');
      const description = interaction.options.getString('description');
      const response = interaction.options.getString('response');
      const isActive = interaction.options.getBoolean('active');

      if (!title && !description && !response && isActive === null) {
        return interaction.reply({
          content: 'Aucune modification fournie. Donne au moins un champ à mettre à jour.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const changes = repository.update(interaction.guildId, command, {
        title: title || undefined,
        description: description || undefined,
        response: response || undefined,
        isActive: isActive === null ? undefined : isActive,
      });

      if (!changes) {
        return interaction.reply({ content: 'Commande introuvable.', flags: MessageFlags.Ephemeral });
      }

      return interaction.reply({ content: 'Commande custom mise à jour.', flags: MessageFlags.Ephemeral });
    }

    if (subcommand === 'delete') {
      const command = interaction.options.getString('command', true);
      const changes = repository.delete(interaction.guildId, command);
      if (!changes) {
        return interaction.reply({ content: 'Commande introuvable.', flags: MessageFlags.Ephemeral });
      }

      return interaction.reply({ content: 'Commande custom supprimée.', flags: MessageFlags.Ephemeral });
    }

    return interaction.reply({ content: 'Sous-commande invalide.', flags: MessageFlags.Ephemeral });
  },
};
