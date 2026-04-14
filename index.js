require("dotenv").config();

const Parser = require("rss-parser");
const axios = require("axios");
const fs = require("fs");

const parser = new Parser();

// 🔐 Webhook via Railway (variable d'environnement)
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

// 🔥 Flux RSS (on garde Reddit pour test stable)
const RSS_URL = "https://www.reddit.com/r/iphone/search.rss?q=iphone&restrict_sr=1&sort=new";

// 📁 Fichier pour mémoriser les annonces vues
const SEEN_FILE = "seen.json";

let seen = new Set();

function loadSeen() {
  if (fs.existsSync(SEEN_FILE)) {
    const data = JSON.parse(fs.readFileSync(SEEN_FILE, "utf8"));
    seen = new Set(data);
  }
}

function saveSeen() {
  fs.writeFileSync(SEEN_FILE, JSON.stringify([...seen], null, 2));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 🔍 Récupération RSS avec headers (évite blocage)
async function fetchFeed() {
  const response = await axios.get(RSS_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept:
        "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8"
    },
    timeout: 15000
  });

  return parser.parseString(response.data);
}

// 🧠 Initialisation (évite spam au début)
async function initSeen() {
  const feed = await fetchFeed();

  for (const item of feed.items) {
    seen.add(item.link);
  }

  saveSeen();
  console.log(`Initialisation : ${feed.items.length} items déjà vus`);
}

// 🚨 Vérifie les nouvelles annonces
async function checkRSS() {
  try {
    const feed = await fetchFeed();

    console.log("Items trouvés :", feed.items.length);

    for (const item of feed.items) {
      const id = item.link;

      if (seen.has(id)) continue;

      seen.add(id);
      saveSeen();

      await axios.post(WEBHOOK_URL, {
        content: `🆕 Nouveau post\n${item.title}\n👉 ${item.link}`
      });

      console.log("Envoyé :", item.title);

      // ⏳ anti spam Discord
      await sleep(1500);
    }
  } catch (err) {
    console.error("MESSAGE:", err.message);
    console.error("STATUS:", err.response?.status);
    console.error("DATA:", err.response?.data || "");
  }
}

// 🚀 MAIN
async function main() {
  loadSeen();

  if (seen.size === 0) {
    await initSeen();
    console.log("Bot prêt : attente des nouveaux posts...");
  }

  await checkRSS();

  // 🔁 toutes les 60 secondes
  setInterval(checkRSS, 60000);
}

main();