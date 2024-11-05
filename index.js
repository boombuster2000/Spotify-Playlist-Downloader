require('dotenv').config();
const express = require('express');
const fs = require('fs');

const app = express()
const PORT = 3000;
const client_id = process.env.CLIENT_ID; 
const client_secret = process.env.CLIENT_SECRET;

const getToken = async () => {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    body: new URLSearchParams({
      'grant_type': 'client_credentials',
    }),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + (Buffer.from(client_id + ':' + client_secret).toString('base64')),
    },
  });

  return await response.json();
}

const getPlaylistItems = async (token, playlistUrl) => {
    const playlistID = playlistUrl.split("playlist/")[1].split("?")[0];
    const request = await fetch(`https://api.spotify.com/v1/playlists/${playlistID}/tracks`, 
        {
            headers : {
                "Authorization": `${token.token_type} ${token.access_token}`
            }
        }
    );

    const response = await request.json();
    //fs.writeFileSync("./response.json", JSON.stringify(response, null, 4));

    const playlistTracks = [];

    for (const item of response.items) {
      const artists = []
      for (const artist of item.track.artists) {
        artists.push(artist.name);
      }

      playlistTracks.push({
        "name": item.track.name, 
        "artists": artists
      });
    }

    return playlistTracks;
}

const main = async () => {
    const token = await getToken();
    const tracks = await getPlaylistItems(token, "https://open.spotify.com/playlist/28oszO2MY6o97B3yYFkiWO?si=6c6496aa66f842d7&pt=a0e5e4e29b041ec052bc045b00afc2d7")
}

main();
