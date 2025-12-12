import 'dotenv/config';
import express from 'express';
import { Client, GatewayIntentBits, GuildScheduledEvent } from 'discord.js';
import {
  ButtonStyleTypes,
  InteractionResponseFlags,
  InteractionResponseType,
  InteractionType,
  MessageComponentTypes,
  verifyKeyMiddleware,
} from 'discord-interactions';
import { getRandomEmoji, DiscordRequest, check_user_talking_to_bot_in_wrong_channel, assignRoleOnJoinEvent } from './utils.js';
import { formatResult, getShuffledOptions, getResult } from './game.js';
import { add_active_game, get_active_game, move_to_finished_game } from './db.js';

//Create a bot client
const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildScheduledEvents
  ],
});

bot.on('clientReady', () => {
  console.log(`Logged in as ${bot.user.tag}`);
});

bot.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  await check_user_talking_to_bot_in_wrong_channel(message);
  
});

bot.on('guildScheduledEventUserAdd', async (guildScheduledEvent, user) => {

  console.log(`User ${user.tag} added to event "${guildScheduledEvent.name}"`);

  await assignRoleOnJoinEvent(guildScheduledEvent, user);

});


bot.on('guildScheduledEventUserRemove', async (guildScheduledEvent, user ) => {

  console.log(`User ${user.tag} removed from event "${guildScheduledEvent.name}"`);
});

bot.login(process.env.DISCORD_TOKEN);

// Create an express app
const app = express();
// Get port, or default to 3000
const PORT = process.env.PORT || 3000;
// To keep track of our active games
const activeGames = {};

app.post('/ha/mine', express.json(), async (req, res) => {
  const { event, token } = req.body;

  if (token !== process.env.DISCORD_TOKEN) return res.status(403).send({ error: 'Invalid token' });

  console.log("Received minecraft HA request:", req.body);

  try {
    const mineinfo_channel = await bot.channels.fetch('1422955603868909638');

    if (event === 'minecraft_down') {
      await mineinfo_channel.send("⚠️ Minecraft server went down. We're working on it! 🛠️");
    } 
    else if (event === 'minecraft_up') {
      await mineinfo_channel.send('✅ Minecraft server is back up. Go get your diamonds!');
    } 
    else {
      return res.status(400).send({ error: 'Unknown event' });
    }

    res.status(200).send({ status: 'ok' }); 
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'Failed to send message' });
  }
});

/**
 * Interactions endpoint URL where Discord will send HTTP requests
 * Parse request body and verifies incoming requests using discord-interactions package
 */
app.post('/interactions', verifyKeyMiddleware(process.env.PUBLIC_KEY), async function (req, res) {
  // Interaction id, type and data
  const { id, type, data } = req.body;

  /**
   * Handle verification requests
   */
  if (type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  /**
   * Handle slash command requests
   * See https://discord.com/developers/docs/interactions/application-commands#slash-commands
   */
  if (type === InteractionType.APPLICATION_COMMAND) {
    const { name } = data;

    // "test" command
    if (name === 'test') {
      // Send a message into the channel where command was triggered from
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          flags: InteractionResponseFlags.IS_COMPONENTS_V2,
          components: [
            {
              type: MessageComponentTypes.TEXT_DISPLAY,
              // Fetches a random emoji to send from a helper function
              content: `Eggman I miss my wife too ${getRandomEmoji()}`
            }
          ]
        },
      });
    }

    // "challenge" command
    if (name === 'challenge' && id) {
      // Interaction context
      const context = req.body.context;
      // User ID is in user field for (G)DMs, and member for servers
      const userId = context === 0 ? req.body.member.user.id : req.body.user.id;
      // User's object choice
      const objectName = req.body.data.options[0].value;

      // Create active game using message ID as the game ID
      await add_active_game(req.body.id, userId, objectName);

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          flags: InteractionResponseFlags.IS_COMPONENTS_V2,
          components: [
            {
              type: MessageComponentTypes.TEXT_DISPLAY,
              // Fetches a random emoji to send from a helper function
              content: `Rock papers scissors challenge from <@${userId}>`,
            },
            {
              type: MessageComponentTypes.ACTION_ROW,
              components: [
                {
                  type: MessageComponentTypes.BUTTON,
                  // Append the game ID to use later on
                  custom_id: `accept_button_${req.body.id}`,
                  label: 'Accept',
                  style: ButtonStyleTypes.PRIMARY,
                },
              ],
            },
          ],
        },
      });
    }

    console.error(`unknown command: ${name}`);
    return res.status(400).json({ error: 'unknown command' });
  }

if (type === InteractionType.MESSAGE_COMPONENT) {
  // custom_id set in payload when sending message component
  const componentId = data.custom_id;

  if (componentId.startsWith('accept_button_')) {
    // get the associated game ID
    const gameId = componentId.replace('accept_button_', '');
    // Delete message with token in request body
    const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/${req.body.message.id}`;
    try {
      await res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          // Indicates it'll be an ephemeral message
          flags: InteractionResponseFlags.EPHEMERAL | InteractionResponseFlags.IS_COMPONENTS_V2,
          components: [
            {
              type: MessageComponentTypes.TEXT_DISPLAY,
              content: 'What is your object of choice?',
            },
            {
              type: MessageComponentTypes.ACTION_ROW,
              components: [
                {
                  type: MessageComponentTypes.STRING_SELECT,
                  // Append game ID
                  custom_id: `select_choice_${gameId}`,
                  options: getShuffledOptions(),
                },
              ],
            },
          ],
        },
      });
      // Delete previous message
      await DiscordRequest(endpoint, { method: 'DELETE' });
    } catch (err) {
      console.error('Error sending message:', err);
    }
  } else if (componentId.startsWith('select_choice_')) {
    // get the associated game ID
    const gameId = componentId.replace('select_choice_', '');

    // Fetch active game from database
    const game = await get_active_game(gameId);

    if (game) {
      // Interaction context
      const context = req.body.context;
      // Get user ID and object choice for responding user
      // User ID is in user field for (G)DMs, and member for servers
      const userId = context === 0 ? req.body.member.user.id : req.body.user.id;
      const objectName = data.values[0];

      // Calculate result from helper function
      const result = getResult(
        { id: game.user_id, objectName: game.object_name },
        { id: userId, objectName: objectName }
      );

      const resultStr = formatResult(result);
      const winnerId = result.win.id;

      // Remove game from storage
      await move_to_finished_game(gameId, winnerId);

      // Update message with token in request body
      const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/${req.body.message.id}`;

      try {
        // Send results
        await res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: InteractionResponseFlags.IS_COMPONENTS_V2,
            components: [
              {
                type: MessageComponentTypes.TEXT_DISPLAY,
                content: resultStr
              }
            ]
            },
        });
        // Update ephemeral message
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            components: [
              {
                type: MessageComponentTypes.TEXT_DISPLAY,
                content: 'Nice choice ' + getRandomEmoji()
              }
            ],
          },
        });
      } catch (err) {
        console.error('Error sending message:', err);
      }
    }
  }

  return;
}



  console.error('unknown interaction type', type);
  return res.status(400).json({ error: 'unknown interaction type' });
});

app.listen(PORT, () => {
  console.log('Listening on port', PORT);
});
