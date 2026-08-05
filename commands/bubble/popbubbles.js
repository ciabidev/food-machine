const {
    LabelBuilder,
    MessageFlags,
    ModalBuilder,
    PermissionFlagsBits,
    SlashCommandSubcommandBuilder,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle,
} = require("discord.js");

module.exports = {
    data: new SlashCommandSubcommandBuilder()
        .setName("popbubbles")
        .setDescription("[Admin] Delete temporary bubble channels"),

    async execute(interaction) {
        if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
            await interaction.reply({
                content: "You need Manage Server to pop bubble channels.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const bubbleRecords = await interaction.client.modules.db.getBubbles(
            interaction.guildId,
        );

        if (bubbleRecords.length === 0) {
            await interaction.reply({
                content: "There are no bubble channels to pop.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const bubbleChannels = bubbleRecords.map((bubble) => {
            const storedChannelId = Array.isArray(bubble.channel_id)
                ? bubble.channel_id[0]
                : bubble.channel_id;
            const channelId = String(storedChannelId).match(/^<#(\d+)>$/)?.[1]
                || String(storedChannelId);
            return interaction.guild.channels.cache.get(channelId);
        }).filter(Boolean).slice(0, 25);

        if (bubbleChannels.length === 0) {
            await interaction.reply({
                content: "There are no bubble channels to pop.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const options = bubbleChannels.map((channel) => ({
            label: channel.name.slice(0, 100),
            value: channel.id,
        }));
        const channelSelect = new StringSelectMenuBuilder()
            .setCustomId("pop-bubble-channels")
            .setPlaceholder("Select bubbles to pop")
            .setMinValues(0)
            .setMaxValues(options.length)
            .setRequired(false)
            .addOptions(options);

        await interaction.showModal(
            new ModalBuilder()
                .setCustomId("pop-bubbles")
                .setTitle("Pop bubble channels")
                .addLabelComponents(
                    new LabelBuilder()
                        .setLabel("Reason")
                        .setDescription("This will be shown to each bubble host.")
                        .setTextInputComponent(
                            new TextInputBuilder()
                                .setCustomId("pop-bubbles-reason")
                                .setStyle(TextInputStyle.Paragraph)
                                .setMaxLength(400)
                                .setPlaceholder("Why are these bubbles being popped?")
                                .setRequired(true),
                        ),
                    new LabelBuilder()
                        .setLabel("Bubble channels to delete")
                        .setDescription("Select nothing to delete every bubble channel.")
                        .setStringSelectMenuComponent(channelSelect),
                ),
        );
    },
};
