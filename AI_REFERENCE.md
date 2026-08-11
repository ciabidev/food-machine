# Food Machine AI reference

This document describes the AI feature as it is currently implemented. It is intended to be the durable handoff for server owners and future developers, including the design decisions behind the implementation.

Last reviewed against the repository on 2026-08-09.

## Overview

Food Machine is a Discord-native conversational bot backed by Google Gemini. It can:

- reply when mentioned or replied to;
- respond to any selected message through a message context command;
- understand recent conversation, replies, mentions, server rules, selected channel context, and images;
- learn a server's writing style from curated sample messages;
- use persistent personal and server-wide memories;
- render explicit food-generation requests as consistent Components V2 cards;
- expose per-response model, latency, token usage, and request context on demand.

The implementation deliberately separates three concerns:

1. The system prompt defines Food Machine's identity and general conversational judgment.
2. Runtime boundaries enforce application contracts such as output format, spoiler awareness, and food-card syntax.
3. JavaScript constructs context, applies privacy boundaries, renders special output, and handles provider failures.

This keeps presentation and security-sensitive behavior out of prompt-only logic.

## Runtime and configuration

The bot requires Node.js 24 and uses CommonJS. Relevant dependencies are `discord.js`, `mongodb`, `sharp`, and `dotenv`.

The supported environment variables are documented in `.env.example`:

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | Yes | None | Google AI Studio API key. |
| `GEMINI_MODEL` | No | `gemini-3.6-flash` | Primary conversational and memory-extraction model. |
| `GEMINI_FALLBACK_MODEL` | No | `gemini-3.5-flash-lite` | Retried model after a primary HTTP 429 or 503. |
| `AI_COOLDOWN_MS` | No | `15000` | Per-channel cooldown after an AI request. Must be a non-negative integer. |
| `AI_ALLOWED_GUILD_IDS` | No | Empty | Optional comma-separated guild allowlist. Empty permits every guild. |
| `UNSPLASH_ACCESS_KEY` | No | None | Enables Unsplash thumbnails on generated-food cards. |

Model availability and quotas change over time. The model names are configurable specifically so a provider change does not require editing the AI module.

## Enabling and invoking the AI

AI is disabled by default in every guild. A member with Manage Server can run `/ai enable`; `/ai disable` turns it off.

Once enabled, Food Machine responds when:

- its mention appears at the beginning of a message;
- a member replies to one of its messages, unless the new message appears to be discussing what the bot said rather than addressing it;
- a member right-clicks a message and uses `Ask <application name>`.

The Ask command name is generated from the Discord application name at startup and truncated to Discord's 32-character limit. Its acknowledgement is ephemeral, but the AI answer is posted publicly as a reply to the selected message.

The context-menu route uses the selecting member's permissions when deciding which related channels are readable. If the selected message belongs to someone else, that person's private global memories are not loaded. Server memories may still be loaded. This is an intentional privacy boundary.

The normal message listener ignores bot-authored messages. The context-menu route can force processing of a selected human message.

## Discord commands

### `/ai`

The root command is available to regular members because personal memory controls must not be restricted to administrators. Each administrative subcommand performs its own Manage Server check.

| Command | Access | Behavior |
| --- | --- | --- |
| `/ai enable` | Manage Server | Enables conversational replies for the guild. |
| `/ai disable` | Manage Server | Disables conversational replies for the guild. |
| `/ai status` | Everyone | Shows enabled state, memory state, provider, models, cooldown, rules channel, and sample count. |
| `/ai systemprompt` | Manage Server | Opens a modal to replace the guild system prompt. Submitting it blank restores the default. Maximum 4,000 characters. |
| `/ai ruleschannel` | Manage Server | Selects a text or announcement channel. Leaving it empty uses Discord's configured rules channel. |
| `/ai samplemessages` | Manage Server | Opens the sample-message control panel. |
| `/ai memory enable` | Manage Server | Allows saved memories to be used in this guild. Does not delete records. |
| `/ai memory disable` | Manage Server | Stops memory use in this guild. Does not delete records. |
| `/ai memory view` | Owner; server scope requires Manage Server | Shows the newest ten memories in the selected scope. |
| `/ai memory add` | Owner; server scope requires Manage Server | Manually adds or replaces a memory by key. |
| `/ai memory forget` | Owner; server scope requires Manage Server | Deletes one autocompleted memory key. |
| `/ai memory clear` | Owner; server scope requires Manage Server | Deletes all memories in the selected scope after an explicit confirmation option. |

