'use strict';

if (!process.env.PRODUCTION) require('dotenv').load();

const TIMEZONE = 'Europe/Amsterdam';
const PRODUCTION = process.env.PRODUCTION === 'true';
const DESCRIPTION = require('./package.json').description;
const getRate = require('./get').getRate;
const redis = require('./redis');
const send = require('./telegram').send;
const http = require('http');
const ALERT_DELTA = process.env.ALERT_DELTA || 100;
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

async function run() {
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
    if (currentRate < (lastRate - ALERT_DELTA)) notify = true;
    else if (currentRate > (lastRate + ALERT_DELTA)) notify = true;

    const profit = (currentRate - INVESTMENT < 0) ? 'loss' : 'profit';
    const amount = Math.round((currentRate - INVESTMENT < 0) ? (currentRate - INVESTMENT) * -1 : currentRate - INVESTMENT);

    if (notify) {
      redis.set(`BTC`, btcRate * 0.5);
      redis.set(`ETH`, ethRate * 10);
      redis.set(`LTC`, ltcRate * 15);

      console.log(`[INFO] ALERT We have a ${profit} of € ${amount}`);
      console.log('[INFO] currentRate:     ', leftPad(currentRate), 'btc:', leftPad(btcRate * 0.5), 'eth:', leftPad(ethRate * 10), 'ltc:', leftPad(ltcRate * 15));
      console.log('[INFO] lastRate (redis):', leftPad(lastRate), 'btc:', leftPad(btcRedis), 'eth:', leftPad(ethRedis), 'ltc:', leftPad(ltcRedis));

      send(`We have a ${profit} of €${amount}
<pre>
      last     now
BTC ${leftPad(btcRedis)} ${leftPad(btcRate * 0.5)}
ETH ${leftPad(ethRedis)} ${leftPad(ethRate * 10)}
LTC ${leftPad(ltcRedis)} ${leftPad(ltcRate * 15)}
</pre>
https://www.coinbase.com/charts`);
    } else {
      console.log(`[INFO] We have a ${profit} of € ${amount}`);
    }
  } catch(error) {
    console.error(error);
  }
}

http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type': 'text/html'});
  res.write(`<!doctype html><meta charset="utf-8"><title>${DESCRIPTION}</title><h1 style="text-align: center;">Xusjes from Christian &amp; Adriaan`);
  res.end();
}).listen(process.env.PORT || 3000);
