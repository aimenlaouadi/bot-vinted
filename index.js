const axios = require("axios");

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const VINTED_COOKIE = process.env.VINTED_COOKIE;
const SEARCH_TEXT = process.env.SEARCH_TEXT || "écran iphone fissuré";
const MAX_PRICE = Number(process.env.MAX_PRICE || 300);

const CHECK_INTERVAL = 5 * 60 * 1000; // 60 secondes
const seenItems = new Set();

const BLACKLIST_WORDS = [
  "icloud",
  "bloqué",
  "bloque",
  "blacklist",
  "hs",
  "pour pièce",
  "pour pieces",
  "pièces",
  "pieces",
  "ne s'allume pas",
  "compte",
  "verrouillé",
  "verrouiller",
  "simlocké",
  "simlocke",
  "bloqué opérateur",
  "bloque operateur"
];

function isBlacklisted(title) {
  const lowerTitle = title.toLowerCase();
  return BLACKLIST_WORDS.some((word) => lowerTitle.includes(word));
}

function getPrice(item) {
  if (item.price?.amount) {
    return Number(item.price.amount);
  }

  if (item.price_numeric) {
    return Number(item.price_numeric);
  }

  if (item.price) {
    return Number(item.price);
  }

  return null;
}

async function sendToDiscord(item, price) {
  const message = {
    content: `📱 **Nouvelle annonce Vinted détectée**

**Titre :** ${item.title}
**Prix :** ${price ? price + "€" : "Prix non trouvé"}
**Lien :** ${item.url}`
  };

  await axios.post(DISCORD_WEBHOOK_URL, message);
}

async function checkVinted() {
  try {
    console.log("🔍 Recherche Vinted en cours...");

    if (!DISCORD_WEBHOOK_URL) {
      console.log("❌ DISCORD_WEBHOOK_URL manquant");
      return;
    }

    if (!VINTED_COOKIE) {
      console.log("⚠️ VINTED_COOKIE manquant");
      console.log("Le bot peut être bloqué par Vinted sans cookie.");
    }

    const url = "https://www.vinted.fr/api/v2/catalog/items";

    const response = await axios.get(url, {
      params: {
        search_text: SEARCH_TEXT,
        price_to: MAX_PRICE,
        currency: "EUR",
        order: "newest_first",
        per_page: 20
      },
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json",
        "Cookie": VINTED_COOKIE || ""
      }
    });

    const items = response.data.items || [];

    console.log(`✅ ${items.length} annonces trouvées`);

    for (const item of items) {
      const id = item.id;

      if (seenItems.has(id)) {
        continue;
      }

      seenItems.add(id);

      const title = item.title || "";
      const price = getPrice(item);

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
    console.error("❌ Erreur Vinted :", error.response?.status || error.message);

    if (error.response?.status === 401 || error.response?.status === 403) {
      console.log("⚠️ Cookie Vinted invalide ou expiré.");
    }
  }
}

console.log("🚀 Bot Vinted démarré");
console.log("Recherche :", SEARCH_TEXT);
console.log("Prix max :", MAX_PRICE + "€");

checkVinted();
setInterval(checkVinted, CHECK_INTERVAL);