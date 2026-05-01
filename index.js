const axios = require("axios");

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const VINTED_COOKIE = process.env.VINTED_COOKIE;
const SEARCH_TEXT = process.env.SEARCH_TEXT || "iphone ecran fissure";
const MAX_PRICE = Number(process.env.MAX_PRICE || 300);

const CHECK_INTERVAL = 15 * 60 * 1000; // 15 minutes
const DISCORD_DELAY = 3000; // 3 secondes entre chaque message Discord

const seenItems = new Set();

const BLACKLIST_WORDS = [
  "icloud",
  "i cloud",
  "bloqué",
  "bloque",
  "blacklist",
  "hs",
  "pour pièce",
  "pour pieces",
  "pièces",
  "pieces",
  "ne s'allume pas",
  "ne s allume pas",
  "compte",
  "verrouillé",
  "verrouiller",
  "simlocké",
  "simlocke",
  "bloqué opérateur",
  "bloque operateur",
  "orange uniquement",
  "sfr uniquement",
  "bouygues uniquement",
  "free uniquement",
  "compteur",
  "montre",
  "xbox",
  "trottinette",
  "ipad",
  "oppo",
  "samsung",
  "blackview",
  "écran pc",
  "ecran pc",
  "tablette"
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isBlacklisted(title) {
  const lowerTitle = title.toLowerCase();
  return BLACKLIST_WORDS.some((word) => lowerTitle.includes(word));
}

function isRelevant(title) {
  const lowerTitle = title.toLowerCase();

  // On garde tous les iPhone.
  // Vinted filtre déjà avec SEARCH_TEXT.
  // Comme ça, si le titre dit juste "iPhone 13", le bot ne le bloque pas.
  return lowerTitle.includes("iphone");
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
      timeout: 15000,
      params: {
        search_text: SEARCH_TEXT,
        price_to: MAX_PRICE,
        currency: "EUR",
        order: "newest_first",
        per_page: 10
      },
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept": "application/json",
        "Accept-Language": "fr-FR,fr;q=0.9",
        "Referer": "https://www.vinted.fr/catalog",
        "Origin": "https://www.vinted.fr",
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

      if (!isRelevant(title)) {
        console.log("⛔ Annonce ignorée hors sujet :", title);
        continue;
      }

      if (price && price > MAX_PRICE) {
        console.log("💰 Annonce trop chère :", title, price + "€");
        continue;
      }

      console.log("✅ Annonce envoyée :", title);
      await sendToDiscord(item, price);

      await sleep(DISCORD_DELAY);
    }
  } catch (error) {
    const status = error.response?.status;

    console.error("❌ Erreur Vinted :", status || error.message);

    if (status === 401 || status === 403) {
      console.log("⚠️ Cookie Vinted invalide ou expiré.");
    }

    if (status === 429) {
      console.log("⚠️ Trop de requêtes. Vinted bloque temporairement. Attends quelques minutes.");
    }
  }
}

console.log("🚀 Bot Vinted démarré");
console.log("Recherche :", SEARCH_TEXT);
console.log("Prix max :", MAX_PRICE + "€");

checkVinted();
setInterval(checkVinted, CHECK_INTERVAL);