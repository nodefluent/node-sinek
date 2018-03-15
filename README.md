# High Level Node.js Kafka Client - sinek

[![Greenkeeper badge](https://badges.greenkeeper.io/nodefluent/node-sinek.svg)](https://greenkeeper.io/)
[![Build Status](https://travis-ci.org/nodefluent/node-sinek.svg?branch=master)](https://travis-ci.org/nodefluent/node-sinek)
[![npm version](https://badge.fury.io/js/sinek.svg)](https://badge.fury.io/js/sinek)

The most advanced Kafka Client.

## Features

* easy promise based API
* a lot of Kafka pitfalls already taken care of
* backpressure and stream consume modes
* secure committing in backpressure (1:n, batch) mode
* plain Javascript implementation based on `kafka-node` and a super fast native implementation based on `node-rdkafka`
* SSL, SASL & Kerberos support
* auto reconnects
* auto partition recognition and deterministic spreading for producers
* **intelligent health-checks** and **analytic events** for consumers and producers

## You might also like

* check out :goberserk: [node-kafka-streams](https://github.com/nodefluent/kafka-streams) for a stream processing kafka api
* check out :fire: [node-kafka-connect](https://github.com/nodefluent/kafka-connect) for a easy datastore <-> kafka transfer

## Latest Changes

Can be found [here](CHANGELOG.md)

## Install

```shell
npm install --save sinek
```

## Usage - Native Client

```javascript
const {
  NConsumer,
  NProducer
} = require("sinek");
```

* We suggest using the native clients NConsumer & NProducer implementations, if possible.
* [Native Client (NConsumer & NProducer)](lib/librdkafka/README.md)

## Usage - Javascript Client

```javascript
const {
  Consumer,
  Producer
} = require("sinek");
```

* If you cannot use the native clients, you can still use sinek's fallbacks JS implementations
* [Kafka Client (Consumer & Producer)](lib/connect/README.md)

# Docs

* [SSL example](ssl-example/)
* [SASL example with the Native Client](sasl-ssl-example/)
* [Alpine based docker example](kafka-setup/alpine.Dockerfile)
* [Debian based docker example](kafka-setup/debian.Dockerfile)
* The older client implementations:
* [Publisher](docs/publisher.md)
* [Drainer](docs/drainer.md)
* [PartitionDrainer](docs/partition-drainer.md)
* [Hints & Help](docs/hints.md)

> make it about them, not about you
> - Simon Sinek
