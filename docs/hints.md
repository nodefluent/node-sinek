# Hints

- interesting options for tweaking consumers

```javascript
const options = {
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
PartitionDrainer you can get some valuable insights into whats
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

- example implementations can be found [here](https://github.com/nodefluent/kafka-streams/blob/master/lib/KafkaClient.js) 
and [here](https://github.com/nodefluent/kafka-connect/blob/master/lib)