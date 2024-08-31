require('dotenv').config();
const express = require('express');


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

const getPlaylistID = async (token, playlistUrl) => {
    const playlistID = playlistUrl.split("playlist/")[1].split("?")[0];
    const playlistTracks = await fetch(`https://api.spotify.com/v1/playlists/${playlistID}/tracks`, 
        {
            headers : {
                "Authorization": `${token.token_type} ${token.access_token}`
            }
        }
    )

    console.log(await playlistTracks.json());



}

const main = async () => {
    const token = await getToken();
    getPlaylistID(token, "https://open.spotify.com/playlist/28oszO2MY6o97B3yYFkiWO?si=6c6496aa66f842d7&pt=a0e5e4e29b041ec052bc045b00afc2d7")
    
}

main();
