import 'dotenv/config';

export async function DiscordRequest(endpoint, options) {
  // append endpoint to root API URL
  const url = 'https://discord.com/api/v10/' + endpoint;
  // Stringify payloads
  if (options.body) options.body = JSON.stringify(options.body);
  // Use fetch to make requests
  const res = await fetch(url, {
    headers: {
      Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'User-Agent': 'DiscordBot (https://github.com/discord/discord-example-app, 1.0.0)',
    },
    ...options
  });
  // throw API errors
  if (!res.ok) {
    const data = await res.json();
    console.log(res.status);
    throw new Error(JSON.stringify(data));
  }
  // return original response
  return res;
}

export async function InstallGlobalCommands(appId, commands) {
  // API endpoint to overwrite global commands
  const endpoint = `applications/${appId}/commands`;

  try {
    // This is calling the bulk overwrite endpoint: https://discord.com/developers/docs/interactions/application-commands#bulk-overwrite-global-application-commands
    await DiscordRequest(endpoint, { method: 'PUT', body: commands });
  } catch (err) {
    console.error(err);
  }
}

// Simple method that returns a random emoji from list
export function getRandomEmoji() {
  const emojiList = ['😭','😄','😌','🤓','😎','😤','🤖','😶‍🌫️','🌏','📸','💿','👋','🌊','✨'];
  return emojiList[Math.floor(Math.random() * emojiList.length)];
}

export function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export async function assignRoleOnJoinEvent(event, user) {

   // EVENT ID : ROLE ID
  const event_ID_dictionary = {
    "1448683071439245362": "1448686806341128192" // Game Awards 2025
  };

  console.log(`User ${user.tag} joined event "${event.name}"`);

  // Check if event exists in dictionary
  if (!(event.id in event_ID_dictionary))
    
    {
      console.error("No role assigned for this event");
      return;
    }

  const roleId = event_ID_dictionary[event.id];
  const guild = event.guild;

  try {
    const member = await guild.members.fetch(user.id);
    const role = guild.roles.cache.get(roleId);

    if (!role) {
      console.error("Role not found");
      return;
    }

    await member.roles.add(role);
    console.log(`Gave role ${role.name} to ${user.tag} for joining event "${event.name}"`);

  } catch (err) {
    console.error("Error adding role:", err);
  }
}

export async function check_user_talking_to_bot_in_wrong_channel(message) {
// Detect messages that start with "m!"
  if (message.content.startsWith("m!") && message.channelId != "1411848535476801708") {
    try {
      await message.delete();

      // Timeout for 1 minute
      await message.member.timeout(10_000, "Tails caught you using that command in the wrong channel");

      await message.channel.send(
        `${message.author}, you shouldn't be using that command here! Go think for 10 seconds >:c`
      );
    } catch (err) {
      console.error("Could not timeout user:", err);
    }
  }
}
