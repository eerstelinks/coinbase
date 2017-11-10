'use strict';

if (!process.env.PRODUCTION) require('dotenv').load();

const TIMEZONE = 'Europe/Amsterdam';
const PRODUCTION = process.env.PRODUCTION === 'true';
const DESCRIPTION = require('./package.json').description;
const getRate = require('./get').getRate;
const redis = require('./redis');
const send = require('./telegram').send;
const http = require('http');
const ALERT_DELTA = parseFloat(process.env.ALERT_DELTA, 10) || 100;

const TRANSACTIONS = [{
  coin: 'BTC',
  amount: +0.5,
  value: 1129.60 + 16.83
}, {
  coin: 'ETH',
  amount: +10,
  value: 2139.95 + 31.89
}, {
  coin: 'LTC',
  amount: +15,
  value: 661.23 + 9.85
}, {
  coin: 'BCH',
  amount: +0.5,
  value: 0
}, {
  coin: 'BTC',
  amount: -0.5,
  value: 3185.57 //- 48.18
}, {
  coin: 'ETH',
  amount: +5,
  value: 1367.70 + 20.38
}];

const transactions = {};
let totalInvested = 0;

for (const transaction of TRANSACTIONS) {
  const coin = transaction.coin;

  // What do we have in our current wallet?
  if (transactions[coin]) transactions[coin] += transaction.amount;
  else transactions[coin] = transaction.amount;

  // Delete when total amount of a coin is 0
  if (transactions[coin] === 0) delete transactions[coin];

  // What did we invest in total (invested money - money sold coins)
  if (transaction.amount < 0) totalInvested -= transaction.value;
  else totalInvested += transaction.value;
}

if (PRODUCTION === true && process.env.CRON_TIME) {
  const CronJob = require('cron').CronJob;
  new CronJob(process.env.CRON_TIME, function() {
    run();
  }, null, true, TIMEZONE);
} else {
  run();
}

function leftPad(number, options = { length: 5, round: true }) {
  if (options.round) number = Math.round(number)
  return (' '.repeat(options.length) + number).slice(-options.length);
}

async function run(options = { return: false }) {
  try {
    const promises = [];
    for (const transaction in transactions) {
      const amount = transactions[transaction];
      promises.push(getRate(transaction));
      promises.push(redis.get(transaction));
    }

    const rates = await Promise.all(promises);

    const currentRates = {};
    const currentRatesCoins = {};
    let counter = 0;
    let currentRate = 0;
    let lastRate = 0;

    for (const rate of rates) {
      const coinIndex = Math.floor(counter / 2);
      const coinName = Object.keys(transactions)[coinIndex];
      const coinAmount = transactions[coinName];
      const isRedis = !!(counter % 2);
      if (isRedis) {
        lastRate += rate;
      }
      else {
        currentRates[coinName] = rate;
        currentRatesCoins[coinName] = rate * coinAmount;
        currentRate += rate * coinAmount;
      }
      counter++;
    }

    let notify = false;
    if (currentRate < (lastRate - ALERT_DELTA)) {
      console.log(`notify because ${currentRate} < (${lastRate} - ${ALERT_DELTA})`);
      notify = true;
    } else if (currentRate > (lastRate + ALERT_DELTA)) {
      console.log(`notify because ${currentRate} > (${lastRate} + ${ALERT_DELTA})`);
      notify = true;
    } else {
      console.log(`don't notify currentRate: ${currentRate} lastRate: ${lastRate} ALERT_DELTA: ${ALERT_DELTA}`);
    }

    const profit = (currentRate - totalInvested < 0) ? 'loss' : 'profit';
    const amount = Math.round((currentRate - totalInvested < 0) ? (currentRate - totalInvested) * -1 : currentRate - totalInvested);
    const lines = [`We have a <strong>${profit}</strong> of <strong>€ ${amount}</strong>`];
    lines.push('<pre>');
    lines.push('         buy   now  diff');

    for (const coin in transactions) {
      const amount = transactions[coin];
      const rate = currentRates[coin];
      let lastValue = 0;
      for (const transaction of TRANSACTIONS) {
        if (transaction.coin === coin && transaction.amount > 0) lastValue += transaction.value;
      }
      lines.push(`${leftPad(amount, { length: 2, round: false })} ${coin} ${leftPad(lastValue)} ${leftPad(rate * amount)} ${leftPad(rate * amount - lastValue)}`);
    }

    lines.push('');
    lines.push('history  buy  sell  diff');
    lines.push(`.5 BTC ${leftPad(1129.60 + 16.83)} ${leftPad(3185.57 - 48.18)} ${leftPad(1990.96)}`);

    lines.push('</pre>');
    lines.push('<a href="https://coinbase.com/charts">coinbase.com</a>, <a href="https://coins.eerstelinks.nl">coins.eerstelinks.nl</a>');

    if (options.return) {
      return lines.join('\n');
    }
    else if (notify) {
      console.log(`[INFO] ALERT We have a ${profit} of € ${amount}`);

      for (const currentRatesCoin in currentRatesCoins) {
        redis.set(currentRatesCoin, currentRatesCoins[currentRatesCoin]);
      }

      if (PRODUCTION) send(lines.join('\n'));
      else console.log(lines.join('\n'));
    } else {
      console.log(`[INFO] We have a ${profit} of € ${amount}`);
    }
  } catch(error) {
    console.error(error);
  }
}

http.createServer(async (req, res) => {
  const diff = await run({ return: true });
  res.writeHead(200, {'Content-Type': 'text/html'});
  res.write(`<!doctype html style="height: 100%;"><meta charset="utf-8"><title>${DESCRIPTION}</title><meta name="viewport" content="width=device-width, initial-scale=1"><body style="font-family: Arial; color: #333; font-size: 14px; height:100%; display: flex; align-items: center; justify-content: center;"><div style="text-align: center;"><p>${diff}</p><p>Xusjes from Christian &amp; Adriaan`);
  res.end();
}).listen(process.env.PORT || 3000);