### Message context commands

| Command | Access | Behavior |
| --- | --- | --- |
| `Ask <application name>` | Everyone | Makes the AI publicly answer the selected message. |
| `Add as AI sample message` | Manage Server | Saves a human-authored text message as a guild style example. |
| `View AI stats` | Everyone | Shows usage statistics for a bot-authored AI response. Context access is restricted as described below. |
| `AI: Remember for Me` | Everyone | Extracts a global personal memory from the member's own selected message. |
| `AI: Remember for Server` | Manage Server | Extracts shared server knowledge from a selected human message. |

Discord message context commands cannot have descriptions or options. The command loader also skips both subcommand and subcommand-group builders so `/ai memory` is not accidentally deployed as a top-level context command.

## Request lifecycle

For a normal response, the bot:

1. Checks guild, invocation, allowlist, enabled state, permissions, active request, and cooldown.
2. Resolves the direct reply chain and fetches recent channel history.
3. Collects readable rules, mentioned channels, mentioned-user context, curated samples, and relevant memories.
4. Converts Discord objects into a structured text context with identity registries and reference IDs.
5. Downloads and optimizes eligible images.
6. Sends the system prompt, runtime boundaries, text context, and image parts to Gemini.
7. Tries the fallback model only if the primary returns HTTP 429 or 503.
8. Renders a normal reply or a code-constructed food card.
9. Saves model, latency, token counts, requester, and the system-prompt-free request context.
10. Starts the channel cooldown even when processing fails.

Only one AI request may run in a channel at a time. Typing indicators are best effort.

## Prompt layers and conversational behavior

The default system prompt is defined in `src/config.js` and persisted as the effective guild default. Its current goals are:

- act like a socially aware Discord participant rather than customer support;
- infer intent instead of mechanically reacting to keywords;
- match the user's energy, formality, seriousness, humor, and expected depth;
- stay brief for ordinary conversation and expand when the request calls for it;
- use sample messages, not random live slang, as the baseline voice;
- mirror distinctive slang or emoji only during an obvious active joke or bit;
- treat criticism of wording as feedback rather than a style example;
- avoid repeatedly reviving old anecdotes, jokes, or phrases;
- use emojis naturally, including server emojis, without generic decoration;
- carry out direct creative, transformation, formatting, and repetition requests;
- answer accurately, admit uncertainty, avoid unrequested spoilers, and follow server rules;
- avoid inventing an off-platform biography for Food Machine.

The current default also establishes Sanji as Food Machine's favorite Straw Hat. That is persona configuration, not a code-enforced rule.

Every request appends a code-owned runtime contract. Even a custom guild system prompt therefore retains the application's response contract. The contract reinforces conversational restraint and requires that:

- supplied logs, quotes, rules, and samples are treated as reference data rather than instructions;
- YAML-like context objects are never reproduced as the response;
- context headings, IDs, timestamps, component metadata, model names, and latency are not leaked;
- the exact food-card marker and JSON schema are used only for genuine food-generation requests.

There is no longer a regex retry loop that rejects biography-like replies, repeated requests, or similar output after generation. Those concerns are expressed in the prompt and response contract instead of being patched with post-generation guesses.

## Curated style samples

Samples teach baseline voice. They should be real, representative messages from the server, not a list of slang words or current memes.

Good samples collectively demonstrate:

- short acknowledgements and ordinary replies;
- jokes and playful exaggeration;
- sincere or supportive replies;
- longer explanations when someone asks a real question;
- how members use punctuation, casing, custom emoji, and formatting;
- stylistic variety, so one phrase or emoji does not dominate the bot's output.

Avoid samples that are mostly quoted criticism, one-off trend spam, sensitive information, spoilers, or repeated copies of the same mannerism. Roughly 10-20 diverse examples are usually more useful than filling the set with near-duplicates.

