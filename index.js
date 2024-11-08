require('dotenv').config();
const fs = require("fs");
const { TimeoutError } = require('puppeteer');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { pipeline } = require('stream/promises')

puppeteer.use(StealthPlugin());


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
                'Authorization': `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`, 'utf8').toString('base64')}`,
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

    fs.writeFileSync('./tracks.json', JSON.stringify(playlistTracks, null, 4));  
    return playlistTracks;
};

const getYoutubeSongUrls = async (tracks) => {

    for (const track of tracks) {
        const songName = track.name;
        const artists = track.artists;

        if (!songName || typeof songName !== 'string') {
            throw new TypeError('songName must be a non-empty string');
        }

        if (!Array.isArray(artists) || artists.length === 0 || !artists.every(artist => typeof artist === 'string')) {
            throw new TypeError('artists must be a non-empty array of strings');
        }

        const query = `${songName} ${artists.join(' ')}`;

        const params = new URLSearchParams({
            part: 'snippet',
            q: query,
            type: 'video',
            maxResults: '1',
            videoCategoryId: '10',
            key: YOUTUBE_API_KEY,
        });

        const url = `https://www.googleapis.com/youtube/v3/search?${params.toString()}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        let response;
        let data;

        fetch(url, { signal: controller.signal })
        .then(fetchedResponse => {
            response = fetchedResponse;
            return response.json();
        })
        .then(fetchedData => {
            data = fetchedData;
            if (!response.ok) {
                console.error(JSON.stringify(data, null, 4));
                throw new Error(data.error.message);
            }
        })
        .then(() => {
            if (data.items && data.items.length > 0) {
                const videoId = data.items[0].id.videoId;
                track.youtube_url = `https://www.youtube.com/watch?v=${videoId}`;
            } else {
                throw new Error('No videos found');
            }
        })
        .catch(error => {
            console.error("Error fetching YouTube data:", error);
            throw error; // Re-throw to handle in caller
        })
        .finally(() => {
            clearTimeout(timeoutId);
        });

        fs.writeFileSync('./tracks.json', JSON.stringify(tracks, null, 4));

    }

    return tracks;
};

const download = async (browser, track)=> {   

    console.log(`Getting download url for:\t\t${track.name}`);


    // Open a new page
    const page = await browser.newPage();
    const encodedUrl = encodeURIComponent(track.youtube_url);
    const downloadPageUrl = `https://y2hub.cc/enesto/download?url=${encodedUrl}`;
    const attempts = 3;

    for (let i = 0; i<attempts; i++) {

        try {
            // Navigate to the target website
            await page.goto(downloadPageUrl, { waitUntil: 'networkidle2', timeout: 60000 });

            await page.waitForSelector("#formatselect", {visible: true, timeout:60000});

            // Select the "mp3 320kbps" option in the dropdown
            await page.select('#formatselect', '320');

            // Click the convert button
            await page.click('#cvt-btn'); // Clicks the button with id "cvt-btn"

            //Wait for download button
            await page.waitForSelector('#mp3-dl-btn', { visible: true, timeout: 600000 }); 
            
            //Get href value from download button
            const downloadButton = await page.$('#mp3-dl-btn');
            const hrefValue = await downloadButton.getProperty('href');
            const href = await hrefValue.jsonValue();

            track.download_url = href;

            console.log(`Downloading:\t\t${track.name}`);
            downloadFile(track);
        } catch (error) {

            if (error instanceof TimeoutError) {
                const pageTimeoutElement = await page.$('#mp3-dl-result'); 

                if (!pageTimeoutElement || i==attempts-1) {
                    console.error(`Failed to download ${track.name}`);
                    break;
                }
                else {
                    console.warn(`Timeout error on dowload website for ${track.name}. Attempt ${i+1}`);
                }
            } 
            else {
                throw error;
            }
        }
    }

    await page.close();
}

const downloadFile = async track => {    
    // Ensure download directory exists
    
    const dir = './Downloaded Songs';
    if (!fs.existsSync(dir)){
        fs.mkdirSync(dir, { recursive: true });
    }

    const sanitizeFileName = (name) => {
            return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
    };

    const filePath = `${dir}/${sanitizeFileName(track.name)} - ${sanitizeFileName(track.artists.join(' '))}.mp3`;

    console.log(`Downloading ${track.name}`);

    fetch(track.download_url)
    .then(response => {
        if (!response.ok) {
            throw new Error(`Failed to fetch file: ${response.statusText}`);
        }
        return pipeline(response.body, fs.createWriteStream(filePath));
    })
    .then(() => {
        console.log(`File downloaded successfully: ${filePath}`);
    })
    .catch(error => {
        console.error(`Error downloading file: ${error.message}`);
    });
}

const main = async () => {
    const token = await getToken();


    console.log("Getting spotify tracks.");
    let tracks = await getPlaylistItems(token, "https://open.spotify.com/playlist/28oszO2MY6o97B3yYFkiWO?si=6c6496aa66f842d7&pt=a0e5e4e29b041ec052bc045b00afc2d7");

    console.log("Getting youtube urls");
    tracks = await getYoutubeSongUrls(tracks);

    // Launch browser
    const browser = await puppeteer.launch({
        headless: true, // Set to true for headless mode
        protocolTimeout: 180000
    });


    // Process in batches of 3 concurrent downloads
    const batchSize = 3;
    for (let i = 0; i < tracks.length; i += batchSize) {
        const batch = tracks.slice(i, i + batchSize);
        const batchPromises = batch.map(track => download(browser, track));
        await Promise.all(batchPromises);
    }

    await browser.close();
}

main();
