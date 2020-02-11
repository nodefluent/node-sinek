// declare type Buffer = any;

declare module "sinek" {

    export interface KafkaHealthConfig {
        thresholds?: {
            consumer?: {
                errors?: number;
                lag?: number;
                stallLag?: number;
                minMessages?: number;
            };
            producer?: {
                errors?: number;
                minMessages?: number;
            };
        };
    }

    export interface NCommonKafkaOptions {
        "builtin.features"?: string;
        "client.id"?: string;
        "metadata.broker.list": string;
        "message.max.bytes"?: number;
        "message.copy.max.bytes"?: number;
        "receive.message.max.bytes"?: number;
        "max.in.flight.requests.per.connection"?: number;
        "metadata.request.timeout.ms"?: number;
        "topic.metadata.refresh.interval.ms"?: number;
        "metadata.max.age.ms"?: number;
        "topic.metadata.refresh.fast.interval.ms"?: number;
        "topic.metadata.refresh.fast.cnt"?: number;
        "topic.metadata.refresh.sparse"?: boolean;
        "topic.blacklist"?: string;
        "debug"?: string;
        "socket.timeout.ms"?: number;
        "socket.blocking.max.ms"?: number;
        "socket.send.buffer.bytes"?: number;
        "socket.receive.buffer.bytes"?: number;
        "socket.keepalive.enable"?: boolean;
        "socket.nagle.disable"?: boolean;
        "socket.max.fails"?: number;
        "broker.address.ttl"?: number;
        "broker.address.family"?: "any" | "v4" | "v6";
        "reconnect.backoff.jitter.ms"?: number;
        "statistics.interval.ms"?: number;
        "enabled_events"?: number;
        "log_level"?: number;
        "log.queue"?: boolean;
        "log.thread.name"?: boolean;
        "log.connection.close"?: boolean;
        "internal.termination.signal"?: number;
        "api.version.request"?: boolean;
        "api.version.fallback.ms"?: number;
        "broker.version.fallback"?: string;
        "security.protocol"?: "plaintext" | "ssl" | "sasl_plaintext" | "sasl_ssl";
        "ssl.cipher.suites"?: string;
        "ssl.key.location"?: string;
        "ssl.key.password"?: string;
        "ssl.certificate.location"?: string;
        "ssl.ca.location"?: string;
        "ssl.crl.location"?: string;
        "sasl.mechanisms"?: string;
        "sasl.kerberos.service.name"?: string;
        "sasl.kerberos.principal"?: string;
        "sasl.kerberos.kinit.cmd"?: string;
        "sasl.kerberos.keytab"?: string;
        "sasl.kerberos.min.time.before.relogin"?: number;
        "sasl.username"?: string;
        "sasl.password"?: string;
        "partition.assignment.strategy"?: string;
        "session.timeout.ms"?: number;
        "heartbeat.interval.ms"?: number;
        "group.protocol.type"?: string;
        "coordinator.query.interval.ms"?: number;
        "group.id"?: string;
        "event_cb"?: boolean;
        "dr_cb"?: boolean;
    }

    export interface NConsumerKafkaOptions extends NCommonKafkaOptions {
        "group.id": string;
        "enable.auto.commit"?: boolean;
        "auto.commit.interval.ms"?: number;
        "enable.auto.offset.store"?: boolean;
        "queued.min.messages"?: number;
        "queued.max.messages.kbytes"?: number;
        "fetch.wait.max.ms"?: number;
        "fetch.message.max.bytes"?: number;
        "fetch.min.bytes"?: number;
        "fetch.error.backoff.ms"?: number;
        "offset.store.method"?: "none" | "file" | "broker";
        "enable.partition.eof"?: boolean;
        "check.crcs"?: boolean;
    }

    export interface NProducerKafkaOptions extends NCommonKafkaOptions {
        "queue.buffering.max.messages"?: number;
        "queue.buffering.max.kbytes"?: number;
        "queue.buffering.max.ms"?: number;
        "message.send.max.retries"?: number;
        "retry.backoff.ms"?: number;
        "compression.codec"?: "none" | "gzip" | "snappy" | "lz4";
        "batch.num.messages"?: number;
        "delivery.report.only.error"?: boolean;
    }

