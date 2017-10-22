# NConsumer and NProducer health checks

- as of sinek@6.11.0 the native clients support additional health check features
- intelligent health checks require enabled [analytics features](Analytics.md)
- checkout the usage example below

```javascript
"use strict";
const {NConsumer, NProducer} = require("sinek");

const consumer = new NConsumer(/* .. */);
const producer = new NProducer(/* .. */);

await consumer.connect();
consumer.consume();

await producer.connect();

consumer.enableAnalytics(/* .. */);
producer.enableAnalytics(/* .. */);

//if you test this, make sure to await the first analytics event consumer.once("analytics", () => {})

const consumerHealth = await consumer.checkHealth();

/* consumer result e.g. */
{
  status: 0,
  messages: [
     "No problems detected, client is healthy.",
     "Consumed 1240 message/s in the last interval, with 0 errors."
    ]
}

const producerHealth = await producer.checkHealth();

/* producer result e.g. */
{
  status: 0,
  messages: [
    "No problems detected, client is healthy.",
    "Produced 520 message/s in the last interval, with 0 errors."
    ]
}
```

- available status codes:

```javascript
{
  DIS_ANALYTICS: -4, //you have not enabled analytics
  NO_ANALYTICS: -3, //no analytics result are available yet
  UNKNOWN: -2, //status is unknown, internal error occured
  UNCONNECTED: -1, //client is not connected yet
  HEALTHY: 0, //client is healthy
  RISK: 1, //client might be healthy, but something does not seem 100% right
  WARNING: 2, //client might be in trouble soon
  CRITICAL: 3 //something is wrong
}
```
