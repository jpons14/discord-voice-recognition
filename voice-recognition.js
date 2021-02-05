const Discord = require('discord.js');
const config = require('./config.json');
require('dotenv').config();
const googleSpeech = require('@google-cloud/speech');
const googleSpeechClient = new googleSpeech.SpeechClient();
const fs = require('fs')


const discordClient = new Discord.Client();
discordClient.commands = new Discord.Collection();

discordClient.on('ready', () => {
    console.log(`Logged in as ${discordClient.user.tag}!`)
});

discordClient.login(config.BOT_TOKEN);
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    discordClient.commands.set(command.name, command);
}

const {Transform} = require('stream')
// GOOGLE_APPLICATION_CREDENTIALS="C:\apps\discord-bots\voice-recorder\google-credentials.json" node voice-recognition.js
function convertBufferTo1Channel(buffer) {
    const convertedBuffer = Buffer.alloc(buffer.length / 2)

    for (let i = 0; i < convertedBuffer.length / 2; i++) {
        const uint16 = buffer.readUInt16LE(i * 4)
        convertedBuffer.writeUInt16LE(uint16, i * 2)
    }

    return convertedBuffer
}

class ConvertTo1ChannelStream extends Transform {
    constructor(source, options) {
        super(options)
    }

    _transform(data, encoding, next) {
        next(null, convertBufferTo1Channel(data))
    }
}
discordClient.on('voiceStateUpdate', (oldState, newState) => {
    // console.log('newState.voice', newState.member.voice);
});


discordClient.on('voiceStateUpdate', async (oldPresence, newPresence) => {
    // console.log(newPresence.member)
    const member = newPresence.member;
    const channelName = 'programming';
    let generalChannel = member.guild.channels.cache.find(channel => channel.name === channelName);
    // return ;
    const presence = newPresence;
    const memberVoiceChannel = member.voice.channel;
    // console.log('JSON.stringify(newPresence.member)', JSON.stringify(newPresence.member));
    // const queue = message.client.queue;

    // return;
    if (!presence || !memberVoiceChannel) {
        return;
    }

    const connection = await memberVoiceChannel.join();
    const receiver = connection.receiver;
    // console.log('connection', connection);
    connection.on('speaking', (user, speaking) => {
        if (!speaking) {
            return;
        }

        console.log(`I'm listening to ${user.username}`);

        const audioStream = receiver.createStream(user, {mode: 'pcm'});
        const requestConfig = {
            encoding: 'LINEAR16',
            sampleRateHertz: 48000,
            languageCode: 'en-US'
        };
        const request = {
            config: requestConfig
        }

        const recognizeStream = googleSpeechClient
            .streamingRecognize(request)
            .on('error', console.error)
            .on('data', response => {
                const transcription = response.results
                    .map(result => result.alternatives[0].transcript)
                    .join('\n')
                    .toLowerCase();
                console.log(`Transcription: ${transcription}`)
                if (transcription.includes('play')){
                    generalChannel.send(config.prefix + '' + transcription)
                }
                if (transcription.includes('stop')){
                    generalChannel.send(config.prefix + '' + transcription);
                }

            })

        const convertTo1ChannelStream = new ConvertTo1ChannelStream();

        audioStream.pipe(convertTo1ChannelStream).pipe(recognizeStream);

        audioStream.on('end', async () => {
            console.log('audioStream end')
        });

    });
});

discordClient.on('message', async message => {
    const args = message.content.slice(config.prefix.length).split(/ +/);
    const commandName = args.shift().toLowerCase();
    const command = discordClient.commands.get(commandName);

    // if (message.author.bot) return;
    if (!message.content.startsWith(config.prefix)) return;

    try {
        if(commandName == "ban" || commandName == "userinfo") {
            command.execute(message, discordClient);
        } else {
            command.execute(message);
        }
    } catch (error) {
        console.error(error);
        message.reply('There was an error trying to execute that command!');
    }
});

