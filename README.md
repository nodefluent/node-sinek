<center><img src="https://cdn1.teamhellfall.de/contentdelivery/8642e870-7555-473a-b549-c520bd85bc51.0861a88f-28cf-42b6-88c7-f2942e64cc79.png?dim=165x125" /></center><br/>

# node-sinek

[![Greenkeeper badge](https://badges.greenkeeper.io/nodefluent/node-sinek.svg)](https://greenkeeper.io/)

[![Build Status](https://travis-ci.org/nodefluent/node-sinek.svg?branch=master)](https://travis-ci.org/nodefluent/node-sinek)
[![npm version](https://badge.fury.io/js/sinek.svg)](https://badge.fury.io/js/sinek)

Node.js kafka client, consumer, producer polite out of the box

> make it about them, not about you
> - Simon Sinek

## Info
- promise based api
- core builds `kafka-node` module (checkout for [options & tweaking](https://github.com/SOHU-Co/kafka-node/blob/master/README.md))
- uses ConsumerGroup(s) means your kafka needs to be > 0.9.x ( - 0.10.2+)
- check out :goberserk: [node-kafka-streams](https://github.com/nodefluent/kafka-streams) for a stream processing kafka api
- check out :fire: [node-kafka-connect](https://github.com/nodefluent/kafka-connect) for a easy datastore <-> kafka transfer

## Offers

- easy api
- no worries backpressure service (dont fry your database)
- auto-commit / manual drain commit in backpressure-mode (dont loose data)
- a lot of pitfalls are automatically taken care of
- provides a drain once for consumers (that reads a whole topic and fires an event)
- provides easy partition spreading, keyed messages and json formats for producers
- auto reconnect
- SSL support

## Install

```shell
npm install --save sinek
```

# Usage

```javascript
const {Kafka, Drainer, Publisher, PartitionDrainer, Consumer, Producer} = require("sinek");
```

# Docs

* If you just want a Kafka Client (Producer / Consumer) that works well and ships batteries included,
just take a look at these two and their setup example:
* [Consumer & Producer](lib/connect/README.md)
* [Find an SSL example here](ssl-example/)

# Other Docs

* [Publisher](docs/publisher.md)
* [Drainer](docs/drainer.md)
* [PartitionDrainer](docs/partition-drainer.md)
* [Hints & Help](docs/hints.md)
