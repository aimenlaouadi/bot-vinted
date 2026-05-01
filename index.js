const axios = require("axios");

const VINTED_COOKIE = process.env.VINTED_COOKIE;

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const DISCORD_WEBHOOK_IPHONE = process.env.DISCORD_WEBHOOK_IPHONE || DISCORD_WEBHOOK_URL;
const DISCORD_WEBHOOK_APPLEWATCH = process.env.DISCORD_WEBHOOK_APPLEWATCH || DISCORD_WEBHOOK_URL;

const CHECK_INTERVAL = 15 * 60 * 1000; // 15 minutes
const DISCORD_DELAY = 3000; // 3 secondes entre chaque message Discord

const SEARCHES = [
  {
    name: "iPhone",
    searchText: process.env.SEARCH_TEXT_IPHONE || "iphone ecran fissure",
    maxPrice: Number(process.env.MAX_PRICE_IPHONE || 300),
    webhook: DISCORD_WEBHOOK_IPHONE,
    requiredWords: ["iphone"],
    blacklistWords: [
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
    ]
  },
  {
    name: "Apple Watch",
    searchText: process.env.SEARCH_TEXT_APPLEWATCH || "apple watch ecran casse",
    maxPrice: Number(process.env.MAX_PRICE_APPLEWATCH || 120),
    webhook: DISCORD_WEBHOOK_APPLEWATCH,
    requiredWords: ["apple watch"],
    blacklistWords: [
      "icloud",
      "i cloud",
      "bloqué",
      "bloque",
      "bloquée",
      "bloquee",
      "verrouillé",
      "verrouille",
      "verrouillée",
      "verrouillee",
      "compte",
      "activation lock",
      "localiser",
      "hs",
      "ne s'allume pas",
      "ne s allume pas",
      "pour pièce",
      "pour pieces",
      "pièces",
      "pieces",
      "boitier seul",
      "boîtier seul",
      "bracelet",
      "chargeur",
      "protection",
      "coque",
      "accessoire",
      "samsung",
      "garmin",
      "xiaomi",
      "huawei"
    ]
  }
];

const seenItems = new Set();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function isBlacklisted(title, blacklistWords) {
  const lowerTitle = title.toLowerCase();
  return blacklistWords.some((word) => lowerTitle.includes(word));
}

function isRelevant(title, requiredWords) {
  const lowerTitle = title.toLowerCase();

  return requiredWords.some((word) => lowerTitle.includes(word));
}

async function sendToDiscord(search, item, price) {
  if (!search.webhook) {
    console.log(`❌ Webhook manquant pour ${search.name}`);
    return;
  }

  const message = {
    content: `🔔 **Nouvelle annonce ${search.name} détectée**

**Titre :** ${item.title}
**Prix :** ${price ? price + "€" : "Prix non trouvé"}
**Lien :** ${item.url}`
  };

  await axios.post(search.webhook, message);
}

async function checkSearch(search) {
  try {
    console.log(`🔍 Recherche Vinted en cours : ${search.name}`);
    console.log(`Recherche : ${search.searchText}`);
    console.log(`Prix max : ${search.maxPrice}€`);

    if (!VINTED_COOKIE) {
      console.log("⚠️ VINTED_COOKIE manquant");
      console.log("Le bot peut être bloqué par Vinted sans cookie.");
    }

    const url = "https://www.vinted.fr/api/v2/catalog/items";

    const response = await axios.get(url, {
      timeout: 15000,
      params: {
        search_text: search.searchText,
        price_to: search.maxPrice,
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

    console.log(`✅ ${items.length} annonces trouvées pour ${search.name}`);

    for (const item of items) {
      const id = `${search.name}-${item.id}`;

      if (seenItems.has(id)) {
        continue;
      }

      seenItems.add(id);

      const title = item.title || "";
      const price = getPrice(item);

      if (isBlacklisted(title, search.blacklistWords)) {
        console.log("⛔ Annonce ignorée blacklist :", title);
        continue;
      }

      if (!isRelevant(title, search.requiredWords)) {
        console.log("⛔ Annonce ignorée hors sujet :", title);
        continue;
      }

      if (price && price > search.maxPrice) {
        console.log("💰 Annonce trop chère :", title, price + "€");
        continue;
      }

      console.log(`✅ Annonce envoyée ${search.name} :`, title);
      await sendToDiscord(search, item, price);

      await sleep(DISCORD_DELAY);
    }
  } catch (error) {
    const status = error.response?.status;

    console.error(`❌ Erreur Vinted ${search.name} :`, status || error.message);

    if (status === 401 || status === 403) {
      console.log("⚠️ Cookie Vinted invalide ou expiré.");
    }

    if (status === 429) {
      console.log("⚠️ Trop de requêtes. Vinted bloque temporairement. Attends quelques minutes.");
    }
  }
}

async function checkAllSearches() {
  console.log("🚀 Lancement des recherches Vinted");

  for (const search of SEARCHES) {
    await checkSearch(search);

    // Petite pause entre chaque recherche pour éviter de spammer Vinted
    await sleep(5000);
  }

  console.log("✅ Toutes les recherches sont terminées");
}

console.log("🚀 Bot Vinted multi-recherches démarré");

checkAllSearches();
setInterval(checkAllSearches, CHECK_INTERVAL);