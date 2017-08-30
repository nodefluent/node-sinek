# sinek CHANGELOG

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
* **BREAKING CHANGE** The `key` is decoded as a `string` by default. Previously was a `Buffer`. The preferred encoding for the key can be defined by the `keyEncoding` option on any of the consumers and will fallback to `encoding` if omitted

## 2017-07-10, Version 4.4.0
* First entry in CHANGELOG.md