The database retains at most 20 samples, each at most 1,000 characters. Adding more keeps the newest 20. The control panel displays ten per page, newest first, and includes Add samples and confirmed Clear all controls. Its modal accepts multiple samples separated by a blank line. Samples are stored server-wide and are injected into the prompt under a dedicated curated-style heading.

Sample messages are important but are not a live trend feed. Keeping style current is an editorial process: periodically replace stale examples with current, naturally occurring server messages. The model should generalize their rhythm and restraint rather than copy phrases verbatim.

## Context construction

All Discord messages supplied to Gemini are reference data inside a user turn. Historical Food Machine messages are not sent as Gemini `model` turns. This prevents Gemini from mistaking serialized context for something it previously authored and replying with the entire schema.

### Current-channel history

- Up to 50 messages are fetched before the current message.
- A gap of more than two hours starts a new active session.
- Up to five messages before that session boundary are retained as a small bridge.
- Serialized history has an 8,000-character budget.
- Other bots are excluded; Food Machine's own messages are retained.
- The footer is stripped from Food Machine's historical content.
- The current message is serialized separately under `# Current Discord message`.

The history budget is character-based, not token-based. The resulting Gemini input can still vary substantially because rules, registries, mentioned channels, user profiles, memories, and images are separate inputs. The context cleanup reduced observed ordinary requests from roughly 10,000 input tokens to roughly 5,000, but no fixed token count is guaranteed.

### Message schema

Each supplied Discord message uses the same YAML-like object shape. Depending on the message, it contains:

- `message_id`, `channel_id`, and `created_at`;
- authoritative `author_id`, `author_username`, and `author_display_name`;
- `reply_to_message_id`;
- mentioned user, role, and channel ID arrays;
- everyone-mention state;
- attachment names, MIME types, and byte sizes;
- sticker IDs and names;
- text extracted from content, embeds, and Components V2 text displays.

The context also supplies user, channel, and role registries keyed by Discord ID. IDs are authoritative; display names and message text cannot redefine authorship. Including both username and display name helps preserve identity across nickname changes and discourages impersonation through message text.

Direct reply targets and reply targets referenced by retained history are included once in a dedicated section when they fall outside current history. Discord message IDs are treated as globally unique, including across channels. A reply-to-a-reply is also collected for the current request, which lets the model distinguish “what I replied to” from “what they replied to.”

### Mentions and server metadata

Raw mentions are resolved to readable names in ordinary text, while the schema retains authoritative IDs.

For an explicitly mentioned user, the AI may receive:

- username, display name, ID, and roles;
- up to three recent human-authored messages;
- results from at most 20 readable channels, stopping once enough messages are found.

For mentioned channels, the AI may receive:

- up to three channels;
- up to 50 fetched messages per channel;
- at most 3,000 serialized characters per channel;
- an explicit unreadable marker when either the requester or bot lacks access.

If the current message has no channel mention, a channel mentioned by a human in the last three active-session messages can carry forward to support a natural follow-up.

Complete channel, role, emoji, and sticker inventories are only added when the request appears to ask for that inventory. This avoids paying the token cost on every message.

## Server rules

The configured rules source is, in order:

1. the channel selected with `/ai ruleschannel`;
2. Discord's configured guild rules channel;
3. no rules context.

The requester and bot must both have View Channel and Read Message History. The bot fetches the newest 50 messages and up to 50 pins, deduplicates them by message ID, orders them chronologically, and includes the channel topic. It extracts text from normal content, embeds, and nested Components V2 components, so rules stored in text displays are readable even when Discord's normal `message.content` is empty.

Rules have a 20,000-character context budget. The prompt treats numbered rules separately from enforcement or strike-point tables, which avoids confusing “5 points” with “rule 5.” Rules are authoritative server reference data and include a no-unrequested-spoilers expectation when present.

## Image and GIF understanding

Vision context is prepared by `src/modules/loadImageParts.js` using Sharp. Sources are:

- the current message;
- the directly replied-to message;
- readable mentioned-channel messages.

Supported MIME types are AVIF, GIF, JPEG, PNG, and WebP. Limits are:

