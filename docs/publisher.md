# Publisher

```javascript
const kafkaClient = new Kafka("zk-host:2181/kafka");
//const kafkaClient = new Kafka("kafka-host:9092/", null, true); //connect directly to kafka broker

kafkaClient.becomeProducer(["my-topic"], "a-client-name", options);

kafkaClient.on("ready", () => {
    producer = new Publisher(kafkaClient, 30); //partition count should be the default count on your brokers partiitons e.g. 30

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
