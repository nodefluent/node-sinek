# Native (librdkafka) Consumer & Producer

- they are incredibly fast: consume 2m messages/sec and produce 1m messsages/sec
- they have additional analytics and health-check features
- they require the installation of librdkafka + (native module) node-librdkafka
- they have a slightly different API compared to the connect (Javascript) variants
- they support SASL (and Kerberos)
- you can work directly with Buffers
- topic drain is not supported

## Setup (required actions to use the clients)

- `npm i -g yarn` # make sure to have yarn available

### Debian/Ubuntu

- `sudo apt install librdkafka-dev libsasl2-dev`
- `rm -rf node_modules`
- `yarn` # node-rdkafka is installed as optional dependency

### MacOS

- `brew install librdkafka`
- `brew install openssl`
- `rm -rf node_modules`
- `yarn` # node-rdkafka is installed as optional dependency

```shell
  # If you have a ssl problem with an error like: `Invalid value for configuration property "security.protocol"`
  # Add to your shell profile:
  export CPPFLAGS=-I/usr/local/opt/openssl/include
  export LDFLAGS=-L/usr/local/opt/openssl/lib
  # and redo the installation.
```

## Using NConsumer & NProducer

- the API is the almost the same as the [Connect Clients](../connect)
- the only difference is that the clients are prefixed with an **N**

> so exchange `const {Consumer, Producer} = require("sinek");`

> with `const {NConsumer, NProducer} = require("sinek");`

You can find an implementation [example here](../../sasl-ssl-example)

## New/Additional Configuration Parameters

- as usual sinek tries to be as polite as possible and will offer you to use the same
    config that you are used to use with the other clients
- however *librdkafka* brings a whole lot of different config settings and parameters
- you can overwrite them (or use interely) with a config sub-object called **noptions**
    e.g. `const config = { noptions: { "metadata.broker.list": "localhost:9092"} };`