- four source attachments;
- six resulting image parts;
- 10 MiB per downloaded source;
- 12 MiB total optimized payload;
- 40 million input pixels;
- 1,600 pixels on the longest output dimension;
- ten-second download timeout.

Every frame is auto-rotated, resized without enlargement, and converted to WebP. Static images use quality 85. GIFs sample at most four evenly distributed frames and use quality 75. Labels tell Gemini where the image came from and identify sampled GIF frames.

The stats context attachment never includes base64 image data. It replaces each inline image with its MIME type and approximate byte size.

There is no local vision model. The optimized images are sent to Gemini because adding and operating a second local model would add significant deployment cost and complexity without a demonstrated need.

## Persistent memory

Memory is enabled by default and the default is explicitly persisted into older guild settings documents when the database initializes. Disabling memory in a server stops retrieval and context-menu extraction there but does not delete saved records.

### Personal memory

Personal memory belongs to one Discord user and follows that user across every server where Food Machine is available. It is stored with `guild_id: null`, scope `user`, and the owner's Discord ID.

- A user can only create, view, edit, forget, or clear their own personal memories.
- Server administrators cannot manage another member's personal memory.
- `AI: Remember for Me` only accepts a message authored by the person invoking it.
- Personal memories are only loaded when their owner invokes the AI normally or asks it about their own selected message.
- A context-menu Ask action on someone else's message intentionally loads no personal memory.
- Maximum: 100 memories per user.

### Server memory

Server memory is shared reference knowledge for one guild. It is suitable for stable local terminology, channel purposes, traditions, community projects, and established bot or server lore.

- Manage Server is required to create, view, edit, forget, or clear it.
- It must not turn an individual's preference or biography into a guild fact.
- It remains inside the guild where it was saved.
- Maximum: 200 memories per guild.

“Server-wide” means shared with AI requests in that server, not public to other servers and not an automatic transcript of the server. Nothing is remembered automatically during normal chat.

### Automatic extraction from a selected message

The two Remember context actions do not open a modal. They:

1. take the selected message as the primary source;
2. fetch up to eight preceding messages;
3. discard earlier context separated by more than two hours;
4. add the selected message's direct reply target when available;
5. serialize author IDs, usernames, display names, reply references, and compact text;
6. ask Gemini at temperature 0.1 for structured JSON containing zero to twenty `key` and `value` memories;
7. for a selected message of at least 1,000 characters or twelve lines, run a second structured coverage audit that returns only durable source details missing from the initial extraction;
8. directly save or upsert each extracted memory in the database.

The selected message has a 12,000-character extraction budget, while each nearby context message remains limited to 800 characters. Extraction does not load the full conversational prompt, rules, samples, images, or existing memory. This preserves the authoritative source without allowing neighboring context to dominate the request.

Gemini is instructed to preserve useful specifics while rejecting meaningless, speculative, improperly scoped, or dangerously private content. Credentials, authentication secrets, exact private addresses, and similar data should produce an empty memory list. Closely related details may remain together, while independent facts or dense structured content are split across memories so useful supported details are not discarded merely for brevity. A deliberately selected joke or shared event may be saved when accurately labeled as such.

Keys are normalized to lowercase snake_case, must contain a letter or number, and are limited to 50 characters. Values are limited to 500 characters each. Saving the same scope/owner/key updates the existing record rather than creating a duplicate.

### Retrieval

Memory retrieval is intentionally simple and direct; there is no embedding service, vector database, cache, background summarizer, or automatic memory writer.

For each request, the database fetches the current author's global personal records and the current guild's shared records. A lexical scorer tokenizes the current message plus direct reply content, ignores common filler words, and weights key matches more heavily than value matches. To prevent a weak generic word from pulling unrelated facts into the prompt, only records scoring at least half as highly as the best match are eligible. When several records tie at the weakest possible one-word value match, none are injected unless the user explicitly asks what the bot remembers. It injects at most:

- ten relevant personal memories;
- ten relevant server memories.

Memory keys are used only by the lexical scorer and are not shown to Gemini. Selected values are supplied as natural reference facts. Discord user, role, and channel IDs inside those values are resolved from current guild caches and represented with both a readable name and Discord mention syntax. AI output keeps `allowedMentions: { parse: [] }`, so a returned mention renders normally without notifying its target.

