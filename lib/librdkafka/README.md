# Native (librdkafka) Consumer & Producer

- they do not support all features of sinek
- they perform better than the other clients
- they support SASL (kerberos)

## Setup (required actions to use the clients)

- `sudo apt install librdkafka-dev`
- `npm i --no-package-lock --no-save node-rdkafka`
- done

## Using NConsumer & NProducer

- the API is the exact same as the [Connect Clients](../connect)
- the only difference is that the clients are prefixed with an `N`
- so exchange `const {Consumer, Producer} = require("sinek");` with `const {NConsumer, NProducer} = require("sinek");`
