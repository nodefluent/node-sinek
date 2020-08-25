/// <reference types="node" />
import { Promise } from "bluebird";
import { Kafka, Consumer, KafkaMessage } from "kafkajs";
import { EventEmitter } from "events";
import { BatchConfig, LagStatus, JSKafkaConsumerConfig, KafkaLogger, ConsumerStats } from "../interfaces";
import { ConsumerAnalytics, Metadata, Check, ConsumerRunResult } from "../shared";
export interface FormattedKafkaMessage extends Omit<KafkaMessage, "value"> {
    value: Buffer | string | Record<string, unknown>;
}
export interface ComittedOffsets {
    partition: number;
    offset: string;
    metadata: string | null;
    topic: string;
}
declare type Lag = {
    status: LagStatus[];
    at: number;
    took: number;
};
declare type ConsumeCallback = ((messages: any, callback: any) => void) | null;
/**
 * wrapper around kafkajs that immitates nconsumer
 * @extends EventEmitter
 */
export declare class JSConsumer extends EventEmitter {
    kafkaClient: Kafka;
    topics: string[];
    config: JSKafkaConsumerConfig;
    asString: boolean;
    asJSON: boolean;
    asStream: boolean;
    consumer: Consumer | undefined;
    private _firstMessageConsumed;
    private _totalIncomingMessages;
    private _lastReceived;
    private _totalProcessedMessages;
    private _lastProcessed;
    private _isAutoCommitting;
    private _batchCount;
    private _batchCommitts;
    private _batchConfig;
    private _totalBatches;
    private _lastLagStatus;
    private _lagCache;
    private _analyticsOptions;
    _analytics: ConsumerAnalytics | undefined;
    private _consumedSinceCommit;
    private _emptyFetches;
    private _avgBatchProcessingTime;
    private _extCommitCallback;
    private _errors;
    private _groupId;
    private _adminClient;
    private _health;
    private _inClosing;
    /**
     * creates a new consumer instance
     * @param {string|Array} topics - topic or topics to subscribe to
     * @param {object} config - configuration object
     */
    constructor(topics: string | string[], config: JSKafkaConsumerConfig);
    /**
     * connect to broker
     * @param {boolean} asStream - optional, if client should be started in streaming mode
     * @param {object} opts - optional, options asString, asJSON (booleans)
     * @returns {Promise.<*>}
     */
    connect(asStream?: boolean): Promise<any>;
    /**
     * @private
     * event handler for async offset committs
     * @param {Error} error
     * @param {Array} partitions
     */
    _onOffsetCommit(error: Error, partitions: any[]): void;
    /**
     * @private
     * connects in flow mode mode
     * @param {object} logger
     * @param {object} noptions
     * @param {object} tconf
     * @returns {Promise.<*>}
     */
    _connectInFlow(logger: KafkaLogger): Promise;
    /**
     * @private
     * runs (and calls itself) until it has successfully
     * read a certain size of messages from the broker
     * @returns {boolean}
     */
    _consumerRun(syncEvent: ConsumeCallback): Promise<boolean>;
    /**
     * @private
     * converts message value according to booleans
     * @param {Buffer} _value
     * @param {boolean} asString
     * @param {boolean} asJSON
     * @returns {Buffer|string|object}
     */
    _convertMessageValue(_value: Buffer, asString?: boolean, asJSON?: boolean): Buffer | string | Record<string, unknown>;
    _bumpVariableOfBatch(startBPT: number, batchLength: number): void;
    _consumeHandler(syncEvent: ConsumeCallback, { manualBatching }: {
        manualBatching: boolean;
    }): Promise<void>;
    /**
     *  subscribe and start to consume, should be called only once after connection is successfull
     *  options object supports the following fields:
     *  batchSize amount of messages that is max. fetched per round
     *  commitEveryNBatch amount of messages that should be processed before committing
     *  concurrency the concurrency of the execution per batch
     *  commitSync if the commit action should be blocking or non-blocking
     *  noBatchCommits defaults to false, if set to true, no commits will be made for batches
     *
     * @param {function} syncEvent - callback (receives messages and callback as params)
     * @param {string} asString - optional, if message value should be decoded to utf8
     * @param {boolean} asJSON - optional, if message value should be json deserialised
     * @param {object} options - optional object containing options for 1:n mode:
     * @returns {Promise.<*>}
     */
    consume(syncEvent: ((messages: any, callback: any) => void) | null | undefined, asString: boolean | undefined, asJSON: boolean | undefined, options: BatchConfig): Promise<void>;
    /**
     * pause the consumer for specific topics (partitions)
     * @param {Array.<{}>} topicPartitions
     * @throws {LibrdKafkaError}
     */
    pause(topicPartitions?: never[]): void;
    /**
     * resume the consumer for specific topic (partitions)
     * @param {Array.<{}>} topicPartitions
     * @throws {LibrdKafkaError}
     */
    resume(topicPartitions?: never[]): void;
    /**
     * returns consumer statistics
     * @todo -  update type for consumer stats.
     * @returns {object}
     */
    getStats(): ConsumerStats;
    /**
     * @private
     * resets internal values
     */
    _reset(): void;
    /**
     * closes connection if open
     */
    close(): Promise;
    /**
     * gets the lowest and highest offset that is available
     * for a given kafka topic
     * @param {string} topic - name of the kafka topic
     * @param {number} partition - optional, default is 0
     * @returns {Promise.<object>}
     */
    getOffsetForTopicPartition(topic: string, partition?: number): Promise<ComittedOffsets[]>;
    /**
     * gets all comitted offsets
     * @param {number} timeout - optional, default is 2500
     * @returns {Promise.<Array>}
     */
    getComittedOffsets(timeout?: number): Promise<ComittedOffsets[]>;
    /**
     * gets all topic-partitions which are assigned to this consumer
     * @returns {Array}
     */
    getAssignedPartitions(): Promise<[]>;
    /**
     * @static
     * return the offset that has been comitted for a given topic and partition
     * @param {string} topic - topic name
     * @param {number} partition - partition
     * @param {Array} offsets - commit offsets from getComittedOffsets()
     */
    static findPartitionOffset(topic: string, partition: number, offsets: ComittedOffsets[]): string;
    /**
     * compares the local commit offset status with the remote broker
     * status for the topic partitions, for all assigned partitions of
     * the consumer
     * @param {boolean} noCache - when analytics are enabled the results can be taken from cache
     * @returns {Promise.<Array>}
     */
    getLagStatus(noCache?: boolean): Promise<LagStatus[]>;
    /**
     * called in interval
     * @private
     */
    _runAnalytics(): Promise<void>;
    /**
     * returns the last computed analytics results
     * @throws
     * @returns {object}
     */
    getAnalytics(): ConsumerRunResult | null;
    /**
     * called in interval
     * @private
     */
    _runLagCheck(): LagStatus[];
    /**
     * runs a health check and returns object with status and message
     * @returns {Promise.<object>}
     */
    checkHealth(): Promise<Check>;
    /**
     * resolve the metadata information for a give topic
     * will create topic if it doesnt exist
     * @param {string} topic - name of the topic to query metadata for
     * @returns {Promise.<Metadata>}
     */
    getTopicMetadata(topic: string): Promise<Metadata | Error>;
    /**
     * @alias getTopicMetadata
     * @param {number} timeout - optional, default is 2500
     * @returns {Promise.<Metadata>}
     */
    getMetadata(): Promise<Metadata | Error>;
    /**
     * returns a list of available kafka topics on the connected brokers
     */
    getTopicList(): Promise<string[]>;
    /**
     * Gets the last lag status
     *
     * @returns {Lag}
     */
    getLastLagStatus(): Lag;
    /**
     * Gets the lag cache
     *
     * @returns {Lag}
     */
    getLagCache(): Lag;
}
export {};
//# sourceMappingURL=JSConsumer.d.ts.map