Two-character terms are retained so acronyms can match. Questions such as “what do you remember about me?” make recent memories eligible even without a keyword overlap. The prompt says memories may be stale, direct current statements win, and unrelated memories must not become recurring callbacks.

### Migration note

No migration was requested or implemented when personal memory changed from guild-scoped to global. Older user-memory documents that still contain a guild ID are intentionally untouched and are not read by the new global-personal-memory query.

## Generated-food cards

Food cards are an explicit application feature, not generic keyword detection. Gemini is asked to emit the marker only when the user clearly asks it to make, cook, generate, or serve a food or drink, or clearly follows up on an active request. Food terms inside character names, titles, organizations, jokes, media discussions, or favorite/opinion questions must receive an ordinary reply.

The model returns this internal contract:

```text
[[FOOD_CARD]]
{"name":"...","emoji":"...","description":"...","ingredients":"..."}
```

`src/modules/aiFoodCard.js` parses the marker and requires all four fields. JavaScript, not Gemini, constructs the final green Components V2 container:

```md
## <emoji> 🟢 `<dish name>`
<description>
-# **Ingredients:** <ingredient summary>

enjoy!
```

Values are collapsed to one line and backticks are sanitized. This guarantees a consistent UI and prevents raw marker JSON from being shown when the contract parses correctly. A malformed or missing marker falls back to an ordinary text reply.

If `UNSPLASH_ACCESS_KEY` is present, the renderer searches Unsplash for the exact dish name with `per_page=1` and high content filtering. A valid result becomes a thumbnail with small linked photographer/Unsplash attribution and UTM parameters. Search timeout, HTTP error, no result, incomplete data, or missing key all degrade to an image-free card. Food generation itself never depends on Unsplash.

The model and response-time footer is deliberately outside the Components V2 food container as a separate plain message. Stats are associated with the card message, not the footer.

## Provider behavior and failures

Gemini requests use the REST `v1beta` `generateContent` endpoint with an `x-goog-api-key` header. The default generation limit is 8,192 output tokens, although most Discord replies should be far shorter because the prompt asks for situational brevity. Memory extraction overrides that generation configuration as described below.

The request timeout is 30 seconds. Memory extraction uses a 4,096-token JSON response budget with low Gemini reasoning. The primary and fallback models are not load-balanced:

- success returns immediately;
- HTTP 429 or 503 from the primary tries the fallback once;
- any other primary error is returned immediately;
- an error from the fallback becomes the final error.

When the final provider error is HTTP 429, the bot replies with `assets/tired.png`, an “im tired” quota message, and a parsed retry estimate when Gemini supplies one. Other final errors use `assets/sleeping.gif` and display the error message in small text.

A Discord `UND_ERR_CONNECT_TIMEOUT` while sending the completed response is retried once after 500 ms. This is different from a Gemini timeout: it means Discord's HTTP connection could not be established, not that the model failed.

## Reply rendering

Ordinary AI output uses normal Discord message content, not Components V2. Replies longer than 2,000 characters are split at a newline, then a space, then the hard boundary. The first chunk replies to the invoking message and later chunks are sent to the channel.

Every ordinary response ends with:

```md
-# Model » `<model>` • Response Time: `<duration>`
```

Mentions are disabled on all AI output with `allowedMentions: { parse: [] }`, so generated text cannot ping users, roles, or everyone.

## AI statistics and request inspection

The bot saves one `ai_message_stats` document for each stats-bearing AI response message. It includes:

- response message, guild, and channel IDs;
- requester ID;
- actual model used;
- response time in milliseconds;
- input, output, thinking, and total token counts when Gemini reports them;
- a text rendering of the exact request context, excluding the system prompt and inline image data;
- creation timestamp.

Right-click an AI response and choose `View AI stats`. Any member can see performance and token totals. The `ai-context.txt` attachment is only shown to the original requester or someone with Manage Server. A message not sent by this bot, or a bot response without a stats record, produces an explanatory ephemeral error.

Thinking tokens can legitimately be unavailable because provider usage metadata does not always report them. Stats records currently have no TTL or automatic cleanup.

## Database layout

AI configuration is nested under `guild_settings.ai`:

