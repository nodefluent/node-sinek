# PartitionDrainer [faster ~ runs a queue per topic partition]

```javascript
const kafkaClient = new Kafka("zk-host:2181/kafka");
//const kafkaClient = new Kafka("kafka-host:9092/", null, true); //connect directly to kafka broker

kafkaClient.becomeConsumer(["a-topic"], "consumerGroupId123", options);

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
});

kafkaClient.on("error", err => console.log("consumer error: " + err));
```
