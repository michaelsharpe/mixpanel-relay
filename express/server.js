'use strict';
require('dotenv').config();

const express = require('express');
const path = require('path');
const serverless = require('serverless-http');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const morgan = require('morgan');
const cors = require('cors');

const app = express();

app.use(cors())
app.use(morgan('combined'))

const router = express.Router();

router.get('/:anonymousId', (req, res) => {
  console.log("getting mixpanel data");
  const mixpanelApiUrl = 'https://mixpanel.com/api/2.0/jql';
  const mixpanelApiSecret = process.env.MIXPANEL_SECRET;

  const toDate = new Date(Date.now());
  const fromDate = new Date(toDate);
  // calculate 30 days ago:
  fromDate.setDate(toDate.getDate() - 5);

  const toDateISO = toDate.toISOString().slice(0,10);
  const fromDateISO = fromDate.toISOString().slice(0,10);

  const {anonymousId} = req.params;

  // Your JQL here:
  const params = {
    script: `
  const FROM_DATE = '${fromDateISO}';
  const TO_DATE = '${toDateISO}';
  function main() {
    return join(
      Events({
        from_date: FROM_DATE,
        to_date:   TO_DATE,
        event_selectors:  [{
          event: 'Loaded a Page'
        }]
      }),
      People(),
      {
        selectors:[{selector:
          'properties["mpAnonymousId"] == "${anonymousId}"'}]
      }
    )
    .sortDesc('time')
  }
  `
  };

  const basicAuth = Buffer.from(mixpanelApiSecret).toString('base64');

  const formData = Object.keys(params).map((key) => {
    return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
  }).join('&');

  fetch(mixpanelApiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
      'Authorization': 'Basic ' + basicAuth,
      'Accept': 'application/json',
    },
    body: formData
  })
    .then(response => {
      if(response.ok) {
        return response.json();
      } else {
        console.log(response);
        throw "Bad Response";
      }
    })
    .then(json => {
      console.log(json);
      return json;
    })
    .then(json => json.map(data => ({
      websiteId: data.event.properties.websiteId,
      time: data.event.time
    })))
    .then(data => data.sort((a, b) => a.time < b.time ? -1 : 1))
    .then(data => res.json(data)) 
    .catch(err => {
      console.log(err);

      res.status(400).send(err);
    });
});

app.use(bodyParser.json());
app.use(router);

module.exports = app;
module.exports.handler = serverless(app);
