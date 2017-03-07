<center><img src="sinek.png?raw=true" height="245" /></center><br/>

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
const {Kafka, Drainer, Publisher} = require("sinek");
```

## producer (Publisher)

```javascript
const kp = new Kafka(ZK_CON_STR, LOGGER);
kp.becomeProducer([TEST_TOPIC], CLIENT_NAME, OPTIONS);

kp.on("ready", () => {
    producer = new Publisher(kp);
    
    producer.send()
    producer.send(TEST_TOPIC, [])
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

## hints

```javascript

//interesting options for tweaking consumers
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

//remove and create topic api will require
//a special broker configuration or these
//will just result in nothing at all
drainer.removeTopics([]).then(..)
publisher.createTopics([]).then(..)
```