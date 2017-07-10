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
const INVESTMENT = 3989.35;

if (PRODUCTION === true && process.env.CRON_TIME) {
  const CronJob = require('cron').CronJob;
  new CronJob(process.env.CRON_TIME, function() {
    run();
  }, null, true, TIMEZONE);
} else {
  run();
}

function leftPad(number, length = 5) {
 return (' '.repeat(length) + Math.round(number)).slice(-length);
}

async function run(options = { return: false }) {
  try {
    const [btcRate, ethRate, ltcRate, btcRedis, ethRedis, ltcRedis] = await Promise.all([
      getRate(`BTC`),
      getRate(`ETH`),
      getRate(`LTC`),
      redis.get(`BTC`),
      redis.get(`ETH`),
      redis.get(`LTC`)
    ]);
    const currentRate = btcRate * 0.5 + ethRate * 10 + ltcRate * 15;
    const lastRate = btcRedis + ethRedis + ltcRedis;

    let notify = false;
    if (currentRate < (lastRate - ALERT_DELTA)) {
      console.log(`notify because ${currentRate} < (${lastRate} - ${ALERT_DELTA}`);
      notify = true;
    } else if (currentRate > (lastRate + ALERT_DELTA)) {
      console.log(`notify because ${currentRate} > (${lastRate} + ${ALERT_DELTA}`);
      notify = true;
    } else {
      console.log(`don't notify currentRate: ${currentRate} lastRate: ${lastRate} ALERT_DELTA: ${ALERT_DELTA}`);
    }
    const profit = (currentRate - INVESTMENT < 0) ? 'loss' : 'profit';
    const amount = Math.round((currentRate - INVESTMENT < 0) ? (currentRate - INVESTMENT) * -1 : currentRate - INVESTMENT);
    const message = `We have a <strong>${profit}</strong> of <strong>€ ${amount}</strong>
<pre>
         buy   now  diff
.5 BTC ${leftPad(2292.86 * 0.5)} ${leftPad(btcRate * 0.5)} ${leftPad(btcRate * 0.5 - 2292.86 * 0.5)}
10 ETH ${leftPad(217.18 * 10)} ${leftPad(ethRate * 10)} ${leftPad(ethRate * 10 - 217.18 * 10)}
15 LTC ${leftPad(44.74 * 15)} ${leftPad(ltcRate * 15)} ${leftPad(ltcRate * 15 - 44.74 * 15)}
</pre>
https://coinbase.com/charts`;

    if (options.return) {
      return message;
    }
    else if (notify) {
      console.log(`[INFO] ALERT We have a ${profit} of € ${amount}`);
      console.log('[INFO] currentRate:     ', leftPad(currentRate), 'btc:', leftPad(btcRate * 0.5), 'eth:', leftPad(ethRate * 10), 'ltc:', leftPad(ltcRate * 15));
      console.log('[INFO] lastRate (redis):', leftPad(lastRate), 'btc:', leftPad(btcRedis), 'eth:', leftPad(ethRedis), 'ltc:', leftPad(ltcRedis));

      redis.set(`BTC`, btcRate * 0.5);
      redis.set(`ETH`, ethRate * 10);
      redis.set(`LTC`, ltcRate * 15);

      send(message);
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
  res.write(`<!doctype html style="height: 100%;"><meta charset="utf-8"><title>${DESCRIPTION}</title><body style="font-family: monospace; height:100%; display: flex; align-items: center; justify-content: center;"><div style="text-align: center;"><p>${diff}</p><p>Xusjes from Christian &amp; Adriaan`);
  res.end();
}).listen(process.env.PORT || 3000);
