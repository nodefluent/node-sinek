/// <reference types="node" />
import { CompressionTypes } from "kafkajs";
export interface KafkaHealthConfig {
    thresholds: {
        consumer: {
            errors: number;
            lag: number;
            stallLag: number;
            minMessages: number;
        };
        producer: {
            errors: number;
            minMessages: number;
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
    "compression.codec"?: CompressionTypes;
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
        murmurHashVersion?: string;
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
export interface JSKafkaProducerConfig extends KafkaProducerConfig {
    noptions: NProducerKafkaOptions;
}
export interface JSKafkaConsumerConfig extends KafkaConsumerConfig {
    noptions: NConsumerKafkaOptions;
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
    drainStats: Record<string, unknown> | null;
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
    value: string;
}
export interface MessageProduce {
    id: string;
    version: number;
}
export interface KafkaLogger {
    debug(message: string): void;
    info(message: string): void;
    warn(message: string, error?: Error): void;
    error(error: string | Error): void;
}
export interface AnalyticsLagChange {
    timelyDifference: number;
    fetchPerformance: number;
    newLags: Record<string, unknown>;
    changedLags: Record<string, unknown>;
    resolvedLags: {
        [key: string]: Record<string, unknown>;
    };
    stallLags: Record<string, unknown>;
}
export interface AnalyticsConfig {
    analyticsInterval: number;
}
//# sourceMappingURL=interfaces.d.ts.map