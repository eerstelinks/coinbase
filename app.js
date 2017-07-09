'use strict';

const TIMEZONE = 'Europe/Amsterdam';
const PRODUCTION = process.env.PRODUCTION === 'true';
const DESCRIPTION = require('./package.json').description;
const getRate = require('./get').getRate;
const http = require('http');
const redis = require('redis');
const client = redis.createClient(process.env.REDIS_URL);

client.on('error', error => {
  console.error(error);
});

if (PRODUCTION === true && process.env.CRON_TIME) {
  const CronJob = require('cron').CronJob;
  new CronJob(process.env.CRON_TIME, function() {
    run();
  }, null, true, TIMEZONE);
} else {
  run();
}

async function run() {
  try {
    const [btc, eth, ltc] = await Promise.all([getRate(`BTC`), getRate(`ETH`), getRate(`LTC`)]);
    client.get('btc', redis.print);
    console.log(`btc`, btc, 'eth', eth, 'ltc', ltc);
  } catch(error) {
    console.error(error);
  }
}

http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type': 'text/html'});
  res.write(`<!doctype html><meta charset="utf-8"><title>${DESCRIPTION}</title><h1 style="text-align: center;">Xusjes from Christian &amp; Adriaan`);
  res.end();
}).listen(process.env.PORT || 3000);
