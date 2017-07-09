'use strict';

const https = require('https');

function getJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let body = '';
      res.on('data', chunk => {
          body += chunk;
      });
      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          return resolve(response);
        } catch(error) {
          return reject(error);
        }
      });
    }).on('error', error => {
      return reject(error);
    });
  });
}

function getRate(coin) {
  return new Promise(async (resolve, reject) => {
    try {
      const rates = await getJSON(`https://api.coinbase.com/v2/exchange-rates?currency=${coin}`);
      const euro = parseFloat(rates.data.rates.EUR, 10);
      return resolve(euro);
    } catch(error) {
      return reject(error);
    }
  });
}

module.exports = {
  getRate
};
