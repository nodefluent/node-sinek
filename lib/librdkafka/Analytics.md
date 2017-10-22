# NConsumer and NProducer analytics

- as of sinek@6.8.0 the native clients support additional analytic features
- checkout the usage example below

```javascript
"use strict";
const {NConsumer, NProducer} = require("sinek");

const consumer = new NConsumer(/* .. */);
const producer = new NProducer(/* .. */);

await consumer.connect();
consumer.consume();

await producer.connect();

/*
    You can enable the collection and computation of analytics
    with by calling the following functions on instances:
    make sure to be connected before enabling analytics
*/

consumer.enableAnalytics({
    analyticsInterval: 1000 * 60 * 2, //runs every 2 minutes
    lagFetchInterval: 1000 * 60 * 5 //runs every 5 minutes (dont run too often!)
});

producer.enableAnalytics({
    analyticsInterval: 1000 * 60 * 2, //runs every 2 minutes
});

/*
    You can access the data in different ways:
*/

//emits on every interval
consumer.on("analytics", result => {
    console.log(result);
});

//returns the last analytics result
console.log(consumer.getAnalytics());

/*
    Analytic results look like this
*/

//producer:
{
    generatedAt: 1508499993324, //generation of result
    interval: 500, //configured interval
    produced: 4 //produced messages since last lag fetch
}

//consumer:
{
    "generatedAt": 1508504204109, //generation of result
    "interval": 500, //configured interval
    "lagChange": {
        "timelyDifference": 1000, //ms between the last 2 fetches
        "fetchPerformance": -12, //ms difference between the execution of the last fetches
        "newLags": {}, //lags that came up since last lag fetch
        "changedLags": {}, //lags that are still present and have changed
        "resolvedLags": { //lags that have been resolved between the last fetches
            "n-test-topic": {
                "0": 0 //on topic "n-test-topic" in partition 0 is the resolved offset lag now 0
            }
        },
        "stallLags": {} //lags that are still present and have not changed since last lag fetch
    },
    "largestLag": {
        "topic": "n-test-topic",
        "partition": 0,
        "lowDistance": 319,
        "highDistance": 0,
        "detail": {
            "lowOffset": 0,
            "highOffset": 319,
            "comittedOffset": 319
        }
    },
    "consumed": 1, //consumed messages since last lag fetch
    "errors": 0 //any client errors that occured during the interval
}

/*
    Analytics are stopped automatically if you call
    .close() ony the client instances, but you can also halt
    them manually:
*/

consumer.haltAnalytics();
producer.haltAnalytics();
```
