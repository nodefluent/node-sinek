import util from "util";

import {default as DeprecatedKafka} from "./kafka/Kafka";
import {default as DeprecatedDrainer} from "./kafka/Drainer";
import {default as DeprecatedPublisher} from "./kafka/Publisher";
import {default as DeprecatedPartitionDrainer} from "./kafka/PartitionDrainer";

import {default as DeprecatedConsumer} from "./connect/Consumer";
import {default as DeprecatedProducer} from "./connect/Producer";

export {default as NConsumer} from "./librdkafka/NConsumer";
export {default as NProducer} from "./librdkafka/NProducer";

import {ProducerHealth, ConsumerHealth} from "./librdkafka/Health";
import {ProducerAnalytics, ConsumerAnalytics} from "./librdkafka/Analytics";
import {DrainerConstructor, KafkaConstructor, PartitionDrainerConstructor, PublisherConstructor} from "./interfaces";


const Kafka: KafkaConstructor = util.deprecate(DeprecatedKafka, "Kafka is deprecated, please use 'NConsumer' if possible.");
const Drainer: DrainerConstructor = util.deprecate(DeprecatedDrainer, "Drainer is deprecated, please use 'NConsumer' if possible.");
const PartitionDrainer: PartitionDrainerConstructor = util.deprecate(DeprecatedPartitionDrainer, "PartitionDrainer is deprecated, please use 'NConsumer' if possible.");
const Publisher: PublisherConstructor = util.deprecate(DeprecatedPublisher, "Publisher is deprecated, please use 'NProducer' if possible.");
const Consumer = util.deprecate(DeprecatedConsumer, "Consumer is deprecated, please use (noptions) 'NConsumer' if possible.");
const Producer = util.deprecate(DeprecatedProducer, "Producer is deprecated, please use (noptions) 'NProducer' if possible.");

const Health = {
    ProducerHealth,
    ConsumerHealth,
};

const Analytics = {
    ProducerAnalytics,
    ConsumerAnalytics,
};


export {
    Kafka, Drainer, PartitionDrainer, Publisher,

    Consumer, Producer,

    Health,
    Analytics
}

export {
    KafkaHealthConfig,
    NCommonKafkaOptions,
    NConsumerKafkaOptions,
    NProducerKafkaOptions,
    KafkaConsumerConfig,
    KafkaProducerConfig,
    KafkaMessage,
    SortedMessageBatch,
    BatchConfig,
    ConsumerStats,
    LagStatus,
    ProducerStats,
    MessageReturn,
    KafkaLogger,
} from "./interfaces";
