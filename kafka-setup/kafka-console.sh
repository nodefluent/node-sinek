#!/usr/bin/env sh

BASEDIR=$(git rev-parse --show-toplevel)

COMMAND=${@}
TOPIC=${TOPIC:-test}
KAFKA_HOST=${KAFKA_HOST:-localhost:9193}
ZHOST=${ZHOST:-localhost:2181}
CLIENT_JAAS="${BASEDIR}/kafka-setup/client-jaas.conf"

echo "Kafka host: ${KAFKA_HOST} // ZHost: ${ZHOST}"

create_client_properties () {
  if [ -z "${CLIENT_PROPERTIES}" ]; then
    mkdir -p /tmp/kafka-data
    cp ${BASEDIR}/kafka-setup/client.properties /tmp/kafka-data/client.properties
    echo "bootstrap.servers=${KAFKA_HOST}" >> /tmp/kafka-data/client.properties
    echo "ssl.truststore.location=${BASEDIR}/certs/docker.kafka.server.truststore.jks" >> /tmp/kafka-data/client.properties
    echo "ssl.keystore.location=${BASEDIR}/certs/docker.kafka.server.keystore.jks" >> /tmp/kafka-data/client.properties
    CLIENT_PROPERTIES="/tmp/kafka-data/client.properties"
  fi
}

case "$COMMAND" in
  "consume")
    echo "Consume on ${TOPIC} topic."
    create_client_properties
    KAFKA_LOG4J_OPTS="-Djava.security.auth.login.config=${CLIENT_JAAS}" kafka-console-consumer --from-beginning --bootstrap-server=${KAFKA_HOST} --topic=${TOPIC} --consumer.config=${CLIENT_PROPERTIES}
  ;;
  "produce")
    echo "Produce on ${TOPIC} topic."
    create_client_properties
    KAFKA_LOG4J_OPTS="-Djava.security.auth.login.config=${CLIENT_JAAS}" kafka-console-producer --broker-list=${KAFKA_HOST} --topic=${TOPIC} --producer.config=${CLIENT_PROPERTIES}
  ;;
  "create-topic")
    echo "Create ${TOPIC} topic:"
    kafka-topics --create --zookeeper=${ZHOST} --replication-factor=1 --partitions=1 --topic=${TOPIC}
  ;;
  "topics")
    echo "Topic list:"
    kafka-topics --zookeeper=${ZHOST} --list
  ;;
  *)
    echo "Invalid command."
    echo "Usage: $0 {consume|produce|create-topic|topics}"
    echo "  consume       : Consume on ${TOPIC} topic."
    echo "  produce       : Produce on ${TOPIC} topic."
    echo "  create-topic  : Create the ${TOPIC} topic."
    echo "  topics        : Show topic list."
  ;;
esac