- a full list and descriptions of config params can be found [CONFIG HERE](https://github.com/edenhill/librdkafka/blob/0.9.5.x/CONFIGURATION.md)
- producer poll interval can be configured via `const config = { options: { pollIntervalMs: 100 }};` - *default is 100ms*
- consumer poll grace (only 1 by 1 mode) can be configured via `const config = { options: { consumeGraceMs: 125 }};` - *default is 1000ms*
- when **noptions** is set, you do not have to set the old config params

## Producer Auto Partition Count Mode

- it is possible to let the producer automatically handle the amount
    of partitions (max count) of topics, when producing
- to do that you must pass `"auto"` as third argument of the constructor
    `new NProducer(config, null, "auto");`
- and you must not pass a specific partition to the `send(), buffer() or bufferXXX()` functions
- this way the the producer will fetch the metadata for the specific topics,
    parse the partition count from it and use it as max value for its random or deterministic
    partition selection approach
- *NOTE:* that the topic must exist before producing if you are using the `auto` mode
- when auto mode is enabled you can use `producer.getStoredPartitionCounts()` to grab
    the locally cached partition counts

### Getting Metadata via Producer

- `producer.getMetdata()` returns generic information about all topics on the connected broker
- `producer.getTopicMetadata("my-topic")` returns info for specific topic (*NOTE:* will create topic
    if it does not already exist)
- `Metadata` instances offer a few handy formatting functions checkout `/lib/librdkafka/Metadata.js`

## Switching Producer Partition "Finder" mode

- when passing no partition argument to the send or buffer methods, the producer will deterministically
        identify the partition to produce the message to, by running a modulo (to the partition count of the topic)
        on the key (or generated key) of the message.
- as the key is a string, it has to be turned into a hash, per default sinek uses murmurhash version 3 for that
- the JAVA clients use murmurhash version 2 -> so if you want to stay compatible simply pass a config field:

```javascript
const config = {
    options: {
        murmurHashVersion: "2"
    }
};
```

## Consumer Modes

- 1 by 1 mode by passing **a callback** to `.consume()` - see [test/int/NSinek.test.js](../../test/int/NSinek.test.js)
    consumes a single message and commit after callback each round
- asap mode by passing **no callback** to `.consume()` - see [test/int/NSinekF.test.js](../../test/int/NSinekF.test.js)
    consumes messages as fast as possible

### Advanced 1:n consumer mode

- as stated above, passing a iteratee function to .consume() as first parameter will enable 1 by 1 mode,
    where every kafka message is consumed singlehandedly, passed to the function and committed afterwards, before
    consuming the next message -> while this is secure and ensures that no messages is left untreated, even if your
    consumer dies, it is also very slow
- which is why we added options to controll the behavior as you whish:

```javascript
  /*
   *  batchSize (default 1) amount of messages that is max. fetched per round
   *  commitEveryNBatch (default 1) amount of messages that should be processed before committing
   *  concurrency (default 1) the concurrency of the execution per batch
   *  commitSync (default true) if the commit action should be blocking or non-blocking
   *  noBatchCommits defaults to false, if set to true, no commits will be made for batches
   */

   const options = {
     batchSize: 500, //grab up to 500 messages per batch round
     commitEveryNBatch: 5, //commit all offsets on every 5th batch
     concurrency: 2, //calls synFunction in parallel * 2 for messages in batch
     commitSync: false, //commits asynchronously (faster, but potential danger of growing offline commit request queue) => default is true
     noBatchCommits: false //default is false, IF YOU SET THIS TO true THERE WONT BE ANY COMMITS FOR BATCHES
   };

   myNConsumer.consume(syncFunction, true, false, options);
```

- when active, this mode will also expose more a field called `batch` with insight stats on the `.getStats()` object
- and the consumer instance will emit a `consumer.on("batch", messages => {});` event

### Accessing Consumer Offset Information

- `consumer.getOffsetForTopicPartition("my-topic", 1).then(offsets => {});`
- `consumer.getComittedOffsets().then(offsets => {});`
- `const info = consumer.getAssignedPartitions();`
- `consumer.getLagStatus().then(offsets => {});` -> automatically fetches and compares offsets for all assigned partitions for you

## Complex Analytics Access for Consumers and Producers

- additional information regarding performance and offset lags are exposed through analytics functions
- take a look at the description [here](Analytics.md)

## Intelligent Health Check for Consumers and Producers

- when analytics are enabled, the clients also offer an intelligent health check functionality
- take a look at the description [here](Health.md)

## Buffer, String or JSON as message values

- you can call `producer.send()` with a string or with a Buffer instance
- you can only call `producer.bufferXXX()` methods with objects
- you can consume buffer message values with `consumer.consume(_, false, false)`
- you can consume string message values with `consumer.consume(_, true, false)` - *this is the default*
- you can consume json message values with `consumer.consume(_, true, true)`

## Debug Messages

- if you do not pass a logger via config: `const config = { logger: { debug: console.log, info: console.log, .. }};`
- the native clients will use the debug module to log messages
- use e.g. `DEBUG=sinek:n* npm test`

## Memory Usage

Make sure you read explain the memory usage in librdkafka [FAQ](https://github.com/edenhill/librdkafka/wiki/FAQ#explain-the-consumers-memory-usage-to-me).

## Our experience

To limit memory usage, you need to set noptions to:

```json
{
  "noptions": {
    "metadata.broker.list": "kafka:9092",
    "group.id": "consumer-group-1",
    "api.version.request": true,
    "queued.min.messages": 1000,
    "queued.max.messages.kbytes": 5000,
    "fetch.message.max.bytes": 524288,
    }
}
```

- these values ^ are now set as default (sinek >= 6.5.0)

## Altering subscriptions

- `consumer.addSubscriptions(["topic1", "topic2"])` -> will add additional subscriptions
- `consumer.adjustSubscription(["topic1"])` -> will change subcriptions to these only

## Resuming and Pausing Clients

- you can resume and pause clients via
- `client.pause(topicPartitions);`
- `client.resume(topicPartitions);`
- topicPartitions is an array of objects `[{topic: "test", partition: 0}]`
- be carefull, as a paused producer rejects if you try to send

## BREAKING CHANGES CONSUMER API (compared to connect/Consumer):

- there is an optional options object for the config named: **noptions** - see [sasl-ssl-example](../../sasl-ssl-example/)
- `consumeOnce` is not implemented
- backpressure mode is not implemented
    given in 1 message only commit mode
- 1 message only & consume asap modes can be controlled via `consumer.consume(syncEvent);`
    if syncEvent is present it will consume & commit single messages on callback
- lastProcessed and lastReceived are now set to null as default value
- closing will reset stats
- no internal async-queue is used to manage messages
- tconf config field sets topic configuration such as `{ "auto.offset.reset": "earliest" }`

## BREAKING CHANGES PRODUCER API (compared to connect/Producer):

- send does not support arrays of messages
- compressionType does not work anymore
- no topics are passed in the constructor
- send can now exactly write to a partition or with a specific key
- there is an optional options object for the config named: **noptions**
- there is an optional topic options object for the config named: **tconf**
- sending now rejects if paused
- you can now define a strict partition for send bufferFormat types
- `_lastProcessed` is now null if no message has been send
- closing will reset stats
- tconf config field sets topic configuration
