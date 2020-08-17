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

### Usage - JS Client (based on kafka.js)

```javascript
const {
  JSConsumer,
  JSProducer
} = require("sinek");

const jsProducerConfig = {
  clientId: "my-app",
  brokers: ["kafka1:9092"]
}

(async () => {

  const topic = "my-topic";

  const producer = new JSProducer(jsProducerConfig);
  const consumer = new JSConsumer(topic, jsConsumerConfig);

  producer.on("error", error => console.error(error));
  consumer.on("error", error => console.error(error));

  await consumer.connect();

  // consume from a topic.
  consumer.consume(async (messages) => {
    messages.forEach((message) => {
      console.log(message);
    })
  });

  // Produce messages to a topic.
  await producer.connect();
  producer.send(topic, "a message")
})().catch(console.error);

```

# Further Docs

* [Best-practice example](examples/best-practice-example)
* [SSL example](examples/ssl-example/)
* [SASL+SSL example](examples/sasl-ssl-example/)
* [Alpine based docker example](kafka-setup/alpine.Dockerfile)
* [Debian based docker example](kafka-setup/debian.Dockerfile)

> make it about them, not about you
> - Simon Sinek