```js
{
  enabled: false,
  memory_enabled: true,
  system_prompt: defaultAiSystemPrompt,
  sample_messages: [],
  rules_channel_id: null,
}
```

The `ai_memories` collection uses a unique compound index on:

```text
guild_id + scope + subject_id + key
```

Personal records use `guild_id: null`; server records use the real guild ID and `subject_id: null`. Records also retain source guild/channel/message IDs, creator ID, and creation/update timestamps. Memories do not expire automatically.

The `ai_message_stats` collection is keyed by the Discord response message ID and additionally records the guild ID for scoped lookup.

All configuration and memory writes are direct MongoDB operations. There is no in-memory settings or memory cache.

## Permissions and privacy boundaries

The bot needs View Channel, Read Message History, and Send Messages in an invoked channel. A referenced rules or mentioned channel is included only if both the requesting member and the bot can view it and read its history.

Important boundaries:

- DMs are unsupported for the AI commands and handler.
- `AI_ALLOWED_GUILD_IDS`, when populated, is checked for conversational and Remember context actions.
- User memories are global to their owner but never administrator-manageable.
- Server memories are guild-scoped and administrator-managed.
- Asking the AI about another user's selected message does not expose that user's personal memory.
- Context inspection is limited to the response requester or Manage Server.
- Generated mentions cannot notify anyone.
- Server context, message text, quotes, and nicknames cannot redefine authoritative Discord author IDs.

## Source map

| File | Responsibility |
| --- | --- |
| `src/config.js` | Environment parsing, model defaults, default system prompt. |
| `src/modules/ai.js` | Invocation, context assembly, Gemini calls, fallback, output, errors, and stats. |
| `src/modules/loadImageParts.js` | Image download, validation, resize, WebP conversion, and GIF frame sampling. |
| `src/modules/aiFoodCard.js` | Food contract parsing, optional Unsplash lookup, and Components V2 rendering. |
| `src/modules/aiMemory.js` | Focused context collection and Gemini memory extraction. |
| `src/modules/rememberAiMemory.js` | Context-command authorization, extraction orchestration, and save response. |
| `src/modules/aiSampleMessagesPanel.js` | Paginated sample-message Components V2 interface. |
| `src/modules/db.js` | Persisted defaults, settings, stats, samples, and memory CRUD/indexes. |
| `commands/ai/` | Slash-command configuration and memory management. |
| `commands/context/` | Ask, sample, stats, and Remember message context commands. |
| `events/messageCreate.js` | Passes new messages to the AI handler. |
| `events/interactionCreate.js` | Handles system-prompt and sample-panel modals/buttons. |
| `events/ready.js` | Builds dynamic command data and globally deploys application commands. |
| `index.js` | Loads commands, events, and modules; initializes MongoDB and Discord. |

## Operational checklist

For a new deployment:

1. Install dependencies with `npm install`.
2. Configure the required Discord, MongoDB, and Gemini values described by `.env.example`.
3. Optionally set a guild allowlist and Unsplash access key.
4. Start with `npm start` or `npm run dev`.
5. Confirm global commands deploy without a Discord 50035 validation error.
6. Run `/ai enable` in an allowed guild.
7. Ensure the bot has View Channel, Read Message History, and Send Messages.
8. Configure `/ai ruleschannel` and verify `/ai status`.
9. Add a diverse set of current production samples through `/ai samplemessages` or the message context menu.
10. Test a normal mention, a reply, Ask, image input, a food card, both memory scopes, and View AI stats.

Before changing AI behavior, identify the correct layer:

- edit the system prompt for persona and general judgment;
- edit runtime boundaries for provider output contracts;
- edit context assembly for what the model knows;
- edit JavaScript renderers for exact UI guarantees;
- edit direct permission/database logic for privacy and persistence.

Avoid adding another output regex, retry loop, cache, embedding system, or model unless a repeated observed failure demonstrates that the simpler design is insufficient.

## Troubleshooting history

These failures have already occurred during development:

