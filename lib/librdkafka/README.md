# Native (librdkafka) Consumer & Producer

- they do not support all features of sinek
- they perform better than the other clients
- they support SASL (kerberos)

## Setup (required actions to use the clients)

- `sudo apt install librdkafka-dev libsasl2-dev`
- `npm i --no-package-lock --no-save node-rdkafka`
- done

## Using NConsumer & NProducer

- the API is the exact same as the [Connect Clients](../connect)
- the only difference is that the clients are prefixed with an `N`
- so exchange `const {Consumer, Producer} = require("sinek");` with `const {NConsumer, NProducer} = require("sinek");`

## New/Additional Configuration Parameters

- as usual sinek tries to be as polite as possible and will offer you to use the same
config that you are used to use with the other clients
- however `librdkafka` brings a whole lot of different config settings and parameters
- you can overwrite them (or use interely) with a config sub-object called `noptions`
- e.g. `const config = { noptions: { "metadata.broker.list": "localhost:9092"} };`
- a full list and descriptions of config params can be found [here](https://github.com/edenhill/librdkafka/blob/0.9.5.x/CONFIGURATION.md)
