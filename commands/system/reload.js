const { MessageFlags, SlashCommandBuilder } = require('discord.js');
const { devIds } = require('#config');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('reload')
		.setDescription('Reload a command.')
		.addStringOption((option) =>
			option.setName('command').setDescription('The command to reload.').setRequired(true),
		),
	async execute(interaction) {
		if (!devIds.has(interaction.user.id)) {
			return interaction.reply({
				content: 'This command is restricted to bot developers.',
				flags: MessageFlags.Ephemeral,
			});
		}

		const commandName = interaction.options.getString('command', true).toLowerCase();
		const command = interaction.client.commands.get(commandName);
		if (!command) {
			return interaction.reply(`There is no command named \`${commandName}\`.`);
		}

		delete require.cache[require.resolve(command.__import)];

		try {
			const updatedCommand = require(command.__import);
			if (!updatedCommand.data || typeof updatedCommand.execute !== 'function') {
				throw new Error('The command must export data and execute.');
			}

			updatedCommand.__import = command.__import;
			if (updatedCommand.data.name !== commandName) {
				interaction.client.commands.delete(commandName);
			}
			interaction.client.commands.set(updatedCommand.data.name, updatedCommand);
			await interaction.reply(`Reloaded \`${updatedCommand.data.name}\`.`);
		}
		catch (error) {
			console.error(error);
			await interaction.reply({
				content: `Could not reload \`${command.data.name}\`.`,
				flags: MessageFlags.Ephemeral,
			});
		}
	},
};
