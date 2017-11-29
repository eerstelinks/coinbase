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
  value: 1129.60,
  fee: 16.83
}, {
  coin: 'ETH',
  amount: +10,
  value: 2139.95,
  fee: 31.89
}, {
  coin: 'LTC',
  amount: +15,
  value: 661.2,
  fee: 9.85
}, {
  coin: 'BCH',
  amount: +0.5,
  value: 0,
  fee: 0
}, {
  coin: 'BTC',
  amount: -0.5,
  value: 3185.57,
  fee: 48.18
}, {
  coin: 'ETH',
  amount: +5,
  value: 1367.70,
  fee: 20.38
}, {
  coin: 'BTC',
  amount: +0.22459504,
  value: 1781.59,
  fee: 26.55
}];

const transactions = {};
let fees = 0;
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

  // Calculate the fees
  fees += transaction.fee;
}

// Add the fees to the investment
totalInvested = totalInvested + fees;

if (PRODUCTION === true && process.env.CRON_TIME) {
  const CronJob = require('cron').CronJob;
  new CronJob(process.env.CRON_TIME, function() {
    run();
  }, null, true, TIMEZONE);
} else {
  run();
}

function decimalPlaces(num) {
  var match = (''+num).match(/(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
  if (!match) { return 0; }
  return Math.max(
       0,
       // Number of digits right of decimal point.
       (match[1] ? match[1].length : 0)
       // Adjust for scientific notation.
       - (match[2] ? +match[2] : 0));
}

function leftPad(number, options = { length: 6, round: true }) {
  if (options.round) number = Math.round(number)
  if (decimalPlaces(number) > 0) {
    // Remove padding when it's a zero: `0.121` should be `.21` instead of
    // `0.2`. But when it does not start with a zero is should show `1.1` for
    // `1.12` instead of `.12`.
    const zeroPadding = (number > 0 && number < 1) ? 1 : 2;
    number = number.toFixed(options.length - zeroPadding);
  }
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

    const lastRatesCoins = {};
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
        lastRatesCoins[coinName] = rate;
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
      console.log(`do not notify currentRate: ${currentRate} lastRate: ${lastRate} ALERT_DELTA: ${ALERT_DELTA}`);
    }

    const profit = (currentRate - totalInvested < 0) ? 'loss' : 'profit';
    const amount = Math.round((currentRate - totalInvested < 0) ? (currentRate - totalInvested) * -1 : currentRate - totalInvested);
    const lines = [`We have a <strong>${profit}</strong> of <strong>€ ${amount}</strong>`];
    lines.push('<pre>');
    lines.push('          now  rev. last');

    for (const coin in transactions) {
      const amount = transactions[coin];
      const rate = currentRates[coin];
      let revenue = 0;
      for (const transaction of TRANSACTIONS) {
        if (transaction.coin === coin) {
           if (transaction.amount > 0) {
             revenue -= transaction.value;
           } else {
             revenue += transaction.value;
           }
        }
      }

      revenue = revenue + rate * amount;
      const diff = (rate * amount) * 100 / lastRatesCoins[coin] - 100;

      lines.push(`${leftPad(amount, { length: 3, round: false })} ${coin}${leftPad(rate * amount)}${leftPad(revenue)}${leftPad(diff, { length: 4, round: true })}%`);
    }

    lines.push('');
    lines.push(`Transaction costs ${leftPad(fees)}`);

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
