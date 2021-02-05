const Discord = require("discord.js");
const config = require("./config.json");

const ytdl = require("ytdl-core");
const request = require("request");
const getYoutubeID = require("get-youtube-id");
const fetchVideoInfo = require("youtube-info");
const ffmpeg = require('fluent-ffmpeg');
const WitSpeech = require('node-witai-speech');
const decode = require('./decodeOpus.js');
const fs = require('fs');
const path = require('path');
const opus = require('node-opus');

const client = new Discord.Client();


const prefix = config.prefix;

const discord_token = config.BOT_TOKEN;

const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));


const recordingsPath = makeDir('./recordings');
var queue = [];
var isPlaying = false;
var dispatcher = null;
var voiceChannel = null;
var textChannel = null;
var listenConnection = null;
var listenReceiver = null;
var listenStreams = new Map();
var skipReq = 0;
var skippers = [];
var listening = false;

// client.on("message", function(message) {
//     if (message.author.bot) return;
//     if (!message.content.startsWith(prefix)) return;
//
//     const commandBody = message.content.slice(prefix.length);
//     const args = commandBody.split(' ');
//     const command = args.shift().toLowerCase();
//     const timeTaken = Date.now() - message.createdTimestamp;
//     message.reply(`Pong! This message had a latency of ${timeTaken}ms.`);
// });
// // console.log(' hola');
// client.login(config.BOT_TOKEN);

client.login(discord_token);
client.on('ready', handleReady.bind(this));

client.on('message', handleMessage.bind(this));

client.on('guildMemberSpeaking', handleSpeaking.bind(this));
/*
client.on("guildMemberSpeaking", function(member, speaking){
    console.log(`a guild member starts/stops speaking: ${member.tag}`);
});*/

// client.channels.cache.get("General")
// console.log(client.channels.cache)

// client.on("ready", () => {
//
// });

function handleReady() {
    console.log("I'm ready!");
    // console.log(fs.createWriteStream('fsdfs.pcm'));

    // const channel = client.channels.cache.get("691039420136292407");
    // if (!channel) return console.error("The channel does not exist!");
    // channel.join().then(connection => {
    //     // Yay, it worked!
    //     console.log("Successfully connected.");
    // }).catch(e => {
    //     // Oh no, it errored! Let's log it to console :)
    //     console.error(e);
    // });
}

function handleMessage(message) {
    if (!message.content.startsWith(prefix)) {
        return;
    }
    var command = message.content.toLowerCase().slice(1).split(' ');
    if ((command[0] == 'play' && command[1] == 'list') || command[0] == 'playlist') {
        command = 'playlist';
    }
    else {
        command = command[0];
    }

    switch (command) {
        case 'leave':
            commandLeave();
            break;
        case 'play':
            textChannel = message.channel;
            commandPlay(message.member, message.content);
            break;
        case 'playlist':
            textChannel = message.channel;
            commandPlaylist(message.member, message.content);
            break;
        case 'skip':
        case 'next':
            textChannel = message.channel;
            commandSkip();
            break;
        case 'pause':
            commandPause();
            break;
        case 'resume':
            commandResume();
            break;
        case 'volume':
            commandVolume(message.content);
            break;
        case 'listen':
            textChannel = message.channel;
            commandListen(message);
            break;
        case 'stop':
            commandStop();
            break;
        case 'reset':
        case 'clear':
            commandReset();
            break;
        case 'repeat':
            textChannel = message.channel;
            commandRepeat(message.member, message.content);
            break;
        case 'image':
            textChannel = message.channel;
            commandImage(message.member, message.content);
            break;
        default:
            message.reply(" command not recognized! Type '!help' for a list of commands.");
    }
}


function handleSpeech(member, speech) {
    var command = speech.toLowerCase().split(' ');
    if ((command[0] == 'play' && command[1] == 'list') || command[0] == 'playlist') {
        command = 'playlist';
    }
    else {
        command = command[0];
    }
    // console.log(command);
    switch (command) {
        case 'listen':
            speechListen();
            break;
        case 'leave':
            speechLeave();
            break;
        case 'play':
            commandPlay(member, speech);
            break;
        case 'playlist':
            commandPlaylist(member, speech);
            break;
        case 'skip':
        case 'next':
            commandSkip();
            break;
        case 'pause':
            commandPause();
            break;
        case 'resume':
            commandResume();
            break;
        case 'stop':
            commandStop();
            break;
        case 'reset':
        case 'clear':
            commandReset();
            break;
        case 'repeat':
            commandRepeat(member, speech);
            break;
        case 'image':
            commandImage(member, speech);
            break;
        default:
    }
}

