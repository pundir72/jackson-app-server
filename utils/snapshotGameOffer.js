const Game = require("../models/Game");
const ConversionSettings = require("../models/ConversionSettings");

function buildSnapshot(gameDoc, coinsPerDollar) {
  if (!gameDoc) return null;

  const rawData = gameDoc.besitosRawData;
  let goals = [];
  let totalCoins = 0;

  if (rawData) {
    const isBitlabs = gameDoc.sdkProvider?.toLowerCase() === "bitlabs";

    if (isBitlabs && Array.isArray(rawData.events)) {
      const totalPoints = parseFloat(rawData.total_points) || 0;
      const eventPayoutTotal = rawData.events
        .filter(e => e.payable === true)
        .reduce((s, e) => s + (parseFloat(e.payout || e.promised_points) || 0), 0);
      const amount = eventPayoutTotal > 0 ? eventPayoutTotal : totalPoints > 0 ? totalPoints / 1000 : 0;
      totalCoins = totalPoints > 0 && amount > 0 ? Math.round(amount * coinsPerDollar) : 0;

      goals = rawData.events.map((event, index) => {
        const eventPoints = parseInt(event.promised_points || event.points) || 0;
        const coinReward = totalPoints > 0 && eventPoints > 0
          ? Math.round((eventPoints / totalPoints) * totalCoins)
          : 0;
        const ttcMinutes = parseInt(event.ttc_minutes) || 0;
        return {
          goalId: event.uuid || event.hash || `event-${index}`,
          title: event.name || event.title || `Task ${index + 1}`,
          coinReward,
          position: index + 1,
          days_left: ttcMinutes > 0 ? Math.ceil(ttcMinutes / 1440) : null,
        };
      });
    } else if (Array.isArray(rawData.goals)) {
      const totalAmount = parseFloat(rawData.amount) || 0;
      totalCoins = Math.round(totalAmount * coinsPerDollar);

      goals = rawData.goals.map((goal, index) => {
        const goalAmount = parseFloat(goal.amount) || 0;
        return {
          goalId: goal.goal_id || goal.id || `goal-${index}`,
          title: goal.text || goal.name || goal.title || `Task ${index + 1}`,
          coinReward: Math.round(goalAmount * coinsPerDollar),
          position: index + 1,
          days_left: goal.days_left ?? null,
        };
      });
    }
  }

  return {
    capturedAt: new Date(),
    coinsPerDollar,
    goals,
    rewards: {
      coins: totalCoins || gameDoc.rewards?.coins || 0,
      gold: totalCoins || gameDoc.rewards?.coins || 0,
    },
    besitosRawData: rawData,
  };
}

async function getCoinsPerDollar() {
  try {
    const settings = await ConversionSettings.getActiveSettings("USD");
    return settings?.coinsPerDollar || 100;
  } catch {
    return 100;
  }
}

async function attachSnapshots(user, newGameExternalIds) {
  if (!newGameExternalIds || newGameExternalIds.length === 0) return;

  const games = await Game.find({
    sdkProvider: { $in: ["Besitos", "besitos"] },
    $or: [
      { gameId: { $in: newGameExternalIds } },
      { "gameDetails.id": { $in: newGameExternalIds } },
      { "gameDetails.offer_id": { $in: newGameExternalIds } },
      { "metadata.externalId": { $in: newGameExternalIds } },
    ],
  }).lean();

  if (!games.length) return;

  const gameByExternalId = new Map();
  games.forEach((g) => {
    const ids = [
      g.gameId,
      g.gameDetails?.id,
      g.gameDetails?.offer_id,
      g.metadata?.externalId,
    ].filter(Boolean);
    ids.forEach((id) => {
      if (!gameByExternalId.has(id)) gameByExternalId.set(id, g);
    });
  });

  const coinsPerDollar = await getCoinsPerDollar();

  for (const externalId of newGameExternalIds) {
    const gameDoc = gameByExternalId.get(externalId);
    if (!gameDoc) continue;

    const snapshot = buildSnapshot(gameDoc, coinsPerDollar);
    if (!snapshot) continue;

    const idx = user.games.findIndex((g) => String(g.gameId) === externalId);
    if (idx >= 0) {
      user.games[idx].offerSnapshot = snapshot;
    }
  }
}

function buildBitlabsSnapshotFromOffer(offer, coinsPerDollar, fullTotalPoints, fullEvents) {
  if (!offer || !Array.isArray(offer.events)) return null;

  const totalPoints = fullTotalPoints || parseFloat(offer.total_points) || 0;
  const amount = totalPoints > 0 ? totalPoints / 1000 : 0;
  const totalCoins = totalPoints > 0 && amount > 0 ? Math.round(amount * coinsPerDollar) : 0;

  const goals = offer.events.map((event, index) => {
    let eventPoints = parseInt(event.promised_points || event.points) || 0;
    if (fullEvents && fullTotalPoints) {
      const match = fullEvents.find(e => (e.uuid && e.uuid === event.uuid) || (e.hash && e.hash === event.hash) || (e.name && e.name === event.name));
      if (match) eventPoints = parseInt(match.points || match.promised_points || match.payout) || 0;
    }
    const coinReward = totalPoints > 0 && eventPoints > 0
      ? Math.round((eventPoints / totalPoints) * totalCoins)
      : 0;
    const ttcMinutes = parseInt(event.ttc_minutes) || 0;
    return {
      goalId: event.uuid || event.hash || `event-${index}`,
      title: event.name || event.title || `Task ${index + 1}`,
      coinReward,
      position: index + 1,
      days_left: ttcMinutes > 0 ? Math.ceil(ttcMinutes / 1440) : null,
    };
  });

  return {
    capturedAt: new Date(),
    coinsPerDollar,
    goals,
    rewards: { coins: totalCoins, gold: totalCoins },
  };
}

module.exports = { buildSnapshot, getCoinsPerDollar, attachSnapshots, buildBitlabsSnapshotFromOffer };
