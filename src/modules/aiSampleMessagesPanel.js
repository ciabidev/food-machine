const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} = require("discord.js");

const SAMPLES_PER_PAGE = 10;

function quoteSample(sample) {
  return sample
    .split("\n")
    .map((line) => `> ${line || " "}`)
    .join("\n");
}

async function aiSamplesPanel(interaction, requestedPage = 0) {
  const settings = await interaction.client.modules.db.getSettings(interaction.guildId);
  const samples = [...settings.ai.sample_messages].reverse();
  const pageCount = Math.max(1, Math.ceil(samples.length / SAMPLES_PER_PAGE));
  const page = Math.max(0, Math.min(requestedPage, pageCount - 1));
  const firstSampleIndex = page * SAMPLES_PER_PAGE;
  const visibleSamples = samples.slice(firstSampleIndex, firstSampleIndex + SAMPLES_PER_PAGE);
  const panel = new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "# AI sample messages",
          `-# ${samples.length} of 20 samples saved • Page ${page + 1} of ${pageCount}`,
        ].join("\n"),
      ),
    );

  if (visibleSamples.length) {
    for (const [index, sample] of visibleSamples.entries()) {
      panel
        .addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true),
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `### Sample ${firstSampleIndex + index + 1}\n${quoteSample(sample)}`,
          ),
        );
    }
  } else {
    panel
      .addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true),
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent("No sample messages have been added yet."),
      );
  }

  panel
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true),
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ai:samples:page:${page - 1}`)
          .setLabel("Previous")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === 0),
        new ButtonBuilder()
          .setCustomId(`ai:samples:page:${page + 1}`)
          .setLabel("Next")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page >= pageCount - 1),
        new ButtonBuilder()
          .setCustomId(`ai:samples:add:${page}`)
          .setLabel("Add samples")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`ai:samples:clear:${page}`)
          .setLabel("Clear all")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(!samples.length),
      ),
    );

  return [panel];
}

function clearSamplesConfirmation(page, sampleCount) {
  return [
    new ContainerBuilder()
      .setAccentColor(0xed4245)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            "# Clear all AI samples?",
            `This will permanently remove all ${sampleCount} saved sample message${sampleCount === 1 ? "" : "s"}.`,
          ].join("\n"),
        ),
      )
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("ai:samples:clear-confirm")
            .setLabel("Clear all")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`ai:samples:page:${page}`)
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Secondary),
        ),
      ),
  ];
}

module.exports = {
  aiSamplesPanel,
  clearSamplesConfirmation,
};
