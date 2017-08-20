# SSL-Example

- start the zk+broker combo [here](kafka-setup/README.md)
- run `node producer.js` and wait until the producer is connected and sending (as the broker will have to create the topic during the first start)
- run `node consumer.js` to receive the produced messages
