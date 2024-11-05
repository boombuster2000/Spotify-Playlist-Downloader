require('dotenv').config();
const fs = require('fs');

// Validate required environment variables
const requiredEnvVars = ['CLIENT_ID', 'CLIENT_SECRET', 'YOUTUBE_API_KEY'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

const CLIENT_ID = process.env.CLIENT_ID; 
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

let tokenCache = {
  token: null,
  expiresAt: null
};

const getToken = async () => {
    // Return cached token if still valid
    if (tokenCache.token && tokenCache.expiresAt > Date.now()) {
        return tokenCache.token;
    }

    if (!CLIENT_ID || !CLIENT_SECRET) {
        throw new Error('Invalid client credentials');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            body: new URLSearchParams({
                'grant_type': 'client_credentials',
            }),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + (Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')),
            },
            signal: controller.signal
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const token = await response.json();

        // Cache token with expiration
        tokenCache = {
            token,
            expiresAt: Date.now() + (token.expires_in * 1000)
        };

        return token;
    } finally {
        clearTimeout(timeoutId);
    }
};

const extractPlaylistId = (url) => {
    try {
      const playlistUrl = new URL(url);
      const pathParts = playlistUrl.pathname.split('/');
      const playlistIndex = pathParts.indexOf('playlist');

      if (playlistIndex === -1 || !pathParts[playlistIndex + 1]) {
        throw new Error('Invalid playlist URL');
      }

      return pathParts[playlistIndex + 1];

    } catch (error) {
      throw new Error('Invalid playlist URL format');
    }
};
  
const getPlaylistItems = async (token, playlistUrl) => {
    const playlistID = extractPlaylistId(playlistUrl);
    const playlistTracks = [];
    let nextUrl = `https://api.spotify.com/v1/playlists/${playlistID}/tracks`;
  
    while (nextUrl) {
      const request = await fetch(nextUrl, {
        headers: {
          "Authorization": `${token.token_type} ${token.access_token}`
        }
      });
  
      const response = await request.json();
      
      // Validate response structure
      if (!response.items || !Array.isArray(response.items)) {
        throw new Error('Invalid response format from Spotify API');
      }
  
      for (const item of response.items) {
        if (!item?.track?.name || !Array.isArray(item?.track?.artists)) {
          continue; // Skip invalid tracks
        }
  
        playlistTracks.push({
          "name": item.track.name,
          "artists": item.track.artists.map(artist => artist.name).filter(Boolean)
        });
      }
  
      nextUrl = response.next; // Handle pagination
    }
  
    return playlistTracks;
};

const getYoutubeSongUrl = async (songName="", artists="") => {
    const query = "Crab Rave";
    const params = new URLSearchParams({
        part: 'snippet',
        q: query,
        type: 'video',
        maxResults: '1',
        key: YOUTUBE_API_KEY,
    });

    const url = `https://www.googleapis.com/youtube/v3/search?${params.toString()}`;

    try {
        // Perform the GET request
        const response = await fetch(url);

        // Handle response
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();

        // Check if any videos were found
        if (data.items && data.items.length > 0) {
            const videoId = data.items[0].id.videoId;
            return `https://www.youtube.com/watch?v=${videoId}`;
        }

    } catch (error) {
        console.error("Error fetching YouTube data:", error);
    }

}

const main = async () => {
    const token = await getToken();
    const tracks = await getPlaylistItems(token, "https://open.spotify.com/playlist/28oszO2MY6o97B3yYFkiWO?si=6c6496aa66f842d7&pt=a0e5e4e29b041ec052bc045b00afc2d7")
    console.log(await getYoutubeSongUrl());
}

main();
