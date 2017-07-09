'use strict';

if (!process.env.PRODUCTION) require('dotenv').load();

const TelegramBot = require('node-telegram-bot-api');
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_GROUP = process.env.TELEGRAM_GROUP;
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

function send(message) {
  bot.sendMessage(TELEGRAM_GROUP, message, {
    disable_web_page_preview: true,
    parse_mode: 'HTML'
  });
}

module.exports = {
  send
}
