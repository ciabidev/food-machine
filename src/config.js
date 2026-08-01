const environment = process.env.ENVIRONMENT?.trim().toLowerCase();

if (!['development', 'production'].includes(environment)) {
	throw new Error('ENVIRONMENT must be either "development" or "production"');
}

function requireEnvironmentVariable(name) {
	const value = process.env[name]?.trim();
	if (!value) throw new Error(`${name} is required`);
	return value;
}

module.exports = {
	environment,
	discordToken: requireEnvironmentVariable('DISCORD_TOKEN'),
	devIds: new Set(
		(process.env.DEV_IDS || '')
			.split(',')
			.map((id) => id.trim())
			.filter(Boolean),
	),
	issuesUrl: process.env.ISSUES?.trim() || null,
	mongoUri: requireEnvironmentVariable('MONGO_URI'),
};
