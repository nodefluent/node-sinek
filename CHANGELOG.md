# sinek CHANGELOG

## 2018-05-31, Version 6.17.0

* switched default encoding for messages value and key for JS Kafka client to Buffer
* simplified integration tests
* updated dependencies:

 kafka-node     ~2.4.1  →   ~2.6.1
 eslint        ~4.18.2  →  ~4.19.1
 mocha          ~5.0.4  →   ~5.2.0
 sinon          ^4.4.6  →   ^6.0.0
 node-rdkafka   ~2.2.3  →   ~2.3.3
 async  ~2.6.0  →  ~2.6.1

## 2018-05-31, Version 6.16.0

* updated NConsumer and NProducer to debug and concat errors of require of native lib

## 2018-03-27, Version 6.15.1

* node-rdkafka has seg fault bugs in 2.3.1 -> falling back to 2.2.3

## 2018-03-15, Version 6.15.0

* corrected consumer callback error pass (now also logging warning to not do it)
* now allows to pass correlation-id (opaque key) when producing with NProducer
* updated dependencies:

uuid  ~3.1.0  →  ~3.2.1
bluebird       ~3.5.0  →   ~3.5.1
debug          ^3.0.0  →   ^3.1.0
kafka-node     ^2.3.0  →   ^2.4.1
eslint        ^4.11.0  →  ^4.18.2
express       ^4.16.2  →  ^4.16.3
mocha          ~5.0.2  →   ~5.0.4
sinon          ^4.1.2  →   ^4.4.6
node-rdkafka   ^2.2.0  →   ^2.3.1

## 2018-02-18, Version 6.14.0

* now starting analytics immediately
* propagating connection promise correctly

## 2017-11-13, Version 6.13.0

* now proxying consumer_commit_cb
* upgraded dependencies: eslint@4.11.0, sinon@4.1.2, node-rdkafka@2.2.0

## 2017-11-03, Version 6.12.0

* upgraded node-librdkafka dependency to 2.1.1
* added pause and resume functions for NConsumer
* added commitMessage method to NConsumer
* added option to switch partition selection to murmurv2

## 2017-10-22, Version 6.11.0

* intelligent healthcheck, checkout librdkafka/Health.md
* average batch processing time in getStats() for nconsumer
* clear rejects for operations, when the clients are not connected
* added unit tests for Health.js
* refactored readme

## 2017-10-21, Version 6.10.0

* intelligent fetch grace times in batch mode
* small optimisations on nconsumer

## 2017-10-21, Version 6.9.0

* **BREAKING CHANGE** nconsumer 1:n (batch mode) does not commit on every x batches now,
    it will only commit when a certain amount of messages has been consumed and processed
    requiredAmountOfMessagesForCommit = batchSize * commitEveryNBatch
* this increases performance and makes less commit requests when a topic's lag has been
    resolved and the amount of "freshly" produced messages is clearly lower than batchSize.

## 2017-10-20, Version 6.8.0

* comes with the new analytics class for nproducers and nconsumers
* checkout librdkafka/Analytics.md

## 2017-10-18, Version 6.7.0

* new offset info functions for NConsumer (checkout librdkafka/README.md)
* new getLagStatus() function for NConsumer that fetches and compares partition offsets

## 2017-10-18, Version 6.6.1

* updates `node-rdkafka` to @2.1.0 which ships fixes

## 2017-10-18, Version 6.6.0

* added librdkafka/Metadata class
* added new metadata functions to NProducer
* send, buffer and _sendBufferFormat are now async functions
* ^ **BREAKING CHANGE** sinek now requires min. Node.js Version 7.6
* added `auto` mode for NProducer (automatically produces to latest partition count
    event if it changes during runtime of a producer -> updates every 5 minutes)
* refactored and optimized NProducer send logic
* updated librdkafka/README.md
* added new tests for NProducer

## 2017-10-17, Version 6.5.1

* fixed bug in NConsumer consume() consume options, where commitSync field was always true
* added JSDOC for NConsumer and NProducer

## 2017-10-13, Version 6.5.0

* new 1:N consumer mode (making 1:1 mode configurable with params -> see lib/librdkafka/README.md)
* more stats for consumer batch mode
* new consumer batch event
* **BREAKING CHANGE** as consumer.consume(syncEvent) now rejects if you have `enabled.auto.commit: true`
* updated librdkafka/README.md

## 2017-10-12, Version 6.4.1

* Updated depdendencies
* Re-created lockfile
* fixed bug in sync commit (now catching timeout errors)

## 2017-10-12, Version 6.4.0

* NConsumer automatically sets memory related configs (easier start if you missed those config params..)
* NConsumer in 1:1 mode will now use commitMessageSync instead of commitMessage (this reduces performance, but
    ensures we do not stack tons of commit-requests in the consumers-queue), sinek 6.5.0 will follow
    with an option to set the amount of messages that are consumed & committed in one step 1-10000

## 2017-10-11, Version 6.3.0

* bugfix on NProducer (partitions ranged from 1-30 instead of 0-29)

## 2017-09-12, Version 6.2.0

* added streaming mode to NConsumer,
    you can pass true to .connect(true) and omit .consume()
    to enable streaming mode consuming
* adjusted sasl example

## 2017-08-29, Version 6.1.2

* fixed connection event (ready) for connect/ consumers

## 2017-08-29, Version 6.1.0

#### LIBRDKAFKA Clients fixes to 6.0.4

* fixed a few small things
* added tconf fields to config
* updated docs
* more and better examples

#### LIBRDKAFKA Clients to 6.1.0

* updated NProducer api to allow new node-rdkafka 2.0.0
    (as it had breaking changes regarding its topic api)

## 2017-08-29, Version 6.0.0

#### LIBRDKAFKA Clients

* sinek now ships with an optional dependency to node-rdkafka
* 2 native clients embbed rdkafka in the usual sinek connector api interface
* NConsumer and NProducer
* sasl support
* additional config params through noptions

## 2017-08-20, Version 5.4.0

#### Focus on SSL

* fixed a few option reference passes to allow for better ssl support
* added /kafka-setup that allows for an easy local ssl kafka broker setup
* added /ssl-example to show how ssl connections are configured
* updated readme
* added eslint and updated code style accordingly

## 2017-08-11, Version 5.3.0

#### General Updates & Fixes

* Updated to latest kafka-node 2.2.0
* Fixed bug in logging message value length
* Added 3 new format methhods publish, unpublish, update to connect producer
* Added partitionKey (optional) to all bufferFormat operations of publisher and connect producer

## 2017-07-11, Version 5.0.0

#### Kafka Client is now able to connect directly to the Kafka Broker

* Updated all dependencies
* Clients can now omit Zookeeper and connect directly to a Broker by omitting zkConStr and passing kafkaHost in the config

####  Producer/Consumer Key Changes [#704](https://github.com/SOHU-Co/kafka-node/pull/704)

* **BREAKING CHANGE** The `key` is decoded as a `string` by default. Previously was a `Buffer`. The preferred encoding for the key can be   defined by the `keyEncoding` option on any of the consumers and will fallback to `encoding` if omitted

## 2017-07-10, Version 4.4.0

* First entry in CHANGELOG.md
