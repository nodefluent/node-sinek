import { ITopicMetadata, PartitionMetadata } from "kafkajs";
declare type PartitionRestFormat = {
    partition: number;
    leader: number;
    replicas: PartitionReplicaRestFormat[];
};
declare type PartitionReplicaRestFormat = {
    broker: number;
    leader: boolean;
    in_sync: boolean;
};
declare type TopicMetaData = {
    topics: ITopicMetadata[];
};
/**
 * wrapper arround node-librdkafka metadata object
 */
export declare class Metadata {
    raw: TopicMetaData;
    /**
     * creates a new instance
     * @param {object} raw - metadata object response of node-librdkafka client
     */
    constructor(raw: TopicMetaData);
    /**
     * @throws
     * returns the count of partitions of the given topic
     * @param {string} topicName - name of the kafka topic
     * @returns {number}
     */
    getPartitionCountOfTopic(topicName: string): number;
    /**
     * @throws
     * returns a partition (id) array of the given topic
     * @param {string} topicName - name of the kafka topic
     * @returns {Array<number>}
     */
    getPartitionsForTopic(topicName: string): number[];
    /**
     * @throws
     * returns a list of topic names
     */
    asTopicList(): string[];
    /**
     * @throws
     * gets formatted metadata information about give topic
     * @param {string} topicName - name of the kafka topic
     * @returns {object}
     */
    asTopicDescription(topicName: string): Record<string, unknown>;
    /**
     * @throws
     * gets a list of formatted partition info for topic
     * @param {string} topicName - name of the kafka topic
     * @returns {Array}
     */
    asTopicPartitions(topicName: string): PartitionRestFormat[];
    /**
     * @deprecated
     * @throws
     * gets a broker object (list of broker ids)
     * @returns {object}
     */
    asBrokers(): Record<string, unknown>;
    /**
     * @throws
     * maps partitions into kafka-rest format
     * @param {Array} partitions - array of partitions
     * @returns {Array}
     */
    static formatPartitions(partitions: PartitionMetadata[]): PartitionRestFormat[];
}
export {};
//# sourceMappingURL=Metadata.d.ts.map