const Parser = require("rss-parser");
const axios = require("axios");

const parser = new Parser();

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const SEARCH_URL = process.env.SEARCH_URL;
const MAX_PRICE = Number(process.env.MAX_PRICE || 200);

const CHECK_INTERVAL = 60 * 1000; // 60 secondes

const seenItems = new Set();

const BLACKLIST_WORDS = [
  "icloud",
  "bloqué",
  "bloquer",
  "blacklist",
  "hs",
  "cassé",
  "casser",
  "pour pièce",
  "pour pieces",
  "pièces",
  "pieces",
  "ne s'allume pas",
  "compte",
  "verrouillé",
  "verrouiller"
];

function extractPrice(text) {
  if (!text) return null;

  const match = text.match(/(\d+)[\s,.]*(€|eur|euro)/i);

  if (!match) return null;

  return Number(match[1]);
}

function isBlacklisted(title) {
  const lowerTitle = title.toLowerCase();

  return BLACKLIST_WORDS.some((word) => lowerTitle.includes(word));
}

async function sendToDiscord(item, price) {
  const message = {
    content: `📱 **Nouvelle annonce Vinted détectée**

**Titre :** ${item.title}
**Prix estimé :** ${price ? price + "€" : "Prix non trouvé"}
**Lien :** ${item.link}`
  };

  await axios.post(DISCORD_WEBHOOK_URL, message);
}

async function checkVintedRSS() {
  try {
    console.log("🔍 Vérification du flux RSS...");

    if (!DISCORD_WEBHOOK_URL) {
      console.log("❌ DISCORD_WEBHOOK_URL manquant");
      return;
    }

    if (!SEARCH_URL) {
      console.log("❌ SEARCH_URL manquant");
      return;
    }

    const feed = await parser.parseURL(SEARCH_URL);

    console.log(`✅ ${feed.items.length} annonces trouvées`);

    for (const item of feed.items) {
      const id = item.guid || item.link;

      if (seenItems.has(id)) {
        continue;
      }

      seenItems.add(id);

      const title = item.title || "";
      const content = item.contentSnippet || item.content || "";

      const price = extractPrice(title) || extractPrice(content);

      if (isBlacklisted(title)) {
        console.log("⛔ Annonce ignorée blacklist :", title);
        continue;
      }

      if (price && price > MAX_PRICE) {
        console.log("💰 Annonce trop chère :", title, price + "€");
        continue;
      }

      console.log("✅ Annonce envoyée :", title);
      await sendToDiscord(item, price);
    }
  } catch (error) {
    console.error("❌ Erreur RSS :", error.message);
  }
}

console.log("🚀 Bot Vinted RSS démarré");
console.log("Prix max :", MAX_PRICE + "€");

checkVintedRSS();

setInterval(checkVintedRSS, CHECK_INTERVAL);