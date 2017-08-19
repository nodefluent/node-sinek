# SSL-Example

## this is currently broken, we are trying to fix it

- start the zk+broker combo [here](kafka-setup/README.md) (make sure to create the certs first)
- run `node producer.js` and wait until the producer is connected and sending (as the broker will have to create the topic during the first start)
- run `node consumer.js` to receive the produced messages
