#!/usr/bin/env bash
rm -rf /tmp/kafka-data
mkdir /tmp/kafka-data
mkdir /tmp/kafka-data/data
mkdir /tmp/kafka-data/logs
chmod -R 777 /tmp/kafka-data

./generate-certs.sh

docker-compose rm
docker-compose up -d