<center><img src="https://cdn1.teamhellfall.de/contentdelivery/8642e870-7555-473a-b549-c520bd85bc51.0861a88f-28cf-42b6-88c7-f2942e64cc79.png?dim=165x125" /></center><br/>

# node-sinek

[![Greenkeeper badge](https://badges.greenkeeper.io/nodefluent/node-sinek.svg)](https://greenkeeper.io/)
[![Build Status](https://travis-ci.org/nodefluent/node-sinek.svg?branch=master)](https://travis-ci.org/nodefluent/node-sinek)
[![npm version](https://badge.fury.io/js/sinek.svg)](https://badge.fury.io/js/sinek)

kafka client(s) polite out of the box

> make it about them, not about you
> - Simon Sinek

## info
- promise based api
- core builds `kafka-node` module (checkout for [options & tweaking](https://github.com/SOHU-Co/kafka-node/blob/master/README.md))
- uses ConsumerGroup(s) means your kafka needs to be > 0.9.x ( - 0.10.2+)
- check out :goberserk: [node-kafka-streams](https://github.com/nodefluent/kafka-streams) for a stream processing kafka api
- check out :fire: [node-kafka-connect](https://github.com/nodefluent/kafka-connect) for a easy datastore <-> kafka transfer

## offers

- provides an incoming message flow control for consumers
- provides a drain once for consumers
- provides an easy api for producers
- documentation is still wip;

## install

```shell
npm install --save sinek
```

# usage

```javascript
const {Kafka, Drainer, Publisher, PartitionDrainer, Consumer, Producer} = require("sinek");
```

# docs

[Publisher](docs/publisher.md)
[Drainer](docs/drainer.md)
[PartitionDrainer](docs/partition-drainer.md)
[Consumer & Producer](lib/connect/README.md)
[Hints & Help](docs/hints.md)