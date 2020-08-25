/// <reference types="node" />
import { Promise } from "bluebird";
import { EventEmitter } from "events";
import { Kafka, Producer } from "kafkajs";
import { Metadata, ProducerAnalytics, Check, ProducerRunResult } from "../shared";
import { MessageReturn, JSKafkaProducerConfig, ProducerStats } from "../interfaces";
/**
 * native producer wrapper for node-librdkafka
 * @extends EventEmitter
 */
export declare class JSProducer extends EventEmitter {
    kafkaClient: Kafka;
    config: JSKafkaProducerConfig;
    paused: boolean;
    producer: Producer | undefined;
    private _health;
    private _adminClient;
    private _producerPollIntv;
    private _partitionCounts;
    private _inClosing;
    private _totalSentMessages;
    private _lastProcessed;
    private _analyticsOptions;
    private _analyticsIntv;
    _analytics: ProducerAnalytics | undefined;
    private _murmurHashVersion;
    private _murmur;
    private _errors;
    defaultPartitionCount: number;
    /**
     * creates a new producer instance
     * @param {object} config - configuration object
     * @param {*} _ - ignore this param (api compatability)
     * @param {number} defaultPartitionCount  - amount of default partitions for the topics to produce to
     */
    constructor(config: JSKafkaProducerConfig, defaultPartitionCount?: number);
    /**
     * @throws
     * starts analytics tasks
     * @param {object} options - analytic options
     */
    enableAnalytics(options?: {
        analyticsInterval: number;
    }): void;
    /**
     * halts all analytics tasks
     */
    haltAnalytics(): void;
    /**
     * connects to the broker
     * @returns {Promise.<*>}
     */
    connect(): Promise<void>;
    /**
     * returns a partition for a key
     * @private
     * @param {string} - message key
     * @param {number} - partition count of topic, if 0 defaultPartitionCount is used
     * @returns {string} - deterministic partition value for key
     */
    _getPartitionForKey(key: string, partitionCount?: number): number;
    /**
     * @async
     * produces a kafka message to a certain topic
     * @param {string} topicName - name of the topic to produce to
     * @param {object|string|null} message - value object for the message
     * @param {number} _partition - optional partition to produce to
     * @param {string} _key - optional message key
     * @param {string} _partitionKey - optional key to evaluate partition for this message
     * @returns {Promise.<object>}
     */
    send(topicName: string, message: Record<string, unknown> | string | null | Buffer, _partition?: number | null, _key?: string | null, _partitionKey?: string | null): Promise<MessageReturn>;
    /**
     * @async
     * produces a formatted message to a topic
     * @param {string} topic - topic to produce to
     * @param {string} identifier - identifier of message (is the key)
     * @param {object} payload - object (part of message value)
     * @param {number} partition - optional partition to produce to
     * @param {number} version - optional version of the message value
     * @param {string} partitionKey - optional key to evaluate partition for this message
     * @returns {Promise.<object>}
     */
    buffer(topic: string, identifier: string, payload: Record<string, unknown>, partition?: number | null, version?: number | null, partitionKey?: string | null): Promise<MessageReturn>;
    /**
     * @async
     * @private
     * produces a specially formatted message to a topic
     * @param {string} topic - topic to produce to
     * @param {string} identifier - identifier of message (is the key)
     * @param {object} _payload - object message value payload
     * @param {number} version - optional version (default is 1)
     * @param {*} _ -ignoreable, here for api compatibility
     * @param {string} partitionKey - optional key to deterministcally detect partition
     * @param {number} partition - optional partition (overwrites partitionKey)
     * @param {string} messageType - optional messageType (for the formatted message value)
     * @returns {Promise.<object>}
     */
    _sendBufferFormat(topic: string, identifier: string, _payload: Record<string, unknown>, version: number | undefined, _: null | number, partitionKey?: string | null, partition?: number | null, messageType?: string): Promise<MessageReturn>;
    /**
     * an alias for bufferFormatPublish()
     * @alias bufferFormatPublish
     */
    bufferFormat(topic: string, identifier: string, payload: Record<string, unknown>, version?: number, compressionType?: number, partitionKey?: string | null): Promise<MessageReturn>;
    /**
     * produces a specially formatted message to a topic, with type "publish"
     * @param {string} topic - topic to produce to
     * @param {string} identifier - identifier of message (is the key)
     * @param {object} _payload - object message value payload
     * @param {number} version - optional version (default is 1)
     * @param {*} _ -ignoreable, here for api compatibility
     * @param {string} partitionKey - optional key to deterministcally detect partition
     * @param {number} partition - optional partition (overwrites partitionKey)
     * @returns {Promise.<object>}
     */
    bufferFormatPublish(topic: string, identifier: string, _payload: Record<string, unknown>, version: number | undefined, _: null | number, partitionKey?: string | null, partition?: number | null): Promise<MessageReturn>;
    /**
     * produces a specially formatted message to a topic, with type "update"
     * @param {string} topic - topic to produce to
     * @param {string} identifier - identifier of message (is the key)
     * @param {object} _payload - object message value payload
     * @param {number} version - optional version (default is 1)
     * @param {*} _ -ignoreable, here for api compatibility
     * @param {string} partitionKey - optional key to deterministcally detect partition
     * @param {number} partition - optional partition (overwrites partitionKey)
     * @returns {Promise.<object>}
     */
    bufferFormatUpdate(topic: string, identifier: string, _payload: Record<string, unknown>, version: number | undefined, _: null | number, partitionKey?: string | null, partition?: number | null): Promise<MessageReturn>;
    /**
     * produces a specially formatted message to a topic, with type "unpublish"
     * @param {string} topic - topic to produce to
     * @param {string} identifier - identifier of message (is the key)
     * @param {object} _payload - object message value payload
     * @param {number} version - optional version (default is 1)
     * @param {*} _ -ignoreable, here for api compatibility
     * @param {string} partitionKey - optional key to deterministcally detect partition
     * @param {number} partition - optional partition (overwrites partitionKey)
     * @returns {Promise.<object>}
     */
    bufferFormatUnpublish(topic: string, identifier: string, _payload: Record<string, unknown>, version: number | undefined, _: null | number, partitionKey?: string | null, partition?: number | null): Promise<MessageReturn>;
    /**
     * produces a tombstone (null payload with -1 size) message
     * on a key compacted topic/partition this will delete all occurances of the key
     * @param {string} topic - name of the topic
     * @param {string} key - key
     * @param {number|null} _partition - optional partition
     */
    tombstone(topic: string, key: string, _partition?: number | null): Promise<MessageReturn>;
    /**
     * pauses production (sends will not be queued)
     */
    pause(): void;
    /**
     * resumes production
     */
    resume(): void;
    /**
     * returns producer statistics
     * * @todo -  update type for producer stats.
     * @returns {object}
     */
    getStats(): ProducerStats;
    /**
     * @deprecated
     */
    refreshMetadata(): void;
    /**
     * resolve the metadata information for a give topic
     * will create topic if it doesnt exist
     * @param {string} topic - name of the topic to query metadata for
     * @param {number} timeout - optional, default is 2500
     * @returns {Promise.<Metadata>}
     */
    getTopicMetadata(topic: string): Promise<Metadata>;
    /**
     * @alias getTopicMetadata
     * @returns {Promise.<Metadata>}
     */
    getMetadata(): Promise<Metadata>;
    /**
     * returns a list of available kafka topics on the connected brokers
     */
    getTopicList(): Promise<string[]>;
    /**
     * @async
     * gets the partition count of the topic from the brokers metadata
     * keeps a local cache to speed up future requests
     * resolves to -1 if an error occures
     * @param {string} topic - name of topic
     * @returns {Promise.<number>}
     */
    getPartitionCountOfTopic(topic: string): Promise<number>;
    /**
     * gets the local partition count cache
     * @returns {object}
     */
    getStoredPartitionCounts(): Record<string, unknown>;
    /**
     * @private
     * resets internal values
     */
    private _reset;
    /**
     * closes connection if open
     * stops poll interval if open
     */
    close(): Promise<void>;
    /**
     * called in interval
     * @private
     */
    private _runAnalytics;
    /**
     * returns the last computed analytics results
     * @throws
     * @returns {object}
     */
    getAnalytics(): ProducerRunResult | null;
    /**
     * runs a health check and returns object with status and message
     * @returns {Promise.<Check>}
     */
    checkHealth(): Promise<Check>;
}
//# sourceMappingURL=JSProducer.d.ts.map