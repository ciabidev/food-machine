const sharp = require("sharp");

const MAX_IMAGE_ATTACHMENTS = 4;
const MAX_IMAGE_PARTS = 6;
const MAX_GIF_FRAMES = 4;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_PAYLOAD_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1_600;
const MAX_IMAGE_PIXELS = 40_000_000;
const IMAGE_DOWNLOAD_TIMEOUT_MS = 10_000;
const SUPPORTED_IMAGE_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

module.exports = async function loadImageParts(message, repliedMessage, mentionedChannels = []) {
  const sources = [
    ...[...(message.attachments?.values() || [])].map((attachment) => ({
      attachment,
      location: "current message",
    })),
    ...[...(repliedMessage?.attachments?.values() || [])].map((attachment) => ({
      attachment,
      location: "replied message",
    })),
    ...mentionedChannels.flatMap(({ channel, readable, messages }) =>
      readable
        ? [...messages].reverse().flatMap((channelMessage) =>
            [...(channelMessage.attachments?.values() || [])].map((attachment) => ({
              attachment,
              location: `#${channel.name}, posted by ${
                channelMessage.member?.displayName ||
                channelMessage.author?.globalName ||
                channelMessage.author?.username ||
                "unknown user"
              }`,
            })),
          )
        : [],
    ),
  ]
    .filter(({ attachment }) => {
      const contentType = attachment.contentType?.split(";", 1)[0].toLowerCase();
      return SUPPORTED_IMAGE_TYPES.has(contentType);
    })
    .slice(0, MAX_IMAGE_ATTACHMENTS);

  const parts = [];
  let imageCount = 0;
  let payloadBytes = 0;

  for (const { attachment, location } of sources) {
    if (imageCount >= MAX_IMAGE_PARTS) break;
    if (attachment.size > MAX_IMAGE_BYTES) {
      console.warn(`Skipped oversized AI image attachment: ${attachment.name}`);
      continue;
    }

    try {
      const response = await fetch(attachment.url, {
        signal: AbortSignal.timeout(IMAGE_DOWNLOAD_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const contentLength = Number(response.headers.get("content-length"));
      if (contentLength > MAX_IMAGE_BYTES) throw new Error("image is too large");

      const input = Buffer.from(await response.arrayBuffer());
      if (input.length > MAX_IMAGE_BYTES) throw new Error("image is too large");

      const contentType = attachment.contentType.split(";", 1)[0].toLowerCase();
      const isGif = contentType === "image/gif";
      const metadata = await sharp(input, { limitInputPixels: MAX_IMAGE_PIXELS }).metadata();
      const frameCount = isGif ? Math.min(metadata.pages || 1, MAX_GIF_FRAMES) : 1;
      const frameIndexes = Array.from({ length: frameCount }, (_, index) =>
        frameCount === 1
          ? 0
          : Math.round((index * ((metadata.pages || 1) - 1)) / (frameCount - 1)),
      );

      for (const [frameNumber, frameIndex] of frameIndexes.entries()) {
        if (imageCount >= MAX_IMAGE_PARTS) break;

        const output = await sharp(input, {
          page: frameIndex,
          limitInputPixels: MAX_IMAGE_PIXELS,
        })
          .rotate()
          .resize({
            width: MAX_IMAGE_DIMENSION,
            height: MAX_IMAGE_DIMENSION,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality: isGif ? 75 : 85, effort: 4 })
          .toBuffer();

        if (payloadBytes + output.length > MAX_IMAGE_PAYLOAD_BYTES) break;

        const frameLabel = isGif ? `, frame ${frameNumber + 1} of ${frameCount}` : "";
        parts.push(
          { text: `Image from ${location} (${attachment.name}${frameLabel}):` },
          {
            inline_data: {
              mime_type: "image/webp",
              data: output.toString("base64"),
            },
          },
        );
        imageCount += 1;
        payloadBytes += output.length;
      }
    } catch (error) {
      console.warn(`Failed to prepare AI image attachment ${attachment.name}:`, error.message);
    }
  }

  return parts;
};