function handleSpeaking(member, speaking) {
    // Close the writeStream when a member stops speaking
    console.log(222)
    if (!speaking && member.voice.channel) {
        let stream = listenStreams.get(member.id);
        if (stream) {
            listenStreams.delete(member.id);
            stream.end(err => {
                if (err) {
                    console.error(err);
                }

                let basename = path.basename(stream.path, '.opus_string');
                let text = "default";

                // decode file into pcm
                decode.convertOpusStringToRawPCM(stream.path,
                    basename,
                    (function() {
                        processRawToWav(
                            path.join('./recordings', basename + '.raw_pcm'),
                            path.join('./recordings', basename + '.wav'),
                            (function(data) {
                                if (data != null) {
                                    handleSpeech(member, data._text);
                                }
                            }).bind(this))
                    }).bind(this));
            });
        }
    }
}

function commandPlay(member, msg) {
    // console.log(JSON.stringify(client.channels.get('691039420136292407')));
    if (!member.voiceChannel) {
        return;
    }
    if (!voiceChannel) {
        voiceChannel = member.voiceChannel;
    }
    var args = msg.toLowerCase().split(' ').slice(1).join(" ");
    args = reduceTrailingWhitespace(args);
    if (args.length != 0) playRequest(args);
}

function commandPlaylist(member, msg) {
    if (!member.voiceChannel) {
        return;
    }
    if (!voiceChannel) {
        voiceChannel = member.voiceChannel;
    }

    var args = msg;
    if (args.indexOf(prefix) == 0) {
        args = args.slice(1);
    }
    args = args.toLowerCase().split(' ');
    if (args[0] == 'play' && args[1] == 'list') {
        args = args.slice(2).join(" ");
    }
    else {
        args = args.slice(1).join(" ");
    }

    args = reduceTrailingWhitespace(args);
    if (args.length != 0) playlistRequest(args);
}

function commandSkip() {
    if (queue.length > 0) {
        skipSong();
        textChannel.send("Skipping current song!");
    }
}

function commandPause() {
    if (dispatcher) {
        dispatcher.pause();
    }
}

function commandResume() {
    if (dispatcher) {
        dispatcher.resume();
    }
}

function commandVolume(msg) {
    var args = msg.toLowerCase().split(' ').slice(1).join(" ");
    var vol = parseInt(args);
    if (!isNaN(vol)
        && vol <= 100
        && vol >= 0) {
        dispatcher.setVolume(vol / 100.0);
    }
}

function commandListen(message) {
    member = message.member;
    // console.log(JSON.stringify(member.voice.channel));
    if (!member) {
        return;
    }
    if (!member.voice.channel) {
        message.reply(" you need to be in a voice channel first.")
        return;
    }
    if (listening) {
        message.reply(" a voice channel is already being listened to!");
        return;
    }

    listening = true;
    voiceChannel = member.voice.channel;
    textChannel.send('Listening in to **' + member.voice.channel.name + '**!');

    var recordingsPath = path.join('.', 'recordings');
    makeDir(recordingsPath);

    voiceChannel.join().then((connection) => {
        // listenConnection.set(member.voice.channelId, connection);
        listenConnection = connection;

        const audio = connection.receiver.createStream(member);
        tmp(connection);
        audio.on("speaking", (chunk) => {
            // console.log(chunk);
            // console.log(`Received ${chunk.length} bytes of data.`);
        });
        // connection.play(audio, { end: "manual" });
        let receiver = connection.receiver.createStream(member, {mode: 'opus'});
        // let receiver = connection.createReceiver();
        // listenStreams.set(member.id, 1);
        receiver.on('opus', function(user, data) {

            let hexString = data.toString('hex');
            let stream = listenStreams.get(user.id);
            if (!stream) {
                if (hexString === 'f8fffe') {
                    return;
                }
                let outputPath = path.join(recordingsPath, `${user.id}-${Date.now()}.opus_string`);
                stream = fs.createWriteStream(outputPath);
                listenStreams.set(user.id, stream);
            }
            stream.write(`,${hexString}`);
        });
        // listenReceiver.set(member.voiceChannelId, receiver);
        listenReceiver = receiver;
        // console.log(listenReceiver)
    }).catch(console.error);
}

