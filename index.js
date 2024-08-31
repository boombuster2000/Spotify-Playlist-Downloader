require('dotenv').config()

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

const main = async () => {
    const token = await getToken();
}

main();
