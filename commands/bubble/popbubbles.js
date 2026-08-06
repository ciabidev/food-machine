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
        .setDescription("[Admin] Permanently delete bubbles"),

    async execute(interaction) {
        if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
            await interaction.reply({
                content: "You need Manage Server to pop bubbles.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const bubbleRecords = await interaction.client.modules.db.getBubbles(
            interaction.guildId,
        );
        const settings = await interaction.client.modules.db.getSettings(
            interaction.guildId,
        );

        if (bubbleRecords.length === 0) {
            await interaction.reply({
                content: "There are no bubbles to pop.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const options = bubbleRecords.slice(0, 25).map((bubble) => {
            const channelId = bubble.channel_id ? String(bubble.channel_id) : null;
            const channel = channelId
                ? interaction.guild.channels.cache.get(channelId)
                : null;

            return {
                label: (bubble.name || channel?.name || `Bubble by ${bubble.host_id}`).slice(0, 100),
                description: channel && (
                    !settings.bubble.inactive_category_id
                    || channel.parentId !== settings.bubble.inactive_category_id
                )
                    ? "Active channel"
                    : "Inactive bubble",
                value: String(bubble.host_id),
            };
        });
        const bubbleSelect = new StringSelectMenuBuilder()
            .setCustomId("bubble:admin:pop:bubbles")
            .setPlaceholder("Select bubbles to pop")
            .setMinValues(0)
            .setMaxValues(options.length)
            .setRequired(false)
            .addOptions(options);

        await interaction.showModal(
            new ModalBuilder()
                .setCustomId("bubble:admin:pop")
                .setTitle("Pop bubbles")
                .addLabelComponents(
                    new LabelBuilder()
                        .setLabel("Reason")
                        .setDescription("This will be shown to each bubble host.")
                        .setTextInputComponent(
                            new TextInputBuilder()
                                .setCustomId("bubble:admin:pop:reason")
                                .setStyle(TextInputStyle.Paragraph)
                                .setMaxLength(400)
                                .setPlaceholder("Why are these bubbles being popped?")
                                .setRequired(true),
                        ),
                    new LabelBuilder()
                        .setLabel("Bubbles to delete")
                        .setDescription("Select nothing to permanently delete every bubble.")
                        .setStringSelectMenuComponent(bubbleSelect),
                ),
        );
    },
};
