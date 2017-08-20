#!/usr/bin/env sh
BASEDIR=$(dirname "$0")
docker-compose --file ${BASEDIR}/docker-compose.yml down
