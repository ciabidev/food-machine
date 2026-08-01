const { Events, MessageFlags } = require('discord.js');
const { issuesUrl } = require('#config');

async function replyWithError(interaction, error) {
	console.error(error);

	const issuePrompt = issuesUrl ? `\nReport persistent issues here: ${issuesUrl}` : '';
	const response = {
		content: `An error occurred while running that command.${issuePrompt}`,
		flags: MessageFlags.Ephemeral,
	};

	if (interaction.replied || interaction.deferred) {
		await interaction.followUp(response);
	}
	else {
		await interaction.reply(response);
	}
}

module.exports = {
	name: Events.InteractionCreate,
	async execute(interaction) {
		const command = interaction.client.commands.get(interaction.commandName);

		if (interaction.isAutocomplete()) {
			if (!command?.autocomplete) return;
			try {
				await command.autocomplete(interaction);
			}
			catch (error) {
				console.error('Failed to provide autocomplete choices:', error);
			}
			return;
		}

		if (!interaction.isChatInputCommand()) return;
		if (!command) {
			console.error(`No command matching ${interaction.commandName} was found.`);
			return;
		}

		try {
			await command.execute(interaction);
		}
		catch (error) {
			await replyWithError(interaction, error);
		}
	},
};
