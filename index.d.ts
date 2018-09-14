// declare type Buffer = any;

declare module "sinek" {

    export interface IKafka {
      kafkaHost?: string;
      groupId?: string;
      clientName?: string;
      workerPerPartition?: number;
      options?: {
        sessionTimeout?: number;
        protocol?: [string];
        fromOffset?: string;
        fetchMaxBytes?: number;
        fetchMinBytes?: number;
        fetchMaxWaitMs?: number;
        heartbeatInterval?: number;
        retryMinTimeout?: number;
        autoCommit?: boolean;
        autoCommitIntervalMs?: number;
        requireAcks?: number;
        ackTimeoutMs?: number;
        partitionerType?: number;
     };
     noptions?: any;
     health?: any;
    }

    export interface KafkaMessage {
        topic: string;
        partition: number;
        offset: number;
        key: Buffer | string;
        value: Buffer | string | any;
    }

    export interface BatchConfig {
        batchSize: number;
        commitEveryNBatch: number;
        concurrency: number;
        commitSync: boolean;
        noBatchCommits: boolean;
    }

    export interface ConsumerStats {
        totalIncoming: number;
        lastMessage: number;
        receivedFirstMsg: boolean;
        totalProcessed: number;
        lastProcessed: number;
        queueSize: null;
        isPaused: boolean;
        drainStats: null;
        omittingQueue: boolean;
        autoComitting: boolean;
        consumedSinceCommit: number;
        batch: {
            current: number;
            committs: number;
            total: number;
            config: BatchConfig;
            currentEmptyFetches: number;
            avgProcessingTime: number;
        },
        lag: any;
        totalErrors: number;
    }

    export interface LagStatus {
        topic: string;
        partition: number;
        lowDistance: number;
        highDistance: number;
        detail: {
            lowOffset: number;
            highOffset: number;
            comittedOffset: number;
        };
    }

    export interface ProducerStats {
        totalPublished: number;
        last: number;
        isPaused: boolean;
        totalErrors: number;
    }

    export interface MessageReturn {
        key: string;
        partition: number;
    }

    export class NConsumer {
        constructor(topic: Array<string>, config: IKafka);
        on(eventName: "message", callback: (message: KafkaMessage) => any): void;
        on(eventName: "error", callback: (error: any) => any): void;
        on(eventName: "ready", callback: () => any): void;
        on(eventName: "analytics", callback: (analytics: object) => void): void;
        on(eventName: "batch", callback: (batch: Array<KafkaMessage>) => void): void;
        on(eventName: "first-drain-message", callback: () => void): void;
        connect(asStream?: boolean, opts?: {asString?: boolean, asJSON?: boolean}): Promise<void>;

        consume(syncEvent?: (message: KafkaMessage, callback: (error: any) => void) => void,
            asString?: boolean, asJSON?: boolean, options?: BatchConfig): Promise<void>;

        pause(topics: Array<string>): void;
        resume(topics: Array<string>): void;
        getStats(): ConsumerStats;
        close(commit: boolean): object;
        enableAnalytics(options: object): void;
        haltAnalytics(): void;
        addSubscriptions(topics: Array<string>): Array<string>;
        adjustSubscription(topics: Array<string>): Array<string>;
        commit(async: boolean): boolean;
        commitMessage(async: boolean, message: KafkaMessage): boolean;
        commitOffsetHard(topic: string, partition: number, offset: number, async: boolean): boolean;
        commitOffsetForAllPartitionsOfTopic(topicName: string, offsetPartitionMappingTable: object):  Array<string>;
        resetTopicPartitionsToEarliest(topicName: string): Array<string>;
        resetTopicPartitionsToLatest(topicName: string): Array<string>;
        getOffsetForTopicPartition(topic: string, partition: number, timeout: number): Promise<object>;
        getComittedOffsets(timeout: number): Promise<Array<object>>;
        getAssignedPartitions(): Array<object>;
        static findPartitionOffset(topic: string, partition: number, offsets: Array<object>): object;
        getLagStatus(noCache: boolean): Promise<Array<LagStatus>>;
        getAnalytics(): object;
        checkHealth(): object;
        getTopicMetadata(topic: string, timeout: number): Promise<any>;
        getMetadata(timeout: number): Promise<any>;
        getTopicList(): Promise<Array<string>>;
    }

