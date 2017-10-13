# Native (librdkafka) Consumer & Producer

- they do not support 100% all features of sinek
- they have a slightly different API compared to the connect variants
- they perform a little better than the other clients
- they support SASL (kerberos)
- you can work directly with Buffers

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
  * e.g. `const config = { noptions: { "metadata.broker.list": "localhost:9092"} };`
- a full list and descriptions of config params can be found [CONFIG HERE](https://github.com/edenhill/librdkafka/blob/0.9.5.x/CONFIGURATION.md)
- producer poll interval can be configured via `const config = { options: { pollIntervalMs: 100 }};` - *default is 100ms*
- consumer poll grace (only 1 by 1 mode) can be configured via `const config = { options: { consumeGraceMs: 125 }};` - *default is 1000ms*
- when **noptions** is set, you do not have to set the old config params

## Consumer Modes
- 1 by 1 mode by passing **a callback** to `.consume()` - see [test/int/NSinek.test.js](../../test/int/NSinek.test.js)
  * consumes a single message and commit after callback each round
- asap mode by passing **no callback** to `.consume()` - see [test/int/NSinekF.test.js](../../test/int/NSinekF.test.js)
  * consumes messages as fast as possible

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
   */

   const options = {
     batchSize: 500, //grab up to 500 messages per batch round
     commitEveryNBatch: 5, //commit all offsets on every 5th batch
     concurrency: 2, //calls synFunction in parallel * 2 for messages in batch
     commitSync: false //commits asynchronously (faster, but potential danger of growing offline commit request queue)
   };

   myNConsumer.consume(syncFunction, true, false, options);
```

- when active, this mode will also expose more a field called `batch` with insight stats on the `.getStats()` object
- and the consumer instance will emit a `consumer.on("batch", messages => {});` event

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

Make sure you read explain the memory usage in librdkafka FAQ:
https://github.com/edenhill/librdkafka/wiki/FAQ#explain-the-consumers-memory-usage-to-me

#### Our experience

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

## Altering subscriptions

- `consumer.addSubscriptions(["topic1", "topic2"])` -> will add additional subscriptions
- `consumer.adjustSubscription(["topic1"])` -> will change subcriptions to these only

## BREAKING CHANGES CONSUMER API (compared to connect/Consumer):
- there is an optional options object for the config named: **noptions** - see [sasl-ssl-example](../../sasl-ssl-example/)
- pause and resume have been removed
- `consumeOnce` is not implemented
- backpressure mode is not implemented
  * given in 1 message only commit mode
- 1 message only & consume asap modes can be controlled via `consumer.consume(syncEvent);`
  * if syncEvent is present it will consume & commit single messages on callback
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