| Symptom | Meaning or fix |
| --- | --- |
| Gemini HTTP 404 says a model is unavailable to new users | The API key is valid, but that model is unavailable for the project. Change `GEMINI_MODEL` or `GEMINI_FALLBACK_MODEL` to an available model; do not change response logic just to hide it. |
| Gemini HTTP 503 reports high demand | The primary is temporarily overloaded. The implementation now tries the fallback model. A final 503 uses the general sleeping error response. |
| Gemini HTTP 429 reports quota exhaustion | The primary is retried on the fallback. A final 429 produces the official tired image and retry message. Higher long-term limits require a suitable provider plan or model, not more prompt changes. |
| Gemini HTTP 400 rejects `media_resolution` | The previously supplied enum/value was not accepted by the endpoint. The field is no longer sent; image parts use supported `inline_data` only. |
| Discord `UND_ERR_CONNECT_TIMEOUT` | Discord's HTTPS connection timed out while sending, independently of Gemini. The send is retried once. |
| Discord application-command HTTP 400 / code 50035 says context menus cannot have options or descriptions | A slash subcommand group was being registered as a top-level command. The loader must continue skipping both `SlashCommandSubcommandBuilder` and `SlashCommandSubcommandGroupBuilder`. Context menus themselves must have only a name and message type. |
| `Ask <bot>` says it could not respond | Check `/ai status`, guild allowlisting, channel permissions, cooldown, and whether another request is active. The command now reports these statuses separately instead of collapsing them into one generic message. |
| The testing bot responds but the production bot does not | Compare the deployed branch, application identity, guild settings document, `AI_ALLOWED_GUILD_IDS`, bot permissions, and whether `/ai enable` was run for that application/environment. Settings are database/environment-specific. |
| Food Machine prints `[[FOOD_CARD]]` and JSON | The running process does not have the current parser/renderer, or Gemini returned malformed contract data. Confirm the deployed branch and inspect the raw response through logs. |
| An ordinary food-related question becomes a meal card | Keep the explicit-intent exclusions in the runtime food contract. The fix is classification guidance, not a growing list of dish-name exceptions. |
| Food cards never have images | `UNSPLASH_ACCESS_KEY` is optional. Without it, or when search fails, image-free cards are expected. |
| Unsplash returns HTTP 401 with an OAuth error | Supply the application's Access Key, not its Secret Key or an unrelated OAuth token. The current implementation sends it as the `client_id` search parameter. Restart the running process after changing configuration. |
| A simple dish has no Unsplash result even though the website finds one | Inspect the API warning and exact generated dish name. Website search and API ranking can differ; the card intentionally falls back without failing the AI response. |
| The AI repeats the full context schema | Historical Discord objects must remain reference text in a user turn, and the runtime contract must continue to prohibit schema output. They must not be converted into Gemini `model` history turns. |
| The AI attributes Food Machine's earlier statement to the current user | Preserve author IDs, bot identity, reply IDs, and the separate current-message section. Do not flatten the conversation into unattributed prose. |
| The AI keeps repeating one old joke, slang phrase, or emoji | Remove repetitive samples, add varied representative samples, and keep old live conversation from defining baseline style. Prompt edits alone cannot compensate for a narrow or stale sample set. |
| Rule-number answers describe punishment point totals | Ensure the rules channel is readable and retain Components V2 extraction plus the prompt distinction between numbered rules and enforcement tables. |
| Input usage returns to 10,000+ tokens | Use `View AI stats` and inspect `ai-context.txt`. Look for large rules, mentioned-channel data, inventories, user profiles, or image parts before reducing useful current-channel history. |

## Known limitations and intentional non-features

- The model has no web search or automatic live trend feed. Current voice comes from maintained server samples.
- Memory is explicit, not automatically inferred from every conversation.
- Memory relevance is lexical rather than semantic embedding search.
- Existing legacy guild-scoped personal memories are not migrated.
- Rules are only as accurate as the configured channel content and permissions allow.
- Vision only covers explicitly supplied attachment sources; it cannot visually inspect an arbitrary channel merely from its name.
- Unsplash failures silently degrade to image-free food cards.
- Global application-command changes may take time to appear in Discord clients.
- Token use varies with context. The implementation optimizes relevance and character budgets but does not enforce a hard input-token ceiling.
- Provider model names, quotas, prices, availability, and usage metadata can change independently of this repository.
