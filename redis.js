'use strict';

const redis = require('redis');
const client = redis.createClient(process.env.REDIS_URL);

client.on('error', error => {
  console.error(error);
});

function get(key) {
  return new Promise((resolve, reject) => {
    client.get(key, (error, reply) => {
      if (error) return reject(error);
      if (!reply) return resolve(reply);
      return resolve(parseFloat(reply, 10));
    });
  });
}

function set(key, value) {
  return new Promise((resolve, reject) => {
    client.set(key, value, (error, reply) => {
      if (error) return reject(error);
      return resolve(reply);
    });
  });
}

module.exports = {
  set,
  get
}
