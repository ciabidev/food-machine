const {
  ContainerBuilder,
  MessageFlags,
  SlashCommandBuilder,
  TextDisplayBuilder,
} = require("discord.js");
const { messageVariableGroups } = require("#modules/messageVariables");

function formatGroup(name, variables) {
  return [
    `## ${name[0].toUpperCase()}${name.slice(1)}`,
    ...variables.flatMap(([variable, description]) => [
      `\`${variable}\``,
      `> ${description}`,
    ]),
  ].join("\n");
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("variables")
    .setDescription("View the variables available in customizable text."),

  async execute(interaction) {
    const content = [
      "# Message Variables",
      "Use variables inside braces, for example `{user.name}`.",
      ...Object.entries(messageVariableGroups).map(([name, variables]) => (
        formatGroup(name, variables)
      )),
    ].join("\n\n");

    await interaction.reply({
      components: [
        new ContainerBuilder().addTextDisplayComponents(
          new TextDisplayBuilder().setContent(content),
        ),
      ],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  },
};
