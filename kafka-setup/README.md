## Local Kafka SSL Dev Setup

### Requirements

* Docker
* JDK

### Usage

> Run commands from project root

- Start kafka: `npm run kafka:start`
- Stop kafka: `npm run kafka:stop`
- Show kafka logs: `npm run kafka:logs`
- Produce to **test** topic with SSL_SASL: `npm run kafka:console produce`
- Consume from **test** topic with SSL_SASL: `npm run kafka:console consume`
