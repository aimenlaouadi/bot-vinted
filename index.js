require("dotenv").config();
const axios = require("axios");

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const SEARCH_URL = process.env.SEARCH_URL;
const MAX_PRICE = Number(process.env.MAX_PRICE || 200);

const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

let alreadySeen = new Set();
let lastErrorAlert = null;

const blacklistWords = [
  "icloud",
  "bloqué",
  "bloque",
  "hs",
  "cassé",
  "casse",
  "pour pièces",
  "pour piece",
  "ne s'allume pas",
  "écran noir",
];

const bonusWords = [
  "excellent état",
  "tres bon état",
  "très bon état",
  "batterie neuve",
  "neuf",
  "comme neuf",
  "boîte",
  "boite",
];

function extractParamsFromVintedUrl(url) {
  const parsedUrl = new URL(url);
  const params = {};

  parsedUrl.searchParams.forEach((value, key) => {
    params[key] = value;
  });

  return params;
}

async function getVintedSession() {
  try {
    const response = await axios.get("https://www.vinted.fr", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
    });

    const cookies = response.headers["set-cookie"];

    if (!cookies) {
      console.log("Aucun cookie Vinted récupéré automatiquement.");
      return null;
    }

    console.log("Session Vinted récupérée automatiquement.");
    return cookies.map((cookie) => cookie.split(";")[0]).join("; ");
  } catch (error) {
    console.log("Impossible de récupérer une session Vinted automatiquement.");
    return null;
  }
}

async function searchVinted() {
  const cookies = await getVintedSession();
  const params = extractParamsFromVintedUrl(SEARCH_URL);

  const response = await axios.get("https://www.vinted.fr/api/v2/catalog/items", {
    params: {
      ...params,
      per_page: 20,
      page: 1,
    },
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      Referer: SEARCH_URL,

      // On utilise ton vrai cookie .env en priorité.
      // Si absent, on utilise le cookie récupéré automatiquement.
      Cookie: process.env.VINTED_COOKIE || cookies,
    },
  });

  return response.data.items || [];
}

function isBadItem(item) {
  const text = `${item.title || ""} ${item.description || ""}`.toLowerCase();

  return blacklistWords.some((word) => text.includes(word));
}

function getScore(item) {
  const text = `${item.title || ""} ${item.description || ""}`.toLowerCase();
  let score = 0;

  bonusWords.forEach((word) => {
    if (text.includes(word)) {
      score += 10;
    }
  });

  const price = Number(item.price?.amount || item.price || 0);

  if (price <= MAX_PRICE * 0.7) {
    score += 20;
  } else if (price <= MAX_PRICE * 0.85) {
    score += 10;
  }

  return score;
}

async function sendToDiscord(item) {
  const price = item.price?.amount || item.price || "Prix inconnu";
  const title = item.title || "Annonce Vinted";
  const url = item.url || `https://www.vinted.fr/items/${item.id}`;
  const image = item.photo?.url || item.photos?.[0]?.url || null;
  const score = getScore(item);

  const payload = {
    embeds: [
      {
        title: `🔥 Nouvelle annonce intéressante : ${title}`,
        url: url,
        description: `📱 **${title}**
💰 Prix : **${price} €**
⭐ Score : **${score}/100**
🔗 [Voir l'annonce](${url})`,
        image: image ? { url: image } : undefined,
        color: 0x00b894,
        footer: {
          text: "Bot Vinted - surveillance automatique",
        },
        timestamp: new Date().toISOString(),
      },
    ],
  };

  await axios.post(DISCORD_WEBHOOK_URL, payload);
}

async function sendErrorToDiscord(message) {
  // Évite d'envoyer la même alerte en boucle toutes les 5 minutes
  if (lastErrorAlert === message) {
    return;
  }

  lastErrorAlert = message;

  try {
    await axios.post(DISCORD_WEBHOOK_URL, {
      content: message,
    });
  } catch (error) {
    console.log("Impossible d'envoyer l'erreur sur Discord.");
  }
}

async function runBot() {
  console.log("Bot Vinted lancé...");

  try {
    const items = await searchVinted();

    // Si ça remarche, on réinitialise l'alerte erreur
    lastErrorAlert = null;

    console.log(`${items.length} annonces trouvées.`);

    for (const item of items) {
      if (alreadySeen.has(item.id)) {
        continue;
      }

      alreadySeen.add(item.id);

      const price = Number(item.price?.amount || item.price || 0);

      if (!price || price > MAX_PRICE) {
        continue;
      }

      if (isBadItem(item)) {
        console.log(`Annonce ignorée : ${item.title}`);
        continue;
      }

      console.log(`Nouvelle annonce intéressante : ${item.title} - ${price} €`);
      await sendToDiscord(item);
    }
  } catch (error) {
    const status = error.response?.status;

    console.error("Erreur Vinted :", status || error.message);

    if (status === 401) {
      console.log("Erreur 401 : cookie Vinted expiré ou refusé.");

      await sendErrorToDiscord(
        "⚠️ Bot Vinted : cookie expiré ou refusé. Il faut récupérer un nouveau cookie Vinted."
      );
    } else if (status === 403) {
      console.log("Erreur 403 : Vinted bloque temporairement la requête.");

      await sendErrorToDiscord(
        "⚠️ Bot Vinted : requête bloquée temporairement par Vinted."
      );
    } else if (status === 429) {
      console.log("Erreur 429 : trop de requêtes envoyées à Vinted.");

      await sendErrorToDiscord(
        "⏳ Bot Vinted : trop de requêtes. Il faut attendre avant de relancer."
      );
    } else {
      await sendErrorToDiscord(
        `⚠️ Bot Vinted : erreur inconnue - ${status || error.message}`
      );
    }
  }
}

runBot();
setInterval(runBot, CHECK_INTERVAL);