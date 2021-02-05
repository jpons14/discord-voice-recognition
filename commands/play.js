const ytdl = require("ytdl-core");
const YouTubeAPI = require("simple-youtube-api");
const youtube = new YouTubeAPI('AIzaSyBq5OYNLKSO5mwfYO8jTfgqyH6znuDFULg');
const Discord = require('discord.js');


module.exports = {
  name: "play",
  description: "Play a song in your channel!",
  async execute(message) {
    try {
      const args = message.content.split(" ");
      if (message.client.queue === undefined){
        message.client.queue = new Discord.Collection();
      }
      const queue = message.client.queue;


      console.log('message.client', message.client.queue);
      const serverQueue = message.client.queue.get(message.guild.id);

      const voiceChannel = message.member.voice.channel;
      if (!voiceChannel)
        return message.channel.send(
          "You need to be in a voice channel to play music!"
        );
      const permissions = voiceChannel.permissionsFor(message.client.user);
      if (!permissions.has("CONNECT") || !permissions.has("SPEAK")) {
        return message.channel.send(
          "I need the permissions to join and speak in your voice channel!"
        );
      }

      // const songInfo = await ytdl.getInfo(args[1]);
      // const song = {
      //   title: songInfo.videoDetails.title,
      //   url: songInfo.videoDetails.video_url
      // };

      if (!serverQueue) {
        const queueContruct = {
          textChannel: message.channel,
          voiceChannel: voiceChannel,
          connection: null,
          songs: [],
          volume: 5,
          playing: true
        };

        queue.set(message.guild.id, queueContruct);

        // queueContruct.songs.push(song);
        try {
          var connection = await voiceChannel.join();
          queueContruct.connection = connection;
          this.play(message, args, serverQueue);
        } catch (err) {
          console.log(err);
          queue.delete(message.guild.id);
          return message.channel.send(err);
        }
      } else {
        // serverQueue.songs.push(song);
        // return message.channel.send(
        //   `${song.title} has been added to the queue!`
        // );
        return ;
      }
    } catch (error) {
      console.log(error);
      message.channel.send(error.message);
    }
  },

  play(message, args) {
    const queue = message.client.queue;
    const guild = message.guild;
    const serverQueue = queue.get(message.guild.id);
    if (args !== undefined && args.length > 1) {
      const textToSearch = args[1];


      youtube.searchVideos(textToSearch, 4)
          .then(results => {
            // console.log('results[0]', results[0]);
            // console.log(`The video's title is ${results[0].title}`);
            const result = results[0];
            const videoID = result.id;
            serverQueue.songs.push(result)
            console.log('results length play command', results.length);


            const dispatcher = serverQueue.connection
                .play(ytdl(videoID))
                .on("finish", () => {
                  serverQueue.songs.shift();
                  this.play(message, serverQueue.songs[0]);
                })
                .on("error", error => console.error(error));
            dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);
            serverQueue.textChannel.send(`Start playing: **${song.title}**`);

          })
          .catch(console.log);

    }
  }
};
