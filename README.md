<center><img src="https://cdn1.teamhellfall.de/contentdelivery/8642e870-7555-473a-b549-c520bd85bc51.0861a88f-28cf-42b6-88c7-f2942e64cc79.png?dim=165x125" /></center><br/>

# node-sinek

[![license](https://img.shields.io/github/license/mashape/apistatus.svg)]()
[![5cf](https://img.shields.io/badge/5cf-approved-ff69b4.svg)]()

kafka client (consumer + producer) polite out of the box

> make it about them, not about you
> - Simon Sinek

## info
- ~ 80% test coverage + promises
- core builds `kafka-node` module (checkout for options & tweaking)
- uses ConsumerGroup(s) means your kafka needs to be > 0.9.x ( - 0.10.2+)

## offers

- provides an incoming message flow control for consumers
- provides a drain once for consumers
- provides an easy api for producers
- Documentation is still wip; checkout `/test/int/Sinek.test.js`

## install

```shell
npm install --save sinek
```

## test

```
//requires a localhost kafka broker + zookeeper @ localhost:2181
npm test
```

# Usage

```javascript
const {Kafka, Drainer, Publisher, PartitionDrainer} = require("sinek");
```

## producer (Publisher)

```javascript
const kp = new Kafka(ZK_CON_STR, LOGGER);
kp.becomeProducer([TEST_TOPIC], CLIENT_NAME, OPTIONS);

kp.on("ready", () => {
    producer = new Publisher(kp);
    
    producer.send()
    producer.batch(TEST_TOPIC, [])
});

kp.on("error", err => console.log("producer error: " + err));
```

## consumer (Drainer)

```javascript
const kc = new Kafka(ZK_CON_STR, LOGGER);
kc.becomeConsumer([TEST_TOPIC], GROUP_ID, OPTIONS);

kc.on("ready", () => {
    consumer = new Drainer(kc, 1); //1 = thread/worker/parallel count
    
    consumer.drain((message, done) => {
        console.log(message);
        done();
    });
    
    consumer.stopDrain();
    
    consumer.drainOnce((message, done) => {
        console.log(message);
        done();
    }, DRAIN_THRESHOLD, DRAIN_TIMEOUT).then(r => {
        console.log("drain done: " + r);
    }).catch(e => {
        console.log("drain timeout: " + e);
    });
    
    consumer.resetConsumer([TEST_TOPIC]).then(_ => {});
});

kc.on("error", err => console.log("consumer error: " + err));
```

## consumer (PartitionDrainer) [faster ~ runs a queue per topic partition]

```javascript
const kc = new Kafka(ZK_CON_STR, LOGGER);
kc.becomeConsumer([TEST_TOPIC], GROUP_ID, OPTIONS);

kc.on("ready", () => {
    consumer = new PartitionDrainer(kc, 1); //1 = thread/worker/parallel count per partition
    
    //drain requires a topic-name and returns a promise 
    consumer.drain(TEST_TOPIC, (message, done) => {
        console.log(message);
        done();
    }).then(_ => ..).catch(e => console.log(e));
    
    consumer.stopDrain();
    
    //drainOnce requires a topic-name
    consumer.drainOnce(TEST_TOPIC, (message, done) => {
        console.log(message);
        done();
    }, DRAIN_THRESHOLD, DRAIN_TIMEOUT).then(r => {
        console.log("drain done: " + r);
    }).catch(e => {
        console.log("drain timeout: " + e);
    });
    
    consumer.resetConsumer([TEST_TOPIC]).then(_ => {});
});

kc.on("error", err => console.log("consumer error: " + err));
```

## hints

- interesting options for tweaking consumers

```javascript
const OPTIONS = {
    sessionTimeout: 12500,
    protocol: ["roundrobin"],
    fromOffset: "latest", //earliest
    fetchMaxBytes: 1024 * 100,
    fetchMinBytes: 1,
    fetchMaxWaitMs: 100,
    autoCommit: true,
    autoCommitIntervalMs: 5000
};
```

- remove and create topic api will require a special broker configuration
or these will just result in nothing at all

```javascript
drainer.removeTopics([]).then(..)
publisher.createTopics([]).then(..)
```

- using the `.getStats()` functions on Drainer, Publisher or 
PartitionDrainer you can get some valueable insights into whats
currently going on in your client

- when using "Drainer" to consume and write upserts into a database
that require ACID functionality and a build-up of models/message-payloads
you must set the AsyncLimit of new Drainer(.., 1) to "1" or you will
have trouble with data integrity

- if your data is spread entity wise above partitions you can use the
"PartitionDrainer" to drain multiple partitions at the same time

- it is probably a good idea to spawn a Consumer per Topic