function commandStop() {
    if (listenReceiver) {
        listening = false;
        listenReceiver.destroy();
        listenReceiver = null;
        textChannel.send("Stopped listening!");
    }
}

function commandLeave() {
    listening = false;
    queue = []
    if (dispatcher) {
        dispatcher.end();
    }
    dispatcher = null;
    commandStop();
    if (listenReceiver) {
        listenReceiver.destroy();
        listenReceiver = null;
    }
    if (listenConnection) {
        listenConnection.disconnect();
        listenConnection = null;
    }
    if (voiceChannel) {
        voiceChannel.leave();
        voiceChannel = null;
    }
}

function commandReset() {
    if (queue.length > 0) {
        queue = [];
        if (dispatcher) {
            dispatcher.end();
        }
        textChannel.send("The queue has been cleared.");
    }
}

function commandRepeat(member, msg) {
    if (!member.voiceChannel) {
        textChannel.send(" you need to be in a voice channel first.")
        return;
    }

    msg = msg.toLowerCase().split(' ').slice(1).join(" ");
    voiceChannel = member.voiceChannel;
    voiceChannel.join().then((connection) => {
        textChannel.send(msg, {
            tts: true
        });
    });
}

function commandImage(member, msg) {
    var args = msg.toLowerCase().split(' ').slice(1).join(" ");
    var ext = '';
    if (args.indexOf('gif') > -1) {
        ext = '+ext:gif';
    }
    console.log("searching for image!");
    const options = {
        url: 'https://api.imgur.com/3/gallery/search/top/week/0/?q=' + args + ext,
        headers: {
            'Authorization': 'Client-ID ' + IMGUR_API_KEY
        }
    };
    request.get(options, (error, response, body) => {

        let json = JSON.parse(body);
        if (!body || json.data.length < 1) {
            textChannel.send("No results were found!");
            return;
        }
        let item = getRandomItem(json.data);
        var link;
        if (item.is_album) {
            link = getRandomItem(item.images).link;
        }
        else {
            link = item.link;
        }
        var embed = new Discord.RichEmbed()
            .setImage(link);
        textChannel.send({embed});
    });
}

function skipSong() {
    if (dispatcher) {
        dispatcher.end();
    }
}

function playRequest(args) {
    if (queue.length > 0 || isPlaying) {
        getID(args, function (id) {
            if (id == null) {
                textChannel.send("Sorry, no search results turned up");
            }
            else {
                add_to_queue(id);
                fetchVideoInfo(id, function(err, videoInfo) {
                    if (err) throw new Error(err);
                    textChannel.send("Added to queue **" + videoInfo.title + "**");
                });
            }
        });
    }
    else {
        getID(args, function(id) {
            if (id == null) {
                textChannel.send("Sorry, no search results turned up");
            }
            else {
                isPlaying = true;
                queue.push("placeholder");
                playMusic(id);

            }
        });
    }
}

function playlistRequest(args) {
    if (queue.length > 0 || isPlaying) {
        search_playlist(args, function(body) {
            if (!body) {
                textChannel.send("Sorry, no search results turned up");
            }
            else {
                textChannel.send("Playlist for '**" + args + "**' added to queue");
                json = JSON.parse(body);
                isPlaying = true;
                items = shuffle(json.items);
                items.forEach((item) => {
                    add_to_queue(item.id.videoId);
                });
            }
        });
    }
    else {
        search_playlist(args, function(body) {
            if (!body) {
                textChannel.send("Sorry, no search results turned up");
            }
            else {
                json = JSON.parse(body);
                isPlaying = true;
                items = shuffle(json.items);
                queue.push("placeholder");
                items.slice(1).forEach((item) => {
                    add_to_queue(item.id.videoId);
                });
                playMusic(items[0].id.videoId);
            }
        });
    }
}

function playMusic(id) {
    //voiceChannel = message.member.voiceChannel;
    voiceChannel.join().then(function(connection) {
        console.log("playing");
        stream = ytdl("https://www.youtube.com/watch?v=" + id, {
            filter: 'audioonly'
        });
        skipReq = 0;
        skippers = [];
        dispatcher = connection.playStream(stream);
        fetchVideoInfo(id, function(err, videoInfo) {
            if (err) throw new Error(err);
            textChannel.send("Now playing **" + videoInfo.title + "**");
        });
        dispatcher.on('end', function() {
            dispatcher = null;
            queue.shift();
            console.log("queue size: " + queue.length);
            if (queue.length === 0) {
                queue = [];
                isPlaying = false;
            }
            else {
                setTimeout(function() {
                    playMusic(queue[0]);
                }, 2000);
            }
        })
    });
}

