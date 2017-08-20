#!/usr/bin/env sh
rm -rf /tmp/kafka-data
mkdir /tmp/kafka-data
mkdir /tmp/kafka-data/data
mkdir /tmp/kafka-data/logs
chmod -R 777 /tmp/kafka-data

BASEDIR=$(dirname "$0")

if [ -z "$(docker-compose --file ${BASEDIR}/docker-compose.yml ps -q)" ]; then
	${BASEDIR}/generate-certs.sh
fi

docker-compose --file ${BASEDIR}/docker-compose.yml rm
docker-compose --file ${BASEDIR}/docker-compose.yml up -d
