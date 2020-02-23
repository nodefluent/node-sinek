# High Level Node.js Kafka Client

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

## Usage

### General

* [Best-practice example](examples/best-practice-example)

### Usage - JS Client

```javascript
const {
  JSConsumer,
  JSProducer
} = require("sinek");
```

### Usage - Native Client

```javascript
const {
  NConsumer,
  NProducer
} = require("sinek");
```

* [Native Client (NConsumer & NProducer)](docs/native.md)

# Further Docs

* [SSL example](examples/ssl-example/)
* [SASL+SSL example](examples/sasl-ssl-example/)
* [Alpine based docker example](kafka-setup/alpine.Dockerfile)
* [Debian based docker example](kafka-setup/debian.Dockerfile)

> make it about them, not about you
> - Simon Sinek
