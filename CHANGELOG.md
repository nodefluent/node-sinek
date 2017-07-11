# sinek CHANGELOG

## 2017-07-11, Version 5.0.0

#### Kafka Client is now able to connect directly to the Kafka Broker
* Updated all dependencies
* Clients can now omit Zookeeper and connect directly to a Broker by omitting zkConStr and passing kafkaHost in the config

####  Producer/Consumer Key Changes [#704](https://github.com/SOHU-Co/kafka-node/pull/704)
* **BREAKING CHANGE** The `key` is decoded as a `string` by default. Previously was a `Buffer`. The preferred encoding for the key can be defined by the `keyEncoding` option on any of the consumers and will fallback to `encoding` if omitted

## 2017-07-10, Version 4.4.0
* First entry in CHANGELOG.md