    export interface KafkaConsumerConfig {
      kafkaHost?: string;
      groupId?: string;
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
     };
     health?: KafkaHealthConfig;
     tconf?: {
        "auto.commit.enable"?: boolean;
        "auto.commit.interval.ms"?: number;
        "auto.offset.reset"?: "smallest" | "earliest" | "beginning" | "largest" | "latest" | "end" | "error";
        "offset.store.path"?: string;
        "offset.store.sync.interval.ms"?: number;
        "offset.store.method"?: "file" | "broker";
        "consume.callback.max.messages"?: number;
     };
     noptions?: NConsumerKafkaOptions;
     logger?: KafkaLogger;
    }

    export interface KafkaProducerConfig {
        kafkaHost?: string;
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
          requireAcks?: number;
          ackTimeoutMs?: number;
          partitionerType?: number;
       };
       health?: KafkaHealthConfig;
       tconf?: {
          "request.required.acks"?: number;
          "request.timeout.ms"?: number;
          "message.timeout.ms"?: number;
          "produce.offset.report"?: boolean;
       };
       noptions?: NProducerKafkaOptions;
       logger?: KafkaLogger;
    }

    export interface KafkaMessage {
        topic: string;
        partition: number;
        offset: number;
        key: Buffer | string;
        value: Buffer | string | any;
        size: number;
        timestamp: number;
    }

    export interface SortedMessageBatch {
        [topic: string]: {
            [partition: string]: KafkaMessage[];
        };
    }

    export interface BatchConfig {
        batchSize?: number;
        commitEveryNBatch?: number;
        concurrency?: number;
        commitSync?: boolean;
        noBatchCommits?: boolean;
        manualBatching?: boolean;
        sortedManualBatch?: boolean;
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
        };
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
        offset?: number | null;
    }

    export class NConsumer {
        constructor(topic: Array<string> | string, config: KafkaConsumerConfig);
        on(eventName: "message", callback: (message: KafkaMessage) => any): void;
        on(eventName: "error", callback: (error: any) => any): void;
        on(eventName: "ready", callback: () => any): void;
        on(eventName: "analytics", callback: (analytics: object) => void): void;
        on(eventName: "batch", callback: (batch: Array<KafkaMessage>) => void): void;
        on(eventName: "first-drain-message", callback: () => void): void;
        connect(asStream?: boolean, opts?: {asString?: boolean, asJSON?: boolean}): Promise<void>;

        consume(syncEvent?: (message: KafkaMessage | KafkaMessage[] | SortedMessageBatch, callback: (error?: any) => void) => void,
            asString?: boolean, asJSON?: boolean, options?: BatchConfig): Promise<void>;

        pause(topics: Array<string>): void;
        resume(topics: Array<string>): void;
        getStats(): ConsumerStats;
        close(commit?: boolean): object;
        enableAnalytics(options: object): void;
        haltAnalytics(): void;
        addSubscriptions(topics: Array<string>): Array<string>;
        adjustSubscription(topics: Array<string>): Array<string>;
        commit(async: boolean): boolean;
        commitMessage(async: boolean, message: KafkaMessage): boolean;
        commitOffsetHard(topic: string, partition: number, offset: number, async: boolean): boolean;
        commitLocalOffsetsForTopic(topic: string): any;
        getOffsetForTopicPartition(topic: string, partition: number, timeout: number): Promise<object>;
        getComittedOffsets(timeout: number): Promise<Array<object>>;
        getAssignedPartitions(): Array<object>;
        static findPartitionOffset(topic: string, partition: number, offsets: Array<object>): object;
        getLagStatus(noCache: boolean): Promise<Array<LagStatus>>;
        getAnalytics(): object;
        checkHealth(): object;
        getTopicMetadata(topic: string, timeout?: number): Promise<any>;
        getMetadata(timeout?: number): Promise<any>;
        getTopicList(): Promise<Array<string>>;
    }

    export class NProducer {
        constructor(config: KafkaProducerConfig, _?: null, defaultPartitionCount?: number | "auto")
        on(eventName: "error", callback: (error: any) => any): void;
        on(eventName: "ready", callback: () => any): void;
        connect(): Promise<void>;

        send(topicName: string, message: string | Buffer, _partition?: number, _key?: string | Buffer,
             _partitionKey?: string, _opaqueKey?: string): Promise<MessageReturn>;

        buffer(topic: string, identifier: string | undefined, payload: object, partition?: number,
            version?: number, partitionKey?: string): Promise<MessageReturn>;

        bufferFormat(topic: string, identifier: string | undefined, payload: object, version?: number,
            compressionType?: number, partitionKey?: string): Promise<MessageReturn>;

        bufferFormatPublish(topic: string, identifier: string | undefined, _payload: object, version?: number,
             _?: null, partitionKey?: string, partition?: number): Promise<MessageReturn>;

        bufferFormatUpdate(topic: string, identifier: string | undefined, _payload: object, version?: number,
            _?: null, partitionKey?: string, partition?: number): Promise<MessageReturn>;

        bufferFormatUnpublish(topic: string, identifier: string | undefined, _payload: object, version?: number,
            _?: null, partitionKey?: string, partition?: number): Promise<MessageReturn>;

        pause(): void;
        resume(): void;
        getStats(): ProducerStats;
        refreshMetadata(topics: Array<string>): void;
        close(): object;
        enableAnalytics(options: object): void;
        haltAnalytics(): void;
        getAnalytics(): object;
        checkHealth(): object;
        getTopicMetadata(topic: string, timeout?: number): Promise<any>;
        getMetadata(timeout?: number): Promise<any>;
        getTopicList(): Promise<Array<string>>;
        getPartitionCountOfTopic(topic: string): Promise<number>;
        getStoredPartitionCounts(): object;
        tombstone(topic: string, key: string | Buffer, _partition?: number | null): Promise<MessageReturn>;
    }

    export class Consumer {
        constructor(topic: String, config: KafkaConsumerConfig);
        on(eventName: "message", callback: (message: object) => any): void;
        on(eventName: "error", callback: (error: any) => any): void;
        connect(backpressure?: boolean): Promise<void>;
        consume(syncEvent?: object): Promise<void>;
        consumeOnce(syncEvent?: object, drainThreshold?: number, timeout?: number): object;
        pause(): void;
        resume(): void;
        getStats(): object;
        close(commit?: boolean): object;
    }

    export class Producer {
        constructor(config: KafkaProducerConfig, topic: Array<String>, defaultPartitionCount: number);
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
        close(): object;
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

    export interface KafkaLogger {
        debug(message: string): void;
        info(message: string): void;
        warn(message: string, error?: Error): void;
        error(error: string | Error): void;
    }
}
