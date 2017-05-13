<center><img src="https://cdn1.teamhellfall.de/contentdelivery/8642e870-7555-473a-b549-c520bd85bc51.0861a88f-28cf-42b6-88c7-f2942e64cc79.png?dim=165x125" /></center><br/>

# node-sinek

[![Greenkeeper badge](https://badges.greenkeeper.io/nodefluent/node-sinek.svg)](https://greenkeeper.io/)

[![Build Status](https://travis-ci.org/nodefluent/node-sinek.svg?branch=master)](https://travis-ci.org/nodefluent/node-sinek)

kafka client (consumer + producer) polite out of the box

> make it about them, not about you
> - Simon Sinek

## info
- promise based api
- core builds `kafka-node` module (checkout for options & tweaking)
- uses ConsumerGroup(s) means your kafka needs to be > 0.9.x ( - 0.10.2+)
- check out :goberserk: [kafka-streams](https://github.com/nodefluent/kafka-streams) for a stream based kafka api

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
const kafkaClient = new Kafka(ZK_CON_STR, LOGGER);
kafkaClient.becomeProducer([TEST_TOPIC], CLIENT_NAME, OPTIONS);

kafkaClient.on("ready", () => {
    producer = new Publisher(kafkaClient, PARTITION_COUNT); //partition count should be the default count on your brokers partiitons e.g. 30
    
    producer.send(topic, messages, partitionKey, partition, compressionType)
    producer.batch(topic, [])
    
    producer.appendBuffer(topic, identifier, object, compressionType)
    producer.flushBuffer(topic)
    
    //easy api that uses a KeyedPartitioner Type and identifies the
    //target partition for the object's identifier by itself
    //it also brings your payload (object) in perfect shape for 
    //a nicely consumeable topic
    //call producer.flushBuffer(topic) to batch send the payloads
    producer.bufferPublishMessage(topic, identifier, object, version, compressionType)
    producer.bufferUnpublishMessage(topic, identifier, object, version, compressionType)
    producer.bufferUpdatehMessage(topic, identifier, object, version, compressionType)
});

kafkaClient.on("error", err => console.log("producer error: " + err));
```

## consumer (Drainer)

```javascript
const kafkaClient = new Kafka(ZK_CON_STR, LOGGER);
kafkaClient.becomeConsumer([TEST_TOPIC], GROUP_ID, OPTIONS);

kafkaClient.on("ready", () => {
    consumer = new Drainer(kafkaClient, 1); //1 = thread/worker/parallel count
    
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

kafkaClient.on("error", err => console.log("consumer error: " + err));
```

## consumer (PartitionDrainer) [faster ~ runs a queue per topic partition]

```javascript
const kafkaClient = new Kafka(ZK_CON_STR, LOGGER);
kafkaClient.becomeConsumer([TEST_TOPIC], GROUP_ID, OPTIONS);

kafkaClient.on("ready", () => {
    consumer = new PartitionDrainer(kafkaClient, 1); //1 = thread/worker/parallel count per partition
    
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

kafkaClient.on("error", err => console.log("consumer error: " + err));
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

- the "Publisher" offers a simple API to create such (keyed) partitioned
topics

- it is probably a good idea to spawn a Consumer per Topic