function isYoutube(str) {
    return str.toLowerCase().indexOf("youtube.com") > -1;
}

function getID(str, cb) {
    if (isYoutube(str)) {
        cb(getYoutubeID(str));
    }
    else {
        search_video(str, function(id) {
            cb(id);
        });
    }
}

function add_to_queue(strID) {
    if (isYoutube(strID)) {
        queue.push(getYoutubeID(strID));
    }
    else {
        queue.push(strID);
    }
}

function search_video(query, callback) {
    request("https://www.googleapis.com/youtube/v3/search?part=id&type=video&q=" + encodeURIComponent(query) + "&key=" + YT_API_KEY, function(error, response, body) {
        var json = JSON.parse(body);

        if (json.items[0] == null) {
            callback(null);
        }
        else {
            callback(json.items[0].id.videoId);
        }
    });
}

function search_playlist(query, callback) {
    var maxResults = 40
    request("https://www.googleapis.com/youtube/v3/search?part=id&type=video&q=" + encodeURIComponent(query) + "&key=" + YT_API_KEY + "&maxResults=" + 40, function(error, response, body) {
        var json = JSON.parse(body);

        if (json.items[0] == null) {
            callback(null);
        }
        else {
            callback(body);
        }
    });
}

function processRawToWav(filepath, outputpath, cb) {
    fs.closeSync(fs.openSync(outputpath, 'w'));
    var command = ffmpeg(filepath)
        .addInputOptions([
            '-f s32le',
            '-ar 48k',
            '-ac 1'
        ])
        .on('end', function() {
            // Stream the file to be sent to the wit.ai
            var stream = fs.createReadStream(outputpath);

            // Its best to return a promise
            var parseSpeech =  new Promise((ressolve, reject) => {
                // call the wit.ai api with the created stream
                WitSpeech.extractSpeechIntent(WIT_API_KEY, stream, content_type,
                    (err, res) => {
                        if (err) return reject(err);
                        ressolve(res);
                    });
            });

            // check in the promise for the completion of call to witai
            parseSpeech.then((data) => {
                console.log("you said: " + data._text);
                cb(data);
                //return data;
            })
                .catch((err) => {
                    console.log(err);
                    cb(null);
                    //return null;
                })
        })
        .on('error', function(err) {
            console.log('an error happened: ' + err.message);
        })
        .addOutput(outputpath)
        .run();
}

function makeDir(dir) {
    try {
        fs.mkdirSync(dir);
    } catch (err) {}
}

function reduceTrailingWhitespace(string) {
    for (var i = string.length - 1; i >= 0; i--) {
        if (string.charAt(i) == ' ') string = string.slice(0, i);
        else return string;
    }
    return string;
}

function getRandomItem(arr) {
    var index = Math.round(Math.random() * (arr.length - 1));
    return arr[index];
}

function shuffle(array) {
    var currentIndex = array.length, temporaryValue, randomIndex;

    // While there remain elements to shuffle...
    while (0 !== currentIndex) {

        // Pick a remaining element...
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;

        // And swap it with the current element.
        temporaryValue = array[currentIndex];
        array[currentIndex] = array[randomIndex];
        array[randomIndex] = temporaryValue;
    }

    return array;
}

function generateOutputFile(channel){
    // const filename = `./recordings/${channel.id}--${Date.now()}.pcm`;
    console.log(`./recordings/${channel.id}--${Date.now()}.pcm`);
    return fs.createWriteStream(`./recordings/444444--${Date.now()}.pcm`);
}

function tmp(connection){
    const receiver = connection.receiver;
    console.log('tmp function');
    connection.on('speaking', (user, speaking) => {
        textChannel.send(`I'm listening to ${user}`);
        const audioStream = receiver.createStream(user);
        const outputStream = generateOutputFile(voiceChannel);
        audioStream.pipe(outputStream);
        outputStream.on('data', console.log);
        audioStream.on('end', () => {
            textChannel.send(`I'm no longer listening to ${user}`);
        });
    })
}