    export class NProducer {
        constructor(config: IKafka, _?: null, defaultPartitionCount?: number)
        on(eventName: "error", callback: (error: any) => any): void;
        on(eventName: "ready", callback: () => any): void;
        connect(): Promise<void>;

        send(topicName: string, message: string | Buffer, _partition: number, _key?: string | Buffer,
             _partitionKey?: string, _opaqueKey?: string): Promise<MessageReturn>;

        buffer(topic: string, identifier: string | undefined, payload: object, partition?: number,
            version?: number, partitionKey?: string): Promise<MessageReturn>;

        bufferFormat(topic: string, identifier: string | undefined, payload: object, version?: number,
            compressionType?: number, partitionKey?: string): Promise<MessageReturn>;

        bufferFormatPublish(topic: string, identifier: string | undefined, _payload: object, version?: number,
             _?: null, partitionKey?: string, partition?: number): Promise<MessageReturn>;

        bufferFormatUpdate(topic: string, identifier: string, | undefined _payload: object, version?: number,
            _?: null, partitionKey?: string, partition?: number): Promise<MessageReturn>;

        bufferFormatUnpublish(topic: string, identifier: string | undefined, _payload: object, version?: number,
            _?: null, partitionKey?: string, partition?: number): Promise<MessageReturn>;

        pause(): void;
        resume(): void;
        getStats(): ProducerStats;
        refreshMetadata(topics: Array<string>): void;
        close(commit: boolean): object;
        enableAnalytics(options: object): void;
        haltAnalytics(): void;
        getAnalytics(): object;
        checkHealth(): object;
        getTopicMetadata(topic: string, timeout: number): Promise<any>;
        getMetadata(timeout: number): Promise<any>;
        getTopicList(): Promise<Array<string>>;
        getPartitionCountOfTopic(topic: string): Promise<number>;
        getStoredPartitionCounts(): object;
    }

    export class Consumer {
        constructor(topic: String, config: IKafka);
        on(eventName: "message", callback: (message: object) => any): void;
        on(eventName: "error", callback: (error: any) => any): void;
        connect(backpressure?: boolean): Promise<void>;
        consume(syncEvent?: object): Promise<void>;
        consumeOnce(syncEvent?: object, drainThreshold?: number, timeout?: number): object;
        pause(): void;
        resume(): void;
        getStats(): object;
        close(commit: boolean): object;
    }

    export class Producer {
        constructor(config: IKafka, topic: Array<String>, defaultPartitionCount: number);
        on(eventName: "error", callback: (error: any) => any): void;
        connect(): Promise<void>;
        send(topic: string, message: string | string[]): Promise<void>;
        buffer(topic: string, identifier?: string, payload?: object, compressionType?: number): Promise<void>;
        bufferFormat(topic: string, identifier?: string, payload?: object, version?: number, compressionType?: number, partitionKey?: string): Promise<Function>;
        bufferFormatPublish(topic: string, identifier?: string, payload?: object, version?: number, compressionType?: number, partitionKey?: string): Promise<Function>;
        bufferFormatUpdate(topic: string, identifier?: string, payload?: object, version?: number, compressionType?: number, partitionKey?: string): Promise<Function>;
        bufferFormatUnpublish(topic: string, identifier?: string, payload?: object, version?: number, compressionType?: number, partitionKey?: string): Promise<Function>;
        pause(): void;
        resume(): void;
        getStats(): object;
        refreshMetadata(topics: Array<string>): void;
        close(commit: boolean): object;
    }

    export class Kafka {
        constructor(conString: String, logger: object, connectDirectlyToBroker: boolean)
    }

    export class Drainer {
        constructor(consumer: object, asyncLimit: number, autoJsonParsing: boolean, omitQueue: boolean, commitOnDrain: boolean)
    }

    export class Publisher {
        constructor(producer: object, partitionCount: number, autoFlushBuffer: number, flushPeriod: number)
    }

    export class PartitionDrainer {
        constructor(consumer: object, asyncLimit: number, commitOnDrain: boolean, autoJsonParsing: boolean)
    }

    export class PartitionQueue {
        constructor(partition: object, drainEvent: object, drainer: object, asyncLimit: number, queueDrain: object)
    }

    export interface MessageType {
        key: String;
        value: String;
    }
}
